import Link from "next/link";
import { api } from "@/lib/api";
import { FixtureBadge } from "@/components/FixtureBadge";
import { HarmChip } from "@/components/HarmChip";
import { TrendBadge } from "@/components/TrendBadge";
import { StanceBar } from "@/components/StanceBar";
import { QuoteCard } from "@/components/QuoteCard";
import { Stat } from "../../_components/Stat";
import { windowLabel } from "../../_components/window";
import { MythOpened } from "./_components/MythOpened";

const FROMS = ["radar", "calendar", "direct"] as const;
type From = (typeof FROMS)[number];

export default async function MythPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { id } = await params;
  const q = (await searchParams).from;
  const openedFrom: From = FROMS.includes(q as From) ? (q as From) : "direct";
  const { data: m, from } = await api.myth(id);
  const fixture = from === "fixture";

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-12">
      <MythOpened mythId={m.id} harmTier={m.harm_tier} trend={m.trend} from={openedFrom} dataSource={from} />
      <nav className="flex items-center justify-between gap-4">
        <Link href="/desk" className="text-blue-700 underline">
          Back to the radar
        </Link>
        <FixtureBadge from={from} />
      </nav>

      <header className="space-y-4">
        <p className="text-sm uppercase tracking-wide text-slate-500">The myth</p>
        <h1 className="text-4xl font-semibold leading-tight">{m.claim}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <HarmChip tier={m.harm_tier} />
          <TrendBadge trend={m.trend} pct={m.trend_pct} />
        </div>
        <p className="max-w-3xl text-lg text-slate-700">{m.harm_reason}</p>
      </header>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label="claim views" value={m.claim_views} />
          <Stat label="claim videos" value={m.claim_video_count} />
          <Stat label={`views on "${m.topic}"`} value={m.topic_views} />
          <Stat label={`videos on "${m.topic}"`} value={m.topic_video_count} />
        </div>
        <div className="space-y-1 text-sm text-slate-600">
          <p>{m.match_note}</p>
          <p>Data: Oriane, {windowLabel(m.window)}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Who is saying what</h2>
        <StanceBar counts={m.stance_counts} sampleSize={m.stance_sample_size} />
        {fixture && <p className="text-sm text-slate-600">Hand-labeled sample, placeholder until stance labels run.</p>}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Videos spreading the myth</h2>
        {m.videos.length === 0 ? (
          <p className="text-slate-600">No promoter videos found yet.</p>
        ) : (
          <ul className="space-y-4">
            {m.videos.map((v) => (
              <li key={v.oriane_id}>
                <QuoteCard video={v} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Counter voices</h2>
        {m.counter_voices.length === 0 ? (
          <p className="text-slate-600">Pending stance labels. None shown yet.</p>
        ) : (
          <ul className="space-y-4">
            {m.counter_voices.map((v) => (
              <li key={v.oriane_id}>
                <QuoteCard video={v} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {m.clinician_share?.note && (
        <aside className="space-y-2 rounded-2xl border border-blue-200 bg-blue-50 p-6">
          <h2 className="text-xl font-semibold">Clinicians in this topic</h2>
          <p className="text-lg">
            {m.clinician_share.video_pct}% of videos and {m.clinician_share.view_pct}% of views come from accounts that look
            like clinicians.
          </p>
          <p className="text-sm text-slate-700">{m.clinician_share.note}</p>
        </aside>
      )}

      <div>
        <Link
          href={`/desk/myth/${m.id}/studio`}
          className="inline-block rounded-lg bg-blue-700 px-6 py-4 text-xl font-medium text-white hover:bg-blue-800"
        >
          Make the debunk
        </Link>
      </div>
    </main>
  );
}
