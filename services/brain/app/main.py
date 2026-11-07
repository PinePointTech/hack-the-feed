import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, TypeAdapter

from . import brief, check, oriane, publish, qa, radar
from .config import Settings
from .schemas import (
    Brief, BriefRequest, CheckRequest, CheckResponse, PublishedDebunk, PublishRequest,
    QAReport, ScriptLine,
)

VERSION = "0.1.0"
HEALTH_TTL = 300
logger = logging.getLogger(__name__)


class Health(BaseModel):
    ok: bool
    oriane: bool
    gmi: bool
    jev: bool
    version: str = VERSION


def bearer(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


async def check_oriane(client: httpx.AsyncClient, settings: Settings) -> bool:
    if not (settings.oriane_key and settings.oriane_search_url):
        return False
    payload = await oriane.search(
        client,
        settings,
        {"operator": "and", "filters": {
            "transcript": {
                "includesExactly": {"operator": "and", "values": ["lymphatic drainage"]},
            },
        }},
    )
    return isinstance(payload["data"]["results"], list)


async def check_openai(client: httpx.AsyncClient, settings: Settings) -> bool:
    if not (settings.openai_key and settings.openai_model):
        return False
    response = await client.get(
        "https://api.openai.com/v1/models", headers=bearer(settings.openai_key)
    )
    response.raise_for_status()
    return any(model["id"] == settings.openai_model for model in response.json()["data"])


async def run_probe(
    probe: Callable[[httpx.AsyncClient, Settings], Awaitable[bool]],
    client: httpx.AsyncClient,
    settings: Settings,
) -> bool:
    try:
        return await probe(client, settings)
    except httpx.HTTPStatusError as error:
        logger.warning("%s returned HTTP %d", probe.__name__, error.response.status_code)
    except (httpx.RequestError, httpx.InvalidURL, ValueError, KeyError, TypeError) as error:
        logger.warning("%s failed (%s)", probe.__name__, type(error).__name__)
    return False


def create_app(
    settings: Settings | None = None,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    settings = settings or Settings.from_env()

    async def probe_health(client: httpx.AsyncClient) -> Health:
        oriane, openai = await asyncio.gather(
            run_probe(check_oriane, client, settings),
            run_probe(check_openai, client, settings),
        )
        return Health(ok=oriane and openai, oriane=oriane, gmi=False, jev=False)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with httpx.AsyncClient(timeout=10, transport=transport) as client:
            app.state.client = client
            app.state.line_checker = check.LineChecker(settings)
            app.state.video_qa = qa.VideoQA(settings, app.state.line_checker)
            app.state.health_lock = asyncio.Lock()
            app.state.radar_lock = asyncio.Lock()
            app.state.health = await probe_health(client)
            app.state.health_expires_at = time.monotonic() + HEALTH_TTL
            yield

    app = FastAPI(title="MyBuster Brain", version=VERSION, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def api_error(status: int, code: str, message: str) -> JSONResponse:
        return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
        return api_error(422, "invalid_request", "The request body is invalid.")

    @app.post("/brief", response_model=Brief, response_model_exclude_none=True)
    async def grounded_brief(body: BriefRequest, request: Request):
        if body.myth_id not in brief.MYTHS:
            return api_error(404, "myth_not_found", "Unknown myth ID.")
        try:
            async with asyncio.timeout(45):
                return await brief.generate(body, request.app.state.client, settings)
        except (TimeoutError, httpx.HTTPError, ValueError, TypeError, KeyError, IndexError, RuntimeError) as error:
            logger.warning("Brief generation failed (%s)", type(error).__name__)
            return api_error(503, "brief_unavailable", "The grounded brief is temporarily unavailable.")

    @app.post("/check", response_model=CheckResponse, response_model_exclude_none=True)
    async def check_lines(body: CheckRequest, request: Request):
        if body.myth_id not in brief.MYTHS:
            return api_error(404, "myth_not_found", "Unknown myth ID.")
        try:
            async with asyncio.timeout(12):
                return await request.app.state.line_checker.check(body, request.app.state.client)
        except (TimeoutError, httpx.HTTPError, ValueError, TypeError, KeyError, IndexError, RuntimeError) as error:
            logger.warning("Live check failed (%s)", type(error).__name__)
            return api_error(503, "check_unavailable", "The live script check is temporarily unavailable.")

    @app.post("/qa", response_model=QAReport, response_model_exclude_none=True)
    async def video_qa(
        request: Request, myth_id: str = Form(), approved_lines: str = Form(), file: UploadFile = File(),
    ):
        if myth_id not in brief.MYTHS:
            return api_error(404, "myth_not_found", "Unknown myth ID.")
        try:
            lines = TypeAdapter(list[ScriptLine]).validate_json(approved_lines)
            if not lines:
                raise ValueError("No approved lines")
        except ValueError:
            return api_error(422, "invalid_approved_lines", "Provide the approved script lines as JSON.")
        try:
            async with asyncio.timeout(58):
                return await request.app.state.video_qa.run(request.app.state.client, myth_id, lines, file)
        except qa.InvalidVideo as error:
            return api_error(422, "invalid_video", str(error))
        except (TimeoutError, OSError, httpx.HTTPError, ValueError, TypeError, KeyError, IndexError, RuntimeError) as error:
            logger.warning("Video QA failed (%s)", type(error).__name__)
            return api_error(503, "qa_unavailable", "Video QA is temporarily unavailable.")

    @app.post("/publish", response_model=PublishedDebunk, response_model_exclude_none=True)
    def publish_brief(body: PublishRequest):
        if body.myth_id not in radar.TOPICS:
            return api_error(404, "myth_not_found", "Unknown myth ID.")
        try:
            return publish.save(body)
        except ValueError as error:
            return api_error(422, "publish_rejected", str(error))

    @app.get("/published/{myth_id}", response_model=PublishedDebunk, response_model_exclude_none=True)
    def get_published(myth_id: str):
        if myth_id not in radar.TOPICS:
            return api_error(404, "myth_not_found", "Unknown myth ID.")
        try:
            return publish.read_published(myth_id)
        except FileNotFoundError:
            return api_error(404, "not_published", "No published debunk exists for this myth.")

    async def refresh_radar(request: Request):
        async with request.app.state.radar_lock:
            try:
                await radar.refresh_radar(request.app.state.client, settings)
            except (httpx.HTTPError, ValueError, KeyError, TypeError, RuntimeError) as error:
                logger.warning("Radar refresh failed (%s)", type(error).__name__)
                return api_error(503, "radar_unavailable", "Oriane refresh failed. Try the saved snapshot.")

    @app.get("/radar")
    async def get_radar(request: Request, refresh: bool = False):
        if refresh and (error := await refresh_radar(request)):
            return error
        return radar.read_radar()

    @app.get("/myths/{myth_id}")
    async def get_myth(myth_id: str, request: Request, refresh: bool = False):
        if myth_id not in radar.TOPICS:
            return api_error(404, "myth_not_found", "Unknown myth ID.")
        if refresh and (error := await refresh_radar(request)):
            return error
        return radar.read_myth(myth_id)

    @app.get("/health", response_model=Health)
    async def health(request: Request) -> Health:
        state = request.app.state
        async with state.health_lock:
            if time.monotonic() >= state.health_expires_at:
                state.health = await probe_health(state.client)
                state.health_expires_at = time.monotonic() + HEALTH_TTL
            return state.health

    return app


app = create_app()
