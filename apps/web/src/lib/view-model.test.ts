import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sortMyths, windowLabel, pendingOr, isPlaceholder, openedFrom } from "./view-model.ts";

test("sortMyths: tier order, then claim views descending, missing views last", () => {
  const ids = sortMyths([
    { id: "a", harm_tier: "unproven", claim_views: 900 },
    { id: "b", harm_tier: "false", claim_views: 10 },
    { id: "c", harm_tier: "harmful" },
    { id: "d", harm_tier: "harmful", claim_views: 5 },
  ] as never[]).map((m: { id: string }) => m.id);
  assert.deepEqual(ids, ["d", "c", "b", "a"]);
});

test("windowLabel", () => {
  assert.equal(windowLabel({ from: "2026-10-07", to: "2026-11-06" }), "Oct 7 to Nov 6");
});

test("pendingOr", () => {
  assert.equal(pendingOr(undefined, (n: number) => n.toFixed(2)), "Pending");
  assert.equal(pendingOr(null), "Pending");
  assert.equal(pendingOr(0.5, (n) => n.toFixed(2)), "0.50");
  assert.equal(pendingOr(0), "0");
});

test("isPlaceholder reads _fixture.placeholders", () => {
  const fx = JSON.parse(readFileSync(join(import.meta.dirname, "../contracts/fixtures/published-lymphatic-detox.json"), "utf8"));
  assert.equal(isPlaceholder(fx, "video_url"), true);
  assert.equal(isPlaceholder(fx, "claims[3].support"), true);
  assert.equal(isPlaceholder(fx, "approval.by"), true);
  assert.equal(isPlaceholder(fx, "verdict"), false);
  assert.equal(isPlaceholder({}, "verdict"), false);
});

test("openedFrom", () => {
  assert.equal(openedFrom("?from=radar"), "radar");
  assert.equal(openedFrom("?from=calendar"), "calendar");
  assert.equal(openedFrom("?from=evil"), "direct");
  assert.equal(openedFrom(""), "direct");
});
