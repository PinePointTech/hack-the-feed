# Web app spec (`apps/web`)

Owner: Vi. Only Vi's sessions edit `apps/web/**`. Types: `contracts/types.ts`. Events: `08-TRACKING-PLAN.md`.

## Stack
Next.js App Router, TypeScript, Tailwind, `@amplitude/analytics-browser`, `qrcode.react`. Deployed on Vercel with Root Directory `apps/web`.

## Layout
```
apps/web/
  scripts/sync-contracts.mjs      copies contracts and published JSON into the app
  src/contracts/                  generated copies, never edit (types.ts, fixtures/*.json)
  public/published/               generated copies of data/published/*.json
  public/video/lymphatic-detox.mp4
  src/lib/api.ts                  brain client with fixture fallback
  src/lib/track.ts                typed Amplitude wrapper
  src/app/providers.tsx           client provider that inits Amplitude
  src/app/page.tsx                landing
  src/app/desk/page.tsx           radar
  src/app/desk/myth/[id]/page.tsx
  src/app/desk/myth/[id]/studio/page.tsx
  src/app/desk/impact/[id]/page.tsx
  src/app/r/[id]/page.tsx         public receipts
  src/app/calendar/page.tsx       public calendar
  src/components/                 HarmChip, TrendBadge, QuoteCard, SourceCard, SupportBadge, ScriptEditor, Checklist, QAReport, VoteButtons, DataBadge
```

## Sync script
`package.json`: `"predev": "node scripts/sync-contracts.mjs"`, `"prebuild": "node scripts/sync-contracts.mjs"`. Commit the copies, so Vercel still builds if it cannot see files outside `apps/web`.

```js
// scripts/sync-contracts.mjs: copy shared contracts and published debunks into the app.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(app, "..", "..");

function copyDir(from, to, keep) {
  if (!existsSync(from)) return console.warn(`[sync] missing ${from}, keeping committed copies`);
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) if (keep(f)) copyFileSync(join(from, f), join(to, f));
}

mkdirSync(join(app, "src/contracts"), { recursive: true });
if (existsSync(join(root, "contracts/types.ts")))
  copyFileSync(join(root, "contracts/types.ts"), join(app, "src/contracts/types.ts"));
copyDir(join(root, "contracts/fixtures"), join(app, "src/contracts/fixtures"), (f) => f.endsWith(".json"));
copyDir(join(root, "data/published"), join(app, "public/published"), (f) => f.endsWith(".json"));
if (existsSync(join(root, "data/calendar.json")))
  copyFileSync(join(root, "data/calendar.json"), join(app, "public/calendar.json"));
console.log("[sync] done");
```

## Data layer (`src/lib/api.ts`)
Every call returns `{ data, from }` where `from` is `"live"` or `"fixture"`. On any error or timeout it falls back to the fixture, logs a warning, and the page shows `<DataBadge from={from} />` (a small grey "fixture" pill). Never hide a fallback.

