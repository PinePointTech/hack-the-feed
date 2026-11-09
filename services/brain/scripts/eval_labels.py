"""Score the live labeler against the hand-labeled gold set in data/eval.

    cd services/brain && uv run python scripts/eval_labels.py [--split tune|test] [--limit N] [--max-calls 70] [--out results.json]

Reads OPENAI_API_KEY and OPENAI_MODEL (and OPENAI_BASE_URL) from the environment. Each post goes through exactly what
labeler.label_pending does: labeler.state_for, labeler.questions with the post's evidence sentences, judge.Judge,
labeler.decide and labeler.quote_for. Every HTTP request, retries included, counts against --max-calls; posts not
reached are reported as skipped, not as wrong.

Headline: "bad content flag", a post the model reads as endorsing a claim it also finds dubious (the seeding rule in
label_pending), scored against gold posts that endorse a claim with dubious yes. "endorses only" drops the dubious
test, as a plain reading of claim_stance would. Gold stance for the mapped-stance rows comes from the gold claim_stance
and commercial through labeler.stance_of; "vs old gold" scores against the original ad-first stance and its alt_stance.
"""

import argparse
import asyncio
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402

from app import brief, judge, labeler  # noqa: E402
from app.config import Settings  # noqa: E402
from app.oriane import DATA_DIR  # noqa: E402

EVAL_DIR = DATA_DIR / "eval"
STANCES = ["promotes", "debunks", "ad", "unrelated"]
CLAIM_STANCES = list(labeler.CLAIM_STANCES)
FIELDS = ("health_claim", "claim_stance", "commercial", "myth", "stance")


class BudgetExceeded(RuntimeError):
    pass


class CountingClient(httpx.AsyncClient):
    """Refuses to send once max_calls requests have gone out."""

    def __init__(self, max_calls: int, **kwargs) -> None:
        super().__init__(**kwargs)
        self.calls, self.max_calls = 0, max_calls

    async def post(self, *args, **kwargs):
        if self.calls >= self.max_calls:
            raise BudgetExceeded("call budget used up")
        self.calls += 1
        return await super().post(*args, **kwargs)


def load(posts_path: Path = EVAL_DIR / "posts.jsonl", gold_path: Path = EVAL_DIR / "gold.jsonl") -> list[dict]:
    # split on "\n" only: splitlines() would also cut at a raw U+2028 inside a post's text
    gold = {row["oriane_id"]: row for row in map(json.loads, filter(str.strip, gold_path.read_text("utf-8").split("\n")))}
    items = [json.loads(line) for line in posts_path.read_text("utf-8").split("\n") if line.strip()]
    if missing := [p["oriane_id"] for p in items if p["oriane_id"] not in gold]:
        raise ValueError(f"No gold label for {missing[:3]}")
    return [{**post, "gold": gold[post["oriane_id"]]} for post in items]


def stored_post(post: dict) -> dict:
    """The row shape labeler.state_for reads, rebuilt so its context text matches what the poller stored."""
    media = {"onScreenText": post["on_screen_text"], **({"transcript": post["transcript"]} if post["transcript"] else {})}
    raw = {"media": [media], **({"caption": post["caption"]} if post["caption"] else {})}
    return {"snippet": post["snippet"], "matched_query": post["matched_phrase"], "raw_json": json.dumps(raw)}


def sources_of(post: dict) -> dict[str, str]:
    return {"transcript": post["transcript"], "caption": post["caption"], "on_screen": " ".join(post["on_screen_text"])}


def truth(gold: dict) -> dict:
    """The gold side of every scored field. stance is mapped from the two axes."""
    return {"health_claim": gold["health_claim"], "claim_stance": gold["claim_stance"], "commercial": gold["commercial"],
            "myth": gold["myth"], "stance": labeler.stance_of(gold["claim_stance"], gold["commercial"] == "yes")}


def sentence_no(text: str, at: int) -> int:
    return len(re.findall(r"[.!?\n]", text[:at]))


def quote_matches(quote: str, gold: dict, texts: dict[str, str]) -> bool:
    """Same source as the gold quote and either overlapping it or in the same sentence."""
    text = texts.get(gold["evidence_source"] or "", "")
    start, gold_start = text.find(quote), text.find(gold["evidence_quote"])
    if start < 0 or gold_start < 0:
        return False
    overlap = start < gold_start + len(gold["evidence_quote"]) and gold_start < start + len(quote)
    return overlap or sentence_no(text, start) == sentence_no(text, gold_start)


