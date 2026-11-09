"""Oriane query builders and the checked-in demo snapshots (the live routes read the database, see derived.py)."""

import json

from . import oriane

DATA_DIR = oriane.DATA_DIR
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
    return json.loads((DATA_DIR / "radar.json").read_bytes())


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
