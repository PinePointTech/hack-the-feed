# Timeline: Friday Nov 6, 2026 (PT)

Owner: Vi. We started building at 2:30 PM, so this plan replaces the original 2:15 start.

| Time | Vi | Kris | Milestone |
|---|---|---|---|
| 2:30 to 3:00 | Scaffold `apps/web`, Tailwind, sync script, mock data layer on `contracts/fixtures`, Amplitude key and one test event | Scaffold `services/brain`, `/health`, keys for Oriane, GMI and Jev with one test call each, confirm GMI model IDs | M0 Setup |
| 3:00 | **Contracts freeze.** 10-minute call: walk `contracts/types.ts` together | same | |
| 3:00 to 3:45 | Radar page, myth page, first Amplitude events, skeleton deploy to Vercel | Oriane pull for the 3 demo myths, Jev stance labels, `/radar` and `/myths/{id}` served from `data/` | |
| 3:45 | **Checkpoint 1**: the web app shows real radar data from the brain | same | M1 Real data on screen |
| 3:45 to 4:40 | Studio (brief, sources, hooks, script editor with live `/check`, checklist), receipts page with vote and QR. Record the debunk at about 4:05, edit it in Compound at about 4:15, send Kris the approved lines at 4:15 and the MP4 by 4:30 | Evidence engine (PubMed and trusted pages), grounded brief, `/brief`, `/check`, `/publish`. Brief for the demo myth cached by 4:15. `data/published/lymphatic-detox.json` committed by 4:45 | |
| 4:40 | **Checkpoint 2**: full path once, radar to receipts | same | M2 End to end once |
| 4:40 to 5:00 | Impact page, calendar page, Amplitude dashboard, final Vercel deploy with the published JSON, QR on the slide | Video QA on the real MP4 (`/qa`), impact numbers, calendar, GMI sandbox job if time allows | |
| 5:00 | **Feature freeze.** Only blocker fixes after this | same | |
| 5:00 to 5:20 | Rehearse twice with a timer, record a backup screen video, open all tabs | Warm every cache, rehearse the AI explanation, stand by for fixes | M3 Demo ready |
| 5:30 | Demo | Demo | |
| 6:15 | Winners announced | | |

## Cut lines (decide at the checkpoint, not later)
- **3:45** Radar not live yet: keep the radar fixtures (they are real Oriane snapshots) and Kris moves on to the brief.
- **4:40** Brief not live: show the cached brief and run one live `/check` on the edited line. That is the AI moment.
- **4:55** QA not ready: keep the QA screen with a cached report clearly labeled "cached", or cut it from the demo.
- **5:00** Calendar or impact unfinished: hide the nav link. The demo still ends on receipts plus the Amplitude chart.
- Vercel deploy broken: demo on localhost; judges vote on a phone through a tunnel, or show the Amplitude chart from rehearsal.

## Checkpoint ritual (5 minutes)
1. Each person says: done, next, blocked.
2. Click the demo path on the demo laptop.
3. Update Linear statuses.
4. Re-decide cuts.
