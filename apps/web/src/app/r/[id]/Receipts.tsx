"use client";
import { useState } from "react";
import { TACTICS } from "@/lib/tactics";
import { receiptVideoUrl } from "@/lib/api";
import { useReceipts, type VoteAnswer as Answer } from "@/lib/hooks/useReceipts";
import { QuoteCard } from "@/components/QuoteCard";
import { SourceCard } from "@/components/SourceCard";
import { HarmChip } from "@/components/HarmChip";
import { FixtureBadge } from "@/components/FixtureBadge";
import { Qr } from "@/components/Qr";

const ANSWERS: [Answer, string][] = [["yes", "Yes"], ["no", "No"], ["already_knew", "I already knew"]];

// v2 type roles (design/preview/v2.html: .section-h, .label, .facts h3, .facts li)
const SECTION_H =
  "font-extrabold text-[clamp(2rem,1.3rem+2.4vw,3.25rem)] leading-[1.02] tracking-[-0.03em] [font-stretch:92%] [font-variation-settings:'opsz'_96]";
const LABEL = "font-mono text-xs font-semibold text-ink-2";
const H2 = "border-b border-ink pb-2.5 text-xl font-extrabold tracking-[-0.01em] [font-variation-settings:'opsz'_32]";

export function Receipts({ id }: { id: string }) {
  const { data: d, from, loading, vote, voted, qrUrl: shareUrl } = useReceipts(id);
  const [videoOk, setVideoOk] = useState(true);

  if (loading)
    return (
      <main className="wrap py-10">
        <p className="text-lg text-ink-2">Loading the receipts</p>
      </main>
    );
  if (!d || !from)
    return (
      <main className="wrap py-16">
        <div className="mx-auto max-w-[46rem] space-y-3">
          <h1 className={SECTION_H}>This debunk isn&apos;t published yet.</h1>
          <p className="text-lg text-ink-2">Check back soon.</p>
        </div>
      </main>
    );

  const topic = d.myth.topic.charAt(0).toUpperCase() + d.myth.topic.slice(1);

  return (
    <main className="wrap pt-10 pb-20 min-[700px]:pt-16">
      <div className="mx-auto grid max-w-[46rem] min-w-0 gap-10">
        <header className="grid gap-3.5 max-[699px]:-order-2">
          <p className={LABEL}>The receipts</p>
          <h1 className={SECTION_H}>
            <Title title={d.myth.title} topic={d.myth.topic} />
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <HarmChip tier={d.myth.harm_tier} />
            <FixtureBadge from={from} />
            {d.certified_by_clinician && (
              <span className="inline-flex items-center rounded-pill border border-ink px-2.5 py-0.5 text-[0.8125rem] font-bold">
                Certified by clinician
              </span>
            )}
          </div>
          <p className="font-serif text-lg leading-normal text-ink-2">
            <span className="sr-only">The myth: </span>
            {d.myth.claim}
          </p>
        </header>

        {/* The debunk comes first: verdict, true or false, sources. The video follows them. */}
        <section className="grid gap-2" aria-labelledby="verdict-h">
          <h2 id="verdict-h" className={LABEL}>
            Verdict
          </h2>
          <p className="max-w-[36em] font-serif text-[clamp(1.375rem,1.1rem+0.9vw,1.75rem)] leading-[1.35] font-normal">
            {d.verdict}
          </p>
        </section>

        {(d.what_is_true.length > 0 || d.what_is_false.length > 0) && (
          <div className="grid gap-7 min-[900px]:grid-cols-2">
            <List title="What is true" items={d.what_is_true} />
            <List title="What is false" items={d.what_is_false} />
          </div>
        )}

        <section className="grid gap-3.5">
          <h2 className={H2}>Sources</h2>
          {d.sources.length ? (
            <ul className="m-0 grid list-none gap-3.5 p-0 min-[900px]:grid-cols-2">
              {d.sources.map((s) => (
                <li key={s.id} className="min-w-0">
                  <SourceCard source={s} mythId={id} location="receipts" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-2">No good source found</p>
          )}
        </section>

        <figure className="m-0 grid w-full max-w-[320px] gap-2.5">
          <div className="relative grid aspect-[9/16] place-items-center overflow-hidden rounded-frame bg-ink p-6 text-center text-paper">
            {d.video_url && videoOk ? (
              <video
                controls
                playsInline
                src={receiptVideoUrl(d.video_url)}
                onError={() => setVideoOk(false)}
                className="absolute inset-0 h-full w-full bg-ink object-contain"
              />
            ) : (
              <p className="text-xl font-bold">Video not ready</p>
            )}
          </div>
          <figcaption className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-semibold text-ink-2">
            {topic} debunk
            {d.video_url && videoOk && from === "fixture" && <span className="databadge">placeholder</span>}
          </figcaption>
        </figure>

        {d.quoted.length > 0 && (
          <section className="grid gap-3.5">
            <h2 className={H2}>What people are saying</h2>
            {d.quoted.map((v) => (
              <QuoteCard key={v.oriane_id} video={v} />
            ))}
          </section>
        )}

        <section className="grid gap-3.5" aria-labelledby="share-h">
          <h2 id="share-h" className={H2}>Before you share a health post</h2>
          <p className="text-ink-2">Posts like the ones above use the same few moves. Check for each one.</p>
          <ul className="m-0 grid list-none gap-3 p-0">
            {TACTICS.map((t) => (
              <li key={t.key} className="grid gap-0.5 border-l-2 border-ink pl-3">
                <span className="font-semibold">{t.name}</span>
                <span className="text-ink-2">{t.ask}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-5 rounded-3xl border border-ink p-5 min-[700px]:p-7" aria-labelledby="vote-h">
          <h2 id="vote-h" className="text-[clamp(1.5rem,1.2rem+1vw,2rem)] leading-[1.1] font-extrabold tracking-[-0.02em] [font-variation-settings:'opsz'_48]">
            Did this change your <em className="kw">mind</em>?
          </h2>
          {voted ? (
            <p role="status" className="font-serif text-xl">
              Thanks for telling us.
            </p>
          ) : (
            <div className="grid gap-3 min-[700px]:grid-cols-3">
              {ANSWERS.map(([a, label]) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => vote(a)}
                  className="min-h-14 rounded-pill border border-ink bg-paper px-6 text-lg font-bold text-ink hover:bg-ink hover:text-paper motion-safe:transition-transform motion-safe:active:scale-[0.97]"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </section>

        <footer className="grid justify-items-center gap-3 border-t border-ink pt-8 text-center">
          <div className="rounded-2xl border border-ink bg-white p-3">
            <Qr url={shareUrl} size={144} />
          </div>
          <p className="font-bold">Share these receipts</p>
        </footer>
      </div>
    </main>
  );
}

// v2 sets one word in bold italic serif: the word right after the topic ("Lymphatic drainage *detoxes* you").
export function Title({ title, topic }: { title: string; topic: string }) {
  const head = title.slice(0, topic.length);
  const [word, ...rest] = title.slice(topic.length).trimStart().split(" ");
  if (head.toLowerCase() !== topic.toLowerCase() || !word) return <>{title}</>;
  return (
    <>
      {head} <em className="kw">{word}</em>
      {rest.length > 0 && ` ${rest.join(" ")}`}
    </>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="min-w-0">
      <h2 className={H2}>{title}</h2>
      <ul className="m-0 list-none p-0">
        {items.map((t, i) => (
          <li key={i} className="border-b border-rule py-3 font-serif text-[1.0625rem] leading-normal">
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
}
