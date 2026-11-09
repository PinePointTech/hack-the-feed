# Label eval baseline

The labeler after task D1 (two axes, a split gold set) is scored in `label-eval-v2.md`. This page records the labeler before it.

Task C2. Written 2026-11-09. Branch `build/label-eval`. The labeler under test is current `main` at `767d94c`, prompt version `ad-first-standalone-1`, model `gpt-6-luna`. No app code was changed.

## Summary

- Stance agreement with my hand labels is 33 of 60 (55.0%) strict and 47 of 60 (78.3%) when my alternative label also counts. Health claim is 46 of 60 (76.7%). Myth is 51 of 60 (85.0%), but all 51 are `none`. The model found 0 of the 4 posts I tied to a confirmed myth and named a myth on 5 posts where I did not.
- Posts with a transcript score lower than posts without one: stance 18 of 40 (45.0%) against 15 of 20 (75.0%), health claim 27 of 40 (67.5%) against 19 of 20 (95.0%). The two groups also differ in class mix (see Limits), so do not read the whole gap as a transcript effect.
- The labeler no longer reads ads as promotion. 0 of 19 gold ads were called `promotes`. The two new leaks are the claim gate and funnel posts. 7 of 19 gold ads became `unrelated` because `decide()` returns `unrelated` when the health claim probability is under 0.5. 8 gold `promotes` posts became `ad`, and 7 of those are posts that teach something and then offer a link, code or product, where I recorded `ad` as my alternative.
- Stance confidence does not separate right from wrong. At 0.9 and above the stance was right on 29 of 51 posts (56.9%).
- `state_for` cuts post text at 1,500 characters. 37 of 60 posts have more text than that, and 14 of the 40 transcripts are longer than 1,500 characters on their own. 12 of the 55 gold evidence quotes sit past the cut, all of them in posts with a transcript. Stance agreement did not differ visibly between transcript posts with the quote inside and outside the window (9 of 23 against 6 of 12), so this set does not show the cut as the cause of stance errors.
- Evidence is not scored because the current labeler asks no evidence question. The scorer scores it as soon as one exists (see "Using it with a labeler that adds evidence").

## Run it again

```
cd services/brain
set -a; . path/to/brain/.env; set +a     # OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL
uv run python scripts/eval_labels.py --out /tmp/label-eval.json
```

Flags: `--limit N` scores the first N posts, `--max-calls` (default 70) stops after that many HTTP requests including retries and reports the rest as skipped, `--out` writes the summary and every per-post row as JSON. One full run is 60 requests. The baseline run used exactly 60 and had no errors. Tests run offline: `uv run pytest -q`.

## The set

`data/eval/posts.jsonl` has 60 posts, `data/eval/gold.jsonl` has the 60 matching labels. Fields per post: `oriane_id`, `platform`, `url`, `matched_phrase`, `snippet`, `caption`, `transcript`, `on_screen_text` (a list), plus `source` (`db_copy` or `oriane_old`) and `published_at`. All posts were public on TikTok, Instagram or YouTube.

| Part | Posts | How chosen |
|---|---|---|
| DB copy | 30 | A copy of `data/mybuster.db` taken 2026-11-09 (258 posts, 137 labels, 121 unlabeled). Strata by the stored label, with a fixed seed: ad 5, debunks 5, promotes 7, unrelated with a health claim 4, unrelated without 4, unlabeled 5. Posts with a transcript were taken first inside each stratum, so 10 of the 30 have one (the copy holds 11 in total). Published 2026-10-26 to 2026-11-02. |
| Older videos | 30 | 4 Oriane searches (of the 5 allowed) with the 19 watchlist phrases split in four batches, `publishedAt` 2026-09-01 to 2026-10-20, `transcriptLanguage` English, projection `default`, sorted by views, 50 per batch. The batches matched 1,705, 577, 493 and 34 posts (phrases can overlap between batches). That gave 184 results, 182 distinct ids, 174 with transcript text. I took 30 with a transcript of at least 150 characters, by phrase quota with a fixed seed. Published 2026-09-01 to 2026-10-13. |

The DB copy stratifies by the model's own stored label, so it is not a random sample of the feed. The older videos are the most viewed per batch, so they are not a random sample either. The set measures labeler behavior on a spread of post types. It does not estimate how common any stance is in the feed.

