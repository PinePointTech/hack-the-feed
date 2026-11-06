import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mythFromFixtures, checkFromFixtures, brainErrorCode, normalizeLine } from "./fixture-logic.ts";

const load = (f: string) => JSON.parse(readFileSync(join(import.meta.dirname, "../contracts/fixtures", f), "utf8"));
const radar = load("radar.json");
const myth = load("myth-lymphatic-detox.json");
const brief = load("brief-lymphatic-detox.json");
const check = load("check.json");

test("myth: lymphatic id returns the lymphatic fixture", () => {
  assert.equal(mythFromFixtures("lymphatic-detox", myth, radar), myth);
});

test("myth: other radar id builds detail from summary with no invented numbers", () => {
  const d = mythFromFixtures("garlic-tumor", myth, radar);
  const summary = radar.myths.find((m: { id: string }) => m.id === "garlic-tumor");
  assert.equal(d.id, "garlic-tumor");
  assert.equal(d.title, summary.title);
  assert.deepEqual(d.videos, []);
  assert.deepEqual(d.counter_voices, []);
  assert.deepEqual(d.stance_counts, {});
});

test("myth: unknown id falls back to the lymphatic fixture", () => {
  assert.equal(mythFromFixtures("nope", myth, radar), myth);
});

test("normalizeLine", () => {
  assert.equal(normalizeLine("  There’s  no evidence\nit causes weight loss. "), "there's no evidence it causes weight loss");
  assert.equal(normalizeLine("“Hi”."), "\"hi\"");
});

test("check: burns fat returns results[0] with caller line id", () => {
  const r = checkFromFixtures({ myth_id: "lymphatic-detox", lines: [{ id: "x9", text: "Lymphatic drainage BURNS FAT." }] }, check, brief);
  assert.deepEqual(r.results[0], { ...check.results[0], line_id: "x9" });
});

test("check: restored script line returns its claim support", () => {
  const r = checkFromFixtures({ myth_id: "lymphatic-detox", lines: [{ id: "l3", text: " There’s no evidence it causes  weight loss" }] }, check, brief);
  const c1 = brief.claims.find((c: { id: string }) => c.id === "c1");
  assert.deepEqual(r.results[0], { line_id: "l3", has_claim: true, support: c1.support, status: c1.status, evidence: c1.evidence, engine: "cached" });
});

test("check: other text is not checked", () => {
  const r = checkFromFixtures({ myth_id: "lymphatic-detox", lines: [{ id: "l7", text: "Sources are on the receipts page. Link in bio." }] }, check, brief);
  assert.deepEqual(r.results[0], { line_id: "l7", has_claim: false, engine: "cached", note: "Not checked (brain offline)" });
});

test("brainErrorCode reads { error: { code } } bodies", () => {
  assert.equal(brainErrorCode('{"error":{"code":"oriane_down","message":"x"}}'), "oriane_down");
  assert.equal(brainErrorCode("Internal Server Error"), undefined);
  assert.equal(brainErrorCode('{"detail":"x"}'), undefined);
});
