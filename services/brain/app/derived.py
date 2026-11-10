"""Radar, myth detail, impact, calendar and daily snapshots computed from the SQLite store.

Every number comes from stored posts and labels. The contracts radar fixture is read once, on first
run, to seed the confirmed myths (editorial text and match phrases only, never counts).
"""

import json
import sqlite3
from collections import Counter
from datetime import date, datetime, timedelta

from . import oriane, store

FIXTURE = oriane.DATA_DIR.parent / "contracts" / "fixtures" / "radar.json"
# First-run seed: the phrases (as polled, see data/watchlist.json) that attribute an unlabeled post to a myth.
SEED_PHRASES = {
    "lymphatic-detox": ["lymphatic drainage"],
    "mouth-taping": ["mouth taping", "mouth tape", "tape my mouth", "taping my mouth"],
    "garlic-tumor": ["garlic tumor", "garlic cancer"],
}
WINDOW_DAYS = 7  # the poller searches two windows back, so both windows have been searchable
MIN_RISING_POSTS = 3  # shortcut: fewer posts in the window is noise, not a trend; tune with real poll history
TREND_PCT = 10
VIDEOS_SHOWN = 10
QUOTE_SOURCES = {"transcript": "transcript", "caption": "caption", "on_screen": "on_screen_text"}


# shortcut: measured once (docs/research/live-feed-coverage.md, 1.4): Oriane's text search fills a day about
# 6 days after it. Replace with a per-day completeness check if that lag changes.
INDEX_LAG_DAYS = 6


def data_end(con: sqlite3.Connection, now: datetime) -> date:
    """The last day Oriane's text search has filled: the newest post day, at most INDEX_LAG_DAYS before today.
    A single early post must not pull a half-empty week into the window, or every trend reads as cooling."""
    filled = now.date() - timedelta(days=INDEX_LAG_DAYS)
    newest = con.execute("SELECT MAX(substr(published_at, 1, 10)) FROM posts").fetchone()[0]
    return min(filled, date.fromisoformat(newest)) if newest else filled


def windows(today: date) -> tuple[dict, dict]:
    """(current, previous) as inclusive date windows ending on `today`."""
    span = timedelta(days=WINDOW_DAYS)
    current = {"from": (today - span + timedelta(days=1)).isoformat(), "to": today.isoformat()}
    previous = {"from": (today - 2 * span + timedelta(days=1)).isoformat(), "to": (today - span).isoformat()}
    return current, previous


def confirmed_myths(con: sqlite3.Connection) -> list[dict]:
    # shortcut: an empty table counts as first run, so emptying it by hand re-seeds it.
    if con.execute("SELECT 1 FROM myths LIMIT 1").fetchone() is None and FIXTURE.is_file():
        with con:
            for myth in json.loads(FIXTURE.read_bytes())["myths"]:
                con.execute(
                    "INSERT OR IGNORE INTO myths (id, title, topic, claim, harm_tier, harm_reason, phrases, status) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')",
                    (myth["id"], myth["title"], myth["topic"], myth["claim"], myth["harm_tier"],
                     myth["harm_reason"], json.dumps(SEED_PHRASES.get(myth["id"], [myth["topic"]]))),
                )
    # Myths confirmed before store.confirm_myth set a topic: give them their watchlist phrase (the title) once.
    with con:
        con.execute(
            "UPDATE myths SET topic = title, phrases = json_array(lower(title)) "
            "WHERE status = 'confirmed' AND topic = '' AND phrases = '[]'"
        )
    return [
        {**row, "phrases": [phrase.lower() for phrase in json.loads(row["phrases"])]}
        for row in map(dict, con.execute("SELECT * FROM myths WHERE status = 'confirmed' ORDER BY rowid"))
    ]


def load_posts(con: sqlite3.Connection, since: str) -> list[dict]:
    rows = con.execute(
        # A label assigns a post only to a confirmed myth; a candidate or no myth leaves the phrase to decide.
        "SELECT p.*, l.oriane_id IS NOT NULL AS labeled, l.stance, l.confidence, "
        "(SELECT n.nameable FROM naming_checks n WHERE n.oriane_id = p.oriane_id) AS nameable, "
        "CASE WHEN l.myth_id IN (SELECT id FROM myths WHERE status = 'confirmed') THEN l.myth_id END AS myth_id "
        "FROM posts p LEFT JOIN labels l ON l.oriane_id = p.oriane_id "
        "WHERE substr(COALESCE(p.published_at, p.fetched_at), 1, 10) >= ?",
        (since,),
    )
    return [{**row, "day": (row["published_at"] or row["fetched_at"])[:10], "views": row["views"] or 0}
            for row in map(dict, rows)]