Three posts appear twice with identical text on two platforms (the Bali facial, the mouth taping news explainer, the lunge tips). Matched phrases: lymphatic drainage 14, sea moss 11, berberine 8, cortisol phrases 8, mouth taping and mouth tape 6, parasite cleanse 5, castor oil pack 3, tallow skincare 2, sunscreen is toxic 2, nature's ozempic 1. No post matched the garlic phrases, so the garlic-tumor myth is untested here.

## The gold labels

I labeled all 60 before running any model. I read the full transcript, caption and on-screen text of each post, not the 1,500 character window. The DB stratum came from the stored model label, but I did not look at a post's stored label while labeling it.

Rubric (from `docs/research/live-label-quality.md`):

- `health_claim` is `yes` when the post says or implies an effect on health or the body, or tells people to use something for health or looks, and the effect belongs to the practice or product the matched phrase names, or to a list it sits in. A purchase, a price, or a plain mention with no stated effect is `no`.
- `stance` is checked in this order: `ad` when the post is made to sell a product, service, brand, shop or event, even if it also states the claim. Then `debunks` when it disputes or warns against the claim, `promotes` when it presents the claim as true or tells people to act on it, `unrelated` otherwise.
- `myth` is one of `lymphatic-detox`, `mouth-taping`, `garlic-tumor` or `none`, using the claim text in `app/brief.py`. I used the myth the post promotes or debunks, which is not the same question as the labeler's ("which listed claim does claim_sentence restate").
- `evidence_quote` is an exact substring of the transcript, caption or on-screen text that justifies the stance. It is `null` when the post has no sentence about the claim (5 posts). `evidence_source` names where the quote sits. A test checks every quote against its source.
- `alt_stance` records my second choice on a borderline call. 33 of 60 posts have one. Almost all are posts that teach something and then offer a link or product for a comment. The strict number counts only my first choice, the lenient number also accepts the alternative.

Gold mix: promotes 22, ad 19, unrelated 10, debunks 9. Health claim yes 43, no 17. Myth none 56, mouth-taping 3, lymphatic-detox 1.

## Baseline

Source: the run output and its `--out` JSON. Percentages are hits over n.

| Metric | All (60) | With transcript (40) | Without transcript (20) |
|---|---|---|---|
| health_claim | 46 of 60 (76.7%) | 27 of 40 (67.5%) | 19 of 20 (95.0%) |
| stance, strict | 33 of 60 (55.0%) | 18 of 40 (45.0%) | 15 of 20 (75.0%) |
| stance, lenient | 47 of 60 (78.3%) | 29 of 40 (72.5%) | 18 of 20 (90.0%) |
| myth | 51 of 60 (85.0%) | 35 of 40 (87.5%) | 16 of 20 (80.0%) |
| ad precision | 12 of 23 (52.2%) | 6 of 16 (37.5%) | 6 of 7 (85.7%) |
| ad recall | 12 of 19 (63.2%) | 6 of 9 (66.7%) | 6 of 10 (60.0%) |
| gold quote inside the 1,500 character window | 43 of 55 (78.2%) | 23 of 35 (65.7%) | 20 of 20 (100%) |

Stance confusion, rows gold, columns model:

| | promotes | debunks | ad | unrelated |
|---|---|---|---|---|
| promotes | 8 | 0 | 8 | 6 |
| debunks | 0 | 7 | 1 | 1 |
| ad | 0 | 0 | 12 | 7 |
| unrelated | 2 | 0 | 2 | 6 |

Stance by gold class: debunks 7 of 9, ad 12 of 19, unrelated 6 of 10, promotes 8 of 22. On the 27 posts where I had no alternative label, strict stance agreement is 17 of 27 (63.0%). On the 33 posts where I did, it is 16 of 33.

### What the disagreements are

The scorer prints every one with its post id, the model answer and my note. Counts by pattern:

