import Link from "next/link";
import type { MythSummary } from "@/contracts/types";
import { HarmChip } from "@/components/HarmChip";
import { TrendBadge } from "@/components/TrendBadge";
import { QuoteCard } from "@/components/QuoteCard";
import { Stat } from "./Stat";
import { windowLabel } from "./window";

export function MythCard({ myth }: { myth: MythSummary }) {
  return (
    <article className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">{myth.title}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <HarmChip tier={myth.harm_tier} />
            <TrendBadge trend={myth.trend} pct={myth.trend_pct} />
          </div>
        </div>
        <Link
          href={`/desk/myth/${myth.id}?from=radar`}
          className="rounded-lg bg-blue-700 px-5 py-3 text-lg font-medium text-white hover:bg-blue-800"
        >
          Open
        </Link>
      </header>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <Stat label="claim views" value={myth.claim_views} />
        <Stat label="claim videos" value={myth.claim_video_count} />
        <Stat label={`views on "${myth.topic}"`} value={myth.topic_views} />
      </div>
      <div className="space-y-1 text-sm text-slate-600">
        <p>{myth.match_note}</p>
        <p>Data: Oriane, {windowLabel(myth.window)}</p>
      </div>
      {myth.top_video && <QuoteCard video={myth.top_video} />}
    </article>
  );
}
