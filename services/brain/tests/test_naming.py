"""naming.check_pending on a stubbed model. No network."""

import asyncio
import json
from contextlib import closing

import httpx

from app import naming, store
from test_poller import T0, config, env  # noqa: F401  (env is a fixture)


def seed(n: int, views: int, followers: int = 0) -> None:
    raw = {"caption": f"post {n}", "profileFollowersCount": followers}
    with closing(store.connect()) as con:
        store.upsert_posts(con, [{"oriane_id": f"cnt_{n}", "platform": "tiktok", "views": views, "snippet": "s",
                                  "thumbnail_url": f"https://cdn.test/{n}.jpg", "snippet_source": "caption",
                                  "matched_query": "sea moss", "raw": raw}], store.iso(T0))
        store.upsert_label(con, f"cnt_{n}", health_claim=True, myth_id=None, stance="promotes", confidence=0.9,
                           model="m", labeled_at=store.iso(T0))


def run(answers: dict[str, dict | int]) -> list[tuple]:
    def model(request: httpx.Request) -> httpx.Response:
        content = json.loads(request.content)["messages"][1]["content"]
        assert content[1]["type"] == "image_url"  # the model sees the thumbnail
        answer = answers[json.loads(content[0]["text"])["post_text"]]
        if isinstance(answer, int):
            return httpx.Response(answer)
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(answer)}}]})

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(model)) as client:
            return await naming.check_pending(client, config(openai_key="k", openai_model="m"), now=T0)
    asyncio.run(go())
    with closing(store.connect()) as con:
        return [tuple(r) for r in con.execute("SELECT oriane_id, nameable, reason FROM naming_checks ORDER BY oriane_id")]


def test_only_posts_with_reach_that_clear_both_checks_are_nameable(env):
    seed(1, 200_000)
    seed(2, 150_000)
    seed(3, 120_000)
    seed(4, 5_000, followers=80_000)  # reach through followers
    seed(5, 5_000)  # no reach: never checked, never named
    seed(6, 300_000)
    ok = {"looks_under_18": False, "own_illness": False}
    assert run({
        "(caption) post 1": ok,
        "(caption) post 2": {"looks_under_18": True, "own_illness": False},
        "(caption) post 3": {"looks_under_18": False, "own_illness": True},
        "(caption) post 4": ok,
        "(caption) post 6": 500,  # a failure stays blurred
    }) == [("cnt_1", 1, "ok"), ("cnt_2", 0, "may be under 18"), ("cnt_3", 0, "own illness"),
           ("cnt_4", 1, "ok"), ("cnt_6", 0, "error")]
    with closing(store.connect()) as con:
        feed = {p["oriane_id"]: p["nameable"] for p in store.list_feed(con)}
    assert feed == {"cnt_1": True, "cnt_2": False, "cnt_3": False, "cnt_4": True, "cnt_5": False, "cnt_6": False}
