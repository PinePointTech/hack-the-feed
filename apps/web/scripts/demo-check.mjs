// scripts/demo-check.mjs: one command before rehearsal and again before walking up.
// Checks the env, the brain (required with --live), the public site judges open, the QR, published data and the video.
// Usage from apps/web: npm run demo:check            (desk may run on fixtures)
//                      npm run demo:check -- --live  (desk must use the real brain)
import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const live = process.argv.includes("--live");
const envFile = join(app, ".env.local");
const env = Object.fromEntries(
  (existsSync(envFile) ? readFileSync(envFile, "utf8") : "")
    .split("\n")
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const SITE = (env.NEXT_PUBLIC_SITE_URL || "https://mybuster.vercel.app").replace(/\/$/, "");
const BRAIN = (env.NEXT_PUBLIC_BRAIN_URL || "http://localhost:8000").replace(/\/$/, "");
const LOCAL = "http://localhost:3000";

const results = [];
const ok = (name, detail) => results.push(["ok", name, detail]);
const warn = (name, detail) => results.push(["warn", name, detail]);
const fail = (name, detail) => results.push(["FAIL", name, detail]);

async function hit(url, { method = "GET", ms = 15000 } = {}) {
  try {
    const res = await fetch(url, { method, signal: AbortSignal.timeout(ms), redirect: "follow" });
    const body = method === "GET" && res.ok ? await res.text() : "";
    return { status: res.status, type: res.headers.get("content-type") || "", length: Number(res.headers.get("content-length") || 0), body };
  } catch (e) {
    return { status: 0, type: "", length: 0, body: "", error: e.cause?.code || e.name };
  }
}

// 1. Env on this laptop
if (!existsSync(envFile)) fail("Env file", "apps/web/.env.local is missing: copy the web block of the root .env.example");
if (env.NEXT_PUBLIC_AMPLITUDE_API_KEY) ok("Amplitude key", "set");
else fail("Amplitude key", "NEXT_PUBLIC_AMPLITUDE_API_KEY is empty, so no events reach Amplitude");
if (live && env.NEXT_PUBLIC_USE_MOCKS !== "0") fail("Mock switch", "set NEXT_PUBLIC_USE_MOCKS=0 in apps/web/.env.local for the live desk");
else ok("Mock switch", `NEXT_PUBLIC_USE_MOCKS=${env.NEXT_PUBLIC_USE_MOCKS ?? "(unset)"}`);
if (SITE.startsWith("https://")) ok("Site URL", `${SITE} (QR codes point here)`);
else warn("Site URL", `${SITE}: QR codes on the receipts page should point at the public https site`);

// 2. Brain
const brainProblem = live ? fail : warn;
const health = await hit(`${BRAIN}/health`, { ms: 5000 });
if (health.status !== 200) {
  brainProblem("Brain", `${BRAIN}/health -> ${health.status || health.error}: the desk falls back to fixtures`);
} else {
  let h = {};
  try { h = JSON.parse(health.body); } catch {}
  ok("Brain", `${BRAIN} is up (oriane ${h.oriane}, gmi ${h.gmi}, jev ${h.jev})`);
  const run = spawnSync(process.execPath, [join(app, "scripts/check-contracts.mjs"), "--live"], { cwd: app, encoding: "utf8", timeout: 120000 });
  const failed = (run.stdout.match(/^.*FAIL.*$/gm) || []).map((l) => l.trim().split(/\s{2,}/)[0]);
  if (failed.length) brainProblem("Brain contract", `failing: ${failed.join(", ")} (details: node scripts/check-contracts.mjs --live)`);
  else ok("Brain contract", "every live endpoint matches contracts/types.ts");
}

// 3. Public site, what judges open from the QR
for (const [name, path, type] of [
  ["Live desk", "/desk", "text/html"],
  ["Receipts page", "/r/lymphatic-detox?utm_source=demo_qr&utm_medium=qr", "text/html"],
  ["Slide QR", "/qr/demo-receipts.svg", "image/svg+xml"],
]) {
  const r = await hit(SITE + path);
  if (r.status === 200 && r.type.includes(type)) ok(name, SITE + path);
  else fail(name, `${SITE + path} -> ${r.status || r.error}`);
}
const qr = await hit(`${SITE}/qr/demo-receipts.svg`);
if (qr.body && !qr.body.includes("<title>")) warn("Slide QR", "the SVG has no title; check it is the generated QR");
const published = await hit(`${SITE}/published/lymphatic-detox.json`, { method: "HEAD" });
if (published.status === 200) ok("Published debunk", "real /published/lymphatic-detox.json is live");
else warn("Published debunk", "not live yet, so receipts show the fixture with its badge. After Kris commits data/published: npm run predev, commit public/published, push");
const calendar = await hit(`${SITE}/calendar.json`, { method: "HEAD" });
if (calendar.status === 200) ok("Calendar data", "real /calendar.json is live");
else warn("Calendar data", "not live yet, so the calendar shows the fixture with its badge");
const video = await hit(`${SITE}/video/lymphatic-detox.mp4`, { method: "HEAD" });
if (video.status === 200) ok("Debunk video", `live (${(video.length / 1e6).toFixed(1)} MB)`);
else warn("Debunk video", "not live yet: export from Compound to apps/web/public/video/lymphatic-detox.mp4, commit, push");

// 4. Files on this laptop
const localVideo = join(app, "public/video/lymphatic-detox.mp4");
if (existsSync(localVideo)) {
  const mb = statSync(localVideo).size / 1e6;
  if (mb > 90) warn("Video file", `${mb.toFixed(1)} MB is close to GitHub's 100 MB limit; export at a lower bitrate`);
  else ok("Video file", `${mb.toFixed(1)} MB at public/video/lymphatic-detox.mp4`);
} else warn("Video file", "public/video/lymphatic-detox.mp4 is not on this laptop yet");

// 5. Local desk (the one the demo drives)
const desk = await hit(`${LOCAL}/desk`, { ms: 60000 });
// FixtureBadge renders class "databadge" with this title (older builds said "fixture data").
const onFixtures = /databadge|Shown from saved example data|fixture data/.test(desk.body);
if (desk.status !== 200) warn("Local desk", `${LOCAL}/desk -> ${desk.status || desk.error}: start it with npm run demo (or npm run dev)`);
else if (live && onFixtures) fail("Local desk", "running, but showing fixture data: the brain is not answering /radar");
else ok("Local desk", `${LOCAL}/desk is up (${onFixtures ? "fixture data" : "live data"})`);

const width = Math.max(...results.map((r) => r[1].length));
for (const [level, name, detail] of results) console.log(`${level.padEnd(4)}  ${name.padEnd(width)}  ${detail}`);
const fails = results.filter((r) => r[0] === "FAIL").length;
const warns = results.filter((r) => r[0] === "warn").length;
console.log(fails ? `\nNOT READY: ${fails} failing, ${warns} warnings` : `\nREADY${warns ? ` (${warns} warnings)` : ""}`);
process.exit(fails ? 1 : 0);
