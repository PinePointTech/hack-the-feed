# PRD: MyBuster

Owner: Vi. Status: building, Nov 6, 2026.

## One line
Find the health myth. Get the receipts. Make the debunk.

## Problem
Health advice on short video spreads faster than corrections, and most of it does not come from clinicians.
- 31% of U.S. adults use social media at least monthly for health information or advice (KFF, June 2026).
- Half of U.S. adults under 50 get health advice from influencers or podcasters (Pew, reported by Deseret News, May 2026).
- In a TikTok study on sinusitis, about 15% of videos from medical professionals were non-factual vs nearly 60% from non-medical influencers, and the influencers got more visibility.
- 52 of the top 100 #mentalhealthtips TikToks contained misinformation (The Guardian, May 31, 2025).
- Our own Oriane pull: 1,317 videos said "lymphatic drainage" in the 30 days to Nov 6, 2026, with 49.5M views. Accounts with a clinician word in their bio posted 63 of them and got 2.5% of the views, and the five biggest of those were promotions, not corrections.

Corrections work when they exist. In experiments, short debunk videos were effective (Li, Li and Yang 2024, n=873), and roughly 30-second corrections reduced misperceptions with experts and laypeople about equally persuasive (Heiss et al. 2024, n=956). Our bet: the bottleneck is speed and receipts.

Every number above has a source in `research/RESEARCH.md` or `research/ORIANE-FINDINGS.md`.

## Who it's for
- Primary user: social media managers who run several health creator accounts and need to respond fast without getting a fact wrong. They open it every week.
- Buyer: the creator (health, fitness, nutrition, skin, sleep). Creators pay.
- Non-clinicians are welcome. Claims are verified with sources, not credentials. A "Certified by clinician" label shows only when a clinician actually signs off.
- Viewers: anyone who opens a receipts page or the public calendar.

## Job to be done
"When a health myth starts trending in my niche, help me find the exact posts, get the real evidence, and ship an accurate, on-brand response video before the wave passes."

## Product loop
1. Radar (`/desk`): myths ranked by reach, with harm tier (harmful, false, unproven), trend vs the previous 30 days, and how we matched.
2. Myth page (`/desk/myth/[id]`): exact quotes with timestamps and links, stance mix, counter voices already debunking it, clinician share.
3. Brief (studio): verdict, what's true, what's false, sources with verbatim excerpts, a support score per claim.
4. Studio (`/desk/myth/[id]/studio`): pick a format (stitch, duet, standalone, no camera) and a hook, then write freely; every edited line is re-checked live. An approval checklist gates export.
5. Video: record, edit, caption and post with Compound.mov. GMI vision reads the on-screen text of the export and flags anything that is not in the approved script.
6. Receipts (`/r/[id]`): public page with the quote card, verdict, sources and a "Did this change your mind?" vote. QR on the video and the slide.
7. Calendar (`/calendar`): public. This week's myths from Oriane trends plus a curated watchlist, one week ahead. Creators can reuse approved scripts.
8. Impact (`/desk/impact/[id]`): response reach vs myth reach, time from spike to first response, votes.

## Scope today
In: the 8 surfaces above end to end for one demo myth (lymphatic drainage detox), plus radar and myth pages for two more (garlic on tumors, mouth taping).

Out: accounts and auth, payments, multi-workspace, posting without a human, myth discovery beyond the seeded catalog, non-English content.

## Guardrails (non-negotiable)
1. No source, no claim. Every factual line links to a verbatim excerpt. If nothing is found, the UI says "No good source found" and the line cannot be approved.
2. When evidence is thin, say so: "There's no good evidence showing that this is true."
3. Quote creators exactly, with a timestamp and a link. Target the claim, not the person. Write "from a video posted by @handle", because clips and reposts are common.
4. Name only posts with 100k+ views or accounts with 50k+ followers. Never name anyone who looks under 18. Never name a post about the creator's own illness.
5. Don't re-upload other creators' footage. Use a quote card (handle, exact quote, timestamp, link) or the platform's native stitch or duet.
6. AI drafts, people approve. Nothing exports or publishes without the checklist.
7. AI avatars and voice clones are allowed. They go through the same checks.

## Success metrics
- North star: response reach divided by myth reach for a myth (views of debunking videos over views of promoting videos, same window).
- Demo metrics in Amplitude: radar to approved brief conversion, time from Myth Opened to Brief Approved, receipts views by source, "changed my mind" vote rate.
- Quality: share of script lines with a supported claim (support of 0.8 or more), video QA pass rate.

## Demo myth
Lymphatic drainage "detoxes" and "burns fat". Real Oriane data, real quotes, verified sources (UCLA Health, National Geographic). Details in `research/MYTH-CATALOG.md`.

## Open questions
- Pricing. A proposal is in `07-PITCH.md`; nothing is decided.
- Clinician verification flow. The NPI lookup is a stretch goal.
- What the Compound API key from the organizers can do.
