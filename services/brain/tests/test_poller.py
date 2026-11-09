"""Poller, store and /feed, /poll tests on a synthetic Oriane payload. No network."""

import asyncio
import json
import time
from contextlib import closing
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main, poller, store
from app.config import Settings

T0 = datetime(2026, 11, 8, 12, 0, tzinfo=timezone.utc)
PHRASES = ["mouth tape", "sea moss", "berberine", "castor oil pack"]
CAPTION = "Try mouth tape. Love sea moss! Berberine works. A castor oil pack helps."


def config(**changes) -> Settings:
    return Settings(**{
        "oriane_key": "test-key", "oriane_search_url": "http://oriane.test/search",
        "openai_key": "", "openai_model": "", "allowed_origins": [], **changes,
    })


def item(n: int, views: int = 1000, caption: str = CAPTION, transcript: str = "") -> dict:
    return {
        "id": f"cnt_{n}", "platform": "tiktok", "platformId": f"70{n}", "profileHandle": f"@user{n}",
        "profileDisplayName": f"User {n}", "viewsCount": views, "publishedAt": "2026-11-07T10:00:00Z",
        "thumbnailMediaUrl": f"https://img.test/{n}.jpg", "caption": caption,
        "media": [{"transcript": transcript, "onScreenText": []}],
    }


