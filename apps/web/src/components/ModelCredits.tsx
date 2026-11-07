// Names come straight from the brain's `models` field; empty values are hidden, never filled in.
type Models = { drafter: string; judge: string } | { vision: string; judge: string };

export function ModelCredits({ models }: { models?: Models }) {
  if (!models) return null;
  const [first, second] = "vision" in models ? (["Frames read by", "matched by"] as const) : (["Drafted by", "checked by"] as const);
  const maker = ("vision" in models ? models.vision : models.drafter)?.trim();
  const judge = models.judge?.trim();
  const parts = [maker && `${first} ${maker}`, judge && `${second} ${judge}`].filter(Boolean).join(", ");
  if (!parts) return null;
  return <p className="font-mono text-sm text-ink-2">{parts.charAt(0).toUpperCase() + parts.slice(1)}</p>;
}
