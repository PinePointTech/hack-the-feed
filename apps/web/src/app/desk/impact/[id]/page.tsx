import Link from "next/link";
import { api } from "@/lib/api";
import { compact, exact } from "@/lib/format";
import { pendingOr } from "@/lib/view-model";
import { FixtureBadge } from "@/components/FixtureBadge";

const Num = ({ n }: { n?: number }) =>
  n === undefined ? <>Pending</> : <span title={exact(n)}>{compact(n)}</span>;

function Stat({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div className="text-2xl font-semibold">{children}</div>
      {note && <p className="text-sm text-slate-600">{note}</p>}
    </div>
  );
}

export default async function ImpactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: d, from } = await api.impact(id);
  const r = d.response_reach;
  const b = d.baseline_clinician;
  const o = d.our_debunk;
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12 text-lg">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">Impact</h1>
          <FixtureBadge from={from} />
        </div>
        <p className="text-slate-600">
          {d.myth_id} · {d.window.from} to {d.window.to}
        </p>
      </header>

      <Stat label="Response ratio (response reach / myth reach)">
        {pendingOr(d.response_ratio, (n) => n.toFixed(2))}
      </Stat>

      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Myth reach" note="Stand-in from the claim search until stance labels run.">
          <Num n={d.myth_reach.videos} /> videos, <Num n={d.myth_reach.views} /> views
        </Stat>
        <Stat label="Response reach">
          {r ? <><Num n={r.videos} /> videos, <Num n={r.views} /> views</> : "Pending"}
        </Stat>
        <Stat label="Clinician baseline" note={b?.note}>
          {b ? <><Num n={b.videos} /> videos, <Num n={b.views} /> views</> : "Pending"}
        </Stat>
        <Stat label="Hours from spike to first response">
          {pendingOr(d.hours_spike_to_first_response)}
        </Stat>
        <Stat label="Our debunk" note={o ? `Source: ${o.source}` : undefined}>
          {o ? (
            <>
              <Num n={o.views} /> views,{" "}
              {o.votes_yes !== undefined && o.votes_total !== undefined ? `${o.votes_yes} of ${o.votes_total} voted yes` : "votes pending"}
            </>
          ) : (
            "Pending"
          )}
        </Stat>
      </div>

      <p className="text-slate-700">{d.note}</p>
      <Link href={`/desk/myth/${id}`} className="text-blue-700 underline">Back to the myth</Link>
    </main>
  );
}