class FakeOriane:
    def __init__(self, items: list[dict]):
        self.items = items
        self.requests: list[tuple[dict, dict]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append((dict(request.url.params), json.loads(request.content)))
        return httpx.Response(200, json={"data": {"results": self.items}})


class PagedOriane(FakeOriane):
    """Serves the items by offset and limit, with the real pagination metadata."""

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append((dict(request.url.params), json.loads(request.content)))
        offset, limit = int(request.url.params["offset"]), int(request.url.params["limit"])
        return httpx.Response(200, json={
            "data": {"results": self.items[offset:offset + limit]},
            "metadata": {"pagination": {"offset": offset, "limit": limit, "totalCount": len(self.items)}},
        })


def poll(fake: FakeOriane, settings: Settings, now: datetime) -> tuple[bool, int]:
    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as client:
            return await poller.run_poll(client, settings, now=now)
    return asyncio.run(go())


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("MYBUSTER_DB", str(tmp_path / "test.db"))
    watchlist = tmp_path / "watchlist.json"
    watchlist.write_text(json.dumps({"phrases": PHRASES}))
    monkeypatch.setattr(poller, "WATCHLIST", watchlist)
    monkeypatch.setattr(poller, "PHRASES_PER_SEARCH", 1)  # four searches per poll


def rows(sql: str) -> list[tuple]:
    with closing(store.connect()) as con:
        return [tuple(row) for row in con.execute(sql)]


def test_query_asks_for_recent_posts_sorted_by_date_then_views(env):
    fake = FakeOriane([item(1)])
    poll(fake, config(), T0)
    params, body = fake.requests[0]
    assert params["sort"] == "publishedAt:desc,viewsCount:desc"
    assert body["filters"]["publishedAt"] == {"after": "2026-10-25"}  # two windows back
    assert body["filters"]["captionLanguage"] == {"includes": ["en"]}
    exact = body["queries"][0]["filters"]["transcript"]["includesExactly"]
    assert exact == {"operator": "or", "values": ["mouth tape"]}


def test_dedupe_by_oriane_id_within_and_across_polls(env):
    fake = FakeOriane([item(1, views=500), item(2, views=900), item(3, views=100)])
    assert poll(fake, config(oriane_max_searches_per_hour=100), T0) == (True, 3)
    assert len(fake.requests) == 4  # every search returned the same three posts
    assert rows("SELECT COUNT(*) FROM posts") == [(3,)]

    fake.items = [item(1, views=777), item(2, views=900), item(3, views=100), item(4, views=5)]
    assert poll(fake, config(oriane_max_searches_per_hour=100), T0 + timedelta(minutes=15)) == (True, 1)
    assert rows("SELECT COUNT(*) FROM posts") == [(4,)]
    # A known post keeps its first fetched_at and gets the fresh view count.
    assert rows("SELECT views, fetched_at FROM posts WHERE oriane_id = 'cnt_1'") == [(777, "2026-11-08T12:00:00Z")]


def test_interval_gate_blocks_a_poll_before_15_minutes(env):
    fake = FakeOriane([item(1)])
    settings = config(oriane_max_searches_per_hour=100)
    assert poll(fake, settings, T0)[0] is True
    calls = len(fake.requests)
    assert poll(fake, settings, T0 + timedelta(minutes=14, seconds=59)) == (False, 0)
    assert len(fake.requests) == calls
    assert poll(fake, settings, T0 + timedelta(minutes=15))[0] is True
    assert len(rows("SELECT id FROM polls")) == 2


def test_search_cap_counts_searches_in_the_last_hour(env):
    fake = FakeOriane([item(1)])
    settings = config(oriane_max_searches_per_hour=2)
    assert poll(fake, settings, T0)[0] is True
    assert len(fake.requests) == 2  # four searches wanted, two allowed
    assert rows("SELECT searches, error FROM polls") == [(2, "search cap reached after 2 searches, so some results were not fetched")]

    assert poll(fake, settings, T0 + timedelta(minutes=15))[0] is True
    assert len(fake.requests) == 2  # budget spent, no search made
    assert rows("SELECT searches FROM polls ORDER BY id") == [(2,), (0,)]

    assert poll(fake, settings, T0 + timedelta(minutes=61))[0] is True
    assert len(fake.requests) == 4  # the first poll left the hour window


def paged(monkeypatch, count: int, page_size: int = 2) -> PagedOriane:
    monkeypatch.setattr(poller, "PHRASES_PER_SEARCH", 4)  # one batch
    monkeypatch.setattr(poller, "RESULTS_PER_SEARCH", page_size)
    return PagedOriane([item(n) for n in range(count)])


def test_a_batch_pages_by_offset_until_the_total_count(env, monkeypatch):
    fake = paged(monkeypatch, 5)
    assert poll(fake, config(), T0) == (True, 5)
    assert [params["offset"] for params, _ in fake.requests] == ["0", "2", "4"]
    assert rows("SELECT searches, new_posts, error FROM polls") == [(3, 5, None)]  # every page is charged
    assert rows("SELECT COUNT(*) FROM posts") == [(5,)]


def test_a_batch_stops_at_the_page_cap_and_says_so(env, monkeypatch):
    fake = paged(monkeypatch, 5)
    monkeypatch.setattr(poller, "MAX_PAGES_PER_BATCH", 2)
    assert poll(fake, config(), T0) == (True, 4)
    assert len(fake.requests) == 2
    assert rows("SELECT error FROM polls") == [("1 of 1 searches have more than 2 pages, so older posts may be missing",)]


def test_a_full_last_page_at_the_page_cap_is_not_an_error(env, monkeypatch):
    fake = paged(monkeypatch, 4)
    monkeypatch.setattr(poller, "MAX_PAGES_PER_BATCH", 2)
    assert poll(fake, config(), T0) == (True, 4)
    assert rows("SELECT error FROM polls") == [(None,)]


def test_only_every_fourth_poll_pages_deep(env, monkeypatch):
    fake = paged(monkeypatch, 5)
    for i in range(5):
        poll(fake, config(oriane_max_searches_per_hour=100), T0 + timedelta(minutes=15 * i))
    assert rows("SELECT searches FROM polls ORDER BY id") == [(3,), (1,), (1,), (1,), (3,)]  # polls 1 and 5 page


def test_paging_stops_when_the_hourly_budget_runs_out(env, monkeypatch):
    fake = paged(monkeypatch, 5)
    assert poll(fake, config(oriane_max_searches_per_hour=2), T0) == (True, 4)
    assert rows("SELECT searches, error FROM polls") == [(2, "search cap reached after 2 searches, so some results were not fetched")]


def test_oriane_failure_is_recorded_and_still_gates_the_next_poll(env):
    def failing(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    async def go(now):
        async with httpx.AsyncClient(transport=httpx.MockTransport(failing)) as client:
            return await poller.run_poll(client, config(), now=now)

    assert asyncio.run(go(T0)) == (True, 0)
    assert rows("SELECT searches, new_posts, error FROM polls") == [(1, 0, "Oriane returned HTTP 503")]
    assert asyncio.run(go(T0 + timedelta(minutes=5))) == (False, 0)


def test_no_poll_without_an_oriane_key(env):
    fake = FakeOriane([item(1)])
    assert poll(fake, config(oriane_key=""), T0) == (False, 0)
    assert fake.requests == [] and rows("SELECT id FROM polls") == []


def test_snippet_is_an_exact_substring_from_the_first_matching_text():
    transcript = "First line. I tape my mouth every night because it fixes my jawline! Third line."
    post = {"caption": "Mouth taping is #1.", "media": [{"transcript": transcript, "onScreenText": ["TAPE MY MOUTH"]}]}
    snippet, source, phrase = poller.snippet_for(post, ["tape my mouth"])
    assert (snippet, source, phrase) == (
        "I tape my mouth every night because it fixes my jawline!", "transcript", "tape my mouth",
    )
    assert snippet in transcript
    assert poller.snippet_for(post, ["sea moss"]) is None
    only_screen = {"media": [{"onScreenText": ["Sea  Moss gel"]}]}
    assert poller.snippet_for(only_screen, ["sea moss"]) == ("Sea  Moss gel", "on_screen", "sea moss")


def test_posts_without_a_matching_snippet_are_not_stored(env):
    fake = FakeOriane([item(1, caption="Nothing relevant here."), item(2)])
    assert poll(fake, config(oriane_max_searches_per_hour=100), T0) == (True, 1)
    assert rows("SELECT oriane_id, matched_query, snippet_source FROM posts") == [("cnt_2", "mouth tape", "caption")]


def raw_post(n: int, views: int | None = None, *, handle: str | None = None, published: str | None = None,
             snippet: str | None = None) -> dict:
    return {"oriane_id": f"cnt_{n}", "platform": "tiktok", "views": views, "handle": handle, "published_at": published,
            "snippet": snippet or f"s{n}", "matched_query": "q", "raw": {}}


def label(con, n: int, stance: str) -> None:
    store.upsert_label(con, f"cnt_{n}", health_claim=True, myth_id=None, stance=stance, confidence=0.9,
                       model="test-model", labeled_at="2026-11-08T11:05:00Z")


def order(con, **kw) -> list[str]:
    return [p["oriane_id"] for p in store.list_feed(con, **kw)]


def test_feed_puts_posts_near_the_data_end_first_then_views_and_keeps_since_and_limit(env):
    with closing(store.connect()) as con:
        store.upsert_posts(con, [
            raw_post(1, 5000, published="2026-11-01T00:00:00Z"),
            raw_post(2, 10, published="2026-11-06T09:00:00Z"),
            raw_post(3, 1, published="2026-11-06T13:40:00Z"),
            raw_post(4, 99, published="2026-11-02T00:00:00Z"),
        ], "2026-11-08T10:00:00Z")
        store.upsert_posts(con, [raw_post(5, None)], "2026-11-08T11:00:00Z")
        # within 72 h of 2026-11-06T13:40 (newest first), then views, a missing count last
        assert order(con) == ["cnt_3", "cnt_2", "cnt_1", "cnt_4", "cnt_5"]
        assert order(con, limit=2) == ["cnt_3", "cnt_2"]
        assert order(con, since="2026-11-08T10:00:00Z") == ["cnt_5"]
        assert store.data_through(con) == "2026-11-06T13:40:00Z"

        assert store.list_feed(con)[0]["label"] is None
        store.upsert_label(con, "cnt_4", health_claim=True, myth_id="mouth-taping", stance="promotes",
                           confidence=0.9, model="test-model", labeled_at="2026-11-08T11:05:00Z")
        assert next(p for p in store.list_feed(con) if p["oriane_id"] == "cnt_4")["label"] == {
            "health_claim": True, "myth_id": "mouth-taping", "stance": "promotes",
            "confidence": 0.9, "model": "test-model",
        }
        assert "cnt_4" not in [p["oriane_id"] for p in store.unlabeled_posts(con)]
        assert len(store.unlabeled_posts(con)) == 4


def test_posts_without_views_qualify_for_labeling_on_interactions(env):
    def post(n: int, views: int | None, raw: dict) -> dict:
        return {"oriane_id": f"cnt_{n}", "platform": "tiktok", "views": views, "snippet": f"s{n}",
                "matched_query": "q", "raw": raw}

    with closing(store.connect()) as con:
        store.upsert_posts(con, [
            post(1, None, {"interactionsCount": 500}),  # 500 * 20 = 10000
            post(2, None, {"interactionsCount": 499}),
            post(3, None, {"likesCount": 400, "commentsCount": 80, "sharesCount": 20}),  # sum 500
            post(4, None, {"likesCount": 100}),
            post(5, None, {}),
            post(6, 9999, {"interactionsCount": 100000}),  # has views, so views decide
            post(7, 10000, {}),
        ], "2026-11-08T10:00:00Z")
        ids = [p["oriane_id"] for p in store.unlabeled_posts(con, 100, 10000)]
        assert sorted(ids) == ["cnt_1", "cnt_3", "cnt_7"]
        assert len(store.unlabeled_posts(con, 2, 10000)) == 2  # the hourly cap still applies


def test_post_views_are_written_only_when_the_count_changes_or_is_first_seen(env):
    with closing(store.connect()) as con:
        store.upsert_posts(con, [raw_post(1, 100), raw_post(2, None)], "2026-11-08T10:00:00Z")
        store.upsert_posts(con, [raw_post(1, 100), raw_post(2, 7)], "2026-11-08T10:15:00Z")
        store.upsert_posts(con, [raw_post(1, 160), raw_post(2, 7)], "2026-11-08T10:30:00Z")
        rows = con.execute("SELECT oriane_id, polled_at, views FROM post_views ORDER BY oriane_id, polled_at").fetchall()
        assert [tuple(r) for r in rows] == [
            ("cnt_1", "2026-11-08T10:00:00Z", 100), ("cnt_1", "2026-11-08T10:30:00Z", 160),
            ("cnt_2", "2026-11-08T10:15:00Z", 7),
        ]


def test_older_posts_rank_by_views_gained_per_hour_before_total_views(env):
    old = "2026-10-01T00:00:00Z"
    with closing(store.connect()) as con:
        store.upsert_posts(con, [raw_post(1, 9000, published=old), raw_post(2, 100, published=old),
                                 raw_post(3, 500, published=old),
                                 raw_post(9, 1, published="2026-11-06T00:00:00Z")], "2026-11-08T10:00:00Z")
        store.upsert_posts(con, [raw_post(1, 9000, published=old), raw_post(2, 1100, published=old)],
                           "2026-11-08T12:00:00Z")
        # cnt_9 is recent; cnt_2 gained 500 per hour; cnt_1 and cnt_3 have one point, so they follow by views
        assert order(con) == ["cnt_9", "cnt_2", "cnt_1", "cnt_3"]


def test_feed_collapses_repeats_caps_a_handle_and_puts_unrelated_last(env):
    with closing(store.connect()) as con:
        posts = [
            raw_post(1, 10, handle="a", published="2026-11-06T01:00:00Z", snippet="Sea  moss cures"),
            raw_post(2, 99, handle="a", published="2026-11-06T02:00:00Z", snippet="sea moss CURES"),  # newer repeat
            raw_post(3, 10, handle="b", published="2026-11-06T02:00:00Z", snippet="sea moss cures"),  # other handle
        ]
        # handle "a" has 4 more distinct posts, then 20 posts from other handles
        posts += [raw_post(10 + i, 10, handle="a", published=f"2026-11-06T0{3 + i}:00:00Z") for i in range(4)]
        posts += [raw_post(30 + i, 1, handle=f"h{i}", published="2026-11-01T00:00:00Z") for i in range(20)]
        posts.append(raw_post(99, 10**6, handle="z", published="2026-11-06T12:00:00Z"))
        store.upsert_posts(con, posts, "2026-11-08T10:00:00Z")
        label(con, 99, "unrelated")
        ids = order(con, limit=100)
        assert "cnt_1" not in ids and "cnt_2" in ids and "cnt_3" in ids
        assert ids[-1] == "cnt_99"
        first20 = store.list_feed(con, limit=20)
        assert sum(p["handle"] == "a" for p in first20) == 2
        assert len(ids) == 3 - 1 + 4 + 20 + 1 and len(set(ids)) == len(ids)  # the other "a" posts still follow


def test_feed_and_poll_endpoints_follow_the_contract(env):
    with TestClient(main.create_app(config(oriane_key=""))) as client:
        empty = client.get("/feed").json()
        assert set(empty) == {"generated_at", "last_poll_at", "next_poll_at", "data_through", "posts"}
        assert empty["posts"] == [] and empty["last_poll_at"] is None and empty["data_through"] is None
        assert client.post("/poll").json() == {
            "ran": False, "last_poll_at": None, "next_poll_at": None, "new_posts": 0,
        }
        for query in ("limit=0", "limit=101", "since=yesterday"):
            response = client.get(f"/feed?{query}")
            assert response.status_code == 422 and response.json()["error"]["code"] == "invalid_request"


def test_background_loop_polls_on_start_and_post_poll_respects_the_gate(env):
    fake = FakeOriane([item(1, views=42)])
    app = main.create_app(config(oriane_max_searches_per_hour=100), transport=httpx.MockTransport(fake))
    with TestClient(app) as client:
        deadline = time.monotonic() + 5
        while not (posts := client.get("/feed").json()["posts"]) and time.monotonic() < deadline:
            time.sleep(0.05)
        assert [p["oriane_id"] for p in posts] == ["cnt_1"]
        assert set(posts[0]) == {
            "oriane_id", "platform", "url", "handle", "display_name", "thumbnail_url", "views", "published_at",
            "fetched_at", "snippet", "snippet_source", "matched_query", "label",
        }
        assert posts[0]["url"] == "https://www.tiktok.com/@user1/video/701"
        calls = len(fake.requests)
        refreshed = client.post("/poll").json()
        assert refreshed["ran"] is False and refreshed["new_posts"] == 0
        assert refreshed["next_poll_at"] is not None and refreshed["last_poll_at"] is not None
        assert len(fake.requests) == calls


def test_impact_and_calendar_carry_a_pull_time(tmp_path, monkeypatch):
    monkeypatch.setenv("MYBUSTER_DB", str(tmp_path / "test.db"))
    with TestClient(main.create_app(config(oriane_key=""))) as client:
        for path in ("/calendar", "/radar"):
            pulled = client.get(path).json()["generated_at"]
            assert datetime.fromisoformat(pulled.replace("Z", "+00:00")) <= datetime.now(timezone.utc)

