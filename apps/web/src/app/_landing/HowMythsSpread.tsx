import Link from "next/link";
import { canNameCreator, maskHandles, type FeedPost } from "@/lib/feed";
import { compact } from "@/lib/format";
import { lessons } from "@/lib/tactics";

const PLATFORM = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" } as const;

/** The pitch behind flagged posts: each tactic with its live count, a real example in the creator's words, and a question to ask. */
export function HowMythsSpread({ posts }: { posts: FeedPost[] }) {
  const { flagged, lessons: found } = lessons(posts);
  if (flagged === 0) return null;
  return (
    <section className="wrap grid gap-6 py-16" aria-labelledby="spread-h">
      <div className="grid max-w-[46rem] gap-3">
        <h2 id="spread-h" className="text-[clamp(1.75rem,1.2rem+1.6vw,2.5rem)] leading-[1.05] font-extrabold tracking-[-0.02em]">
          How health myths <em className="kw">sell</em> themselves
        </h2>
        <p className="text-lg text-ink-2">
          Of the {posts.length} newest posts in the feed, {flagged} {flagged === 1 ? "was" : "were"} flagged for pushing a
          health claim mainstream evidence does not support. These are the moves they use, counted by the words in each post. Learn them and you will
          spot the next one yourself.
        </p>
      </div>
      <ol className="m-0 grid list-none gap-6 p-0 min-[800px]:grid-cols-2">
        {found.filter((l) => l.example).map(({ tactic, count, example, quote }) => (
          <li key={tactic.key} className="grid content-start gap-3 rounded-frame border border-ink bg-paper p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-xl font-bold">{tactic.name}</h3>
              <span className="mono text-sm text-ink-2">{count} of {flagged} flagged posts</span>
            </div>
            {example && quote && (
              <blockquote className="m-0 border-l-2 border-harmful-text pl-3 font-serif text-[1rem] leading-[1.45]">
                <span className="line-clamp-4 [overflow-wrap:anywhere]">&ldquo;{canNameCreator(example) ? quote : maskHandles(quote)}&rdquo;</span>
                <footer className="mt-1 font-sans text-[0.8125rem] text-ink-2">
                  {canNameCreator(example) && example.handle ? `@${example.handle}` : "Creator not named"}
                  {example.views !== null && ` · ${compact(example.views)} views`}
                  {tactic.key === "selling" && " · this post also sells something"}
                  {example.url && (
                    <>
                      {" · "}
                      <a href={example.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                        Watch on {PLATFORM[example.platform]}
                      </a>
                    </>
                  )}
                </footer>
              </blockquote>
            )}
            <p className="font-semibold">Ask yourself: <span className="font-normal">{tactic.ask}</span></p>
          </li>
        ))}
      </ol>
      <Link href="/feed" className="btn justify-self-start">See every checked post</Link>
    </section>
  );
}
