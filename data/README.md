# data/

Owner: Kris. Only the brain writes here. Every file matches a type in `contracts/types.ts`.

| Path | Type | Written by | Committed |
|---|---|---|---|
| `radar.json` | `Radar` | `scripts/run_radar.py`, `GET /radar?refresh=1` | yes, at checkpoint 1 |
| `myths/{id}.json` | `MythDetail` | radar | yes |
| `briefs/{id}.{format}.json` | `Brief` | `POST /brief` | yes, once the demo brief is good |
| `qa/{id}.json` | `QAReport` | `POST /qa` | yes |
| `published/{id}.json` | `PublishedDebunk` | `POST /publish` | yes, by 4:45 PM (Vi's deploy copies it) |
| `impact/{id}.json` | `Impact` | `GET /impact/{id}` | yes |
| `calendar.json` | `Calendar` | `GET /calendar` | yes (Vi's sync script copies it) |
| `cache/` | raw API responses | brain | no (gitignored) |
| `frames/` | video frames for QA | brain | no (gitignored) |
| `tmp/` | uploads | brain | no (gitignored) |

Rules:
- Commit with the prefix `data:`.
- Never hand-edit a number. Re-run the pipeline instead.
- Snapshots here are the demo fallback when a sponsor API is down, so commit them at every checkpoint.
