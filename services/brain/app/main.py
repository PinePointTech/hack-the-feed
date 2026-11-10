import asyncio
import hmac
import logging
import os
import sqlite3
import time
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager, closing, suppress
from dataclasses import replace
from datetime import datetime, timezone
from xml.etree.ElementTree import ParseError

import httpx
from fastapi import FastAPI, File, Form, Query, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, TypeAdapter

from . import brief, check, corrections, derived, fact_check, labeler, oriane, poller, publish, qa, radar, reporting, store
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
        f"{settings.openai_base_url}/models", headers=bearer(settings.openai_key)
    )
    response.raise_for_status()
    return any(model["id"] == settings.openai_model for model in response.json()["data"])


async def check_gmi(client: httpx.AsyncClient, settings: Settings) -> bool:
    if not settings.gmi_key:
        return False
    response = await client.get(f"{settings.gmi_base_url}/models", headers=bearer(settings.gmi_key))
    response.raise_for_status()
    return isinstance(response.json()["data"], list)


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
    fact_check_token = os.getenv("FACT_CHECK_API_TOKEN", "")
    fact_check_settings = replace(settings, openai_model=os.getenv("FACT_CHECK_MODEL") or settings.openai_model)

    async def probe_health(client: httpx.AsyncClient) -> Health:
        oriane, openai, gmi = await asyncio.gather(
            run_probe(check_oriane, client, settings),
            run_probe(check_openai, client, settings),
            run_probe(check_gmi, client, settings),
        )
        # Jev is not wired into this brain, so ok never waits on it.
        return Health(ok=oriane and openai, oriane=oriane, gmi=gmi, jev=False)

    async def poll_now(app: FastAPI) -> tuple[bool, int]:
        async with app.state.poll_lock:
            result = await poller.run_poll(app.state.client, settings)
        # Labeling runs beside the request so POST /poll stays quick; one batch at a time.
        task = app.state.label_task
        if task is None or task.done():
            app.state.label_task = asyncio.create_task(label_batch(app))
        return result

    async def label_batch(app: FastAPI) -> None:
        try:
            await labeler.label_pending(app.state.client, settings)
            # Corrections are checked after labeling, since only a label can mark a post as one.
            await corrections.check_pending(app.state.client, settings)
        except (sqlite3.Error, OSError) as error:
            logger.warning("Labeling failed (%s)", type(error).__name__)

    async def poll_loop(app: FastAPI) -> None:
        # Sleeps until the gate opens again, so a restart does not shift the 15 minute cadence.
        while True:
            wait = settings.poll_interval_minutes * 60
            try:
                await poll_now(app)
                with closing(store.connect()) as con:
                    _, next_poll = poller.schedule(con, settings)
                if next_poll:
                    wait = (store.parse_iso(next_poll) - datetime.now(timezone.utc)).total_seconds()
            except (sqlite3.Error, OSError, ValueError) as error:
                logger.warning("Poll loop failed (%s)", type(error).__name__)
            await asyncio.sleep(max(wait, 1))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with httpx.AsyncClient(timeout=10, transport=transport) as client:
            app.state.client = client
            app.state.line_checker = check.LineChecker(settings)
            app.state.fact_checker = fact_check.FactChecker(fact_check_settings)
            app.state.video_qa = qa.VideoQA(settings, app.state.line_checker)
            app.state.health_lock = asyncio.Lock()
            app.state.poll_lock = asyncio.Lock()
            app.state.label_task = None
            app.state.health = await probe_health(client)
            app.state.health_expires_at = time.monotonic() + HEALTH_TTL
            loop = asyncio.create_task(poll_loop(app))
            try:
                yield
            finally:
                loop.cancel()
                with suppress(asyncio.CancelledError):
                    await loop
                if app.state.label_task:
                    app.state.label_task.cancel()
                    with suppress(asyncio.CancelledError):
                        await app.state.label_task

    app = FastAPI(title="MyBuster Brain", version=VERSION, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Location"],
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
                draft = await brief.generate(body, request.app.state.client, settings)
                if not draft.claims or not draft.sources:
                    return api_error(404, "draft_unavailable", "No verified draft is available for this claim.")
                return draft
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

    @app.post("/fact-check", response_model=fact_check.FactCheckResult)
    async def check_post(body: fact_check.FactCheckRequest, request: Request):
        if not (fact_check_token and settings.oriane_key and settings.openai_key and fact_check_settings.openai_model):
            return api_error(503, "fact_check_unavailable", "Post fact-checking is not configured.")
        provided = request.headers.get("Authorization", "")
        if not hmac.compare_digest(provided.encode(), f"Bearer {fact_check_token}".encode()):
            return api_error(401, "fact_check_unauthorized", "Authorization is required.")
        try:
            return await request.app.state.fact_checker.check(request.app.state.client, body)
        except fact_check.PostNotFound:
            return api_error(404, "post_not_found", "Oriane no longer has this post.")
        except fact_check.Busy:
            return api_error(429, "fact_check_busy", "Fact-checking is busy. Try again in a few minutes.")
        except httpx.HTTPStatusError as error:
            logger.warning("Post fact check provider %s returned HTTP %d", error.request.url.host, error.response.status_code)
            return api_error(503, "fact_check_unavailable", "Fact-checking is temporarily unavailable. Try again.")
        except (TimeoutError, httpx.RequestError, ParseError, ValueError, TypeError, KeyError, IndexError) as error:
            logger.warning("Post fact check failed (%s)", type(error).__name__)
            return api_error(503, "fact_check_unavailable", "Fact-checking is temporarily unavailable. Try again.")

    @app.post("/qa", response_model=QAReport, response_model_exclude_none=True)
    async def video_qa(
        request: Request, response: Response, myth_id: str = Form(), approved_lines: str = Form(),
        file: UploadFile = File(),
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
                report, video_url = await request.app.state.video_qa.run(request.app.state.client, myth_id, lines, file)
                if video_url:
                    response.headers["Content-Location"] = video_url
                return report
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

    @app.get("/published/{myth_id}/video/{token}.mp4")
    def get_published_video(myth_id: str, token: str):
        if myth_id in radar.TOPICS:
            try:
                video = qa.media_path(token)
                receipt = publish.read_published(myth_id)
                if receipt.video_url == qa.media_url(myth_id, token) and video.is_file():
                    return FileResponse(video, media_type="video/mp4")
            except (FileNotFoundError, ValueError):
                pass
        return api_error(404, "video_not_found", "No published video exists at this address.")

    async def refresh_if_asked(request: Request, refresh: bool) -> None:
        # refresh runs a poll, which still honors the poll interval and the search cap.
        if refresh:
            try:
                await poll_now(request.app)
            except (sqlite3.Error, OSError, ValueError) as error:
                logger.warning("Refresh poll failed (%s)", type(error).__name__)

    def derive(compute: Callable, *args):
        with closing(store.connect()) as con:
            return compute(con, *args, datetime.now(timezone.utc))

    @app.get("/radar")
    async def get_radar(request: Request, refresh: bool = False):
        await refresh_if_asked(request, refresh)
        return derive(derived.radar)

    # Registered before /myths/{myth_id} so "candidates" is not read as a myth ID.
    @app.get("/myths/candidates")
    def get_myth_candidates():
        with closing(store.connect()) as con:
            return {"candidates": store.list_candidates(con)}

    def reviewer_refused(request: Request) -> JSONResponse | None:
        # Once the brain is public, only a reviewer holding REVIEW_TOKEN may confirm or reject. Unset means local use.
        given = request.headers.get("x-review-token", "")
        if settings.review_token and not hmac.compare_digest(given.encode(), settings.review_token.encode()):
            return api_error(401, "review_token_required", "Enter the reviewer token to review myths.")
        return None

    @app.post("/myths/{myth_id}/reject")
    def reject_myth(myth_id: str, request: Request):
        if refused := reviewer_refused(request):
            return refused
        with closing(store.connect()) as con:
            if not store.reject_candidate(con, myth_id):
                return api_error(404, "myth_not_found", "Unknown candidate myth ID.")
        return {"id": myth_id, "rejected": True}

    @app.post("/myths/{myth_id}/confirm")
    def confirm_myth(myth_id: str, request: Request):
        if refused := reviewer_refused(request):
            return refused
        with closing(store.connect()) as con:
            myth = store.confirm_myth(con, myth_id, store.iso(datetime.now(timezone.utc)))
        return myth or api_error(404, "myth_not_found", "Unknown candidate myth ID.")

    @app.get("/myths/{myth_id}")
    async def get_myth(myth_id: str, request: Request, refresh: bool = False):
        await refresh_if_asked(request, refresh)
        return derive(derived.myth_detail, myth_id) or api_error(404, "myth_not_found", "Unknown myth ID.")

    @app.get("/impact/{myth_id}")
    def get_impact(myth_id: str):
        return derive(derived.impact, myth_id) or api_error(404, "myth_not_found", "Unknown myth ID.")

    @app.get("/calendar")
    def get_calendar():
        return derive(derived.calendar)

    @app.post("/poll")
    async def post_poll(request: Request):
        try:
            ran, new_posts = await poll_now(request.app)
        except (sqlite3.Error, OSError, ValueError) as error:
            logger.warning("Poll failed (%s)", type(error).__name__)
            return api_error(503, "poll_unavailable", "The poll could not run.")
        with closing(store.connect()) as con:
            last_poll_at, next_poll_at = poller.schedule(con, settings)
        return {"ran": ran, "last_poll_at": last_poll_at, "next_poll_at": next_poll_at, "new_posts": new_posts}

    @app.get("/feed")
    def get_feed(since: str | None = None, limit: int = Query(50, ge=1, le=100)):
        try:
            since = store.iso(store.parse_iso(since)) if since else None
        except ValueError:
            return api_error(422, "invalid_request", "since must be an ISO 8601 timestamp.")
        with closing(store.connect()) as con:
            last_poll_at, next_poll_at = poller.schedule(con, settings)
            posts = store.list_feed(con, since=since, limit=limit)
            data_through = store.data_through(con)
        return {
            "generated_at": store.iso(datetime.now(timezone.utc)),
            "last_poll_at": last_poll_at, "next_poll_at": next_poll_at, "data_through": data_through, "posts": posts,
        }

    @app.get("/corrections")
    def get_corrections(myth_id: str | None = Query(None, max_length=80)):
        """Posts whose correction passed corrections.check_post, in feed order, optionally for one myth."""
        with closing(store.connect()) as con:
            posts = [post for post in store.list_feed(con, limit=1_000_000)
                     if post["label"] and post["label"].get("correction")
                     and (myth_id is None or post["label"]["myth_id"] == myth_id)]
        return {"posts": posts[:20]}

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
