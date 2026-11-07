"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { matchClaim, type MythKey } from "./match";
import { exact } from "@/lib/format";
import type { SearchResult, TopicAnalysisResult } from "../api/search/route";

type Search = { query: string } & (
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; result: SearchResult }
);

type Analysis =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; result: TopicAnalysisResult };

function TopicAnalysis({ query, result }: { query: string; result: SearchResult }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  async function analyze() {
    setAnalysis({ status: "loading" });
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&analyze=1`);
      const body = await response.json();
      setAnalysis(response.ok ? { status: "done", result: body }
        : { status: "error", message: body.error ?? "Topic analysis failed. Try again." });
    } catch {
      setAnalysis({ status: "error", message: "Topic analysis failed. Try again." });
    }
  }

  return (
    <section className="lp-topic-analysis" aria-label="Topic analysis">
      {analysis?.status !== "done" && (
        <button type="button" className="btn" onClick={analyze} disabled={analysis?.status === "loading"}>
          {analysis?.status === "loading" ? "Analyzing topic…" : analysis?.status === "error" ? "Retry analysis" : "Analyze topic"}
        </button>
      )}
      <div role="status">
        {analysis?.status === "loading" && (
          <p>Comparing matching posts from the last 30 complete days with the previous 30 days…</p>
        )}
        {analysis?.status === "error" && <p>{analysis.message}</p>}
        {analysis?.status === "done" && <AnalysisSummary search={result} result={analysis.result} />}
      </div>
    </section>
  );
}

function AnalysisSummary({ search, result }: { search: SearchResult; result: TopicAnalysisResult }) {
  const { total, totalKnown, views, interactions } = search;
  const { recent, previous } = result;
  const change = recent.posts === null || previous.posts === null ? null : recent.posts - previous.posts;

  return (
    <>
      <h3>Topic activity</h3>
      <dl className="lp-search-metrics">
        {[recent, previous].map((window) => (
          <div key={window.from}>
            <dt>Matching posts, {window.from} to {window.to} UTC</dt>
            <dd>{window.posts === null ? "Unavailable" : exact(window.posts)}</dd>
          </div>
        ))}
      </dl>
      {change !== null && <p>{change === 0 ? "The two periods had the same number of matches."
        : `${exact(Math.abs(change))} ${change > 0 ? "more" : "fewer"} matching posts in the latest period.`}</p>}
      <dl className="lp-search-metrics">
        <div><dt>{totalKnown ? "Matching posts across all dates" : "Posts returned"}</dt><dd>{exact(total)}</dd></div>
        {views !== null && <div><dt>Reported views across all matches</dt><dd>{exact(views)}</dd></div>}
        {interactions !== null && <div><dt>Reported interactions across all matches</dt><dd>{exact(interactions)}</dd></div>}
      </dl>
    </>
  );
}

function SearchResults({ query, result }: { query: string; result: SearchResult }) {
  const { terms, videos } = result;
  const platforms = new Map<string, number>();
  for (const video of videos) {
    const platform = video.platform === "unknown" ? "Unknown platform" : video.platform;
    platforms.set(platform, (platforms.get(platform) ?? 0) + 1);
  }

  return (
    <>
      <p>Search terms: {terms.join(", ")}.</p>
      {videos.length === 0 ? <p>No matching posts on Oriane.</p> : (
        <>
          <TopicAnalysis query={query} result={result} />
          <p>Showing {videos.length} of the most-viewed matches. Platforms in these results: {
            [...platforms].map(([platform, count]) => `${platform} (${count})`).join(", ")
          }.</p>
          <ul className="lp-live-list">
            {videos.map((video) => (
              <li key={video.id}>
                {video.thumbnail_url && <img src={video.thumbnail_url} alt="" loading="lazy" width={96} height={128} />}
                <div>
                  <p className="lp-live-meta">
                    {video.views === null ? "Views unknown" : `${exact(video.views)} views`} · {video.platform}
                    {video.published_at ? ` · ${video.published_at.slice(0, 10)}` : ""}
                  </p>
                  {video.snippet && <p className="lp-live-snippet">{video.snippet_source}: &ldquo;{video.snippet}&rdquo;</p>}
                  {video.url && <a href={video.url} target="_blank" rel="noopener noreferrer">Open the post</a>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export function ClaimCheck({ myths, children }: { myths: MythKey[]; children: ReactNode }) {
  const router = useRouter();
  const [search, setSearch] = useState<Search | null>(null);
  const [query, setQuery] = useState("");
  const request = useRef<AbortController | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    request.current?.abort();

    const reviewed = matchClaim(text, myths);
    if (reviewed) {
      router.push(`/desk/myth/${reviewed.id}`);
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setSearch({ query: text, status: "loading" });
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(text)}`, { signal: controller.signal });
      const body = await response.json();
      if (controller.signal.aborted) return;
      setSearch(response.ok
        ? { query: text, status: "done", result: body }
        : { query: text, status: "error", message: body.error ?? "Live search failed." });
    } catch {
      if (!controller.signal.aborted) {
        setSearch({ query: text, status: "error", message: "Live search failed. Try again." });
      }
    }
  }

  function clearSearch() {
    request.current?.abort();
    setQuery("");
    setSearch(null);
  }

  return (
    <main>
      <section className="wrap lp-hero" aria-labelledby="hero-h">
        <h1 id="hero-h" className="lp-headline">
          {search ? "Search health claims" : (
            <>Find the health myth. Get the <em className="kw kw-mark">receipts</em>. Make the debunk.</>
          )}
        </h1>
        <div className="lp-hero-actions">
          {!search && <Link className="btn lp-btn-lg lp-btn-solid" href="/desk">See the myth radar</Link>}
          <form className="lp-search" role="search" onSubmit={onSubmit}>
            <label htmlFor="claim">Search a health claim</label>
            <div className="lp-field">
              <input id="claim" type="search" value={query} required maxLength={120}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Type a claim, like lymphatic drainage burns fat" autoComplete="off" />
              <button className="btn" type="submit">Check it</button>
            </div>
          </form>
          {search && <button className="btn" type="button" onClick={clearSearch}>Back to reviewed claims</button>}
        </div>
      </section>
      {search ? (
        <section className="wrap lp-feed" aria-labelledby="search-results-h">
          <div className="lp-feed-head">
            <h2 id="search-results-h">Search results for &ldquo;{search.query}&rdquo;</h2>
            {search.status === "done" && <span className="lp-live-tag">Data from Oriane</span>}
          </div>
          <div className="lp-live" aria-live="polite">
            {search.status === "loading" && <p>Searching Oriane…</p>}
            {search.status === "error" && <p>{search.message}</p>}
            {search.status === "done" && <>
              <p>This claim has no reviewed verdict. Keyword matches can repeat, dispute, or simply mention it.</p>
              <SearchResults query={search.query} result={search.result} />
            </>}
          </div>
        </section>
      ) : children}
    </main>
  );
}