```ts
import type { Radar, MythDetail, Brief, BriefRequest, CheckRequest, CheckResponse, QAReport,
  PublishRequest, PublishedDebunk, Impact, Calendar } from "@/contracts/types";
import radarFx from "@/contracts/fixtures/radar.json";
import mythFx from "@/contracts/fixtures/myth-lymphatic-detox.json";
import briefFx from "@/contracts/fixtures/brief-lymphatic-detox.json";
import checkFx from "@/contracts/fixtures/check.json";
import qaFx from "@/contracts/fixtures/qa.json";
import publishedFx from "@/contracts/fixtures/published-lymphatic-detox.json";
import impactFx from "@/contracts/fixtures/impact.json";
import calendarFx from "@/contracts/fixtures/calendar.json";

const BRAIN = process.env.NEXT_PUBLIC_BRAIN_URL ?? "http://localhost:8000";
const MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "1";
export type Sourced<T> = { data: T; from: "live" | "fixture" };

async function call<T>(path: string, init: RequestInit | undefined, fixture: () => T, ms: number): Promise<Sourced<T>> {
  if (MOCKS) return { data: fixture(), from: "fixture" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(`${BRAIN}${path}`, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return { data: (await res.json()) as T, from: "live" };
  } catch (err) {
    console.warn(`[api] ${path} failed, using fixture`, err);
    return { data: fixture(), from: "fixture" };
  } finally {
    clearTimeout(timer);
  }
}
const post = (body: unknown): RequestInit => ({
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const fx = <T,>(x: unknown) => x as T;

export const api = {
  radar: () => call<Radar>("/radar", undefined, () => fx<Radar>(radarFx), 15000),
  myth: (id: string) => call<MythDetail>(`/myths/${id}`, undefined, () => mythFallback(id), 15000),
  brief: (req: BriefRequest) => call<Brief>("/brief", post(req), () => fx<Brief>(briefFx), 90000),
  check: (req: CheckRequest) => call<CheckResponse>("/check", post(req), () => checkFallback(req), 15000),
  qa: (form: FormData) => call<QAReport>("/qa", { method: "POST", body: form }, () => fx<QAReport>(qaFx), 120000),
  publish: (req: PublishRequest) => call<PublishedDebunk>("/publish", post(req), () => fx<PublishedDebunk>(publishedFx), 30000),
  impact: (id: string) => call<Impact>(`/impact/${id}`, undefined, () => fx<Impact>(impactFx), 15000),
  calendar: () => call<Calendar>("/calendar", undefined, () => fx<Calendar>(calendarFx), 15000),
};
```
- `mythFallback(id)`: return the lymphatic fixture for `lymphatic-detox`; for other ids build a `MythDetail` from the matching radar myth with `videos: [top_video]`, `counter_voices: []`, `stance_counts: {}`.
- `checkFallback(req)`: for each line, if the text includes "burns fat" return `checkFx.results[0]` with that `line_id`; otherwise `{ line_id, has_claim: false, engine: "cached", note: "Not checked (brain offline)" }`. Never fake a green check.

## Analytics (`src/lib/track.ts`)
```ts
"use client";
import * as amplitude from "@amplitude/analytics-browser";

let started = false;
export function initAmplitude() {
  if (started || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  if (!key) return console.warn("[amp] no key, events not sent");
  amplitude.init(key, { autocapture: true });
  started = true;
}

type Events = {
  "Radar Viewed": { myth_count: number; data_source: "live" | "fixture" };
  "Myth Opened": { myth_id: string; harm_tier: string; trend: string; from: "radar" | "calendar" | "direct"; data_source: "live" | "fixture" };
  "Brief Generated": { myth_id: string; format: string; source_count: number; claim_count: number; unsupported_count: number; latency_ms: number; engine: string };
  "Hook Selected": { myth_id: string; hook_style: string };
  "Claim Flagged": { myth_id: string; line_id: string; status: string; support?: number; engine: string };
  "Brief Approved": { myth_id: string; format: string; line_count: number; claim_count: number; minutes_since_open: number };
  "Video Exported": { myth_id: string; tool: "compound"; duration_s?: number };
  "Video QA Completed": { myth_id: string; pass: boolean; issue_count: number; frames_checked: number; ran_in: string };
  "Debunk Published": { myth_id: string; has_video: boolean; certified_by_clinician: boolean };
  "Receipts Viewed": { myth_id: string; utm_source?: string; utm_medium?: string };
  "Source Clicked": { myth_id: string; source_id: string; publisher: string; location: "receipts" | "studio" };
  "Mind Changed Vote": { myth_id: string; answer: "yes" | "no" | "already_knew" };
  "Calendar Viewed": { week_of: string; item_count: number };
  "Script Reused": { myth_id: string; from: "calendar" };
};

export function track<K extends keyof Events>(name: K, props: Events[K]) {
  initAmplitude(); // child effects run before the provider's effect, so init here too
  if (started) amplitude.track(name, props);
}
```
`src/app/providers.tsx` is a client component that calls `initAmplitude()` in `useEffect` and wraps the app in `layout.tsx`. Fire page-view style events (Radar Viewed, Myth Opened, Receipts Viewed) once per mount in `useEffect`.

## Pages
### `/` landing
One line ("Find the health myth. Get the receipts. Make the debunk."), buttons to `/desk` and `/calendar`.

### `/desk` radar
- Cards or rows per myth: title, HarmChip (harmful red, false orange, unproven amber), topic views and video count, claim views if present, TrendBadge with `trend_pct`, the top quote (only if `nameable`), "Open".
- `match_note` in small text under each card. DataBadge in the header.
- Done when: renders the 3 fixture myths, then the live radar at checkpoint 1; fires Radar Viewed.

