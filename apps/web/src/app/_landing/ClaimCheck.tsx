"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { matchClaim, type MythKey } from "./match";

export function ClaimCheck({ myths }: { myths: MythKey[] }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "empty" | "missed">("idle");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    if (!q) { setState("empty"); return; }
    const hit = matchClaim(q, myths);
    setState(hit ? "idle" : "missed");
    if (hit) router.push(`/desk/myth/${hit.id}`);
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
            onChange={() => setState("idle")}
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
            <p className="lp-search-msg">No reviewed match. You can edit your search or browse these reviewed examples.</p>
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
