# MyBuster design vocabulary

Shared names for the web app (apps/web, Vi) and this design session. The design does not rename anything docs/WEB-APP.md already names. No color values here; colors are decided later in DESIGN.md.

Sources: CLAUDE.md, docs/WEB-APP.md, docs/10-DECISIONS.md (D1 to D23), docs/01-PRD.md, contracts/types.ts, PRODUCT.md.

## 1. Product terms

| Term | Definition | Source |
|---|---|---|
| myth | A claim that is false, unproven or harmful, labeled by a model and confirmed by a person. The product term. | D8 |
| claim | One health statement, in one neutral sentence (`MythSummary.claim`), or one checked line (`ClaimCheck`). | contracts/types.ts |
| harm tier | How risky a myth is: harmful, false or unproven. | types.ts `HarmTier`, PRD |
| harmful | Could hurt someone or delay real care. | types.ts comment |
| false | Good evidence says it is wrong. | types.ts comment |
| unproven | No good evidence it works. | types.ts comment |
| stance | How a video relates to the myth: promotes, debunks, neutral, ad, unrelated. | types.ts `Stance` |
| debunk | A response video that corrects a myth, checked line by line against sources. | PRD, D15 |
| receipts | The public page for a debunk (`/r/[id]`): quote card, verdict, sources, vote. | PRD, WEB-APP |
| source | A fetched page with publisher, url and verbatim excerpts. | types.ts `Source`, CLAUDE.md rule 4 |
| excerpt | A passage that is an exact substring of the fetched source text. | CLAUDE.md rule 4 |
| quote | A creator's exact words from a post, never paraphrased, with a timestamp and link. | types.ts `VideoRef.quote`, D11 |
| brief | Verdict, what is true, what is false, sources, claims, hooks and a draft script for one myth and format. | types.ts `Brief`, PRD |
| studio | The page where a creator picks a format and hook, edits the script and approves (`/desk/myth/[id]/studio`). | WEB-APP |
| desk | The creator area under `/desk`: radar, myth page, studio, impact. | WEB-APP |
| radar | The ranked list of myths at `/desk`. | WEB-APP, PRD |
| calendar | Public page at `/calendar`: this week plus a watchlist, one week ahead. | D18, WEB-APP |
| watchlist | Calendar section of upcoming topics beyond this week's items (`Calendar.watchlist`). | types.ts, WEB-APP |
| impact | Page at `/desk/impact/[id]`: response reach against myth reach. | WEB-APP, PRD |
| north star | Response reach divided by myth reach (`Impact.response_ratio`). | D14, PRD |
| approval checklist | The gate before export or publish; AI drafts, people approve. | D16, CLAUDE.md rule 8, types.ts `ApprovalChecklist` |
| certified by clinician | The only credential label; shown only when a clinician verified the debunk. | D13, types.ts `certified_by_clinician` |
| creator mode | A view inside the same product for people who make content. Not a separate app. | PRODUCT.md |
| public mode | The view for anyone who scrolls health content and looks up a claim. Primary audience. | PRODUCT.md |

## 2. Component names

Names 1 to 10 come from docs/WEB-APP.md and stay exactly as written. WEB-APP names them but does not spell out their fields; the fields below are the contract fields each one would show.

| Component | Purpose | Fields shown |
|---|---|---|
| HarmChip | Harm tier label on a myth. | `MythSummary.harm_tier` |
| TrendBadge | Trend and change vs the previous window. | `trend`, `trend_pct` |
| QuoteCard | One creator quote with its post. | `thumbnail_url`, `handle`, `quote`, `quote_start_s` (as m:ss), `views`, `url`; none of handle, link or thumbnail when `nameable` is false |
| SourceCard | One source with its excerpts. | `Source.title`, `publisher`, `url`, `excerpts` |
| SupportBadge | Support level of one claim or line. | `status`, `support`, `engine` |
| ScriptEditor | One input per script line, re-checked live. | `ScriptLine.text`, per-line `LineCheck.status`, `note` |
| Checklist | The approval checklist. | `every_claim_has_source`, `quotes_are_exact`, `targets_claim_not_person`, `no_minors_or_illness_stories`, `video_qa_passed` |
| QAReport | Result of video QA. | `pass`, `frames_checked`, `issues[]` (`t_s`, `found_text`, `problem`) |
| VoteButtons | "Did this change your mind?" vote. | Yes, No, I already knew |
| DataBadge | Marks data that is not live. | `from` (`"live"` or `"fixture"`) |

NEW components for the landing. Not in WEB-APP; Vi to confirm.

| Component | Purpose | Fields shown |
|---|---|---|
| AppBar (NEW) | Top bar with the product name and navigation to feed, calendar and creator mode. | None from the contract |
| PresenterFrame (NEW) | The 9:16 frame for the AI creator, with its AI label. | `PublishedDebunk.video_url`; AI label text (see section 4) |
| MythFeedItem (NEW) | One myth in the public feed. | `title`, `claim`, `harm_tier`, `trend`, `trend_pct`, `window`, `topic_views`, `topic_video_count`, `top_video` (only if `nameable`) |
| FeaturedDebunk (NEW) | The vertical-stack section (VStack) that shows the generated debunk video. | `PublishedDebunk.myth.title`, `verdict`, `video_url`, `certified_by_clinician`, link to `/r/[id]` |
| CreatorLoop (NEW) | The creator view listing the eight loop steps in order: Radar, Myth page, Brief, Studio, Video, Receipts, Calendar, Impact. | Step names only; no contract fields. Source: docs/01-PRD.md, "Product loop". |

