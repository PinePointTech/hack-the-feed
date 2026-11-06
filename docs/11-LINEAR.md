# Linear map

Workspace: Vi Huynh. Team: Hack The Feed (key HTF). Project: MyBuster (P-HTF-8).
https://linear.app/vihuynh72/project/mybuster-5a8edb6116e2

## Milestones

| Milestone | Due (PT) | Done when |
|---|---|---|
| M0 Setup and contracts frozen | 3:00 PM | Both scaffolds run, every key answered one test call, contracts frozen |
| M1 Real data on screen | 3:45 PM | Radar and myth pages on real Oriane data, first Amplitude events, Vercel skeleton |
| M2 End to end once | 4:40 PM | One full run: radar, myth, brief, live check, approval, video, publish, receipts vote |
| M3 Demo ready | 5:20 PM | Feature freeze at 5:00, rehearsed twice, backup recording saved |

## Labels (team)

Web, AI, Video, Analytics, Demo.

## Issues

| ID | Title | Owner | Milestone | Blocked by |
|---|---|---|---|---|
| HTF-1 | Scaffold the brain: FastAPI, /health, key smoke tests | Kris | M0 | |
| HTF-2 | Scaffold the web app: Next.js, mock data layer, contracts sync | Vi | M0 | |
| HTF-3 | Set up Amplitude: project, init, typed track() | Vi | M0 | |
| HTF-4 | Contracts walkthrough and freeze at 3:00 PM | Vi with Kris | M0 | |
| HTF-5 | Oriane client and radar pull for the 3 demo myths | Kris | M1 | |
| HTF-6 | Judge client: Jev System One with GMI LLM fallback | Kris | M1 | |
| HTF-7 | Radar page /desk | Vi | M1 | |
| HTF-8 | Myth page /desk/myth/[id] | Vi | M1 | |
| HTF-9 | Deploy a skeleton to Vercel early | Vi | M1 | |
| HTF-10 | Stance labels, harm tier and naming policy on radar videos | Kris | M1 | HTF-5, HTF-6 |
| HTF-11 | Evidence engine: PubMed and trusted pages with verbatim excerpts | Kris | M2 | HTF-1 |
| HTF-12 | Grounded brief and POST /brief | Kris | M2 | HTF-6, HTF-11 |
| HTF-13 | POST /check for live script edits | Kris | M2 | HTF-12 |
| HTF-14 | POST /publish and the published JSON | Kris | M2 | HTF-12 |
| HTF-15 | Studio 1: brief, sources, format and hooks | Vi | M2 | HTF-2 |
| HTF-16 | Studio 2: script editor with live check and approval checklist | Vi | M2 | HTF-15 |
| HTF-17 | Record and edit the debunk video in Compound.mov | Vi | M2 | HTF-16 |
| HTF-18 | Studio 3: attach video, QA report and publish | Vi | M2 | HTF-16 |
| HTF-19 | Public receipts page /r/[id] with vote and QR | Vi | M2 | HTF-2 |
| HTF-20 | Video QA: ffmpeg frames, GMI vision, Jev match (POST /qa) | Kris | M3 | HTF-6, HTF-17 |
| HTF-21 | Impact numbers and calendar endpoints | Kris | M3 | HTF-10 |
| HTF-22 | Impact page /desk/impact/[id] | Vi | M3 | |
| HTF-23 | Calendar page /calendar | Vi | M3 | |
| HTF-24 | Amplitude dashboard, final deploy and QR slide | Vi | M3 | HTF-14, HTF-19 |
| HTF-25 | Pitch slides, two rehearsals, backup recording | Vi | M3 | |
| HTF-26 | Demo support: warm caches, AI talk track, Q&A prep | Kris | M3 | |
| HTF-27 | Stretch: run the radar batch or video QA inside a GMI sandbox | Kris | M3, backlog | |
| HTF-28 | Stretch: NPI check for the Certified by clinician label | Kris | M3, backlog | |

Pairs that meet in the middle: HTF-5 and HTF-7, HTF-10 and HTF-8, HTF-12 and HTF-15, HTF-13 and HTF-16, HTF-14 and HTF-19, HTF-17 and HTF-20, HTF-21 with HTF-22 and HTF-23.

## Project documents

| Document | Link | Repo mirror |
|---|---|---|
| PRD: MyBuster | https://linear.app/vihuynh72/document/prd-mybuster-292ba6cedbcb | docs/01-PRD.md |
| Work split, timeline and rules | https://linear.app/vihuynh72/document/work-split-timeline-and-rules-4f7c9031092f | docs/04-WORK-SPLIT.md, docs/05-TIMELINE.md |
| API contracts v1 | https://linear.app/vihuynh72/document/api-contracts-v1-39b0207bb46b | docs/03-CONTRACTS.md, contracts/types.ts |
| Demo script and pitch | https://linear.app/vihuynh72/document/demo-script-and-pitch-6b7c23910c60 | docs/06-DEMO-SCRIPT.md, docs/07-PITCH.md |
| AI pipeline spec (Kris) | https://linear.app/vihuynh72/document/ai-pipeline-spec-kris-056bd94e8c43 | docs/AI-PIPELINE.md, docs/PROMPTS.md |
| Web app spec (Vi) | https://linear.app/vihuynh72/document/web-app-spec-vi-07c518ba107b | docs/WEB-APP.md, docs/08-TRACKING-PLAN.md |
| Research and verified numbers | https://linear.app/vihuynh72/document/research-and-verified-numbers-5387d341a26c | docs/research/ |

## Working in Linear

1. Filter "My issues" inside project MyBuster to see your lane.
2. Move an issue to In Progress when you start it. Move it to Done when it meets the definition of done in `CLAUDE.md`, with a one-line comment.
3. We work trunk-based on `main`. Put the issue ID in the commit message, for example `web: radar page (HTF-7)`. If the Linear GitHub integration is on, the ID links the commit.
4. Blocked for more than 10 minutes? Comment on the issue, switch to fixtures, keep going.
5. Contract changes after 3:00 PM: comment on HTF-4 first, then Kris commits.
