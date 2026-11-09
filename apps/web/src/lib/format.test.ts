import { test } from "node:test";
import assert from "node:assert/strict";
import { compact, exact, mss, pct, pulledAt, statusFor } from "./format.ts";

test("compact and exact numbers", () => {
  assert.equal(compact(49537321), "49.5M");
  assert.equal(compact(946248), "946.2K");
  assert.equal(exact(49537321), "49,537,321");
});

test("mss floors to m:ss", () => {
  assert.equal(mss(7.44), "0:07");
  assert.equal(mss(55.72), "0:55");
  assert.equal(mss(125), "2:05");
});

test("pct signs", () => {
  assert.equal(pct(-22), "-22%");
  assert.equal(pct(12), "+12%");
  assert.equal(pct(0), "0%");
});

test("statusFor thresholds", () => {
  assert.equal(statusFor(0.93), "supported");
  assert.equal(statusFor(0.8), "supported");
  assert.equal(statusFor(0.79), "weak");
  assert.equal(statusFor(0.5), "weak");
  assert.equal(statusFor(0.49), "unsupported");
  assert.equal(statusFor(0.04), "unsupported");
});

test("pulledAt prints UTC so server and browser agree", () => {
  assert.equal(pulledAt("2026-11-08T23:49:00+00:00"), "Nov 8, 2026, 11:49 PM UTC");
});
