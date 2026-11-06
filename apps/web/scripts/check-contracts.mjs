// scripts/check-contracts.mjs: runtime check of brain responses against contracts/types.ts.
//   node scripts/check-contracts.mjs          validate src/contracts/fixtures/*.json (offline)
//   node scripts/check-contracts.mjs --live   call the brain (GET endpoints, POST /check, error shape)
//   node scripts/check-contracts.mjs --all    --live plus POST /brief (a cold run costs GMI credits)
// Never calls /publish or /qa. Exits 1 on any failure.
// shortcut: hand-written mirror of contracts/types.ts, update it if the contract gains required fields.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- tiny schema DSL ----------
const opt = (s) => ({ $opt: s });
const arr = (s) => ({ $arr: s });
const oneOf = (...v) => ({ $enum: v });
const S = "string", N = "number", B = "boolean", O = "object";

function check(v, spec, path, out) {
  if (spec && spec.$opt !== undefined) return v === undefined || v === null ? undefined : check(v, spec.$opt, path, out);
  if (v === undefined) return out.push(`${path}: missing`);
  if (typeof spec === "string") {
    const t = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
    if (t !== spec) out.push(`${path}: expected ${spec}, got ${t}`);
    return;
  }
  if (spec.$enum) return spec.$enum.includes(v) ? undefined : out.push(`${path}: ${JSON.stringify(v)} not in ${spec.$enum.join("|")}`);
  if (spec.$arr) {
    if (!Array.isArray(v)) return out.push(`${path}: expected array`);
    return v.forEach((x, i) => check(x, spec.$arr, `${path}[${i}]`, out));
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return out.push(`${path}: expected object`);
  for (const [k, s] of Object.entries(spec)) check(v[k], s, path ? `${path}.${k}` : k, out);
}

// ---------- contracts ----------
const HarmTier = oneOf("harmful", "false", "unproven");
const Trend = oneOf("rising", "steady", "cooling", "unknown");
const Platform = oneOf("tiktok", "instagram", "youtube");
const Stance = oneOf("promotes", "debunks", "neutral", "ad", "unrelated");
const QuoteSource = oneOf("transcript", "caption", "on_screen_text");
const Format = oneOf("stitch", "duet", "standalone", "no_camera");
const HookStyle = oneOf("question", "myth_quote", "stat", "pov", "stitch_reaction");
const SupportStatus = oneOf("supported", "weak", "unsupported");
const Engine = oneOf("jev", "gmi_judge", "cached");
const DataSource = oneOf("oriane_live", "oriane_snapshot");
const DateWindow = { from: S, to: S };
const Reach = { videos: N, views: N };

const VideoRef = {
  oriane_id: S, platform: Platform, url: S, handle: S, display_name: opt(S), followers: opt(N), views: N,
  shares: opt(N), interactions: opt(N), published_at: S, thumbnail_url: opt(S), quote: S, quote_source: QuoteSource,
  quote_start_s: opt(N), stance: Stance, stance_confidence: opt(N), nameable: B,
};
const MythSummary = {
  id: S, title: S, topic: S, claim: S, harm_tier: HarmTier, harm_reason: S, trend: Trend, trend_pct: opt(N),
  window: DateWindow, topic_video_count: N, topic_views: N, prev_window: opt(DateWindow),
  prev_topic_video_count: opt(N), prev_topic_views: opt(N), claim_video_count: opt(N), claim_views: opt(N),
  claim_interactions: opt(N), top_video: opt(VideoRef), match_note: S, data_source: DataSource, snapshot_at: S,
};
const Radar = { generated_at: S, window: DateWindow, myths: arr(MythSummary) };
const MythDetail = {
  ...MythSummary, videos: arr(VideoRef), counter_voices: arr(VideoRef), stance_counts: O, stance_sample_size: opt(N),
  clinician_share: opt({ videos: N, views: N, video_pct: N, view_pct: N, note: S }),
};
const Source = {
  id: S, title: S, publisher: S, url: S,
  kind: oneOf("review", "trial", "guideline", "health_system", "journalism", "other"),
  published: opt(S), pmid: opt(S), excerpts: arr(S), fetched_at: S,
};
const Evidence = { source_id: S, excerpt: S };
const ClaimCheck = { id: S, text: S, evidence: arr(Evidence), support: N, status: SupportStatus, engine: Engine };
const Script = {
  format: Format, duration_s: N, caption: S, cta: S,
  lines: arr({ id: S, text: S, claim_id: opt(S), on_screen: opt(S), source_id: opt(S) }),
};
const Brief = {
  myth_id: S, verdict: S, what_is_true: arr(S), what_is_false: arr(S), sources: arr(Source), claims: arr(ClaimCheck),
  hooks: arr({ id: S, style: HookStyle, text: S }), script: Script, models: { drafter: S, judge: S }, generated_at: S,
};
const CheckResponse = {
  results: arr({
    line_id: S, has_claim: B, support: opt(N), status: opt(SupportStatus), evidence: opt(arr(Evidence)),
    engine: Engine, note: opt(S),
  }),
};
const QAReport = {
  myth_id: S, frames_checked: N, texts_found: N, pass: B, models: { vision: S, judge: S },
  ran_in: oneOf("local", "gmi_sandbox", "cached"), duration_ms: opt(N),
  issues: arr({
    t_s: N, found_text: S, expected_line_id: opt(S), support: opt(N),
    problem: oneOf("text_not_in_script", "unsupported_claim", "missing_source", "typo"),
  }),
};
const Approval = {
  every_claim_has_source: B, quotes_are_exact: B, targets_claim_not_person: B, no_minors_or_illness_stories: B,
  video_qa_passed: B, approved_by: S, approved_at: S,
};
const Clinician = { name: S, npi: opt(S), verified: B };
const PublishedDebunk = {
  id: S, myth: MythSummary, quoted: arr(VideoRef), verdict: S, what_is_true: arr(S), what_is_false: arr(S),
  sources: arr(Source), claims: arr(ClaimCheck), script: Script, video_url: opt(S), approval: Approval,
  certified_by_clinician: B, clinician: opt(Clinician), published_at: S,
};
const Impact = {
  myth_id: S, window: DateWindow, myth_reach: Reach, response_reach: opt(Reach), response_ratio: opt(N),
  baseline_clinician: opt({ ...Reach, note: S }), hours_spike_to_first_response: opt(N), note: S,
  our_debunk: opt({ views: opt(N), votes_yes: opt(N), votes_total: opt(N), source: oneOf("amplitude", "compound", "manual") }),
};
const CalendarItem = {
  topic: S, myth_id: opt(S), harm_tier: opt(HarmTier), trend: opt(Trend), window: S,
  basis: oneOf("oriane_trend", "curated"), why: S, video_count: opt(N), views: opt(N), script_available: B,
};
const Calendar = { week_of: S, this_week: arr(CalendarItem), watchlist: arr(CalendarItem) };
const Health = { ok: B, oriane: B, gmi: B, jev: B, version: S };
const ApiError = { error: { code: S, message: S } };

export const schemas = { Radar, MythDetail, Brief, CheckResponse, QAReport, PublishedDebunk, Impact, Calendar, Health, ApiError };

export function validate(value, schema) {
  const out = [];
  check(value, schema, "", out);
  return out;
}

// ---------- runner ----------
let failed = 0;
function report(name, status, ms, problems) {
  if (problems.length) failed++;
  const res = problems.length ? `FAIL ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ""}` : "OK";
  console.log(`${name.padEnd(40)} ${String(status).padEnd(5)} ${String(ms).padStart(6)}ms  ${res}`);
}

const fixtureType = (f) =>
  f === "radar.json" ? Radar : f.startsWith("myth-") ? MythDetail : f.startsWith("brief-") ? Brief
  : f === "check.json" ? CheckResponse : f === "qa.json" ? QAReport : f === "impact.json" ? Impact
  : f === "calendar.json" ? Calendar : f.startsWith("published-") ? PublishedDebunk : f === "health.json" ? Health : null;

function offline() {
  const dir = join(app, "src/contracts/fixtures");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const t0 = Date.now();
    const schema = fixtureType(f);
    if (!schema) { report(`fixture ${f}`, "-", 0, ["no response type mapped for this file"]); continue; }
    let problems;
    try { problems = validate(JSON.parse(readFileSync(join(dir, f), "utf8")), schema); }
    catch (e) { problems = [`bad JSON: ${e.message}`]; }
    report(`fixture ${f}`, "-", Date.now() - t0, problems);
  }
}

