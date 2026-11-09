"use client";
import Link from "next/link";
import type { CalendarItem, HarmTier } from "@/contracts/types";
import { useCalendar } from "@/lib/hooks/useCalendar";
import { exact } from "@/lib/format";
import { day } from "@/lib/view-model";
import { HarmChip } from "@/components/HarmChip";
import { TrendBadge } from "@/components/TrendBadge";
import { DataPulled } from "@/components/DataPulled";
import { LiveUnavailable } from "@/components/LiveUnavailable";

// v2 contact-sheet poster colors (design/preview/v2.html .poster--*)
const POSTER: Record<HarmTier, string> = {
  harmful: "bg-harmful-fill text-harmful-text",
  false: "bg-false-fill text-false-text",
  unproven: "bg-unproven-fill text-unproven-text",
};

export function CalendarView() {
  const { data, failed, reuseScript } = useCalendar();

  if (failed) return <LiveUnavailable what="the calendar" />;
  if (!data)
    return (
      <main className="wrap py-10">
        <p className="text-lg text-ink-2">Loading the calendar</p>
      </main>
    );
  return (
    <main className="wrap grid gap-16 pt-10 pb-20 min-[700px]:pt-16">
      <header className="grid max-w-[46rem] gap-3.5">
        <h1 className="text-[clamp(2.75rem,1.5rem+3.4vw,4.75rem)] leading-[0.98] font-extrabold tracking-[-0.035em] [font-stretch:90%] [font-variation-settings:'opsz'_96]">
          Myth <em className="kw">calendar</em>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono text-sm text-ink-2">
            Week of {day(data.week_of)}, {data.week_of.slice(0, 4)}
          </span>
          <DataPulled at={data.generated_at} />
        </div>
        <p className="text-lg text-ink-2">This week&apos;s health myths, one week ahead.</p>
      </header>
      <Section title="This week" items={data.this_week} onReuse={reuseScript} />
      <Section title="Watchlist" items={data.watchlist} onReuse={reuseScript} />
    </main>
  );
}

type Reuse = (mythId: string) => void;

function Section({
  title,
  items,
  onReuse,
}: {
  title: string;
  items: CalendarItem[];
  onReuse: Reuse;
}) {
  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2 border-b border-ink pb-3.5">
        <h2 className="text-[1.75rem] leading-[1.1] font-extrabold tracking-[-0.02em] [font-variation-settings:'opsz'_48]">
          {title}
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="text-ink-2">Nothing here yet.</p>
      ) : (
        <ol className="m-0 grid list-none gap-4 p-0 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-3">
          {items.map((it, i) => (
            <Item key={it.topic} n={i + 1} it={it} onReuse={onReuse} />
          ))}
        </ol>
      )}
    </section>
  );
}

function Item({ n, it, onReuse }: { n: number; it: CalendarItem; onReuse: Reuse }) {
  return (
    <li className="grid min-w-0 grid-cols-[72px_minmax(0,1fr)] overflow-hidden rounded-frame border border-ink">
      <div
        aria-hidden="true"
        className={`grid place-items-start justify-center pt-4 font-mono text-2xl leading-none font-semibold ${
          it.harm_tier ? POSTER[it.harm_tier] : "border-r border-rule text-ink-2"
        }`}
      >
        {String(n).padStart(2, "0")}
      </div>
      <article className="grid min-w-0 content-start gap-2.5 px-[18px] pt-4 pb-[18px]">
        <h3 className="text-lg leading-[1.2] font-bold tracking-[-0.01em] [font-variation-settings:'opsz'_24]">{it.topic}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {it.harm_tier && <HarmChip tier={it.harm_tier} />}
          {it.trend && <TrendBadge trend={it.trend} />}
          <span className="inline-flex items-center rounded-pill border border-ink-2 px-2.5 text-[0.8125rem] leading-normal font-semibold text-ink-2">
            {it.basis === "curated" ? "Curated" : "Oriane trend"}
          </span>
        </div>
        {(it.video_count !== undefined || it.views !== undefined) && (
          <p className="grid">
            {it.views !== undefined && <span className="mono text-xl leading-[1.3] font-semibold">{exact(it.views)} views</span>}
            {it.video_count !== undefined && <span className="mono text-[0.8125rem] text-ink-2">{exact(it.video_count)} videos</span>}
          </p>
        )}
        <p className="mono text-[0.8125rem] text-ink-2">{it.window}</p>
        <p className="border-t border-rule pt-2.5 font-serif text-[0.9375rem] leading-[1.45]">{it.why}</p>
        {it.script_available && it.myth_id ? (
          <Link href={`/desk/myth/${it.myth_id}/studio?from=calendar`} onClick={() => onReuse(it.myth_id!)} className="btn mt-1 justify-self-start">
            Reuse script
          </Link>
        ) : <p className="text-sm text-ink-2">Script unavailable</p>}
      </article>
    </li>
  );
}