## 3. Enum-to-label mapping

Labels marked (spec) come from WEB-APP or the decision log. Others are derived by sentence-casing the raw value and need Vi's check.

**HarmTier**: `harmful` Harmful (spec). `false` False (spec). `unproven` Unproven (spec).

**Trend**: `rising` Rising. `steady` Steady. `cooling` Cooling. `unknown` Unknown. TrendBadge pairs the label with `trend_pct` when present.

**Platform**: `tiktok` TikTok. `instagram` Instagram. `youtube` YouTube. (Brand spellings.)

**Stance**: `promotes` Promotes (spec). `debunks` Debunks (spec). `neutral` Neutral (spec). `ad` Ad (spec). `unrelated` Unrelated (spec).

**QuoteSource**: `transcript` Transcript. `caption` Caption. `on_screen_text` On-screen text.

**Format**: `stitch` Stitch (spec). `duet` Duet (spec). `standalone` Standalone (spec). `no_camera` No camera (spec).

**HookStyle**: `question` Question. `myth_quote` Myth quote. `stat` Stat. `pov` POV. `stitch_reaction` Stitch reaction.

**SupportStatus**: `supported` Supported (support 0.8 or more). `weak` Weak (0.5 to 0.8). `unsupported` Unsupported (below 0.5). Thresholds are from types.ts. An unsupported line shows the note from `LineCheck.note`, for example "No source says this".

**Engine**: `jev` Jev (D7). `gmi_judge` GMI judge (D7). `cached` Cached.

**DataSource**: `oriane_live` Oriane live. `oriane_snapshot` Oriane snapshot. Shown with `snapshot_at`.

Other enums in types.ts, for completeness: `CalendarItem.basis` is `oriane_trend` (Oriane trend) or `curated` (Curated), see section 4. `Source.kind` and `QAIssue.problem` have no spec labels yet; ask before showing them.

## 4. States and badges

| State | When it shows | Exact text |
|---|---|---|
| Fixture badge | Whenever `from` is `"fixture"` (brain down, timeout, or `NEXT_PUBLIC_USE_MOCKS=1`). Never hidden. A small pill. | `fixture` (WEB-APP wording, lowercase as written) |
| Live state | `from` is `"live"`. The badge disappears. | No badge |
| Pending | Any missing `Impact` field, and any other missing value. Never show 0 for a missing value. | `pending` |
| No source | Nothing found for a claim. The line cannot be approved. | `No good source found` |
| Thin evidence | When there is no good evidence for a claim. Worded as absence. | `There's no good evidence showing that this is true.` (D10) |
| Certified by clinician | Only when `certified_by_clinician` is true, meaning a clinician is verified. | `Certified by clinician` |
| Calendar basis, trend | `basis` is `oriane_trend`. | `Oriane trend` |
| Calendar basis, curated | `basis` is `curated`. | `Curated` |
| Check offline | The brain is offline during a line check. Never a fake green check. | `Not checked (brain offline)` |
| Video not ready | `video_url` is not set, or the file is not recorded yet (public/video/lymphatic-detox.mp4 is planned, not recorded). | Wording not set in the repo; Vi to supply |
| AI label on presenter | Always, on PresenterFrame. | PROPOSED: "AI presenter". Pending Vi's wording. |

## 5. Copy rules

Source: CLAUDE.md rules 5, 7, 9 and docs/WEB-APP.md "Copy and style".

1. Sentence case everywhere.
2. No em dashes.
3. No hype words. CLAUDE.md rule 9 says "No hype words" and gives no list, and no repo doc lists any. Do not invent a list here; ask Vi for one if a check is needed.
4. Plain and calm. Nothing hypes a myth or a debunk.
5. Numbers only with their window and their source, and only from the API, fixtures or docs/research/*.md. Example of a window: "Oct 7 to Nov 6, 2026".
6. Quotes go in quotation marks, with the timestamp as m:ss and a link to the post.
7. Write "From a video posted by @handle" only when `nameable` is true. Otherwise no handle, link or thumbnail.
8. Target the claim, not the person.
9. Name only posts with 100k+ views or accounts with 50k+ followers.
10. Never name anyone who looks under 18, and never name a post about the creator's own illness.
11. Never re-upload another creator's footage. Use a quote card or a native stitch or duet.
12. Do not invent medical facts, sources, quotes, URLs, prices, testimonials or clinician verifications.

## 6. Open conflicts (not resolved here)

a. The "unproven" harm chip color. The Linear web spec says gray. docs/WEB-APP.md says amber (harmful red, false orange, unproven amber). Colors stay out of this file until Vi decides.

b. "MIV" in the design brief is unconfirmed. Copy uses "myth" (D8) until Vi confirms.

c. "VSAC" means a vertical stack section (VStack), per Vi. The section is named FeaturedDebunk.

d. Landing scope. docs/WEB-APP.md makes `/` a one-line page ("Find the health myth. Get the receipts. Make the debunk.") with buttons to `/desk` and `/calendar`. The feed landing, FeaturedDebunk and CreatorLoop go beyond that spec. Noted, not decided. CLAUDE.md rule 10 says anything outside docs/06-DEMO-SCRIPT.md waits until the demo path works.

e. Component list. docs/WEB-APP.md names DataBadge and VoteButtons. The Linear web spec names FixtureBadge, StanceBar and Qr. apps/web/INTEGRATION.md names FixtureBadge. The design uses DataBadge (repo wording) until Vi decides.