function brainUrl() {
  if (process.env.NEXT_PUBLIC_BRAIN_URL) return process.env.NEXT_PUBLIC_BRAIN_URL;
  const env = join(app, ".env.local");
  const m = existsSync(env) && readFileSync(env, "utf8").match(/^NEXT_PUBLIC_BRAIN_URL=(.*)$/m);
  return (m && m[1].trim().replace(/^["']|["']$/g, "")) || "http://localhost:8000";
}

async function hit(base, name, path, schema, { body, ms = 10000, expectError = false } = {}) {
  const t0 = Date.now();
  let status = "-", problems;
  try {
    const res = await fetch(base + path, {
      method: body ? "POST" : "GET", signal: AbortSignal.timeout(ms),
      ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    status = res.status;
    const json = await res.json().catch(() => undefined);
    if (json === undefined) problems = ["body is not JSON"];
    else if (expectError) problems = res.ok ? [`expected a non-2xx status`, ...validate(json, ApiError)] : validate(json, ApiError);
    else problems = res.ok ? validate(json, schema) : [`HTTP ${status}: ${JSON.stringify(json).slice(0, 160)}`];
  } catch (e) {
    problems = [e.name === "TimeoutError" ? `timeout after ${ms}ms` : `request failed: ${e.cause?.code ?? e.cause?.message ?? e.message}`];
  }
  report(name, status, Date.now() - t0, problems);
}

async function live(all) {
  const base = brainUrl().replace(/\/$/, "");
  console.log(`brain: ${base}`);
  const req = JSON.parse(readFileSync(join(app, "src/contracts/fixtures/check.json"), "utf8"))._fixture?.request;
  await hit(base, "GET /health", "/health", Health);
  await hit(base, "GET /radar", "/radar", Radar);
  for (const id of ["lymphatic-detox", "garlic-tumor", "mouth-taping"]) await hit(base, `GET /myths/${id}`, `/myths/${id}`, MythDetail);
  await hit(base, "GET /impact/lymphatic-detox", "/impact/lymphatic-detox", Impact);
  await hit(base, "GET /calendar", "/calendar", Calendar);
  await hit(base, "GET /published/lymphatic-detox", "/published/lymphatic-detox", PublishedDebunk);
  if (req) await hit(base, "POST /check", "/check", CheckResponse, { body: req });
  else report("POST /check", "-", 0, ["check.json has no _fixture.request"]);
  await hit(base, "GET /myths/no-such-myth (error)", "/myths/no-such-myth", null, { expectError: true });
  if (all) {
    console.warn("warning: POST /brief is cached by the brain, but a cold run costs GMI credits and can take about 45 s");
    await hit(base, "POST /brief lymphatic-detox stitch", "/brief", Brief, { body: { myth_id: "lymphatic-detox", format: "stitch" }, ms: 60000 });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    // self-check of the validator itself
    const ok = validate({ ok: true, oriane: false, gmi: true, jev: true, version: "1" }, Health).length === 0;
    const bad = validate({ ok: "yes", oriane: false, gmi: true, version: 1 }, Health);
    const en = validate({ error: { code: "x", message: "y" } }, ApiError).length === 0;
    const enumBad = validate({ results: [{ line_id: "l1", has_claim: true, status: "maybe", engine: "jev" }] }, CheckResponse);
    if (!ok || bad.length !== 3 || !en || enumBad.length !== 1) { console.error("self-test failed", { bad, enumBad }); process.exit(1); }
    console.log("self-test OK");
  } else if (args.includes("--live") || args.includes("--all")) await live(args.includes("--all"));
  else offline();
  if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
}
