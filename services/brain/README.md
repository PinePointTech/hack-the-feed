# MyBuster Brain

From this directory, copy `.env.example` to `.env` and fill in the provider settings. Add the exact Vercel frontend origin to `ALLOWED_ORIGINS` when available.

```sh
uv run --env-file .env uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health
```

Set `OPENAI_MODEL` to an ID available to the OpenAI API project. Startup checks the authenticated OpenAI model catalog and runs one Oriane search. Results are cached for five minutes per process and refreshed on the next health request after expiry.

`ok` requires both Oriane and the configured OpenAI model to pass their checks. The `gmi` and `jev` flags remain in the existing response contract and report false in this configuration.

## Evidence engine

`await app.evidence.find(Myth(id, claim))` returns up to six sources for the grounded brief. It fetches PubMed abstracts and any seeded, allowlisted articles for that myth. The configured OpenAI model selects sentence indices. The excerpts are copied from the fetched text and checked before caching.

Results are stored in `data/sources/{myth_id}.json`. Pass `refresh=True` to fetch them again. If a lookup returns an empty list, the caller should show “No good source found.” `NCBI_EMAIL` and `NCBI_API_KEY` are optional.

## Judge

`await app.judge.ask(state, questions)` returns `(answers, "openai")` using
`OPENAI_MODEL`. Questions support `noul` (yes/no probability) and `choice`
(an option and its probability distribution). The judge validates the result
before returning it. For batches, pass a shared `httpx.AsyncClient` as
`client=` to reuse connections.

## Grounded brief

Send `POST /brief` with `{"myth_id":"lymphatic-detox","format":"standalone"}`.
The other formats are `stitch`, `duet`, and `no_camera`. Set `refresh` to
`true` to regenerate the brief from the evidence cache. Each factual script
line uses the exact text of a scored claim and cites its best source.
`claims[].engine` uses the existing `cached` label for saved scores and
`models.judge` identifies the OpenAI model that produced them.

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

Install ffmpeg and set `GMI_API_KEY` to a GMI Inference Engine key with access
to `GMI_VLM_MODEL`. Keep the existing OpenAI key and model for caption matching
and evidence checks. Send `POST /qa` as multipart with `myth_id`,
`approved_lines` (JSON), and `file` (an MP4 up to 45 seconds and 100 MiB).
The brain saves the latest report under `data/qa/` and reuses a cached result
for the same video, approved script, evidence and models.
