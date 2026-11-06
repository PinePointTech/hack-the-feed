# MyBuster Brain

From this directory, copy `.env.example` to `.env` and fill in the provider settings. Add the exact Vercel frontend origin to `ALLOWED_ORIGINS` when available.

```sh
uv run --env-file .env uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health
```

Set `OPENAI_MODEL` to an ID available to the OpenAI API project. Startup checks the authenticated OpenAI model catalog and runs one Oriane search. Results are cached for five minutes per process and refreshed on the next health request after expiry.

`ok` requires both Oriane and the configured OpenAI model to pass their checks. The `gmi` and `jev` flags remain in the existing response contract and report false in this configuration.
