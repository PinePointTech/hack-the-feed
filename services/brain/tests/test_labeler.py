"""Labeler, candidate myths and their endpoints with a stubbed model. No network."""

import asyncio
import json
import sqlite3
import time
from contextlib import closing
from datetime import timedelta

import httpx
from fastapi.testclient import TestClient

from app import brief, labeler, main, store
from test_poller import FakeOriane, T0, config, env, item, rows  # noqa: F401  (env is a fixture)

MODEL = "stub-model"


def settings(**changes):
    return config(openai_key="test-key", openai_model=MODEL, **changes)


def answers(health: float = 0.9, myth: str = labeler.NO_MYTH, stance: str = "promotes", dubious: float = 0.9,
            standalone: float = 0.9) -> dict:
    return {
        "health_claim": {"noul": health},
        "dubious": {"noul": dubious},
        "standalone_claim": {"noul": standalone},
        "myth": {"choice": myth, "probabilities": {myth: 1.0}},
        "stance": {"choice": stance, "probabilities": {**dict.fromkeys(labeler.STANCES, 0.0), stance: 0.8}},
    }


class FakeJudge:
    """Stands in for judge.Judge. `reply` maps (state, questions) to answers or an exception to raise."""

    def __init__(self, reply=lambda state, questions: answers()):
        self.reply = reply
        self.calls: list[tuple[dict, dict]] = []

    async def ask(self, state, questions, *, client=None):
        self.calls.append((json.loads(state), questions))
        result = self.reply(*self.calls[-1])
        if isinstance(result, Exception):
            raise result
        return result, "openai"


def seed(*posts: tuple[int, int | None, str]) -> None:
    """(n, views, matched_query) -> a stored post whose snippet is 'claim n'."""
    with closing(store.connect()) as con:
        store.upsert_posts(con, [
            {"oriane_id": f"cnt_{n}", "platform": "tiktok", "views": views, "snippet": f"claim {n}",
             "matched_query": query, "raw": {"caption": f"caption {n}"}}
            for n, views, query in posts
        ], store.iso(T0))


def label(fake: FakeJudge, now=T0, **changes) -> int:
    return asyncio.run(labeler.label_pending(None, settings(**changes), evaluator=fake, now=now))


def labels() -> list[tuple]:
    return rows("SELECT oriane_id, health_claim, myth_id, stance, confidence, model FROM labels ORDER BY oriane_id")


def test_only_posts_at_or_above_the_view_floor_are_labeled(env):
    seed((1, 10000, "q"), (2, 9999, "q"), (3, None, "q"), (4, 50000, "q"))
    fake = FakeJudge()
    assert label(fake) == 2
    assert [oriane_id for oriane_id, *_ in labels()] == ["cnt_1", "cnt_4"]
    assert label(fake, label_min_views=1) == 1  # cnt_2 once the floor is lowered; None still counts as 0
    assert len(rows("SELECT oriane_id FROM labels")) == 3


def test_label_fields_are_stored_and_reach_the_feed(env):
    seed((1, 20000, "mouth taping"))
    myth = "mouth-taping"
    label(FakeJudge(lambda state, questions: answers(myth=myth, stance="debunks")))
    assert labels() == [("cnt_1", 1, myth, "debunks", 0.8, MODEL)]
    with closing(store.connect()) as con:
        assert store.list_feed(con)[0]["label"] == {
            "health_claim": True, "myth_id": myth, "stance": "debunks", "confidence": 0.8, "model": MODEL,
        }
    assert rows("SELECT id FROM myths") == []  # a known myth makes no candidate


def test_the_judge_sees_the_claim_the_post_text_and_every_known_myth(env):
    seed((1, 20000, "sea moss"))
    fake = FakeJudge()
    label(fake)
    state, questions = fake.calls[0]
    assert state == {"claim_sentence": "claim 1", "matched_phrase": "sea moss", "post_text": "caption 1"}
    assert set(questions["myth"]["options"]) == {*brief.MYTHS, labeler.NO_MYTH}
    assert set(questions["stance"]["options"]) == {"promotes", "debunks", "ad", "unrelated"}


def test_unknown_claim_becomes_a_candidate_with_the_posts_own_sentence(env):
    seed((1, 20000, "sea moss"), (2, 30000, "sea moss"), (3, 40000, "castor oil pack"))
    label(FakeJudge())
    # Highest views first, so cnt_3 raised "castor-oil-pack" and cnt_2 raised "sea-moss".
    assert rows("SELECT id, title, claim, status, source_oriane_id, confirmed_at FROM myths ORDER BY id") == [
        ("castor-oil-pack", "castor oil pack", "claim 3", "candidate", "cnt_3", None),
        ("sea-moss", "sea moss", "claim 2", "candidate", "cnt_2", None),
    ]
    assert [(i, myth) for i, _, myth, *_ in labels()] == [
        ("cnt_1", "sea-moss"), ("cnt_2", "sea-moss"), ("cnt_3", "castor-oil-pack"),
    ]

    # A later post sees the candidate as an option and can match it instead of raising a new one.
    seed((4, 25000, "sea moss"))
    fake = FakeJudge(lambda state, questions: answers(myth="sea-moss"))
    label(fake, now=T0 + timedelta(minutes=1))
    assert "sea-moss" in fake.calls[0][1]["myth"]["options"]
    assert rows("SELECT COUNT(*) FROM myths") == [(2,)]
    assert rows("SELECT myth_id FROM labels WHERE oriane_id = 'cnt_4'") == [("sea-moss",)]


