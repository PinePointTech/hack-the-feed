"""One poll: search Oriane for the watchlist phrases and store the posts found."""

import json
import re
from datetime import datetime, timedelta, timezone

import httpx

from . import derived, oriane, store
from .config import Settings
from .radar import text_query

WATCHLIST = oriane.DATA_DIR / "watchlist.json"
PHRASES_PER_SEARCH = 6
RESULTS_PER_SEARCH = 100
MAX_PAGES_PER_BATCH = 5
# The text index changes slowly, so only every DEEP_EVERY-th poll (the first included) pages past the newest 100.
DEEP_EVERY = 4
# shortcut: assumes the REST API takes comma-separated sort keys; confirm with a live poll.
SORT = "publishedAt:desc,viewsCount:desc"
SNIPPET_MAX = 240
PLATFORMS = {"tiktok", "instagram", "youtube"}


def load_watchlist() -> list[str]:
    phrases = json.loads(WATCHLIST.read_bytes())["phrases"]
    if not phrases or not all(isinstance(phrase, str) and phrase.strip() for phrase in phrases):
        raise ValueError("watchlist.json needs a non-empty list of phrases")
    return [phrase.strip() for phrase in phrases]


def build_query(phrases: list[str], after: str) -> dict:
    return {
        "operator": "and",
        "filters": {"publishedAt": {"after": after}, "captionLanguage": {"includes": ["en"]}},
        "queries": [text_query(phrases)],
    }


def texts_of(item: dict) -> list[tuple[str, str]]:
    """Every text field of a post as (snippet_source, text), transcript first."""
    media = item.get("media") or []
    on_screen = []
    for entry in media:
        value = entry.get("onScreenText") or []
        on_screen.extend([value] if isinstance(value, str) else [t for t in value if isinstance(t, str)])
    return [
        *(("transcript", entry["transcript"]) for entry in media if isinstance(entry.get("transcript"), str)),
        *([("caption", item["caption"])] if isinstance(item.get("caption"), str) else []),
        *(("on_screen", text) for text in on_screen),
    ]


def snippet_for(item: dict, phrases: list[str]) -> tuple[str, str, str] | None:
    """The sentence around the first phrase hit, as (snippet, source, phrase). Always an exact substring."""
    for source, text in texts_of(item):
        for phrase in phrases:
            match = re.search(r"\s+".join(map(re.escape, phrase.split())), text, re.I)
            if not match:
                continue
            start = max(text.rfind(mark, 0, match.start()) for mark in ".!?\n") + 1
            stops = [i for mark in ".!?\n" if (i := text.find(mark, match.end())) >= 0]
            end = min(stops) + 1 if stops else len(text)
            snippet = text[start:end].strip()
            if len(snippet) > SNIPPET_MAX:
                snippet = text[max(0, match.start() - 110):match.end() + 110].strip()
            return snippet, source, phrase
    return None


def post_url(item: dict) -> str | None:
    handle = (item.get("profileHandle") or "").lstrip("@")
    external_id = item.get("platformId")
    if not external_id:
        return None
    return {
        "instagram": f"https://www.instagram.com/reel/{external_id}/",
        "tiktok": f"https://www.tiktok.com/@{handle}/video/{external_id}" if handle else None,
        "youtube": f"https://www.youtube.com/watch?v={external_id}",
    }.get(item.get("platform"))


def to_post(item: dict, phrases: list[str]) -> dict | None:
    # No snippet means no source for a claim, so the post is not stored.
    if item.get("platform") not in PLATFORMS or not item.get("id") or not (found := snippet_for(item, phrases)):
        return None
    snippet, source, phrase = found
    return {
        "oriane_id": item["id"], "platform": item["platform"], "url": post_url(item),
        "handle": (item.get("profileHandle") or "").lstrip("@") or None,
        "display_name": item.get("profileDisplayName"), "thumbnail_url": item.get("thumbnailMediaUrl"),
        "views": item.get("viewsCount"), "published_at": item.get("publishedAt"),
        "snippet": snippet, "snippet_source": source, "matched_query": phrase, "raw": item,
    }


def has_transcript(item: dict) -> bool:
    return any(source == "transcript" and text.strip() for source, text in texts_of(item))


