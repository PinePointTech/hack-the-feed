import Link from "next/link";
import { api } from "@/lib/api";
import { FixtureBadge } from "@/components/FixtureBadge";
import { HarmChip } from "@/components/HarmChip";
import { TrendBadge } from "@/components/TrendBadge";
import { StanceBar } from "@/components/StanceBar";
import { QuoteCard } from "@/components/QuoteCard";
import { Stat } from "../../_components/Stat";
import { Placeholder } from "../../_components/Placeholder";
import { windowWithYear } from "../../_components/window";
import { MythOpened } from "./_components/MythOpened";

const H2 =
  "text-[1.75rem] leading-[1.1] font-extrabold tracking-[-0.02em] [font-variation-settings:'opsz'_48]";
const LABEL = "mono text-xs font-semibold text-ink-2";
const GRATICULE = "color-mix(in srgb, var(--rule) 55%, transparent)";

// v2 puts one keyword per headline in bold italic serif: here the topic phrase, when the claim contains it.
function accent(text: string, word: string) {
  const i = text.toLowerCase().indexOf(word.toLowerCase());
  if (i < 0 || !word) return text;
  return (
    <>
      {text.slice(0, i)}
      <em className="kw">{text.slice(i, i + word.length)}</em>
      {text.slice(i + word.length)}
    </>
  );
}

export default async function MythPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: m, from } = await api.myth(id);
  const fixture = from === "fixture";

  return (
    <main>
      <MythOpened mythId={m.id} harmTier={m.harm_tier} trend={m.trend} dataSource={from} />

      <div className="wrap grid gap-10 pt-8 pb-16 min-[1100px]:pt-12">
        <nav aria-label="Myth" className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/desk"
            className="inline-flex min-h-11 items-center rounded-pill border border-ink px-[18px] font-semibold no-underline hover:bg-ink hover:text-paper"
          >
            Back to the radar
          </Link>
          <FixtureBadge from={from} />
        </nav>

        <header className="grid max-w-[60rem] gap-6">
          <p className={LABEL}>The myth</p>
          <h1 className="text-[clamp(2rem,1.3rem+2.4vw,3.25rem)] leading-[1.04] font-extrabold tracking-[-0.03em] [font-stretch:92%] [font-variation-settings:'opsz'_96]">
            {accent(m.claim, m.topic)}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <HarmChip tier={m.harm_tier} />
            <TrendBadge trend={m.trend} pct={m.trend_pct} />
            {fixture && <Placeholder what="draft harm tier, claim and harm reason until the brain sets them" />}
          </div>
          <div className="grid gap-2">
            <p className={LABEL}>Why this tier</p>
            <p className="max-w-[36em] font-serif text-[clamp(1.25rem,1.05rem+0.7vw,1.625rem)] leading-[1.4]">
              {m.harm_reason}
            </p>
          </div>
        </header>
      </div>

      <section
        aria-labelledby="reach-h"
        className="border-y border-ink py-14 min-[700px]:py-16"
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, ${GRATICULE} 0 1px, transparent 1px 32px), repeating-linear-gradient(90deg, ${GRATICULE} 0 1px, transparent 1px 32px)`,
        }}
      >
        <div className="wrap grid gap-8">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <h2
              id="reach-h"
              className="text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] leading-[1.05] font-extrabold tracking-[-0.025em] [font-variation-settings:'opsz'_72]"
            >
              What the feed <em className="kw">shows</em>
            </h2>
            <span className="mono text-sm text-ink-2">{windowWithYear(m.window)}</span>
          </div>
          <dl className="m-0 grid grid-cols-1 gap-3.5 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-4">
            <Stat card label="Claim views" value={m.claim_views} />
            <Stat card label="Claim videos" value={m.claim_video_count} />
            <Stat card label={`Views on "${m.topic}"`} value={m.topic_views} />
            <Stat card label={`Videos on "${m.topic}"`} value={m.topic_video_count} />
          </dl>
          <div className="grid max-w-[60rem] gap-1.5 text-sm leading-[1.5] text-ink-2">
            <p>{m.match_note}</p>
            <p className="mono">Data: Oriane, {windowWithYear(m.window)}</p>
          </div>
        </div>
      </section>

      <div className="wrap grid gap-16 py-16 min-[700px]:py-20">
        <section aria-labelledby="stance-h" className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3 border-b border-ink pb-3">
            <h2 id="stance-h" className={H2}>
              Who is saying what
            </h2>
            {fixture && <Placeholder what="hand-labeled stance sample" />}
          </div>
          <StanceBar counts={m.stance_counts} sampleSize={m.stance_sample_size} />
          {fixture && <p className="text-sm text-ink-2">Hand-labeled sample, placeholder until stance labels run.</p>}
        </section>

        <section aria-labelledby="videos-h" className="grid gap-4">
          <h2 id="videos-h" className={`${H2} border-b border-ink pb-3`}>
            Videos spreading the myth
          </h2>
          {m.videos.length === 0 ? (
            <p className="text-ink-2">No promoter videos found yet.</p>
          ) : (
            <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 min-[900px]:grid-cols-2">
              {m.videos.map((v) => (
                <li key={v.oriane_id} className="min-w-0">
                  <QuoteCard video={v} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="counter-h" className="grid gap-4">
          <h2 id="counter-h" className={`${H2} border-b border-ink pb-3`}>
            Counter voices
          </h2>
          {m.counter_voices.length === 0 ? (
            <p className="text-ink-2">Pending stance labels. None shown yet.</p>
          ) : (
            <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 min-[900px]:grid-cols-2">
              {m.counter_voices.map((v) => (
                <li key={v.oriane_id} className="min-w-0">
                  <QuoteCard video={v} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {m.clinician_share?.note && (
          <aside aria-labelledby="clinician-h" className="grid max-w-[60rem] gap-3 rounded-3xl border border-ink px-6 py-6 min-[700px]:px-8">
            <h2 id="clinician-h" className="text-[1.25rem] font-extrabold tracking-[-0.01em] [font-variation-settings:'opsz'_32]">
              Clinicians in this topic
            </h2>
            <p className="font-serif text-[clamp(1.25rem,1.1rem+0.6vw,1.5rem)] leading-[1.4]">
              <span className="mono font-semibold">{m.clinician_share.video_pct}%</span> of videos and{" "}
              <span className="mono font-semibold">{m.clinician_share.view_pct}%</span> of views come from accounts that
              look like clinicians.
            </p>
            <p className="text-sm leading-[1.5] text-ink-2">{m.clinician_share.note}</p>
          </aside>
        )}

        <section aria-labelledby="debunk-h" className="grid justify-items-start gap-5 border-t border-ink pt-12">
          <h2
            id="debunk-h"
            className="text-[clamp(2rem,1.3rem+2.4vw,3.25rem)] leading-[1.02] font-extrabold tracking-[-0.03em] [font-stretch:92%] [font-variation-settings:'opsz'_96]"
          >
            Make a <em className="kw">debunk</em> for this myth
          </h2>
          <p className="text-[1.125rem] text-ink-2">The studio drafts a script from sources. AI drafts, people approve.</p>
          <Link href={`/desk/myth/${m.id}/studio`} className="btn">
            Make the debunk
          </Link>
        </section>
      </div>
    </main>
  );
}
