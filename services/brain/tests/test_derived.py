"""Radar, myth, impact, calendar and snapshot tests on synthetic rows. No network, no fixture numbers."""

import asyncio
import json
from contextlib import closing
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from app import derived, main, poller, store
from app.config import Settings

NOW = datetime(2026, 11, 8, 12, 0, tzinfo=timezone.utc)  # a Sunday: current window Nov 2 to Nov 8
MYTH_KEYS = {
    "id", "title", "topic", "claim", "harm_tier", "harm_reason", "trend", "window", "topic_video_count",
    "topic_views", "prev_window", "prev_topic_video_count", "prev_topic_views", "match_note", "data_source",
    "snapshot_at",
}


@pytest.fixture
def con(tmp_path, monkeypatch):
    monkeypatch.setenv("MYBUSTER_DB", str(tmp_path / "test.db"))
    with closing(store.connect()) as connection:
        yield connection


def add_myth(con, myth_id: str, *phrases: str) -> None:
    with con:
        con.execute(
            "INSERT INTO myths (id, title, topic, claim, harm_tier, harm_reason, phrases, status) VALUES (?, ?, ?, ?, 'false', 'because', ?, 'confirmed')",
            (myth_id, f"Title {myth_id}", f"topic {myth_id}", f"Claim {myth_id}", json.dumps(list(phrases))),
        )


def add_post(con, n: int, day: str, views: int, query: str = "mouth tape", *, stance: str | None = None,
             myth_id: str | None = "m1", source: str = "caption") -> str:
    oriane_id = f"cnt_{n}"
    store.upsert_posts(con, [{
        "oriane_id": oriane_id, "platform": "tiktok", "url": f"https://t.test/{n}", "handle": f"user{n}",
        "display_name": f"User {n}", "thumbnail_url": None, "views": views, "published_at": f"{day}T10:00:00Z",
        "snippet": f"quote {n}", "snippet_source": source, "matched_query": query,
        "raw": {"profileFollowersCount": 1234, "sharesCount": 7},
    }], "2026-11-08T11:00:00Z")
    if stance:
        store.upsert_label(con, oriane_id, health_claim=True, myth_id=myth_id, stance=stance,
                           confidence=0.8, model="test", labeled_at="2026-11-08T11:30:00Z")
    return oriane_id


def test_first_run_seeds_confirmed_myths_once_and_without_counts(con):
    seeds = [myth["id"] for myth in json.loads(derived.FIXTURE.read_bytes())["myths"]]
    radar = derived.radar(con, NOW)
    assert [m["id"] for m in radar["myths"]] == seeds and len(seeds) == 3
    for myth in radar["myths"]:
        assert myth["topic_video_count"] == myth["topic_views"] == myth["prev_topic_video_count"] == 0
        assert myth["trend"] == "unknown" and "top_video" not in myth and "trend_pct" not in myth
        assert myth["data_source"] == "oriane_live"
    derived.radar(con, NOW)
    assert con.execute("SELECT COUNT(*) FROM myths WHERE status = 'confirmed'").fetchone()[0] == 3


def test_radar_counts_windows_trend_and_top_promoter(con):
    add_myth(con, "m1", "mouth tape")
    add_myth(con, "m2", "sea moss")
    add_post(con, 1, "2026-11-03", 100, stance="debunks")
    add_post(con, 2, "2026-11-05", 5000, stance="promotes", source="on_screen")
    add_post(con, 3, "2026-11-08", 300)  # unlabeled: found with the myth's phrase
    add_post(con, 4, "2026-10-28", 10)
    add_post(con, 5, "2026-10-30", 20)  # previous window
    add_post(con, 6, "2026-10-01", 999)  # before both windows
    add_post(con, 7, "2026-11-06", 111, stance="unrelated")  # labeled away from the myth
    add_post(con, 8, "2026-11-06", 222, stance="promotes", myth_id=None)  # labeled, no myth: the phrase decides
    add_post(con, 9, "2026-11-06", 333, query="sea moss")

    radar = derived.radar(con, NOW)
    assert radar["window"] == {"from": "2026-11-02", "to": "2026-11-08"}
    m1, m2 = radar["myths"]
    assert MYTH_KEYS <= set(m1)
    assert m1["prev_window"] == {"from": "2026-10-26", "to": "2026-11-01"}
    assert (m1["topic_video_count"], m1["topic_views"]) == (4, 5622)
    assert (m1["prev_topic_video_count"], m1["prev_topic_views"]) == (2, 30)
    assert (m1["trend"], m1["trend_pct"]) == ("rising", 100)
    top = m1["top_video"]
    assert (top["oriane_id"], top["views"], top["stance"]) == ("cnt_2", 5000, "promotes")
    assert (top["quote"], top["quote_source"], top["followers"], top["shares"]) == ("quote 2", "on_screen_text", 1234, 7)
    assert top["nameable"] is False
    assert (m2["topic_video_count"], m2["topic_views"], m2["trend"]) == (1, 333, "unknown")
    assert "top_video" not in m2


