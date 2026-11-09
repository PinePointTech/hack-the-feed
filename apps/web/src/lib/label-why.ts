// "Why this label" copy for a feed card. Fixed human copy keyed by contract fields only, never model prose. Pure, no "@/..." imports so node --test can run it.
import type { FeedLabel } from "./feed.ts";

const STANCE_LINE: Record<FeedLabel["stance"], string> = {
  promotes: "Presents the claim as true or tells people to act on it.",
  debunks: "Disputes or corrects the claim.",
  ad: "Sells or promotes a product or service.",
  unrelated: "Takes no position on a health claim.",
  neutral: "Takes no position on a health claim.",
};

const SOURCE_LINE = {
  transcript: "From the spoken transcript",
  caption: "From the caption",
  on_screen: "From on-screen text",
} as const;

export const NO_EVIDENCE_LINE = "No single sentence supports this label";
export const TEXT_ONLY_LINE = "Judged from the caption and on-screen text only. Oriane has no transcript for this video yet.";
export const FLAGGED_LINE = "Flagged: pushes a health claim that mainstream evidence does not support.";
export const NOT_FLAGGED_LINE = "Not flagged: the claim it makes is modest or supported by evidence.";

/** Chip text and style for a label. Only a flagged post gets the red chip; a modest claim is not alarming. */
export function stanceChip(label: FeedLabel): { text: string; flagged: boolean } {
  if (label.stance === "promotes" && label.flagged) return { text: "Flagged", flagged: true };
  if (label.stance === "promotes" && label.flagged === false) return { text: "Makes a claim", flagged: false };
  return { text: { promotes: "Promotes", debunks: "Debunks", ad: "Ad", unrelated: "Unrelated", neutral: "Neutral" }[label.stance], flagged: label.stance === "promotes" };
}

export const MYTH_LINK_TEXT = "What the evidence says about this myth";

export type LabelWhy = {
  stanceLine: string;
  /** Null when the label predates the flag. */
  flagLine: string | null;
  /** Null for an old label (no basis, no evidence): show the stance line only. */
  evidence: { quote: string; sourceLine: string } | { none: string } | null;
  basisNote: string | null;
  mythHref: string | null;
};

export function labelWhy(label: FeedLabel): LabelWhy {
  const stanceLine = STANCE_LINE[label.stance];
  const flagLine = label.stance !== "promotes" || label.flagged === undefined ? null : label.flagged ? FLAGGED_LINE : NOT_FLAGGED_LINE;
  if (label.basis === undefined && label.evidence === undefined) return { stanceLine, flagLine, evidence: null, basisNote: null, mythHref: null };
  // An unrecognised source from a newer brain counts as no evidence, so we never show a quote under a wrong source.
  const ev = label.evidence && label.evidence.quote && SOURCE_LINE[label.evidence.source] ? label.evidence : null;
  return {
    stanceLine,
    flagLine,
    evidence: ev ? { quote: ev.quote, sourceLine: SOURCE_LINE[ev.source] } : { none: NO_EVIDENCE_LINE },
    basisNote: label.basis === "text_only" ? TEXT_ONLY_LINE : null,
    mythHref: label.myth_id && label.myth_confirmed ? `/desk/myth/${encodeURIComponent(label.myth_id)}` : null,
  };
}
