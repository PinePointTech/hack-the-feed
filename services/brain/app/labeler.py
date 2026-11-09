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
STANDALONE_MIN = 0.5
PROMPT_VERSION = "evidence-quote-1"  # bump when a question changes, so old labels stay explainable
CONTEXT_MAX = 6000
EVIDENCE_OPTIONS = 12
EVIDENCE_MIN_WORDS = 4
STANCES = {
    "promotes": (
        "Not an ad. The person presents the claim as true or tells others to act on it, as advice, education "
        "or a personal routine."
    ),
    "debunks": "The post disputes the claim, corrects it or warns against it.",
    "ad": (
        "The post is made to sell or advertise a product, service, brand, shop or event: it has a price, a "
        "booking or discount line, a shop or marketplace listing, a brand tag or paid partnership, or a business "
        "describing its own offer, or it tells people to buy or take a named brand product. Choose ad even when "
        "the post also states the claim."
    ),
    "unrelated": "The post takes no position on the claim, or claim_sentence is not a health claim.",
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
            "instructions": "Which listed claim does claim_sentence restate? Pick none if it matches no listed claim.",
            "options": {**myths, NO_MYTH: "None of the listed claims."},
        },
        "stance": {
            "type": "choice",
            "instructions": (
                "Check ad first: if the post is made to sell something, answer ad. Otherwise, what stance does "
                "the post take on the claim in claim_sentence?"
            ),
            "options": STANCES,
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
                "evidence? A modest claim that evidence supports, such as massage easing swelling for a while, is not."
            ),
        },
    }
    if evidence:
        asked["evidence"] = {
            "type": "choice",
            "instructions": (
                "Which listed sentence, in the post's own words, best shows the position the post takes on "
                "claim_sentence? Pick none if no listed sentence shows it."
            ),
            "options": {**{f"s{i}": f"({source}) {sentence}" for i, (source, sentence) in enumerate(evidence, 1)},
                        NO_MYTH: "No listed sentence shows it."},
        }
    return asked


def state_for(post: dict) -> str:
    # texts_of lists the transcript first, then the caption, then on-screen text, so a long transcript is cut last.
    context = " ".join(text for _, text in poller.texts_of(json.loads(post["raw_json"])))[:CONTEXT_MAX]
    return json.dumps({"claim_sentence": post["snippet"], "matched_phrase": post["matched_query"], "post_text": context})


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
            quote, source = evidence_of(post, sentences, result[0]) if health_claim and stance != "unrelated" else (None, None)
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
                basis=basis, evidence_quote=quote, evidence_source=source,
            )
            labeled += 1
        return labeled
