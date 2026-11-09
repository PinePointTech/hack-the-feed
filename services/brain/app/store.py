"""SQLite store for polled posts, labels and poll history (stdlib sqlite3)."""

import json
import os
import sqlite3
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import oriane

SCHEMA = """
CREATE TABLE IF NOT EXISTS posts (
    oriane_id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    url TEXT,
    handle TEXT,
    display_name TEXT,
    thumbnail_url TEXT,
    views INTEGER,
    published_at TEXT,
    fetched_at TEXT NOT NULL,
    snippet TEXT NOT NULL,
    snippet_source TEXT,
    matched_query TEXT NOT NULL,
    raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_feed ON posts (fetched_at DESC, views DESC);
-- one row per change in a post's view count, so views per hour can be computed across polls
CREATE TABLE IF NOT EXISTS post_views (
    oriane_id TEXT NOT NULL REFERENCES posts (oriane_id),
    polled_at TEXT NOT NULL,
    views INTEGER NOT NULL,
    PRIMARY KEY (oriane_id, polled_at)
);
CREATE TABLE IF NOT EXISTS labels (
    oriane_id TEXT PRIMARY KEY REFERENCES posts (oriane_id),
    health_claim INTEGER NOT NULL,
    myth_id TEXT,
    stance TEXT NOT NULL,
    confidence REAL NOT NULL,
    model TEXT NOT NULL,
    labeled_at TEXT NOT NULL,
    dubious REAL,
    standalone_claim REAL,
    prompt_version TEXT
);
CREATE TABLE IF NOT EXISTS myths (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    claim TEXT NOT NULL,
    -- candidates come from the labeler; confirmed rows are seeded or approved by a person
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('candidate', 'confirmed')),
    topic TEXT NOT NULL DEFAULT '',
    harm_tier TEXT NOT NULL DEFAULT 'unproven',
    harm_reason TEXT NOT NULL DEFAULT '',
    phrases TEXT NOT NULL DEFAULT '[]',
    source_oriane_id TEXT REFERENCES posts (oriane_id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    confirmed_at TEXT
);
CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    searches INTEGER NOT NULL DEFAULT 0,
    new_posts INTEGER NOT NULL DEFAULT 0,
    error TEXT
);
CREATE TABLE IF NOT EXISTS snapshots (
    day TEXT NOT NULL,
    myth_id TEXT NOT NULL,
    topic_video_count INTEGER NOT NULL,
    topic_views INTEGER NOT NULL,
    promote_views INTEGER NOT NULL,
    debunk_views INTEGER NOT NULL,
    taken_at TEXT NOT NULL,
    PRIMARY KEY (day, myth_id)
);
"""

# Column order of a feed post, as in CONTRACT.md (label is added after these).
FEED_FIELDS = (
    "oriane_id", "platform", "url", "handle", "display_name", "thumbnail_url", "views",
    "published_at", "fetched_at", "snippet", "snippet_source", "matched_query",
)


def iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(value: str) -> datetime:
    moment = datetime.fromisoformat(value)
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def connect(path: str | Path | None = None) -> sqlite3.Connection:
    # MYBUSTER_DB lets tests and scratch runs use another file.
    path = Path(path or os.getenv("MYBUSTER_DB") or oriane.DATA_DIR / "mybuster.db")
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    con.executescript(SCHEMA)
    have = {row["name"] for row in con.execute("PRAGMA table_info(labels)")}
    for column, kind in (("dubious", "REAL"), ("standalone_claim", "REAL"), ("prompt_version", "TEXT")):
        if column not in have:
            with suppress(sqlite3.OperationalError):  # another connection added it first
                con.execute(f"ALTER TABLE labels ADD COLUMN {column} {kind}")
    return con


def upsert_posts(con: sqlite3.Connection, posts: list[dict], fetched_at: str) -> int:
    """Insert unseen posts and refresh counts on known ones. Returns how many were new.

    Each post is a dict with the FEED_FIELDS (minus fetched_at) plus `raw`, the Oriane item.
    """
    new = 0
    with con:
        for post in posts:
            row = {key: post.get(key) for key in FEED_FIELDS if key != "fetched_at"}
            row["fetched_at"] = fetched_at
            row["raw_json"] = json.dumps(post.get("raw"), ensure_ascii=False)
            last = con.execute(
                "SELECT views FROM post_views WHERE oriane_id = ? ORDER BY polled_at DESC LIMIT 1", (row["oriane_id"],),
            ).fetchone()
            known = con.execute("SELECT 1 FROM posts WHERE oriane_id = ?", (row["oriane_id"],)).fetchone()
            if not known:
                new += 1
                con.execute(
                    f"INSERT INTO posts ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})",
                    tuple(row.values()),
                )
            if row["views"] is not None and (last is None or last["views"] != row["views"]):
                con.execute("INSERT OR REPLACE INTO post_views VALUES (?, ?, ?)", (row["oriane_id"], fetched_at, row["views"]))
            if known:
                # Keep the first fetched_at, snippet and match so the feed does not reshuffle.
                con.execute(
                    "UPDATE posts SET views = ?, thumbnail_url = ?, url = ?, raw_json = ? WHERE oriane_id = ?",
                    (row["views"], row["thumbnail_url"], row["url"], row["raw_json"], row["oriane_id"]),
                )
    return new