def grade(item: dict, post: dict, sentences: list, state: str, result) -> dict:
    gold = item["gold"]
    row = {"id": item["oriane_id"], "transcript": bool(item["transcript"]), "gold": gold, "status": "ok"}
    if isinstance(result, BaseException):
        return {**row, "status": "skipped" if isinstance(result, BudgetExceeded) else "error", "error": type(result).__name__, "message": str(result)[:200]}
    answers, _ = result
    try:
        health, myth, stance, confidence = labeler.decide(answers)
        quote, _ = labeler.quote_for(post, sentences, answers, health, stance)
        claim, commercial = answers["claim_stance"]["choice"], answers["commercial"]["noul"] >= labeler.COMMERCIAL_MIN
        dubious, standalone = answers["dubious"]["noul"], answers["standalone_claim"]["noul"]
    except (KeyError, TypeError, ValueError) as failure:
        return {**row, "status": "error", "error": type(failure).__name__}
    yes = lambda flag: "yes" if flag else "no"  # noqa: E731
    row["model"] = {
        "health_claim": yes(health), "claim_stance": claim, "commercial": yes(commercial), "myth": myth or "none",
        "myth_asked": answers["myth"]["choice"], "stance": stance, "confidence": round(confidence, 3),
        "dubious": round(dubious, 3), "standalone_claim": round(standalone, 3),
    }
    window = json.loads(state)["post_text"]
    row["gold_quote_in_window"] = None if not gold["evidence_quote"] else gold["evidence_quote"] in window
    texts = sources_of(item)
    valid = bool(quote) and any(quote in text for text in texts.values())
    row["evidence"] = {"quote": quote, "valid": valid,
                       "match": quote_matches(quote, gold, texts) if valid and gold["evidence_quote"] else None}
    return row


async def run(items: list[dict], settings: Settings, max_calls: int, transport=None) -> tuple[list[dict], int]:
    myths = dict(brief.MYTHS)
    posts = [stored_post(item) for item in items]
    options = [labeler.evidence_sentences(post) for post in posts]  # the same options label_pending offers
    states = [labeler.state_for(post) for post in posts]
    evaluator = judge.Judge(settings=settings)
    async with CountingClient(max_calls, transport=transport) as client:
        results = await asyncio.gather(
            *(evaluator.ask(state, labeler.questions(myths, sentences), client=client) for state, sentences in zip(states, options)),
            return_exceptions=True,
        )
        calls = client.calls
    return [grade(*args) for args in zip(items, posts, options, states, results)], calls


def share(hits: int, total: int) -> dict:
    return {"hits": hits, "n": total, "rate": round(hits / total, 3) if total else None}


def precision_recall(rows: list[dict], predicted, actual) -> tuple[dict, dict]:
    both = sum(bool(predicted(r) and actual(r)) for r in rows)
    return share(both, sum(bool(predicted(r)) for r in rows)), share(both, sum(bool(actual(r)) for r in rows))


def summarize(rows: list[dict]) -> dict:
    out = {"n": len(rows)}
    for field in FIELDS:
        out[field] = share(sum(r["model"][field] == truth(r["gold"])[field] for r in rows), len(rows))
    out["stance_vs_old_gold"] = share(sum(r["model"]["stance"] == r["gold"]["stance"] for r in rows), len(rows))
    out["stance_vs_old_gold_lenient"] = share(
        sum(r["model"]["stance"] in (r["gold"]["stance"], r["gold"].get("alt_stance")) for r in rows), len(rows))
    bad = lambda r: r["gold"]["claim_stance"] == "endorses" and r["gold"]["dubious"] == "yes"  # noqa: E731
    endorses = lambda r: r["model"]["claim_stance"] == "endorses"  # noqa: E731
    flagged = lambda r: endorses(r) and r["model"]["dubious"] >= labeler.DUBIOUS_MIN  # noqa: E731
    out["bad_content_flag_precision"], out["bad_content_flag_recall"] = precision_recall(rows, flagged, bad)
    out["endorses_only_precision"], out["endorses_only_recall"] = precision_recall(rows, endorses, bad)
    out["commercial_precision"], out["commercial_recall"] = precision_recall(
        rows, lambda r: r["model"]["commercial"] == "yes", lambda r: r["gold"]["commercial"] == "yes")
    out["dubious"] = share(sum((r["model"]["dubious"] >= labeler.DUBIOUS_MIN) == (r["gold"]["dubious"] == "yes") for r in rows), len(rows))
    named = [r for r in rows if r["gold"]["myth"] != "none"]
    out["myth_found"] = share(sum(r["model"]["myth"] == r["gold"]["myth"] for r in named), len(named))
    out["myth_false_alarms"] = share(sum(r["model"]["myth"] != "none" for r in rows if r["gold"]["myth"] == "none"), len(rows) - len(named))
    window = [r["gold_quote_in_window"] for r in rows if r["gold_quote_in_window"] is not None]
    out["gold_quote_in_window"] = share(sum(window), len(window))
    shown = [r for r in rows if r["evidence"]["quote"]]
    out["evidence_valid_quote"] = share(sum(r["evidence"]["valid"] for r in shown), len(shown))
    graded = [r for r in rows if r["gold"]["evidence_quote"]]
    out["evidence_matches_gold"] = share(sum(bool(r["evidence"]["match"]) for r in graded), len(graded))
    matched_shown = [r for r in graded if r["evidence"]["quote"]]
    out["evidence_match_when_shown"] = share(sum(bool(r["evidence"]["match"]) for r in matched_shown), len(matched_shown))
    no_gold = [r for r in rows if not r["gold"]["evidence_quote"]]
    out["evidence_none_when_gold_none"] = share(sum(not r["evidence"]["quote"] for r in no_gold), len(no_gold))
    return out


