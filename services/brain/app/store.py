"""SQLite store for polled posts, labels and poll history (stdlib sqlite3)."""

import json
import os
import sqlite3
from datetime import datetime, timezone
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
CREATE TABLE IF NOT EXISTS labels (
    oriane_id TEXT PRIMARY KEY REFERENCES posts (oriane_id),
    health_claim INTEGER NOT NULL,
    myth_id TEXT,
    stance TEXT NOT NULL,
    confidence REAL NOT NULL,
    model TEXT NOT NULL,
    labeled_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    searches INTEGER NOT NULL DEFAULT 0,
    new_posts INTEGER NOT NULL DEFAULT 0,
    error TEXT
);
CREATE TABLE IF NOT EXISTS myths (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    claim TEXT NOT NULL,
    harm_tier TEXT NOT NULL,
    harm_reason TEXT NOT NULL,
    phrases TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed'
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
            if con.execute("SELECT 1 FROM posts WHERE oriane_id = ?", (row["oriane_id"],)).fetchone():
                # Keep the first fetched_at, snippet and match so the feed does not reshuffle.
                con.execute(
                    "UPDATE posts SET views = ?, thumbnail_url = ?, url = ?, raw_json = ? WHERE oriane_id = ?",
                    (row["views"], row["thumbnail_url"], row["url"], row["raw_json"], row["oriane_id"]),
                )
                continue
            con.execute(
                f"INSERT INTO posts ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})",
                tuple(row.values()),
            )
            new += 1
    return new


def upsert_label(
    con: sqlite3.Connection, oriane_id: str, *, health_claim: bool, myth_id: str | None,
    stance: str, confidence: float, model: str, labeled_at: str,
) -> None:
    with con:
        con.execute(
            "INSERT OR REPLACE INTO labels VALUES (?, ?, ?, ?, ?, ?, ?)",
            (oriane_id, int(health_claim), myth_id, stance, confidence, model, labeled_at),
        )


def list_feed(con: sqlite3.Connection, *, since: str | None = None, limit: int = 50) -> list[dict]:
    rows = con.execute(
        "SELECT p.*, l.health_claim, l.myth_id, l.stance, l.confidence, l.model "
        "FROM posts p LEFT JOIN labels l ON l.oriane_id = p.oriane_id "
        "WHERE (? IS NULL OR p.fetched_at > ?) "
        "ORDER BY p.fetched_at DESC, p.views DESC, p.oriane_id LIMIT ?",
        (since, since, limit),
    ).fetchall()
    feed = []
    for row in rows:
        post = {key: row[key] for key in FEED_FIELDS}
        post["label"] = None if row["stance"] is None else {
            "health_claim": bool(row["health_claim"]), "myth_id": row["myth_id"],
            "stance": row["stance"], "confidence": row["confidence"], "model": row["model"],
        }
        feed.append(post)
    return feed


def unlabeled_posts(con: sqlite3.Connection, limit: int = 100) -> list[dict]:
    """Posts with no label yet, newest first (T2 calls this). Rows include raw_json."""
    rows = con.execute(
        "SELECT p.* FROM posts p WHERE NOT EXISTS (SELECT 1 FROM labels l WHERE l.oriane_id = p.oriane_id) "
        "ORDER BY p.fetched_at DESC, p.views DESC, p.oriane_id LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(row) for row in rows]


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
