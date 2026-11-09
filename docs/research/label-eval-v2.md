# Label accuracy v2

Task D1. Written 2026-11-09. Branch `build/label-accuracy-v2`. Prompt version `two-axes-1`, model `gpt-6-luna`. The baseline is current `main` (prompt version `evidence-quote-1`), scored on the same gold set. Earlier numbers are in `label-eval-baseline.md`.

## Summary

- The single stance question is now two questions. `claim_stance` (endorses, disputes, neither) asks what the creator says about the named practice or product. `commercial` asks whether the post is made to sell or promote something. The stored `stance` is derived from them: endorses is `promotes` and disputes is `debunks`, sold or not. Neither plus commercial is `ad`, and neither alone is `unrelated`.
- Headline, "bad content flag" (the model says endorses and dubious is at least 0.6, scored against gold posts that endorse a claim with dubious yes): on the 30 test posts, precision was 7 of 9 and 5 of 7 and recall 7 of 9 and 5 of 9 in two runs. The old prompt on the same posts, counting `promotes` with dubious at least 0.6, had precision 1 of 1 and recall 1 of 9 (one run, because only the second baseline run recorded `dubious`). Counting `promotes` alone it had precision 2 of 5 and recall 2 of 9 in both baseline runs.
- Stance against the gold stance mapped from the two axes: 26 of 30 and 25 of 30 on the test split, against 7 of 30 and 8 of 30 for the old prompt. Against the original ad-first gold stance it is 16 and 17 of 30 for the new prompt and 16 and 17 of 30 for the old one. That column understates the new labels by design, because the original gold calls a sold post that pushes a claim `ad` and the new labels call it `promotes`.
- `claim_stance` agreement is 27 and 26 of 30 on test. `commercial` is 28 and 27 of 30.
- Myth: the old prompt found 1 of 4 gold myths on the whole set and raised 6 and 7 false myths on the 56 posts that have none. The new prompt found 1 of 4, all four gold myth posts sit in the tune split, and it raised 0 and 1 false myths on the 30 test posts. The test split has no gold myth post, so test cannot show myth recall. See Limits.
- Two changes outside the question wording were needed. The judge rejected valid answers to the 13 option evidence question (probabilities rounded to two decimals did not sum to 1 within 0.01), and a long transcript pushed the caption, where offers live, and sometimes the matched phrase out of the 6,000 character window.
- Run to run noise is real. The same frozen prompt scored 26 and 25 of 30 on stance, and the bad content flag moved by 2 true positives. Treat a 1 to 2 post difference as noise.

## What changed

- `app/labeler.py`: questions `claim_stance` and `commercial` replace `stance`. `health_claim`, `dubious`, `standalone_claim` and `evidence` stay. `decide()` no longer forces `unrelated` when the health claim score is under 0.5. A myth is kept only when the creator takes a side on it. `stance_of()` and `quote_for()` are shared with the scorer. `state_for()` keeps up to 1,500 characters of caption and on-screen text and cuts a long transcript to the stretch around the matched phrase. `PROMPT_VERSION` is `two-axes-1`, so every older label is labeled again.
- Myth question: "which listed myth does the creator endorse or dispute", the same kind of claim about the same practice or product, a different effect of the same practice is not a match, none if unsure.
- `app/store.py`: `labels.commercial INTEGER`, added by the idempotent column check, written by `upsert_label`, emitted on `/feed` as optional `label.commercial` (absent on old labels).
- `app/derived.py`: reach, top video and the response ratio still count every label with stance `promotes`, which now includes sold posts that push the claim. The impact note says so. A post that only sells (`ad`) is not a promoter.
- `app/judge.py`: sends `temperature: 0` and drops it for one retry if a model answers 400 about it. The choice sum tolerance is 0.005 per option, at least 0.01.
- `contracts/types.ts`, `apps/web/src/contracts/types.ts`, `apps/web/src/lib/feed.ts`: optional `commercial`.
- `scripts/eval_labels.py`, `scripts/split_gold.py`, `data/eval/gold.jsonl`: see below.

