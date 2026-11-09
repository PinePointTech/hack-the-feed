# Live label quality

Task R2. Branch `research/live-label-quality`. Written 2026-11-09. Read-only research: no app code was changed.

## Summary

- Stance is the weak field. Against my hand labels the live labels agree on 13 of 21 posts (61.9%). Health claim agrees on 18 of 21 (85.7%). [A1, A2]
- 7 of the 8 stance errors are the same mistake: a post that sells something is labeled `promotes` or `unrelated` instead of `ad`. The model found 4 of the 11 posts I labeled `ad` (36%). [A3]
- All 3 candidate myths in the database are unusable as written. Each topic is plausible, but the saved "claim" is a debunker's sentence, a brand slogan, and an ingredient name. None is a claim a reviewer could approve. [B1]
- The best fix is cheap. A fifth question ("is this sentence a complete health claim?") plus an `ad`-first stance rule moved stance to 15 of 21 (71.4%) strict and 17 of 21 (81.0%) lenient, and would have created 0 of the 3 junk candidates. [D2, D3]
- The model is noisy. The same prompt on the same post gave health claim 0.15 and then 0.98. Any single-run number here moves by 1 to 2 posts. [D5]
- The radar counts topic volume, not myth promotion. Of 89 stored `lymphatic drainage` posts, 12 mention detox, toxin, fat, weight, slim, melt or burn at all, and 0 of the 10 labeled ones do. [C6]

## Sources and method

Every number carries a tag. The tags are defined here.

- **DB copy.** `/Users/vihuynh/.superset/projects/hack-the-feed/data/mybuster.db` plus its `-wal` and `-shm` files were copied to `data/research/` (git-ignored by `data/.gitignore`, line `mybuster.db*`) at about 20:24 UTC on 2026-11-09 and opened with `file:...?mode=ro`. The original was only read by `cp`. The live brain on `localhost:8000` got one `GET /health` and two `GET /feed` requests (both returned an error object). No POST was sent and no second brain was started.
- **Snapshot.** The copy holds 250 posts, 21 labels, 6 myths (3 confirmed, 3 candidate), fetched between 2026-11-09T08:02:53Z and 20:23:44Z. All 21 labels were written between 08:16:53Z and 08:17:52Z by model `gpt-6-luna`. [Q1]
- **Q1** `SELECT COUNT(*) FROM posts` = 250; `SELECT COUNT(*) FROM labels` = 21; `SELECT status, COUNT(*) FROM myths GROUP BY 1` = candidate 3, confirmed 3; `SELECT stance, health_claim, COUNT(*) FROM labels GROUP BY 1,2` = promotes 15, ad 4, debunks 1, unrelated 1 (the unrelated one has health_claim 0).
- **Hand labels [HAND].** I read each post's `snippet` and its text fields (transcript, caption, on-screen text, the same text the labeler sends as `post_text`) and wrote my labels to a file before I opened any model label. One rater, so there is no inter-rater check. Where a call was close I recorded an alternative label (marked `*` in Appendix A). **Strict** agreement counts only my first label. **Lenient** agreement also accepts my alternative.
- **My rubric.** Health claim is `yes` when the post says or implies an effect on health or the body, or tells people to use something for health or looks. A purchase, a price, or a plain mention of using a product with no stated effect is `no`. Stance is `ad` when the post is made to sell a product, service, brand, shop or event, even if it also states the claim. `promotes` means the person presents the claim as true or tells others to act on it as advice, education or a routine. `debunks` disputes or corrects it. `unrelated` takes no position.
- **Model runs [RUN].** `judge.Judge`, `labeler.questions`, `labeler.state_for` and `labeler.NO_MYTH` were imported unchanged from `services/brain/app`, with `OPENAI_API_KEY` and `OPENAI_MODEL` (`gpt-6-luna`) from the brain `.env`, read into the environment and never printed. A request hook counted every HTTP request and stopped at 40. Used: 23 for the v1 run (21 posts plus 2 internal retries), 15 for the v2 run, 2 for the repeat check. 23 + 15 + 2 = 40.
- **Heuristics [HEUR].** Counts over the 250 stored posts use regular expressions on snippet and full text. They are rough cues, not labels.
  - Commerce cue: shop, buy, order, discount, code, link in bio, comment plus a capitalized word of 3 or more letters, book, booking, a dollar amount, percent off, sale, DM, ad, cart, supplement, TikTok Shop, available at, get yours, use code, affiliate.
  - Hedge cue: may, might, can help, can support, helps support, temporary, consult, not medical advice.
  - Recipe cue: recipe, ingredients, tablespoon, tbsp, cup of, mix, blend.
  - Detox or fat cue: detox, toxin, toxic, fat, weight loss, lose weight, slim, melt, burn.

