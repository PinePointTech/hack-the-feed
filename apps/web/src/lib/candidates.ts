// Pure helpers for the candidate myth review page. No "@/..." imports so node --test can run this file.
import type { MythCandidates } from "../contracts/types";
import type { FeedPost } from "./feed";

export type Candidate = MythCandidates["candidates"][number];
export type ReviewRow = Candidate & { source_url: string | null };

/**
 * Rows for the review list: most labeled posts first, then oldest first, then id.
 * `source_url` is the feed's link to the post that raised the claim, or null when the feed page does not hold it.
 * The brain sends the url; an older brain does not, and then only a source post on the feed page (newest 50) gets a link.
 */
export function reviewRows(candidates: Candidate[], posts: Pick<FeedPost, "oriane_id" | "url">[]): ReviewRow[] {
  const urls = new Map(posts.map((p) => [p.oriane_id, p.url]));
  return candidates
    .map((c) => {
      const url = c.source_url ?? (c.source_oriane_id ? urls.get(c.source_oriane_id) : null);
      return { ...c, source_url: url && /^https?:\/\//.test(url) ? url : null };
    })
    .sort((a, b) => b.post_count - a.post_count || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