Temperature 0 was accepted by the API. Between two runs of one frozen prompt, 1 of 30 posts changed stance, against 6 of 60 between the two baseline runs without it. The prompts and sets differ, so this is a rough sign only. The `dubious` score still swung by up to 0.94 on one post, and 2 of 30 posts crossed the 0.6 line between the two test runs.

## The gold set

Before any model ran on the new prompt I read the full transcript, caption and on-screen text of all 60 posts again and added, for each:

- `claim_stance`: endorses 28, disputes 9, neither 23.
- `commercial`: yes 34, no 26.
- `dubious`: yes or no for the claim the post endorses or disputes. Endorses with dubious yes is the bad content set, 18 posts.
- `borderline` and `claim_note` on 19 posts where the call is a judgement. The report has a "not borderline" column for the other 41.
- `split`: 30 tune, 30 test.

The old fields (`health_claim`, `stance`, `myth`, `alt_stance`, evidence) are unchanged. `myth` kept its values. Rules used:

- Endorses: in their own voice, the creator says or clearly implies the named practice or product has a health effect, or tells people to use it for health. A passing mention, list item, label, banner, joke or metaphor is neither. A list whose own heading gives the effect counts.
- When the matched phrase is not what the claim is about (a stray on-screen word, an ingredient on a label), the post is neither for that phrase.
- When the caption and the spoken words disagree, the transcript wins.
- Commercial: made to sell or promote a product, service, brand, shop, event or paid offer, including a price, a booking line, a tag, a link or a "comment a word" funnel. A review that says it is not sponsored and has no link, code or price is no.
- Dubious: yes when the post states a specific effect that the mainstream evidence does not support (cures, detox, appetite or fat effects, a soap clearing skin, a cleanse). Appearance-only cosmetic claims, modest claims and hedged summaries of a trial are no.

The split is stratified by `claim_stance`, `commercial` and, for endorses, `dubious`, with seed 1 (the first seed that gives 30 and 30 with every stratum within one post). Three posts appear twice on two platforms (the Bali facial, the mouth taping news explainer, the lunge tips); each pair is kept in one split. Tune has 14 endorses, 5 disputes, 11 neither and 9 bad content posts. Test has 14, 4, 12 and 9. `scripts/split_gold.py` reproduces it, and a test checks the committed split against it.

## How it was run

Every run is `scripts/eval_labels.py`, which builds the state, the myth list and the evidence options exactly as `label_pending` does (`state_for`, `questions(myths, evidence_sentences)`, `decide`, `quote_for`). One request per post. Keys came from the environment and are not in the repo.

OpenAI calls, retries included: 315 of the 400 allowed.

| Step | Calls |
|---|---|
| Baseline run 1, old prompt, all 60 | 61 |
| Baseline run 2, old prompt, all 60, `dubious` recorded | 62 |
| Temperature check and two single-post probes | 3 |
| Tune runs 1 to 4 | 35, 31, 30, 31 |
| Test runs 1 and 2 | 32, 30 |

Tune wording history, tune split only:

| Run | What changed | Scored | claim_stance | commercial | flag precision, recall |
|---|---|---|---|---|---|
| 1 | first wording | 24 of 30 (3 judge errors, 3 not reached) | 21 of 24 | 18 of 24 | 6 of 8, 6 of 7 |
| 2 | caption reserve and phrase window, sum tolerance, narrower commercial, looser myth, figure of speech | 29 of 30 | 28 of 29 | 23 of 29 | 9 of 10, 9 of 9 |
| 3 | commercial funnel and own-work wording, a different effect is no myth match, evidence question wording | 30 of 30 | 27 of 30 | 28 of 30 | 9 of 12, 9 of 9 |
| 4 | a hedged trial summary is not dubious (final) | 29 of 30 (1 timeout) | 27 of 29 | 27 of 29 | 9 of 10, 9 of 9 |

