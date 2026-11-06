# MyBuster

Find the health myth. Get the receipts. Make the debunk.

MyBuster is a myth desk for health creators and the social media managers who run their accounts. It finds health myths spreading on TikTok, Instagram and YouTube, shows the exact posts and words, pulls real sources, drafts a debunk script that a judge model checks line by line, helps the creator make the video, checks the finished video's on-screen text against the approved script, publishes a public receipts page, and measures whether the response caught up with the myth.

Built at Hack the Feed (Nov 6, 2026, Amplitude HQ, San Francisco) by Vi Huynh (web and product) and Krzysztof "Kris" Stężała (AI pipeline).

## How it works
1. Radar: Oriane searches transcripts, captions and on-screen text. Jev labels each video's stance. A GMI Cloud model groups videos into myths and tags a harm tier (harmful, false, unproven).
2. Myth page: the exact quotes, with timestamps and links.
3. Brief: real sources fetched live (PubMed and trusted health sites). A GMI model drafts only from verbatim excerpts, and Jev scores how well each claim is supported.
4. Studio: pick a format and a hook, edit the script, and every edited line is re-checked live. An approval checklist gates export.
5. Video: record, then edit, caption and post with Compound.mov. A GMI vision model reads the on-screen text and Jev checks it against the approved lines.
6. Receipts: a public page with the quote, the verdict, the sources and a "Did this change your mind?" vote.
7. Impact and calendar: response reach vs myth reach (Oriane plus Amplitude), and a public calendar of next week's myths.

## Repo map
| Path | Owner | What |
|---|---|---|
| `apps/web/` | Vi | Next.js app: desk, studio, receipts, calendar, impact |
| `services/brain/` | Kris | FastAPI service: Oriane, GMI, Jev, evidence, QA, publish |
| `data/` | Kris | Cached radar, myths, briefs and published debunks (JSON) |
| `contracts/` | shared, frozen at 3:00 PM | `types.ts` and `fixtures/` |
| `docs/` | both | Plan, specs, research, sponsor notes |

## Start here
1. Read `CLAUDE.md` (rules) and `docs/00-INDEX.md` (map of every doc).
2. Vi: `docs/START-HERE-VI.md`. Kris: `docs/START-HERE-KRIS.md`.
3. Copy the blocks in `.env.example` to `apps/web/.env.local` and `services/brain/.env`. Never commit them.

## Run
- Brain: `cd services/brain && uv run uvicorn app.main:app --reload --port 8000`
- Web: `cd apps/web && npm run dev`, then open http://localhost:3000

## Sponsor tech
Oriane (social video search), GMI Cloud (serverless LLM and vision, sandbox jobs), Jev from TypeSafe (judge model), Compound.mov (video edit and post), Amplitude (product analytics). Lovable is not used.
