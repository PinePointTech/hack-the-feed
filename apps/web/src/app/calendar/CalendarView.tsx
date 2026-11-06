"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Calendar, CalendarItem } from "@/contracts/types";
import { api, type Sourced } from "@/lib/api";
import { track } from "@/lib/track";
import { compact, exact } from "@/lib/format";
import { HarmChip } from "@/components/HarmChip";
import { TrendBadge } from "@/components/TrendBadge";
import { FixtureBadge } from "@/components/FixtureBadge";

export function CalendarView() {
  const [res, setRes] = useState<Sourced<Calendar> | null>(null);
  const viewed = useRef(false);

  useEffect(() => {
    api.calendar().then((r) => {
      setRes(r);
      if (viewed.current) return;
      viewed.current = true;
      track("Calendar Viewed", { week_of: r.data.week_of, item_count: r.data.this_week.length + r.data.watchlist.length });
    });
  }, []);

  if (!res) return <main className="mx-auto max-w-3xl px-5 py-10 text-lg text-slate-600">Loading…</main>;
  const { data, from } = res;
  return (
    <main className="mx-auto max-w-3xl space-y-10 px-5 py-10 text-lg">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">Myth calendar</h1>
          <FixtureBadge from={from} />
        </div>
        <p className="text-slate-600">Week of {data.week_of}</p>
      </header>
      <Section title="This week" items={data.this_week} fixture={from === "fixture"} />
      <Section title="Watchlist" items={data.watchlist} fixture={from === "fixture"} />
    </main>
  );
}

function Section({ title, items, fixture }: { title: string; items: CalendarItem[]; fixture: boolean }) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {items.length === 0 && <p className="text-slate-600">Nothing here yet.</p>}
      {items.map((it) => <Item key={it.topic} it={it} fixture={fixture} />)}
    </section>
  );
}

function Item({ it, fixture }: { it: CalendarItem; fixture: boolean }) {
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
          onClick={() => track("Script Reused", { myth_id: it.myth_id!, from: "calendar" })}
          className="inline-block text-blue-700 underline"
        >
          Reuse script
        </Link>
      )}
    </article>
  );
}