The test split was first scored after the wording was frozen. The prompt file hash was the same for both test runs.

## Results

Counts are hits over n. The baseline columns are the old prompt scored with the new gold. Its `claim_stance` is derived (promotes is endorses, debunks is disputes, the rest neither).

### Test split (30 posts)

| Metric | Baseline run 1 | Baseline run 2 | New run 1 | New run 2 |
|---|---|---|---|---|
| bad content flag, precision | n/a | 1 of 1 | 7 of 9 (77.8%) | 5 of 7 (71.4%) |
| bad content flag, recall | n/a | 1 of 9 | 7 of 9 (77.8%) | 5 of 9 (55.6%) |
| endorses only, precision | 2 of 5 | 2 of 5 | 8 of 14 (57.1%) | 7 of 13 (53.8%) |
| endorses only, recall | 2 of 9 | 2 of 9 | 8 of 9 (88.9%) | 7 of 9 (77.8%) |
| stance, mapped gold | 7 of 30 | 8 of 30 | 26 of 30 (86.7%) | 25 of 30 (83.3%) |
| stance, mapped gold, posts not borderline (21) | n/a | n/a | 20 of 21 (95.2%) | 19 of 21 (90.5%) |
| stance, original gold | 16 of 30 | 17 of 30 | 16 of 30 (53.3%) | 17 of 30 (56.7%) |
| stance, original gold, lenient | n/a | n/a | 23 of 30 (76.7%) | 24 of 30 (80.0%) |
| claim_stance | 16 of 30 | 16 of 30 | 27 of 30 (90.0%) | 26 of 30 (86.7%) |
| claim_stance, posts not borderline | n/a | n/a | 21 of 21 | 20 of 21 |
| commercial | n/a | n/a | 28 of 30 (93.3%) | 27 of 30 (90.0%) |
| commercial, precision and recall | n/a | n/a | 16 of 17, 16 of 17 | 16 of 18, 16 of 17 |
| health_claim (question unchanged) | 23 of 30 | 24 of 30 | 22 of 30 (73.3%) | 23 of 30 (76.7%) |
| dubious at 0.6 | n/a | n/a | 24 of 30 (80.0%) | 22 of 30 (73.3%) |
| false myths raised on 30 posts | 3 | 5 | 0 | 1 |
| myth recall | no gold myth in test | no gold myth in test | no gold myth in test | no gold myth in test |
| evidence, quote is an exact substring | n/a | n/a | 20 of 20 | 20 of 20 |
| evidence, matches gold quote (27 posts with one) | n/a | n/a | 6 of 27 (22.2%) | 6 of 27 (22.2%) |
| evidence, matches gold quote when one is shown | n/a | n/a | 6 of 20 (30.0%) | 6 of 20 (30.0%) |
| evidence, none when gold has none | n/a | n/a | 3 of 3 | 3 of 3 |

The baseline did not record `dubious` in run 1, so the combined flag has no run 1 baseline. The old prompt could not say "sold and endorses", so a commercial score for it is not comparable and is left out.

### Tune split (30 posts)

| Metric | Baseline run 1 | Baseline run 2 | New run 3 | New run 4 (final wording) |
|---|---|---|---|---|
| bad content flag, precision | n/a | 3 of 5 | 9 of 12 | 9 of 10 |
| bad content flag, recall | n/a | 3 of 9 | 9 of 9 | 9 of 9 |
| stance, mapped gold | 14 of 30 | 10 of 30 | 26 of 30 | 26 of 29 |
| stance, original gold | 15 of 30 | 12 of 30 | 24 of 30 | 22 of 29 |
| claim_stance | 19 of 30 | 17 of 30 | 27 of 30 | 27 of 29 |
| commercial | n/a | n/a | 28 of 30 | 27 of 29 |
| health_claim | 24 of 30 | 26 of 30 | 28 of 30 | 26 of 29 |
| myth recall | 1 of 4 | 1 of 4 | 1 of 4 | 1 of 4 |
| false myths raised | 3 | 2 | 0 | 0 |

