"""Label stored posts: health claim, myth, claim stance and commercial intent. Unknown claims become candidate myths.

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
DUBIOUS_MIN = store.DUBIOUS_MIN
STANDALONE_MIN = 0.5
PROMPT_VERSION = "two-axes-2"  # bump when a question changes, so old labels stay explainable
CONTEXT_MAX = 6000
REST_MAX = 1500  # caption and on-screen text always keep this much room, so a long transcript cannot hide an offer
EVIDENCE_OPTIONS = 20
EVIDENCE_MIN_WORDS = 4
COMMERCIAL_MIN = 0.5
CLAIM_STANCES = {
    "endorses": (
        "In their own voice, the creator asserts or implies that the named practice or product has a health effect, "
        "or tells people to use it for their health. Selling it as well does not change this."
    ),
    "disputes": "In their own voice, the creator disputes that claim, corrects it or warns against it.",
    "neither": (
        "A passing mention, list item, label or banner, joke, metaphor or figure of speech (such as a spiritual "
        "'cleanse'), a claim the creator only reports without taking a side, or no health effect stated for the "
        "named practice or product."
    ),
}
FAILURES = (httpx.HTTPError, ValueError, KeyError, TypeError, RuntimeError)


def evidence_sentences(post: dict) -> list[tuple[str, str]]:
    """Up to EVIDENCE_OPTIONS (source, sentence) pairs of the post's own text, nearest the matched phrase first.

    A sentence ends at . ! ? or a line break and has at least EVIDENCE_MIN_WORDS words; each is an exact substring."""
    found = [
        (source, sentence.strip()) for source, text in poller.texts_of(json.loads(post["raw_json"]))
        for sentence in re.findall(r"[^.!?\n]+[.!?]*", text) if len(sentence.split()) >= EVIDENCE_MIN_WORDS
    ]
    found = list(dict.fromkeys(found))
    phrase = post["matched_query"].lower()
    hits = [i for i, (_, sentence) in enumerate(found) if phrase in sentence.lower()]
    near = lambda i: min((abs(i - hit) for hit in hits), default=i)  # noqa: E731
    return [found[i] for i in sorted(range(len(found)), key=near)[:EVIDENCE_OPTIONS]]


def questions(myths: dict[str, str], evidence: list[tuple[str, str]] = ()) -> dict:
    asked = {
        "health_claim": {
            "type": "noul",
            "instructions": "Does claim_sentence make a claim about health, the body, a treatment or a supplement?",
        },
        "myth": {
            "type": "choice",
            "instructions": (
                "Which listed myth does the creator endorse or dispute in this post? The post must make the same kind "
                "of claim about the same practice or product, not just mention it; a different effect of the same "
                "practice is not a match. Pick none if unsure."
            ),
            "options": {**myths, NO_MYTH: "None of the listed claims."},
        },
        "claim_stance": {
            "type": "choice",
            "instructions": (
                "Read the post, spoken words first. Does the creator, in their own voice, assert or imply that the "
                "practice or product in claim_sentence has a health effect, or dispute such a claim? Whether the "
                "post sells anything is a separate question."
            ),
            "options": CLAIM_STANCES,
        },
        "commercial": {
            "type": "noul",
            "instructions": (
                "Is the post made by or for a seller to sell or promote a product, service, brand, shop, event or paid "
                "offer? Yes for the creator's own price, booking or discount line, shop or marketplace listing, paid "
                "partnership or brand tag, a link, code or 'comment a word' or 'DM me' funnel to get a guide, fix or "
                "product (also when it is only in the caption), a business showing its own work, products or offer, "
                "or telling people to buy or take a named brand product. No for brand names or packaging that merely "
                "appear on screen, a banner or ad the creator shows, reports on or criticizes, a seller the creator "
                "exposes, or products named with no link, code, price or offer, such as a review that says it is not "
                "sponsored. Answer this whether or not the post also states a health claim."
            ),
        },
        "standalone_claim": {
            "type": "noul",
            "instructions": (
                "Read alone, is claim_sentence a complete statement that something has a health effect, such as "
                "'X cures Y' or 'Did you know X does Y'? Answer no for an ingredient or product name, a slogan, "
                "a price or booking line, a question that states no effect, or a story about a person."
            ),
        },
        "dubious": {
            "type": "noul",
            "instructions": (
                "Is the health claim in claim_sentence false, unproven, or contradicted by mainstream medical "
                "evidence? A modest claim that evidence supports, such as massage easing swelling for a while, or a "
                "hedged summary of a controlled trial with its limits, is not."
            ),
        },
    }
    if evidence:
        asked["evidence"] = {
            "type": "choice",
            "instructions": (
                "Which listed sentence, in the post's own words, states the health claim the post makes or disputes: "
                "what the practice or product does to the body or health? A sales line, price, call to action, "
                "greeting, question or request to share or comment is not a claim, even in a post that sells. "
                "Pick none if no listed sentence states a health effect."
            ),
            "options": {**{f"s{i}": f"({source}) {sentence}" for i, (source, sentence) in enumerate(evidence, 1)},
                        NO_MYTH: "No listed sentence shows it."},
        }
    return asked


def state_for(post: dict) -> str:
    """The judge's view of a post: its claim sentence and up to CONTEXT_MAX characters of text, transcript first.

    The caption and on-screen text keep up to REST_MAX characters; a transcript longer than what is left is cut to the
    stretch around the matched phrase, so neither the offer in a caption nor the claim deep in a transcript is lost."""
    texts = poller.texts_of(json.loads(post["raw_json"]))
    transcript = " ".join(text for kind, text in texts if kind == "transcript")
    rest = " ".join(text for kind, text in texts if kind != "transcript")[:REST_MAX]
    room = CONTEXT_MAX - len(rest) - 1 if rest else CONTEXT_MAX
    if len(transcript) > room:
        hit = transcript.lower().find(post["matched_query"].lower())
        start = min(max(hit - room // 2, 0), len(transcript) - room) if hit >= 0 else 0
        transcript = transcript[start:start + room]
    return json.dumps({"claim_sentence": post["snippet"], "matched_phrase": post["matched_query"],
                       "post_text": f"{transcript} {rest}".strip()})


def evidence_of(post: dict, evidence: list[tuple[str, str]], answers: dict) -> tuple[str | None, str | None]:
    """(quote, source) the judge chose, kept only if the quote is an exact substring of that source's text."""
    choice = answers.get("evidence", {}).get("choice")
    if not choice or choice == NO_MYTH:
        return None, None
    source, quote = evidence[int(choice[1:]) - 1]
    texts = [text for kind, text in poller.texts_of(json.loads(post["raw_json"])) if kind == source]
    return (quote, source) if any(quote in text for text in texts) else (None, None)


