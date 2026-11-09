// What a feed card says about a post, in plain words. Fixed human copy keyed by contract fields only, never
// model prose. Pure, no "@/..." imports so node --test can run it.
import type { FeedLabel, FeedPost } from "./feed.ts";

export type Verdict = "flagged" | "claim" | "corrects" | "no_claim" | "pending";

const VERDICT: Record<Verdict, { title: string; detail: string }> = {
  flagged: { title: "Flagged", detail: "Pushes a health claim that mainstream evidence does not support." },
  claim: { title: "Makes a health claim", detail: "The claim is modest or has support, so it is not flagged." },
  corrects: { title: "Corrects a claim", detail: "Disputes or corrects a health claim." },
  no_claim: { title: "No health claim", detail: "Mentions the topic but makes no health claim." },
  pending: { title: "Not checked yet", detail: "Posts with enough views are checked after each pull." },
};

/** Filter order and button text for the feed. */
export const FILTERS: { key: Verdict | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "flagged", label: "Flagged" },
  { key: "claim", label: "Makes a claim" },
  { key: "corrects", label: "Corrects" },
  { key: "no_claim", label: "No claim" },
  { key: "pending", label: "Not checked" },
];

const FROM = { transcript: "Said in the video", caption: "In the caption", on_screen: "On screen" } as const;

export const TEXT_ONLY_NOTE = "Checked from the caption only. Oriane has no transcript for this video yet.";
export const OLD_LABEL_NOTE = "Checked with an older method. It will be rechecked soon.";

export function verdictOf(label: FeedLabel | null): Verdict {
  if (!label) return "pending";
  if (label.stance === "promotes") return label.flagged ? "flagged" : "claim";
  if (label.stance === "debunks") return "corrects";
  return "no_claim"; // ad, unrelated, neutral
}

export type PostView = {
  verdict: Verdict;
  title: string;
  detail: string;
  /** "Selling something" when the post sells and the verdict is about a claim; "Ad" when it sells with no claim. */
  selling: string | null;
  quote: { text: string; from: string };
  note: string | null;
  myth: { name: string; href: string } | null;
};

export function postView(post: FeedPost, mythName: (id: string) => string): PostView {
  const label = post.label;
  const verdict = verdictOf(label);
  const sells = label?.commercial ?? label?.stance === "ad";
  // The sentence the verdict rests on, when the labeler found one, beats the sentence the search matched.
  const ev = label?.evidence && label.evidence.quote && FROM[label.evidence.source] ? label.evidence : null;
  const quote = ev
    ? { text: ev.quote, from: FROM[ev.source] }
    : { text: post.snippet, from: post.snippet_source ? FROM[post.snippet_source] : "From the post" };
  const old = !!label && label.flagged === undefined && label.stance === "promotes";
  return {
    verdict,
    title: VERDICT[verdict].title,
    detail: old ? "Makes a health claim. Not yet checked against the evidence." : VERDICT[verdict].detail,
    selling: !sells || verdict === "pending" ? null : verdict === "no_claim" ? "Ad" : "Selling something",
    quote,
    note: old ? OLD_LABEL_NOTE : label?.basis === "text_only" ? TEXT_ONLY_NOTE : null,
    myth: label?.myth_id && label.myth_confirmed ? { name: mythName(label.myth_id), href: `/desk/myth/${encodeURIComponent(label.myth_id)}` } : null,
  };
}
