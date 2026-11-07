export type MythKey = { id: string; title: string; topic: string; claim: string };

const REVIEWED_PATTERNS: Record<string, RegExp> = {
  "lymphatic-detox": /^(?:can |does |will )?(?:lymphatic drainage|lymphatic massage) (?:melt fat|burns? fat|(?:causes? )?weight loss|detox(?:es)?(?: you| the body)?|(?:pulls?|removes?) toxins(?: out of the body)?)$/,
  "garlic-tumor": /^(?:can |does |will )?garlic(?: paste)? (?:destroy|destroys|treat|treats|cure|cures) (?:cancer |breast )?tumou?rs?$/,
  "mouth-taping": /^(?:can |does |will )?(?:mouth taping|mouth tape|taping your mouth shut) (?:sharpen|improve|snatch) (?:your |the )?jawline$/,
};
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function matchClaim<T extends MythKey>(query: string, myths: T[]): T | null {
  const text = normalize(query);
  if (!text) return null;
  return myths.find((myth) => normalize(myth.claim) === text || normalize(myth.title) === text ||
    REVIEWED_PATTERNS[myth.id]?.test(text)) ?? null;
}
