"use client";
import { useState, type ReactNode } from "react";
import { useFeed } from "@/lib/hooks/useFeed";
import { canNameCreator, dataThroughLine, maskHandles, mythName, type FeedPost } from "@/lib/feed";
import { compact } from "@/lib/format";
import { postView, verdictOf, FILTERS, type Verdict } from "@/lib/label-why";
import Link from "next/link";

const PLATFORM = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" } as const;
// Red only for flagged posts; amber for a claim that is not flagged; lime only for a checked correction.
const VERDICT_CHIP: Record<Verdict, string> = {
  flagged: "chip chip--harmful", checked: "chip bg-lime text-ink", claim: "chip chip--false", corrects: "chip chip--unproven", no_claim: "chip chip--unproven", pending: "databadge",
};
const VERDICT_EDGE: Record<Verdict, string> = {
  flagged: "border-t-[6px] border-t-harmful-text", checked: "border-t-[6px] border-t-lime", claim: "", corrects: "", no_claim: "", pending: "",
};

/** Reel cards, as many columns as fit: about 5 on a wide screen, 2 on a phone. */
export const POST_GRID = "m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,13.5rem),1fr))] gap-4 p-0 min-[700px]:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]";

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
              Last pull {clock(latest.last_poll_at, "not yet")}, next pull {clock(latest.next_poll_at, "paused")}
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
            <ol className={POST_GRID}>
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

function Thumb({ src, platform, named }: { src: string | null; platform: FeedPost["platform"]; named: boolean }) {
  const [failed, setFailed] = useState(false);
  const box = "w-full rounded-t-frame border-b border-ink";
  // A face identifies a creator as much as a handle, so unnamed creators get no thumbnail, only a short band.
  if (!named || !src || failed)
    return (
      <div className={`${box} grid min-h-16 place-content-center gap-0.5 bg-rule px-3 py-2 text-center text-sm text-ink-2`}>
        <span>{PLATFORM[platform]}</span>
        {!named && <span className="text-[0.75rem]">Image not shown, creator not named</span>}
      </div>
    );
  // Remote CDN thumbnails come from three platforms, so next/image domains are not worth configuring here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`${box} aspect-[9/16] object-cover`} />;
}

/** One post as a vertical reel card: thumbnail on top, verdict and quote below. Grids lay these out several per row. */
export function PostCard({ post: p, children }: { post: FeedPost; children?: ReactNode }) {
  const named = canNameCreator(p);
  const v = postView(p, mythName);
  return (
    <li className={`flex min-w-0 flex-col overflow-hidden rounded-frame border border-ink bg-paper ${VERDICT_EDGE[v.verdict]}`}>
      <Thumb src={p.thumbnail_url} platform={p.platform} named={named} />
      <article className="grid min-w-0 flex-1 content-start gap-2 p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={VERDICT_CHIP[v.verdict]} title={p.label ? `Checked by ${p.label.model}` : undefined}>{v.title}</span>
          {v.selling && <span className="databadge">{v.selling}</span>}
        </div>
        {v.myth && <Link href={v.myth.href} className="trend justify-self-start underline-offset-2 hover:underline">Myth: {v.myth.name}</Link>}
        <p className="text-[0.875rem] leading-[1.4]">{v.detail}</p>
        <blockquote className="m-0 border-l-2 border-rule pl-2.5 font-serif text-[0.875rem] leading-[1.45]">
          <span className="line-clamp-5">&ldquo;{named ? v.quote.text : maskHandles(v.quote.text)}&rdquo;</span>
          <footer className="mt-1 font-sans text-[0.75rem] text-ink-2">{v.quote.from}</footer>
        </blockquote>
        {v.backedBy.length > 0 && (
          <div className="grid gap-1.5">
            <p className="text-[0.75rem] font-semibold">Backed by</p>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {v.backedBy.map((f) => (
                <li key={f.url} className="text-[0.75rem] leading-[1.45]">
                  <span className="line-clamp-3 font-serif">&ldquo;{f.excerpt}&rdquo;</span>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">{f.publisher}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {v.note && <p className="text-[0.75rem] text-ink-2">{v.note}</p>}
        <p className="mt-auto border-t border-rule pt-2 text-[0.75rem] text-ink-2">
          {named && p.handle ? `@${p.handle}` : "Creator not named"}
          {` · ${PLATFORM[p.platform]}`}
          {p.views !== null && ` · ${compact(p.views)} views`}
          {p.published_at && ` · ${date(p.published_at)}`}
        </p>
        {p.url ? (
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-self-start text-sm font-semibold underline underline-offset-2">
            Watch on {PLATFORM[p.platform]}
          </a>
        ) : (
          <p className="text-sm text-ink-2">Link unavailable</p>
        )}
        {children}
      </article>
    </li>
  );
}
