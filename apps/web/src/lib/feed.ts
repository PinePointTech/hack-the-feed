// Brain GET /feed and POST /poll shapes (live pipeline contract). Pure helpers, no "@/..." imports so node --test can run this file.
import type { Platform, Stance } from "../contracts/types";

export type FeedLabel = {
  health_claim: boolean;
  myth_id: string | null;
  stance: Stance;
  confidence: number;
  model: string;
  // Round 3, optional: old labels lack both. quote is an exact substring of its source text; null means no sentence supports the label.
  basis?: "transcript" | "text_only";
  myth_confirmed?: boolean;
  flagged?: boolean; // promotes a claim judged dubious
  commercial?: boolean; // independent of stance: promotes with commercial true is a sold post that pushes the claim. Old labels lack it.
  evidence?: { quote: string; source: "transcript" | "caption" | "on_screen" } | null;
  // Only on a correction that passed the brain's strict check: a PubMed study and a clinician page both back the quote.
  correction?: { quote: string; source: "transcript" | "caption" | "on_screen"; findings: Finding[] };
};

/** A source excerpt from the brain. The excerpt is exact text from the fetched page or abstract. */
export type Finding = { title: string; publisher: string; url: string; excerpt: string; relation: "supports" | "contradicts" | "qualifies" };

export type FeedPost = {
  oriane_id: string;
  platform: Platform;
  url: string | null;
  handle: string | null;
  display_name: string | null;
  thumbnail_url: string | null;
  views: number | null;
  published_at: string | null;
  fetched_at: string;
  snippet: string;
  snippet_source: "transcript" | "caption" | "on_screen" | null;
  matched_query: string;
  label: FeedLabel | null;
  /** The brain's naming check passed: 100k+ views or 50k+ followers, does not look under 18, not their own illness. */
  nameable?: boolean;
};

export type FeedResponse = {
  generated_at: string;
  last_poll_at: string | null;
  next_poll_at: string | null;
  data_through?: string | null;
  posts: FeedPost[];
};

export type PollResponse = { ran: boolean; last_poll_at: string | null; next_poll_at: string | null; new_posts: number };

/**
 * Merges a fresh GET /feed page into the posts on screen.
 * `posts` keeps the on-screen order and takes the newest copy of each post (a label can arrive later).
 * `fresh` is what the brain returned that is not on screen yet, in the brain's order (newest first).
 */
export function mergeFeed(shown: FeedPost[], latest: FeedPost[]) {
  const byId = new Map(latest.map((p) => [p.oriane_id, p]));
  const onScreen = new Set(shown.map((p) => p.oriane_id));
  return {
    posts: shown.map((p) => byId.get(p.oriane_id) ?? p),
    fresh: latest.filter((p) => !onScreen.has(p.oriane_id)),
  };
}

// CLAUDE.md rule 7: name a creator only on a post with 100k+ views. The feed has no follower count, age or illness signal,
// so views is the only check possible here. shortcut: views only, upgrade when the brain sends follower_count and an age/illness flag.
/** Only a post the brain's naming check cleared; an older brain or an unchecked post never names anyone. */
export const canNameCreator = (p: Pick<FeedPost, "nameable">) => p.nameable === true;
/** An unnamed creator's quote keeps its words but not its @handles, which could name the creator. */
export const maskHandles = (text: string) => text.replace(/@[\w.]+/g, "@…");

export const mythName =(id: string) => id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()); // "mouth-taping" -> "Mouth taping"

/** "Oriane search runs to Nov 6, 1:40 PM", in the viewer's time zone. Null when the brain sent no date. */
export function dataThroughLine(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `Oriane search runs to ${day}, ${time}`;
}
