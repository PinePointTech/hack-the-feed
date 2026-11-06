# Start here: Kris

Your lane: `services/brain/**` and `data/**`. Oriane, GMI Cloud (serverless and sandbox), Jev. Full spec: `docs/AI-PIPELINE.md`. Prompts and Jev question sets: `docs/PROMPTS.md`.

## First 30 minutes (2:30 to 3:00)
1. `uv init --app services/brain && cd services/brain`
2. `uv add fastapi "uvicorn[standard]" httpx pydantic openai python-dotenv trafilatura` (add `gmi-sandbox-sdk` when you reach the sandbox task)
3. Copy the brain block of `.env.example` into `services/brain/.env`
4. Smoke-test each key, one call each:
   - GMI: `curl -s https://api.gmi-serving.com/v1/models -H "Authorization: Bearer $GMI_API_KEY" | head` and pick real model IDs for `GMI_LLM_MODEL` and `GMI_VLM_MODEL`
   - Oriane: one search for "lymphatic drainage" with `projection: "basic"`, `limit: 1`
   - Jev: one System One request (example in `docs/sponsors/JEV.md`). If you can't get access in 10 minutes, set `JEV_API_KEY=` empty and use the GMI judge fallback
5. `app/main.py` with `/health` and CORS for `http://localhost:3000`
6. Pydantic models in `app/schemas.py` mirroring `contracts/types.ts`
7. Commit and push: `brain: scaffold`

## At 3:00: contracts call with Vi (10 min)
After this, you are the only one who edits `contracts/`, and only additively.

## Then build in this order
1. `oriane.py` client + `radar.py`: pull the 3 demo myths with exact phrases from `docs/research/MYTH-CATALOG.md`. Write `data/radar.json` and `data/myths/{id}.json`. Serve `/radar` and `/myths/{id}` from those files.
2. `judge.py`: Jev client with the GMI fallback. Run stance labels on the top 30 videos per myth.
3. `evidence.py` + `brief.py`: PubMed + trusted pages, excerpts must be exact substrings, grounded draft on GMI, Jev claim checks. Serve `/brief` and `/check`.
4. `publish.py`: `/publish` writes `data/published/{id}.json`. Commit by 4:45 so Vi's deploy picks it up.
5. `qa.py`: ffmpeg frames → GMI vision → Jev match. Serve `/qa`.
6. `impact.py`: Oriane re-pull, baseline expert share. Serve `/impact/{id}` and `/calendar`.
7. Stretch: run the radar batch and QA inside a GMI sandbox (`docs/sponsors/GMI-CLOUD.md`).

## Credits
Oriane searches cost workspace credits. Use `projection: "basic"` for counts, `default` for transcripts, and `full` (transcript chunks with start and end seconds) only with `limit` 5 or less. Cache everything in `data/`.

## Your Linear issues
Project MyBuster (P-HTF-8) in team Hack The Feed. Yours: HTF-1, HTF-5, HTF-6, HTF-10, HTF-11, HTF-12, HTF-13, HTF-14, HTF-20, HTF-21, HTF-26, HTF-27, HTF-28. Filter: assignee me, project MyBuster. Full map in `docs/11-LINEAR.md`.
