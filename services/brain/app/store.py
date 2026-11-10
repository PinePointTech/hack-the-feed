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
    prompt_version TEXT,
    basis TEXT,
    evidence_quote TEXT,
    evidence_source TEXT,
    commercial INTEGER
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
-- one row per post labeled as a correction, from corrections.check_post; only verified rows are shown
CREATE TABLE IF NOT EXISTS corrections (
    oriane_id TEXT PRIMARY KEY REFERENCES posts (oriane_id),
    version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('verified', 'failed', 'error')),
    quote TEXT,
    quote_source TEXT,
    findings_json TEXT NOT NULL DEFAULT '[]',
    reason TEXT,
    checked_at TEXT NOT NULL
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
    for table, columns in (
        ("labels", (("dubious", "REAL"), ("standalone_claim", "REAL"), ("prompt_version", "TEXT"),
                    ("basis", "TEXT"), ("evidence_quote", "TEXT"), ("evidence_source", "TEXT"),
                    ("commercial", "INTEGER"))),
        ("posts", (("text_checked_at", "TEXT"),)),
    ):
        have = {row["name"] for row in con.execute(f"PRAGMA table_info({table})")}
        for column, kind in columns:
            if column not in have:
                with suppress(sqlite3.OperationalError):  # another connection added it first
                    con.execute(f"ALTER TABLE {table} ADD COLUMN {column} {kind}")
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
    basis: str | None = None, evidence_quote: str | None = None, evidence_source: str | None = None,
    commercial: bool | None = None,
) -> None:
    with con:
        con.execute(
            "INSERT OR REPLACE INTO labels (oriane_id, health_claim, myth_id, stance, confidence, model, labeled_at, "
            "dubious, standalone_claim, prompt_version, basis, evidence_quote, evidence_source, commercial) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (oriane_id, int(health_claim), myth_id, stance, confidence, model, labeled_at,
             dubious, standalone_claim, prompt_version, basis, evidence_quote, evidence_source,
             None if commercial is None else int(commercial)),
        )


DUBIOUS_MIN = 0.6  # labeler seeds candidates and the feed flags posts at this dubious score
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
        "SELECT p.*, l.health_claim, l.myth_id, l.stance, l.confidence, l.model, l.basis, l.evidence_quote, l.evidence_source, l.commercial, l.dubious, "
        "(SELECT m.status FROM myths m WHERE m.id = l.myth_id) AS myth_status, "
        "c.quote AS correction_quote, c.quote_source AS correction_source, c.findings_json AS correction_findings "
        "FROM posts p LEFT JOIN labels l ON l.oriane_id = p.oriane_id "
        "LEFT JOIN corrections c ON c.oriane_id = p.oriane_id AND c.status = 'verified' AND l.stance = 'debunks' "
        "WHERE (? IS NULL OR p.fetched_at > ?)",
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
            # Only a confirmed myth has a page; a candidate id must not become a link.
            "myth_confirmed": row["myth_status"] == "confirmed",
        }
        if post["label"] and row["commercial"] is not None:  # labels from before the two axes lack it
            post["label"]["commercial"] = bool(row["commercial"])
            # The bad content flag: the creator pushes a claim the model judges dubious, and a sentence from the
            # post shows it. No quote, no flag (CLAUDE.md rule 4).
            post["label"]["flagged"] = (row["stance"] == "promotes" and (row["dubious"] or 0) >= DUBIOUS_MIN
                                        and bool(row["evidence_quote"]))
        if post["label"] and row["basis"]:  # labels from before the evidence prompt carry neither field
            post["label"]["basis"] = row["basis"]
            post["label"]["evidence"] = (
                {"quote": row["evidence_quote"], "source": row["evidence_source"]} if row["evidence_quote"] else None
            )
        if post["label"] and row["correction_quote"]:  # a correction that passed corrections.check_post
            post["label"]["correction"] = {"quote": row["correction_quote"], "source": row["correction_source"],
                                           "findings": json.loads(row["correction_findings"])}
        feed.append(post)
    return feed


def unchecked_corrections(
    con: sqlite3.Connection, version: str, prompt_version: str, min_views: int, retry_before: str, limit: int,
) -> list[dict]:
    """Posts labeled as corrections by the current prompt, not sold, above the label floor, most viewed first,
    with no check at this version (an errored check is retried once it is older than retry_before). Rows include raw_json."""
    rows = con.execute(
        "SELECT p.* FROM posts p JOIN labels l ON l.oriane_id = p.oriane_id "
        "LEFT JOIN corrections c ON c.oriane_id = p.oriane_id "
        "WHERE l.stance = 'debunks' AND l.prompt_version = ? AND COALESCE(l.commercial, 0) = 0 "
        f"AND {_ABOVE_FLOOR} "
        "AND (c.oriane_id IS NULL OR c.version IS NOT ? OR (c.status = 'error' AND c.checked_at < ?)) "
        "ORDER BY p.views DESC, p.oriane_id LIMIT ?",
        (prompt_version, min_views, min_views, version, retry_before, limit),
    ).fetchall()
    return [dict(row) for row in rows]


