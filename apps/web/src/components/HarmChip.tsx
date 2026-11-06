import type { HarmTier } from "@/contracts/types";

const LABEL: Record<HarmTier, string> = { harmful: "Harmful", false: "False", unproven: "Unproven" };

export function HarmChip({ tier }: { tier: HarmTier }) {
  return <span className={`chip chip--${tier}`}>{LABEL[tier]}</span>;
}
