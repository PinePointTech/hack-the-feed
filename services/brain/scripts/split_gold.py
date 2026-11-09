"""Assign the fixed tune/test split in data/eval/gold.jsonl.

    cd services/brain && uv run python scripts/split_gold.py [--write]

Posts with the same caption on two platforms stay together, so tuning on one never shows the model its twin in test.
Strata are claim_stance, commercial and, for endorses, dubious. The first seed whose split is 30 and 30, with
every stratum within one post of even, is used, so the result is fixed and the seed is printed.
"""

import json
import random
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.oriane import DATA_DIR  # noqa: E402

EVAL_DIR = DATA_DIR / "eval"


def stratum(gold: dict) -> tuple:
    return (gold["claim_stance"], gold["commercial"], gold["dubious"] if gold["claim_stance"] == "endorses" else "-")


def assign(posts: list[dict], golds: list[dict], seed: int) -> list[str]:
    """tune/test per post, same order as `posts`."""
    twins = defaultdict(list)
    for i, post in enumerate(posts):
        twins[re.sub(r"\W+", "", post["caption"].lower()) or post["oriane_id"]].append(i)
    rng = random.Random(seed)
    units = sorted(twins.values())
    rng.shuffle(units)
    side = ["tune"] * len(posts)
    taken = defaultdict(Counter)  # stratum -> posts per split so far
    for unit in units:
        key = stratum(golds[unit[0]])
        choice = min(("tune", "test"), key=lambda s: (taken[key][s], rng.random()))
        for i in unit:
            side[i] = choice
            taken[key][choice] += 1
    return side


def balanced(side: list[str], golds: list[dict]) -> bool:
    by = defaultdict(Counter)
    for s, g in zip(side, golds):
        by[stratum(g)][s] += 1
    return side.count("tune") == side.count("test") and all(abs(c["tune"] - c["test"]) <= 1 for c in by.values())


def main() -> None:
    lines = [json.loads(x) for x in (EVAL_DIR / "gold.jsonl").read_text("utf-8").split("\n") if x.strip()]
    posts = [json.loads(x) for x in (EVAL_DIR / "posts.jsonl").read_text("utf-8").split("\n") if x.strip()]
    golds = {g["oriane_id"]: g for g in lines}
    golds = [golds[p["oriane_id"]] for p in posts]
    seed = next(s for s in range(10000) if balanced(assign(posts, golds, s), golds))
    side = assign(posts, golds, seed)
    print(f"seed {seed}: tune {side.count('tune')}, test {side.count('test')}")
    if "--write" in sys.argv:
        by_id = {p["oriane_id"]: s for p, s in zip(posts, side)}
        rows = [{**g, "split": by_id[g["oriane_id"]]} for g in lines]
        (EVAL_DIR / "gold.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), "utf-8")


if __name__ == "__main__":
    main()