These are the posts the wording was tuned on, so read them as a ceiling.

### The old prompt on the old gold, for continuity

Stance strict was 31 of 60 in run 1 and 29 of 60 in run 2, in line with the 31 to 33 measured before. Health claim was 47 and 50 of 60.

## Every remaining test-split error and its cause

Both runs are listed. "Run 2 only" and "run 1 only" mean the post flipped between two runs of the same prompt. The health claim question was not changed, so its errors are the old ones. They no longer decide the stance.

| Post (matched phrase) | Error | Cause |
|---|---|---|
| grocery haul (sea moss) | health_claim yes, gold no, both runs | The health_claim question reads any health effect in the post. The haul says kombucha helps cramps. Not changed in this task. Stance is right. |
| Cymbiotika at Walmart (sea moss) | health_claim no, gold yes (borderline), both | Only a generic "science backed" line and label text. A judgement call. |
| sunscreen myth-busting (sunscreen is toxic) | commercial yes, gold no, both | The caption offers the studies by DM and credits SPF makeup brands. The new commercial wording counts a DM funnel and a brand tag as yes. My gold counts credits and a free offer as no. A boundary between wording and gold, not a model slip. |
| flight packing list (mouth tape) | flag false positive, both. Run 2 also commercial yes | Endorses is right. The model rates mouth taping for a dry mouth as dubious (0.99 and 0.9). My gold calls it a modest personal claim (borderline). |
| podcast clip (berberine) | claim_stance neither, gold endorses (borderline), and a flag miss, both | Berberine is named in a list and the claim is about a peptide. The model treats it as a passing mention, which is the intended rule. The gold is the lenient read. |
| under-eye self-osteopathy (lymphatic drainage) | flag miss, both | claim_stance endorses is right, but dubious was 0.08. `dubious` reads `claim_sentence`, which here is a line about venous drainage, not the "amazing change in a week" overclaim later in the transcript. A limit of anchoring dubious on the matched sentence. |
| night routine (lymphatic drainage) | health_claim yes, gold no, both | health_claim, unchanged. |
| TikTok Shop listing (lymphatic drainage) | myth lymphatic-detox, gold none (borderline), run 2 only | The listing sells drops for "metabolism" and the model matched the fat and detox myth on one run. Noise on a borderline post. |
| Japan gadget roundup (lymphatic drainage) | flag false positive, both | Endorses is right (one item in 29 has a stated effect). `dubious` was 1.0 and 0.98 for "reduce the appearance of cellulite". My gold treats appearance-only claims as not dubious (borderline). |
| redhead joke (berberine) | health_claim yes, gold no, both | health_claim, unchanged. A product word on screen. |
| Trader Joe's dermatologist (sea moss) | health_claim no, gold yes (borderline), both | Sea moss is a label ingredient. A judgement call. |
| gear label (castor oil pack) | health_claim yes, gold no, both | health_claim, unchanged. A label on a piece of gear. Stance is right. |
| magnesium and cortisol face (cortisol face) | claim_stance neither, stance ad, flag miss, run 2 only | The same post was endorses with dubious 0.98 in run 1. A flip on a clear sold supplement pitch at temperature 0. Noise. |
| founder story (sea moss) | flag miss, run 2 only | Endorses both times. `dubious` was 0.72 in run 1 and 0.55 in run 2, either side of the 0.6 line. |
| Shark device routine (lymphatic drainage) | claim_stance endorses, gold neither (borderline), both | "Like a lymphatic drainage massage for your face" is a simile for the feel, which my gold reads as neither. The model reads it as an effect. |
| castor oil horror joke (castor oil pack) | commercial no, gold yes, both | A brand voice joke with no offer, link, price or tag. My gold calls it brand marketing. The wording asks for an offer. The gold is the generous read. |
| bride to-do list (lymphatic drainage) | health_claim yes, gold no, run 1 only | health_claim, unchanged. |
| nature's Ozempic eggs (nature's ozempic) | claim_stance disputes, gold neither (borderline), both | The caption endorses and the voiceover says "I don't know about that". The model reads the doubt as a dispute. My gold reads neither: doubt is not a dispute, and the caption says the opposite. |
| productivity tutorial (cortisol cocktail) | health_claim yes, gold no, both | health_claim, unchanged. A coffee joke. Stance is right. |

