import { test } from "node:test";
import assert from "node:assert/strict";
import { lessons } from "./tactics.ts";
import type { FeedLabel, FeedPost } from "./feed.ts";

// Built inside the test only. Never rendered, never shipped as data.
const post = (id: string, views: number, quote: string, over: Partial<FeedLabel> = {}): FeedPost => ({
  oriane_id: id, platform: "tiktok", url: null, handle: null, display_name: null, thumbnail_url: null, views,
  published_at: null, fetched_at: "2026-11-09T00:00:00Z", snippet: "matched", snippet_source: "caption", matched_query: "q",
  label: { health_claim: true, myth_id: null, stance: "promotes", confidence: 0.9, model: "m", flagged: true, commercial: false,
    basis: "transcript", evidence: { quote, source: "transcript" }, ...over },
});

test("tactics count only flagged posts and show a most viewed short example, in its own words", () => {
  const { flagged, lessons: found } = lessons([
    post("a", 10, "This detox tea flushes toxins overnight."),
    post("b", 500, "Doctors hate this parasite cleanse.", { commercial: true }),
    post("long", 800, `A cleanse story ${"that goes on ".repeat(30)}`),
    post("c", 900, "A detox claim that is not flagged.", { flagged: false }),
    post("d", 999, "Debunks a detox.", { stance: "debunks", flagged: false }),
  ]);
  assert.equal(flagged, 3);
  const by = Object.fromEntries(found.map((l) => [l.tactic.key, [l.count, l.example?.oriane_id ?? null, l.quote]]));
  assert.deepEqual(by.selling, [1, "b", "Doctors hate this parasite cleanse."]);
  assert.deepEqual(by.authority, [1, "b", "Doctors hate this parasite cleanse."]);
  assert.deepEqual(by.fast, [1, "a", "This detox tea flushes toxins overnight."]);
  // The long post counts, but a short quote makes the better example.
  assert.deepEqual(by.toxins, [3, "b", "Doctors hate this parasite cleanse."]);
});

test("no flagged posts means no examples", () => {
  const { flagged, lessons: found } = lessons([]);
  assert.equal(flagged, 0);
  assert.ok(found.every((l) => l.count === 0 && l.example === null));
});
