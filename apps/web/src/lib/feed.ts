// Brain GET /feed and POST /poll shapes (live pipeline contract). Pure helpers, no "@/..." imports so node --test can run this file.
import type { Platform, Stance } from "../contracts/types";

export type FeedLabel = {
  health_claim: boolean;
  myth_id: string | null;
  stance: Stance;
  confidence: number;
  model: string;
};

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
};

export type FeedResponse = {
  generated_at: string;
  last_poll_at: string | null;
  next_poll_at: string | null;
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
export const NAMING_MIN_VIEWS = 100_000;
export const canNameCreator = (p: Pick<FeedPost, "views">) => (p.views ?? 0) >= NAMING_MIN_VIEWS;

export const mythName =(id: string) => id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()); // "mouth-taping" -> "Mouth taping"
