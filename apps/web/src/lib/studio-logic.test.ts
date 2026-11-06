import { test } from "node:test";
import assert from "node:assert/strict";
import { lineStatus, statusFromSupport, canApprove, changedLines, flagKey, copyScriptText, unsupportedCount, seedChecks } from "./studio-logic.ts";
import type { LineCheck, ClaimCheck } from "../contracts/types.ts";

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

test("canApprove needs the four ticks and no unsupported line", () => {
  const ok = { every_claim_has_source: true, quotes_are_exact: true, targets_claim_not_person: true, no_minors_or_illness_stories: true, video_qa_passed: false };
  assert.equal(canApprove(ok, ["supported", "weak", "no_claim", "pending"]), true);
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