## 1. Hand labels against the live labels

### Agreement per field

| Field | Live labels, strict | Live labels, lenient | Source |
|---|---|---|---|
| health_claim | 18 of 21 (85.7%) | 21 of 21 (100%) | [A1] |
| stance | 13 of 21 (61.9%) | 14 of 21 (66.7%) | [A2] |

- **[A1]** Compare `labels.health_claim` to my `hc` and `hc_alt` for the 21 posts in Appendix A. Strict misses: #1, #10, #18. All three are my borderline calls.
- **[A2]** Compare `labels.stance` to my `st` and `st_alt`. Strict misses: #1, #5, #10, #13, #14, #18, #19, #20. Lenient removes #19 only.
- **[A3]** My stance mix over the 21 posts is ad 11, promotes 8, debunks 1, unrelated 1. The live mix is ad 4, promotes 15, debunks 1, unrelated 1 [Q1]. Every live `ad` is one I also called `ad`, so ad precision is 4 of 4 and ad recall is 4 of 11.
- **Myth field.** `labels.myth_id` is set on 7 posts: #6 mouth-taping, #10 lymphatic-detox, #13 and #14 parasite-cleanse, #15 cortisol-face, #16 and #20 sea-moss. I judge #6, #13, #14 and #15 defensible, #10 and #20 wrong, and #16 unusable because the matched "claim" is the ingredient name `Strawberry sea moss gel`. I did not score the myth field as a percentage because 3 of the 6 listed claims are candidate texts the labeler seeded from posts.
- **Confidence.** Stored stance confidence below 0.7 covers 3 posts (#1 0.62, #10 0.67, #20 0.63) and all 3 are wrong. Between 0.7 and 0.9 there are 6 posts, 4 right strict. At 0.9 and above there are 12 posts, 9 right. [A4]

### Every disagreement

| # | Field | Model | Hand | Reason |
|---|---|---|---|---|
| 1 | health_claim | yes | no (alt yes) | The post says the creator picked up berberine at Boots as a daily essential. It names no effect. |
| 1 | stance | promotes (0.62) | ad (alt unrelated) | Paid partnership, marked "Ad" in the caption. |
| 5 | stance | promotes (0.96) | ad | A spa selling a $90 lymphatic facial with a booking line and address. |
| 10 | health_claim | yes | no (alt yes) | A spa review anecdote with a brand tag. It asserts no health effect. |
| 10 | stance | promotes (0.67) | unrelated (alt ad) | Same post. It also got `lymphatic-detox` as its myth, which I judge wrong. |
| 13 | stance | promotes (0.90) | ad | A named product, "RogersHood ParaFy Parasite Cleanse", with "ASAP!". It is a sales line framed by fear of sushi. |
| 14 | stance | promotes (0.75) | ad | Same post as #13, Instagram copy. |
| 18 | health_claim | no | yes (alt no) | A shop story that implies sea moss helped a relative recover. The snippet alone ("Not just to sell sea moss...") has no claim. |
| 18 | stance | unrelated (0.95) | ad | The `decide()` rule forces `unrelated` when the health-claim probability is under 0.5, so the ad is lost. |
| 19 | stance | promotes (0.83) | ad (alt promotes) | A facialist advertising events and a training offer, with claims of lasting structural change. |
| 20 | stance | promotes (0.63) | ad | A shop listing for a seven-ingredient supplement. Sea moss is one ingredient. It was attached to the `sea-moss` myth. |

## 2. Candidate myths

Source: `SELECT id, title, claim, status, source_oriane_id FROM myths WHERE status = 'candidate'` [B1]. Topic reach comes from `docs/research/MYTH-CATALOG.md` lines 44 to 48 and `docs/research/ORIANE-FINDINGS.md` lines 17 to 25. I did not look up medical evidence, so "worth review" below means a topic a reviewer should look at, not a finding that the claim is false. Rule 4 in `CLAUDE.md` still needs a fetched source before any claim is shown.

| Candidate | Saved claim text | Source post | Topic worth review | Claim text usable | Verdict |
|---|---|---|---|---|---|
| `cortisol-face` | "By breakfast you have diagnosed cortisol face, dopamine fatigue, ADHD, and low testosterone." | #15, 444,614 views, a doctor who argues against self-diagnosis. Stance `debunks`. | Yes. Catalog: 69 videos, 4.6M views, exact phrases. | No. It is the debunker's own sarcastic line. Showing it as the myth would invert the post. | Keep the topic. Rewrite the claim from a post that promotes it. |
| `parasite-cleanse` | "Eat sushi you should be RogersHood ParaFy Parasite Cleanse ASAP!" | #14, 9,657 views, a brand sales line. I label it `ad`. | Yes. Catalog: 325 videos, 10.1M views, fuzzy phrases. | No. It names a brand and reads as a slogan. | Keep the topic. Drop the brand text. |
| `sea-moss` | "Strawberry sea moss gel" | #16, 6,541 views, one item in a morning-routine list. | Yes. Catalog: 659 videos, 19.4M views, exact phrase. | No. It is an ingredient, not a claim. | Keep the topic. Rewrite the claim. |

Counts in the table: topic worth review 3 of 3, usable claim text 0 of 3, usable source post 0 of 3.

Two knock-on effects, both from the same labeler path:
- A candidate id is offered to the model as a myth option on later posts (`labeler.label_pending`: `myths = {**brief.MYTHS, **store.myth_claims(con)}`). The junk claim `Strawberry sea moss gel` then attracts any sea moss post. #20, a seven-ingredient supplement listing, was attached to it.
- `store.list_candidates` ranks by `post_count`, the number of labels carrying that `myth_id`. Both `parasite-cleanse` and `sea-moss` show 2 posts. By the `label_pending` code and the `labeled_at` times, all 5 non-confirmed `myth_id` values (#13, #14, #15, #16, #20) were written by the seeding branch (`myth_id = candidate_id(...)`), not by the model matching a listed claim, because those candidates did not exist when the options were built. So the count reflects the mechanism, not independent evidence. [B2: `SELECT myth_id, COUNT(*) FROM labels GROUP BY 1`]

## 3. Failure patterns

| Pattern | Evidence | Source |
|---|---|---|
| Ads read as promotion | 7 of 8 stance errors. Spa service (#5), branded product line (#13, #14), event and training promo (#19), shop listing (#20), paid partnership (#1). Ad recall 4 of 11. | [A2, A3] |
| Commerce is common in this feed | 89 of 250 stored posts have a commerce cue in their text, 34 of 89 `lymphatic drainage` posts. | [H1] |
| A purchase or anecdote is read as a claim | #1 scored health claim 0.98 in both prompt variants. #10 scored 1.00. | [RUN v1, v2] |
| An implied testimonial is missed | #18 scored health claim 0.00 to 0.03 in all runs, and my own label was borderline. | [RUN] |
| Hedged, accurate claims count as `promotes` | #3, #12 and #21 say gentle massage may ease temporary puffiness. The question asks for stance on the sentence, not on the myth, so they land in the promoter reach. #3 even says it is not fat loss. | [A2], `labeler.questions` |
| Phrase is not the myth | Of 89 stored `lymphatic drainage` posts, 12 have a detox or fat cue. Of the 10 labeled ones, 0 do. Yet `derived.posts_of` counts a post by its phrase whenever `myth_id` is null. | [C6] |
| A debunk seeds a candidate | #15 debunks, but `labeler.label_pending` allows `stance in ("promotes", "debunks")`, so its sentence became the candidate claim. | [B1] |
| Snippet is a list item or a cut window | #16's snippet is one list item. #19's starts mid-word (`ush`). 87 of 250 snippets end without punctuation. | [H2] |
| Non-English | 1 of 250 snippets is more than 30% non-Latin letters. It is #3 (Thai) and it was labeled correctly at 0.99. This says non-English is rare in this feed. It says nothing about Latin-script languages other than English, which I could not detect. | [H3] |
| Recipes | 26 of 250 posts have a recipe cue. Only #16 is in the labeled set and its claim and myth were wrong. | [H4] |
| Sarcasm | One case, #15. The stance was right (debunks, 1.00). The harm was downstream, in the candidate text. Not enough cases to say more. | [B1] |
| True claims | See the hedged-claim row. The `dubious` answer handled them well under v1 (#3 0.08, #12 0.18, #21 0.14). | [RUN v1] |
| Run-to-run noise | Same v2 prompt, same post #6: health claim 0.15, then 0.98; dubious 0.10, then 0.92. #19 dubious 0.83, then 0.68. | [D5] |

Heuristic sources: **[H1]** commerce regex over snippet plus full text, 89 of 250, by phrase: lymphatic drainage 34 of 89, sea moss 20 of 53, berberine 14 of 39, parasite cleanse 9 of 30. **[H2]** `snippet` not ending in `.`, `!`, `?` or an ellipsis, 87 of 250. **[H3]** non-Latin letters over letters in `snippet`, greater than 0.3, 1 of 250. **[H4]** recipe regex, 26 of 250. **[C6]** detox or fat regex over full text of the 89 posts where `matched_query = 'lymphatic drainage'`: 12 hits, 0 among the 10 labeled.

Related: the copy holds 229 unlabeled posts, 113 of them with 1,000 or more views (`LABEL_MIN_VIEWS=1000` in the brain env). The 196 posts from the 20:23:44Z poll were not yet labeled at copy time. I did not investigate whether the labeler was running or failing. [Q2: `SELECT COUNT(*) FROM posts WHERE COALESCE(views,0) >= 1000 AND oriane_id NOT IN (SELECT oriane_id FROM labels)` = 113; `polls` row 49 has `new_posts` 196]

## 4. Proposed change and test

### What I changed in the prompt (v1)

Four edits and one new question, all in the questions object that `labeler.questions` builds. The full wording is in Appendix B.

1. **stance:** a sharper `ad` option ("made to sell or advertise a product, service, brand, shop or event", with price, booking, discount, listing, brand tag and "a business describing its own offer" as cues) and the instruction "check ad first".
2. **health_claim:** read the sentence together with `post_text`, and say that a purchase, price, booking line or plain use of a product is not a claim.
3. **myth:** require the same thing about the same substance, say that sharing a keyword or an ingredient is not a match, and pick none if unsure.
4. **dubious:** unchanged in meaning, with the modest-claim example kept.
5. **standalone_claim (new):** "Read alone, is claim_sentence a complete statement that something has a health effect?" with no for an ingredient, slogan, price line, question or story about a person.

v2 is v1 with the original `myth` question restored, one added clause on `health_claim` ("a product sold or described as good for energy, immunity, skin or the body counts"), and one added clause on `dubious` ("if the post states no effect at all, answer no"). I made v2 after reading the v1 run, so it is a second try, not an independent test.

### Test design

- Same 21 posts, same `state_for` text, same 6 listed myths (3 confirmed, 3 candidate), same `judge.Judge` code, one run per variant.
- Reference is my hand labels, strict and lenient.
- v1 was asked on all 21 posts. v2 was asked on 15 (#1, 5, 6, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20) because the budget could not cover 21 more. The 6 skipped posts (#2, 3, 4, 7, 15, 21) were right on both stored and v1, so for the all-21 v2 row I carried their v1 answers.
- I wrote the new wording after reading these same posts. The result is in-sample and likely better than it would be on new posts.

### Before and after

| Measure | Before (stored labels) | After v1 (21 posts) | After v2 (15 asked, 6 carried from v1) | Source |
|---|---|---|---|---|
| health_claim, strict | 18 of 21 (85.7%) | 17 of 21 (81.0%) | 17 of 21 (81.0%) | [D1] |
| health_claim, lenient | 21 of 21 (100%) | 20 of 21 (95.2%) | 21 of 21 (100%) | [D1] |
| stance, strict | 13 of 21 (61.9%) | 15 of 21 (71.4%) | 15 of 21 (71.4%) | [D2] |
| stance, lenient | 14 of 21 (66.7%) | 17 of 21 (81.0%) | 17 of 21 (81.0%) | [D2] |
| stance before the claim gate, lenient | 14 of 21 | 19 of 21 (90.5%) | 19 of 21 (90.5%) | [D2] |
| Candidates created from these 21 posts | 3, all unusable | 0 | 0 | [D3] |
| dubious vs hand (20 posts, #15 left out, cut at 0.6) | not stored, not measured | 14 of 20 (70.0%) | 13 of 20 (65.0%) | [D4] |

- **[D1, D2]** Computed by `labels` and the run files against Appendix A. "Before the claim gate" is the model's raw stance choice, ignoring `decide()` forcing `unrelated` when the health-claim probability is under 0.5. For the stored labels the raw choice is lost when the gate fires, so the stored figure is the gated one.
- **[D3]** I applied this rule to each run's answers: seed only if health claim is yes, stance is `promotes`, `dubious` is at least 0.6, `standalone_claim` is at least 0.5, and the phrase is not owned by a confirmed myth. No post qualifies. The three junk candidates fail on `standalone_claim`: #14 and #16 score 0.00 in both runs, and #15 scores 0.05 in v1 (it was not re-asked in v2, and it is also a debunk).
- **[D4]** I left #15 out because the claim it discusses is the one it debunks, so "dubious" has no clean hand label. The stored labels do not keep `dubious`, and the 40-call budget did not allow a re-run of the original prompt, so there is no before figure.

### What each edit did

| Edit | Reading of the runs | Keep? |
|---|---|---|
| ad-first stance | Fixed #1, #5, #19 strictly. Moved #8 and #10 from `promotes` to `ad`, which my alternative labels accept. #13 and #14 stay `promotes` (ad probability 0.05 in both runs): a brand line with no price or booking cue. | Yes |
| standalone_claim | 0.00 to 0.08 on the ingredient, slogan, shop and debunk posts, and 1.00 on 8 posts that state a real claim. It scored #9 (0.22, 0.04) and #11 (0.00, 0.00) low. #11 starts "Did you know", which the wording tells it to refuse as a question. | Yes, but reword the question case |
| health_claim wording | v1 lost #20 (a supplement listing, 0.12) and v2 got it back (1.00). v2 then gave #6 0.15 once and 0.98 on repeat. That is noise, not a real gain. | No evidence either way |
| myth wording | v1 attached #5, #9, #11 and #12 to `lymphatic-detox` on top of #10. Stored had only #10. Original wording in v2 attached #9 and #10. | No |
| dubious tweak | 14 of 20 in v1, 13 of 20 in v2. No gain. | No |

### Run-to-run noise [D5]

The two spare calls re-asked #6 and #19 with the identical v2 prompt. #6: health claim 0.15 then 0.98, dubious 0.10 then 0.92. #19: health claim 1.00 and 1.00, dubious 0.83 then 0.68. `judge.Judge._request` sets no temperature or seed. With one run per cell, treat a 1 or 2 post difference between any two columns as inside the noise. Only the stance gain (+2 strict, +3 lenient, +5 before the gate) and the candidate result are larger than that, and even they come from a single draw.

## 5. Recommendations, ranked by impact over effort

| Rank | Change | File and function | Evidence | Effort |
|---|---|---|---|---|
| 1 | Add the `standalone_claim` question. Seed a candidate only when stance is `promotes` and `standalone_claim` is at least 0.5. Have a person reject or rewrite the 3 existing candidates. | `services/brain/app/labeler.py`: `questions()` and the seeding branch of `label_pending()`; test in `services/brain/tests/test_labeler.py` | 3 of 3 live candidates unusable [B1]. 0 of 21 would seed under the new rule [D3]. | About 6 lines |
| 2 | Replace the `ad` wording and add "check ad first". Add "or tells people to buy or take a named brand product" for the #13 and #14 case (not tested). | `labeler.py`: `STANCES` and `questions()["stance"]` | Stance 13 to 15 strict, 14 to 17 lenient [D2]. | 2 strings |
| 3 | Count promoter reach, `top_video` and stance counts from labels whose `myth_id` equals the myth. Keep phrase matching only for the topic volume, and name it that in the UI note. Today a labeled post with a null `myth_id` still counts by phrase. | `services/brain/app/derived.py`: `posts_of()` and its callers `summary_of()`, `myth_detail()`, `impact()` | 12 of 89 phrase posts have a detox or fat cue, 0 of 10 labeled [C6]. | Small code, but it changes the radar numbers, so Vi and Kris should agree first. Not tested. |
| 4 | Treat stance confidence below 0.7 as unreviewed (store `unrelated` or hide from counts). | `labeler.py`: `decide()`, or `derived.py`: `load_posts()` | 3 of 3 posts under 0.7 were wrong [A4]. The cut was chosen from the same 3 posts. | 2 lines |
| 5 | Store `dubious`, `standalone_claim` and a `prompt_version` on each label. | `services/brain/app/store.py`: `SCHEMA` (labels) and `upsert_label()`; `labeler.py`: `label_pending()` | This report had no before figure for `dubious` because it is not stored. `CREATE TABLE IF NOT EXISTS` will not add columns, so this needs an `ALTER TABLE`. | Small |
| 6 | Cut noise where it matters: try `temperature` 0 in the payload (untested, the model may reject it), or ask twice and average only for posts that would seed a candidate or become `top_video`. | `services/brain/app/judge.py`: `Judge.ask()` payload | #6 health claim 0.15 vs 0.98 on one prompt [D5]. | Small to medium |
| 7 | Do not ship the v1 `health_claim`, `myth` and `dubious` rewrites. | `labeler.py`: `questions()` | No gain or worse [Section 4 table]. | None |
| 8 | Stop cutting snippets at list items and mid-word windows. | `services/brain/app/poller.py`: `snippet_for()` | #16 and #19 [H2]. Low impact on labels. | Small |

The best-supported prompt to try first is the original `health_claim`, `myth` and `dubious` questions, plus the v1 `stance` and `standalone_claim`. I did not run that exact mix. I read it off the v1 and v2 answers.

## 6. Limits and what I did not check

- 21 posts, one rater, borderline calls marked. One post is 4.8 points of agreement.
- The prompt was tuned and tested on the same posts. Expect lower agreement on new posts.
- One run per variant. Noise was measured on 2 posts only.
- No before figure for `dubious`, and no hand label for `standalone_claim`. I read the `standalone_claim` scores against the post text.
- I did not check whether any myth is medically false and I fetched no sources. Rule 4 in `CLAUDE.md` still applies.
- Latin-script languages other than English cannot be seen with my non-Latin test. Sarcasm has one example.
- I did not label the 229 posts that have no label. The 113 with 1,000 or more views are the natural next sample.
- I did not find out why the 20:23:44Z poll's 196 new posts were unlabeled at copy time. `GET /feed?limit=500` on the live brain returned an error object, which I did not follow up.
- I did not change app code, the live database, or any file outside `docs/research/live-label-quality.md`. The DB copy and a `services/brain/.venv` I created for the dry run are both git-ignored.

## Appendix A. Every labeled post

Columns: hand labels are mine. `*` marks a borderline call with an accepted alternative (health claim alternatives: #1 yes, #6 no, #10 yes, #18 no; stance alternatives: #1 unrelated, #8 ad, #10 ad, #12 ad, #19 promotes, #21 ad). Views, platform and phrase come from `posts`. Model claim, stance and confidence come from `labels`. v1 stance is after the claim gate. Source: SQL over the DB copy [Q1] and the v1 run [RUN].

| # | Post id | Platform | Views | Phrase | Hand claim | Model claim | Hand stance | Model stance (conf) | v1 stance | Hand note |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | cnt_18deefe4 | instagram | 86,580 | berberine | no* | yes | ad* | promotes (0.62) | ad | Boots/Bettervits paid post (Ad); states use of berberine, no effect claim |
| 2 | cnt_1badc390 | instagram | 3,025 | sea moss | yes | yes | ad | ad (0.90) | ad | Herb shop sells sea moss and parasite/liver cleanse 'for better health' |
| 3 | cnt_20548c9a | instagram | 21,066 | lymphatic drainage | yes | yes | promotes | promotes (0.99) | promotes | Thai, hedged: gentle massage may reduce facial puffiness, says it is not fat loss; evidence-supported and modest |
| 4 | cnt_4790f552 | instagram | 2,171 | parasite cleanse | yes | yes | ad | ad (0.90) | ad | Same herb shop selling a parasite cleanse |
| 5 | cnt_508c338e | instagram | 1,804 | lymphatic drainage | yes | yes | ad | promotes (0.96) | ad | Spa sells a $90 lymphatic facial; puffiness claim is modest |
| 6 | cnt_6680a4f7 | instagram | 13,041 | mouth tape | yes* | yes | ad | ad (0.85) | ad | Discount for mouth tape; snippet has no claim, caption says sculpt while you sleep |
| 7 | cnt_80f1ef42 | instagram | 169,425 | lymphatic drainage | yes | yes | promotes | promotes (0.95) | promotes | Claims a tight jaw restricts lymphatic drainage and ages the face; phrase appears incidentally |
| 8 | cnt_91c33747 | instagram | 2,564 | lymphatic drainage | yes | yes | promotes* | promotes (0.88) | ad | Wellness routine, vague support claims, comment-for-link tool promo |
| 9 | cnt_990f1f5f | tiktok | 1,361 | lymphatic drainage | yes | yes | promotes | promotes (0.88) | promotes | Personal routine said to give glow; mild |
| 10 | cnt_99bc7743 | instagram | 11,041 | lymphatic drainage | no* | yes | unrelated* | promotes (0.67) | ad | Spa treatment review anecdote, brand tagged, no health effect asserted |
| 11 | cnt_9b160307 | tiktok | 1,669 | lymphatic drainage | yes | yes | promotes | promotes (0.95) | promotes | Says facial massage clears stagnant fluid and gives clearer complexion; slight overclaim |
| 12 | cnt_a03e9fd7 | instagram | 11,386 | lymphatic drainage | yes | yes | promotes* | promotes (0.96) | promotes | Spa-style post, hedged temporary puffiness claim |
| 13 | cnt_a3a17902 | tiktok | 2,032 | parasite cleanse | yes | yes | ad | promotes (0.90) | promotes | Branded parasite cleanse sold with sushi fear framing |
| 14 | cnt_a58c8e13 | instagram | 9,657 | parasite cleanse | yes | yes | ad | promotes (0.75) | promotes | Same post as 13, Instagram copy |
| 15 | cnt_a87e6016 | instagram | 444,614 | cortisol face | yes | yes | debunks | debunks (1.00) | debunks | Doctor argues self-diagnosing cortisol face from social media is wrong; ends with a lead magnet |
| 16 | cnt_b3951f3e | instagram | 6,541 | sea moss | yes | yes | promotes | promotes (0.83) | promotes | Morning ritual list says it gives glowing skin and a happy gut; snippet alone is only an ingredient |
| 17 | cnt_ba59d18a | tiktok | 1,119 | sea moss | yes | yes | ad | ad (1.00) | ad | Marketplace listing for sea moss gel, immune support wording |
| 18 | cnt_c34082da | instagram | 1,527 | sea moss | yes* | no | ad | unrelated (0.95) | unrelated | Shop story implying sea moss helped a relative recover; snippet itself is a shop mission line; own-illness style testimonial |
| 19 | cnt_e5ebc4d0 | instagram | 1,135 | lymphatic drainage | yes | yes | ad* | promotes (0.83) | ad | Facialist event and training promo, claims lasting structural change and cellular effects |
| 20 | cnt_eeb1d250 | tiktok | 1,049 | sea moss | yes | yes | ad | promotes (0.63) | unrelated | Shop listing for a multi-ingredient supplement; sea moss is one of 7 ingredients |
| 21 | cnt_feae7124 | instagram | 77,418 | lymphatic drainage | yes | yes | promotes* | promotes (0.98) | promotes | Education post with academy funnel and disclaimer; modest claim |

## Appendix B. Prompt wording tested

Only the changed parts are shown. The state sent with each post is unchanged (`labeler.state_for`: `claim_sentence`, `matched_phrase`, `post_text` up to 1,500 characters). The system prompt in `judge.py` is unchanged.

**stance options (v1 and v2)**
- `ad`: "The post is made to sell or advertise a product, service, brand, shop or event: it has a price, a booking or discount line, a shop or marketplace listing, a brand tag or paid partnership, or a business describing its own offer. Choose ad even when the post also states the claim."
- `promotes`: "Not an ad. The person presents the claim as true or tells others to act on it, as advice, education or a personal routine."
- `debunks`: "The post disputes the claim, corrects it or warns against it."
- `unrelated`: "The post takes no position on the claim, or claim_sentence is not a health claim."
- Instruction: "Check ad first: if the post is made to sell something, answer ad. Otherwise, what stance does the post take on the claim in claim_sentence?"

**standalone_claim, new (v1 and v2)**
"Read alone, is claim_sentence a complete statement that something has a health effect, such as 'X cures Y'? Answer no for an ingredient or product name, a slogan, a price or booking line, a question, or a story about a person."

**health_claim**
- v1: "Read claim_sentence together with post_text. Does the post say or imply that something has an effect on health or the body, or tell people to take, use or do something for health or looks? A purchase, a price, a booking line, or a plain mention of using a product with no effect stated is not a health claim."
- v2 adds: "A product sold or described as good for energy, immunity, skin or the body counts." and reorders the last sentence.

**myth (v1 only)**
"Which listed claim does claim_sentence restate? It must say the same thing about the same substance or practice. Sharing a keyword is not enough, and a product that only appears in a list of ingredients does not match. Pick none if unsure." v2 restores the original question.

**dubious**
Original text kept. v2 adds: "If the post states no effect at all, answer no."

## Appendix C. Variant answers per post

Each cell is: health-claim probability / raw stance choice / dubious probability / standalone_claim probability / myth choice. Source: [RUN]. Hand dubious is my label, left out for #15.

| # | Hand dubious | v1: claim / raw stance / dubious / standalone / myth | v2: claim / raw stance / dubious / standalone / myth |
|---|---|---|---|
| 1 | no | 0.98 / ad / 0.94 / 0.02 / none | 0.98 / ad / 0.90 / 0.02 / none |
| 2 | yes | 1.00 / ad / 1.00 / 0.00 / none | not re-asked |
| 3 | no | 1.00 / promotes / 0.08 / 1.00 / none | not re-asked |
| 4 | yes | 1.00 / ad / 1.00 / 0.00 / none | not re-asked |
| 5 | no | 1.00 / ad / 0.30 / 1.00 / lymphatic-detox | 1.00 / ad / 0.35 / 1.00 / none |
| 6 | yes | 1.00 / ad / 0.98 / 0.00 / mouth-taping | 0.15 / ad / 0.10 / 0.02 / none |
| 7 | yes | 1.00 / promotes / 0.93 / 1.00 / none | not re-asked |
| 8 | no | 1.00 / ad / 0.72 / 1.00 / none | 1.00 / ad / 0.58 / 1.00 / none |
| 9 | no | 0.99 / promotes / 0.93 / 0.22 / lymphatic-detox | 0.99 / promotes / 0.88 / 0.04 / lymphatic-detox |
| 10 | no | 1.00 / ad / 1.00 / 1.00 / lymphatic-detox | 1.00 / ad / 1.00 / 0.00 / lymphatic-detox |
| 11 | no | 1.00 / promotes / 0.35 / 0.00 / lymphatic-detox | 1.00 / promotes / 0.18 / 0.00 / none |
| 12 | no | 1.00 / promotes / 0.18 / 1.00 / lymphatic-detox | 1.00 / promotes / 0.00 / 1.00 / none |
| 13 | yes | 1.00 / promotes / 1.00 / 0.00 / parasite-cleanse | 1.00 / promotes / 1.00 / 0.00 / parasite-cleanse |
| 14 | yes | 1.00 / promotes / 1.00 / 0.00 / parasite-cleanse | 1.00 / promotes / 1.00 / 0.00 / parasite-cleanse |
| 15 | n/a | 0.98 / debunks / 0.99 / 0.05 / cortisol-face | not re-asked |
| 16 | yes | 0.99 / promotes / 0.99 / 0.00 / sea-moss | 0.99 / promotes / 0.99 / 0.00 / sea-moss |
| 17 | yes | 0.96 / ad / 0.76 / 0.08 / sea-moss | 1.00 / ad / 0.50 / 0.00 / none |
| 18 | yes | 0.00 / ad / 0.00 / 0.00 / sea-moss | 0.03 / ad / 0.02 / 0.01 / none |
| 19 | yes | 1.00 / ad / 0.18 / 1.00 / none | 1.00 / ad / 0.83 / 1.00 / none |
| 20 | no | 0.12 / ad / 0.15 / 0.02 / none | 1.00 / ad / 0.85 / 0.00 / none |
| 21 | no | 1.00 / promotes / 0.14 / 1.00 / none | not re-asked |
