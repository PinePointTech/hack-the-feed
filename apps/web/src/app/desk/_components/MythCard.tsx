import Link from "next/link";
import type { HarmTier, MythSummary } from "@/contracts/types";
import { HarmChip } from "@/components/HarmChip";
import { TrendBadge } from "@/components/TrendBadge";
import { QuoteCard } from "@/components/QuoteCard";
import { Placeholder } from "./Placeholder";
import { Stat } from "./Stat";
import { windowWithYear } from "./window";

const POSTER: Record<HarmTier, string> = {
  harmful: "bg-harmful-fill text-harmful-text",
  false: "bg-false-fill text-false-text",
  unproven: "bg-unproven-fill text-unproven-text",
};

// v2 contact-sheet frame: tier-colored poster with the rank, then the myth, its reach and its top quote.
export function MythCard({ myth, rank, fixture }: { myth: MythSummary; rank: number; fixture: boolean }) {
  return (
    <article
      aria-labelledby={`myth-${myth.id}`}
      className="relative grid min-w-0 overflow-hidden rounded-frame border border-ink bg-paper motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-v2 motion-safe:hover:-translate-y-1"
    >
      <div
        aria-hidden="true"
        className={`mono grid items-center justify-items-start px-5 py-3 text-[1.75rem] leading-none font-semibold min-[1100px]:aspect-[5/2] min-[1100px]:place-items-center min-[1100px]:p-0 min-[1100px]:text-[3.25rem] ${POSTER[myth.harm_tier]}`}
      >
        {String(rank).padStart(2, "0")}
      </div>

      <div className="grid min-w-0 content-start gap-4 px-5 pt-4 pb-5">
        <div className="grid gap-2.5">
          <h2
            id={`myth-${myth.id}`}
            className="text-[1.375rem] leading-[1.2] font-bold tracking-[-0.01em] [font-variation-settings:'opsz'_24]"
          >
            {myth.title}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="chip">Harm: {myth.harm_tier === "harmful" ? "Flagged" : "Not flagged"}</span>
            {myth.harm_tier !== "harmful" && <span>Verdict <HarmChip tier={myth.harm_tier} /></span>}
            <span>Trend <TrendBadge trend={myth.trend} pct={myth.trend_pct} /></span>
            {fixture && <Placeholder what="draft title and harm tier until the brain sets them" />}
          </div>
        </div>

        <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-x-4 gap-y-3">
          <Stat label="claim views" value={myth.claim_views} />
          <Stat label="claim videos" value={myth.claim_video_count} />
          <Stat label={`views on "${myth.topic}"`} value={myth.topic_views} />
        </dl>

        <div className="grid gap-2 border-t border-rule pt-3 text-[0.8125rem] leading-[1.45] text-ink-2">
          <p className="mono">Data: Oriane, {windowWithYear(myth.window)}</p>
          <p>{myth.match_note}</p>
        </div>

        {myth.top_video && (
          <div className="grid gap-2">
            <p className="mono text-xs font-semibold text-ink-2">Top quote</p>
            <QuoteCard video={myth.top_video} />
          </div>
        )}

        <Link href={`/desk/myth/${myth.id}?from=radar`} className="btn w-full">
          Open<span className="sr-only">: {myth.title}</span>
        </Link>
        <Link href={`/desk/impact/${myth.id}`} className="underline">View impact</Link>
      </div>
    </article>
  );
}