Counts by cause across the 19 posts above: 8 posts with only an unchanged health_claim error (none changes the stance); 4 boundary calls where the model and my gold differ on `dubious` or `commercial` (sunscreen DM funnel, flight list, gadget roundup, horror joke); 3 borderline gold reads on `claim_stance` (podcast clip, Shark device, Ozempic eggs); 1 `dubious` anchored on the wrong sentence (under-eye); 3 flips between runs on the same prompt (magnesium pitch, founder story, TikTok Shop myth).

## Limits

- One rater wrote the gold, and 19 of 60 calls are marked borderline. The not borderline rows are the cleaner number. On them the test stance score is 20 of 21 and 19 of 21.
- All four gold myth posts (the mouth taping news explainer twice, the forward growth video, the ear massage) are in the tune split, so test shows false myths only. I did not stratify the split by myth, and by the time I saw it, tune wording had been fitted on those posts, so I did not re-split. On tune the new prompt found 1 of 4, the forward growth video. It misses the news explainer, which warns about mouth taping but does not dispute "proven fix" or "sharper jawline", and the ear massage. Under "same claim about the same thing, none if unsure" the model is defensible on the explainer and my gold is the lenient read. I did not change the gold after seeing model output.
- Evidence scoring against my gold quote is weak and noisy. On test, 6 of 27 gold quotes were matched, 6 of 20 when a quote was shown, against 11 of 19 on tune. Only 20 of the 27 test gold quotes are among the 12 options the labeler offers (24 of 28 on tune), and a label that is `unrelated` or has no health claim carries no quote by design while my gold has one for most posts. Every shown quote was an exact substring of its source (20 of 20). I did not tune this further after the test split was seen.
- Judge validation still fails now and then: 1 of 30 on tune run 2 (an inconsistent choice answer; a direct repeat was valid) and 1 timeout on tune run 4. The post stays unlabeled and the next poll tries it again. The scorer reports these as not scored.
- `dubious` is the weakest axis: 24 and 22 of 30 on test, and it moves across the 0.6 line between runs. The bad content flag depends on it, so most of the flag's swing between runs comes from `dubious`.
- The set covers types of post. It does not estimate how common any label is in the feed.
- `commercial` is stored as 0 or 1 at a 0.5 cut, not as a probability.

## Run it again

```
cd services/brain
set -a; . path/to/brain/.env; set +a      # OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL
uv run python scripts/eval_labels.py --split test --out /tmp/label-test.json
```

`--split tune|test` scores one half, `--limit N` the first N, `--max-calls` (default 70) stops after that many HTTP requests, retries included, and reports the rest as not scored, and `--out` writes every per-post row with the model's `dubious` score, myth answer and evidence quote. Offline tests: `uv run pytest -q`.

## Files

- `services/brain/app/labeler.py`, `store.py`, `derived.py`, `judge.py`
- `services/brain/scripts/eval_labels.py`, `split_gold.py`
- `services/brain/tests/test_labeler.py`, `test_eval_labels.py`, `test_judge.py`, `test_derived.py`
- `data/eval/gold.jsonl`
- `contracts/types.ts`, `apps/web/src/contracts/types.ts`, `apps/web/src/lib/feed.ts`, `apps/web/src/lib/feed.test.ts`
- `docs/research/label-eval-v2.md`
