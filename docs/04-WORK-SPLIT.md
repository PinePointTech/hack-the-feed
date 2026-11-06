# Work split: Vi and Kris

Owner: Vi. The rule that prevents collisions: **each person owns folders, not features.**

## Who owns what

| Area | Vi (fullstack) | Kris (AI) |
|---|---|---|
| Folders | `apps/web/**` | `services/brain/**`, `data/**` |
| Sponsors | Amplitude, Compound.mov, Vercel | Oriane, GMI Cloud (serverless + sandbox), Jev |
| Product surfaces | Radar UI, myth page, brief and studio UI, receipts page, calendar page, impact page | Radar data, stance labels, myth clustering, evidence engine, briefs, claim checks, video QA, impact numbers, publish JSON |
| Video | Records the debunk, edits it in Compound, exports, posts | Runs QA on the exported file |
| Demo | Drives the laptop, owns slides and the QR | Narrates the AI part, answers technical questions |
| Docs | PRD, work split, timeline, demo script, pitch, tracking plan, web app, Linear map, START-HERE-VI | Architecture, AI pipeline, prompts, sponsor notes (Oriane, GMI, Jev), research findings, myth catalog, START-HERE-KRIS |

Shared: `contracts/` is written once before the 3:00 PM freeze. After the freeze, Kris applies additive changes that both agreed in chat.

## Interfaces between you

| From | To | What | When |
|---|---|---|---|
| Both | Both | Contracts freeze (types + fixtures) | 3:00 PM |
| Kris | Vi | Brain URL and which endpoints are live | Each checkpoint (3:45, 4:40) |
| Kris | Vi | `data/radar.json` and `data/myths/*.json` committed | 3:45 PM |
| Kris | Vi | Brief for the demo myth cached in `data/briefs/` | 4:15 PM |
| Vi | Kris | Approved script lines (from the studio) | 4:15 PM |
| Vi | Kris | Exported MP4 path (or URL) for QA | 4:30 PM |
| Kris | Vi | `data/published/lymphatic-detox.json` committed | 4:45 PM |

## Collision rules
1. Never edit outside your folders. Need something there? Ask in chat with the exact change.
2. `git pull --rebase` before every push. Push small commits often (every 20 to 30 minutes at least).
3. Commit prefixes: `web:`, `brain:`, `data:`, `contracts:`, `docs:`.
4. Separate toolchains: npm only inside `apps/web`, uv only inside `services/brain`. No root package.json.
5. Separate env files: `apps/web/.env.local`, `services/brain/.env`. Never commit them.
6. Blocked on the other side for more than 10 minutes? Switch to fixtures and keep going. Say so in chat.
7. Only Vi deploys to Vercel. Only Kris runs paid Oriane, GMI and Jev batch jobs. Agree before any big batch so credits last.
8. Each person's coding agent reads `CLAUDE.md` first. Tell it your lane in the first message.

## Linear
Every task is an issue in team Hack The Feed, project MyBuster, assigned to its owner and tied to a milestone. Map: `docs/11-LINEAR.md`. Move issues to In Progress when you start and Done when they meet the definition of done in `CLAUDE.md`.
