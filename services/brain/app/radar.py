"""Pull demo radar totals from Oriane and serve the checked-in snapshots."""

import asyncio
import json
from datetime import datetime, timezone

import httpx

from . import oriane
from .config import Settings

DATA_DIR = oriane.DATA_DIR
FIXTURE = DATA_DIR.parent / "contracts" / "fixtures" / "radar.json"
CURRENT = {"from": "2026-10-07", "to": "2026-11-06"}
PREVIOUS = {"from": "2026-09-07", "to": "2026-10-06"}
FIELDS = ("transcript", "caption", "onScreenText")


def text_query(phrases: list[str], fields: tuple[str, ...] = FIELDS, match: str = "includesExactly") -> dict:
    return {
        "operator": "or",
        "filters": {
            field: {match: {"operator": "or", "values": phrases}}
            for field in fields
        },
    }


TOPICS = {
    "lymphatic-detox": [text_query(["lymphatic drainage"])],
    "mouth-taping": [text_query(["mouth taping", "mouth tape", "tape my mouth", "taping my mouth"])],
    "garlic-tumor": [
        text_query(["garlic"], FIELDS[:2]),
        text_query(["tumor", "tumors", "cancer"], FIELDS[:2]),
    ],
}
LYMPHATIC_CLAIM = text_query(
    ["detox", "toxins", "debloat", "weight loss", "flush"], FIELDS[:2], "includesFuzzy"
)


def window_query(window: dict, queries: list[dict]) -> dict:
    return {
        "operator": "and",
        "filters": {"publishedAt": {"after": window["from"], "before": window["to"]}},
        "queries": queries,
    }


def counts(payload: dict) -> tuple[int, int]:
    total = payload["metadata"]["pagination"]["totalCount"]
    views = payload["data"]["aggregations"]["totalViewsCount"]
    if type(total) is not int or type(views) is not int or min(total, views) < 0:
        raise ValueError("Oriane response contains invalid radar totals")
    return total, views


def update_video(seed: dict, item: dict) -> dict | None:
    quote = seed["quote"]
    chunks = [chunk for media in item.get("media") or [] for chunk in media.get("transcriptChunks") or []]
    transcript = " ".join(chunk["text"].strip() for chunk in chunks)
    start_index = transcript.find(quote)
    if start_index < 0:
        return None

    offset = 0
    for chunk in chunks:
        end = offset + len(chunk["text"].strip())
        if offset <= start_index < end:
            start_seconds = chunk["startSeconds"]
            break
        offset = end + 1
    else:
        return None

    video = {**seed, "quote_start_s": start_seconds, "nameable": False}
    for field, source in {
        "views": "viewsCount", "shares": "sharesCount", "interactions": "interactionsCount",
        "followers": "profileFollowersCount", "published_at": "publishedAt",
        "thumbnail_url": "thumbnailMediaUrl",
    }.items():
        value = item.get(source)
        if value is not None:
            video[field] = value
    return video


def read_radar() -> dict:
    path = DATA_DIR / "radar.json"
    try:
        return json.loads(path.read_bytes())
    except FileNotFoundError:
        snapshot = json.loads(FIXTURE.read_bytes())
        snapshot.pop("_fixture", None)
        return snapshot


def detail_for(summary: dict) -> dict:
    return {
        **summary,
        "videos": [summary["top_video"]] if "top_video" in summary else [],
        "counter_voices": [],
        "stance_counts": {},
    }


def read_myth(myth_id: str) -> dict:
    try:
        return json.loads((DATA_DIR / "myths" / f"{myth_id}.json").read_bytes())
    except FileNotFoundError:
        return detail_for(next(item for item in read_radar()["myths"] if item["id"] == myth_id))


async def refresh_radar(client: httpx.AsyncClient, settings: Settings, *, refresh: bool = True) -> dict:
    seeds = json.loads(FIXTURE.read_bytes())["myths"]
    lookup = asyncio.Semaphore(3)

    async def pull(query: dict, **params) -> dict:
        async with lookup:
            return await oriane.search(client, settings, query, cache=True, refresh=refresh, **params)

    jobs = [
        pull(window_query(window, TOPICS[seed["id"]]))
        for seed in seeds for window in (CURRENT, PREVIOUS)
    ]
    jobs.extend([
        pull(window_query(CURRENT, [*TOPICS["lymphatic-detox"], LYMPHATIC_CLAIM])),
        pull(
            {"operator": "and", "filters": {"id": {
                "includes": [seed["top_video"]["oriane_id"] for seed in seeds],
            }}},
            projection="full", limit=len(seeds),
        ),
    ])
    results = await asyncio.gather(*jobs, return_exceptions=True)
    for result in results:
        if isinstance(result, BaseException):
            raise result

    fetched_at = datetime.now(timezone.utc).isoformat()
    videos = {item["id"]: item for item in results[-1]["data"]["results"]}
    myths = []
    for index, seed in enumerate(seeds):
        current_count, current_views = counts(results[2 * index])
        previous_count, previous_views = counts(results[2 * index + 1])
        pct = round((current_count - previous_count) / previous_count * 100) if previous_count else None
        trend = "unknown" if pct is None else "rising" if pct > 10 else "cooling" if pct < -10 else "steady"
        summary = {
            **seed,
            "window": CURRENT, "prev_window": PREVIOUS,
            "topic_video_count": current_count, "topic_views": current_views,
            "prev_topic_video_count": previous_count, "prev_topic_views": previous_views,
            "trend": trend, "data_source": "oriane_live", "snapshot_at": fetched_at,
        }
        summary.pop("trend_pct", None)
        if pct is not None:
            summary["trend_pct"] = pct
        top = summary.pop("top_video")
        if item := videos.get(top["oriane_id"]):
            if video := update_video(top, item):
                summary["top_video"] = video
        if seed["id"] == "lymphatic-detox":
            summary["claim_video_count"], summary["claim_views"] = counts(results[-2])
            summary["claim_interactions"] = results[-2]["data"]["aggregations"]["totalInteractionsCount"]
            summary["match_note"] = (
                "Topic: exact phrase in transcript, caption or on-screen text. Claim: "
                "topic matches that also contain one of the claim keywords in transcript or caption."
            )
        myths.append(summary)

    snapshot = {"generated_at": fetched_at, "window": CURRENT, "myths": myths}
    for summary in myths:
        oriane.write_json(DATA_DIR / "myths" / f'{summary["id"]}.json', detail_for(summary))
    oriane.write_json(DATA_DIR / "radar.json", snapshot)
    return snapshot
