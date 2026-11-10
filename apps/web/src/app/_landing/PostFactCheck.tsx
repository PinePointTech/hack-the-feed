"use client";

import { useState } from "react";
import Link from "next/link";
import { maskHandles } from "@/lib/feed";

const VERDICTS = {
  no_claim: "No checkable claim found",
  insufficient: "Insufficient published evidence",
  support_found: "Supporting evidence found",
  contradiction_found: "Contradicting evidence found",
  mixed: "Mixed evidence found",
  qualified: "Published evidence adds important context",
} as const;

type FactCheck = {
  verdict: keyof typeof VERDICTS;
  claim: { quote: string; source: string } | null;
  findings: {
    title: string; publisher: string; url: string; excerpt: string;
    relation: "supports" | "contradicts" | "qualifies";
  }[];
  receipt_id: string | null;
};
type State = { status: "checking" } | { status: "error"; message: string } | { status: "done"; result: FactCheck };

export function PostFactCheck({ postId, topic, named }: { postId: string; topic: string; named: boolean }) {
  const [state, setState] = useState<State | null>(null);

  async function check() {
    setState({ status: "checking" });
    try {
      const response = await fetch("/api/fact-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId, topic }),
        signal: AbortSignal.timeout(50_000),
      });
      const body = await response.json();
      setState(response.ok ? { status: "done", result: body } : {
        status: "error", message: body.error ?? "Fact-checking failed. Try again.",
      });
    } catch {
      setState({ status: "error", message: "Fact-checking failed. Try again." });
    }
  }

  return (
    <div className="lp-post-check">
      {state?.status !== "done" && (
        <button className="btn" type="button" disabled={state?.status === "checking"} onClick={check}>
          {state?.status === "checking" ? "Checking post…" : state?.status === "error" ? "Retry fact-check" : "Fact-check this post"}
        </button>
      )}
      <div aria-live="polite">
        {state?.status === "checking" && <p>Reading the post and checking for published evidence…</p>}
        {state?.status === "error" && <p>{state.message}</p>}
        {state?.status === "done" && <FactCheckReport result={state.result} named={named} />}
      </div>
    </div>
  );
}

function FactCheckReport({ result, named }: { result: FactCheck; named: boolean }) {
  return (
    <section className="lp-post-report" aria-label="Fact-check result">
      <h3>{VERDICTS[result.verdict]}</h3>
      {result.claim && <p>{result.claim.source}: &ldquo;{named ? result.claim.quote : maskHandles(result.claim.quote)}&rdquo;</p>}
      {result.receipt_id
        ? <p><Link href={`/r/${result.receipt_id}`}>Read the published MyBuster review</Link></p>
        : result.claim && <p>Automated check of one statement using published research indexed by PubMed.</p>}
      {result.findings.map((finding) => (
        <article key={finding.url}>
          <p>{finding.publisher} · {finding.relation} the statement</p>
          <a href={finding.url} target="_blank" rel="noopener noreferrer">{finding.title}</a>
          <blockquote>&ldquo;{finding.excerpt}&rdquo;</blockquote>
        </article>
      ))}
    </section>
  );
}