def posts_of(myth: dict, posts: list[dict]) -> list[dict]:
    """A label that names a confirmed myth decides; otherwise the phrase the post was found with does.
    Posts labeled unrelated never count."""
    return [
        post for post in posts
        if post["stance"] != "unrelated"
        and (post["myth_id"] == myth["id"] if post["myth_id"] else post["matched_query"].lower() in myth["phrases"])
    ]


def assigned(myth: dict, posts: list[dict]) -> list[dict]:
    """Posts a label assigns to this confirmed myth. Reach and stance numbers use only these, never the phrase."""
    return [post for post in posts if post["myth_id"] == myth["id"]]


def inside(posts: list[dict], window: dict) -> list[dict]:
    return [post for post in posts if window["from"] <= post["day"] <= window["to"]]


def video_ref(post: dict) -> dict:
    raw = json.loads(post["raw_json"]) or {}
    ref = {
        "oriane_id": post["oriane_id"], "platform": post["platform"], "url": post["url"],
        "handle": post["handle"], "display_name": post["display_name"],
        "followers": raw.get("profileFollowersCount"), "views": post["views"],
        "shares": raw.get("sharesCount"), "interactions": raw.get("interactionsCount"),
        "published_at": post["published_at"], "thumbnail_url": post["thumbnail_url"],
        "quote": post["snippet"], "quote_source": QUOTE_SOURCES.get(post["snippet_source"], "caption"),
        "stance": post["stance"], "stance_confidence": post["confidence"],
        # True only once naming.check_post cleared it: reach, does not look under 18, not their own illness.
        "nameable": bool(post.get("nameable")),
    }
    return {key: value for key, value in ref.items() if value is not None}


def trend_of(count: int, previous: int) -> tuple[str, int | None]:
    if not previous:
        return "unknown", None
    pct = round((count - previous) / previous * 100)
    return ("rising" if pct > TREND_PCT else "cooling" if pct < -TREND_PCT else "steady"), pct


def summary_of(myth: dict, mine: list[dict], current: dict, previous: dict, snapshot_at: str) -> dict:
    now_posts, before = inside(mine, current), inside(mine, previous)
    trend, pct = trend_of(len(now_posts), len(before))
    summary = {
        "id": myth["id"], "title": myth["title"], "topic": myth["topic"], "claim": myth["claim"],
        "harm_tier": myth["harm_tier"], "harm_reason": myth["harm_reason"], "trend": trend,
        "window": current, "topic_video_count": len(now_posts),
        "topic_views": sum(post["views"] for post in now_posts),
        "prev_window": previous, "prev_topic_video_count": len(before),
        "prev_topic_views": sum(post["views"] for post in before),
        "match_note": "Topic counts include posts found with " + ", ".join(f'"{p}"' for p in myth["phrases"])
                      + " unless a label assigns them elsewhere. Promoter reach, top video and stance counts "
                      "use only posts a label assigns to this myth.",
        "data_source": "oriane_live", "snapshot_at": snapshot_at,
    }
    if pct is not None:
        summary["trend_pct"] = pct
    if promoters := [post for post in assigned(myth, now_posts) if post["stance"] == "promotes"]:
        # A nameable post first, so the myth's picture can be shown sharp; then the most viewed.
        summary["top_video"] = video_ref(max(promoters, key=lambda post: (bool(post.get("nameable")), post["views"])))
    return summary


def snapshot_time(con: sqlite3.Connection, now: datetime) -> str:
    return store.last_poll_started(con) or store.iso(now)


def radar(con: sqlite3.Connection, now: datetime) -> dict:
    current, previous = windows(data_end(con, now))
    posts, at = load_posts(con, previous["from"]), snapshot_time(con, now)
    myths = [summary_of(m, posts_of(m, posts), current, previous, at) for m in confirmed_myths(con)]
    return {"generated_at": store.iso(now), "window": current, "myths": myths}


def myth_detail(con: sqlite3.Connection, myth_id: str, now: datetime) -> dict | None:
    myth = next((m for m in confirmed_myths(con) if m["id"] == myth_id), None)
    if myth is None:
        return None
    current, previous = windows(data_end(con, now))
    mine = posts_of(myth, load_posts(con, previous["from"]))
    detail = summary_of(myth, mine, current, previous, snapshot_time(con, now))
    now_posts = inside(assigned(myth, mine), current)

    def top(stance: str) -> list[dict]:
        ranked = sorted((p for p in now_posts if p["stance"] == stance), key=lambda p: -p["views"])
        return [video_ref(post) for post in ranked[:VIDEOS_SHOWN]]

    labeled = [post for post in now_posts if post["labeled"]]
    detail.update(videos=top("promotes"), counter_voices=top("debunks"),
                  stance_counts=dict(Counter(post["stance"] for post in labeled)))
    if labeled:
        detail["stance_sample_size"] = len(labeled)
    return detail


