"use client";
import { useState } from "react";
import { useReceipts, type VoteAnswer as Answer } from "@/lib/hooks/useReceipts";
import { QuoteCard } from "@/components/QuoteCard";
import { SourceCard } from "@/components/SourceCard";
import { HarmChip } from "@/components/HarmChip";
import { FixtureBadge } from "@/components/FixtureBadge";
import { Qr } from "@/components/Qr";

const ANSWERS: [Answer, string][] = [["yes", "Yes"], ["no", "No"], ["already_knew", "I already knew"]];

export function Receipts({ id }: { id: string }) {
  const { data: d, from, loading, vote, voted, qrUrl: shareUrl } = useReceipts(id);
  const [videoOk, setVideoOk] = useState(true);

  if (loading) return <main className="mx-auto max-w-2xl px-5 py-10 text-lg text-slate-600">Loading…</main>;
  if (!d || !from)
    return (
      <main className="mx-auto max-w-2xl px-5 py-16">
        <h1 className="text-2xl font-semibold">This debunk isn&apos;t published yet.</h1>
        <p className="mt-3 text-lg text-slate-600">Check back soon.</p>
      </main>
    );

  return (
    <main className="mx-auto max-w-2xl space-y-10 bg-slate-50 px-5 py-10 text-lg">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">The myth</p>
          <HarmChip tier={d.myth.harm_tier} />
          <FixtureBadge from={from} />
        </div>
        <h1 className="text-3xl font-semibold leading-tight">{d.myth.claim}</h1>
        {d.certified_by_clinician && (
          <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 ring-1 ring-green-300">
            Certified by clinician
          </span>
        )}
      </header>

      {d.quoted.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What people are saying</h2>
          {d.quoted.map((v) => <QuoteCard key={v.oriane_id} video={v} />)}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">The verdict</h2>
        <p className="text-xl">{d.verdict}</p>
      </section>

      {d.video_url && videoOk && (
        <video controls playsInline src={d.video_url} onError={() => setVideoOk(false)} className="w-full rounded-xl bg-black" />
      )}

      <List title="What is true" items={d.what_is_true} />
      <List title="What is false" items={d.what_is_false} />

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Sources</h2>
        {d.sources.length ? (
          d.sources.map((s) => <SourceCard key={s.id} source={s} mythId={id} location="receipts" />)
        ) : (
          <p className="text-slate-600">No good source found</p>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold">Did this change your mind?</h2>
        {voted ? (
          <p className="text-slate-700">Thanks for telling us.</p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            {ANSWERS.map(([a, label]) => (
              <button key={a} onClick={() => vote(a)} className="min-h-14 flex-1 rounded-xl bg-blue-700 px-5 text-lg font-medium text-white active:bg-blue-800">
                {label}
              </button>
            ))}
          </div>
        )}
      </section>

      <footer className="flex flex-col items-center gap-2 pt-4 text-sm text-slate-500">
        <Qr url={shareUrl} size={128} />
        <p>Share these receipts</p>
      </footer>
    </main>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      <ul className="list-disc space-y-2 pl-6">
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </section>
  );
}
