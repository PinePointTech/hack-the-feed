import { test } from "node:test";
import assert from "node:assert/strict";
import { canNameCreator, dataThroughLine, mergeFeed, mythName, type FeedPost } from "./feed.ts";

// Built inside the test only to exercise the merge. Never rendered, never shipped as data.
const post = (id: string, over: Partial<FeedPost> = {}): FeedPost => ({
  oriane_id: id, platform: "tiktok", url: null, handle: null, display_name: null, thumbnail_url: null,
  views: null, published_at: null, fetched_at: "2026-11-08T19:45:00Z", snippet: "s", snippet_source: null,
  matched_query: "q", label: null, ...over,
});

test("new posts are returned as fresh, newest first, and not merged into the screen", () => {
  const { posts, fresh } = mergeFeed([post("a")], [post("c"), post("b"), post("a")]);
  assert.deepEqual(posts.map((p) => p.oriane_id), ["a"]);
  assert.deepEqual(fresh.map((p) => p.oriane_id), ["c", "b"]);
});

test("a post already on screen is never fresh and keeps its place", () => {
  const { posts, fresh } = mergeFeed([post("b"), post("a")], [post("a"), post("b")]);
  assert.deepEqual(posts.map((p) => p.oriane_id), ["b", "a"]);
  assert.equal(fresh.length, 0);
});

test("a label that arrives later replaces the copy on screen", () => {
  const label = { health_claim: true, myth_id: "mouth-taping", stance: "promotes" as const, confidence: 0.9, model: "m" };
  const { posts } = mergeFeed([post("a")], [post("a", { label })]);
  assert.equal(posts[0].label?.myth_id, "mouth-taping");
});

test("a label can say a post that pushes a claim is also sold, and an old label has no commercial field", () => {
  const sold = { health_claim: true, myth_id: null, stance: "promotes" as const, confidence: 0.9, model: "m", commercial: true };
  const old = { ...sold, commercial: undefined };
  const { posts } = mergeFeed([post("a", { label: old })], [post("a", { label: sold })]);
  assert.equal(posts[0].label?.commercial, true);
  assert.equal(posts[0].label?.stance, "promotes");
});

test("a post that dropped out of the latest page stays on screen", () => {
  const { posts, fresh } = mergeFeed([post("old")], [post("new")]);
  assert.deepEqual(posts.map((p) => p.oriane_id), ["old"]);
  assert.deepEqual(fresh.map((p) => p.oriane_id), ["new"]);
});

test("a creator is named only at 100k views or more", () => {
  assert.equal(canNameCreator({ views: 100_000 }), true);
  assert.equal(canNameCreator({ views: 99_999 }), false);
  assert.equal(canNameCreator({ views: null }), false);
});

test("mythName makes a readable chip label", () => {
  assert.equal(mythName("mouth-taping"), "Mouth taping");
});

test("the data-through line names the day and time, and is null without a date", () => {
  const line = dataThroughLine("2026-11-06T13:40:00Z");
  assert.match(line ?? "", /^Oriane search runs to Nov (5|6), \d{1,2}:\d{2} (AM|PM)$/);
  assert.equal(dataThroughLine(null), null);
  assert.equal(dataThroughLine("not a date"), null);
});