### `/desk/myth/[id]`
- Header: claim, harm tier, harm reason, numbers with the window ("Oct 7 to Nov 6, 2026").
- QuoteCard per video: thumbnail, "From a video posted by @handle", exact quote in quotation marks, timestamp as m:ss from `quote_start_s`, views, link out. If `nameable` is false: no handle, link or thumbnail.
- Stance mix bar from `stance_counts` with the sample size. Counter voices list. Clinician share callout.
- Button "Make the debunk" to the studio. Fires Myth Opened.

### `/desk/myth/[id]/studio`
1. Format picker (stitch, duet, standalone, no camera). Changing it calls `/brief` again (cached per format).
2. Brief panel: verdict, what's true, what's false. Sources with excerpts and links (Source Clicked). Claims with SupportBadge.
3. Hooks: 5 options, click to use as line 1 (Hook Selected).
4. Script editor: one input per line. On blur or after 600 ms idle, send changed lines to `/check`. Show the badge per line; red shows the note ("No source says this"). Fire Claim Flagged on weak or unsupported.
5. Checklist (all must be true): every claim has a source (auto: every line with a claim is supported), quotes are exact (manual), targets the claim not the person (manual), no minors or illness stories (manual), video QA passed (auto after step 7).
6. Approve: enabled when the first four are checked. Fires Brief Approved. Shows "Copy script" for recording.
7. Attach video: file input for the MP4 from Compound (Video Exported), then `POST /qa` as multipart. Show the QA report: issues by timestamp, pass or fail (Video QA Completed).
8. Publish: `POST /publish`, then show the receipts link and a QR (Debunk Published).
- Demo moment: editing line 3 to "Lymphatic drainage burns fat." must turn red, and undoing must turn it green.

### `/r/[id]` receipts (public, mobile first)
- Client component that fetches `/published/${id}.json` (static).
- Quote card(s) from `quoted`, verdict, what's true, what's false, sources with excerpts (Source Clicked), the video if `video_url` is set.
- "Certified by clinician" badge only if `certified_by_clinician` is true.
- Vote: "Did this change your mind?" with Yes, No, I already knew. One vote per device (store a flag in localStorage inside try/catch). Fire Mind Changed Vote, then show "Thanks".
- Read `utm_source` and `utm_medium` from the URL for Receipts Viewed.
- QR (desk only, or a `?qr=1` view): `<QRCodeSVG value={url} size={256} />` from `qrcode.react`.

### `/calendar` (public)
This week and watchlist sections. Badge per item: "Oriane trend" or "Curated". "Use this script" when `script_available` (Script Reused). Fires Calendar Viewed. Reads `/calendar.json` on Vercel, `/calendar` on the brain locally.

### `/desk/impact/[id]`
Two bars: myth reach vs response reach, the ratio, hours from spike to first response, clinician baseline, our debunk's votes. Any missing field shows "pending", never 0.

## Copy and style
Sentence case, calm, no hype words, no em dashes. Numbers come only from the API or fixtures, with their window. Mobile first for `/r` and `/calendar`.

## Env (`apps/web/.env.local`)
`NEXT_PUBLIC_BRAIN_URL`, `NEXT_PUBLIC_USE_MOCKS`, `NEXT_PUBLIC_AMPLITUDE_API_KEY`, `NEXT_PUBLIC_SITE_URL`. Only public values here: no Oriane, GMI or Jev keys in the web app.

## Vercel
1. Import the GitHub repo, Root Directory `apps/web`, framework Next.js.
2. Env vars: `NEXT_PUBLIC_USE_MOCKS=1`, `NEXT_PUBLIC_AMPLITUDE_API_KEY`, `NEXT_PUBLIC_SITE_URL=https://<project>.vercel.app`.
3. Deploy a skeleton by 3:45. Final deploy after `data/published/lymphatic-detox.json` lands (4:45).
4. Check `/r/lymphatic-detox` on a phone before 5:00.

## Test before each checkpoint
- `NEXT_PUBLIC_USE_MOCKS=1`: every page renders with the fixture badge.
- Brain on: badges disappear, numbers match `curl localhost:8000/radar`.
- Kill the brain mid-demo: pages still render.
- Amplitude User Lookup shows the events you fired.
