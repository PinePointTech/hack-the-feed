import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import brief
from .config import Settings
from .schemas import Brief, BriefRequest

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
    response = await client.post(
        settings.oriane_search_url,
        headers=bearer(settings.oriane_key),
        params={"projection": "basic", "limit": 1, "offset": 0},
        timeout=30,
        json={
            "operator": "and",
            "filters": {
                "transcript": {
                    "includesExactly": {"operator": "and", "values": ["lymphatic drainage"]},
                },
            },
        },
    )
    response.raise_for_status()
    return isinstance(response.json()["data"]["results"], list)


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
            app.state.health_lock = asyncio.Lock()
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
