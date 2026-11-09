"""The label eval scorer and the committed gold set. The real Judge runs over a mock transport, so no network."""

import asyncio
import json

import httpx
import pytest

from app import labeler
from app.config import Settings
from scripts import eval_labels as ev
from scripts import split_gold

SETTINGS = Settings(oriane_key="", oriane_search_url="", openai_key="k", openai_model="m", allowed_origins=[])


def post(pid, snippet, *, transcript="", caption="", on_screen=()):
    return {"oriane_id": pid, "platform": "tiktok", "url": None, "matched_phrase": "berberine", "snippet": snippet,
            "caption": caption, "transcript": transcript, "on_screen_text": list(on_screen),
            "source": "test", "published_at": "2026-10-01T00:00:00.000Z"}


def gold(pid, claim, *, commercial="no", dubious="no", hc="yes", myth="none", quote=None, source=None, old="unrelated", alt=None,
         borderline=False, split="tune"):
    return {"oriane_id": pid, "health_claim": hc, "stance": old, "myth": myth, "evidence_quote": quote,
            "evidence_source": source, "note": f"note {pid}", "claim_stance": claim, "commercial": commercial,
            "dubious": dubious, "split": split, **({"alt_stance": alt} if alt else {}), **({"borderline": True} if borderline else {})}


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


MODEL = {  # snippet -> (health_claim, claim_stance, commercial, dubious, myth)
    "a": (0.9, "endorses", 0.9, 0.9, "none"), "b": (0.9, "neither", 0.1, 0.9, "mouth-taping"),
    "c": (0.9, "endorses", 0.1, 0.2, "none"), "d": (0.1, "neither", 0.9, 0.1, "none"),
}


def reply(snippet, name):
    health, claim, commercial, dubious, myth = MODEL[snippet]
    return {"health_claim": health, "claim_stance": claim, "commercial": commercial, "dubious": dubious, "myth": myth}.get(name, 0.5)


def four():
    return [
        item(post("cnt_a", "a", transcript="spoken words"), gold("cnt_a", "endorses", commercial="yes", dubious="yes", old="ad")),
        item(post("cnt_b", "b", transcript="spoken words"), gold("cnt_b", "endorses", dubious="yes", myth="mouth-taping", old="promotes")),
        item(post("cnt_c", "c", caption="written words"), gold("cnt_c", "endorses", dubious="no", old="ad", alt="promotes", borderline=True)),
        item(post("cnt_d", "d", caption="written words"), gold("cnt_d", "neither", commercial="yes", hc="no", old="ad")),
    ]


def run(items, max_calls=70, reply=reply, status=200):
    return asyncio.run(ev.run(items, SETTINGS, max_calls, transport(reply, status)))


def test_state_matches_what_the_poller_stores():
    p = post("cnt_a", "a", transcript="spoken", caption="written", on_screen=["on", "screen"])
    assert json.loads(labeler.state_for(ev.stored_post(p)))["post_text"] == "spoken written on screen"
    long = post("cnt_b", "b", transcript="x" * (labeler.CONTEXT_MAX + 500))
    assert len(json.loads(labeler.state_for(ev.stored_post(long)))["post_text"]) == labeler.CONTEXT_MAX


def test_agreement_flag_precision_recall_commercial_and_the_mapped_stance():
    rows, calls = run(four())
    result = ev.report(rows, calls)
    assert calls == 4 and result["scored"] == 4
    everything = result["all"]
    assert everything["health_claim"]["hits"] == 4 and everything["commercial"]["hits"] == 4 and everything["dubious"]["hits"] == 4
    assert everything["claim_stance"] == {"hits": 3, "n": 4, "rate": 0.75}  # b is read as neither
    assert everything["stance"]["hits"] == 3  # against the gold stance mapped from the two axes
    assert everything["stance_vs_old_gold"]["hits"] == 1 and everything["stance_vs_old_gold_lenient"]["hits"] == 2
    assert everything["myth"]["hits"] == 3
    assert (everything["myth_found"]["hits"], everything["myth_found"]["n"]) == (0, 1)  # the myth is dropped when no side is taken
    assert (everything["myth_false_alarms"]["hits"], everything["myth_false_alarms"]["n"]) == (0, 3)
    # flag: model endorses and dubious >= 0.6 is only post a; gold endorses with dubious yes is a and b
    assert (everything["bad_content_flag_precision"]["hits"], everything["bad_content_flag_precision"]["n"]) == (1, 1)
    assert (everything["bad_content_flag_recall"]["hits"], everything["bad_content_flag_recall"]["n"]) == (1, 2)
    assert (everything["endorses_only_precision"]["hits"], everything["endorses_only_precision"]["n"]) == (1, 2)  # c endorses a modest claim
    assert (everything["commercial_precision"]["hits"], everything["commercial_recall"]["hits"]) == (2, 2)
    assert result["confusion"]["promotes"] == {"promotes": 2, "debunks": 0, "ad": 0, "unrelated": 1}
    assert result["confusion"]["ad"]["ad"] == 1
    assert result["claim_stance_confusion"]["endorses"] == {"endorses": 2, "disputes": 0, "neither": 1}
    assert [(d["id"], d["field"]) for d in result["disagreements"]] == [
        ("cnt_b", "claim_stance"), ("cnt_b", "myth"), ("cnt_b", "stance")]
    assert (result["with_transcript"]["n"], result["without_transcript"]["n"], result["clear_posts"]["n"]) == (2, 2, 3)
    assert result["with_transcript"]["stance"]["hits"] == 1 and result["without_transcript"]["stance"]["hits"] == 2
    text = ev.render(result)
    assert "bad_content_flag_precision" in text and "claim_stance confusion" in text and "not borderline (n=3)" in text


