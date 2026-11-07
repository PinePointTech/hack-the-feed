import Link from "next/link";
import { Suspense } from "react";
import { api } from "@/lib/api";
import { exact } from "@/lib/format";
import { pendingOr, windowLabel } from "@/lib/view-model";
import { FixtureBadge } from "@/components/FixtureBadge";
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

export default async function ImpactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ data: d, from }, { data: m }] = await Promise.all([api.impact(id), api.myth(id)]);
  if (d.myth_id !== id) return <main className="wrap py-10"><h1>Impact</h1><p>Response reach is pending for this myth.</p></main>;
  const win = `${windowLabel(d.window)}, ${d.window.to.slice(0, 4)}`;
  const o = d.our_debunk;
  const fixture = from === "fixture";
  return (
    <main className="pt-10 min-[700px]:pt-16">
      <header className="wrap grid gap-3.5 pb-12">
        <p className="mono text-xs font-semibold text-ink-2">Impact · {d.myth_id}</p>
        <h1 className="max-w-[20ch] text-[clamp(2rem,1.3rem+2.4vw,3.25rem)] leading-[1.02] font-extrabold tracking-[-0.03em] [font-stretch:92%] [font-variation-settings:'opsz'_96]">
          Response reach against <em className="kw">myth</em> reach
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono text-sm text-ink-2">{win}</span>
          <FixtureBadge from={from} />
        </div>
      </header>

      <section aria-label="Impact numbers" className={`border-y border-ink pt-[72px] pb-20 ${GRATICULE}`}>
        <dl className="wrap grid gap-3.5 min-[900px]:grid-cols-3">
          <Readout
            className="min-[900px]:col-span-3"
            label="North star: response ratio"
            big={pendingOr(d.response_ratio, (n) => n.toFixed(2))}
            sub="Response reach views divided by myth reach views"
          />
          <Readout
            label="Myth reach views"
            big={views(d.myth_reach)}
            sub={fixture ? `${videos(d.myth_reach, win)}. Example from the claim search.` : videos(d.myth_reach, win)}
            placeholder={fixture}
          />
          <Readout
            label="Response reach views"
            big={views(d.response_reach)}
            sub={d.response_reach ? videos(d.response_reach, win) : "Response reach is pending for this myth."}
          />
          <Readout
            label="Clinician baseline views"
            big={views(d.baseline_clinician)}
            sub={videos(d.baseline_clinician, win)}
          />
          <Readout
            label="Hours from spike to first response"
            big={pendingOr(d.hours_spike_to_first_response)}
          />
          <AudiencePanel id={id} fallback={o} />
        </dl>
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
