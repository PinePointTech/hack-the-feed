# Contracts

The only shared folder. `types.ts` defines every request and response between `apps/web` (Vi) and `services/brain` (Kris). `fixtures/` holds one example per response so the web app runs with no brain at all.

## Rules
1. Frozen at 3:00 PM PT, Nov 6, 2026. After that, only add optional fields.
2. Never rename or remove a field. If something is wrong, add a new optional field and stop using the old one.
3. Announce every change in team chat first. Kris commits it with the prefix `contracts:`.
4. The brain mirrors these types in `services/brain/app/schemas.py` (pydantic v2). JSON keys are snake_case on both sides.
5. The web app copies `types.ts` and `fixtures/*.json` into `apps/web/src/contracts/` with its sync script (`predev` and `prebuild`). Never edit the copies.

## Fixtures
| File | Response of | Notes |
|---|---|---|
| `health.json` | `GET /health` | Example only |
| `radar.json` | `GET /radar` | Real Oriane snapshot, 3 myths |
| `myth-lymphatic-detox.json` | `GET /myths/lymphatic-detox` | Real videos and quotes; stance mix is a hand-labeled sample |
| `brief-lymphatic-detox.json` | `POST /brief` | Real sources and verbatim excerpts; support scores are placeholders |
| `check.json` | `POST /check` | The demo edit "Lymphatic drainage burns fat." coming back unsupported |
| `qa.json` | `POST /qa` | Example only, no video checked yet |
| `impact.json` | `GET /impact/lymphatic-detox` | Real reach numbers; response reach pending |
| `calendar.json` | `GET /calendar` | Real Oriane counts plus a curated watchlist |
| `published-lymphatic-detox.json` | `GET /published/lymphatic-detox` | What `/publish` writes |

Every fixture has a top-level `_fixture` object. It lists the fields that are placeholders. Never show a placeholder value as a real result: the web app shows a small "fixture" badge whenever it falls back to these files, and Kris replaces placeholder values with real output as soon as the brain produces it.

## Where the real numbers come from
Every Oriane number, with the exact query, is in `docs/research/ORIANE-FINDINGS.md`. Every source excerpt is copied verbatim from the page listed in its `url`.
