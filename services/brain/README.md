# MyBuster Brain

From this directory, copy `.env.example` to `.env` and fill in the provider settings. Add the exact Vercel frontend origin to `ALLOWED_ORIGINS` when available.

```sh
uv run --env-file .env uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health
```

Set `OPENAI_MODEL` to an ID available at `OPENAI_BASE_URL` (default `https://api.openai.com/v1`). Startup checks that model catalog, GMI's catalog and one Oriane search. Results are cached for five minutes per process and refreshed on the next health request after expiry.

`ok` requires Oriane and the configured chat model to pass their checks. `gmi` is true when `GET $GMI_BASE_URL/models` answers with `GMI_API_KEY`. `jev` is not wired into this brain and stays false; `ok` does not depend on it.

## Run every model call on GMI Cloud

GMI serves models, including OpenAI ones, behind an OpenAI-compatible API. Every chat call (brief drafter, evidence, live check, judge, health probe) uses `OPENAI_BASE_URL`, so moving them to GMI is three env changes:

```sh
OPENAI_BASE_URL=https://api.gmi-serving.com/v1
OPENAI_API_KEY=<your GMI inference key>
OPENAI_MODEL=<an id from the list below, an OpenAI model if GMI hosts one>
```

```sh
curl -s https://api.gmi-serving.com/v1/models -H "Authorization: Bearer $GMI_API_KEY" | jq -r '.data[].id'
```

When `OPENAI_BASE_URL` equals `GMI_BASE_URL`, `Brief.models.drafter`/`.judge` and `QAReport.models.judge` read like `<model> on GMI Cloud`. `QAReport.models.vision` always does, because frame reading always runs on GMI. To roll back, unset `OPENAI_BASE_URL` and put the OpenAI key and model back. Saved briefs keep the label they were generated with; send `"refresh": true` to regenerate.

## Run in Docker

The same image runs on a laptop and on GMI Agentbox. Build from the repo root, because the code finds `data/` and `contracts/fixtures/` relative to the repo layout:

```sh
docker build -f services/brain/Dockerfile -t mybuster-brain .
docker run --rm --env-file services/brain/.env -p 8000:8000 -v "$PWD/data:/app/data" mybuster-brain
curl http://localhost:8000/health
```

The `data/` volume keeps briefs, QA reports, published receipts and caches on the host. On Linux hosts, add `--user "$(id -u):$(id -g)"` if the container cannot write to the mounted `data/`. `--env-file` reads values literally, so do not quote them in `.env`.

## Expose to mybuster.vercel.app

`ALLOWED_ORIGINS` must include `https://mybuster.vercel.app` (it is in `.env.example`). Then open a Cloudflare quick tunnel to the running brain:

```sh
brew install cloudflared
cloudflared tunnel --url http://localhost:8000
```

Send Vi the `https://….trycloudflare.com` URL it prints. The URL changes every time the tunnel restarts.

## Evidence engine

`await app.evidence.find(Myth(id, claim))` returns up to six sources for the grounded brief. It fetches PubMed abstracts and any seeded, allowlisted articles for that myth. The configured OpenAI model selects sentence indices. The excerpts are copied from the fetched text and checked before caching.

Results are stored in `data/sources/{myth_id}.json`. Pass `refresh=True` to fetch them again. If a lookup returns an empty list, the caller should show “No good source found.” `NCBI_EMAIL` and `NCBI_API_KEY` are optional.

## Judge

`await app.judge.ask(state, questions)` returns `(answers, "openai")` using
`OPENAI_MODEL` at `OPENAI_BASE_URL`. Questions support `noul` (yes/no probability) and `choice`
(an option and its probability distribution). The judge validates the result
before returning it. For batches, pass a shared `httpx.AsyncClient` as
`client=` to reuse connections.

## Grounded brief

Send `POST /brief` with `{"myth_id":"lymphatic-detox","format":"standalone"}`.
The other formats are `stitch`, `duet`, and `no_camera`. Set `refresh` to
`true` to regenerate the brief from the evidence cache. Each factual script
line uses the exact text of a scored claim and cites its best source.
`claims[].engine` uses the existing `cached` label for saved scores and
`models.judge` identifies the model that produced them (with "on GMI Cloud" when GMI served it).

## Live script check

Send `POST /check` with a `myth_id` and `lines` containing `id` and `text`.
The checker compares edited lines with the saved brief's excerpts and returns
one result per input line in order. It caches results by normalized text and
the current excerpts, and preserves each request's line IDs.

## Demo radar

`GET /radar` and `GET /myths/{myth_id}` read the saved radar and myth
snapshots. Add `?refresh=1` to either endpoint to pull all three demo myths
from Oriane and save updated snapshots. The refresh uses the demo windows
October 7 to November 6 and September 7 to October 6, 2026. It uses basic
results for counts and full transcripts for the three seeded video IDs.
Naming and model-based stance decisions are handled in HTF-10.

## Radar stance and naming

Run `uv run --env-file .env python -m app.radar_policy` to classify the top
30 Oriane posts by views for each demo myth and save the results. Use
`--refresh` to bypass the Oriane response cache. Saved myth details include
the stance counts, sample size, quoted promoters and counter-voices, and the
lymphatic clinician bio estimate. The full label audit and suggested harm
tiers are saved under `data/cache/radar-policy/`. Review any tier disagreement
before changing the editorial tier or reason. A radar totals refresh preserves
the previous classification sample.

## Video QA

Install ffmpeg (the Docker image includes it) and set `GMI_API_KEY` to a GMI
Inference Engine key with access to `GMI_VLM_MODEL`. Caption matching and
evidence checks use `OPENAI_MODEL` at `OPENAI_BASE_URL`, which can also be GMI. Send `POST /qa` as multipart with `myth_id`,
`approved_lines` (JSON), and `file` (an MP4 up to 45 seconds and 100 MiB).
The brain saves the latest report under `data/qa/` and reuses a cached result
for the same video, approved script, evidence and models.

## Publish receipts

Send `POST /publish` with the final brief, the completed approval checklist,
and an optional video URL. The brain checks excerpts and citations against
the verified evidence cache and saves the receipt to
`data/published/{myth_id}.json`. `GET /published/{myth_id}` reads that receipt.
The web app's existing sync script copies the saved JSON for the static site.

Passing video QA returns a `Content-Location` for that exact upload and
locked script. Publishing with that location makes the video available to
the receipts page. Keep `data/published/` and `data/cache/qa/` on persistent
storage when the brain serves live receipts.

## Live feed

The brain polls Oriane in the background and stores posts in `data/mybuster.db` (SQLite, gitignored). Edit `data/watchlist.json` to change the searched phrases; the next poll picks it up.

- `GET /feed?since=<ISO8601>&limit=<1..100>` returns stored posts, newest fetch first, then by views. `label` stays null until the labeler runs.
- `POST /poll` runs one poll only if `POLL_INTERVAL_MINUTES` (default 15) passed since the last poll started. Otherwise it returns `ran: false`.
- `ORIANE_MAX_SEARCHES_PER_HOUR` (default 20) caps Oriane searches, counted from the `polls` table.
- Nothing polls without `ORIANE_API_KEY`.

Run the tests with `uv run pytest -q`.
