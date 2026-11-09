"""The label eval scorer and the committed gold set. The real Judge runs over a mock transport, so no network."""

import asyncio
import json

import httpx
import pytest

from app import labeler
from app.config import Settings
from scripts import eval_labels as ev

SETTINGS = Settings(oriane_key="", oriane_search_url="", openai_key="k", openai_model="m", allowed_origins=[])


def post(pid, snippet, *, transcript="", caption="", on_screen=()):
    return {"oriane_id": pid, "platform": "tiktok", "url": None, "matched_phrase": "berberine", "snippet": snippet,
            "caption": caption, "transcript": transcript, "on_screen_text": list(on_screen),
            "source": "test", "published_at": "2026-10-01T00:00:00.000Z"}


def gold(pid, stance, *, hc="yes", myth="none", quote=None, source=None, alt=None):
    return {"oriane_id": pid, "health_claim": hc, "stance": stance, "myth": myth, "evidence_quote": quote,
            "evidence_source": source, "note": f"note {pid}", **({"alt_stance": alt} if alt else {})}


def item(p, g):
    return {**p, "gold": g}


def answer_for(question, pick):
    if question["type"] == "noul":
        return {"noul": pick}
    options = list(question["options"])
    return {"choice": pick, "probabilities": {o: 0.7 if o == pick else 0.3 / (len(options) - 1) for o in options}}


def transport(reply, status=200):
    """reply(snippet, question name) gives a noul probability or the picked option."""
    def handle(request):
        if status != 200:
            return httpx.Response(status)
        body = json.loads(json.loads(request.content)["messages"][1]["content"])
        snippet = json.loads(body["state"])["claim_sentence"]
        answers = {name: answer_for(q, reply(snippet, name)) for name, q in body["questions"].items()}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"answers": answers})}}]})
    return httpx.MockTransport(handle)


MODEL = {  # snippet -> (health_claim probability, stance, myth)
    "a": (0.9, "ad", "none"), "b": (0.9, "ad", "mouth-taping"), "c": (0.9, "promotes", "none"), "d": (0.1, "ad", "none"),
}


def reply(snippet, name):
    health, stance, myth = MODEL[snippet]
    return {"health_claim": health, "stance": stance, "myth": myth}.get(name, 0.5)


def four():
    return [
        item(post("cnt_a", "a", transcript="spoken words"), gold("cnt_a", "ad")),
        item(post("cnt_b", "b", transcript="spoken words"), gold("cnt_b", "promotes")),
        item(post("cnt_c", "c", caption="written words"), gold("cnt_c", "ad", alt="promotes")),
        item(post("cnt_d", "d", caption="written words"), gold("cnt_d", "unrelated", hc="no")),
    ]


def run(items, max_calls=70, reply=reply, status=200):
    return asyncio.run(ev.run(items, SETTINGS, max_calls, transport(reply, status)))


def test_state_matches_what_the_poller_stores():
    p = post("cnt_a", "a", transcript="spoken", caption="written", on_screen=["on", "screen"])
    assert json.loads(labeler.state_for(ev.stored_post(p)))["post_text"] == "spoken written on screen"
    long = post("cnt_b", "b", transcript="x" * 2000)
    assert len(json.loads(labeler.state_for(ev.stored_post(long)))["post_text"]) == labeler.CONTEXT_MAX


def test_agreement_confusion_ad_precision_recall_and_split():
    rows, calls = run(four())
    result = ev.report(rows, calls)
    assert calls == 4 and result["scored"] == 4
    assert result["all"]["health_claim"]["hits"] == 4
    assert result["all"]["stance"] == {"hits": 2, "n": 4, "rate": 0.5}
    assert result["all"]["stance_lenient"]["hits"] == 3  # post c has an accepted alternative
    assert result["all"]["myth"]["hits"] == 3
    assert (result["all"]["ad_precision"]["hits"], result["all"]["ad_precision"]["n"]) == (1, 2)
    assert (result["all"]["ad_recall"]["hits"], result["all"]["ad_recall"]["n"]) == (1, 2)
    assert result["confusion"]["ad"] == {"promotes": 1, "debunks": 0, "ad": 1, "unrelated": 0}
    assert result["confusion"]["promotes"]["ad"] == 1 and result["confusion"]["unrelated"]["unrelated"] == 1
    assert [(d["id"], d["field"]) for d in result["disagreements"]] == [
        ("cnt_b", "stance"), ("cnt_b", "myth"), ("cnt_c", "stance")]
    assert (result["with_transcript"]["n"], result["without_transcript"]["n"]) == (2, 2)
    assert result["with_transcript"]["stance"]["hits"] == 1 and result["without_transcript"]["stance"]["hits"] == 1
    assert "evidence_valid_quote" not in result["all"]  # the current labeler asks no evidence question
    text = ev.render(result)
    assert "cnt_b" in text and "stance confusion" in text and "with transcript (n=2)" in text


