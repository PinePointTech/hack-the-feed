# Start here: Vi

Your lane: `apps/web/**`, Amplitude, Compound.mov, Vercel, the demo. Full spec: `docs/WEB-APP.md`.

## First 30 minutes (2:30 to 3:00)
1. In your clone: `npx create-next-app@latest apps/web --ts --tailwind --app --eslint --use-npm --yes`
2. `cd apps/web && npm i @amplitude/analytics-browser qrcode.react`
3. Copy the web block of `.env.example` into `apps/web/.env.local`. Keep `NEXT_PUBLIC_USE_MOCKS=1` for now.
4. Add the TS path alias so the app can import contracts: in `apps/web/tsconfig.json` add `"@contracts/*": ["../../contracts/*"]` under `compilerOptions.paths`. If Next refuses files outside the app root, add `outputFileTracingRoot` in `next.config` or copy fixtures with a prebuild script (see WEB-APP.md).
5. Create `src/lib/api.ts` with the mock switch, and `src/lib/track.ts` with the typed Amplitude wrapper (WEB-APP.md has both).
6. Amplitude: create a project, paste the API key, call `amplitude.init` in a client provider. Fire one test event and check it in User Lookup.
7. Commit and push: `web: scaffold`.

## At 3:00: contracts call with Kris (10 min)
Walk `contracts/types.ts`. Agree on anything missing. After this, contracts only grow.

## Then build in this order
1. Radar page `/desk` (fixtures) → Myth page `/desk/myth/[id]`
2. Amplitude events: Radar Viewed, Myth Opened
3. Skeleton deploy to Vercel (do it early, not at 5 PM)
4. Studio `/desk/myth/[id]/studio`: brief panel, sources, format picker, hooks, script editor with live `/check`, checklist, Approve
5. Receipts `/r/[id]`: quote card, verdict, sources, video, vote buttons, QR
6. Record the debunk at about 4:05 PM (script from the studio). Send Kris the approved script lines by 4:15. Edit it in Compound at about 4:15, export a 9:16 MP4 to `apps/web/public/video/lymphatic-detox.mp4` and send Kris the path for QA by 4:30.
7. Impact `/desk/impact/[id]` and calendar `/calendar`
8. Amplitude dashboard "MyBuster demo" (charts listed in `docs/08-TRACKING-PLAN.md`)

## Before 5:00 PM
- Final deploy with `data/published/*.json` copied in
- QR for `/r/lymphatic-detox?utm_source=demo_qr` on the slide
- Rehearse `docs/06-DEMO-SCRIPT.md` twice

## Your Linear issues
Project MyBuster (P-HTF-8) in team Hack The Feed. Yours: HTF-2, HTF-3, HTF-4, HTF-7, HTF-8, HTF-9, HTF-15, HTF-16, HTF-17, HTF-18, HTF-19, HTF-22, HTF-23, HTF-24, HTF-25. Filter: assignee me, project MyBuster. Full map in `docs/11-LINEAR.md`.
