import { test } from "node:test";
import assert from "node:assert/strict";
import type { LineStatus } from "./studio-logic.ts";
import { lineStatus, statusFromSupport, canApprove, changedLines, flagKey, copyScriptText, unsupportedCount, seedChecks, sourceCoverage, canPublish, blockReason } from "./studio-logic.ts";
import type { LineCheck, ClaimCheck, Source } from "../contracts/types.ts";

const lc = (x: Partial<LineCheck>): LineCheck => ({ line_id: "l1", has_claim: true, engine: "jev", ...x });
const claim = (id: string, status: ClaimCheck["status"]): ClaimCheck => ({ id, text: id, evidence: [], support: 0.9, status, engine: "jev" });

test("lineStatus", () => {
  assert.equal(lineStatus(undefined), "pending");
  assert.equal(lineStatus(lc({ has_claim: false, status: "unsupported" })), "no_claim");
  assert.equal(lineStatus(lc({ status: "weak", support: 0.95 })), "weak");
  assert.equal(lineStatus(lc({ support: 0.8 })), "supported");
  assert.equal(lineStatus(lc({ support: 0.5 })), "weak");
  assert.equal(lineStatus(lc({ support: 0.49 })), "unsupported");
  assert.equal(statusFromSupport(0.79), "weak");
});

test("canApprove requires verified coverage and no unchecked or weak line", () => {
  const ok = { every_claim_has_source: true, quotes_are_exact: true, targets_claim_not_person: true, no_minors_or_illness_stories: true, video_qa_passed: false };
  assert.equal(canApprove(ok, ["supported", "no_claim"]), true);
  assert.equal(canApprove(ok, ["supported", "weak"]), false);
  assert.equal(canApprove(ok, ["supported", "failed"]), false);
  assert.equal(lineStatus(lc({has_claim: false, note: "Not checked (brain offline)"})), "failed");
  assert.equal(canApprove(ok, ["supported", "pending"]), false);
  assert.equal(canApprove(ok, ["supported", "unsupported"]), false);
  assert.equal(canApprove({ ...ok, quotes_are_exact: false }, ["supported"]), false);
});

test("changedLines returns only edited lines", () => {
  const lines = [{ id: "l1", text: "a" }, { id: "l2", text: "b2" }, { id: "l3", text: "c" }];
  assert.deepEqual(changedLines(lines, { l1: "a", l2: "b", l3: "c" }), [{ id: "l2", text: "b2" }]);
});

test("flagKey differs per text and per line", () => {
  assert.notEqual(flagKey("l1", "a"), flagKey("l1", "b"));
  assert.notEqual(flagKey("l1", "a"), flagKey("l2", "a"));
  assert.equal(flagKey("l1", "a"), flagKey("l1", "a"));
});

test("copyScriptText keeps order and on-screen text", () => {
  assert.equal(copyScriptText([{ id: "l1", text: "One", on_screen: "1" }, { id: "l2", text: "Two" }]), "One\nOn screen: 1\n\nTwo");
});

test("unsupportedCount and seedChecks", () => {
  const claims = [claim("c1", "supported"), claim("c2", "unsupported")];
  assert.equal(unsupportedCount(claims), 1);
  const seed = seedChecks([{ id: "l1", text: "x", claim_id: "c2" }, { id: "l2", text: "y" }], claims);
  assert.equal(lineStatus(seed.l1), "unsupported");
  assert.equal(lineStatus(seed.l2), "no_claim");
});

const source = { id: "s1", excerpts: ["exact words"] } as Source;
const live = (status: LineStatus, evidence?: LineCheck["evidence"]) =>
  ({ status, checkedFrom: "live" as const, check: lc({ evidence }) });

test("sourceCoverage is derived from live checks that cite a real excerpt", () => {
  const cited = [{ source_id: "s1", excerpt: "exact words" }];
  assert.equal(sourceCoverage([live("supported", cited), live("no_claim")], [source]), true);
  assert.equal(sourceCoverage([], [source]), false);
  assert.equal(sourceCoverage([live("supported", cited), live("pending")], [source]), false);
  assert.equal(sourceCoverage([live("unsupported", cited)], [source]), false);
  assert.equal(sourceCoverage([live("supported", [{ source_id: "s1", excerpt: "invented" }])], [source]), false);
  assert.equal(sourceCoverage([live("supported")], [source]), false);
  assert.equal(sourceCoverage([{ ...live("supported", cited), checkedFrom: "fixture" }], [source]), false);
});

test("canPublish needs final approval, a QA-passed video and no publish in flight", () => {
  const ok = { finalApproved: true, videoUrl: "/published/x/video/a.mp4", qaPass: true, publishing: false };
  assert.equal(canPublish(ok), true);
  assert.equal(canPublish({ ...ok, finalApproved: false }), false);
  assert.equal(canPublish({ ...ok, videoUrl: null }), false);
  assert.equal(canPublish({ ...ok, qaPass: false }), false);
  assert.equal(canPublish({ ...ok, publishing: true }), false);
});

test("blockReason names the worst blocking line and is empty when clear", () => {
  assert.equal(blockReason(["supported", "no_claim"]), "");
  assert.match(blockReason(["weak", "unsupported"]), /no source/);
  assert.match(blockReason(["failed", "pending"]), /could not be checked/);
  assert.match(blockReason(["pending", "weak"]), /still being checked/);
  assert.match(blockReason(["weak"]), /weak support/);
});