async def refresh_transcripts(
    con, client: httpx.AsyncClient, settings: Settings, poll_id: int, now: datetime, phrases: list[str],
) -> int:
    """Re-fetch stored videos that still lack a transcript (one search, up to 100 posts), since Oriane adds
    transcripts weeks after a post. Posts that gain one are queued for relabeling. Returns how many gained one."""
    ids = store.posts_missing_transcripts(con, now, settings.label_min_views, RESULTS_PER_SEARCH)
    if not ids:
        return 0
    store.charge_search(con, poll_id)
    payload = await oriane.search(
        client, settings, {"operator": "and", "filters": {"id": {"includes": ids}}},
        projection="default", limit=RESULTS_PER_SEARCH,
    )
    # Only a stored post's refreshed raw counts: a result that no longer matches a phrase is not upserted.
    posts = [post for item in payload["data"]["results"] if item.get("id") in ids and (post := to_post(item, phrases))]
    store.upsert_posts(con, posts, store.iso(now))
    gained = [post["oriane_id"] for post in posts if has_transcript(post["raw"])]
    store.record_text_check(con, ids, gained, store.iso(now))
    return len(gained)


def schedule(con, settings: Settings) -> tuple[str | None, str | None]:
    """(last_poll_at, next_poll_at), both measured from the last poll start."""
    last = store.last_poll_started(con)
    if last is None:
        return None, None
    return last, store.iso(store.parse_iso(last) + timedelta(minutes=settings.poll_interval_minutes))


async def run_poll(
    client: httpx.AsyncClient, settings: Settings, *, now: datetime | None = None,
) -> tuple[bool, int]:
    """Run one poll if the interval has passed. Returns (ran, new_posts)."""
    now = now or datetime.now(timezone.utc)
    if not settings.oriane_key:
        return False, 0
    con = store.connect()
    try:
        _, next_poll = schedule(con, settings)
        if next_poll and store.iso(now) < next_poll:
            return False, 0
        phrases = load_watchlist()
        batches = [phrases[i:i + PHRASES_PER_SEARCH] for i in range(0, len(phrases), PHRASES_PER_SEARCH)]
        budget = settings.oriane_max_searches_per_hour - store.searches_since(con, store.iso(now - timedelta(hours=1)))
        poll_id = store.start_poll(con, store.iso(now))
        new_posts, ran, capped = 0, 0, 0
        out_of_budget = False
        # both trend windows, which end INDEX_LAG_DAYS ago, plus the lag days the feed shows
        after = (now - timedelta(days=2 * derived.WINDOW_DAYS + derived.INDEX_LAG_DAYS)).date().isoformat()
        try:
            for batch in batches:
                fetched = 0
                for _ in range(MAX_PAGES_PER_BATCH if poll_id % DEEP_EVERY == 1 else 1):
                    if budget <= 0:
                        out_of_budget = True
                        break
                    budget -= 1
                    ran += 1
                    store.charge_search(con, poll_id)
                    payload = await oriane.search(
                        client, settings, build_query(batch, after),
                        sort=SORT, projection="default", limit=RESULTS_PER_SEARCH, offset=fetched,
                    )
                    results = payload["data"]["results"]
                    fetched += len(results)
                    posts = [post for item in results if (post := to_post(item, batch))]
                    # The oriane_id primary key dedupes repeats within and across searches and pages.
                    new_posts += store.upsert_posts(con, posts, store.iso(now))
                    total = (payload.get("metadata") or {}).get("pagination", {}).get("totalCount", fetched)
                    if not results or fetched >= total:
                        break
                else:
                    capped += poll_id % DEEP_EVERY == 1  # shortcut: results past the page cap are dropped; raise MAX_PAGES_PER_BATCH if this shows up.
                if out_of_budget:
                    break
            if not out_of_budget and budget > 0:
                await refresh_transcripts(con, client, settings, poll_id, now, phrases)
            problems = [
                *([f"search cap reached after {ran} searches, so some results were not fetched"] if out_of_budget else []),
                *([f"{capped} of {len(batches)} searches have more than {MAX_PAGES_PER_BATCH} pages, so older posts may be missing"] if capped else []),
            ]
            error = "; ".join(problems) or None
        except httpx.HTTPStatusError as failure:
            error = f"Oriane returned HTTP {failure.response.status_code}"
        except (httpx.RequestError, ValueError, KeyError, TypeError, RuntimeError) as failure:
            error = f"Oriane search failed ({type(failure).__name__})"
        store.finish_poll(con, poll_id, store.iso(datetime.now(timezone.utc)), new_posts, error)
        derived.write_snapshots(con, now)
        return True, new_posts
    finally:
        con.close()
