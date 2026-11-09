import { test } from "node:test";
import assert from "node:assert/strict";
import { labelWhy, NO_EVIDENCE_LINE, TEXT_ONLY_LINE } from "./label-why.ts";
import { stanceChip, FLAGGED_LINE, NOT_FLAGGED_LINE } from "./label-why.ts";
import type { FeedLabel } from "./feed.ts";

const label = (over: Partial<FeedLabel> = {}): FeedLabel => ({ health_claim: true, myth_id: null, stance: "promotes", confidence: 0.9, model: "m", ...over });

test("each stance has its fixed line", () => {
  assert.equal(labelWhy(label({ stance: "promotes" })).stanceLine, "Presents the claim as true or tells people to act on it.");
  assert.equal(labelWhy(label({ stance: "debunks" })).stanceLine, "Disputes or corrects the claim.");
  assert.equal(labelWhy(label({ stance: "ad" })).stanceLine, "Sells or promotes a product or service.");
  assert.equal(labelWhy(label({ stance: "unrelated" })).stanceLine, "Takes no position on a health claim.");
  assert.equal(labelWhy(label({ stance: "neutral" })).stanceLine, "Takes no position on a health claim.");
});

test("an old label without basis or evidence shows only the stance line", () => {
  const w = labelWhy(label({ myth_id: "mouth-taping" }));
  assert.deepEqual({ ...w, stanceLine: "" }, { stanceLine: "", flagLine: null, evidence: null, basisNote: null, mythHref: null });
});

test("evidence shows its quote and a fixed source line", () => {
  const src = { transcript: "From the spoken transcript", caption: "From the caption", on_screen: "From on-screen text" } as const;
  for (const source of Object.keys(src) as (keyof typeof src)[]) {
    assert.deepEqual(labelWhy(label({ basis: "transcript", evidence: { quote: "Tape it shut.", source } })).evidence, { quote: "Tape it shut.", sourceLine: src[source] });
  }
});

test("null evidence says no single sentence supports the label", () => {
  assert.deepEqual(labelWhy(label({ basis: "transcript", evidence: null })).evidence, { none: NO_EVIDENCE_LINE });
  assert.equal(NO_EVIDENCE_LINE, "No single sentence supports this label");
});

test("an empty quote or unknown source never shows a quote", () => {
  assert.deepEqual(labelWhy(label({ basis: "text_only", evidence: { quote: "", source: "caption" } })).evidence, { none: NO_EVIDENCE_LINE });
  // @ts-expect-error a newer brain could send a source this build does not know
  assert.deepEqual(labelWhy(label({ basis: "text_only", evidence: { quote: "x", source: "audio" } })).evidence, { none: NO_EVIDENCE_LINE });
});

test("text_only basis adds the no-transcript note, transcript basis does not", () => {
  assert.equal(labelWhy(label({ basis: "text_only", evidence: null })).basisNote, TEXT_ONLY_LINE);
  assert.equal(TEXT_ONLY_LINE, "Judged from the caption and on-screen text only. Oriane has no transcript for this video yet.");
  assert.equal(labelWhy(label({ basis: "transcript", evidence: null })).basisNote, null);
});

test("a myth id links to its desk page, and none means no link", () => {
  assert.equal(labelWhy(label({ basis: "transcript", evidence: null, myth_id: "mouth-taping", myth_confirmed: true })).mythHref, "/desk/myth/mouth-taping");
  assert.equal(labelWhy(label({ basis: "transcript", evidence: null, myth_id: "sea-moss", myth_confirmed: false })).mythHref, null);  // candidates have no page
  assert.equal(labelWhy(label({ basis: "transcript", evidence: null, myth_id: "a b/c", myth_confirmed: true })).mythHref, "/desk/myth/a%20b%2Fc");
  assert.equal(labelWhy(label({ basis: "transcript", evidence: null })).mythHref, null);
});

test("only a promoted dubious claim is flagged red", () => {
  assert.deepEqual(stanceChip(label({ stance: "promotes", flagged: true })), { text: "Flagged", flagged: true });
  assert.deepEqual(stanceChip(label({ stance: "promotes", flagged: false })), { text: "Makes a claim", flagged: false });
  assert.deepEqual(stanceChip(label({ stance: "promotes" })), { text: "Promotes", flagged: true });  // old label, no flag yet
  assert.deepEqual(stanceChip(label({ stance: "ad", flagged: false })), { text: "Ad", flagged: false });
  assert.equal(labelWhy(label({ stance: "promotes", flagged: true, basis: "transcript", evidence: null })).flagLine, FLAGGED_LINE);
  assert.equal(labelWhy(label({ stance: "promotes", flagged: false })).flagLine, NOT_FLAGGED_LINE);
  assert.equal(labelWhy(label({ stance: "debunks", flagged: false })).flagLine, null);
});
