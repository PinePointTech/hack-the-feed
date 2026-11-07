"""Classify the radar sample and update the demo snapshots."""

import asyncio
import json
import re
from collections import Counter
from dataclasses import dataclass

import httpx

from . import judge, oriane, radar, reporting
from .config import Settings

CLINICIAN_TERMS = [
    "physician", "doctor", "MD", "nurse", "physical therapist", "lymphedema",
    "dermatologist", "surgeon",
]
QUOTE_TERMS = {
    "lymphatic-detox": r"detox|toxin|lymphatic|weight loss|fat",
    "mouth-taping": r"mouth tap|mouth shut|jawline",
    "garlic-tumor": r"garlic|tumou?r|cancer",
}


@dataclass
class Classified:
    item: dict
    stance: str
    confidence: float
    nameable: bool
    quotable: bool


def decide(item: dict, scores: dict[str, float]) -> Classified:
    stances = {key: scores[key] for key in ("promotes", "debunks", "ad", "unrelated")}
    stance = max(stances, key=stances.__getitem__)
    confidence = stances[stance]
    if confidence < 0.5:
        stance, confidence = "neutral", 1 - confidence
    reach = (item.get("viewsCount") or 0) >= 100_000 or (item.get("profileFollowersCount") or 0) >= 50_000
    quotable = scores["minor"] < 0.3 and scores["personal_illness"] < 0.3
    nameable = reach and quotable and scores["adult"] >= 0.8
    return Classified(item, stance, confidence, nameable, quotable)


async def classify(
    item: dict, summary: dict, evaluator: judge.Judge, client: httpx.AsyncClient,
) -> Classified:
    media = item.get("media") or []
    state = {
        "topic": summary["topic"],
        "claim": summary["claim"],
        "platform": item.get("platform"),
        "bio": item.get("profileBio"),
        "caption": item.get("caption"),
        "followers": item.get("profileFollowersCount"),
        "transcript": " ".join(str(m.get("transcript") or "") for m in media)[:4000],
        "on_screen_text": " ".join(str(m.get("onScreenText") or "") for m in media)[:1500],
    }
    questions = {
        "promotes": "Does this post present the specified health claim as true? A paid ad can also promote the claim.",
        "debunks": "Does this post say the specified health claim is false, unproven or misleading?",
        "ad": "Is this post primarily a paid promotion or advertisement? An incidental plug alone does not count.",
        "unrelated": "Is this post about something other than the specified topic?",
        "personal_illness": "Does the creator describe their own illness or medical condition?",
        "minor": "Is there evidence the creator is under 18?",
        "adult": "Is there affirmative evidence from the text or bio that the creator is an adult? Score low if unknown.",
    }
    answers, _ = await evaluator.ask(
        json.dumps(state),
        {key: {"type": "noul", "instructions": value} for key, value in questions.items()},
        client=client,
    )
    return decide(item, {key: answer["noul"] for key, answer in answers.items()})


async def harm_tier(summary: dict, evaluator: judge.Judge, client: httpx.AsyncClient) -> str:
    state = json.dumps({"claim": summary["claim"], "reviewed_context": summary["harm_reason"]})
    questions = {
        "harmful": {"type": "noul", "instructions": (
            "Does this claim, as stated and in the reviewed context, risk direct harm "
            "or encourage delaying or replacing appropriate medical care?"
        )},
        "contradicted": {"type": "noul", "instructions": (
            "Does the reviewed context explicitly contradict the claim or call it unfounded?"
        )},
    }
    answers, _ = await evaluator.ask(state, questions, client=client)
    if answers["harmful"]["noul"] >= 0.5:
        return "harmful"
    return "false" if answers["contradicted"]["noul"] >= 0.5 else "unproven"


def quote_video(classified: Classified, full: dict, summary: dict) -> dict | None:
    item = classified.item
    platform = item["platform"]
    handle = (item.get("profileHandle") or "").lstrip("@")
    external_id = item.get("platformId")
    if not handle or not external_id:
        return None
    urls = {
        "instagram": f"https://www.instagram.com/reel/{external_id}/",
        "tiktok": f"https://www.tiktok.com/@{handle}/video/{external_id}",
        "youtube": f"https://www.youtube.com/watch?v={external_id}",
    }
    if platform not in urls:
        return None
    video = {
        "oriane_id": item["id"], "platform": platform, "url": urls[platform], "handle": handle,
        "views": item["viewsCount"], "published_at": item["publishedAt"],
        "stance": classified.stance, "stance_confidence": classified.confidence,
        "nameable": classified.nameable,
    }
    for key, field in {
        "display_name": "profileDisplayName", "followers": "profileFollowersCount",
        "shares": "sharesCount", "interactions": "interactionsCount", "thumbnail_url": "thumbnailMediaUrl",
    }.items():
        if item.get(field) is not None:
            video[key] = item[field]

    seed = summary.get("top_video")
    if seed and seed["oriane_id"] == item["id"]:
        if verified := radar.update_video(seed, full):
            return video | {"quote": verified["quote"], "quote_source": "transcript",
                            "quote_start_s": verified["quote_start_s"]}

    pattern = re.compile(QUOTE_TERMS[summary["id"]], re.I)
    for media in full.get("media") or []:
        for chunk in media.get("transcriptChunks") or []:
            text = chunk["text"].strip()
            if pattern.search(text) and len(text) <= 240:
                return video | {"quote": text, "quote_source": "transcript",
                                "quote_start_s": chunk["startSeconds"]}
    for text in re.split(r"(?<=[.!?])\s+|\n+", item.get("caption") or ""):
        if pattern.search(text) and len(text.strip()) <= 240:
            return video | {"quote": text.strip(), "quote_source": "caption"}
    return None


