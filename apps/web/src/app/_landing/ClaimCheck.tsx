"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { matchClaim, type MythKey } from "./match";

// Keyword match against this week's radar only. No brain call, so nothing is invented.
export function ClaimCheck({ myths }: { myths: MythKey[] }) {
  const router = useRouter();
  const [missed, setMissed] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    if (!q) return;
    const hit = matchClaim(q, myths);
    setMissed(!hit);
    if (hit) router.push(`/desk/myth/${hit.id}`);
  }

  return (
    <>
      <form className="lp-search" role="search" onSubmit={onSubmit}>
        <label htmlFor="claim">Check a health claim</label>
        <div className="lp-field">
          <input
            id="claim"
            name="q"
            type="search"
            placeholder="Type a claim, like lymphatic drainage burns fat"
            autoComplete="off"
            onChange={() => setMissed(false)}
          />
          <button className="btn" type="submit">
            Check it
          </button>
        </div>
      </form>
      <div className="lp-search-state" role="status">
        {missed && (
          <>
            <p className="lp-search-msg">We haven&apos;t checked this claim yet. Try one of these.</p>
            <ul className="lp-quick" aria-label="Myths on the radar">
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
