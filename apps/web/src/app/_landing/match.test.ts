import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matchClaim, type MythKey } from "./match.ts";

const radar = JSON.parse(readFileSync(join(import.meta.dirname, "../../contracts/fixtures/radar.json"), "utf8")) as { myths: MythKey[] };
const id = (q: string) => matchClaim(q, radar.myths)?.id ?? null;

test("matchClaim: routes reviewed claim variants to the right myth", () => {
  assert.equal(id("lymphatic drainage burns fat"), "lymphatic-detox");
  assert.equal(id("Does garlic destroy tumors?"), "garlic-tumor");
  assert.equal(id("garlic paste treats breast tumors"), "garlic-tumor");
  assert.equal(id("Does mouth tape sharpen your jawline?"), "mouth-taping");
});

test("matchClaim: no match for unrelated claims or filler words", () => {
  assert.equal(id("Can garlic prevent a cold?"), null);
  assert.equal(id("Does putting a sliced onion in your socks cure a cold?"), null);
  assert.equal(id("Does lymphatic drainage melt fat?"), "lymphatic-detox");
  assert.equal(id("does this really work for you"), null);
  assert.equal(id(""), null);
});
