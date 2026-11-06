import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import Settings

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
        json={
            "operator": "and",
            "filters": {
                "transcript": {
                    "includesExactly": {"operator": "and", "values": ["lymphatic drainage"]},
                },
            },
            "projection": "basic",
            "limit": 1,
            "offset": 0,
        },
    )
    response.raise_for_status()
    return isinstance(response.json()["data"]["results"], list)


async def check_gmi(client: httpx.AsyncClient, settings: Settings) -> bool:
    if not settings.gmi_key:
        return False
    response = await client.get(f"{settings.gmi_base_url}/models", headers=bearer(settings.gmi_key))
    response.raise_for_status()
    model_ids = {model["id"] for model in response.json()["data"]}
    return all(model and model in model_ids for model in settings.gmi_models)


async def check_jev(client: httpx.AsyncClient, settings: Settings) -> bool:
    if not settings.jev_key:
        return False
    response = await client.post(
        f"{settings.jev_base_url}/v1/systemone",
        headers=bearer(settings.jev_key),
        json={
            "model": settings.jev_model,
            "state": "The sky is blue.",
            "questions": {"q": {"type": "noul", "instructions": "Is the sky blue?"}},
        },
    )
    response.raise_for_status()
    probability = response.json()["answers"]["q"]["noul"]
    return isinstance(probability, (int, float)) and 0 <= probability <= 1


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
        oriane, gmi, jev = await asyncio.gather(
            run_probe(check_oriane, client, settings),
            run_probe(check_gmi, client, settings),
            run_probe(check_jev, client, settings),
        )
        return Health(ok=oriane and gmi, oriane=oriane, gmi=gmi, jev=jev)

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