def test_windows_end_on_the_newest_day_oriane_has_posts_for(con):
    add_myth(con, "m1", "mouth tape")
    add_post(con, 1, "2026-11-05", 10)  # Oriane lags: nothing newer than Nov 5 on Nov 8
    radar = derived.radar(con, NOW)
    assert radar["window"] == {"from": "2026-10-30", "to": "2026-11-05"}
    assert radar["myths"][0]["topic_video_count"] == 1


def test_windows_end_where_oriane_has_filled_the_days(con, monkeypatch):
    monkeypatch.setattr(derived, "INDEX_LAG_DAYS", 6)
    add_myth(con, "m1", "mouth tape")
    add_post(con, 1, "2026-11-08", 10)  # one early post must not pull the half-filled days into the window
    add_post(con, 2, "2026-11-01", 10)
    radar = derived.radar(con, NOW)
    assert radar["window"] == {"from": "2026-10-27", "to": "2026-11-02"}
    assert radar["myths"][0]["topic_video_count"] == 1


def test_a_candidate_label_leaves_the_post_with_the_myth_that_owns_its_phrase(con):
    add_myth(con, "m1", "mouth tape")
    add_post(con, 1, "2026-11-08", 10, stance="promotes", myth_id="mouth-tape-candidate")
    add_post(con, 2, "2026-11-08", 20, stance="promotes", myth_id="m2")  # assigned to another confirmed myth
    add_myth(con, "m2", "sea moss")
    m1, m2 = derived.radar(con, NOW)["myths"]
    assert (m1["topic_video_count"], m2["topic_video_count"]) == (1, 1)


def test_reach_and_stance_use_only_posts_a_label_assigns_to_the_myth(con):
    add_myth(con, "m1", "mouth tape")
    add_post(con, 1, "2026-11-03", 100, stance="promotes")
    add_post(con, 2, "2026-11-04", 9000, stance="promotes", myth_id=None)  # phrase match, label names no myth
    add_post(con, 3, "2026-11-05", 7000, stance="promotes", myth_id="other-candidate")
    add_post(con, 4, "2026-11-06", 500, stance="debunks", myth_id=None)
    add_post(con, 5, "2026-11-07", 40)  # unlabeled
    radar = derived.radar(con, NOW)["myths"][0]
    # Topic volume still counts every phrase match, so labeled-away posts and unlabeled ones both show.
    assert (radar["topic_video_count"], radar["topic_views"]) == (5, 16640)
    assert radar["top_video"]["oriane_id"] == "cnt_1"
    assert "Topic counts include" in radar["match_note"] and "assigns to this myth" in radar["match_note"]
    detail = derived.myth_detail(con, "m1", NOW)
    assert [v["oriane_id"] for v in detail["videos"]] == ["cnt_1"] and detail["counter_voices"] == []
    assert detail["stance_counts"] == {"promotes": 1} and detail["stance_sample_size"] == 1
    result = derived.impact(con, "m1", NOW)
    assert result["myth_reach"] == {"videos": 1, "views": 100}
    assert result["response_reach"] == {"videos": 0, "views": 0}
    assert "assigns to this myth" in result["note"] and "Topic counts on the radar" in result["note"]


def test_trend_is_cooling_or_steady_from_video_counts():
    assert derived.trend_of(1, 2) == ("cooling", -50)
    assert derived.trend_of(105, 100) == ("steady", 5)
    assert derived.trend_of(3, 0) == ("unknown", None)


