"use client";
import { useCandidates } from "@/lib/hooks/useCandidates";
import { LiveUnavailable } from "@/components/LiveUnavailable";
import { PostCard, POST_GRID } from "@/app/feed/FeedView";

export function ReviewView() {
  const { rows, loading, unavailable, busy, notice, confirm, reject, needsToken, saveToken, corrections, hide } = useCandidates();
  if (unavailable) return <LiveUnavailable what="the candidate myths" />;

  return (
    <main className="wrap grid gap-8 pt-10 pb-24 min-[1100px]:pt-14">
      <header className="grid max-w-[46rem] gap-4 border-b border-ink pb-6">
        <p className="mono text-xs font-semibold text-ink-2">Creator mode, review</p>
        <h1 className="text-[clamp(2.25rem,1.3rem+2.8vw,3.75rem)] leading-[1] font-extrabold tracking-[-0.03em] [font-stretch:90%] [font-variation-settings:'opsz'_96]">
          Review <em className="kw kw-mark">new myths</em>
        </h1>
        <p className="text-[1.125rem] text-ink-2">
          The labeler proposed these from live posts. A myth only joins the radar after you confirm it. Reject removes a proposal that is not a real myth.
        </p>
      </header>

      <p role="status" className="min-h-6 text-ink-2 empty:hidden">{notice}</p>

      {needsToken && (
        <label className="grid max-w-[24rem] gap-2 font-semibold">
          Reviewer token
          <input type="password" autoComplete="off" className="rounded-frame border border-ink px-3 py-2 font-normal"
            onChange={(e) => saveToken(e.target.value)} />
        </label>
      )}

      {loading ? (
        <p className="text-lg text-ink-2">Loading candidates</p>
      ) : rows.length === 0 ? (
        <p className="text-[1.125rem] text-ink-2">No new myths to review</p>
      ) : (
        <ol className="m-0 grid max-w-[40rem] list-none gap-5 p-0">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-3 rounded-frame border border-ink p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="text-xl font-bold capitalize">{r.title}</h2>
                <span className="mono text-sm text-ink-2">
                  {r.post_count} {r.post_count === 1 ? "post" : "posts"}
                </span>
              </div>
              <blockquote className="m-0 border-t border-rule pt-3 font-serif text-[0.9375rem] leading-[1.45]">
                &ldquo;{r.claim}&rdquo;
              </blockquote>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <button type="button" className="btn" onClick={() => confirm(r.id)} disabled={busy !== null}>
                  {busy === r.id ? "Working" : "Confirm"}
                </button>
                <button type="button" className="font-semibold underline underline-offset-2 disabled:opacity-50"
                  onClick={() => reject(r.id)} disabled={busy !== null}>
                  Reject
                </button>
                {r.source_url && (
                  <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
                    Open source post
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {corrections.length > 0 && (
        <section className="grid gap-4 border-t border-ink pt-8" aria-labelledby="featured-corrections">
          <div className="grid max-w-[46rem] gap-2">
            <h2 id="featured-corrections" className="text-2xl font-bold">Featured corrections</h2>
            <p className="text-ink-2">
              These passed the automatic check and show on the feed and myth pages. Hide one if it is wrong or should not be featured. Hiding cannot be undone here.
            </p>
          </div>
          <ol className={POST_GRID}>
            {corrections.map((p) => (
              <PostCard key={p.oriane_id} post={p}>
                <button type="button" className="btn justify-self-start" onClick={() => hide(p.oriane_id)} disabled={busy !== null}>
                  {busy === p.oriane_id ? "Working" : "Hide"}
                </button>
              </PostCard>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