def confusion(rows: list[dict], field: str, values: list[str]) -> dict:
    matrix = Counter((truth(r["gold"])[field], r["model"][field]) for r in rows)
    return {gold: {model: matrix[(gold, model)] for model in values} for gold in values}


def report(rows: list[dict], calls: int) -> dict:
    ok = [r for r in rows if r["status"] == "ok"]
    disagreements = [
        {"id": r["id"], "field": field, "model": r["model"][field], "gold": truth(r["gold"])[field],
         "confidence": r["model"]["confidence"], "dubious": r["model"]["dubious"], "note": r["gold"]["note"],
         "borderline": r["gold"].get("borderline", False)}
        for r in ok for field in FIELDS if r["model"][field] != truth(r["gold"])[field]
    ]
    return {
        "calls": calls, "posts": len(rows), "scored": len(ok),
        "unscored": [{"id": r["id"], "status": r["status"], "error": r.get("error")} for r in rows if r["status"] != "ok"],
        "all": summarize(ok),
        "with_transcript": summarize([r for r in ok if r["transcript"]]),
        "without_transcript": summarize([r for r in ok if not r["transcript"]]),
        "clear_posts": summarize([r for r in ok if not r["gold"].get("borderline")]),
        "confusion": confusion(ok, "stance", STANCES),
        "claim_stance_confusion": confusion(ok, "claim_stance", CLAIM_STANCES),
        "disagreements": disagreements,
    }


def fmt(value: dict | None) -> str:
    return "n/a" if not value or value["rate"] is None else f"{value['hits']}/{value['n']} ({value['rate']:.1%})"


def table(result: dict, key: str, values: list[str], title: str) -> list[str]:
    lines = ["", title, f"{'':12}" + "".join(f"{v:>11}" for v in values)]
    return lines + [f"{gold:12}" + "".join(f"{result[key][gold][v]:>11}" for v in values) for gold in values]


def render(result: dict) -> str:
    groups = [("all", "all"), ("with_transcript", "with transcript"), ("without_transcript", "without transcript"),
              ("clear_posts", "not borderline")]
    lines = [f"posts {result['posts']}, scored {result['scored']}, HTTP calls {result['calls']}"]
    lines += [f"NOT SCORED {u['id']}: {u['status']} {u['error']}" for u in result["unscored"]]
    lines.append("")
    metrics = [*FIELDS, "stance_vs_old_gold", "stance_vs_old_gold_lenient", "bad_content_flag_precision", "bad_content_flag_recall",
               "endorses_only_precision", "endorses_only_recall", "commercial_precision", "commercial_recall", "dubious",
               "myth_found", "myth_false_alarms", "gold_quote_in_window", "evidence_valid_quote", "evidence_matches_gold",
               "evidence_match_when_shown", "evidence_none_when_gold_none"]
    header = "".join(f"{label + ' (n=' + str(result[key]['n']) + ')':>26}" for key, label in groups)
    lines.append(f"{'metric':30}{header}")
    for metric in metrics:
        if any(metric in result[key] for key, _ in groups):
            lines.append(f"{metric:30}" + "".join(f"{fmt(result[key].get(metric)):>26}" for key, _ in groups))
    lines += table(result, "confusion", STANCES, "stance confusion (rows gold mapped from the two axes, columns model)")
    lines += table(result, "claim_stance_confusion", CLAIM_STANCES, "claim_stance confusion (rows gold, columns model)")
    lines += ["", f"disagreements ({len(result['disagreements'])})"]
    lines += [f"{d['id']}  {d['field']}: model {d['model']} ({d['confidence']}, dubious {d['dubious']}), gold {d['gold']}"
              f"{' [borderline]' if d['borderline'] else ''}. {d['note']}" for d in result["disagreements"]]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--split", choices=["tune", "test"], help="score only the tune or the test half of the gold set")
    parser.add_argument("--limit", type=int, help="score only the first N posts")
    parser.add_argument("--max-calls", type=int, default=70, help="stop after this many HTTP requests, retries included")
    parser.add_argument("--out", type=Path, help="write per-post rows and the summary here as JSON")
    args = parser.parse_args(argv)
    settings = Settings.from_env()
    if not (settings.openai_key and settings.openai_model):
        print("Set OPENAI_API_KEY and OPENAI_MODEL", file=sys.stderr)
        return 2
    items = [i for i in load() if not args.split or i["gold"]["split"] == args.split][: args.limit]
    rows, calls = asyncio.run(run(items, settings, args.max_calls))
    result = report(rows, calls)
    print(render(result))
    if args.out:
        args.out.write_text(json.dumps({"summary": result, "rows": rows}, indent=2, ensure_ascii=False) + "\n", "utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
