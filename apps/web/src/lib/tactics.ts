// How flagged posts sell a health myth, counted from the live feed. Each tactic is a plain word match on the
// creator's own quoted words (or the label's selling flag), so the count is easy to check by reading the posts.
// Pure, no "@/..." imports so node --test can run it.
import type { FeedPost } from "./feed.ts";

export type Tactic = { key: string; name: string; ask: string; uses: (post: FeedPost, quote: string) => boolean };

export const TACTICS: Tactic[] = [
  {
    key: "selling", name: "Selling the fix",
    ask: "Is the person describing the problem also selling the answer? Look for codes, links, shops and \"DM me\".",
    uses: (post) => post.label?.commercial === true,
  },
  {
    key: "authority", name: "Borrowed authority",
    ask: "Which doctor, which study? A claim that names no one and links nothing is not evidence.",
    uses: (_, quote) => /\b(doctors?|dr\.?|clinically|scientists?|studies|research|proven)\b/i.test(quote),
  },
  {
    key: "fast", name: "Fast, total results",
    ask: "Promises of quick or complete results, with no limits or side effects, are a warning sign.",
    uses: (_, quote) => /\b(instant(ly)?|overnight|immediately|guaranteed?|cures?|melts?|in \d+ (days?|minutes?))\b/i.test(quote),
  },
  {
    key: "toxins", name: "Vague toxins and cleanses",
    ask: "Which toxin, removed from where, and how was it measured? If the post never says, ask why.",
    uses: (_, quote) => /\b(detox\w*|toxins?|toxic|cleanses?|flush(es|ing)?|parasites?)\b/i.test(quote),
  },
];

const EXAMPLE_MAX = 220;

export type Lesson = { tactic: Tactic; count: number; example: FeedPost | null; quote: string | null };

/** Per tactic: how many flagged posts use it and the most viewed one as an example, with the words it was found in. */
export function lessons(posts: FeedPost[]): { flagged: number; lessons: Lesson[] } {
  const flagged = posts
    .filter((post) => post.label?.stance === "promotes" && post.label.flagged === true)
    // The words the feed card shows: the labeler's evidence sentence, else the line the search matched.
    .map((post) => ({ post, quote: post.label?.evidence?.quote || post.snippet }))
    .sort((a, b) => (b.post.views ?? 0) - (a.post.views ?? 0));
  return {
    flagged: flagged.length,
    lessons: TACTICS.map((tactic) => {
      const using = flagged.filter(({ post, quote }) => tactic.uses(post, quote));
      // A short quote reads as an example; a long story only when nothing shorter uses the tactic.
      const best = using.find(({ quote }) => quote.length <= EXAMPLE_MAX) ?? using[0];
      return { tactic, count: using.length, example: best?.post ?? null, quote: best?.quote ?? null };
    }),
  };
}
