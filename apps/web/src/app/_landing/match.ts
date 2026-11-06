// Pure keyword match for the landing claim box. No "@/..." imports so node --test can run it.
export type MythKey = { id: string; title: string; topic: string; claim: string };

// Words too common to identify a myth on their own.
const STOP = new Set(["that", "this", "with", "your", "does", "work", "works", "even", "really", "have", "from",
  "will", "make", "makes", "help", "helps", "about", "into", "they", "when", "what", "which", "true", "cause", "causes"]);

const words = (s: string) =>
  s.toLowerCase().match(/[a-z]+/g)?.filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.replace(/s$/, "")) ?? [];

/** The radar myth whose title, topic or claim shares the most keywords with the query, or null. */
export function matchClaim<T extends MythKey>(query: string, myths: T[]): T | null {
  const q = new Set(words(query));
  let best: T | null = null;
  let bestHits = 0;
  for (const m of myths) {
    const hits = new Set(words(`${m.title} ${m.topic} ${m.claim}`).filter((w) => q.has(w))).size;
    if (hits > bestHits) [best, bestHits] = [m, hits];
  }
  return best;
}
