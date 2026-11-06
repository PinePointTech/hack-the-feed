# AI pipeline spec (`services/brain`)

Owner: Kris. Only Kris's sessions edit `services/brain/**` and `data/**`. Types: `contracts/types.ts` (mirror them in `app/schemas.py`). Prompts and question sets: `PROMPTS.md`.

## Layout
```
services/brain/
  pyproject.toml            uv project
  .env                      never committed (names in /.env.example)
  app/main.py               FastAPI app, routes, CORS, error handler
  app/config.py             settings from env
  app/schemas.py            pydantic v2 mirror of contracts/types.ts
  app/store.py              read and write data/*.json, cache helpers
  app/oriane.py             Oriane client
  app/gmi.py                GMI client (AsyncOpenAI pointed at GMI)
  app/judge.py              Jev client with GMI judge fallback
  app/radar.py              topic counts, claim pulls, stance, naming, harm tier
  app/evidence.py           PubMed and trusted pages, verbatim excerpts
  app/brief.py              grounded brief
  app/check.py              live line checks
  app/qa.py                 video QA
  app/publish.py            publish JSON
  app/impact.py             impact numbers
  app/calendar.py           calendar
  app/sandbox_jobs.py       stretch: run batch jobs in a GMI sandbox
  app/npi.py                stretch: NPI lookup
  scripts/run_radar.py      batch radar pull, writes data/
```
Deps: `uv add fastapi "uvicorn[standard]" httpx pydantic openai python-dotenv trafilatura rapidfuzz`. ffmpeg on PATH (`brew install ffmpeg`). Later: `uv add gmi-sandbox-sdk`.

## main.py essentials
- CORS: `allow_origins=settings.allowed_origins.split(",")`, all methods and headers.
- Error handler returns `{"error": {"code", "message"}}` with the right status.
- `/health` makes one cheap call to each service at startup and caches the booleans.
- Every GET reads from `data/` first; `?refresh=1` re-runs and overwrites.

## GMI client
```python
from openai import AsyncOpenAI
gmi = AsyncOpenAI(base_url=settings.gmi_base_url, api_key=settings.gmi_api_key)

async def llm_json(system: str, user: str, model: str | None = None) -> dict:
    r = await gmi.chat.completions.create(
        model=model or settings.gmi_llm_model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    return json.loads(r.choices[0].message.content)
```
Confirm model IDs first: `curl -s $GMI_BASE_URL/models -H "Authorization: Bearer $GMI_API_KEY" | jq '.data[].id'`.

