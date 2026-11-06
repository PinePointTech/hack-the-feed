import type { HarmTier } from "@/contracts/types";

const STYLE: Record<HarmTier, string> = {
  harmful: "bg-red-100 text-red-800 ring-red-300",
  false: "bg-orange-100 text-orange-800 ring-orange-300",
  unproven: "bg-slate-100 text-slate-700 ring-slate-300",
};

export function HarmChip({ tier }: { tier: HarmTier }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ring-1 ${STYLE[tier]}`}>
      {tier}
    </span>
  );
}
