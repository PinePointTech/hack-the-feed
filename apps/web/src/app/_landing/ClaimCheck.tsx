"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { matchClaim, type MythKey } from "./match";
import { compact } from "@/lib/format";

type LiveVideo = { thumbnail_url: string | null; url: string | null; views: number | null; platform: string; published_at: string | null; snippet: string };
type Live = { status: "loading" } | { status: "error"; message: string } | { status: "done"; total: number; videos: LiveVideo[] };

export function ClaimCheck({ myths }: { myths: MythKey[] }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "empty" | "missed">("idle");
  const [live, setLive] = useState<Live | null>(null);

  async function searchOriane(q: string) {
    setLive({ status: "loading" });
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const body = await res.json();
      setLive(res.ok ? { status: "done", total: body.total, videos: body.videos } : { status: "error", message: body.error ?? "Live search failed." });
    } catch {
      setLive({ status: "error", message: "Live search failed. Try again." });
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    if (!q) { setState("empty"); return; }
    const hit = matchClaim(q, myths);
    setState(hit ? "idle" : "missed");
    if (hit) router.push(`/desk/myth/${hit.id}`);
    else void searchOriane(q);
  }

  return (
    <>
      <form className="lp-search" role="search" onSubmit={onSubmit}>
        <label htmlFor="claim">Search reviewed claims</label>
        <div className="lp-field">
          <input
            id="claim"
            name="q"
            type="search"
            placeholder="Type a claim, like lymphatic drainage burns fat"
            autoComplete="off"
            onChange={() => { setState("idle"); setLive(null); }}
            aria-describedby="claim-search-state"
          />
          <button className="btn" type="submit">
            Check it
          </button>
        </div>
      </form>
      <div id="claim-search-state" className="lp-search-state" role="status">
        {state === "empty" && <p className="lp-search-msg">Enter the claim you want to check.</p>}
        {state === "missed" && (
          <>
            <p className="lp-search-msg">Not checked yet. We have not reviewed this claim.</p>
            {live && (
              <section className="lp-live" aria-label="Videos on Oriane making this claim">
                <h3>Videos on Oriane making this claim <span className="lp-live-tag">Live from Oriane</span></h3>
                {live.status === "loading" && <p>Searching Oriane...</p>}
                {live.status === "error" && <p>{live.message}</p>}
                {live.status === "done" && live.videos.length === 0 && <p>No matching videos on Oriane.</p>}
                {live.status === "done" && live.videos.length > 0 && (
                  <>
                    <p>{compact(live.total)} posts use these words, most viewed first. Keyword matches, not reviewed by us.</p>
                    <ul className="lp-live-list">
                      {live.videos.map((v, i) => (
                        <li key={v.url ?? i}>
                          {v.thumbnail_url && <img src={v.thumbnail_url} alt="" loading="lazy" width={96} height={128} />}
                          <div>
                            <p className="lp-live-meta">
                              {v.views !== null ? `${compact(v.views)} views` : "Views unknown"} · {v.platform}
                              {v.published_at ? ` · ${v.published_at.slice(0, 10)}` : ""}
                            </p>
                            {v.snippet && <p className="lp-live-snippet">&ldquo;{v.snippet}&rdquo;</p>}
                            {v.url && <a href={v.url} target="_blank" rel="noopener noreferrer">Open the post</a>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}
            <p className="lp-search-msg">Browse the claims we have checked.</p>
            <ul className="lp-quick" aria-label="Reviewed examples">
              {myths.map((m) => (
                <li key={m.id}>
                  <Link href={`/desk/myth/${m.id}?from=radar`}>{m.topic.charAt(0).toUpperCase() + m.topic.slice(1)}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
