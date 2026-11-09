import { test } from "node:test";
import assert from "node:assert/strict";
import { postView, verdictOf, TEXT_ONLY_NOTE, OLD_LABEL_NOTE } from "./label-why.ts";
import type { FeedLabel, FeedPost } from "./feed.ts";

const label = (over: Partial<FeedLabel> = {}): FeedLabel => ({ health_claim: true, myth_id: null, stance: "promotes", confidence: 0.9, model: "m", ...over });
const post = (l: FeedLabel | null, over: Partial<FeedPost> = {}): FeedPost => ({
  oriane_id: "cnt_1", platform: "tiktok", url: null, handle: null, display_name: null, thumbnail_url: null, views: 1,
  published_at: null, fetched_at: "2026-11-09T00:00:00Z", snippet: "Matched line.", snippet_source: "caption", matched_query: "q",
  label: l, ...over,
});
const name = (id: string) => `Myth ${id}`;
const newLabel = (over: Partial<FeedLabel> = {}) => label({ basis: "transcript", evidence: { quote: "It melts fat.", source: "transcript" }, commercial: false, flagged: false, ...over });

test("only a promoted claim judged dubious is flagged", () => {
  assert.equal(verdictOf(newLabel({ flagged: true })), "flagged");
  assert.equal(verdictOf(newLabel({ flagged: false })), "claim");
  assert.equal(verdictOf(newLabel({ stance: "debunks", flagged: false })), "corrects");
  for (const stance of ["ad", "unrelated", "neutral"] as const) assert.equal(verdictOf(newLabel({ stance })), "no_claim");
  assert.equal(verdictOf(null), "pending");
});

test("the evidence sentence is shown in place of the matched line, with where it came from", () => {
  const v = postView(post(newLabel({ flagged: true })), name);
  assert.deepEqual([v.title, v.quote], ["Flagged", { text: "It melts fat.", from: "Said in the video" }]);
  assert.deepEqual(postView(post(newLabel({ evidence: null })), name).quote, { text: "Matched line.", from: "In the caption" });
  assert.deepEqual(postView(post(null, { snippet_source: null }), name).quote, { text: "Matched line.", from: "From the post" });
  // @ts-expect-error a newer brain could send a source this build does not know
  assert.equal(postView(post(newLabel({ evidence: { quote: "x", source: "audio" } })), name).quote.text, "Matched line.");
});

test("selling is its own tag: Selling something on a claim, Ad when there is no claim", () => {
  assert.equal(postView(post(newLabel({ flagged: true, commercial: true })), name).selling, "Selling something");
  assert.equal(postView(post(newLabel({ stance: "ad", commercial: true })), name).selling, "Ad");
  assert.equal(postView(post(label({ stance: "ad" })), name).selling, "Ad"); // old label, no commercial field
  assert.equal(postView(post(newLabel()), name).selling, null);
  assert.equal(postView(post(null), name).selling, null);
});

test("notes say when only the caption was read or the label is from the older method", () => {
  assert.equal(postView(post(newLabel({ basis: "text_only" })), name).note, TEXT_ONLY_NOTE);
  assert.equal(postView(post(newLabel()), name).note, null);
  const old = postView(post(label()), name);
  assert.deepEqual([old.verdict, old.note], ["claim", OLD_LABEL_NOTE]);
  assert.match(old.detail, /Not yet checked against the evidence/);
});

test("only a confirmed myth gets a link", () => {
  assert.deepEqual(postView(post(newLabel({ myth_id: "mouth-taping", myth_confirmed: true })), name).myth, { name: "Myth mouth-taping", href: "/desk/myth/mouth-taping" });
  assert.equal(postView(post(newLabel({ myth_id: "sea-moss", myth_confirmed: false })), name).myth, null);
  assert.equal(postView(post(newLabel({ myth_id: "a b/c", myth_confirmed: true })), name).myth?.href, "/desk/myth/a%20b%2Fc");
});