def upsert_label(
    con: sqlite3.Connection, oriane_id: str, *, health_claim: bool, myth_id: str | None,
    stance: str, confidence: float, model: str, labeled_at: str,
    dubious: float | None = None, standalone_claim: float | None = None, prompt_version: str | None = None,
) -> None:
    with con:
        con.execute(
            "INSERT OR REPLACE INTO labels (oriane_id, health_claim, myth_id, stance, confidence, model, labeled_at, "
            "dubious, standalone_claim, prompt_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (oriane_id, int(health_claim), myth_id, stance, confidence, model, labeled_at,
             dubious, standalone_claim, prompt_version),
        )


RECENT = timedelta(hours=72)  # "new" is measured from the newest post Oriane has, not the wall clock (it lags days)
TOP_SLOTS, PER_HANDLE = 20, 2


def data_through(con: sqlite3.Connection) -> str | None:
    """The newest published_at stored: how far Oriane's search runs."""
    return con.execute("SELECT MAX(published_at) FROM posts").fetchone()[0]


def _when(value: str | None) -> datetime:
    return parse_iso(value) if value else datetime.min.replace(tzinfo=timezone.utc)


def _views_per_hour(con: sqlite3.Connection) -> dict[str, float]:
    points: dict[str, list[tuple[datetime, int]]] = {}
    for row in con.execute("SELECT oriane_id, polled_at, views FROM post_views ORDER BY polled_at"):
        points.setdefault(row["oriane_id"], []).append((parse_iso(row["polled_at"]), row["views"]))
    speed = {}
    for oriane_id, pts in points.items():
        hours = (pts[-1][0] - pts[0][0]).total_seconds() / 3600
        if len(pts) >= 2 and hours > 0:
            speed[oriane_id] = (pts[-1][1] - pts[0][1]) / hours
    return speed


def list_feed(con: sqlite3.Connection, *, since: str | None = None, limit: int = 50) -> list[dict]:
    """Posts within 72 h of the data end first (newest first), then by views gained per hour, then by views.

    A repeat of the same words from the same handle collapses to its newest post, a handle holds at most
    2 of the first 20 slots, and posts labeled unrelated come last.
    """
    rows = con.execute(
        "SELECT p.*, l.health_claim, l.myth_id, l.stance, l.confidence, l.model "
        "FROM posts p LEFT JOIN labels l ON l.oriane_id = p.oriane_id WHERE (? IS NULL OR p.fetched_at > ?)",
        (since, since),
    ).fetchall()
    end = data_through(con)
    cutoff = _when(end) - RECENT if end else None
    speed = _views_per_hour(con)

    newest: dict[tuple, sqlite3.Row] = {}
    for row in rows:
        # shortcut: posts with no handle never collapse, upgrade if Oriane returns handle-less duplicates
        key = (row["handle"], " ".join(row["snippet"].split()).casefold()) if row["handle"] else row["oriane_id"]
        age = lambda r: (_when(r["published_at"]), r["fetched_at"], r["oriane_id"])  # noqa: E731
        if key not in newest or age(row) > age(newest[key]):
            newest[key] = row

    def rank(row: sqlite3.Row) -> tuple:
        recent = cutoff is not None and row["published_at"] is not None and _when(row["published_at"]) >= cutoff
        if recent:
            tier, primary = 0, -_when(row["published_at"]).timestamp()
        elif row["oriane_id"] in speed:
            tier, primary = 1, -speed[row["oriane_id"]]
        else:
            tier, primary = 2, 0
        return (row["stance"] == "unrelated", tier, primary, -(row["views"] or 0), row["oriane_id"])

    ordered, rest, per_handle = [], [], {}
    for row in sorted(newest.values(), key=rank):
        if len(ordered) < TOP_SLOTS and not (row["handle"] and per_handle.get(row["handle"], 0) >= PER_HANDLE):
            per_handle[row["handle"]] = per_handle.get(row["handle"], 0) + 1
            ordered.append(row)
        else:
            rest.append(row)

    feed = []
    for row in (ordered + rest)[:limit]:
        post = {key: row[key] for key in FEED_FIELDS}
        post["label"] = None if row["stance"] is None else {
            "health_claim": bool(row["health_claim"]), "myth_id": row["myth_id"],
            "stance": row["stance"], "confidence": row["confidence"], "model": row["model"],
        }
        feed.append(post)
    return feed


