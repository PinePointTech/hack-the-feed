# Live feed coverage (task R1)

Written Nov 9, 2026, about 20:30 UTC (12:30 PM PT). Owner: Vi. Read-only research: no app code changed.

Question: why did 47 polls store only 54 posts, why is Oriane's newest post about 3 days old, and how do we make the feed feel live and catch new myths, not only the 19 fixed phrases.

## Short answer

1. **The poller stores 61% of what Oriane holds for our 19 phrases.** Oriane has 412 matching posts for Oct 26 to Nov 6 (S2). We store 250 (SQL1). The two batches that exceed 100 results each lose their oldest posts because the poller never pages. Paging works (S4). This is the biggest and cheapest fix.
2. **Oriane's text search lags about 3 days, and days stay thin for about 6.** The general index is current to the hour (S5), but caption search returns about 1% of a normal day's volume for Nov 7 to Nov 9 (S7 against S9). So the "47 polls, 54 posts" result is not a polling problem. Polls 2 to 48 found zero new posts over 11.8 hours (SQL5). Polling faster will not help.
3. **The only route that returned fresh posts is searching by creator.** 15 known creators gave 20 posts published after Nov 6 14:00 UTC, the newest published at 19:14 UTC, about an hour before the search (S12). The same date range gave 0 exact-phrase matches (S2) and 2 off-topic fuzzy matches (S8).
4. **The pipeline cannot find a new myth by design.** A post is stored only if it contains a watchlist phrase (`poller.to_post`), and a candidate myth is named after that phrase (`labeler.label_pending`). All 6 candidates in the DB are watchlist phrases (SQL6).
5. **Drop non-English posts in the query, not after.** `captionLanguage includes ["en"]` works, costs no extra search and removes 42 of 412 posts, 10.2% (S10, S11). A script check on stored text would catch only 9 of 41 non-English captions (S11 analysis).
6. **Ranking today is "last batch, then views".** `store.list_feed` sorts by `fetched_at` then `views`, and only 2 distinct `fetched_at` values exist in 250 posts (SQL7). Views history is overwritten on every poll, so view velocity cannot be computed yet (`store.upsert_posts`).

## How to read the numbers

