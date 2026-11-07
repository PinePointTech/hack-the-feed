# Web and brain integration

For Vi, Kris and the design session. Contracts live in `contracts/types.ts` (frozen 3:00 PM); the web reads synced copies in `src/contracts/`.

## How the web talks to the brain

- `NEXT_PUBLIC_BRAIN_URL`: brain base URL, default `http://localhost:8000`.
- `NEXT_PUBLIC_USE_MOCKS=1`: never call the brain, every call returns its fixture. Set `0` for live.
- All calls go through `api` in `src/lib/api.ts`. Each returns `{ data, from }` with `from` = `"live"` or `"fixture"`.
- On any error, non-2xx or timeout, the call logs a warning and returns the fixture. Pages show `<FixtureBadge from={from} />` so a fallback is never hidden.
- Timeouts per call: radar, myth, impact, check 15 s; brief 90 s; qa 120 s; publish 30 s.
- `published` and `calendar` read same-origin static files (`/published/{id}.json`, `/calendar.json`), never the brain.
- `NEXT_PUBLIC_*` values are read when the dev server starts. Restart it after editing `.env.local`.

## CORS (Kris)

The brain must allow these origins in `ALLOWED_ORIGINS`:

- `http://localhost:3000`
- the Vercel domain, once Vi shares it

## Demo laptop setup

1. Start the brain on port 8000.
2. In `apps/web/.env.local`: `NEXT_PUBLIC_BRAIN_URL=http://localhost:8000` and `NEXT_PUBLIC_USE_MOCKS=0`.
3. Restart the web dev server.
4. Check the brain from `apps/web`: `node scripts/check-contracts.mjs --live`.

## Contract checker

Run from `apps/web`:

- `node scripts/check-contracts.mjs`: validates every fixture against its response type. No network.
- `node scripts/check-contracts.mjs --live`: calls the brain (health, radar, three myths, impact, calendar, published, check, and one unknown myth for the error shape). This is the 3:45 checkpoint command.
- `node scripts/check-contracts.mjs --all`: also posts `/brief` for the demo myth. Cached by the brain, but a cold run costs GMI credits.

It never calls `/publish` or `/qa`. One line per check, exit code 1 on any failure.

## Hand-offs that touch the web

| From Kris | When | Then |
|---|---|---|
| `data/radar.json`, `data/myths/*.json` | 3:45 PM | Vi pulls; the brain serves them |
| brief for the demo myth in `data/briefs/` | 4:15 PM | Vi pulls; the studio loads it |
| `data/published/lymphatic-detox.json` | 4:45 PM | Vi pulls, runs `npm run predev`, commits the copy in `public/published/`, deploys |

`npm run predev` (also run by `npm run dev` and `npm run build`) syncs `contracts/` into `src/contracts/` and `data/published/` plus `data/calendar.json` into `public/`. Commit the synced copies so Vercel builds without the repo root data.

## Seam for the design session

- The design session owns the markup and styling in `src/app/**` and `src/components/**`.
- Behaviour stays in headless code under `src/lib/`. Pages only call it:
  - `@/lib/api`: every brain call with fixture fallback.
  - `@/lib/track`: `track()` with typed events from the tracking plan.
  - `@/lib/hooks`, being added now:
    - `useStudio`: brief loading, script edits, debounced live checks, checklist rules and publish.
    - `useReceipts`: loads a published debunk for the public page.
    - `useCalendar`: loads the weekly calendar.
    - `useTrackOnce`: fires a tracking event once per mount.
- Redraw any page freely, but keep calling these hooks and keep `FixtureBadge` visible wherever data can fall back.

## Live Amplitude audience (creator impact page)

`/desk/impact/[id]` shows live receipts views (and how many came from the demo QR), the "Did this change your mind?" vote split and source clicks for that myth, read from Amplitude through `GET /api/audience/{id}` every 15 s. The route caches each myth for 30 s, so many open tabs still make only three Amplitude calls. It loads at most 3 myths per 30 s window, so random ids cannot burn the Amplitude query budget.

| Name | Where | Notes |
|---|---|---|
| `AMPLITUDE_SECRET_KEY` | server only | Never prefix with `NEXT_PUBLIC_`. Never commit it. |
| `AMPLITUDE_API_KEY` | server, optional | Defaults to `NEXT_PUBLIC_AMPLITUDE_API_KEY`. |
| `AMPLITUDE_TIMEZONE` | server, optional | IANA name, for example `America/Los_Angeles`. Must match the time zone set on the Amplitude project (Settings, Projects, General). Default: `UTC`. |
| `AUDIENCE_SINCE` | server, optional | ISO time, for example `2026-11-06T17:00:00-08:00`. Counts start at the hour holding this time, so rehearsal traffic before it is left out. Default: midnight today, Los Angeles time. |

- Find the secret in Amplitude: Settings, Projects, pick the project, General tab, API key and Secret key.
- Local: add `AMPLITUDE_SECRET_KEY=...` to `apps/web/.env.local` and restart the dev server.
- Vercel: Project, Settings, Environment Variables, add `AMPLITUDE_SECRET_KEY` for Production (and Preview if wanted), mark it Sensitive, then redeploy.
- Without the secret the page says "Connect Amplitude to see live audience numbers" and the "Our debunk" figures stay "Pending". If Amplitude fails it says "Amplitude is not answering right now". It never shows made-up zeros.
- Check: `curl localhost:3000/api/audience/lymphatic-detox` returns `"configured": true` and a `stats` object once the secret is set.
- Set `AMPLITUDE_TIMEZONE` to the project's time zone. Amplitude returns hourly buckets in that zone; a mismatch drops or adds hours at the `AUDIENCE_SINCE` cutoff.
