# Tracking plan (Amplitude)

Owner: Vi. SDK: `@amplitude/analytics-browser` (Browser SDK 2). Setup details: `sponsors/AMPLITUDE.md`.

## What analytics is for
1. Prove the product works in the demo: judges vote on the receipts page and we show the result live.
2. Show the creator funnel: radar to approved brief to exported video to receipts views.
3. Later: tell a creator which debunks change minds, not just which get views.

## Rules
- Event names are Title Case "Object Action" (Myth Opened). Property names are snake_case.
- Every event carries `myth_id` when there is one, and `data_source` (`live` or `fixture`) on desk pages so test runs can be filtered out.
- Init with `autocapture: true` (page views, sessions, attribution and UTM parameters are captured for us).
- `track()` initializes lazily, because React runs child effects before the parent provider's effect.
- Desk pages call `amplitude.setUserId("creator_demo")` (user ids need 5 or more characters). Public pages stay anonymous.
- Votes live only in Amplitude. There is no database.

## Events
| Event | Properties | Fired when | Core |
|---|---|---|---|
| Radar Viewed | myth_count, data_source | `/desk` renders | |
| Myth Opened | myth_id, harm_tier, trend, from (radar, calendar, direct), data_source | myth page renders | yes |
| Brief Generated | myth_id, format, source_count, claim_count, unsupported_count, latency_ms, engine | brief arrives in the studio | |
| Hook Selected | myth_id, hook_style | a hook is picked | |
| Claim Flagged | myth_id, line_id, status, support, engine | `/check` returns weak or unsupported | |
| Brief Approved | myth_id, format, line_count, claim_count, minutes_since_open | Approve clicked with the checklist complete | yes |
| Video Exported | myth_id, tool ("compound"), duration_s | the exported MP4 is attached in the studio | yes |
| Video QA Completed | myth_id, pass, issue_count, frames_checked, ran_in | `/qa` returns | |
| Debunk Published | myth_id, has_video, certified_by_clinician | `/publish` succeeds | |
| Receipts Viewed | myth_id, utm_source, utm_medium | `/r/[id]` renders | yes |
| Source Clicked | myth_id, source_id, publisher, location (receipts, studio) | a source link is clicked | |
| Mind Changed Vote | myth_id, answer ("yes", "no", "already_knew") | a vote button is clicked (once per device) | yes |
| Calendar Viewed | week_of, item_count | `/calendar` renders | |
| Script Reused | myth_id, from ("calendar") | "Use this script" clicked | |

## QR and links
- Demo slide QR: `https://<vercel-domain>/r/lymphatic-detox?utm_source=demo_qr&utm_medium=qr`
- Link in bio on the posted video: `...?utm_source=tiktok&utm_medium=bio` (or `instagram`)

## Dashboard "MyBuster demo"
1. Funnel: Myth Opened → Brief Approved → Video Exported → Receipts Viewed (desk funnel).
2. Funnel: Receipts Viewed → Mind Changed Vote, grouped by utm_source.
3. Segmentation: Mind Changed Vote, grouped by answer (bar).
4. Segmentation: Claim Flagged, grouped by status.
5. Segmentation: Source Clicked, grouped by publisher.
Take a screenshot of each chart after rehearsal as a fallback.

## Verify
Open Amplitude, User Lookup, search your device or user id, and watch events arrive. Charts can lag a few minutes; User Lookup shows events sooner. Ad blockers can block the SDK, so use a clean browser profile for the demo.
