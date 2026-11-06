# API contracts

Owner: both. Source of truth: `contracts/types.ts`. Fixtures: `contracts/fixtures/`. This doc explains how to use them.

## Rules
- Frozen at 3:00 PM PT. After that, only new optional fields, announced in chat, committed by Kris (`contracts:` prefix).
- JSON keys are snake_case on both sides. Dates are ISO (`2026-11-06`); datetimes are ISO with an offset or `Z`.
- Every non-2xx response has the body `{"error": {"code": "...", "message": "..."}}`.
- The brain allows CORS from `ALLOWED_ORIGINS` (default `http://localhost:3000`; add the Vercel domain).
- Myth ids are slugs: `lymphatic-detox`, `garlic-tumor`, `mouth-taping`.

## Endpoints
| Method and path | Body | Returns | Notes |
|---|---|---|---|
| `GET /health` | | `Health` | Each flag is true if one test call to that service worked at startup |
| `GET /radar?refresh=0` | | `Radar` | Served from `data/radar.json`. `refresh=1` re-pulls Oriane: costs credits, 30 to 60 s |
| `GET /myths/{id}` | | `MythDetail` | From `data/myths/{id}.json` |
| `POST /brief` | `BriefRequest` | `Brief` | Cached per myth and format. `refresh: true` forces a new run (about 45 s) |
| `POST /check` | `CheckRequest` | `CheckResponse` | Under 3 s for a few lines. Send only the edited lines |
| `POST /qa` | multipart: `myth_id`, `approved_lines` (JSON string of `ScriptLine[]`), `file` (mp4) | `QAReport` | About 60 s for a 30 to 40 s video |
| `POST /publish` | `PublishRequest` | `PublishedDebunk` | 422 if any checklist item is false. Writes `data/published/{id}.json` |
| `GET /published/{id}` | | `PublishedDebunk` | |
| `GET /impact/{id}` | | `Impact` | |
| `GET /calendar` | | `Calendar` | |
| `GET /npi/{number}` | | `Clinician` | Stretch |

## Support thresholds
| support | status | UI |
|---|---|---|
| 0.8 or more | `supported` | green, can be approved |
| 0.5 to under 0.8 | `weak` | amber, soften the wording or add a source |
| under 0.5 | `unsupported` | red, "No source says this", blocks approval |

## Naming
`VideoRef.nameable` is the only switch the UI uses to show a handle. If it is false, show "a video with 1.2M views" plus the exact quote, with no handle, link or thumbnail. Write "from a video posted by @handle", never "@handle said", because many posts are clips of someone else.

## Examples
```bash
curl -s localhost:8000/health
curl -s localhost:8000/radar | jq '.myths[].id'
curl -s localhost:8000/myths/lymphatic-detox | jq '.videos[0].quote'
curl -s -X POST localhost:8000/brief -H 'content-type: application/json' \
  -d '{"myth_id":"lymphatic-detox","format":"standalone"}' | jq '.claims[] | {text, status}'
curl -s -X POST localhost:8000/check -H 'content-type: application/json' \
  -d '{"myth_id":"lymphatic-detox","lines":[{"id":"l3","text":"Lymphatic drainage burns fat."}]}'
curl -s -X POST localhost:8000/qa -F myth_id=lymphatic-detox \
  -F approved_lines="$(jq -c .script.lines contracts/fixtures/brief-lymphatic-detox.json)" \
  -F file=@apps/web/public/video/lymphatic-detox.mp4
```

## Web timeouts
radar and myth 15 s, brief 90 s, check 15 s, qa 120 s, publish 30 s. On a timeout or error the web app uses the matching fixture and shows the "fixture" badge.

## Change process
1. In chat: "contracts: add optional `x` to `Y` because ...".
2. The other person replies ok.
3. Kris edits `types.ts`, `services/brain/app/schemas.py` and the fixture, then commits `contracts: ...`.
4. Vi restarts `npm run dev` so the sync script copies the new types.
