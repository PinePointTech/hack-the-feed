import type { Trend } from "@/contracts/types";
import { pct as fmtPct } from "@/lib/format";

const LABEL: Record<Trend, string> = { rising: "Rising", steady: "Steady", cooling: "Cooling", unknown: "Trend unknown" };

export function TrendBadge({ trend, pct }: { trend: Trend; pct?: number }) {
  return (
    <span className="trend">
      {LABEL[trend]}
      {trend !== "unknown" && pct !== undefined && ` ${fmtPct(pct).replace("-", "−")}`}
    </span>
  );
}
