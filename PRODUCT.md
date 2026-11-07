# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Decided by the repo, not by this design: Next.js App Router, TypeScript, Tailwind, deployed on Vercel (CLAUDE.md, docs/WEB-APP.md). The app runs on `contracts/fixtures/*.json` when `NEXT_PUBLIC_USE_MOCKS=1`, so a broken brain never breaks the demo.

## Users

- **The public (primary).** Anyone who scrolls health content and wants to know whether a claim is a myth. They look it up, scroll, and find other videos that debunk the same myth.
- **Creator mode.** Social media creators, the managers who run their accounts, health creators, and clinicians. They find a myth, make a debunk, and measure whether the response caught up.

Creator mode is a view inside the same product for people who make content, not a separate app.

## Product Purpose

MyBuster helps the public read, receive, and encounter health myths. A person scrolls, sees that a claim is a myth, and learns not to follow it. They then find other videos that debunk the same myth, so they leave informed.

For creators, MyBuster finds the exact claim, gathers sources, drafts a debunk that a judge model checks line by line, helps make the video, publishes a public receipts page, and measures whether the response caught up with the myth.

The north star is response reach divided by myth reach (D14).

## Positioning

Promote better content, not wrong debunks. Every claim shows its source, and every quote links to its post. A debunk can rest on a source that contradicts the claim, or on the absence of good evidence for it. The second case is worded as absence: "There's no good evidence showing that this is true." (D10)

## Operating Context

- Demo at Hack the Feed, Friday Nov 6, 2026: demos at 5:30 PM PT, feature freeze at 5:00 PM (CLAUDE.md, docs/05-TIMELINE.md).
- Public surfaces: `/r/[id]` receipts (mobile first, static, with a QR code on the demo slide) and `/calendar` (static).
- Creator surfaces: `/desk`, the myth page, the studio, and impact.
- The demo path in docs/06-DEMO-SCRIPT.md is the scope. Anything outside it waits (CLAUDE.md rule 10).

## Capabilities and Constraints

- Data comes from the brain: radar, myth detail, brief, check, QA, publish, impact, calendar. The fixture fallback shows whenever the brain is down, and the fixture badge always shows with it.
- Numbers come only from `docs/research/*.md`, each with its source (CLAUDE.md rule 5). No invented numbers in UI or pitch.
- Quotes are exact, with a timestamp and a link. Name a creator only for posts with 100k+ views or accounts with 50k+ followers. Never name anyone who looks under 18, and never name a post about the creator's own illness (CLAUDE.md rule 7, D12).
- No source, no claim. Excerpts are exact substrings of the fetched text. If nothing is found, the UI says "No good source found".
- "Certified by clinician" is the only credential label, and it appears only when a clinician is verified (D13).
- AI drafts, people approve. Nothing publishes without the approval checklist (D16).
- AI avatars and voice clones are allowed (D17). The cyber creator is an AI presenter.
- Never re-upload another creator's footage. Use quote cards or native stitch and duet (D23).
- Votes are stored only as Amplitude events (D21).
- Open, not decided: pricing; clinician verification (the NPI check is a stretch goal); what the Compound API key enables.
- Open, not decided: the harm-tier color for "unproven". The Linear web spec says gray, and docs/WEB-APP.md says amber.
- Open, not decided: how the landing (`/`) ranks against the demo path. The web spec makes it a one-liner with two buttons. The feed landing, the VSAC section, and the creator view go beyond that spec.

## Brand Commitments

- **Look (from docs/WEB-APP.md, binding for this design):** calm and trustworthy, a light background, one accent color, generous spacing, readable at a distance on a projector.
- **Copy voice (CLAUDE.md rule 9):** plain, calm, sentence case. No hype words. No em dashes.
- **Vi's brief, recorded without expansion:** a cyber creator (an AI presenter) with a visible AI label, a modern app bar with generous border radius, and no generic AI-slop look.
- **Terms:** "myth" is the product term (D8). The harm tiers are harmful, false, and unproven. "MIV" in the brief is unconfirmed; copy uses "myth" until Vi says otherwise. "VSAC" means a vertical stack section, `VStack`.

## Evidence on Hand

- `docs/research/RESEARCH.md`, `ORIANE-FINDINGS.md`, and `MYTH-CATALOG.md`: verified numbers and sources. Sources include UCLA Health, National Geographic, and PubMed.
- `contracts/fixtures/*.json`: real Oriane data and fetched excerpts. Placeholder fields are listed in each file's `_fixture` key and must never be shown as real results.
- `contracts/types.ts`: the data shapes, frozen at 3:00 PM PT.
- `public/video/lymphatic-detox.mp4`: not recorded yet (planned around 4:05 PM). The design must handle a video-not-ready state.
- Absent, do not invent: clinician verifications, prices, customer or testimonial quotes, and any metric beyond the fixtures and research doc.

## Product Principles

1. Say what the evidence shows, and count "no good evidence" as a finding.
2. Target the claim, not the person. Name a creator only where the rules allow it.
3. Show the receipts: every claim links to a source, and every quote links to its post.
4. AI drafts, people approve.
5. Calm copy. Nothing hypes a myth or a debunk.

## Accessibility & Inclusion

- Readable at a distance on a projector: high contrast and large type. Key content never sits in thin gray on a light ground.
- Public pages (`/r/[id]`, `/calendar`) are mobile first, with large tap targets.
- Show the fixture or data-source badge whenever data is not live.
