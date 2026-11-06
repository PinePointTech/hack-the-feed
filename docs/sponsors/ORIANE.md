# Oriane

Owner: Kris. Oriane indexes social videos (Instagram, TikTok, YouTube) with transcripts, captions, on-screen text, frames and engagement numbers, and lets you search them with filters. Background: Oriane raised $2M and launched its video intelligence platform ([Barchart](https://www.barchart.com/story/news/798681/oriane-raises-2m-and-launches-the-ai-video-intelligence-platform-that-replaces-legacy-brand-monitoring-tools)).

## How we use it
- Radar: count videos per myth phrase, current vs previous 30 days.
- Myth page: pull the top videos and their exact words with timestamps.
- Impact: re-pull the same window and compare promoting vs debunking reach.
- Calendar: counts for candidate topics.

## Access
| Route | Status | Notes |
|---|---|---|
| Oriane MCP (`search_contents`, `search_profiles`, `create_asset`) | Worked in our research | Good for exploring; the brain needs REST or a client |
| REST API | Base URL not known yet | Get it from the dashboard or the kickoff. The body should match the MCP tool input below |
| Firecrawl Alexandria | Documented | `POST https://api.firecrawl.dev/v2/scrape` with `{"alexandria": {"provider": "oriane", "capability": "tiktok/posts-search", "options": {...}}}`. Capabilities seen: `tiktok/posts-search`, `instagram/posts-search`, `tiktok/profiles-search`, `instagram/profiles-search`. Needs a Firecrawl key |

Every successful search consumes workspace credits.

## Request shape (search_contents)
```json
{
  "operator": "and",
  "filters": { "publishedAt": { "after": "2026-10-07", "before": "2026-11-06" } },
  "queries": [ { "operator": "or", "name": "my_query", "filters": {
      "transcript":   { "includesExactly": { "operator": "or", "values": ["lymphatic drainage"] } },
      "caption":      { "includesExactly": { "operator": "or", "values": ["lymphatic drainage"] } },
      "onScreenText": { "includesExactly": { "operator": "or", "values": ["lymphatic drainage"] } } } } ],
  "sort": [ { "by": "viewsCount", "direction": "desc" } ],
  "projection": "basic",
  "limit": 1,
  "offset": 0
}
```
- Text filters: `includesExactly` (exact phrase), `includesFuzzy` (all words in any order, partial words too), `excludesExactly`, `excludesFuzzy`, `exactMatch` (whole field, good for handles). Fields: `transcript`, `caption`, `onScreenText`, `profileBio`, `profileHandle`, `hashtags`, `audioTitle` and more.
- Ranges: `viewsCount`, `profileFollowersCount`, `interactionsCount`, engagement and views rates (percentages).
- `publishedAt`: `after` and `before`, inclusive; a date-only `before` covers the whole day.
- `platform`, `format`, `platformType` filters. Nested `queries` go two levels deep. 500 filter values max.
- `visualSimilarity` takes asset ids from `create_asset` (text or image), 10 max.
- Sort by: `viewsCount`, `transcriptRelevance`, `publishedAt`, `interactionsCount`, `sharesCount`, engagement rates and others.

## Projections (cumulative)
- `basic`: totals and averages of views and interactions, plus identity, handle, caption, date, views, likes, shares, comments, followers, thumbnail per result. Use for counts.
- `default`: adds transcript, on-screen text, profile bio, engagement rates, audio. Use for claim pulls.
- `full`: adds transcript chunks with start and end seconds, frames with timestamps and on-screen text regions, popular comments. Very large: use limit 5 or less, only for quote timestamps.

## Response
`data.aggregations` (totals over every match, e.g. `totalViewsCount`, `totalInteractionsCount`), `data.results` (current page), `metadata.pagination.totalCount`.

## Gotchas we hit
- Fuzzy is noisy: "sea moss" fuzzy matched 3,130 videos vs 659 exact. Count with exact phrases; use fuzzy only to collect candidates.
- Topic searches pull in unrelated videos: "garlic" plus "cancer" matched recipes and body odor research. Stance labels decide what counts as promotion.
- Brand and ad content often tops the results. Run the `is_ad` question.
- Older posts have had more time to collect views; compare within the same window.
- Instagram `sharesCount` often comes back 0 (not reported); TikTok views can be rounded (1,900,000).
- Reposted clips: the speaker may not be the account owner (barlowherbal posted a clip of Dr. Richard Schulze). Write "from a video posted by @handle".

All numbers we use, with their exact queries: `../research/ORIANE-FINDINGS.md`.
