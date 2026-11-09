"""Score the live labeler against the hand-labeled gold set in data/eval.

    cd services/brain && uv run python scripts/eval_labels.py [--limit N] [--max-calls 70] [--out results.json]

Reads OPENAI_API_KEY and OPENAI_MODEL (and OPENAI_BASE_URL) from the environment, builds each state with
labeler.state_for, asks labeler.questions through judge.Judge and applies labeler.decide. Every HTTP request,
retries included, counts against --max-calls; posts not reached are reported as skipped, not as wrong.

Evidence is scored only when the labeler produces it: a question named "evidence" (a choice whose option keys are
quotes, or a {"quote": ...} answer) or a fifth item from decide(). Option keys "none" or "" mean no quote.
shortcut: labeler.questions is called with myths only; if a future evidence question needs per-post options, change `run`.
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
NO_QUOTE = {"", "none", "no_evidence", "null"}


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


def evidence_of(answers: dict, decided: tuple) -> tuple[bool, str | None]:
    """(labeler asks for evidence, the quote or None)."""
    if len(decided) > 4:
        found = decided[4]
        found = found.get("quote") if isinstance(found, dict) else found
    elif "evidence" in answers:
        answer = answers["evidence"]
        found = answer.get("quote") if "choice" not in answer else answer["choice"]
    else:
        return False, None
    return True, None if str(found or "").strip().lower() in NO_QUOTE else found


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


def grade(item: dict, state: str, result) -> dict:
    gold = item["gold"]
    row = {"id": item["oriane_id"], "transcript": bool(item["transcript"]), "gold": gold, "status": "ok"}
    if isinstance(result, BaseException):
        return {**row, "status": "skipped" if isinstance(result, BudgetExceeded) else "error", "error": type(result).__name__}
    answers, _ = result
    try:
        decided = labeler.decide(answers)
    except (KeyError, TypeError, ValueError) as failure:
        return {**row, "status": "error", "error": type(failure).__name__}
    health, myth, stance, confidence = decided[:4]
    asked, quote = evidence_of(answers, decided)
    row["model"] = {"health_claim": "yes" if health else "no", "myth": myth or "none", "stance": stance,
                    "confidence": round(confidence, 3)}
    window = json.loads(state)["post_text"]
    row["gold_quote_in_window"] = None if not gold["evidence_quote"] else gold["evidence_quote"] in window
    if asked:
        texts = sources_of(item)
        valid = bool(quote) and any(quote in text for text in texts.values())
        row["evidence"] = {"quote": quote, "valid": valid,
                           "match": quote_matches(quote, gold, texts) if valid and gold["evidence_quote"] else None}
    return row


async def run(items: list[dict], settings: Settings, max_calls: int, transport=None) -> tuple[list[dict], int]:
    asked = labeler.questions(dict(brief.MYTHS))
    states = [labeler.state_for(stored_post(item)) for item in items]
    evaluator = judge.Judge(settings=settings)
    async with CountingClient(max_calls, transport=transport) as client:
        results = await asyncio.gather(*(evaluator.ask(s, asked, client=client) for s in states), return_exceptions=True)
        calls = client.calls
    return [grade(*args) for args in zip(items, states, results)], calls


def share(hits: int, total: int) -> dict:
    return {"hits": hits, "n": total, "rate": round(hits / total, 3) if total else None}


def summarize(rows: list[dict]) -> dict:
    out = {"n": len(rows)}
    for field in ("health_claim", "stance", "myth"):
        out[field] = share(sum(r["model"][field] == r["gold"][field] for r in rows), len(rows))
    out["stance_lenient"] = share(sum(r["model"]["stance"] in (r["gold"]["stance"], r["gold"].get("alt_stance")) for r in rows), len(rows))
    predicted = sum(r["model"]["stance"] == "ad" for r in rows)
    actual = sum(r["gold"]["stance"] == "ad" for r in rows)
    both = sum(r["model"]["stance"] == r["gold"]["stance"] == "ad" for r in rows)
    out["ad_precision"], out["ad_recall"] = share(both, predicted), share(both, actual)
    window = [r["gold_quote_in_window"] for r in rows if r["gold_quote_in_window"] is not None]
    out["gold_quote_in_1500_chars"] = share(sum(window), len(window))
    with_evidence = [r for r in rows if "evidence" in r]
    if with_evidence:
        out["evidence_valid_quote"] = share(sum(r["evidence"]["valid"] for r in with_evidence), len(with_evidence))
        graded = [r for r in with_evidence if r["gold"]["evidence_quote"]]
        out["evidence_matches_gold"] = share(sum(bool(r["evidence"]["match"]) for r in graded), len(graded))
        no_gold = [r for r in with_evidence if not r["gold"]["evidence_quote"]]
        out["evidence_none_when_gold_none"] = share(sum(not r["evidence"]["quote"] for r in no_gold), len(no_gold))
    return out


def report(rows: list[dict], calls: int) -> dict:
    ok = [r for r in rows if r["status"] == "ok"]
    matrix = Counter((r["gold"]["stance"], r["model"]["stance"]) for r in ok)
    disagreements = [
        {"id": r["id"], "field": field, "model": r["model"][field], "gold": r["gold"][field], "confidence": r["model"]["confidence"],
         "note": r["gold"]["note"]}
        for r in ok for field in ("health_claim", "stance", "myth") if r["model"][field] != r["gold"][field]
    ]
    return {
        "calls": calls, "posts": len(rows), "scored": len(ok),
        "unscored": [{"id": r["id"], "status": r["status"], "error": r.get("error")} for r in rows if r["status"] != "ok"],
        "all": summarize(ok),
        "with_transcript": summarize([r for r in ok if r["transcript"]]),
        "without_transcript": summarize([r for r in ok if not r["transcript"]]),
        "confusion": {gold: {model: matrix[(gold, model)] for model in STANCES} for gold in STANCES},
        "disagreements": disagreements,
    }


def fmt(value: dict | None) -> str:
    return "n/a" if not value or value["rate"] is None else f"{value['hits']}/{value['n']} ({value['rate']:.1%})"


def render(result: dict) -> str:
    groups = [("all", "all"), ("with_transcript", "with transcript"), ("without_transcript", "without transcript")]
    lines = [f"posts {result['posts']}, scored {result['scored']}, HTTP calls {result['calls']}"]
    lines += [f"NOT SCORED {u['id']}: {u['status']} {u['error']}" for u in result["unscored"]]
    lines.append("")
    metrics = ["health_claim", "stance", "stance_lenient", "myth", "ad_precision", "ad_recall", "gold_quote_in_1500_chars",
               "evidence_valid_quote", "evidence_matches_gold", "evidence_none_when_gold_none"]
    header = "".join(f"{label + ' (n=' + str(result[key]['n']) + ')':>34}" for key, label in groups)
    lines.append(f"{'metric':32}{header}")
    for metric in metrics:
        if any(metric in result[key] for key, _ in groups):
            lines.append(f"{metric:32}" + "".join(f"{fmt(result[key].get(metric)):>34}" for key, _ in groups))
    lines += ["", "stance confusion (rows gold, columns model)", f"{'':12}" + "".join(f"{s:>11}" for s in STANCES)]
    lines += [f"{gold:12}" + "".join(f"{result['confusion'][gold][s]:>11}" for s in STANCES) for gold in STANCES]
    lines += ["", f"disagreements ({len(result['disagreements'])})"]
    lines += [f"{d['id']}  {d['field']}: model {d['model']} ({d['confidence']}), gold {d['gold']}. {d['note']}" for d in result["disagreements"]]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--limit", type=int, help="score only the first N posts")
    parser.add_argument("--max-calls", type=int, default=70, help="stop after this many HTTP requests, retries included")
    parser.add_argument("--out", type=Path, help="write per-post rows and the summary here as JSON")
    args = parser.parse_args(argv)
    settings = Settings.from_env()
    if not (settings.openai_key and settings.openai_model):
        print("Set OPENAI_API_KEY and OPENAI_MODEL", file=sys.stderr)
        return 2
    items = load()[: args.limit]
    rows, calls = asyncio.run(run(items, settings, args.max_calls))
    result = report(rows, calls)
    print(render(result))
    if args.out:
        args.out.write_text(json.dumps({"summary": result, "rows": rows}, indent=2, ensure_ascii=False) + "\n", "utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
