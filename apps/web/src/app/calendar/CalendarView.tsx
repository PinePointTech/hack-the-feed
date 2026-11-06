"use client";
import Link from "next/link";
import type { CalendarItem } from "@/contracts/types";
import { useCalendar } from "@/lib/hooks/useCalendar";
import { compact, exact } from "@/lib/format";
import { HarmChip } from "@/components/HarmChip";
import { TrendBadge } from "@/components/TrendBadge";
import { FixtureBadge } from "@/components/FixtureBadge";

export function CalendarView() {
  const { data, from, reuseScript } = useCalendar();

  if (!data || !from) return <main className="mx-auto max-w-3xl px-5 py-10 text-lg text-slate-600">Loading…</main>;
  return (
    <main className="mx-auto max-w-3xl space-y-10 px-5 py-10 text-lg">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">Myth calendar</h1>
          <FixtureBadge from={from} />
        </div>
        <p className="text-slate-600">Week of {data.week_of}</p>
      </header>
      <Section title="This week" items={data.this_week} fixture={from === "fixture"} onReuse={reuseScript} />
      <Section title="Watchlist" items={data.watchlist} fixture={from === "fixture"} onReuse={reuseScript} />
    </main>
  );
}

type Reuse = (mythId: string) => void;

function Section({ title, items, fixture, onReuse }: { title: string; items: CalendarItem[]; fixture: boolean; onReuse: Reuse }) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {items.length === 0 && <p className="text-slate-600">Nothing here yet.</p>}
      {items.map((it) => <Item key={it.topic} it={it} fixture={fixture} onReuse={onReuse} />)}
    </section>
  );
}

function Item({ it, fixture, onReuse }: { it: CalendarItem; fixture: boolean; onReuse: Reuse }) {
  return (
    <article className="space-y-2 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xl font-medium">{it.topic}</h3>
        {it.harm_tier && <HarmChip tier={it.harm_tier} />}
        {it.harm_tier && fixture && <span className="text-sm text-slate-500">placeholder</span>}
        {it.trend && <TrendBadge trend={it.trend} />}
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
          {it.basis === "curated" ? "Curated" : "Oriane trend"}
        </span>
      </div>
      <p className="text-sm text-slate-600">{it.window}</p>
      <p>{it.why}</p>
      {(it.video_count !== undefined || it.views !== undefined) && (
        <p className="text-sm text-slate-600">
          {it.video_count !== undefined && <span title={exact(it.video_count)}>{compact(it.video_count)} videos</span>}
          {it.video_count !== undefined && it.views !== undefined && " · "}
          {it.views !== undefined && <span title={exact(it.views)}>{compact(it.views)} views</span>}
        </p>
      )}
      {it.script_available && it.myth_id && (
        <Link
          href={`/r/${it.myth_id}`}
          onClick={() => onReuse(it.myth_id!)}
          className="inline-block text-blue-700 underline"
        >
          Reuse script
        </Link>
      )}
    </article>
  );
}