def save_correction(
    con: sqlite3.Connection, oriane_id: str, version: str, checked_at: str, *,
    status: str, quote: str | None, quote_source: str | None, findings: list[dict], reason: str | None,
) -> None:
    with con:
        con.execute(
            "INSERT OR REPLACE INTO corrections (oriane_id, version, status, quote, quote_source, findings_json, reason, checked_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (oriane_id, version, status, quote, quote_source, json.dumps(findings), reason, checked_at),
        )


def corrections_checked_since(con: sqlite3.Connection, since: str) -> int:
    return con.execute("SELECT COUNT(*) FROM corrections WHERE checked_at >= ?", (since,)).fetchone()[0]


# The label floor: enough views, or with no view count, enough interactions (raw interactionsCount, else
# likes + comments + shares) at 20 per view. Takes min_views twice.
_INTERACTIONS = (
    "COALESCE(json_extract(p.raw_json, '$.interactionsCount'), COALESCE(json_extract(p.raw_json, '$.likesCount'), 0)"
    " + COALESCE(json_extract(p.raw_json, '$.commentsCount'), 0) + COALESCE(json_extract(p.raw_json, '$.sharesCount'), 0))"
)
_ABOVE_FLOOR = f"CASE WHEN p.views IS NULL THEN {_INTERACTIONS} * 20 >= ? ELSE p.views >= ? END"


def unlabeled_posts(
    con: sqlite3.Connection, limit: int = 100, min_views: int = 0, prompt_version: str | None = None,
) -> list[dict]:
    """Posts with no label yet (or, given prompt_version, a label from another prompt version; those come last), newest first, with at least min_views, or with no view count and
    interactions (raw interactionsCount, else likes + comments + shares) of at least min_views / 20.
    Rows include raw_json."""
    rows = con.execute(
        "SELECT p.* FROM posts p LEFT JOIN labels l ON l.oriane_id = p.oriane_id "
        "WHERE (l.oriane_id IS NULL OR (? IS NOT NULL AND l.prompt_version IS NOT ?)) "
        f"AND {_ABOVE_FLOOR} "
        "ORDER BY l.oriane_id IS NOT NULL, p.fetched_at DESC, p.views DESC, p.oriane_id LIMIT ?",
        (prompt_version, prompt_version, min_views, min_views, limit),
    ).fetchall()
    return [dict(row) for row in rows]


def posts_missing_transcripts(
    con: sqlite3.Connection, now: datetime, min_views: int, limit: int = 100,
) -> list[str]:
    """Ids of stored videos with no transcript text, published 2 to 60 days ago, at the label floor and not
    checked in the last 24 h, most viewed first. Oriane adds transcripts weeks after a post, so these are re-fetched."""
    rows = con.execute(
        "SELECT p.oriane_id FROM posts p WHERE p.published_at BETWEEN ? AND ? "
        "AND (p.text_checked_at IS NULL OR p.text_checked_at < ?) "
        "AND EXISTS (SELECT 1 FROM json_each(p.raw_json, '$.media') m WHERE json_extract(m.value, '$.type') = 'video') "
        "AND NOT EXISTS (SELECT 1 FROM json_each(p.raw_json, '$.media') m "
        "WHERE COALESCE(json_extract(m.value, '$.transcript'), '') <> '') "
        f"AND {_ABOVE_FLOOR} ORDER BY p.views DESC, p.oriane_id LIMIT ?",
        (iso(now - timedelta(days=60)), iso(now - timedelta(days=2)), iso(now - timedelta(hours=24)),
         min_views, min_views, limit),
    ).fetchall()
    return [row["oriane_id"] for row in rows]


def record_text_check(con: sqlite3.Connection, checked: list[str], with_transcript: list[str], at: str) -> None:
    """Stamp the posts just re-fetched; a post that gained a transcript loses its label's prompt version so it is labeled again."""
    with con:
        con.executemany("UPDATE posts SET text_checked_at = ? WHERE oriane_id = ?", [(at, i) for i in checked])
        con.executemany("UPDATE labels SET prompt_version = NULL WHERE oriane_id = ?", [(i,) for i in with_transcript])


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


def reject_candidate(con: sqlite3.Connection, myth_id: str) -> bool:
    """Delete a candidate a person rejected and free its posts for the phrase-based topic counts. False if no such candidate."""
    with con:
        if con.execute("DELETE FROM myths WHERE id = ? AND status = 'candidate'", (myth_id,)).rowcount == 0:
            return False
        con.execute("UPDATE labels SET myth_id = NULL WHERE myth_id = ?", (myth_id,))
    return True


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
