"""Labeler, candidate myths and their endpoints with a stubbed model. No network."""

import asyncio
import json
import sqlite3
import time
from contextlib import closing
from datetime import timedelta

import httpx
from fastapi.testclient import TestClient

from app import derived, brief, labeler, main, store
from test_poller import FakeOriane, T0, config, env, item, rows  # noqa: F401  (env is a fixture)

MODEL = "stub-model"


def settings(**changes):
    return config(openai_key="test-key", openai_model=MODEL, **changes)


STANCE_ANSWERS = {"promotes": ("endorses", 0.0), "debunks": ("disputes", 0.0), "ad": ("neither", 0.9), "unrelated": ("neither", 0.1)}


def answers(health: float = 0.9, myth: str = labeler.NO_MYTH, stance: str = "promotes", dubious: float = 0.9,
            standalone: float = 0.9, evidence: str | None = None, claim: str | None = None,
            commercial: float | None = None) -> dict:
    """The judge's answers. `stance` is shorthand for a claim_stance and commercial pair; `claim` and `commercial` override it."""
    claim_stance, sells = STANCE_ANSWERS[stance]
    claim_stance = claim or claim_stance
    return {
        **({"evidence": {"choice": evidence, "probabilities": {evidence: 1.0}}} if evidence else {}),
        "health_claim": {"noul": health},
        "dubious": {"noul": dubious},
        "standalone_claim": {"noul": standalone},
        "myth": {"choice": myth, "probabilities": {myth: 1.0}},
        "claim_stance": {"choice": claim_stance, "probabilities": {**dict.fromkeys(labeler.CLAIM_STANCES, 0.0), claim_stance: 0.8}},
        "commercial": {"noul": sells if commercial is None else commercial},
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
    """(n, views, matched_query) -> a stored post whose snippet is 'claim n', with a transcript and a caption."""
    seed_raw(*[(n, views, query, {"caption": f"caption {n}", "media": [{"type": "video", "transcript": f"transcript {n}"}]})
               for n, views, query in posts])


def seed_raw(*posts: tuple[int, int | None, str, dict]) -> None:
    with closing(store.connect()) as con:
        store.upsert_posts(con, [
            {"oriane_id": f"cnt_{n}", "platform": "tiktok", "views": views, "snippet": f"claim {n}",
             "matched_query": query, "raw": raw}
            for n, views, query, raw in posts
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
            "health_claim": True, "myth_id": myth, "stance": "debunks", "confidence": 0.8, "model": MODEL, "myth_confirmed": False, "flagged": False,
            "commercial": False, "basis": "transcript", "evidence": None,
        }
    assert rows("SELECT id FROM myths") == []  # a known myth makes no candidate


def test_the_judge_sees_the_claim_the_post_text_and_every_known_myth(env):
    seed((1, 20000, "sea moss"))
    fake = FakeJudge()
    label(fake)
    state, questions = fake.calls[0]
    assert state == {"claim_sentence": "claim 1", "matched_phrase": "sea moss", "post_text": "transcript 1 caption 1"}
    assert set(questions["myth"]["options"]) == {*brief.MYTHS, labeler.NO_MYTH}
    assert set(questions["claim_stance"]["options"]) == {"endorses", "disputes", "neither"}
    assert questions["commercial"]["type"] == "noul" and "stance" not in questions


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


def test_the_two_axes_are_asked_apart_and_the_myth_question_asks_what_the_creator_endorses_or_disputes():
    asked = labeler.questions({"m": "claim"})
    assert "own voice" in asked["claim_stance"]["instructions"] and "separate question" in asked["claim_stance"]["instructions"]
    assert "passing mention" in asked["claim_stance"]["options"]["neither"] and "joke" in asked["claim_stance"]["options"]["neither"]
    assert "sell or promote" in asked["commercial"]["instructions"] and "funnel" in asked["commercial"]["instructions"]
    assert "whether or not the post also states a health claim" in asked["commercial"]["instructions"]
    assert "endorse or dispute" in asked["myth"]["instructions"] and "restate" not in asked["myth"]["instructions"]
    assert "same kind of claim" in asked["myth"]["instructions"] and "Pick none if unsure" in asked["myth"]["instructions"]
    assert "Did you know" in asked["standalone_claim"]["instructions"] and "dubious" in asked


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
            assert [tuple(r) for r in con.execute(
                "SELECT oriane_id, dubious, standalone_claim, prompt_version, basis, evidence_quote, evidence_source, commercial FROM labels"
            )] == [("cnt_old", None, None, None, None, None, None, None)]
            assert "text_checked_at" in [r["name"] for r in con.execute("PRAGMA table_info(posts)")]


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
        ("cnt_1", 0, None, "promotes", 0.8, MODEL),  # a low health claim score no longer forces unrelated
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
            "total_views", "source_url", "source_thumbnail_url", "source_views", "source_platform",
        }

        confirmed = client.post("/myths/sea-moss/confirm").json()
        assert (confirmed["id"], confirmed["status"], confirmed["claim"]) == ("sea-moss", "confirmed", "claim 2")
        assert confirmed["confirmed_at"] is not None
        assert client.post("/myths/sea-moss/confirm").json() == confirmed  # twice is a no-op
        assert [c["id"] for c in client.get("/myths/candidates").json()["candidates"]] == ["castor-oil-pack"]

        missing = client.post("/myths/nope/confirm")
        assert missing.status_code == 404 and missing.json()["error"]["code"] == "myth_not_found"
        assert client.get("/feed").json()["posts"][0]["label"]["myth_id"] in {"sea-moss", "castor-oil-pack"}

        # A reviewer rewords a confirmed myth; a candidate cannot be reworded, and blank wording is refused.
        body = {"title": "Sea moss fixes your thyroid", "claim": "Sea moss gel boosts thyroid health and immunity."}
        assert client.post("/myths/sea-moss/wording", json=body).json() == {"id": "sea-moss", "harm_reason": "", **body}
        assert client.post("/myths/castor-oil-pack/wording", json=body).status_code == 404
        assert client.post("/myths/sea-moss/wording", json={"claim": "x"}).status_code == 422
    with closing(store.connect()) as con:
        # Its topic and search phrase stay the watchlist phrase it was found with, not the new title.
        sea = next(m for m in derived.confirmed_myths(con) if m["id"] == "sea-moss")
        assert (sea["topic"], sea["phrases"]) == ("sea moss", ["sea moss"])

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


def test_reject_deletes_a_candidate_and_frees_its_posts(env):
    seed((1, 20000, "sea moss"))
    label(FakeJudge())
    with TestClient(main.create_app(config(oriane_key="", review_token="s3cret"))) as client:
        assert client.post("/myths/sea-moss/reject").status_code == 401
        ok = client.post("/myths/sea-moss/reject", headers={"X-Review-Token": "s3cret"})
        assert ok.json() == {"id": "sea-moss", "rejected": True}
        assert client.post("/myths/sea-moss/reject", headers={"X-Review-Token": "s3cret"}).status_code == 404
    assert rows("SELECT id FROM myths") == [] and rows("SELECT myth_id FROM labels") == [(None,)]


def test_labels_from_an_older_prompt_are_relabeled_after_new_posts(env):
    seed((1, 20000, "q"), (2, 30000, "q"))
    with closing(store.connect()) as con:
        store.upsert_label(con, "cnt_2", health_claim=True, myth_id=None, stance="promotes", confidence=0.9,
                           model="old", labeled_at=store.iso(T0), prompt_version=None)
        assert [p["oriane_id"] for p in store.unlabeled_posts(con, 10, 0)] == ["cnt_1"]
        assert [p["oriane_id"] for p in store.unlabeled_posts(con, 10, 0, labeler.PROMPT_VERSION)] == ["cnt_1", "cnt_2"]
    fake = FakeJudge()
    assert label(fake, now=T0 + timedelta(hours=2)) == 2
    assert rows("SELECT DISTINCT prompt_version FROM labels") == [(labeler.PROMPT_VERSION,)]
    assert label(fake, now=T0 + timedelta(hours=4)) == 0  # current labels are not redone


def test_a_poll_labels_new_posts_through_the_real_judge_without_blocking(env):
    def stub_model(request: httpx.Request) -> httpx.Response:
        asked = json.loads(json.loads(request.content)["messages"][1]["content"])["questions"]
        reply = {
            "health_claim": {"noul": 0.9},
            "dubious": {"noul": 0.9},
            "standalone_claim": {"noul": 0.9},
            "myth": {"choice": "none", "probabilities": {name: float(name == "none") for name in asked["myth"]["options"]}},
            "claim_stance": {"choice": "endorses", "probabilities": {name: float(name == "endorses") for name in asked["claim_stance"]["options"]}},
            "commercial": {"noul": 0.1},
            **({"evidence": {"choice": "none", "probabilities": {name: float(name == "none") for name in asked["evidence"]["options"]}}}
               if "evidence" in asked else {}),
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
            "health_claim": True, "myth_id": None, "stance": "promotes", "confidence": 1.0, "model": MODEL, "myth_confirmed": False, "flagged": False,  # the stub picks no evidence sentence, so no flag
            "commercial": False, "basis": "text_only", "evidence": None,  # the stub judge picks none
        }
        assert posts["cnt_2"]["label"] is None  # under the view floor
        # The seeded mouth-taping myth owns "mouth tape", so no duplicate candidate appears.
        assert client.get("/myths/candidates").json()["candidates"] == []


RAW = {
    "caption": "Sea moss is great for you!",
    "media": [{"type": "video", "transcript": "Hi all. Sea moss cures every disease you have. Short one.\nWe take it daily for gut health",
               "onScreenText": ["Buy sea moss now today"]}],
}


def stored(n: int) -> dict:
    with closing(store.connect()) as con:
        return next(p for p in store.unlabeled_posts(con, 10, 0) if p["oriane_id"] == f"cnt_{n}")


def test_state_puts_the_transcript_first_then_caption_then_on_screen_and_keeps_6000_characters(env):
    seed_raw((1, 20000, "q", {"caption": "CAP", "media": [{"transcript": "TRANSCRIPT", "onScreenText": ["SCREEN"]}]}),
             (2, 20000, "q", {"media": [{"transcript": "T" * 7000}]}))
    assert json.loads(labeler.state_for(stored(1)))["post_text"] == "TRANSCRIPT CAP SCREEN"
    assert json.loads(labeler.state_for(stored(2)))["post_text"] == "T" * labeler.CONTEXT_MAX


def test_a_long_transcript_never_hides_the_caption(env):
    caption = "Link in bio. " * 20
    seed_raw((1, 20000, "q", {"caption": caption, "media": [{"transcript": "T" * 9000, "onScreenText": ["S" * 5000]}]}))
    text = json.loads(labeler.state_for(stored(1)))["post_text"]
    assert len(text) <= labeler.CONTEXT_MAX
    assert caption.strip() in text and text.count("S") == labeler.REST_MAX - len(caption) - 1  # on-screen fills the rest of REST_MAX
    assert text.startswith("T" * 100)


def test_a_long_transcript_is_cut_around_the_matched_phrase(env):
    transcript = "a" * 8000 + " mouth taping works " + "b" * 8000
    seed_raw((1, 20000, "mouth taping", {"media": [{"transcript": transcript}]}),
             (2, 20000, "absent phrase", {"media": [{"transcript": transcript}]}))
    near = json.loads(labeler.state_for(stored(1)))["post_text"]
    assert "mouth taping works" in near and len(near) == labeler.CONTEXT_MAX
    assert json.loads(labeler.state_for(stored(2)))["post_text"] == transcript[:labeler.CONTEXT_MAX]  # no hit: the start


def test_evidence_options_are_sentences_of_four_words_nearest_the_phrase_each_with_its_source(env):
    seed_raw((1, 20000, "sea moss", RAW))
    assert labeler.evidence_sentences(stored(1)) == [
        ("transcript", "Sea moss cures every disease you have."),
        ("caption", "Sea moss is great for you!"),
        ("on_screen", "Buy sea moss now today"),
        ("transcript", "We take it daily for gut health"),  # farther from the phrase, so after its hits
    ]
    asked = labeler.questions({}, labeler.evidence_sentences(stored(1)))["evidence"]
    assert asked["type"] == "choice"
    assert asked["options"] == {
        "s1": "(transcript) Sea moss cures every disease you have.", "s2": "(caption) Sea moss is great for you!",
        "s3": "(on_screen) Buy sea moss now today", "s4": "(transcript) We take it daily for gut health",
        "none": "No listed sentence shows it.",
    }
    assert "evidence" not in labeler.questions({}, [])  # no sentence, no question


def test_evidence_options_are_capped(env):
    seed_raw((1, 20000, "q", {"caption": " ".join(f"This is sentence number {i}." for i in range(labeler.EVIDENCE_OPTIONS + 5))}))
    assert len(labeler.evidence_sentences(stored(1))) == labeler.EVIDENCE_OPTIONS


def test_the_chosen_sentence_is_stored_with_its_source_and_basis_and_reaches_the_feed(env):
    seed_raw((1, 20000, "sea moss", RAW))
    label(FakeJudge(lambda state, questions: answers(evidence="s2")))
    assert rows("SELECT basis, evidence_quote, evidence_source FROM labels") == [("transcript", "Sea moss is great for you!", "caption")]
    with closing(store.connect()) as con:
        assert store.list_feed(con)[0]["label"]["evidence"] == {"quote": "Sea moss is great for you!", "source": "caption"}


def test_a_label_without_a_transcript_is_text_only_and_none_means_no_quote(env):
    seed_raw((1, 20000, "sea moss", {"caption": "Sea moss is great for you!"}))
    label(FakeJudge(lambda state, questions: answers(evidence="none")))
    assert rows("SELECT basis, evidence_quote, evidence_source FROM labels") == [("text_only", None, None)]


def test_an_unrelated_or_non_health_label_carries_no_quote(env):
    seed_raw((1, 20000, "sea moss", RAW), (2, 20000, "sea moss", RAW))
    replies = {"claim 1": answers(stance="unrelated", evidence="s1"), "claim 2": answers(health=0.1, evidence="s1")}
    label(FakeJudge(lambda state, questions: replies[state["claim_sentence"]]))
    assert rows("SELECT evidence_quote FROM labels") == [(None,), (None,)]


def test_a_quote_that_is_not_in_the_source_text_is_dropped(env):
    seed_raw((1, 20000, "sea moss", RAW))
    post = stored(1)
    assert labeler.evidence_of(post, [("caption", "Sea moss is great for you!")], {"evidence": {"choice": "s1"}}) == (
        "Sea moss is great for you!", "caption")
    assert labeler.evidence_of(post, [("caption", "Sea moss is awful for you!")], {"evidence": {"choice": "s1"}}) == (None, None)
    assert labeler.evidence_of(post, [("transcript", "Sea moss is great for you!")], {"evidence": {"choice": "s1"}}) == (None, None)


def test_a_candidate_needs_a_transcript_or_an_evidence_quote(env):
    seed_raw(
        (1, 20000, "caption only", {"caption": "Sea moss is great for you!"}),
        (2, 20000, "caption quote", {"caption": "Sea moss is great for you!"}),
        (3, 20000, "transcript only", RAW),
    )
    replies = {"claim 1": answers(), "claim 2": answers(evidence="s1"), "claim 3": answers()}
    label(FakeJudge(lambda state, questions: replies[state["claim_sentence"]]))
    assert rows("SELECT id FROM myths ORDER BY id") == [("caption-quote",), ("transcript-only",)]


def test_a_label_from_before_the_evidence_prompt_has_neither_field_in_the_feed(env):
    seed((1, 20000, "q"))
    with closing(store.connect()) as con:
        store.upsert_label(con, "cnt_1", health_claim=True, myth_id=None, stance="promotes", confidence=0.9,
                           model="old", labeled_at=store.iso(T0))
        assert "basis" not in store.list_feed(con)[0]["label"]
        assert "evidence" not in store.list_feed(con)[0]["label"]


def test_decide_maps_the_two_axes_to_the_stored_stance():
    stance = lambda claim, commercial: labeler.decide(answers(claim=claim, commercial=commercial))[2]  # noqa: E731
    assert stance("endorses", 0.0) == "promotes"
    assert stance("endorses", 0.95) == "promotes"  # a sold post that pushes the claim is still promotes
    assert stance("disputes", 0.95) == "debunks"
    assert stance("neither", 0.95) == "ad" and stance("neither", labeler.COMMERCIAL_MIN) == "ad"
    assert stance("neither", 0.49) == "unrelated"
    assert [labeler.stance_of(c, s) for c, s in (("endorses", True), ("disputes", False), ("neither", True), ("neither", False))] == [
        "promotes", "debunks", "ad", "unrelated"]


def test_a_low_health_claim_score_no_longer_forces_unrelated_and_neither_drops_the_myth():
    health, myth, stance, _ = labeler.decide(answers(health=0.1, myth="mouth-taping", stance="promotes"))
    assert (health, myth, stance) == (False, "mouth-taping", "promotes")
    assert labeler.decide(answers(health=0.1, myth="mouth-taping", stance="ad"))[1:3] == (None, "ad")  # no side taken, no myth
    assert labeler.decide(answers(myth="mouth-taping", stance="debunks"))[1] == "mouth-taping"


def test_confidence_is_the_claim_stance_probability_or_the_weaker_of_neither_and_the_commercial_call():
    assert labeler.decide(answers(stance="promotes"))[3] == 0.8
    assert labeler.decide(answers(claim="neither", commercial=0.7))[3] == 0.7
    assert labeler.decide(answers(claim="neither", commercial=0.1))[3] == 0.8  # not commercial: 1 - 0.1 = 0.9, capped by neither at 0.8
    assert labeler.decide(answers(claim="neither", commercial=0.4))[3] == 0.6


def test_commercial_is_stored_per_label_independently_of_the_stance(env):
    seed((1, 20000, "q"), (2, 20000, "q2"))
    replies = {"claim 1": answers(stance="promotes", commercial=0.9), "claim 2": answers(stance="debunks", commercial=0.2)}
    label(FakeJudge(lambda state, questions: replies[state["claim_sentence"]]))
    assert rows("SELECT oriane_id, stance, commercial FROM labels ORDER BY oriane_id") == [
        ("cnt_1", "promotes", 1), ("cnt_2", "debunks", 0)]


def test_a_label_from_before_the_two_axes_has_no_commercial_field_in_the_feed(env):
    seed((1, 20000, "q"))
    with closing(store.connect()) as con:
        store.upsert_label(con, "cnt_1", health_claim=True, myth_id=None, stance="promotes", confidence=0.9,
                           model="old", labeled_at=store.iso(T0))
        assert "commercial" not in store.list_feed(con)[0]["label"]
        store.upsert_label(con, "cnt_1", health_claim=True, myth_id=None, stance="ad", confidence=0.9,
                           model="m", labeled_at=store.iso(T0), commercial=True)
        assert store.list_feed(con)[0]["label"]["commercial"] is True


def test_a_sold_post_that_pushes_a_doubtful_claim_still_seeds_a_candidate(env):
    seed((1, 20000, "sold claim"), (2, 20000, "sold ad"))
    replies = {"claim 1": answers(stance="promotes", commercial=0.95), "claim 2": answers(stance="ad", commercial=0.95)}
    label(FakeJudge(lambda state, questions: replies[state["claim_sentence"]]))
    assert rows("SELECT id FROM myths") == [("sold-claim",)]  # the plain ad seeds nothing


def test_labels_from_the_previous_prompt_version_are_relabeled(env):
    seed((1, 20000, "q"))
    with closing(store.connect()) as con:
        store.upsert_label(con, "cnt_1", health_claim=True, myth_id=None, stance="promotes", confidence=0.9,
                           model="old", labeled_at=store.iso(T0), prompt_version="evidence-quote-1")
    assert labeler.PROMPT_VERSION != "evidence-quote-1"
    assert label(FakeJudge(), now=T0 + timedelta(hours=2)) == 1


def test_the_feed_flags_only_promoted_claims_judged_dubious(env):
    seed((1, 20000, "a"), (2, 20000, "b"), (3, 20000, "c"), (4, 20000, "d"), (5, 20000, "e"))
    with closing(store.connect()) as con:
        for n, stance, dubious, commercial, quote in ((1, "promotes", 0.9, True, "claim 1"), (2, "promotes", 0.2, False, "claim 2"),
                                                     (3, "debunks", 0.9, False, "claim 3"), (4, "promotes", 0.9, None, "claim 4"),
                                                     (5, "promotes", 0.9, True, None)):
            store.upsert_label(con, f"cnt_{n}", health_claim=True, myth_id=None, stance=stance, confidence=0.9,
                               model=MODEL, labeled_at=store.iso(T0), dubious=dubious, commercial=commercial,
                               basis="text_only", evidence_quote=quote, evidence_source="caption" if quote else None)
        labels = {p["oriane_id"]: p["label"] for p in store.list_feed(con)}
    assert [labels[f"cnt_{n}"].get("flagged") for n in (1, 2, 3, 5)] == [True, False, False, False]  # 5: no quote, no flag
    assert "flagged" not in labels["cnt_4"]  # a label from before the two axes carries no flag