def candidate_id(phrase: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", phrase.lower()).strip("-")


def stance_of(claim_stance: str, commercial: bool) -> str:
    """The stored stance for the two axes: endorses is promotes and disputes is debunks, sold or not."""
    return {"endorses": "promotes", "disputes": "debunks"}.get(claim_stance) or ("ad" if commercial else "unrelated")


def decide(answers: dict) -> tuple[bool, str | None, str, float]:
    """(health_claim, myth_id or None, stored stance, confidence) from the judge's answers.

    A myth counts only when the creator takes a side on it."""
    claim = answers["claim_stance"]["choice"]
    sells = answers["commercial"]["noul"]
    stance = stance_of(claim, sells >= COMMERCIAL_MIN)
    confidence = answers["claim_stance"]["probabilities"][claim]
    if claim == "neither":
        confidence = min(confidence, sells if stance == "ad" else 1 - sells)
    myth = answers["myth"]["choice"]
    return answers["health_claim"]["noul"] >= 0.5, None if myth == NO_MYTH or claim == "neither" else myth, stance, confidence


def quote_for(post: dict, evidence: list[tuple[str, str]], answers: dict, health_claim: bool, stance: str) -> tuple[str | None, str | None]:
    """The evidence quote a label carries: only a health claim the post takes a position on, or sells, shows its words."""
    return evidence_of(post, evidence, answers) if health_claim and stance != "unrelated" else (None, None)


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
        posts = store.unlabeled_posts(con, room, settings.label_min_views, PROMPT_VERSION) if room > 0 else []
        if not posts:
            return 0
        myths = {**brief.MYTHS, **store.myth_claims(con)}
        owned = {phrase.lower() for (phrases,) in con.execute("SELECT phrases FROM myths WHERE status = 'confirmed'")
                 for phrase in json.loads(phrases)}
        options = [evidence_sentences(post) for post in posts]
        results = await asyncio.gather(
            *(evaluator.ask(state_for(post), questions(myths, sentences), client=client)
              for post, sentences in zip(posts, options)),
            return_exceptions=True,
        )
        labeled = 0
        for post, sentences, result in zip(posts, options, results):
            if isinstance(result, BaseException):
                if not isinstance(result, FAILURES):
                    raise result
                # The post stays unlabeled and the next poll tries it again.
                logger.warning("Labeling failed (%s)", type(result).__name__)
                continue
            health_claim, myth_id, stance, confidence = decide(result[0])
            # Only a promoted claim the model doubts, and that reads as a claim on its own, can seed a candidate;
            # a debunk, a slogan, an ingredient or a modest true claim is labeled, not proposed.
            dubious = result[0].get("dubious", {}).get("noul", 0.0)
            standalone = result[0].get("standalone_claim", {}).get("noul", 0.0)
            # A phrase a confirmed myth already owns never seeds a second myth with the same title.
            new_topic = post["matched_query"].lower() not in owned
            # An evidence quote shows the post's words; unrelated labels carry none.
            quote, source = quote_for(post, sentences, result[0], health_claim, stance)
            basis = "transcript" if poller.has_transcript(json.loads(post["raw_json"])) else "text_only"
            # A caption-only post needs a quote to seed a candidate; a transcript backs it already.
            grounded = basis == "transcript" or quote is not None
            if (health_claim and myth_id is None and stance == "promotes" and dubious >= DUBIOUS_MIN
                    and standalone >= STANDALONE_MIN and new_topic and grounded):
                myth_id = candidate_id(post["matched_query"]) or None
                if myth_id and myth_id not in myths:
                    store.add_candidate(
                        con, myth_id, title=post["matched_query"], claim=post["snippet"],
                        source_oriane_id=post["oriane_id"], created_at=store.iso(now),
                    )
            store.upsert_label(
                con, post["oriane_id"], health_claim=health_claim, myth_id=myth_id, stance=stance,
                confidence=confidence, model=settings.chat_model, labeled_at=store.iso(now),
                dubious=dubious, standalone_claim=standalone, prompt_version=PROMPT_VERSION,
                commercial=result[0]["commercial"]["noul"] >= COMMERCIAL_MIN,
                basis=basis, evidence_quote=quote, evidence_source=source,
            )
            labeled += 1
        return labeled
