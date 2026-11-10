import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { api, settle } from "@/lib/api";
import { exact } from "@/lib/format";
import { pendingOr, windowLabel } from "@/lib/view-model";
import { DataPulled } from "@/components/DataPulled";
import { LiveUnavailable } from "@/components/LiveUnavailable";
import { AudiencePanel } from "@/components/AudiencePanel";
import { QuoteCard } from "@/components/QuoteCard";
import { DebunkVideo } from "@/components/DebunkVideo";

// v2 signal band (design/preview/v2.html .band, .readout)
const GRATICULE =
  "bg-paper [background-image:repeating-linear-gradient(0deg,color-mix(in_srgb,var(--rule)_55%,transparent)_0_1px,transparent_1px_32px),repeating-linear-gradient(90deg,color-mix(in_srgb,var(--rule)_55%,transparent)_0_1px,transparent_1px_32px)]";
const BIG = "font-mono text-[clamp(1.75rem,1.4rem+1.4vw,2.5rem)] leading-[1.15] font-semibold tabular-nums [overflow-wrap:anywhere]";

function Readout({
  label,
  big,
  sub,
  placeholder,
  className = "",
}: {
  label: string;
  big: string;
  sub?: string;
  placeholder?: boolean;
  className?: string;
}) {
  return (
    <div className={`grid min-w-0 content-start gap-1 rounded-3xl border border-ink bg-paper px-[22px] py-5 ${className}`}>
      <dt className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-bold">
        {label}
        {placeholder && <span className="databadge">placeholder</span>}
      </dt>
      <dd className="m-0 grid gap-0.5">
        <span className={BIG}>{big}</span>
        {sub && <span className="mono text-[0.8125rem] text-ink-2">{sub}</span>}
      </dd>
    </div>
  );
}

const views = (r?: { views: number }) => pendingOr(r, (v) => exact(v.views));
const videos = (r: { videos: number } | undefined, win: string) => (r ? `${exact(r.videos)} videos, ${win}` : win);

/** One plain sentence: views of corrections per 100 views of the myth. */
function headline(myth: number | undefined, fix: number) {
  if (!myth) return "No posts pushing this myth were found in this window.";
  const per100 = Math.round((fix / myth) * 100);
  if (fix === 0) return `${exact(myth)} views went to posts pushing this myth. Posts correcting it got none in the same window.`;
  return `For every 100 views of posts pushing this myth, posts correcting it got ${per100 < 1 ? "less than 1" : exact(per100)}.`;
}

function Bar({ label, r, max, win, tone }: { label: string; r?: { views: number; videos: number }; max: number; win: string; tone: string }) {
  const pct = r && max ? Math.max((r.views / max) * 100, r.views ? 1 : 0) : 0;
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="font-bold">{label}</span>
        <span className={BIG.replace("text-[clamp(1.75rem,1.4rem+1.4vw,2.5rem)]", "text-[1.5rem]")}>{views(r)}</span>
      </div>
      <div className="h-4 overflow-hidden rounded-pill border border-ink bg-paper" aria-hidden="true">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="mono text-[0.8125rem] text-ink-2">{videos(r, win)}</span>
    </div>
  );
}

export default async function ImpactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [impact, myth] = await Promise.all([settle(api.impact(id)), settle(api.myth(id))]);
  if (!myth.ok && myth.status === 404) notFound(); // unknown myth id
  if (!impact.ok && impact.status === 404) return <main className="wrap py-10"><h1>Impact</h1><p>Response reach is pending for this myth.</p></main>;
  if (!impact.ok || !myth.ok) return <LiveUnavailable what="the impact numbers" />;
  const { data: d } = impact;
  const { data: m } = myth;
  if (d.myth_id !== id) return <main className="wrap py-10"><h1>Impact</h1><p>Response reach is pending for this myth.</p></main>;
  const win = `${windowLabel(d.window)}, ${d.window.to.slice(0, 4)}`;
  const o = d.our_debunk;
  const top = Math.max(d.myth_reach?.views ?? 0, d.response_reach?.views ?? 0, d.baseline_clinician?.views ?? 0);
  return (
    <main className="pt-10 min-[700px]:pt-16">
      <header className="wrap grid gap-3.5 pb-12">
        <p className="mono text-xs font-semibold text-ink-2">Reach · {m.title}</p>
        <h1 className="max-w-[24ch] text-[clamp(2rem,1.3rem+2.4vw,3.25rem)] leading-[1.02] font-extrabold tracking-[-0.03em] [font-stretch:92%] [font-variation-settings:'opsz'_96]">
          Are corrections reaching as many people as the <em className="kw">myth</em>?
        </h1>
        <p className="max-w-[40rem] text-[1.125rem] text-ink-2">{headline(d.myth_reach?.views, d.response_reach?.views ?? 0)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono text-sm text-ink-2">{win}</span>
          <DataPulled at={d.generated_at} />
        </div>
      </header>

      <section aria-label="Reach numbers" className={`border-y border-ink pt-14 pb-16 ${GRATICULE}`}>
        <div className="wrap grid gap-3.5">
          <div className="grid gap-5 rounded-3xl border border-ink bg-paper px-[22px] py-6">
            <Bar label="Posts pushing the myth" r={d.myth_reach} max={top} win={win} tone="bg-harmful-text" />
            <Bar label="Posts correcting it" r={d.response_reach} max={top} win={win} tone="bg-lime" />
            {d.baseline_clinician && <Bar label="Clinicians on the topic" r={d.baseline_clinician} max={top} win={win} tone="bg-ink" />}
          </div>
          <dl className="m-0 grid gap-3.5 min-[900px]:grid-cols-3">
            {d.hours_spike_to_first_response != null && (
              <Readout label="Hours from spike to first correction" big={exact(d.hours_spike_to_first_response)} />
            )}
            <AudiencePanel id={id} fallback={o} />
          </dl>
        </div>
      </section>

      <div className="wrap grid gap-6 pt-12 pb-20">
        {m.id === id && m.top_video && (
          <section aria-labelledby="media-h" className="grid gap-4">
            <h2 id="media-h" className="border-b border-ink pb-3 text-xl font-extrabold tracking-[-0.01em]">
              The myth and our response
            </h2>
            <div className="grid items-start gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_320px]">
              <QuoteCard video={m.top_video} />
              <Suspense fallback={null}>
                <DebunkVideo id={id} />
              </Suspense>
            </div>
          </section>
        )}
        {d.baseline_clinician && (
          <p className="max-w-[44rem] font-serif text-[1.0625rem] leading-normal text-ink-2">{d.baseline_clinician.note}</p>
        )}
        <p className="max-w-[44rem] font-serif text-xl leading-[1.4]">{d.note}</p>
        <Link
          href={`/desk/myth/${id}`}
          className="inline-flex min-h-11 items-center justify-self-start rounded-pill border border-ink px-5 font-semibold no-underline hover:bg-ink hover:text-paper"
        >
          Back to the myth
        </Link>
      </div>
    </main>
  );
}