async def build(client: httpx.AsyncClient, settings: Settings, *, refresh: bool = False) -> dict:
    snapshot = radar.read_radar()
    evaluator = judge.Judge(settings=settings)
    limit = asyncio.Semaphore(3)

    async def search(query: dict, **kwargs):
        async with limit:
            return await oriane.search(client, settings, query, cache=True, refresh=refresh, **kwargs)

    async def enrich(summary: dict):
        myth_id = summary["id"]
        topic = radar.TOPICS[myth_id]
        payload = await search(radar.window_query(radar.CURRENT, topic), projection="default", limit=30)
        items = payload["data"]["results"]
        classified = await asyncio.gather(*(classify(item, summary, evaluator, client) for item in items))
        counts = Counter(entry.stance for entry in classified)
        # Full transcripts are restricted to five quote candidates per myth.
        quote_candidates = [entry for entry in classified if entry.quotable and entry.stance in {"promotes", "debunks"}][:5]
        full_items = {}
        if quote_candidates:
            full = await search({"operator": "and", "filters": {"id": {
                "includes": [entry.item["id"] for entry in quote_candidates],
            }}}, projection="full", limit=len(quote_candidates))
            full_items = {item["id"]: item for item in full["data"]["results"]}
        async def verified_quote(entry: Classified) -> dict | None:
            item = full_items.get(entry.item["id"])
            if not item or not (video := quote_video(entry, item, summary)):
                return None
            state = json.dumps({
                "claim": summary["claim"], "stance": entry.stance, "quote": video["quote"],
            })
            answers, _ = await evaluator.ask(state, {
                "relevant": {"type": "noul", "instructions": (
                    "Does this quote itself clearly illustrate the stated stance on the "
                    "specific claim? Mere mention of the topic or an anecdote is insufficient."
                )},
            }, client=client)
            return video if answers["relevant"]["noul"] >= 0.8 else None

        videos = [
            video for video in await asyncio.gather(*(verified_quote(entry) for entry in quote_candidates))
            if video is not None
        ]

        promoters = [video for video in videos if video["stance"] == "promotes"]
        updated = summary.copy()
        # Review any model disagreement before replacing the editorial tier and reason.
        suggested_tier = await harm_tier(summary, evaluator, client)
        updated.pop("top_video", None)
        if promoters:
            updated["top_video"] = promoters[0]
        detail = {
            **updated,
            "videos": promoters,
            "counter_voices": [video for video in videos if video["stance"] == "debunks"],
            "stance_counts": dict(counts),
            "stance_sample_size": len(classified),
        }
        if myth_id == "lymphatic-detox":
            clinician_query = radar.window_query(radar.CURRENT, topic)
            clinician_query["filters"]["profileBio"] = {
                "includesFuzzy": {"operator": "or", "values": CLINICIAN_TERMS},
            }
            count, views = radar.counts(await search(clinician_query))
            detail["clinician_share"] = {
                "videos": count, "views": views,
                "video_pct": round(100 * count / summary["topic_video_count"], 1) if summary["topic_video_count"] else 0,
                "view_pct": round(100 * views / summary["topic_views"], 1) if summary["topic_views"] else 0,
                "note": "Estimated from bio keywords. This does not verify credentials.",
            }
        labels = [
            {"oriane_id": entry.item["id"], "stance": entry.stance,
             "stance_confidence": entry.confidence, "nameable": entry.nameable}
            for entry in classified
        ]
        impact = reporting.build_impact(detail, [(entry.stance, entry.item) for entry in classified])
        if impact is None:
            raise ValueError(f"Oriane stance sample for {myth_id} has incomplete impact data")
        return updated, detail, {"videos": labels, "suggested_harm_tier": suggested_tier}, impact

    results = await asyncio.gather(*(enrich(summary) for summary in snapshot["myths"]))
    updated_radar = {**snapshot, "myths": [summary for summary, _, _, _ in results]}
    calendar = reporting.build_calendar(updated_radar)
    for summary, detail, audit, impact in results:
        myth_id = summary["id"]
        oriane.write_json(radar.DATA_DIR / "cache" / "radar-policy" / f"{myth_id}.json", audit)
        oriane.write_json(radar.DATA_DIR / "myths" / f"{myth_id}.json", detail)
        oriane.write_json(radar.DATA_DIR / "impact" / f"{myth_id}.json", impact)
    oriane.write_json(radar.DATA_DIR / "radar.json", updated_radar)
    oriane.write_json(radar.DATA_DIR / "calendar.json", calendar)
    return updated_radar


async def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Bypass the Oriane response cache")
    args = parser.parse_args()
    async with httpx.AsyncClient() as client:
        await build(client, Settings.from_env(), refresh=args.refresh)


if __name__ == "__main__":
    asyncio.run(main())
