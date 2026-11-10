"""Strict correction check, its queue and the /corrections endpoint, on stubbed model, PubMed and pages. No network."""

import asyncio
import json
from contextlib import closing

import httpx
import pytest
from fastapi.testclient import TestClient

from app import corrections, labeler, main, store
from test_poller import T0, config, env  # noqa: F401  (env is a fixture)

QUOTE = "Lymphatic drainage does not remove toxins from your body."
STUDY = "Manual lymphatic drainage showed no effect on body weight or toxin levels in healthy adults."
PAGE = "<html><body><article><p>Lymphatic massage does not detox the body or remove toxins.</p></article></body></html>"
MAYO = "https://www.mayoclinic.org/healthy-lifestyle/lymph"
EFETCH = f"""<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>111</PMID><Article>
<Journal><Title>J Test</Title></Journal><ArticleTitle>MLD trial</ArticleTitle>
<Abstract><AbstractText>{STUDY}</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>"""


class Fake:
    """Answers the model, web search, PubMed and page fetches. `pick` and `relations` shape the model's answers."""

    def __init__(self, pick=None, relations=("supports", "supports"), cited=(MAYO,)):
        self.pick = {"source": "Transcript", "first": 0, "last": 0, "other_unsupported_claim": False, "pubmed_query": "mld toxins",
                     "web_query": "lymphatic drainage toxins", **(pick or {})}
        self.relations, self.cited, self.paths = relations, cited, []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.paths.append(request.url.path)
        if request.url.path.endswith("/chat/completions"):
            system = json.loads(request.content)["messages"][0]["content"]
            if system.startswith(corrections.PICK[:40]):
                answer = self.pick
            else:
                answer = {"findings": [{"source": i, "excerpt": 0, "relation": r} for i, r in enumerate(self.relations)]}
            return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(answer)}}]})
        if request.url.path.endswith("/responses"):
            notes = [{"type": "url_citation", "url": url + "?utm_source=openai", "title": "Lymph"} for url in self.cited]
            return httpx.Response(200, json={"output": [{"type": "message", "content": [{"annotations": notes}]}]})
        if request.url.path.endswith("esearch.fcgi"):
            return httpx.Response(200, json={"esearchresult": {"idlist": ["111"]}})
        if request.url.path.endswith("efetch.fcgi"):
            return httpx.Response(200, content=EFETCH.encode())
        return httpx.Response(200, text=PAGE)


def seed(n: int, *, stance="debunks", commercial=False, views=50_000, prompt=labeler.PROMPT_VERSION) -> None:
    raw = {"caption": "", "media": [{"transcript": f"{QUOTE} Book a massage if you like it."}]}
    with closing(store.connect()) as con:
        store.upsert_posts(con, [{"oriane_id": f"cnt_{n}", "platform": "tiktok", "views": views, "snippet": QUOTE,
                                  "snippet_source": "transcript", "matched_query": "lymphatic drainage", "raw": raw}],
                           store.iso(T0))
        store.upsert_label(con, f"cnt_{n}", health_claim=True, myth_id="lymphatic-detox", stance=stance, confidence=0.9,
                           model="m", labeled_at=store.iso(T0), prompt_version=prompt, commercial=commercial)


def run(fake: Fake) -> int:
    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as client:
            return await corrections.check_pending(client, config(openai_key="k", openai_model="m", label_min_views=1000), now=T0)
    return asyncio.run(go())


def saved() -> list[tuple]:
    with closing(store.connect()) as con:
        return [tuple(r) for r in con.execute("SELECT oriane_id, status, quote, reason FROM corrections ORDER BY oriane_id")]


def test_a_correction_backed_by_a_study_and_a_clinician_page_is_featured(env):
    seed(1)
    assert run(Fake()) == 1
    assert saved() == [("cnt_1", "verified", QUOTE, None)]
    with TestClient(main.create_app(config(oriane_key=""))) as api:
        body = api.get("/corrections", params={"myth_id": "lymphatic-detox"}).json()
    correction = body["posts"][0]["label"]["correction"]
    assert correction["quote"] == QUOTE
    assert [(f["publisher"], f["relation"]) for f in correction["findings"]] == [("J Test", "supports"), ("Mayo Clinic", "supports")]
    assert correction["findings"][1]["url"] == MAYO  # the tracking query is dropped
    assert correction["findings"][1]["excerpt"] in PAGE  # excerpts are exact text from the fetched page


@pytest.mark.parametrize("fake, reason", [
    (Fake(relations=("supports", "contradicts")), "a source contradicts it"),
    (Fake(relations=("qualifies", "supports")), "no published study backs it"),
    (Fake(relations=("supports", "qualifies")), "no clinician page backs it"),
    (Fake(cited=("https://example.com/lymph",)), "no clinician page backs it"),  # not a clinical publisher
    (Fake(pick={"source": None}), "no passage states a checkable correction"),
    (Fake(pick={"other_unsupported_claim": True}), "the post also pushes an unsupported claim"),
])
def test_anything_short_of_both_kinds_of_support_is_not_featured(env, fake, reason):
    seed(1)
    run(fake)
    assert saved()[0][1::2] == ("failed", reason)
    with closing(store.connect()) as con:
        assert "correction" not in store.list_feed(con)[0]["label"]


def test_only_unsold_corrections_from_the_current_prompt_are_checked_once(env):
    seed(1)
    seed(2, commercial=True)
    seed(3, stance="promotes")
    seed(4, prompt="older")
    seed(5, views=10)
    fake = Fake()
    assert run(fake) == 1
    assert [row[0] for row in saved()] == ["cnt_1"]
    assert run(fake) == 0  # already checked at this version


def test_a_quote_must_name_the_topic_and_may_join_adjacent_passages(env):
    with closing(store.connect()) as con:
        raw = {"caption": "Chemical sunscreen is toxic, they say. But there is no evidence that it harms people. A symptom is not a diagnosis.",
               "media": []}
        store.upsert_posts(con, [{"oriane_id": "cnt_1", "platform": "tiktok", "views": 50_000, "snippet": "x",
                                  "matched_query": "sunscreen is toxic", "raw": raw}], store.iso(T0))
        store.upsert_label(con, "cnt_1", health_claim=True, myth_id=None, stance="debunks", confidence=0.9, model="m",
                           labeled_at=store.iso(T0), prompt_version=labeler.PROMPT_VERSION, commercial=False)
    run(Fake(pick={"source": "Caption", "first": 2, "last": 2}))
    assert saved()[0][1:] == ("failed", "A symptom is not a diagnosis.", "the quote is too long or does not name the topic")
    with closing(store.connect()) as con:
        con.execute("DELETE FROM corrections")
        con.commit()
    run(Fake(pick={"source": "Caption", "first": 0, "last": 1}))
    assert saved()[0][1:3] == ("verified", "Chemical sunscreen is toxic, they say. But there is no evidence that it harms people.")


def test_a_failed_pick_makes_no_searches(env):
    seed(1)
    fake = Fake(pick={"source": None})
    run(fake)
    assert not any(path.endswith(("/responses", "esearch.fcgi")) for path in fake.paths)