def test_myth_detail_ranks_promoters_and_counter_voices(con):
    add_myth(con, "m1", "mouth tape")
    add_post(con, 1, "2026-11-03", 100, stance="promotes")
    add_post(con, 2, "2026-11-04", 900, stance="promotes")
    add_post(con, 3, "2026-11-05", 50, stance="debunks")
    add_post(con, 4, "2026-11-06", 70, stance="debunks")
    add_post(con, 5, "2026-11-07", 5)  # unlabeled
    detail = derived.myth_detail(con, "m1", NOW)
    assert [v["oriane_id"] for v in detail["videos"]] == ["cnt_2", "cnt_1"]
    assert [v["oriane_id"] for v in detail["counter_voices"]] == ["cnt_4", "cnt_3"]
    assert detail["stance_counts"] == {"promotes": 2, "debunks": 2}
    assert detail["stance_sample_size"] == 4 and detail["topic_video_count"] == 5
    assert derived.myth_detail(con, "nope", NOW) is None


def test_impact_is_pending_without_labels(con):
    add_myth(con, "m1", "mouth tape")
    add_post(con, 1, "2026-11-03", 100)
    result = derived.impact(con, "m1", NOW)
    assert set(result) == {"generated_at", "myth_id", "window", "myth_reach", "note"}
    assert result["myth_reach"] == {"videos": 0, "views": 0} and result["note"].startswith("Pending")
    assert derived.impact(con, "nope", NOW) is None


def test_impact_divides_debunk_views_by_promote_views(con):
    add_myth(con, "m1", "mouth tape")
    add_post(con, 1, "2026-11-03", 800, stance="promotes")
    add_post(con, 2, "2026-11-04", 200, stance="promotes")
    add_post(con, 3, "2026-11-05", 250, stance="debunks")
    add_post(con, 4, "2026-11-05", 999, stance="neutral")
    add_post(con, 5, "2026-10-20", 999, stance="promotes")  # outside the window
    result = derived.impact(con, "m1", NOW)
    assert result["myth_reach"] == {"videos": 2, "views": 1000}
    assert result["response_reach"] == {"videos": 1, "views": 250}
    assert result["response_ratio"] == 0.25
    assert "4 posts a label assigns to this myth" in result["note"]


def test_impact_has_no_ratio_when_nothing_promotes(con):
    add_myth(con, "m1", "mouth tape")
    add_post(con, 1, "2026-11-03", 80, stance="debunks")
    result = derived.impact(con, "m1", NOW)
    assert result["response_reach"] == {"videos": 1, "views": 80} and "response_ratio" not in result


def test_calendar_needs_a_weekly_rise_and_the_text_states_both_weekly_counts(con):
    for myth_id, phrase in (("rising", "mouth tape"), ("falling", "sea moss"), ("sparse", "berberine"), ("flat", "castor oil")):
        add_myth(con, myth_id, phrase)
    n = 0

    def posts(phrase, current, previous):
        nonlocal n
        for day, count in ((3, current), (28, previous)):  # Nov 3 is this week, Oct 28 the week before
            for _ in range(count):
                n += 1
                add_post(con, n, "2026-11-03" if day == 3 else "2026-10-28", 10, phrase, myth_id=None)

    posts("mouth tape", 12, 4)  # +200%
    posts("sea moss", 8, 20)  # cooling
    posts("berberine", 2, 1)  # rising by percent, but under MIN_RISING_POSTS
    posts("castor oil", 5, 5)  # steady
    add_post(con, 999, "2026-11-08", 1, "unwatched")  # Oriane's newest day, so the windows end on Nov 8

    calendar = derived.calendar(con, NOW)
    assert calendar["week_of"] == "2026-11-09"
    assert [item["myth_id"] for item in calendar["this_week"]] == ["rising"]
    item = calendar["this_week"][0]
    assert item["window"] == "Nov 9 to Nov 15, 2026" and item["basis"] == "oriane_trend"
    assert item["video_count"] == 12 and item["script_available"] is False and item["trend"] == "rising"
    assert item["why"] == (
        "Posts rose week over week: 4 posts from 2026-10-26 through 2026-11-01, 12 from 2026-11-02 through 2026-11-08."
    )
    assert [i["myth_id"] for i in calendar["watchlist"]] == ["falling", "sparse", "flat"]
    falling, sparse, flat = calendar["watchlist"]
    assert falling["trend"] == "cooling" and falling["why"].startswith("Not rising week over week: 20 posts")
    assert "8 from 2026-11-02" in falling["why"]
    # The badge and the text agree: a Rising badge on the watchlist says why it is still watched.
    assert sparse["trend"] == "rising" and "under the 3 needed" in sparse["why"] and "1 posts" in sparse["why"]
    assert flat["trend"] == "steady" and flat["why"].startswith("Not rising week over week")
    assert all("not rising" not in i["why"].lower().replace("not rising week over week", "") for i in calendar["watchlist"])