def test_a_supported_claim_is_labeled_but_never_becomes_a_candidate(env):
    seed((1, 20000, "lymphatic drainage"))
    label(FakeJudge(lambda state, questions: answers(dubious=0.1)))
    assert rows("SELECT id FROM myths") == []
    assert [(i, myth, stance) for i, _, myth, stance, *_ in labels()] == [("cnt_1", None, "promotes")]


def test_a_candidate_needs_a_promoting_standalone_claim_the_model_doubts(env):
    seed((1, 20000, "slogan"), (2, 20000, "debunk"), (3, 20000, "did you know"), (4, 20000, "borderline"))
    replies = {
        "claim 1": answers(standalone=0.0),  # a slogan or ingredient name is not a claim
        "claim 2": answers(stance="debunks"),  # a debunk never seeds
        "claim 3": answers(standalone=0.5),  # 'Did you know X does Y' reads as a claim, at the threshold
        "claim 4": answers(standalone=0.49),
    }
    label(FakeJudge(lambda state, questions: replies[state["claim_sentence"]]))
    assert rows("SELECT id, claim FROM myths") == [("did-you-know", "claim 3")]


def test_the_stance_question_checks_ad_first_and_standalone_claim_is_asked(env):
    asked = labeler.questions({})
    assert asked["stance"]["instructions"].startswith("Check ad first")
    assert "named brand product" in asked["stance"]["options"]["ad"]
    assert "Did you know" in asked["standalone_claim"]["instructions"]


def test_dubious_standalone_claim_and_prompt_version_are_stored_per_label(env):
    seed((1, 20000, "q"))
    label(FakeJudge(lambda state, questions: answers(dubious=0.7, standalone=0.2)))
    assert rows("SELECT dubious, standalone_claim, prompt_version FROM labels") == [(0.7, 0.2, labeler.PROMPT_VERSION)]


def test_an_existing_database_gains_the_new_label_columns_once(env, tmp_path):
    old = tmp_path / "old.db"
    legacy = sqlite3.connect(old)
    legacy.execute(
        "CREATE TABLE labels (oriane_id TEXT PRIMARY KEY, health_claim INTEGER NOT NULL, myth_id TEXT, "
        "stance TEXT NOT NULL, confidence REAL NOT NULL, model TEXT NOT NULL, labeled_at TEXT NOT NULL)"
    )
    legacy.execute("INSERT INTO labels VALUES ('cnt_old', 1, NULL, 'promotes', 0.9, 'm', 't')")
    legacy.commit()
    legacy.close()
    for _ in range(2):  # a second connect is a no-op
        with closing(store.connect(old)) as con:
            assert [tuple(r) for r in con.execute("SELECT oriane_id, dubious, standalone_claim, prompt_version FROM labels")] == [
                ("cnt_old", None, None, None),
            ]


def test_a_phrase_a_confirmed_myth_owns_never_becomes_a_candidate(env):
    with closing(store.connect()) as con, con:
        con.execute("INSERT INTO myths (id, title, claim, phrases) VALUES ('m1', 'T', 'C', '[\"Sea Moss\"]')")
    seed((1, 20000, "sea moss"))
    label(FakeJudge())
    assert rows("SELECT id FROM myths") == [("m1",)]
    assert [(i, myth) for i, _, myth, *_ in labels()] == [("cnt_1", None)]


def test_no_candidate_for_non_health_posts_ads_or_unrelated_stance(env):
    seed((1, 20000, "a"), (2, 20000, "b"), (3, 20000, "c"))
    replies = {"claim 1": answers(health=0.2), "claim 2": answers(stance="ad"), "claim 3": answers(stance="unrelated")}
    label(FakeJudge(lambda state, questions: replies[state["claim_sentence"]]))
    assert rows("SELECT id FROM myths") == []
    assert labels() == [
        ("cnt_1", 0, None, "unrelated", 0.8, MODEL),  # not a health claim: confidence is 1 - 0.2
        ("cnt_2", 1, None, "ad", 0.8, MODEL),
        ("cnt_3", 1, None, "unrelated", 0.8, MODEL),
    ]


def test_hourly_cap_counts_labels_from_the_last_hour(env):
    seed((1, 30000, "q"), (2, 20000, "q"), (3, 10000, "q"))
    fake = FakeJudge()
    assert label(fake, label_max_per_hour=2) == 2
    assert len(fake.calls) == 2
    assert label(fake, now=T0 + timedelta(minutes=30), label_max_per_hour=2) == 0
    assert len(fake.calls) == 2  # no model call once the cap is spent
    assert label(fake, now=T0 + timedelta(minutes=61), label_max_per_hour=2) == 1
    assert len(rows("SELECT oriane_id FROM labels")) == 3