## Oriane client
- Auth: `ORIANE_API_KEY`. REST base URL: from the Oriane dashboard or the kickoff demo (we don't have it yet). The request body is the same object we used through the Oriane MCP tool: `operator`, `filters`, `queries`, `sort`, `projection`, `limit`, `offset`. The response has `data.aggregations` (totals over all matches), `data.results` (one page) and `metadata.pagination.totalCount`.
- If REST is not available, use Firecrawl Alexandria: `POST https://api.firecrawl.dev/v2/scrape` with `{"alexandria": {"provider": "oriane", "capability": "tiktok/posts-search", "options": {...}}}` (needs a Firecrawl key). Check the capability names in `sponsors/ORIANE.md`.
- If both fail, serve the committed snapshots. They are real Oriane data.
- Cache every response in `data/cache/oriane/<sha1 of body>.json`.

### Query recipes (copy exactly)
Topic count, current window (projection basic, limit 1, sort viewsCount desc):
```json
{"operator": "and",
 "filters": {"publishedAt": {"after": "2026-10-07"}},
 "queries": [{"operator": "or", "name": "lymphatic_exact", "filters": {
   "transcript":   {"includesExactly": {"operator": "or", "values": ["lymphatic drainage"]}},
   "caption":      {"includesExactly": {"operator": "or", "values": ["lymphatic drainage"]}},
   "onScreenText": {"includesExactly": {"operator": "or", "values": ["lymphatic drainage"]}}}}],
 "sort": [{"by": "viewsCount", "direction": "desc"}], "projection": "basic", "limit": 1}
```
Previous window: same with `"publishedAt": {"after": "2026-09-07", "before": "2026-10-06"}`. `trend_pct = round((cur - prev) / prev * 100)`; rising above +10, cooling below -10, else steady.

Claim pull (projection default, limit 30): the claim phrases from `research/MYTH-CATALOG.md` in transcript and caption with `includesFuzzy`. Fuzzy matches all words in any order, including partial words, so it is noisy. Use it to pull candidates, then let stance labels decide.

Quote timestamps (projection full, limit 5 or less): `media[0].transcriptChunks[]` has `startSeconds`, `endSeconds`, `text`. Find the chunk that contains the quote and use its `startSeconds` as `quote_start_s`. A quote can span two chunks; search the full `media[0].transcript` for the exact quote and take the start of the chunk where it begins.

Clinician baseline: add `"profileBio": {"includesFuzzy": {"operator": "or", "values": ["physician", "doctor", "MD", "nurse", "physical therapist", "lymphedema", "dermatologist", "surgeon"]}}` to the topic query.

Exact single video: `"profileHandle": {"exactMatch": {"values": ["tulumtrainer"]}}` plus a transcript `includesExactly` phrase.

### Fields we read per result
`id` (Oriane id), `platform`, `platformId`, `profileHandle`, `profileDisplayName`, `profileFollowersCount`, `viewsCount`, `sharesCount`, `interactionsCount`, `publishedAt`, `thumbnailMediaUrl`, `caption`, `profileBio`, `media[0].transcript`, `media[0].onScreenText`, `media[0].transcriptChunks` (full only).
URLs: Instagram `https://www.instagram.com/reel/{platformId}/`, TikTok `https://www.tiktok.com/@{handle}/video/{platformId}`.

## Judge (`judge.py`)
```python
async def ask(state: str, questions: dict) -> tuple[dict, str]:
    """Returns (answers, engine). answers[name] = {"noul": p} or {"choice": k, "probabilities": {...}}."""
    if settings.jev_api_key:
        try:
            r = await http.post(f"{settings.jev_base_url}/v1/systemone",
                headers={"Authorization": f"Bearer {settings.jev_api_key}"},
                json={"model": settings.jev_model, "state": state, "questions": questions}, timeout=15)
            r.raise_for_status()
            return r.json()["answers"], "jev"
        except Exception as e:
            log.warning("jev failed, using gmi judge: %s", e)
    return await gmi_judge(state, questions), "gmi_judge"
```
- Prefer `noul` questions (probability of yes). They are the best documented. For a category, ask one noul per option and take the highest, unless a `choice` call works on the first try.
- `gmi_judge` sends the same state and questions to the GMI LLM with the fallback prompt in `PROMPTS.md` and returns the same `answers` shape.
- Concurrency: `asyncio.Semaphore(8)` around calls. Timeout 15 s, one retry.

## Radar (`radar.py`)
For each myth in `research/MYTH-CATALOG.md`:
1. Topic counts for the current and previous windows (basic).
2. Claim candidates: top 30 by views (default).
3. Stance and flags on each candidate with the stance question set. Keep `promotes` for `videos`, `debunks` for `counter_voices`, drop `ad` and `unrelated` from claim counts, and record `stance_counts` and `stance_sample_size`.
4. Naming:
```python
def nameable(v, flags) -> bool:
    big = v["views"] >= 100_000 or (v.get("followers") or 0) >= 50_000
    return big and flags["minor"] < 0.3 and flags["personal_illness"] < 0.5
```
5. Quotes: for the top 5 promoters, pull `full` and set the exact quote and `quote_start_s`. The quote must be an exact substring of the transcript, caption or on-screen text.
6. Claim sentence: GMI LLM (claim prompt) over the top 10 promoter transcripts. Harm tier: the harm question set, then `harmful` if p >= 0.5, else `false` if contradicted p >= 0.5, else `unproven`.
7. Write `data/myths/{id}.json` (MythDetail) and `data/radar.json` (Radar). Commit both at checkpoint 1.

## Evidence (`evidence.py`)
1. PubMed: `GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=<query>&retmax=5&sort=relevance&retmode=json&tool=mybuster&email=$NCBI_EMAIL` then `efetch.fcgi?db=pubmed&id=<pmids>&rettype=abstract&retmode=xml`. Parse ArticleTitle, AbstractText, journal, year. Stay under 3 requests per second without an API key. Do not scrape PMC article pages: they sit behind a CAPTCHA.
2. Trusted pages: start from the seeded URLs in `research/MYTH-CATALOG.md`. LLM-suggested URLs are allowed only if they are on the allowlist and actually fetch: nih.gov, ncbi.nlm.nih.gov, medlineplus.gov, cdc.gov, who.int, nhs.uk, mayoclinic.org, clevelandclinic.org, hopkinsmedicine.org, uclahealth.org, health.harvard.edu, cochrane.org, nationalgeographic.com. Extract text with trafilatura.
3. Split into numbered sentences (40 to 400 characters). The LLM returns sentence indices that support or contradict the claim (excerpt prompt). We copy the text by index, so excerpts are verbatim by construction.
4. Verify anyway, after normalizing quotes and whitespace:
```python
QUOTES = {"‘": "'", "’": "'", "“": '"', "”": '"', " ": " "}
def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    for k, v in QUOTES.items():
        s = s.replace(k, v)
    return re.sub(r"\s+", " ", s).strip().lower()

def is_verbatim(excerpt: str, page_text: str) -> bool:
    return norm(excerpt) in norm(page_text)
```
5. Output `Source` objects with `excerpts`. No excerpt, no source.

## Brief (`brief.py`)
1. Evidence for the myth claim and each sub-claim (detox, weight loss, what it is good for).
2. GMI LLM with the brief prompt, given only the numbered excerpts. It returns verdict, true and false lists, claims with evidence ids, 5 hooks (one per style), and a script for the requested format with `claim_id` on every factual line.
3. Map evidence ids back to verbatim excerpts. Judge each claim with the claim support set. support = p(supported) x (1 - p(contradicted)). Status by threshold (0.8, 0.5).
4. Any claim under 0.5: drop it and rewrite its script line with the thin-evidence wording, then re-check. Never ship an unsupported line.
5. Cache `data/briefs/{id}.{format}.json`. Target under 45 s cold.

## Check (`check.py`)
For each line: `has_claim` question. If false, return `has_claim: false`. If true, judge support against every excerpt in the cached brief (parallel), keep the best, set `status`, `evidence` and a `note` ("No source says this" when unsupported). The demo line "Lymphatic drainage burns fat." must come back unsupported. Under 3 s.

## Video QA (`qa.py`)
1. Save the upload to `data/tmp/`, then `ffmpeg -hide_banner -loglevel error -i in.mp4 -vf "fps=1,scale=720:-2" -frames:v 40 data/frames/{id}/f_%03d.jpg`. Frame n is about second n-1.
2. Send frames to the GMI vision model (`GMI_VLM_MODEL`), up to 4 per request, as `image_url` parts with base64 data URLs, with the vision prompt. It returns `{"frames": [{"t_s": 0, "text": "..."}]}`. Test one frame first to confirm the model accepts images.
3. Dedupe texts across neighboring frames. Match each text to the approved lines' `on_screen` (or `text`) with `rapidfuzz.fuzz.partial_ratio` on normalized text: 85 or more is a match; 60 to 85, ask the caption match question; under 60, it is not in the script.
4. Text not in the script: if `has_claim` is true, run a support check and report `unsupported_claim` or `text_not_in_script`.
5. `pass` is true when there are no `unsupported_claim` issues. Save `data/qa/{id}.json`. About 60 s for a 30 to 40 s video.

## Publish (`publish.py`)
Validate that every checklist item is true (else 422). Keep only `nameable` videos in `quoted`. Set `certified_by_clinician` only if `clinician.verified`. Write `data/published/{id}.json` and commit it (`data: publish lymphatic-detox`) by 4:45 so Vi's deploy picks it up.

## Impact (`impact.py`)
Over the myth window: `myth_reach` = views of videos labeled promotes, `response_reach` = views of videos labeled debunks, `response_ratio` = response over myth. `hours_spike_to_first_response`: from the top promoter's `published_at` to the earliest debunk after it. `baseline_clinician` from the clinician query. Report how much of the topic's views the labeled sample covers in `note`. Missing values stay absent, never 0.

## Calendar (`calendar.py`)
`this_week`: catalog myths and candidate topics with counts and trend (`basis: oriane_trend`). `watchlist`: curated items from the catalog (`basis: curated`). `week_of` is the next Monday. Also write `data/calendar.json` for the static site.

## Stretch: GMI sandbox (`sandbox_jobs.py`)
Run `scripts/run_radar.py` or the QA job inside a GMI sandbox and record `ran_in: "gmi_sandbox"`. Known SDK calls: `from sandbox_sdk import SandboxClient`, env `GMI_SANDBOX_API_KEY` and `GMI_SANDBOX_IDC_NAME`, `sandbox.files.upload(...)`, `sandbox.commands.run(cmd, cwd=..., envs=..., wait=True, wait_timeout_seconds=...)`, `sandbox.files.download(...)`. stdout is capped at 1 MiB, so write results to files. Creating the sandbox: follow `docs.gmicloud.ai/agentbox-api/sandbox-sdk/usage.md`.

## Stretch: NPI (`npi.py`)
`GET https://npiregistry.cms.hhs.gov/api/?version=2.1&number=<npi>`. Verified if one result comes back and the name matches. Check the response field names on the first call.

## Test commands
See `03-CONTRACTS.md`. Before each checkpoint: `curl` every live endpoint, diff the output shape against the fixture, commit `data/`.
