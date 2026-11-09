import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewRows, type Candidate } from "./candidates.ts";

// Built inside the test only to exercise the ordering and the link join. Never rendered, never shipped as data.
const cand = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  id, title: id, claim: "c", status: "candidate", source_oriane_id: null,
  created_at: "2026-11-09T08:00:00Z", confirmed_at: null, post_count: 1, ...over,
});

test("most posts first, then oldest first", () => {
  const rows = reviewRows(
    [cand("a"), cand("b", { post_count: 3 }), cand("c", { created_at: "2026-11-09T07:00:00Z" })],
    [],
  );
  assert.deepEqual(rows.map((r) => r.id), ["b", "c", "a"]);
});

test("links the source post only when the feed holds it with an http url", () => {
  const rows = reviewRows(
    [cand("a", { source_oriane_id: "p1" }), cand("b", { source_oriane_id: "p2" }), cand("c", { source_oriane_id: "p3" }), cand("d")],
    [
      { oriane_id: "p1", url: "https://tiktok.com/x" },
      { oriane_id: "p2", url: "javascript:alert(1)" },
    ],
  );
  const url = Object.fromEntries(rows.map((r) => [r.id, r.source_url]));
  assert.deepEqual(url, { a: "https://tiktok.com/x", b: null, c: null, d: null });
});
