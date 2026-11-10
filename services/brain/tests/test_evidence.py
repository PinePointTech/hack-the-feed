"""Relevance gate in evidence.find, on a stubbed model and PubMed. No network."""

import asyncio
import json

import httpx

from app import evidence

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
