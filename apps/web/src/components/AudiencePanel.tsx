"use client";
import { useEffect, useState } from "react";
import { useAudience } from "@/lib/hooks/useAudience";
import { exact } from "@/lib/format";

type OurDebunk = { views?: number; votes_yes?: number; votes_total?: number; source: string } | undefined;

const BIG = "font-mono text-[clamp(1.75rem,1.4rem+1.4vw,2.5rem)] leading-[1.15] font-semibold tabular-nums [overflow-wrap:anywhere]";
const CARD = "grid min-w-0 content-start gap-1 rounded-3xl border border-ink bg-paper px-[22px] py-5";
const sinceFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Figure({ label, big, sub }: { label: string; big: string; sub?: string }) {
  return (
    <div className={CARD}>
      <dt className="text-[0.9375rem] font-bold">{label}</dt>
      <dd className="m-0 grid gap-0.5">
        <span className={BIG}>{big}</span>
        {sub && <span className="mono text-[0.8125rem] text-ink-2">{sub}</span>}
      </dd>
    </div>
  );
}

function Ago({ at }: { at: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{Math.max(0, Math.round((now - Date.parse(at)) / 1000))}s ago</>;
}

const SPLIT = [
  { key: "yes", label: "Yes", color: "bg-ink" },
  { key: "no", label: "No", color: "bg-harmful-text" },
  { key: "already_knew", label: "Already knew", color: "bg-rule" },
] as const;

/** "Our debunk" figures plus the live Amplitude panel, as children of the impact page's figure list. */
export function AudiencePanel({ id, fallback }: { id: string; fallback: OurDebunk }) {
  const { stats, configured, loading, error, updatedAt } = useAudience(id);
  const v = stats?.votes;
  const views = stats ? exact(stats.receipts_views) : fallback?.views !== undefined ? exact(fallback.views) : "Pending";
  const votes = v ? `${v.yes} of ${v.total}` : fallback?.votes_yes !== undefined && fallback.votes_total !== undefined ? `${fallback.votes_yes} of ${fallback.votes_total}` : "Pending";
  const demoShare = stats && stats.receipts_views ? Math.round((stats.receipts_views_demo_qr / stats.receipts_views) * 100) : 0;

  return (
    <>
      <Figure label="Our debunk views" big={views} sub={stats ? "Receipts page views, live from Amplitude" : fallback ? `Source: ${fallback.source}` : undefined} />
      <Figure label="Votes: changed their mind" big={votes} sub="Voted yes on the receipts page" />

      <div className={`${CARD} gap-4 min-[900px]:col-span-3`} aria-live="polite">
        <dt className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.9375rem] font-bold">Live audience on the receipts page</span>
          {stats && updatedAt && (
            <span className="trend gap-1.5">
              <span className="h-2 w-2 rounded-full bg-lime ring-1 ring-ink" aria-hidden />
              Live from Amplitude, updated <Ago at={updatedAt} />
            </span>
          )}
        </dt>
        <dd className="m-0">
          {loading || (configured === null && !error) ? (
            <p className="mono text-sm text-ink-2">Checking Amplitude</p>
          ) : configured === false ? (
            <div className="grid gap-1">
              <p className="font-semibold">Connect Amplitude to see live audience numbers</p>
              <p className="text-sm text-ink-2">
                Add <code className="mono">AMPLITUDE_SECRET_KEY</code> to the Vercel project settings and to apps/web/.env.local. It stays on the server.
              </p>
            </div>
          ) : error || !stats || !v ? (
            <div className="grid gap-1">
              <p className="font-semibold">Amplitude is not answering right now</p>
              <p className="text-sm text-ink-2">Trying again every 10 seconds.</p>
            </div>
          ) : (
            <div className="grid gap-6">
              <div className="grid gap-6 min-[700px]:grid-cols-3">
                <div className="grid content-start gap-0.5">
                  <span className="text-sm font-bold">Receipts views</span>
                  <span className={BIG}>{exact(stats.receipts_views)}</span>
                  <span className="mono text-[0.8125rem] text-ink-2">
                    {exact(stats.receipts_views_demo_qr)} from the demo QR{stats.receipts_views ? ` (${demoShare}%)` : ""}
                  </span>
                </div>
                <div className="grid content-start gap-0.5">
                  <span className="text-sm font-bold">Votes</span>
                  <span className={BIG}>{exact(v.total)}</span>
                  <span className="mono text-[0.8125rem] text-ink-2">Did this change your mind?</span>
                </div>
                <div className="grid content-start gap-0.5">
                  <span className="text-sm font-bold">Source clicks</span>
                  <span className={BIG}>{exact(stats.source_clicks)}</span>
                  <span className="mono text-[0.8125rem] text-ink-2">Links opened from the receipts</span>
                </div>
              </div>
              <div className="grid gap-3">
                {v.total > 0 ? (
                  <div className="flex h-4 gap-0.5 overflow-hidden rounded-pill border border-ink" role="img" aria-label={`Yes ${v.yes}, no ${v.no}, already knew ${v.already_knew}`}>
                    {SPLIT.filter((s) => v[s.key] > 0).map((s) => (
                      <div key={s.key} className={s.color} style={{ width: `${(v[s.key] / v.total) * 100}%` }} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-2">No votes yet</p>
                )}
                <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm">
                  {SPLIT.map((s) => (
                    <li key={s.key} className="flex items-center gap-1.5">
                      <span className={`h-3 w-3 rounded-full border border-ink ${s.color}`} aria-hidden />
                      {s.label} <span className="mono">{v[s.key]}</span>
                    </li>
                  ))}
                  <li className="mono text-ink-2">Counting since {sinceFmt.format(new Date(stats.since))} PT</li>
                </ul>
              </div>
            </div>
          )}
        </dd>
      </div>
    </>
  );
}