def test_the_gold_stance_is_mapped_from_the_two_axes():
    mapped = lambda claim, commercial: ev.truth(gold("x", claim, commercial=commercial))["stance"]  # noqa: E731
    assert [mapped("endorses", "yes"), mapped("disputes", "no"), mapped("neither", "yes"), mapped("neither", "no")] == [
        "promotes", "debunks", "ad", "unrelated"]


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


def test_gold_quote_outside_the_context_window_is_flagged():
    far = "Filler sentence. " * (labeler.CONTEXT_MAX // 17 + 10) + "Late claim."
    near = item(post("cnt_a", "a", caption="Early claim."), gold("cnt_a", "endorses", quote="Early claim.", source="caption"))
    late = item(post("cnt_b", "b", caption=far), gold("cnt_b", "endorses", quote="Late claim.", source="caption"))
    rows, calls = run([near, late])
    assert [r["gold_quote_in_window"] for r in rows] == [True, False]
    assert ev.report(rows, calls)["all"]["gold_quote_in_window"]["hits"] == 1


def test_quote_matching_rules():
    texts = {"caption": "Intro words. Berberine melts fat. Buy it now.", "transcript": "Berberine melts fat."}
    g = {"evidence_quote": "Berberine melts fat.", "evidence_source": "caption"}
    assert ev.quote_matches("Berberine melts fat.", g, texts)
    assert ev.quote_matches("melts fat", g, texts)  # overlapping
    assert ev.quote_matches("Berberine", g, texts)  # same sentence
    assert not ev.quote_matches("Buy it now.", g, texts)  # another sentence
    assert not ev.quote_matches("Intro words.", g, texts)


CAPTION = "Intro words are here. Berberine melts fat fast. Buy it now please."
QUOTE = "Berberine melts fat fast."


def test_the_scorer_offers_the_evidence_sentences_like_label_pending_and_scores_the_chosen_quote():
    picks = {"a": "s1", "b": "s2", "c": "s3", "d": "none", "e": "s1", "f": "none"}
    asked, options = [], {}

    def answers(snippet, name):
        asked.append((snippet, name))
        if name == "evidence":
            return picks[snippet]
        return {"health_claim": 0.9, "claim_stance": "neither" if snippet == "e" else "endorses", "commercial": 0.1,
                "dubious": 0.9, "myth": "none"}.get(name, 0.5)

    items = [item(post(f"cnt_{s}", s, caption=CAPTION), gold(f"cnt_{s}", "endorses", quote=QUOTE, source="caption")) for s in "abcde"]
    items.append(item(post("cnt_f", "f", caption=CAPTION), gold("cnt_f", "endorses")))
    rows, calls = run(items, reply=answers)
    sentences = labeler.evidence_sentences(ev.stored_post(items[0]))
    assert [sentence for _, sentence in sentences] == [QUOTE, "Intro words are here.", "Buy it now please."]  # nearest the phrase first
    assert all((s, "evidence") in asked for s in "abcdef")  # every post was offered the evidence question
    assert [r["evidence"]["quote"] for r in rows] == [QUOTE, "Intro words are here.", "Buy it now please.", None, None, None]  # e is unrelated
    result = ev.report(rows, calls)["all"]
    assert (result["evidence_valid_quote"]["hits"], result["evidence_valid_quote"]["n"]) == (3, 3)
    assert (result["evidence_matches_gold"]["hits"], result["evidence_matches_gold"]["n"]) == (1, 5)
    assert (result["evidence_match_when_shown"]["hits"], result["evidence_match_when_shown"]["n"]) == (1, 3)
    assert (result["evidence_none_when_gold_none"]["hits"], result["evidence_none_when_gold_none"]["n"]) == (1, 1)


def test_a_post_with_no_sentence_of_four_words_is_not_asked_for_evidence():
    asked = set()

    def answers(snippet, name):
        asked.add(name)
        return reply(snippet, name)

    run(four()[:1], reply=answers)
    assert "evidence" not in asked and {"claim_stance", "commercial", "myth", "health_claim", "dubious"} <= asked


def test_committed_gold_set_is_consistent():
    items = ev.load()
    ids = [i["oriane_id"] for i in items]
    assert len(items) == 60 and len(set(ids)) == 60
    assert sum(bool(i["transcript"]) for i in items) >= 30
    for i in items:
        g = i["gold"]
        assert g["health_claim"] in {"yes", "no"} and g["stance"] in ev.STANCES and g["note"]
        assert g["claim_stance"] in ev.CLAIM_STANCES and g["commercial"] in {"yes", "no"} and g["dubious"] in {"yes", "no"}
        assert g["split"] in {"tune", "test"}
        assert g["myth"] in {"lymphatic-detox", "mouth-taping", "garlic-tumor", "none"}
        if g["myth"] != "none":
            assert g["claim_stance"] != "neither", i["oriane_id"]  # a myth is assigned only when the creator takes a side
        assert g.get("borderline", False) == bool(g.get("claim_note")), i["oriane_id"]
        assert i["snippet"] and i["matched_phrase"] and i["platform"] in {"tiktok", "instagram", "youtube"}
        if g["evidence_quote"]:
            assert g["evidence_quote"] in ev.sources_of(i)[g["evidence_source"]], i["oriane_id"]
        else:
            assert g["evidence_source"] is None
    assert {i["gold"]["stance"] for i in items} == set(ev.STANCES)
    assert {i["gold"]["claim_stance"] for i in items} == set(ev.CLAIM_STANCES)


def test_the_committed_split_is_30_and_30_balanced_by_stratum_and_reproducible_from_its_seed():
    items = ev.load()
    golds = [i["gold"] for i in items]
    side = [g["split"] for g in golds]
    assert side.count("tune") == side.count("test") == 30 and split_gold.balanced(side, golds)
    seed = next(n for n in range(10000) if split_gold.balanced(split_gold.assign(items, golds, n), golds))
    assert side == split_gold.assign(items, golds, seed)
    bad = lambda g: g["claim_stance"] == "endorses" and g["dubious"] == "yes"  # noqa: E731
    assert abs(sum(bad(g) for g in golds if g["split"] == "tune") - sum(bad(g) for g in golds if g["split"] == "test")) <= 1


def test_posts_with_the_same_caption_stay_in_one_split():
    posts = [post(f"cnt_{n}", "s", caption=caption) for n, caption in enumerate(
        ["Same words!", "same   words", "Other one", "Third", "Fourth", "Fifth", "Sixth", "Seventh"])]
    golds = [gold(p["oriane_id"], "endorses", dubious="yes") for p in posts]
    for seed in range(20):
        side = split_gold.assign(posts, golds, seed)
        assert side[0] == side[1]
        assert side == split_gold.assign(posts, golds, seed)  # seeded: same answer each time


def test_the_split_flag_scores_only_that_half(monkeypatch, capsys):
    seen = []

    async def fake(items, settings, max_calls, transport=None):
        seen.append([i["gold"]["split"] for i in items])
        return [], 0

    monkeypatch.setenv("OPENAI_API_KEY", "k")
    monkeypatch.setenv("OPENAI_MODEL", "m")
    monkeypatch.setattr(ev, "run", fake)
    assert ev.main(["--split", "test"]) == 0 and ev.main(["--split", "tune", "--limit", "5"]) == 0 and ev.main([]) == 0
    assert [(len(s), set(s)) for s in seen] == [(30, {"test"}), (5, {"tune"}), (60, {"tune", "test"})]


def test_main_needs_keys_and_documents_its_flags(monkeypatch, capsys):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    assert ev.main([]) == 2
    assert "OPENAI_API_KEY" in capsys.readouterr().err
    with pytest.raises(SystemExit):
        ev.main(["--help"])
    out = capsys.readouterr().out
    assert "--limit" in out and "--max-calls" in out and "--out" in out and "--split" in out
