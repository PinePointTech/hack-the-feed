"""Oriane REST content search and optional disk cache."""

import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Literal

import httpx

from .config import Settings

DATA_DIR = Path(__file__).resolve().parents[3] / "data"


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False, encoding="utf-8") as file:
        temporary = Path(file.name)
        try:
            json.dump(payload, file, indent=2, ensure_ascii=False)
            file.write("\n")
            file.close()
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


async def search(
    client: httpx.AsyncClient,
    settings: Settings,
    query: dict,
    *,
    sort: str = "viewsCount:desc",
    projection: Literal["basic", "default", "full"] = "basic",
    limit: int = 1,
    offset: int = 0,
    cache: bool = False,
    refresh: bool = False,
) -> dict:
    if not (settings.oriane_key and settings.oriane_search_url):
        raise RuntimeError("Set ORIANE_API_KEY and ORIANE_SEARCH_URL to search Oriane")
    params = {"sort": sort, "projection": projection, "limit": limit, "offset": offset}
    digest = hashlib.sha256(json.dumps(
        [settings.oriane_search_url, params, query], sort_keys=True
    ).encode()).hexdigest()
    path = DATA_DIR / "cache" / "oriane" / f"{digest}.json"
    if cache and not refresh:
        try:
            return json.loads(path.read_bytes())
        except (FileNotFoundError, ValueError):
            pass
    response = await client.post(
        settings.oriane_search_url,
        headers={"Authorization": f"Bearer {settings.oriane_key}"},
        params=params,
        json=query,
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    if cache:
        write_json(path, payload)
    return payload
