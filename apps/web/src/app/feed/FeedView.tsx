"use client";
import { useState } from "react";
import { useFeed } from "@/lib/hooks/useFeed";
import { canNameCreator, dataThroughLine, mythName, type FeedPost } from "@/lib/feed";
import { compact } from "@/lib/format";

const PLATFORM = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" } as const;
const SOURCE = { transcript: "transcript", caption: "caption", on_screen: "on-screen text" } as const;
const STANCE_CHIP = { promotes: "chip chip--harmful", debunks: "chip bg-lime text-ink", ad: "chip chip--false", unrelated: "chip chip--unproven", neutral: "chip chip--unproven" } as const;
const STANCE = { promotes: "Promotes", debunks: "Debunks", ad: "Ad", unrelated: "Unrelated", neutral: "Neutral" } as const;

const clock = (iso: string | null, none: string) =>
  iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : none;
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function FeedView() {
  const { posts, fresh, latest, loading, refreshing, error, refresh, showFresh } = useFeed();

  return (
    <main className="wrap grid gap-8 pt-10 pb-20 min-[700px]:pt-16">
      <header className="grid max-w-[46rem] gap-3.5">
        <h1 className="text-[clamp(2.75rem,1.5rem+3.4vw,4.75rem)] leading-[0.98] font-extrabold tracking-[-0.035em] [font-stretch:90%] [font-variation-settings:'opsz'_96]">
          Live <em className="kw">feed</em>
        </h1>
        <p className="text-lg text-ink-2">Health posts pulled from Oriane, with the exact words that matched.</p>
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
            <ol className="m-0 grid max-w-[40rem] list-none gap-5 p-0">
              {posts.map((p) => (
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

function PostCard({ post: p }: { post: FeedPost }) {
  const named = canNameCreator(p);
  return (
    <li className="flex min-w-0 gap-4 rounded-frame border border-ink p-4">
      <Thumb src={p.thumbnail_url} platform={p.platform} />
      <article className="grid min-w-0 flex-1 content-start gap-2.5">
        <div className="grid gap-0.5">
          <h2 className="truncate text-lg leading-[1.2] font-bold">{named && p.handle ? `@${p.handle}` : "Creator not named"}</h2>
          {named && p.display_name && <p className="truncate text-sm text-ink-2">{p.display_name}</p>}
        </div>
        <p className="mono text-[0.8125rem] text-ink-2">
          {PLATFORM[p.platform]}
          {p.views !== null && ` · ${compact(p.views)} views`}
          {p.published_at && ` · ${date(p.published_at)}`}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {p.label ? (
            <>
              {p.label.myth_id ? <span className="trend">{mythName(p.label.myth_id)}</span> : <span className="databadge">No myth matched</span>}
              <span className={STANCE_CHIP[p.label.stance]} title={`Labeled by ${p.label.model}`}>{STANCE[p.label.stance]}</span>
            </>
          ) : (
            <span className="databadge">Unlabeled</span>
          )}
        </div>
        <blockquote className="m-0 border-t border-rule pt-2.5 font-serif text-[0.9375rem] leading-[1.45]">
          &ldquo;{p.snippet}&rdquo;
          <footer className="mono mt-1.5 text-[0.75rem] text-ink-2">
            Source: {p.snippet_source ? SOURCE[p.snippet_source] : "not recorded"}. Matched &ldquo;{p.matched_query}&rdquo;
          </footer>
        </blockquote>
        {p.url ? (
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="justify-self-start font-semibold underline underline-offset-2">
            Open on {PLATFORM[p.platform]}
          </a>
        ) : (
          <p className="text-sm text-ink-2">Link unavailable</p>
        )}
      </article>
    </li>
  );
}