def unlabeled_posts(con: sqlite3.Connection, limit: int = 100, min_views: int = 0) -> list[dict]:
    """Posts with no label yet, newest first, with at least min_views, or with no view count and
    interactions (raw interactionsCount, else likes + comments + shares) of at least min_views / 20.
    Rows include raw_json."""
    interactions = (
        "COALESCE(json_extract(p.raw_json, '$.interactionsCount'), COALESCE(json_extract(p.raw_json, '$.likesCount'), 0)"
        " + COALESCE(json_extract(p.raw_json, '$.commentsCount'), 0) + COALESCE(json_extract(p.raw_json, '$.sharesCount'), 0))"
    )
    rows = con.execute(
        "SELECT p.* FROM posts p WHERE NOT EXISTS (SELECT 1 FROM labels l WHERE l.oriane_id = p.oriane_id) "
        f"AND CASE WHEN p.views IS NULL THEN {interactions} * 20 >= ? ELSE p.views >= ? END "
        "ORDER BY p.fetched_at DESC, p.views DESC, p.oriane_id LIMIT ?",
        (min_views, min_views, limit),
    ).fetchall()
    return [dict(row) for row in rows]


def labeled_since(con: sqlite3.Connection, since: str) -> int:
    return con.execute("SELECT COUNT(*) FROM labels WHERE labeled_at > ?", (since,)).fetchone()[0]


def myth_claims(con: sqlite3.Connection) -> dict[str, str]:
    """Every myth in the table, candidate or confirmed, as id -> claim sentence."""
    return {row["id"]: row["claim"] for row in con.execute("SELECT id, claim FROM myths ORDER BY created_at, id")}


def add_candidate(
    con: sqlite3.Connection, myth_id: str, *, title: str, claim: str, source_oriane_id: str, created_at: str,
) -> None:
    """A proposed myth. An id that already exists keeps its row and status."""
    with con:
        con.execute(
            "INSERT OR IGNORE INTO myths (id, title, claim, status, source_oriane_id, created_at) "
            "VALUES (?, ?, ?, 'candidate', ?, ?)",
            (myth_id, title, claim, source_oriane_id, created_at),
        )


def list_candidates(con: sqlite3.Connection) -> list[dict]:
    rows = con.execute(
        "SELECT m.id, m.title, m.claim, m.status, m.source_oriane_id, m.created_at, m.confirmed_at, (SELECT COUNT(*) FROM labels l WHERE l.myth_id = m.id) AS post_count "
        "FROM myths m WHERE m.status = 'candidate' ORDER BY post_count DESC, m.created_at, m.id"
    ).fetchall()
    return [dict(row) for row in rows]


def confirm_myth(con: sqlite3.Connection, myth_id: str, confirmed_at: str) -> dict | None:
    """Promote a candidate. Only a person calls this. None if the id is unknown; confirming twice is a no-op."""
    with con:
        con.execute(
            "UPDATE myths SET status = 'confirmed', confirmed_at = ? WHERE id = ? AND status = 'candidate'",
            (confirmed_at, myth_id),
        )
    row = con.execute("SELECT id, title, claim, status, source_oriane_id, created_at, confirmed_at FROM myths WHERE id = ?", (myth_id,)).fetchone()
    return dict(row) if row else None


def start_poll(con: sqlite3.Connection, started_at: str) -> int:
    with con:
        return con.execute("INSERT INTO polls (started_at) VALUES (?)", (started_at,)).lastrowid


def charge_search(con: sqlite3.Connection, poll_id: int) -> None:
    """Count a search before it runs, so a crash mid-request still counts against the cap."""
    with con:
        con.execute("UPDATE polls SET searches = searches + 1 WHERE id = ?", (poll_id,))


def finish_poll(
    con: sqlite3.Connection, poll_id: int, finished_at: str, new_posts: int, error: str | None,
) -> None:
    with con:
        con.execute(
            "UPDATE polls SET finished_at = ?, new_posts = ?, error = ? WHERE id = ?",
            (finished_at, new_posts, error, poll_id),
        )


def last_poll_started(con: sqlite3.Connection) -> str | None:
    return con.execute("SELECT MAX(started_at) FROM polls").fetchone()[0]


def searches_since(con: sqlite3.Connection, since: str) -> int:
    return con.execute("SELECT COALESCE(SUM(searches), 0) FROM polls WHERE started_at > ?", (since,)).fetchone()[0]
