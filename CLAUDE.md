# CLAUDE.md: MyBuster

You are helping a two-person team build MyBuster at Hack the Feed. Build window: 2:00 PM to 5:30 PM PT, Friday Nov 6, 2026. Demos at 5:30, winners at 6:15. Keep the demo path working at all times.

## Read first, in order
1. `docs/01-PRD.md`: what we build and why
2. `docs/06-DEMO-SCRIPT.md`: the demo path is the scope
3. `docs/03-CONTRACTS.md` and `contracts/types.ts`: API shapes, do not drift
4. `docs/04-WORK-SPLIT.md`: who owns which folder
5. Your lane: `docs/WEB-APP.md` (Vi) or `docs/AI-PIPELINE.md` (Kris)

## Hard rules
1. **Stay in your lane.** Vi's sessions edit only `apps/web/**`. Kris's sessions edit only `services/brain/**` and `data/**`. Never edit the other person's folder. If you need a change there, write the request in the team chat.
2. **Contracts freeze at 3:00 PM.** After that, `contracts/` only gets new optional fields, announced in chat first. Never rename or remove a field. Kris applies contract edits after the freeze.
3. **Mock first.** The web app must run on `contracts/fixtures/*.json` when `NEXT_PUBLIC_USE_MOCKS=1`, so a broken brain never breaks the demo.
4. **No source, no claim.** Never invent medical facts, sources, quotes or URLs. Every claim shown to a user links to a source excerpt that was fetched live or sits in a fixture with a real URL. Excerpts must be exact substrings of the fetched text. If nothing is found, show "No good source found".
5. **No invented numbers.** UI copy and the pitch use only numbers listed in `docs/research/*.md`, each with its source.
6. **No secrets in git.** Use `apps/web/.env.local` and `services/brain/.env`. Names live in `.env.example`. Oriane, GMI and Jev keys stay server-side in the brain.
7. **Naming creators.** Quote their exact words with a timestamp and a link. Target the claim, not the person. Only name posts with 100k+ views or accounts with 50k+ followers. Never name anyone who looks under 18, and never name a post about the creator's own illness.
8. **AI drafts, people approve.** Nothing exports or publishes without the approval checklist.
9. **Copy voice.** Plain, calm, sentence case. No hype words, no em dashes.
10. **Demo path first.** Anything not in `docs/06-DEMO-SCRIPT.md` waits until the path works end to end, and nothing new starts after the 5:00 PM feature freeze.

## Stack
- Web (Vi): Next.js App Router, TypeScript, Tailwind, `@amplitude/analytics-browser`, `qrcode.react`. Deployed on Vercel.
- Brain (Kris): Python 3.11+, FastAPI, httpx, pydantic v2, `openai` SDK pointed at GMI (OpenAI-compatible), ffmpeg, uv.
- Judges: Jev through the System One API, or an open Jev-style model. Fallback: an LLM judge on GMI with JSON output, same question format.

## Commands
- Web: `cd apps/web && npm run dev`
- Brain: `cd services/brain && uv run uvicorn app.main:app --reload --port 8000`
- Health: `curl localhost:8000/health`

## Git
- Trunk-based on `main`. Pull with `git pull --rebase` before every push. Small commits.
- Commit prefixes: `web:`, `brain:`, `data:`, `contracts:`, `docs:`.
- Never reformat or move files outside your lane.

## Definition of done (any task)
Works on the demo path with real or fixture data, no console errors, fires its Amplitude event if it is a tracked action (`docs/08-TRACKING-PLAN.md`), and the Linear issue moves to Done with a one-line note.