def test_a_failed_call_leaves_the_post_unlabeled_for_the_next_poll(env):
    seed((1, 20000, "q"), (2, 20000, "q"))
    flaky = FakeJudge(lambda state, questions: httpx.ConnectError("down") if state["claim_sentence"] == "claim 2" else answers())
    assert label(flaky) == 1
    assert [oriane_id for oriane_id, *_ in labels()] == ["cnt_1"]
    assert label(FakeJudge(), now=T0 + timedelta(minutes=15)) == 1
    assert len(rows("SELECT oriane_id FROM labels")) == 2


def test_nothing_runs_without_a_model_key(env):
    seed((1, 20000, "q"))
    fake = FakeJudge()
    assert asyncio.run(labeler.label_pending(None, config(), evaluator=fake, now=T0)) == 0
    assert fake.calls == [] and labels() == []


def test_candidates_list_and_only_a_person_confirms(env):
    seed((1, 20000, "sea moss"), (2, 30000, "sea moss"), (3, 40000, "castor oil pack"))
    label(FakeJudge())
    with TestClient(main.create_app(config(oriane_key=""))) as client:
        listed = client.get("/myths/candidates").json()["candidates"]
        assert [(c["id"], c["post_count"], c["status"]) for c in listed] == [
            ("sea-moss", 2, "candidate"), ("castor-oil-pack", 1, "candidate"),
        ]
        assert set(listed[0]) == {
            "id", "title", "claim", "status", "source_oriane_id", "created_at", "confirmed_at", "post_count",
        }

        confirmed = client.post("/myths/sea-moss/confirm").json()
        assert (confirmed["id"], confirmed["status"], confirmed["claim"]) == ("sea-moss", "confirmed", "claim 2")
        assert confirmed["confirmed_at"] is not None
        assert client.post("/myths/sea-moss/confirm").json() == confirmed  # twice is a no-op
        assert [c["id"] for c in client.get("/myths/candidates").json()["candidates"]] == ["castor-oil-pack"]

        missing = client.post("/myths/nope/confirm")
        assert missing.status_code == 404 and missing.json()["error"]["code"] == "myth_not_found"
        assert client.get("/feed").json()["posts"][0]["label"]["myth_id"] in {"sea-moss", "castor-oil-pack"}

    # Labeling again never confirms or demotes anything.
    seed((4, 20000, "sea moss"))
    label(FakeJudge(), now=T0 + timedelta(minutes=1))
    assert rows("SELECT id, status FROM myths ORDER BY id") == [("castor-oil-pack", "candidate"), ("sea-moss", "confirmed")]


def test_confirm_needs_the_reviewer_token_when_one_is_set(env):
    seed((1, 20000, "sea moss"))
    label(FakeJudge())
    with TestClient(main.create_app(config(oriane_key="", review_token="s3cret"))) as client:
        for headers in ({}, {"X-Review-Token": "wrong"}):
            refused = client.post("/myths/sea-moss/confirm", headers=headers)
            assert refused.status_code == 401 and refused.json()["error"]["code"] == "review_token_required"
        assert rows("SELECT status FROM myths") == [("candidate",)]
        ok = client.post("/myths/sea-moss/confirm", headers={"X-Review-Token": "s3cret"})
        assert ok.status_code == 200 and ok.json()["status"] == "confirmed"


def test_a_poll_labels_new_posts_through_the_real_judge_without_blocking(env):
    def stub_model(request: httpx.Request) -> httpx.Response:
        asked = json.loads(json.loads(request.content)["messages"][1]["content"])["questions"]
        reply = {
            "health_claim": {"noul": 0.9},
            "dubious": {"noul": 0.9},
            "standalone_claim": {"noul": 0.9},
            "myth": {"choice": "none", "probabilities": {name: float(name == "none") for name in asked["myth"]["options"]}},
            "stance": {"choice": "promotes", "probabilities": {name: float(name == "promotes") for name in asked["stance"]["options"]}},
        }
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"answers": reply})}}]})

    oriane_fake = FakeOriane([item(1, views=20000), item(2, views=50)])

    def transport(request: httpx.Request) -> httpx.Response:
        return stub_model(request) if request.url.path.endswith("/chat/completions") else oriane_fake(request)

    app = main.create_app(settings(oriane_max_searches_per_hour=100), transport=httpx.MockTransport(transport))
    with TestClient(app) as client:
        deadline = time.monotonic() + 5
        while not (posts := {p["oriane_id"]: p for p in client.get("/feed").json()["posts"]}).get("cnt_1", {}).get("label") \
                and time.monotonic() < deadline:
            time.sleep(0.05)
        assert posts["cnt_1"]["label"] == {
            "health_claim": True, "myth_id": None, "stance": "promotes", "confidence": 1.0, "model": MODEL,
        }
        assert posts["cnt_2"]["label"] is None  # under the view floor
        # The seeded mouth-taping myth owns "mouth tape", so no duplicate candidate appears.
        assert client.get("/myths/candidates").json()["candidates"] == []