def reach(posts: list[dict]) -> dict:
    return {"videos": len(posts), "views": sum(post["views"] for post in posts)}


def impact(con: sqlite3.Connection, myth_id: str, now: datetime) -> dict | None:
    myth = next((m for m in confirmed_myths(con) if m["id"] == myth_id), None)
    if myth is None:
        return None
    current, previous = windows(data_end(con, now))
    labeled = [p for p in inside(assigned(myth, posts_of(myth, load_posts(con, previous["from"]))), current)
               if p["labeled"]]
    result = {"generated_at": store.iso(now), "myth_id": myth_id, "window": current, "myth_reach": reach([p for p in labeled if p["stance"] == "promotes"])}
    if not labeled:
        result["note"] = "Pending: no posts are labeled as this myth yet, so response reach is not measured."
        return result
    debunks = reach([p for p in labeled if p["stance"] == "debunks"])
    result["response_reach"] = debunks
    note = (f"Based on {len(labeled)} posts a label assigns to this myth, from {current['from']} through "
            f"{current['to']}. Reach sums the views of those posts labeled promotes or debunks, including posts that "
            "also sell something. "
            "Topic counts on the radar also include unlabeled posts found with the myth's phrases.")
    if result["myth_reach"]["views"]:
        result["response_ratio"] = debunks["views"] / result["myth_reach"]["views"]
        note += " Response ratio divides debunk views by promoter views."
    else:
        note += " No post is labeled promotes, so there is no ratio."
    result["note"] = note
    return result


def week_label(monday: date) -> str:
    sunday = monday + timedelta(days=6)
    return f"{monday:%b} {monday.day} to {sunday:%b} {sunday.day}, {sunday.year}"


def calendar(con: sqlite3.Connection, now: datetime) -> dict:
    current, previous = windows(data_end(con, now))
    posts, at = load_posts(con, previous["from"]), snapshot_time(con, now)
    monday = now.date() + timedelta(days=7 - now.weekday())
    this_week, watchlist = [], []
    for myth in confirmed_myths(con):
        mine = posts_of(myth, posts)
        summary = summary_of(myth, mine, current, previous, at)
        count, before = summary["topic_video_count"], summary["prev_topic_video_count"]
        rising = summary["trend"] == "rising" and count >= MIN_RISING_POSTS
        weeks = (f"{before} posts from {previous['from']} through {previous['to']}, "
                 f"{count} from {current['from']} through {current['to']}")
        item = {
            "topic": myth["title"], "myth_id": myth["id"], "harm_tier": myth["harm_tier"],
            "trend": summary["trend"], "window": week_label(monday), "basis": "oriane_trend",
            "video_count": count, "views": summary["topic_views"],
            "script_available": any((oriane.DATA_DIR / "briefs").glob(f"{myth['id']}.*.json")),
            "why": (f"Posts rose week over week: {weeks}." if rising else
                    f"Posts rose week over week but {count} is under the {MIN_RISING_POSTS} needed to call it a trend: "
                    f"{weeks}. Watching." if summary["trend"] == "rising" else
                    f"Not rising week over week: {weeks}. Watching."),
        }
        (this_week if rising else watchlist).append(item)
    return {"generated_at": store.iso(now), "week_of": monday.isoformat(), "this_week": this_week, "watchlist": watchlist}


def write_snapshots(con: sqlite3.Connection, now: datetime) -> None:
    """One row per confirmed myth per day; later polls on the same day replace it."""
    current, previous = windows(data_end(con, now))
    posts = load_posts(con, previous["from"])
    with con:
        for myth in confirmed_myths(con):
            mine = inside(posts_of(myth, posts), current)
            views = lambda stance: sum(p["views"] for p in mine if p["stance"] == stance)  # noqa: E731
            con.execute(
                "INSERT OR REPLACE INTO snapshots VALUES (?, ?, ?, ?, ?, ?, ?)",
                (now.date().isoformat(), myth["id"], len(mine), sum(p["views"] for p in mine),
                 views("promotes"), views("debunks"), store.iso(now)),
            )
