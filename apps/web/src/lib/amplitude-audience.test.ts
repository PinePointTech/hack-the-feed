import { test } from "node:test";
import assert from "node:assert/strict";
import { audienceQueries, audienceStats, sumSince, startOfDayIn, resolveSince, loadAudience, AUDIENCE_ERROR, type Segmentation } from "./amplitude-audience.ts";

// The documented example response, copied from https://amplitude.com/docs/apis/analytics/dashboard-rest (Event segmentation, Response).
const DOC_EXAMPLE: Segmentation = {
  data: {
    series: [[273333], [190351]],
    seriesLabels: ["United States", "Germany"],
    seriesCollapsed: [[{ value: 273333 }], [{ value: 190351 }]],
    xValues: ["2014-10-01"],
  },
};

const seg = (labels: unknown[], series: number[][], xValues: string[]): Segmentation => ({ data: { series, seriesLabels: labels, xValues } });
const HOURS = ["2026-11-06T20:00:00", "2026-11-06T21:00:00", "2026-11-06T22:00:00"];
const SINCE = new Date("2026-11-06T21:00:00Z");

test("sumSince: documented example, daily bucket on or after since counts", () => {
  const m = sumSince(DOC_EXAMPLE, new Date("2014-10-01T00:00:00Z"));
  assert.equal(m.get("United States"), 273333);
  assert.equal(m.get("Germany"), 190351);
});

test("sumSince: daily bucket that ended before since is dropped", () => {
  assert.equal(sumSince(DOC_EXAMPLE, new Date("2014-10-02T00:00:00Z")).get("Germany"), 0);
});

test("sumSince: hourly buckets before since are excluded, the hour holding since is kept", () => {
  const m = sumSince(seg(["yes"], [[5, 2, 3]], HOURS), new Date("2026-11-06T21:30:00Z"));
  assert.equal(m.get("yes"), 5);
});

test("sumSince: xValues are wall clock in the project time zone", () => {
  const m = sumSince(seg(["yes"], [[4]], ["2026-11-06T17:00:00"]), new Date("2026-11-07T01:00:00Z"), "America/Los_Angeles");
  assert.equal(m.get("yes"), 4);
  assert.equal(sumSince(seg(["yes"], [[4]], ["2026-11-06T16:00:00"]), new Date("2026-11-07T01:00:00Z"), "America/Los_Angeles").get("yes"), 0);
});

test("sumSince: array labels use the group value", () => {
  const m = sumSince(seg([[0, "yes"], [0, "no"]], [[1, 1, 1], [0, 0, 4]], HOURS), SINCE);
  assert.equal(m.get("yes"), 2);
  assert.equal(m.get("no"), 4);
});

test("sumSince: empty and malformed responses give an empty map", () => {
  assert.equal(sumSince({}, SINCE).size, 0);
  assert.equal(sumSince({ data: { series: [], seriesLabels: [], xValues: [] } }, SINCE).size, 0);
  assert.equal(sumSince(null as unknown as Segmentation, SINCE).size, 0);
});

test("audienceStats: totals, vote split, demo QR share and since cutoff", () => {
  const s = audienceStats(
    {
      views: seg(["demo_qr", "(none)"], [[9, 4, 1], [9, 2, 0]], HOURS),
      votes: seg(["yes", "no", "already_knew"], [[7, 3, 1], [0, 1, 1], [0, 0, 2]], HOURS),
      clicks: seg([0], [[3, 1, 1]], HOURS),
    },
    SINCE,
  );
  assert.deepEqual(s, {
    receipts_views: 7,
    receipts_views_demo_qr: 5,
    votes: { yes: 4, no: 2, already_knew: 2, total: 8 },
    source_clicks: 2,
    since: "2026-11-06T21:00:00.000Z",
  });
});

test("audienceStats: missing groups and empty results are zero, not undefined", () => {
  const s = audienceStats({ views: seg(["(none)"], [[0, 2, 0]], HOURS), votes: seg(["no"], [[0, 1, 0]], HOURS), clicks: {} }, SINCE);
  assert.deepEqual(s.votes, { yes: 0, no: 1, already_knew: 0, total: 1 });
  assert.equal(s.receipts_views, 2);
  assert.equal(s.receipts_views_demo_qr, 0);
  assert.equal(s.source_clicks, 0);
});

test("audienceStats: unknown vote answers do not count toward the total", () => {
  const s = audienceStats({ views: {}, votes: seg(["yes", "maybe"], [[0, 1, 0], [0, 9, 0]], HOURS), clicks: {} }, SINCE);
  assert.deepEqual(s.votes, { yes: 1, no: 0, already_knew: 0, total: 1 });
});

