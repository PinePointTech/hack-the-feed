// Pure Amplitude audience logic for the creator impact page. No "@/..." imports so node --test can run this file directly.
// Event segmentation, Dashboard REST API: https://amplitude.com/docs/apis/analytics/dashboard-rest
//   GET https://amplitude.com/api/2/events/segmentation (US data center), HTTP Basic auth: API key as user, secret key as password.
//   e = event JSON { event_type, filters: [{ subprop_type, subprop_key, subprop_op, subprop_value: [] }], group_by: [{ type, value }] }
//   m = totals (event counts), i = -3600000 (hourly, up to 7 days), start and end = YYYYMMDD.
//   Response: { data: { series: number[][] (per group, per xValue), seriesLabels, seriesCollapsed, xValues } }.
//   Limit: 5 concurrent requests per project, 429 when exceeded.

export const SEGMENTATION_URL = "https://amplitude.com/api/2/events/segmentation";

export type Segmentation = {
  data?: { series?: unknown[][]; seriesLabels?: unknown[]; seriesCollapsed?: unknown; xValues?: unknown[] };
};

export type AudienceStats = {
  receipts_views: number;
  receipts_views_demo_qr: number;
  votes: { yes: number; no: number; already_knew: number; total: number };
  source_clicks: number;
  since: string;
};

export type AudienceKey = "views" | "votes" | "clicks";

const EVENTS: Record<AudienceKey, { event_type: string; group_by?: string }> = {
  views: { event_type: "Receipts Viewed", group_by: "utm_source" },
  votes: { event_type: "Mind Changed Vote", group_by: "answer" },
  clicks: { event_type: "Source Clicked" },
};

const DAY = 86_400_000;
const HOUR = 3_600_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");

/** Query strings for the three event segmentation calls, each filtered to one myth_id. */
export function audienceQueries(mythId: string, since: Date, now: Date): Record<AudienceKey, string> {
  // Pad a day each side so any project time zone covers since and its local today; sumSince trims the extra hours.
  const range = { start: ymd(new Date(since.getTime() - DAY)), end: ymd(new Date(now.getTime() + DAY)) };
  const out = {} as Record<AudienceKey, string>;
  for (const k of Object.keys(EVENTS) as AudienceKey[]) {
    const { event_type, group_by } = EVENTS[k];
    const e = {
      event_type,
      filters: [{ subprop_type: "event", subprop_key: "myth_id", subprop_op: "is", subprop_value: [mythId] }],
      ...(group_by && { group_by: [{ type: "event", value: group_by }] }),
    };
    out[k] = new URLSearchParams({ e: JSON.stringify(e), m: "totals", i: "-3600000", ...range }).toString();
  }
  return out;
}

// The docs show string labels; grouped responses are also seen as [eventIndex, value]. Take the group value either way.
const label = (l: unknown) => (Array.isArray(l) ? String(l[l.length - 1]) : typeof l === "string" ? l : "");

// xValues are wall clock in the project's time zone; read them as if UTC and compare against since in the same wall clock.
function bucketEnd(x: unknown): number {
  if (typeof x !== "string") return Infinity; // unreadable bucket: keep it rather than drop real data
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(x);
  const iso = dateOnly ? `${x}T00:00:00Z` : x.replace(" ", "T") + (/(Z|[+-]\d\d:?\d\d)$/i.test(x) ? "" : "Z");
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Infinity : t + (dateOnly ? DAY : HOUR);
}

/** Sums each group's buckets that end after since (the bucket holding since counts). tz is the Amplitude project's time zone. Returns label -> total. */
export function sumSince(res: Segmentation, since: Date, tz = "UTC"): Map<string, number> {
  const out = new Map<string, number>();
  const d = res?.data;
  if (!d || !Array.isArray(d.series)) return out;
  const sinceWall = wallClockAsUtc(tz, since);
  const keep = (d.xValues ?? []).map((x) => bucketEnd(x) > sinceWall);
  d.series.forEach((row, g) => {
    const sum = (Array.isArray(row) ? row : []).reduce<number>((a, v, k) => a + (keep[k] !== false ? Number(v) || 0 : 0), 0);
    const key = label(d.seriesLabels?.[g]);
    out.set(key, (out.get(key) ?? 0) + sum);
  });
  return out;
}

const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

/** Turns the three segmentation responses into AudienceStats counted from since. */
export function audienceStats(res: Record<AudienceKey, Segmentation>, since: Date, tz = "UTC"): AudienceStats {
  const views = sumSince(res.views, since, tz);
  const votes = sumSince(res.votes, since, tz);
  const yes = votes.get("yes") ?? 0, no = votes.get("no") ?? 0, already_knew = votes.get("already_knew") ?? 0;
  return {
    receipts_views: total(views),
    receipts_views_demo_qr: views.get("demo_qr") ?? 0,
    votes: { yes, no, already_knew, total: yes + no + already_knew },
    source_clicks: total(sumSince(res.clicks, since, tz)),
    since: since.toISOString(),
  };
}

function wallClockAsUtc(tz: string, at: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at).map((x) => [x.type, Number(x.value)]),
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** Midnight today in tz, as an instant. */
export function startOfDayIn(tz: string, now: Date): Date {
  const wall = new Date(wallClockAsUtc(tz, now));
  const midnight = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  const offset = wallClockAsUtc(tz, new Date(midnight)) - midnight;
  return new Date(midnight - offset);
}

/** AUDIENCE_SINCE when it is a valid date, otherwise the start of today in Los Angeles. */
export function resolveSince(raw: string | undefined, now: Date): Date {
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(t) ? startOfDayIn("America/Los_Angeles", now) : new Date(t);
}

export type AudienceResponse = { configured: boolean; myth_id: string; stats?: AudienceStats; error?: string; updated_at: string };
type Env = Record<string, string | undefined>;
export const AUDIENCE_ERROR = "Amplitude is not answering right now";

/** Server only. Runs the three queries in parallel (10 s timeout) and never puts the secret or an upstream body in the result or logs. */
export async function loadAudience(id: string, env: Env, now = new Date()): Promise<AudienceResponse> {
  const secret = env.AMPLITUDE_SECRET_KEY;
  const apiKey = env.AMPLITUDE_API_KEY || env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  const base = { myth_id: id, updated_at: now.toISOString() };
  if (!secret || !apiKey) return { configured: false, ...base };
  const since = resolveSince(env.AUDIENCE_SINCE, now);
  const q = audienceQueries(id, since, now);
  const auth = `Basic ${btoa(`${apiKey}:${secret}`)}`;
  try {
    const keys = Object.keys(q) as AudienceKey[];
    const res = await Promise.all(
      keys.map(async (k) => {
        const r = await fetch(`${SEGMENTATION_URL}?${q[k]}`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return [k, (await r.json()) as Segmentation] as const;
      }),
    );
    return { configured: true, ...base, stats: audienceStats(Object.fromEntries(res) as Record<AudienceKey, Segmentation>, since, env.AMPLITUDE_TIMEZONE || "UTC") };
  } catch (e) {
    const why = e instanceof Error && e.message.startsWith("HTTP ") ? e.message : e instanceof Error ? e.name : "unknown";
    console.warn(`[audience] ${id}: Amplitude query failed (${why})`);
    return { configured: true, ...base, error: AUDIENCE_ERROR };
  }
}
