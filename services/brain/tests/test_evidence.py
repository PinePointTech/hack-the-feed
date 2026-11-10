"""Relevance gate in evidence.find, on a stubbed model and PubMed. No network."""

import asyncio
import json

import httpx

from app import corrections, evidence  # noqa: F401  (loaded before the tests patch httpx.AsyncClient)

ON_TOPIC = "Manual lymphatic drainage did not change body weight or toxin levels in healthy adults."
OFF_TOPIC = "Manual lymphatic drainage reduced arm volume in breast cancer-related lymphedema."
EFETCH = "<PubmedArticleSet>" + "".join(
    f"""<PubmedArticle><MedlineCitation><PMID>{pmid}</PMID><Article><Journal><Title>J Test</Title></Journal>
<ArticleTitle>{title}</ArticleTitle><Abstract><AbstractText>{text}</AbstractText></Abstract></Article>
</MedlineCitation></PubmedArticle>"""
    for pmid, title, text in (("111", "MLD and weight", ON_TOPIC), ("222", "MLD for lymphedema", OFF_TOPIC))
) + "</PubmedArticleSet>"


def handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("esearch.fcgi"):
        return httpx.Response(200, json={"esearchresult": {"idlist": ["111", "222"]}})
    if request.url.path.endswith("efetch.fcgi"):
        return httpx.Response(200, content=EFETCH.encode())
    sentences = json.loads(json.loads(request.content)["messages"][1]["content"])["sentences"]
    # The model picks a sentence from both, but flags the lymphedema study as not about the claimed effect.
    answer = {"addresses_claim": "lymphedema" not in sentences[0], "indices": [0]}
    return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(answer)}}]})


def test_find_drops_a_source_on_the_same_practice_but_a_different_effect(monkeypatch, tmp_path):
    monkeypatch.setattr(evidence, "DATA_DIR", tmp_path)
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    monkeypatch.setenv("OPENAI_MODEL", "m")
    real = httpx.AsyncClient
    monkeypatch.setattr(evidence.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))

    sources = asyncio.run(evidence.find(evidence.Myth("test-myth", "Lymphatic drainage removes toxins and causes weight loss.")))

    assert [(s.pmid, s.excerpts) for s in sources] == [("111", [ON_TOPIC])]
    assert json.loads((tmp_path / "test-myth.json").read_text())[0]["pmid"] == "111"


MAYO = "https://www.mayoclinic.org/sea-moss"
MAYO_TEXT = "Sea moss has not been shown to improve thyroid health, and too much iodine can harm the thyroid."


def test_a_myth_confirmed_from_review_searches_its_topic_and_clinician_pages(monkeypatch, tmp_path):
    monkeypatch.setattr(evidence, "DATA_DIR", tmp_path)
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    monkeypatch.setenv("OPENAI_MODEL", "m")
    monkeypatch.setenv("MYBUSTER_DB", str(tmp_path / "test.db"))
    terms = []

    def sea_moss(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("esearch.fcgi"):
            terms.append(request.url.params["term"])
            return httpx.Response(200, json={"esearchresult": {"idlist": []}})
        if request.url.path.endswith("/responses"):
            note = {"type": "url_citation", "url": MAYO + "?utm_source=openai", "title": "Sea moss"}
            return httpx.Response(200, json={"output": [{"type": "message", "content": [{"annotations": [note]}]}]})
        if request.url.host == "www.mayoclinic.org":
            return httpx.Response(200, text=f"<html><body><article><p>{MAYO_TEXT}</p></article></body></html>")
        answer = {"addresses_claim": True, "indices": [0]}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(answer)}}]})

    real = httpx.AsyncClient
    monkeypatch.setattr(evidence.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(sea_moss), **kw))
    from contextlib import closing

    from app import brief, store
    with closing(store.connect()) as con, con:
        con.execute("INSERT INTO myths (id, title, topic, claim, status) VALUES ('sea-moss', 'Sea moss fixes thyroid', "
                    "'sea moss', 'Sea moss gel supports thyroid health.', 'confirmed')")
        con.execute("INSERT INTO myths (id, title, claim, status) VALUES ('waiting', 'w', 'w claim', 'candidate')")
    assert brief.myth_for("waiting") is None  # only a confirmed myth gets a brief
    myth = brief.myth_for("sea-moss")

    sources = asyncio.run(evidence.find(myth))

    assert terms == ['"sea moss"']
    assert [(s.publisher, s.url, s.excerpts) for s in sources] == [("Mayo Clinic", MAYO, [MAYO_TEXT])]