test("audienceQueries: hourly totals filtered to one myth, grouped as needed", () => {
  const q = audienceQueries("lymphatic-detox", SINCE, new Date("2026-11-07T01:00:00Z"));
  for (const k of ["views", "votes", "clicks"] as const) {
    const p = new URLSearchParams(q[k]);
    assert.equal(p.get("m"), "totals");
    assert.equal(p.get("i"), "-3600000");
    assert.equal(p.get("start"), "20261105");
    assert.equal(p.get("end"), "20261108");
    const e = JSON.parse(p.get("e")!);
    assert.deepEqual(e.filters, [{ subprop_type: "event", subprop_key: "myth_id", subprop_op: "is", subprop_value: ["lymphatic-detox"] }]);
  }
  assert.equal(JSON.parse(new URLSearchParams(q.views).get("e")!).event_type, "Receipts Viewed");
  assert.deepEqual(JSON.parse(new URLSearchParams(q.views).get("e")!).group_by, [{ type: "event", value: "utm_source" }]);
  assert.equal(JSON.parse(new URLSearchParams(q.votes).get("e")!).event_type, "Mind Changed Vote");
  assert.deepEqual(JSON.parse(new URLSearchParams(q.votes).get("e")!).group_by, [{ type: "event", value: "answer" }]);
  assert.equal(JSON.parse(new URLSearchParams(q.clicks).get("e")!).event_type, "Source Clicked");
  assert.equal(JSON.parse(new URLSearchParams(q.clicks).get("e")!).group_by, undefined);
});

test("startOfDayIn: Los Angeles midnight in PST and PDT", () => {
  assert.equal(startOfDayIn("America/Los_Angeles", new Date("2026-11-07T01:00:00Z")).toISOString(), "2026-11-06T08:00:00.000Z");
  assert.equal(startOfDayIn("America/Los_Angeles", new Date("2026-07-01T12:00:00Z")).toISOString(), "2026-07-01T07:00:00.000Z");
});

test("resolveSince: valid ISO wins, otherwise start of today in LA", () => {
  const now = new Date("2026-11-07T01:00:00Z");
  assert.equal(resolveSince("2026-11-06T17:00:00-08:00", now).toISOString(), "2026-11-07T01:00:00.000Z");
  assert.equal(resolveSince(undefined, now).toISOString(), "2026-11-06T08:00:00.000Z");
  assert.equal(resolveSince("not a date", now).toISOString(), "2026-11-06T08:00:00.000Z");
});

test("loadAudience: no secret means not configured, and no request is made", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("should not fetch"); }) as typeof fetch;
  try {
    const r = await loadAudience("lymphatic-detox", { NEXT_PUBLIC_AMPLITUDE_API_KEY: "k" });
    assert.equal(r.configured, false);
    assert.equal(r.stats, undefined);
  } finally { globalThis.fetch = real; }
});

test("loadAudience: a 401 becomes the generic error without the secret or the upstream body", async () => {
  const real = globalThis.fetch;
  const warn = console.warn;
  const logged: string[] = [];
  console.warn = (m: string) => { logged.push(m); };
  globalThis.fetch = (async () => new Response("invalid secret s3cr3t-value", { status: 401 })) as typeof fetch;
  try {
    const r = await loadAudience("lymphatic-detox", { AMPLITUDE_API_KEY: "k", AMPLITUDE_SECRET_KEY: "s3cr3t-value" });
    assert.equal(r.configured, true);
    assert.equal(r.error, AUDIENCE_ERROR);
    assert.equal(r.stats, undefined);
    assert.ok(!JSON.stringify(r).includes("s3cr3t"));
    assert.ok(!logged.join(" ").includes("s3cr3t"));
    assert.match(logged.join(" "), /HTTP 401/);
  } finally { globalThis.fetch = real; console.warn = warn; }
});

test("loadAudience: success sends Basic auth to the US segmentation endpoint and returns stats", async () => {
  const real = globalThis.fetch;
  const urls: string[] = [];
  let auth = "";
  globalThis.fetch = (async (u: string, init: RequestInit) => {
    urls.push(u);
    auth = (init.headers as Record<string, string>).Authorization;
    return Response.json({ data: { series: [[2]], seriesLabels: ["yes"], xValues: ["2026-11-06T21:00:00"] } });
  }) as typeof fetch;
  try {
    const r = await loadAudience("lymphatic-detox", { NEXT_PUBLIC_AMPLITUDE_API_KEY: "k", AMPLITUDE_SECRET_KEY: "s" }, new Date("2026-11-06T22:00:00Z"));
    assert.equal(urls.length, 3);
    assert.ok(urls.every((u) => u.startsWith("https://amplitude.com/api/2/events/segmentation?")));
    assert.equal(auth, `Basic ${btoa("k:s")}`);
    assert.deepEqual(r.stats?.votes, { yes: 2, no: 0, already_knew: 0, total: 2 });
  } finally { globalThis.fetch = real; }
});
