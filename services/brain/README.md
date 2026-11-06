# MyBuster Brain

From this directory, copy `.env.example` to `.env` and fill in the provider settings. Add the exact Vercel frontend origin to `ALLOWED_ORIGINS` when available.

```sh
uv run --env-file .env uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health
```

To select the three GMI model IDs, query the authenticated model catalog and copy the IDs into `GMI_LLM_MODEL`, `GMI_LLM_FAST_MODEL`, and `GMI_VLM_MODEL`.

```sh
curl -fsS "${GMI_BASE_URL:-https://api.gmi-serving.com/v1}/models" \
  -H "Authorization: Bearer $GMI_API_KEY"
```

The first health request runs the provider probes in parallel. Results are cached for five minutes per process. `ok` requires a successful Oriane search and all three configured GMI models to appear in the catalog. Jev is reported separately because the planned judge can fall back to GMI.
