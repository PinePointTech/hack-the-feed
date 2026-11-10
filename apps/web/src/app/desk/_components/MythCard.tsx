import Link from "next/link";
import type { HarmTier, MythSummary } from "@/contracts/types";
import { HarmChip } from "@/components/HarmChip";
import { TrendBadge } from "@/components/TrendBadge";
import { PostImage } from "@/components/PostImage";
import { maskHandles } from "@/lib/feed";
import { compact } from "@/lib/format";
import { Stat } from "./Stat";
import { windowWithYear } from "./window";

const POSTER: Record<HarmTier, string> = {
  harmful: "bg-harmful-fill text-harmful-text",
  false: "bg-false-fill text-false-text",
  unproven: "bg-unproven-fill text-unproven-text",
};

// Poster from the most viewed post pushing the myth (blurred unless nameable), then the myth, its reach, its top quote and the two next steps.
export function MythCard({ myth, rank }: { myth: MythSummary; rank: number }) {
  const video = myth.top_video;
  return (
    <article
      aria-labelledby={`myth-${myth.id}`}
      className="relative grid min-w-0 overflow-hidden rounded-frame border border-ink bg-paper motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-v2 motion-safe:hover:-translate-y-1"
    >
      <div className={`relative ${POSTER[myth.harm_tier]}`}>
        <PostImage src={video?.thumbnail_url} named={!!video?.nameable} className="aspect-[4/3] w-full !bg-transparent"
          fallback={<span className="px-6 font-serif text-[2rem] leading-[1.05] font-bold italic">&ldquo;{myth.topic}&rdquo;</span>} />
        <span aria-hidden="true" className="mono absolute right-3 bottom-3 rounded-pill bg-paper px-3 py-1 text-lg font-semibold text-ink">
          {String(rank).padStart(2, "0")}
        </span>
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
          </div>
        </div>

        <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-x-4 gap-y-3">
          <Stat label="claim views" value={myth.claim_views} />
          <Stat label="claim videos" value={myth.claim_video_count} />
          <Stat label={`views on "${myth.topic}"`} value={myth.topic_views} />
        </dl>

        <div className="grid gap-2 border-t border-rule pt-3 text-[0.8125rem] leading-[1.45] text-ink-2">
          <p className="mono">Data: Oriane, {windowWithYear(myth.window)}</p>
        </div>

        {video && (
          <blockquote className="m-0 border-l-2 border-rule pl-3 font-serif text-[0.9375rem] leading-[1.45]">
            <span className="line-clamp-4">&ldquo;{video.nameable ? video.quote : maskHandles(video.quote)}&rdquo;</span>
            <footer className="mt-1 font-sans text-[0.75rem] text-ink-2">
              {video.nameable ? `@${video.handle}` : "Creator not named"} · {compact(video.views)} views · the most viewed post pushing it
            </footer>
          </blockquote>
        )}

        <div className="grid gap-2 min-[500px]:grid-cols-2">
          <Link href={`/desk/myth/${myth.id}?from=radar`} className="btn w-full">
            Open<span className="sr-only">: {myth.title}</span>
          </Link>
          <Link href={`/desk/myth/${myth.id}/studio`} className="inline-flex min-h-11 items-center justify-center rounded-pill border border-ink px-4 font-semibold hover:bg-ink hover:text-paper">
            Make the debunk
          </Link>
        </div>
      </div>
    </article>
  );
}