def test_snapshots_write_one_row_per_myth_per_day(con):
    add_myth(con, "m1", "mouth tape")
    add_myth(con, "m2", "sea moss")
    add_post(con, 1, "2026-11-07", 400, stance="promotes")
    derived.write_snapshots(con, NOW)
    add_post(con, 2, "2026-11-08", 100, stance="debunks")
    derived.write_snapshots(con, NOW + timedelta(hours=1))  # same day: replaces
    derived.write_snapshots(con, NOW + timedelta(days=1))  # next day: new rows
    rows = [tuple(r) for r in con.execute("SELECT * FROM snapshots ORDER BY day, myth_id")]
    assert [(r[0], r[1]) for r in rows] == [
        ("2026-11-08", "m1"), ("2026-11-08", "m2"), ("2026-11-09", "m1"), ("2026-11-09", "m2"),
    ]
    assert rows[0][2:] == (2, 500, 400, 100, "2026-11-08T13:00:00Z")
    assert rows[1][2:6] == (0, 0, 0, 0)


def test_a_poll_writes_the_days_snapshot(con, tmp_path, monkeypatch):
    add_myth(con, "m1", "mouth tape")
    watchlist = tmp_path / "watchlist.json"
    watchlist.write_text(json.dumps({"phrases": ["mouth tape"]}))
    monkeypatch.setattr(poller, "WATCHLIST", watchlist)
    found = {"id": "cnt_1", "platform": "tiktok", "platformId": "1", "profileHandle": "@a", "viewsCount": 50,
             "publishedAt": "2026-11-08T10:00:00Z", "caption": "I use mouth tape.", "media": []}
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"data": {"results": [found]}}))
    settings = Settings(oriane_key="k", oriane_search_url="http://oriane.test/search", openai_key="",
                        openai_model="", allowed_origins=[])

    async def go():
        async with httpx.AsyncClient(transport=transport) as client:
            return await poller.run_poll(client, settings, now=NOW)

    assert asyncio.run(go()) == (True, 1)
    assert [tuple(r) for r in con.execute("SELECT day, myth_id, topic_video_count, topic_views FROM snapshots")] == [
        ("2026-11-08", "m1", 1, 50),
    ]


def test_endpoints_serve_the_derived_shapes(con):
    add_myth(con, "m1", "mouth tape")
    today = datetime.now(timezone.utc).date().isoformat()
    add_post(con, 1, today, 700, stance="promotes")
    add_post(con, 2, today, 70, stance="debunks")
    settings = Settings(oriane_key="", oriane_search_url="", openai_key="", openai_model="", allowed_origins=[])
    with TestClient(main.create_app(settings)) as client:
        radar = client.get("/radar").json()
        assert set(radar) == {"generated_at", "window", "myths"} and radar["myths"][0]["id"] == "m1"
        assert client.get("/radar?refresh=1").json()["myths"][0]["topic_views"] == 770
        assert client.get("/myths/m1").json()["counter_voices"][0]["oriane_id"] == "cnt_2"
        assert client.get("/impact/m1").json()["response_ratio"] == 0.1
        assert set(client.get("/calendar").json()) == {"generated_at", "week_of", "this_week", "watchlist"}
        for path in ("/myths/nope", "/impact/nope"):
            response = client.get(path)
            assert response.status_code == 404 and response.json()["error"]["code"] == "myth_not_found"
