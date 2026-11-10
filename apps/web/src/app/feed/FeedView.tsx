"use client";
import { useState } from "react";
import { useFeed } from "@/lib/hooks/useFeed";
import { canNameCreator, dataThroughLine, mythName, type FeedPost } from "@/lib/feed";
import { compact } from "@/lib/format";
import { postView, verdictOf, FILTERS, type Verdict } from "@/lib/label-why";
import Link from "next/link";

const PLATFORM = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" } as const;
// Red only for flagged posts; amber for a claim that is not flagged; lime only for a checked correction.
const VERDICT_CHIP: Record<Verdict, string> = {
  flagged: "chip chip--harmful", checked: "chip bg-lime text-ink", claim: "chip chip--false", corrects: "chip chip--unproven", no_claim: "chip chip--unproven", pending: "databadge",
};
const VERDICT_EDGE: Record<Verdict, string> = {
  flagged: "border-l-[6px] border-l-harmful-text", checked: "border-l-[6px] border-l-lime", claim: "", corrects: "", no_claim: "", pending: "",
};

const clock = (iso: string | null, none: string) =>
  iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : none;
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function FeedView() {
  const { posts, fresh, latest, loading, refreshing, error, refresh, showFresh } = useFeed();
  const [filter, setFilter] = useState<Verdict | "all">("all");
  const counts = posts.reduce<Record<string, number>>((n, p) => ({ ...n, [verdictOf(p.label)]: (n[verdictOf(p.label)] ?? 0) + 1 }), {});
  const checked = posts.length - (counts.pending ?? 0);
  // In All, checked posts keep the feed order and posts not checked yet go last, so verdicts come first.
  const shown = filter === "all"
    ? [...posts.filter((p) => p.label), ...posts.filter((p) => !p.label)]
    : posts.filter((p) => verdictOf(p.label) === filter);

  return (
    <main className="wrap grid gap-8 pt-10 pb-20 min-[700px]:pt-16">
      <header className="grid max-w-[46rem] gap-3.5">
        <h1 className="text-[clamp(2.75rem,1.5rem+3.4vw,4.75rem)] leading-[0.98] font-extrabold tracking-[-0.035em] [font-stretch:90%] [font-variation-settings:'opsz'_96]">
          Live <em className="kw">feed</em>
        </h1>
        <p className="text-lg text-ink-2">Health posts pulled from Oriane. Each post is checked for health claims, and the ones that push a claim mainstream evidence does not support are flagged.</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {latest && (
            <span className="mono text-sm text-ink-2">
              Last pull {clock(latest.last_poll_at, "not yet")}, next pull {clock(latest.next_poll_at, "not scheduled")}
            </span>
          )}
          {dataThroughLine(latest?.data_through) && <span className="mono text-sm text-ink-2">{dataThroughLine(latest?.data_through)}</span>}
          <button type="button" className="btn" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </header>

      <div aria-live="polite" className="sticky top-24 z-40 grid justify-items-center empty:hidden">
        {fresh.length > 0 && (
          <button
            type="button"
            onClick={() => {
              showFresh();
              window.scrollTo({ top: 0 });
            }}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-pill border border-ink bg-lime px-5 font-bold text-ink"
          >
            {fresh.length} new {fresh.length === 1 ? "post" : "posts"}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-lg text-ink-2">Pulling the latest posts</p>
      ) : error && !latest ? (
        <section className="grid max-w-[34rem] gap-3 rounded-frame border border-ink p-6" role="alert">
          <h2 className="text-xl font-bold">Live data unavailable{error.down ? ", the brain is not running" : ""}</h2>
          <p className="text-ink-2">
            {error.down ? "Start the brain and try again." : `The brain answered with an error: ${error.message}`}
          </p>
          <button type="button" className="btn justify-self-start" onClick={refresh} disabled={refreshing}>
            Try again
          </button>
        </section>
      ) : (
        <>
          {error && <p className="text-ink-2" role="status">Could not refresh. Showing the last pull.</p>}
          {posts.length === 0 ? (
            <p className="text-lg text-ink-2">No posts yet. The next pull will check again.</p>
          ) : (
            <section aria-label="Filter posts" className="grid max-w-[40rem] gap-3">
              <p className="text-[1.0625rem]">
                <strong>{counts.flagged ?? 0} flagged</strong> of {checked} checked {checked === 1 ? "post" : "posts"}
                {counts.pending ? <span className="text-ink-2">. {counts.pending} not checked yet.</span> : "."}
              </p>
              <div className="flex flex-wrap gap-2">
                {FILTERS.map((f) => {
                  const n = f.key === "all" ? posts.length : counts[f.key] ?? 0;
                  return (
                    <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} disabled={n === 0 && f.key !== "all"}
                      className={`inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-ink px-4 font-semibold disabled:opacity-40 ${filter === f.key ? "bg-ink text-paper" : "bg-paper"}`}>
                      {f.label} <span className="mono text-[0.8125rem]">{n}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {posts.length > 0 && (
            <ol className="m-0 grid max-w-[40rem] list-none gap-5 p-0">
              {shown.map((p) => (
                <PostCard key={p.oriane_id} post={p} />
              ))}
            </ol>
          )}
        </>
      )}
    </main>
  );
}

function Thumb({ src, platform }: { src: string | null; platform: FeedPost["platform"] }) {
  const [failed, setFailed] = useState(false);
  const box = "aspect-[9/16] w-[104px] shrink-0 self-start rounded-2xl border border-ink min-[700px]:w-[148px]";
  if (!src || failed)
    return <div className={`${box} grid place-items-center bg-rule text-center text-sm text-ink-2`}>{PLATFORM[platform]}</div>;
  // Remote CDN thumbnails come from three platforms, so next/image domains are not worth configuring here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`${box} object-cover`} />;
}

export function PostCard({ post: p }: { post: FeedPost }) {
  const named = canNameCreator(p);
  const v = postView(p, mythName);
  return (
    <li className={`flex min-w-0 gap-4 rounded-frame border border-ink p-4 ${VERDICT_EDGE[v.verdict]}`}>
      <Thumb src={p.thumbnail_url} platform={p.platform} />
      <article className="grid min-w-0 flex-1 content-start gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={VERDICT_CHIP[v.verdict]} title={p.label ? `Checked by ${p.label.model}` : undefined}>{v.title}</span>
          {v.selling && <span className="databadge">{v.selling}</span>}
          {v.myth && <Link href={v.myth.href} className="trend underline-offset-2 hover:underline">Myth: {v.myth.name}</Link>}
        </div>
        <p className="text-[0.9375rem] leading-[1.4]">{v.detail}</p>
        <blockquote className="m-0 border-l-2 border-rule pl-3 font-serif text-[0.9375rem] leading-[1.45]">
          &ldquo;{v.quote.text}&rdquo;
          <footer className="mt-1 font-sans text-[0.8125rem] text-ink-2">{v.quote.from}</footer>
        </blockquote>
        {v.backedBy.length > 0 && (
          <div className="grid gap-1.5">
            <p className="text-[0.8125rem] font-semibold">Backed by</p>
            <ul className="m-0 grid list-none gap-2 p-0">
              {v.backedBy.map((f) => (
                <li key={f.url} className="text-[0.8125rem] leading-[1.45]">
                  <span className="font-serif">&ldquo;{f.excerpt}&rdquo;</span>{" "}
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">{f.publisher}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {v.note && <p className="text-[0.8125rem] text-ink-2">{v.note}</p>}
        <p className="border-t border-rule pt-2 text-[0.8125rem] text-ink-2">
          {named && p.handle ? `@${p.handle}` : "Creator not named"}
          {` · ${PLATFORM[p.platform]}`}
          {p.views !== null && ` · ${compact(p.views)} views`}
          {p.published_at && ` · ${date(p.published_at)}`}
        </p>
        {p.url ? (
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="justify-self-start font-semibold underline underline-offset-2">
            Watch on {PLATFORM[p.platform]}
          </a>
        ) : (
          <p className="text-sm text-ink-2">Link unavailable</p>
        )}
      </article>
    </li>
  );
}