| Pattern | Count | Notes |
|---|---|---|
| Gold `ad`, model `unrelated` | 7 | All 7 have model health claim `no`, so `decide()` forced `unrelated`. 6 of the 7 are posts where I also said no health claim: a shop live-stream invite, a hair salon product line, a brand joke post, an app promo, a tallow founder, and a pop-up stall announcement. The seventh is a brand launch where I saw a claim in the label text and the model did not. |
| Gold `promotes`, model `ad` | 8 | 7 have my alternative `ad`: a podcast clip, a soap testimonial, a plague conspiracy video that points to the creator's book, a parasite cleanse episode with a code to comment, a cancer remedy video with a supplement line, a shower routine with a tagged cleanser, and a kidney claim with a guide offer. The eighth is a natural remedies cabinet video. |
| Gold `promotes`, model `unrelated` | 6 | 4 have model health claim `no`, so the gate decided. Includes the recipe caption that calls eggs nature's Ozempic while the voiceover doubts it. |
| Gold `unrelated`, model `promotes` or `ad` | 4 | The matched word is a list item or a label: an astrology reading, a bride's to-do list, a night routine timetable and a redhead day joke. |
| Gold `debunks`, model not `debunks` | 2 | A story about an AI-made sea moss gummy account (read as `ad`), and a German channel relaying an expert's critique of a cortisol drink ad (read as `unrelated`). |
| Health claim, model `yes`, gold `no` | 8 | 3 are my borderline calls. Others are incidental: a label on a gear list, a banner ad inside a news screen capture, a mouth tape collab with no effect stated. |
| Health claim, model `no`, gold `yes` | 6 | 2 are my borderline calls. Includes the nature's Ozempic recipe and a brand launch with label text. |
| Myth, gold set, model `none` | 4 | All three mouth-taping posts and the one lymphatic-detox post. Two are the same news explainer on two platforms, which disputes the myth rather than restating it. |
| Myth, gold `none`, model names one | 5 | Three `lymphatic-detox`, two `mouth-taping`, all on posts that mention the practice without the claim, such as a gadget roundup, a flight packing list, a device ad and a mouth tape product collab. |

Stance errors total 27. 12 of them have model health claim `no`. The lenient figure removes 14 of the 27.

### Confidence

| Stance confidence | Posts | Stance right |
|---|---|---|
| under 0.7 | 2 | 0 |
| 0.7 to under 0.9 | 7 | 4 |
| 0.9 and over | 51 | 29 |

## Using it with a labeler that adds evidence

`eval_labels.py` calls `labeler.questions(myths)`, `labeler.state_for(post)` and `labeler.decide(answers)` as they are. It scores evidence only when the labeler produces it, in either of two shapes: an `evidence` question whose answer is a `choice` with quotes as option keys (or a `{"quote": ...}` answer), or a fifth item from `decide()` (a quote string or a dict with `quote`). The option keys `none`, `no_evidence`, `null` and empty mean no quote.

When evidence is present, three more rows appear in the table:

- `evidence_valid_quote`: the quote is an exact substring of the post's transcript, caption or on-screen text.
- `evidence_matches_gold`: on posts where I have a gold quote, the model quote is in the same source and either overlaps my quote or sits in the same sentence.
- `evidence_none_when_gold_none`: on posts where I have no gold quote, the model also gave none.

`--out` keeps each post's quote and whether it matched. If a future evidence question needs options built per post, change `run` in the script, which is the only place that calls `labeler.questions`.

## Limits

- One rater, one pass. 33 of 60 posts carry a borderline alternative, so the strict stance number is partly my own uncertainty. Use the lenient row as a ceiling and the 27 clear posts (17 of 27) as a cleaner floor.
- One model run. The judge sets no temperature or seed, and the earlier R2 run saw one post move from 0.15 to 0.98 on the same prompt. I did not repeat the run, because the budget was one run of 60 requests. Treat a 1 to 3 post difference between two runs as noise.
- The transcript gap is confounded. The with-transcript group is 18 promotes, 9 ad, 9 unrelated, 4 debunks. The without group is 10 ad, 5 debunks, 4 promotes, 1 unrelated. The two groups differ in text length and in what kinds of posts they hold.
- The set is built to cover types of post, not to match the feed. Its rates are not prevalence rates.
- The `myth` field is not comparable with the labeler's question. I labeled the myth a post is about, and the labeler asks whether the claim sentence restates the myth. The 0 of 4 recall reflects that gap as well as the model.
- Garlic-tumor has no post. One post is mostly German. Sarcasm and incidental mentions are present but few.
- Older videos are the most viewed per batch with English transcripts. Oriane adds transcripts weeks after a post, so recent posts rarely have one and this group is not what the poller stores today.
- I did not check any claim against medical evidence. The `debunks` and `promotes` labels are about what the post says, not about whether it is true.

## Files

- `data/eval/posts.jsonl`, `data/eval/gold.jsonl`
- `services/brain/scripts/eval_labels.py`
- `services/brain/tests/test_eval_labels.py`
- `docs/research/label-eval-baseline.md`
