"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { MythSummary, PublishedDebunk } from "@/contracts/types";
import { api, type Sourced } from "@/lib/api";
import { exact, pct } from "@/lib/format";
import { windowLabel } from "@/lib/view-model";
import { FixtureBadge } from "@/components/FixtureBadge";
import { HarmChip } from "@/components/HarmChip";
import { Title } from "../r/[id]/Receipts";

const TREND = { rising: "Rising", steady: "Steady", cooling: "Cooling", unknown: "Trend unknown" } as const;
const span = (w: MythSummary["window"]) => `${windowLabel(w)}, ${w.to.slice(0, 4)}`;
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// v2 .featured and .band: the first radar myth with a published debunk. Renders nothing until one is published.
export function Featured({ myths }: { myths: MythSummary[] }) {
  const [res, setRes] = useState<Sourced<PublishedDebunk> | null>(null);
  const ids = myths.map((m) => m.id).join(",");
  useEffect(() => {
    let live = true;
    // The fallback fixture carries its own id, so an id match means this myth is really published.
    Promise.all(myths.map((m) => api.published(m.id))).then((all) => {
      if (live) setRes(all.find((r, i) => r.data.id === myths[i].id) ?? null);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const d = res?.data;
  const myth = myths.find((m) => m.id === d?.id);
  if (!res || !d || !myth) return null;
  const publishers = [...new Set(d.sources.map((s) => s.publisher))];

  return (
    <>
      <section className="lp-featured" id="featured" aria-labelledby="featured-h">
        <div className="wrap">
          <div className="lp-stack">
            <div className="lp-stack-head">
              <h2 id="featured-h" className="lp-section-h">
                <Title title={d.myth.title} topic={d.myth.topic} />
              </h2>
              <div className="lp-row">
                <HarmChip tier={d.myth.harm_tier} />
                <FixtureBadge from={res.from} />
                {d.certified_by_clinician && <span className="databadge">Certified by clinician</span>}
              </div>
            </div>
            <div className="lp-verdict">
              <span className="mono lp-label">Verdict</span>
              <p>{d.verdict}</p>
            </div>
            {(d.what_is_true.length > 0 || d.what_is_false.length > 0) && (
              <div className="lp-facts">
                {(
                  [
                    ["What is true", d.what_is_true],
                    ["What is false", d.what_is_false],
                  ] as const
                ).map(
                  ([h, items]) =>
                    items.length > 0 && (
                      <div key={h}>
                        <h3>{h}</h3>
                        <ul>
                          {items.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      </div>
                    ),
                )}
              </div>
            )}
            {d.sources.length > 0 && (
              <div className="lp-sources">
                <h3>Sources</h3>
                <ul className="lp-source-list">
                  {d.sources.map((s) => (
                    <li key={s.id} className="lp-source">
                      <span className="mono lp-label">{s.publisher}</span>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.title}
                      </a>
                      <span className="mono lp-host">{host(s.url)}</span>
                      {s.excerpts.slice(0, 2).map((e, i) => (
                        <blockquote
                          key={i}
                          className="m-0 border-l-2 border-rule pl-3 font-serif text-[0.9375rem] leading-normal text-ink-2"
                        >
                          &ldquo;{e}&rdquo;
                        </blockquote>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link className="btn lp-receipts-link" href={`/r/${d.id}`}>
              Read the receipts
            </Link>
          </div>
        </div>
      </section>

      <section className="lp-signal" aria-labelledby="signal-h">
        <div className="wrap lp-signal-inner">
          <div className="lp-signal-head">
            <h2 id="signal-h">
              What the feed shows, and what the <em className="kw">sources</em> say
            </h2>
            <FixtureBadge from={res.from} />
          </div>
          <div
            className="lp-trace"
            role="img"
            aria-label="The claim line is dashed and stops short: it has no source. The sources line is solid and locks at the right."
          >
            <span className="lp-trace-label">Claim</span>
            <span className="lp-trace-line" aria-hidden="true">
              <span className="lp-dash" />
              <span className="lp-solid" />
              <span className="lp-lock" />
            </span>
            <span className="lp-trace-label">Sources</span>
          </div>
          <dl className="lp-readouts">
            <div className="lp-readout">
              <dt>Topic views</dt>
              <dd>
                <span className="lp-big">{exact(myth.topic_views)}</span>
                <span className="mono lp-sub">{span(myth.window)}</span>
              </dd>
            </div>
            <div className="lp-readout">
              <dt>Trend</dt>
              <dd>
                <span className="lp-big">
                  {TREND[myth.trend]}
                  {myth.trend !== "unknown" && myth.trend_pct !== undefined && ` ${pct(myth.trend_pct).replace("-", "−")}`}
                </span>
                <span className="mono lp-sub">
                  video count vs {myth.prev_window ? span(myth.prev_window) : "the previous window"}
                </span>
              </dd>
            </div>
            <div className="lp-readout">
              <dt>Sources</dt>
              <dd>
                <span className="lp-big">{d.sources.length}</span>
                <span className="mono lp-sub">{publishers.join(", ")}</span>
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  );
}
