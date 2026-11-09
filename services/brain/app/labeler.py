"""Label stored posts: health claim, myth and stance. Unknown claims become candidate myths.

A candidate keeps the post's own sentence as its claim and a watchlist phrase as its title, so the
model never writes text a user could read as a fact. Only POST /myths/{id}/confirm promotes one.
"""

import asyncio
import json
import logging
import re
from contextlib import closing
from datetime import datetime, timedelta, timezone

import httpx

from . import brief, judge, poller, store
from .config import Settings

logger = logging.getLogger(__name__)
NO_MYTH = "none"
DUBIOUS_MIN = 0.6
CONTEXT_MAX = 1500
STANCES = {
    "promotes": "The post presents the claim as true or tells people to act on it.",
    "debunks": "The post disputes the claim or corrects it.",
    "ad": "The post sells or sponsors a product that relies on the claim.",
    "unrelated": "The post does not take a position on the claim.",
}
FAILURES = (httpx.HTTPError, ValueError, KeyError, TypeError, RuntimeError)


def questions(myths: dict[str, str]) -> dict:
    return {
        "health_claim": {
            "type": "noul",
            "instructions": "Does claim_sentence make a claim about health, the body, a treatment or a supplement?",
        },
        "myth": {
            "type": "choice",
            "instructions": "Which listed claim does claim_sentence restate? Pick none if it matches no listed claim.",
            "options": {**myths, NO_MYTH: "None of the listed claims."},
        },
        "stance": {
            "type": "choice",
            "instructions": "What stance does the post take on the claim in claim_sentence?",
            "options": STANCES,
        },
        "dubious": {
            "type": "noul",
            "instructions": (
                "Is the health claim in claim_sentence false, unproven, or contradicted by mainstream medical "
                "evidence? A modest claim that evidence supports, such as massage easing swelling for a while, is not."
            ),
        },
    }


def state_for(post: dict) -> str:
    context = " ".join(text for _, text in poller.texts_of(json.loads(post["raw_json"])))[:CONTEXT_MAX]
    return json.dumps({"claim_sentence": post["snippet"], "matched_phrase": post["matched_query"], "post_text": context})


def candidate_id(phrase: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", phrase.lower()).strip("-")


def decide(answers: dict) -> tuple[bool, str | None, str, float]:
    """(health_claim, myth_id or None, stance, confidence) from the judge's answers."""
    p_health = answers["health_claim"]["noul"]
    if p_health < 0.5:
        return False, None, "unrelated", 1 - p_health
    stance = answers["stance"]["choice"]
    myth = answers["myth"]["choice"]
    return True, None if myth == NO_MYTH else myth, stance, answers["stance"]["probabilities"][stance]


async def label_pending(
    client: httpx.AsyncClient, settings: Settings, *,
    evaluator: judge.Judge | None = None, now: datetime | None = None,
) -> int:
    """Label unlabeled posts with enough views, within the hourly cap. Returns how many were labeled."""
    if not (settings.openai_key and settings.openai_model):
        return 0
    now = now or datetime.now(timezone.utc)
    evaluator = evaluator or judge.Judge(settings=settings)
    with closing(store.connect()) as con:
        room = settings.label_max_per_hour - store.labeled_since(con, store.iso(now - timedelta(hours=1)))
        posts = store.unlabeled_posts(con, room, settings.label_min_views) if room > 0 else []
        if not posts:
            return 0
        myths = {**brief.MYTHS, **store.myth_claims(con)}
        owned = {phrase.lower() for (phrases,) in con.execute("SELECT phrases FROM myths WHERE status = 'confirmed'")
                 for phrase in json.loads(phrases)}
        asked = questions(myths)
        results = await asyncio.gather(
            *(evaluator.ask(state_for(post), asked, client=client) for post in posts), return_exceptions=True,
        )
        labeled = 0
        for post, result in zip(posts, results):
            if isinstance(result, BaseException):
                if not isinstance(result, FAILURES):
                    raise result
                # The post stays unlabeled and the next poll tries it again.
                logger.warning("Labeling failed (%s)", type(result).__name__)
                continue
            health_claim, myth_id, stance, confidence = decide(result[0])
            # Only a claim the model doubts can seed a candidate; true or modest claims are labeled, not proposed.
            dubious = result[0].get("dubious", {}).get("noul", 0.0) >= DUBIOUS_MIN
            # A phrase a confirmed myth already owns never seeds a second myth with the same title.
            new_topic = post["matched_query"].lower() not in owned
            if health_claim and myth_id is None and stance in ("promotes", "debunks") and dubious and new_topic:
                myth_id = candidate_id(post["matched_query"]) or None
                if myth_id and myth_id not in myths:
                    store.add_candidate(
                        con, myth_id, title=post["matched_query"], claim=post["snippet"],
                        source_oriane_id=post["oriane_id"], created_at=store.iso(now),
                    )
            store.upsert_label(
                con, post["oriane_id"], health_claim=health_claim, myth_id=myth_id, stance=stance,
                confidence=confidence, model=settings.chat_model, labeled_at=store.iso(now),
            )
            labeled += 1
        return labeled
