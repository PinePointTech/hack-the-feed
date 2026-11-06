import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matchClaim, type MythKey } from "./match.ts";

const radar = JSON.parse(readFileSync(join(import.meta.dirname, "../../contracts/fixtures/radar.json"), "utf8")) as { myths: MythKey[] };
const id = (q: string) => matchClaim(q, radar.myths)?.id ?? null;

test("matchClaim: routes typed claims to radar myths by keyword", () => {
  assert.equal(id("lymphatic drainage burns fat"), "lymphatic-detox");
  assert.equal(id("Does garlic cure cancer?"), "garlic-tumor");
  assert.equal(id("garlic paste on tumors"), "garlic-tumor");
  assert.equal(id("mouth tape for sleep"), "mouth-taping");
});

test("matchClaim: no match for unrelated claims or filler words", () => {
  assert.equal(id("vitamin c cures colds"), null);
  assert.equal(id("does this really work for you"), null);
  assert.equal(id(""), null);
});