def test_call_budget_skips_instead_of_scoring_wrong():
    rows, calls = run(four(), max_calls=2)
    result = ev.report(rows, calls)
    assert calls == 2 and result["scored"] == 2
    assert [u["status"] for u in result["unscored"]] == ["skipped", "skipped"]


def test_a_failing_judge_is_an_error_not_a_disagreement():
    rows, calls = run(four()[:2], status=500)
    result = ev.report(rows, calls)
    assert result["scored"] == 0 and calls == 4  # one retry each
    assert {u["status"] for u in result["unscored"]} == {"error"}
    assert result["disagreements"] == [] and "n/a" in ev.render(result)


def test_gold_quote_outside_the_1500_char_window_is_flagged():
    far = "Filler sentence. " * 100 + "Late claim."
    near = item(post("cnt_a", "a", caption="Early claim."), gold("cnt_a", "ad", quote="Early claim.", source="caption"))
    late = item(post("cnt_b", "b", caption=far), gold("cnt_b", "ad", quote="Late claim.", source="caption"))
    rows, calls = run([near, late])
    assert [r["gold_quote_in_window"] for r in rows] == [True, False]
    assert ev.report(rows, calls)["all"]["gold_quote_in_1500_chars"]["hits"] == 1


def test_quote_matching_rules():
    texts = {"caption": "Intro words. Berberine melts fat. Buy it now.", "transcript": "Berberine melts fat."}
    g = {"evidence_quote": "Berberine melts fat.", "evidence_source": "caption"}
    assert ev.quote_matches("Berberine melts fat.", g, texts)
    assert ev.quote_matches("melts fat", g, texts)  # overlapping
    assert ev.quote_matches("Berberine", g, texts)  # same sentence
    assert not ev.quote_matches("Buy it now.", g, texts)  # another sentence
    assert not ev.quote_matches("Intro words.", g, texts)


def test_evidence_is_scored_only_when_the_labeler_asks_for_it(monkeypatch):
    caption = "Intro words. Berberine melts fat. Buy it now."
    quote = "Berberine melts fat."
    picks = {"a": quote, "b": "melts fat", "c": "Intro words.", "d": "never said", "e": "none", "f": "none"}
    ask = labeler.questions

    def with_evidence(myths):
        options = {"none": "no sentence", **{q: "sentence" for q in picks.values() if q != "none"}}
        return {**ask(myths), "evidence": {"type": "choice", "instructions": "Which sentence?", "options": options}}

    def answers(snippet, name):
        return picks[snippet] if name == "evidence" else {"health_claim": 0.9, "stance": "ad", "myth": "none"}.get(name, 0.5)

    monkeypatch.setattr(labeler, "questions", with_evidence)
    items = [item(post(f"cnt_{s}", s, caption=caption), gold(f"cnt_{s}", "ad", quote=quote, source="caption")) for s in "abcde"]
    items.append(item(post("cnt_f", "f", caption=caption), gold("cnt_f", "ad")))
    rows, calls = run(items, reply=answers)
    result = ev.report(rows, calls)["all"]
    assert result["evidence_valid_quote"]["hits"] == 3  # a, b and c are in the text; d is invented; e and f are none
    assert (result["evidence_matches_gold"]["hits"], result["evidence_matches_gold"]["n"]) == (2, 5)
    assert (result["evidence_none_when_gold_none"]["hits"], result["evidence_none_when_gold_none"]["n"]) == (1, 1)


def test_evidence_from_a_fifth_decide_item():
    assert ev.evidence_of({}, (True, None, "ad", 0.9, {"quote": "x", "source": "caption"})) == (True, "x")
    assert ev.evidence_of({}, (True, None, "ad", 0.9, None)) == (True, None)
    assert ev.evidence_of({}, (True, None, "ad", 0.9)) == (False, None)


def test_committed_gold_set_is_consistent():
    items = ev.load()
    ids = [i["oriane_id"] for i in items]
    assert len(items) == 60 and len(set(ids)) == 60
    assert sum(bool(i["transcript"]) for i in items) >= 30
    for i in items:
        g = i["gold"]
        assert g["health_claim"] in {"yes", "no"} and g["stance"] in ev.STANCES and g["note"]
        assert g["myth"] in {"lymphatic-detox", "mouth-taping", "garlic-tumor", "none"}
        assert i["snippet"] and i["matched_phrase"] and i["platform"] in {"tiktok", "instagram", "youtube"}
        if g["evidence_quote"]:
            assert g["evidence_quote"] in ev.sources_of(i)[g["evidence_source"]], i["oriane_id"]
        else:
            assert g["evidence_source"] is None
    assert {i["gold"]["stance"] for i in items} == set(ev.STANCES)


def test_main_needs_keys_and_documents_its_flags(monkeypatch, capsys):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    assert ev.main([]) == 2
    assert "OPENAI_API_KEY" in capsys.readouterr().err
    with pytest.raises(SystemExit):
        ev.main(["--help"])
    out = capsys.readouterr().out
    assert "--limit" in out and "--max-calls" in out and "--out" in out
