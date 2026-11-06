import type { Trend } from "@/contracts/types";
import { pct as fmtPct } from "@/lib/format";

const ARROW: Record<Exclude<Trend, "unknown">, string> = { rising: "↑", steady: "→", cooling: "↓" };

export function TrendBadge({ trend, pct }: { trend: Trend; pct?: number }) {
  if (trend === "unknown") return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-slate-600">
      <span aria-hidden>{ARROW[trend]}</span>
      {trend}
      {pct !== undefined && ` ${fmtPct(pct)}`}
    </span>
  );
}