- **S1 to S15** are the 15 live Oriane searches I ran, the maximum allowed. All were REST `POST` calls to the brain's `ORIANE_SEARCH_URL` with the brain's key, via a scratch script outside the repo. Query shapes are in the appendix. The window is `publishedAt after 2026-10-26` (the poller's now minus 14 days) unless noted.
- **SQL** numbers come from a copy of the live DB taken at 2026-11-09 20:24 UTC (49 polls, 250 posts), opened read-only. The original was never written.
- Credits per search are not shown in any response, so I cannot give a credit cost. The tool description says successful searches consume workspace credits.

## 1. How much Oriane holds, and how much we store

### 1.1 Total against stored

| Measure | Value | Source |
|---|---|---|
| Posts matching any of the 19 phrases (exact, transcript, caption or on-screen text), any language | 412 posts, 13,322,191 views | S2 |
| Posts stored | 250 | SQL1 |
| Batch 1 (lymphatic drainage, 4 mouth tape phrases, garlic tumor): Oriane matches | 179 | S3 |
| Batch 1 posts stored | 100 | SQL2 |
| Batch 2 (garlic cancer, sea moss, castor oil pack, belly button oiling, berberine, nature's ozempic): Oriane matches | 181 | S15 |
| Batch 2 posts stored | 98 | SQL2 |
| Batches 3 and 4 stored | 52 and 0 | SQL2 |
| Batch 1 page 2 (`offset=100`): posts returned, posts already stored, views | 79, 0, 1,419,608 | S4 against the DB ids |

The 162 missing posts (412 minus 250) are 79 from batch 1 and 83 from batch 2 (181 minus 98). That sum is 162. Batches 3 and 4 hold 52 stored posts against 52 left over (412 minus 179 minus 181), so the 100-result cap on batches 1 and 2 explains the gap. The overlap between batches is not measured, so treat this as consistent, not proven. The poller already knew: `poller.run_poll` sets the error "a search hit the 100-result limit" (poll 49, SQL5) and carries a `shortcut:` comment that says no paging yet.

The posts lost are the oldest ones, so older days are undercounted most. Stored posts for Oct 26 and Oct 27 are 11 and 10 (SQL4), but page 2 of batch 1 alone held 58 posts for Oct 26 and 21 for Oct 27 (S4).

### 1.2 Per phrase

Oriane per-phrase totals were measured only for "lymphatic drainage": 160 posts over Oct 26 to Nov 6, any language (S1; its aggregation reports 4,127,111 views for all 160). The other 18 phrases were not measured separately because of the 15-search cap. Stored posts per phrase, which are capped and so a lower bound (SQL3):

| Phrase | Stored | Views |
|---|---|---|
| lymphatic drainage | 89 | 2,835,722 |
| sea moss | 53 | 4,951,396 |
| berberine | 39 | 323,945 |
| parasite cleanse | 30 | 235,280 |
| tallow skincare | 12 | 237,867 |
| mouth tape | 6 | 70,070 |
| castor oil pack | 6 | 502,851 |
| mouth taping | 5 | 4,642 |
| cortisol face | 4 | 582,644 |
| cortisol belly, cortisol detox, cortisol cocktail | 2 each | 236,057, 2,145 and 19,182 |

No other phrase has a stored post (SQL3). "Garlic tumor" and "garlic cancer" have none, which is why the live radar reads 0 videos for garlic-tumor (GET `/radar` on the running brain at 20:29 UTC).

### 1.3 Per day

Stored posts by published day, newest first (SQL4), next to the lymphatic-drainage count per day from the newest 100 of 160 (S1):

| Day (UTC) | Stored, all phrases | Lymphatic drainage in Oriane (S1) |
|---|---|---|
| Nov 6 | 3 | 1 |
| Nov 5 | 5 | 1 |
| Nov 4 | 9 | 3 |
| Nov 3 | 9 | 0 |
| Nov 2 | 30 | 11 |
| Nov 1 | 30 | 13 |
| Oct 31 | 26 | 8 |
| Oct 30 | 36 | 13 |
| Oct 29 | 40 | 9 |
| Oct 28 | 41 | 27 |
| Oct 27 | 10 | 14, page cut off |
| Oct 26 | 11 | not in the page |

Oct 28 to Nov 2 averages 13.5 lymphatic-drainage posts a day (S1: 27, 9, 13, 8, 13, 11). Nov 3 to Nov 6 averages 1.25 (0, 3, 1, 1).

The radar's "15 posts, 284,228 views" figure for lymphatic drainage was from before the poll-49 backfill. The live radar now says 35 posts and 798,496 views for window Oct 31 to Nov 6 (GET `/radar`), and SQL8 gives the same 35 and 798,496 (37 and 826,949 before removing posts labeled "unrelated").

### 1.4 Index lag

Evidence, all from live searches except the poll history:

| Check | Result | Source |
|---|---|---|
| Newest 100 posts in all of Oriane (no text filter) | All Instagram, published Nov 9 19:05 to 19:42 UTC. 188,133 posts published since Nov 3 | S5 |
| Newest post matching any watchlist phrase | Nov 6 13:40:50 UTC, which is 3.3 days before this check | S2 |
| Caption word "health", Oct 28 to Oct 30 (3 days) | 14,856 posts, about 4,950 a day | S9 |
| Caption word "health", Nov 7 to Nov 9 19:14 UTC (2.8 days) | 146 posts, about 52 a day, about 1% of the earlier rate | S7 |
| Caption-only exact match, 19 phrases, Nov 3 to Nov 6 | 9, 10, 5, 3 posts per day, 27 total | S6 |
| Fuzzy caption match on 8 phrase heads, Nov 7 onward | 2 posts, both off topic (a cruise ad, a podcast about tallow vs lard) | S8 |
| Hashtag filter, 7 health words, Nov 4 onward | 27, 25, 10, 1, 1, 1 posts per day for Nov 4, 5, 6, 7, 8, 9 | S13 |
| New posts found by polls 2 to 48 (08:17 to 20:08 UTC, 11.8 hours) | 0 | SQL5 |
| First new post after that: poll 50 at 20:38:45 UTC found 1 ("mouth tape", Instagram), published Nov 6 22:12:04 UTC, so it reached search about 2.9 days after publication. The data horizon moved from Nov 6 13:40 to Nov 6 22:12 | 1 | SQL14 |

Reading: new posts reach the general index within the hour, but caption, hashtag and transcript search return almost nothing for the last 3 days, and a day looks complete only after about 6 days (Nov 3 holds 9 stored posts against about 30 a day for Oct 28 to Nov 2, SQL4). The text lag is not specific to transcripts, because caption-only search shows the same stop on Nov 6 (S6). I did not find the cause in any response or doc, so it is unverified. A question for the Oriane team is whether text fields are indexed in daily batches.

As the feed sees it: the newest watchlist post is about 3 days old, and polls cannot make that newer.

### 1.5 Paging and totals

- Every response carries `metadata.pagination` with `offset`, `limit` and `totalCount` (S1 to S15).
- `limit` is capped at 100 (tool schema). `offset=100` returned the remaining 79 of 179 (S4).
- `data.aggregations` (total and average views, likes, interactions) cover every match, not just the page. S1 reports 4,127,111 total views for all 160 posts while returning 100.
- A `limit=1`, `projection=basic` search returns the count and total views in about 2.4 KB (S2, S9, S10, S15). That is an exact trend counter that does not depend on how many posts we stored.

### 1.6 What a search costs in time

| Measure | Value | Source |
|---|---|---|
| Latency of 15 REST searches | 0.23 to 1.14 s, median 0.54 s | S1 to S15 |
| Payload, `basic` | 137 KB for 79 posts, 186 KB for 100 posts | S4, S1 |
| Payload, 100 posts, `default` (what the poller uses) | 308 KB | S3 |
| Payload, `limit=1` | about 2.4 KB | S2 |
| Brain polls: 4 searches in | 0 to 3 s in 47 of 49 polls | SQL5 |
| Brain polls with a ReadTimeout | poll 45 took 91 s, poll 47 took 64 s | SQL5 |
| Projection `full` | not measured, tool description warns frames make it very large | tool schema |

The brain's own cap is 20 searches per hour (`config.oriane_max_searches_per_hour`). I found no Oriane-side rate limit in any response.

## 2. Finding emerging claims beyond the watchlist

### 2.1 Why the current design cannot

- `poller.to_post` returns `None` unless a watchlist phrase appears in the post's own text, so no post outside the 19 phrases is ever stored.
- `labeler.label_pending` names a candidate `candidate_id(post["matched_query"])`, the watchlist phrase. The 6 candidates in the DB are cortisol face, parasite cleanse, sea moss, castor oil pack, cortisol belly and berberine, each a watchlist phrase (SQL6).
- The judge only answers `noul` and `choice` questions (`labeler.questions`), so it cannot write a new phrase, which is the right default for "no source, no claim".

### 2.2 Options considered

| Option | Tested | Verdict |
|---|---|---|
| Search by known creators (profile handles) | Yes, S12 | Best for freshness. Weak per-post signal, needs labels |
| Generic health hashtags, then mine phrases | Yes, S13 | Poor. Same lag as text, one product campaign dominated |
| Grow the watchlist from hashtags and phrases in stored posts | Offline on 250 posts, plus S14 | Cheap and plausible, needs a person to approve |
| Semantic similarity (`create_asset` text, `visualSimilarity` filter) | No | Skipped. The tool describes it as similarity to an image or text asset, scored on visuals, not on a spoken claim. Try only if budget remains |
| Search health creator profiles by bio (`search_profiles`) | No | Good seed list source: bio fuzzy "nutritionist", followers over 50,000. Not run |
| Oriane hashtag or music discovery | No | The Oriane MCP server instructions mention discovery over hashtags and music, but the tools in this session are only `search_contents`, `search_profiles` and `create_asset`. Ask Oriane for the REST route |

### 2.3 Test A: creator-first (S12)

Query: no text filter, `profileHandle exactMatch` any of 15 handles taken from the stored posts labeled promotes or ad (mrsrogers.hood, toxins_in_children, mumsmoss, sammie.rae_fitness, milamiamor_official, valeriiaveksler, troo_herbs, theskinnyconfidential, meet_madeleine, instyle_helen, vegan.auntie, mrsrogershood, queenofthethrones, rogershoodapothecary, da_moss_plug), `publishedAt after 2026-10-26`, newest first, limit 100.

| Result | Value |
|---|---|
| Matching posts in 14 days | 335 (page 1 returned 100) |
| Newest post | Nov 9 19:14 UTC, about an hour before the search |
| Posts published after Nov 6 14:00 UTC | 20 (Nov 9: 5, Nov 8: 6, Nov 7: 6, Nov 6 after 14:00: 3) |
| Of those 20, containing a watchlist phrase | 0 |
| Of the 100, containing a watchlist phrase | 17 |
| Posts in the 100 from one handle (troo_herbs) | 45 |
| Posts in the 100 with no view count | 14 (4 of the 20 newest) |
| Already in our DB | 15 of 100 |

So searching creators bypasses the text lag (posts from the last hour appear) but mostly returns content outside the watchlist: general health tips from a herb brand, an outfit post. Of the 100, 83 have no watchlist phrase, and only a labeler can say whether any is a health claim. That makes this the only tested way to show fresh posts, and the only tested way to meet claims we have not named.

### 2.4 Test B: hashtag-seeded (S13)

Query: `hashtags includesFuzzy` any of detox, cleanse, holistic, naturalremedy, toxins, healinghacks, guthealth; `captionLanguage en`; Nov 4 onward; sorted by views; limit 100.

| Result | Value |
|---|---|
| Matching posts | 65 (all fit in one page) |
| Posts per day | Nov 4: 27, Nov 5: 25, Nov 6: 10, Nov 7 to 9: 1 each |
| Containing a watchlist phrase | 1 |
| Top hashtags | #guthealth 25, #digestivehealth 9, #holistichealth 7 |
| Top mined two-word phrases (4 or more posts) | "gut health" 6, "advanced digestive" 4, "digestive enzymes" 4 |

The tag filter has the same lag as caption search. The top mined phrases come from one supplement campaign (#advancedigestiveenzymes appears on 3 posts). Counting phrases across 65 posts finds ads, not myths.

### 2.5 Offline test: grow the watchlist from stored posts (SQL9 and S14)

Hashtags in the 250 stored posts that no watchlist phrase names: #wormqueen 6, #worms 5, #deworm 5, #parasites 5, #guasha 5, #faceyoga 5, #vibrationplate 4, #moldpoisoning 3, #moldexposure 3, #puffyface 3 (SQL9). Some belong to existing phrases ("parasite cleanse" posts carry #wormqueen).

Live check of 6 terms taken from that list (S14, English captions, exact phrase in any text field, Oct 26 to Nov 6): 294 posts in total. In the top 100 by views, matched posts were: gua sha 57 (5,177,615 views), face yoga 21 (1,006,343), deworm 12 (288,821), vibration plate 6 (471,034), puffy face 3 (90,467), mold poisoning 1 (64,493). Gua sha and face yoga are beauty routines, not clear myths. "Deworm" is the plausible myth lead. So most hashtag leads are volume without a false claim, and a person or the dubious gate has to decide.

### 2.6 Recommended design for new myths

1. Keep the 19 phrases as the "known" tier.
2. Add a creator lane (2.3) and store those posts with a `creator` marker in `matched_query`, plus a snippet of the first sentence of the caption (still an exact substring).
3. In the labeler, add a `choice` question whose options are n-grams taken from the post's own claim sentence, so the output stays an exact substring (rule 4). Store the choice as `claim_phrase` on the label.
4. When the same `claim_phrase` appears from 3 or more different handles in 14 days and the judge rated it dubious, show it on the review page as a proposed phrase. A person approves it into the watchlist. Nothing is added automatically.

The thresholds in step 4 (3 handles, 14 days) are my guess, not measured.

## 3. Ranking a social-style feed

### 3.1 What exists

- `store.list_feed` orders by `fetched_at DESC, views DESC, oriane_id`. All 250 posts share two `fetched_at` values: 196 at 2026-11-09 20:23:44 and 54 at 08:02:53 (SQL7). The feed is therefore "the latest backfill by views, then the earlier batch". `published_at` is not used.
- `store.upsert_posts` keeps the first `fetched_at`, snippet and match, but overwrites `views`, `thumbnail_url`, `url` and `raw_json` on each poll. Previous view counts are lost, so velocity across polls cannot be computed today.
- The web hook `useFeed` pulls `GET /feed` every 60 s and `mergeFeed` puts unseen ids behind an "N new posts" pill. That interaction is right, but it has nothing to show: 0 new posts in 47 polls (SQL5).
- 57 of 250 posts have no view count (SQL10). 117 of 250 posts (47%) are unlabeled: 57 with no view count, 59 under 10,000 views and 1 above (SQL10). `store.unlabeled_posts` treats a missing count as 0, so a post with no count never passes `label_min_views` (10,000, `config.label_min_views`). 60 of the 61 posts at or above 10,000 views are labeled, and 73 posts under 10,000 are labeled too, presumably from earlier runs with a lower threshold (SQL10).

### 3.2 Do view counts move between polls?

Yes, for some posts. I compared two DB copies taken before and after poll 50 (SQL14: copy at 20:24 UTC after poll 49, copy at 20:38:54 UTC after poll 50, 15 minutes apart, 250 posts in both):

- 5 of 250 posts had a different view count (2%), with a total absolute change of 331,803 views.
- The largest change was one post from 882,900 to 1,200,000 views. The round new number suggests Oriane reports some large counts rounded, so small gains on big posts may not show.
- The other four changed by 7,363, 5,059, 2,168 and 104 views.
- No post lost its count or gained one.

So a 15-minute gap shows movement on only a few posts. Velocity needs history over hours to be meaningful, which is why recommendation 6 says to start storing it now. One interval is too small a sample to set a threshold.

### 3.3 Recommended rank

Because the index trails by about 3 days, age must be measured from the newest day Oriane has, as `derived.data_end` already does, not from the wall clock. Otherwise every post is "3 days old" and recency adds nothing.

Suggested order for the top of the feed:

1. Posts newer than the data end minus 72 hours, newest `published_at` first, with a per-handle cap of 2.
2. Then by view velocity once history exists: views gained per hour over the last 2 or more polls, with likes, comments and shares per hour as the fallback when views are null.
3. Then by total views. Do not hide unlabeled posts, they are 47% of the stored set (SQL10).

Do not invent a score in the UI. Show the plain reasons: "newest", "gaining views", "most viewed".

### 3.4 Dedupe

- The same post across polls is already handled by the `oriane_id` primary key.
- 250 posts hold 232 distinct snippets, so 18 posts repeat another post's text, across 12 repeated snippets (SQL11). Creators repost: `ORIANE-FINDINGS.md` records barlowherbal posting the same clip on Oct 10 and Oct 22.
- 250 posts come from 186 handles, and the 5 biggest handles hold 31 posts, 12.4% (SQL11).

Collapse posts with an identical normalized snippet from the same handle into the newest one, and cap each handle at 2 in the first 20 slots.

### 3.5 What to show between polls

The text lane changes only when Oriane's index fills, which happened 0 times in 11.8 hours (SQL5). So between polls the feed should show things that really change:

- Time since the last check and the data horizon ("Oriane's search runs to Nov 6 13:40 UTC"), computed from `max(published_at)`. This is honest and it explains why the top post is old.
- Labels arriving on posts already shown. The labeler runs after each poll and `mergeFeed` already refreshes a post's label.
- View gains, once history exists.
- Posts from the creator lane, which change hourly (S12).

Faking liveness (shuffling, or replaying old posts as new) would break the rule that every number has a source.

## 4. Keeping non-English posts out cheaply

| Option | Result | Source |
|---|---|---|
| Server-side `captionLanguage: {includes: ["en"]}` in the query | Works. 370 of 412 posts are English, 42 are not, 0 have no language | S10 and S11 against S2 |
| Local script check (share of ASCII letters) on stored text | Catches only 9 of 41 non-English captions, because 32 are Latin script (Spanish, German, Turkish, Indonesian). Only 1 of 250 stored snippets is non-ASCII | S11 analysis, SQL12 |
| Local stopword share | Separates some Spanish from English, but 6 of the 32 Latin-script captions still look English, and short captions carry no signal | S11 analysis |

Known false positives of the server filter: short English captions that are only hashtags or a few words were tagged non-English (for example "#lymphaticdrainage #detoxbymariana #lmt", "LFG (again!!)", "Pre-workout breakfast", "Sooo whatcha being for Halloween!?") (S11). A hashtag-only caption has no claim sentence anyway, so losing it costs nothing for the claim feed. Transcript language filtering exists (`transcriptLanguage`) but I did not test it. A creator-lane search can use the same `captionLanguage` filter (S13 did).

15 of the 42 non-English posts are in our DB (SQL13), so they already reach the labeler and spend labeling budget.

## 5. Recommendations, ranked by impact over effort

| # | Change | File and function | Effort | Evidence |
|---|---|---|---|---|
| 1 | Page each batch with `offset` until `totalCount` or a page cap. After the first full backfill, use `after = newest stored published_at minus 2 days` so later polls stay under 100 | `services/brain/app/poller.py`: `run_poll` (loop), `build_query` (window). `oriane.search` already returns the pagination metadata | Small | 162 of 412 posts missing (S2, SQL1), page 2 works (S4) |
| 2 | Add `captionLanguage: {includes: ["en"]}` to the query filters | `services/brain/app/poller.py`: `build_query` | Tiny | 10.2% of results are non-English (S10, S11) |
| 3 | Return the data horizon and show it: `data_through = max(published_at)` in `/feed`, and a line in the feed header | `services/brain/app/main.py`: `get_feed`; `apps/web/src/lib/feed.ts`: `FeedResponse`; `apps/web/src/app/feed/FeedView.tsx` | Tiny | Newest watchlist post is 3.3 days old (S2); a feed that says "live" would be wrong |
| 4 | Rank by recency from the data end, cap 2 per handle, collapse identical snippets | `services/brain/app/store.py`: `list_feed` | Small | 2 distinct `fetched_at` (SQL7), 18 repeated posts (SQL11) |
| 5 | Creator lane: one search per poll over the top handles from labeled promotes or ad posts, with a snippet fallback and a `creator` marker instead of a phrase | `poller.py`: new `creator_query`, `to_post` (snippet fallback), `run_poll`; `store.py`: a `top_creators` query | Medium | 20 fresh posts that no phrase search returns (S12) |
| 6 | Keep view history: a `post_views(oriane_id, polled_at, views)` table written in `upsert_posts` when views change, then rank by gain per hour | `services/brain/app/store.py`: `SCHEMA`, `upsert_posts`, `list_feed` | Medium | History is overwritten today; start collecting early because velocity needs days |
| 7 | Slow the text lane to hourly and spend the saved searches on paging and the creator lane | `services/brain/app/config.py`: `poll_interval_minutes`; `main.py`: `poll_loop` | Tiny | 0 new posts in 47 polls (SQL5). The cap is 20 per hour and 4 batches per 15-minute poll use 16 |
| 8 | Exact trend counts from `limit=1` aggregation searches per window instead of counting stored posts | `services/brain/app/derived.py`: `summary_of`, `radar` (needs an Oriane client call) | Medium | Aggregations cover all matches (S1). Stored counts are a lower bound (SQL3) |
| 9 | New-myth path: `claim_phrase` choice question, stored on the label, proposed on the review page after 3 handles in 14 days | `services/brain/app/labeler.py`: `questions`, `label_pending`; `store.py`: labels column and `add_candidate`; review page in `apps/web/src/app/desk/review` | Medium to large | Candidates equal watchlist phrases today (SQL6, 2.1). Depends on 5, because the text lane has no recent posts |
| 10 | Label posts with no view count by likes, comments and shares instead of skipping them, and raise `label_max_per_hour` only if the creator lane grows | `services/brain/app/store.py`: `unlabeled_posts`; `config.py` | Tiny | 57 posts have no view count and are never labeled (SQL10); the cap is 200 labels an hour |

Lane note: items 1, 2 and 4 to 10 touch `services/brain/**` and `data/**`, which CLAUDE.md assigns to Kris's sessions. Item 3 spans the brain and the web app. Confirm who edits the brain before starting.

## 6. What I did not check

- Per-phrase Oriane totals for 18 of 19 phrases (15-search cap).
- Whether Oriane indexes text in daily batches. Ask Oriane.
- Credit cost of a search (not in responses).
- `transcriptLanguage` and `projection full` (no budget).
- The semantic similarity route and `search_profiles` for seeding creators.
- Overlap between batches (the 162-post reconciliation is consistent, not proven).
- Whether posts from the 15 creators are health claims. I counted watchlist hits, I did not label them.

## Appendix: queries

All searches: `POST ORIANE_SEARCH_URL?sort=...&projection=...&limit=...&offset=...`, body as below. "Text(P)" means `{operator: or, filters: {transcript, caption, onScreenText: {includesExactly: {operator: or, values: P}}}}`.

| ID | sort, projection, limit, offset | Body |
|---|---|---|
| S1 | publishedAt desc, basic, 100, 0 | `publishedAt after 2026-10-26` and Text(["lymphatic drainage"]) |
| S2 | publishedAt desc, basic, 1, 0 | same window and Text(all 19 phrases in `data/watchlist.json`) |
| S3 | publishedAt desc then viewsCount desc, default, 100, 0 | same window and Text(batch 1, the first 6 phrases) |
| S4 | same sort, basic, 100, 100 | same as S3 |
| S5 | publishedAt desc, basic, 100, 0 | `publishedAt after 2026-11-03`, no text filter |
| S6 | publishedAt desc, basic, 100, 0 | `publishedAt after 2026-11-03` and `caption includesExactly` all 19 phrases |
| S7 | publishedAt desc, basic, 5, 0 | `publishedAt after 2026-11-07` and `caption includesFuzzy ["health"]` |
| S8 | publishedAt desc, default, 100, 0 | `publishedAt after 2026-11-07` and `caption includesFuzzy` of 8 phrase heads (lymphatic drainage, sea moss, berberine, parasite cleanse, castor oil pack, tallow skincare, mouth taping, cortisol face) |
| S9 | publishedAt desc, basic, 1, 0 | `publishedAt after 2026-10-28, before 2026-10-30` and `caption includesFuzzy ["health"]` |
| S10 | publishedAt desc, basic, 1, 0 | S2 plus `captionLanguage includes ["en"]` |
| S11 | publishedAt desc, default, 100, 0 | S2 plus `captionLanguage excludes ["en"]` |
| S12 | publishedAt desc, default, 100, 0 | `publishedAt after 2026-10-26` and `profileHandle exactMatch` the 15 handles above |
| S13 | viewsCount desc, default, 100, 0 | `publishedAt after 2026-11-04`, `captionLanguage en`, `hashtags includesFuzzy` [detox, cleanse, holistic, naturalremedy, toxins, healinghacks, guthealth] |
| S14 | viewsCount desc, basic, 100, 0 | `publishedAt after 2026-10-26`, `captionLanguage en`, six named Text queries: deworm, vibration plate, mold poisoning, gua sha, face yoga, puffy face |
| S15 | publishedAt desc, basic, 1, 0 | same window and Text(batch 2, phrases 7 to 12) |

SQL, run read-only on the DB copy of 2026-11-09 20:24 UTC:

- SQL1 `select count(*) from posts` = 250.
- SQL2 `select count(*) from posts where matched_query in (<batch phrases>)` = 100, 98, 52, 0.
- SQL3 `select matched_query, count(*), sum(views) from posts group by 1`.
- SQL4 `select substr(published_at,1,10), count(*) from posts group by 1`.
- SQL5 `select id, started_at, finished_at, searches, new_posts, error from polls`: 49 polls, 191 searches, polls 2 to 48 have `new_posts = 0`, poll 1 has 54, poll 49 has 196.
- SQL6 `select id, title, status from myths`: 3 confirmed, 6 candidates.
- SQL7 `select fetched_at, count(*) from posts group by 1`: 196 and 54.
- SQL8 lymphatic drainage, published Oct 31 to Nov 6: 37 posts and 826,949 views, 35 and 798,496 excluding posts labeled unrelated.
- SQL9 hashtag counts through `json_each(json_extract(raw_json, '$.hashtags'))`.
- SQL10 `views is null` = 57, `views < 10000` = 132, `views >= 10000` = 61 of which 60 are labeled; 133 labels in total, so 117 posts are unlabeled (57 with no count, 59 under 10,000, 1 above).
- SQL11 `count(distinct snippet)` = 232, `count(distinct handle)` = 186, top 5 handles 31 posts, 12 snippets occur more than once.
- SQL12 snippets with under 90% ASCII letters: 1 of 250.
- SQL13 ids of S11 results found in `posts`: 15 of 42.
- SQL14 two DB copies (20:24 and 20:38:54 UTC) joined on `oriane_id`: 250 posts, 5 with changed `views`, sum of absolute change 331,803, largest gain 317,100; poll 50 has `new_posts = 1`, the new post has `published_at = 2026-11-06T22:12:04Z` and `fetched_at = 2026-11-09T20:38:45Z`.
