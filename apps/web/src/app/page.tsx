import Link from "next/link";
import { api, settle } from "@/lib/api";
import { exact } from "@/lib/format";
import { sortMyths, windowLabel } from "@/lib/view-model";
import { DataPulled } from "@/components/DataPulled";
import { LiveUnavailableNote } from "@/components/LiveUnavailable";
import { HarmChip } from "@/components/HarmChip";
import { TrendBadge } from "@/components/TrendBadge";
import { ClaimCheck } from "./_landing/ClaimCheck";
import { Featured } from "./_landing/Featured";
import "./_landing/landing.css";

const STEPS = [
  ["Radar", "Myths ordered by harm tier, then claim views."],
  ["Myth page", "Exact quotes with timestamps and links."],
  ["Brief", "Verdict, what is true, what is false, sources."],
  ["Studio", "Pick a format and a hook. Every line is re-checked."],
  ["Video", "Record, edit, caption. On-screen text is checked."],
  ["Receipts", "A public page with the verdict and sources."],
  ["Calendar", "This week's myths, one week ahead."],
  ["Impact", "Response reach against myth reach."],
] as const;

export default async function Home() {
  const res = await settle(api.radar());
  const data = res.ok ? res.data : null;
  const myths = data ? sortMyths(data.myths) : [];
  const span = data ? `${windowLabel(data.window)}, ${data.window.to.slice(0, 4)}` : "";

  return (
    <ClaimCheck myths={myths}>
      <section className="wrap lp-feed" id="trending" aria-labelledby="feed-h">
        <div className="lp-feed-head">
          <h2 id="feed-h">Trends in the measured window</h2>
          {data && <span className="mono lp-window">{span} · Harm tier, then claim views</span>}
          {data && <DataPulled at={data.generated_at} />}
        </div>
        {!data ? (
          <LiveUnavailableNote what="the trends" />
        ) : myths.length === 0 ? (
          <p className="lp-note">No myths found in this window.</p>
        ) : (
          <ol className="lp-frames">
            {myths.map((m, i) => (
              <li key={m.id} className="lp-frame">
                <div className={`lp-poster lp-poster--${m.harm_tier}`} aria-hidden="true">
                  <span className="lp-frame-no">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="lp-frame-title">
                  <Link href={`/desk/myth/${m.id}?from=radar`}>{m.title}</Link>
                </h3>
                <p className="lp-claim">{m.claim}</p>
                <div className="lp-frame-tags">
                  <span className="chip">Harm: {m.harm_tier === "harmful" ? "Flagged" : "Not flagged"}</span>
                  {m.harm_tier !== "harmful" && <span>Verdict <HarmChip tier={m.harm_tier} /></span>}
                  <span>Trend <TrendBadge trend={m.trend} pct={m.trend_pct} /></span>
                </div>
                <p className="lp-views">
                  <span className="mono lp-num">{exact(m.topic_views)}</span>{" "}
                  <span className="lp-win">
                    topic views, {windowLabel(m.window)}, {m.window.to.slice(0, 4)}
                  </span>
                </p>
                <p className="lp-match">{m.match_note}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Featured myths={myths} />

      <section className="lp-band" aria-labelledby="creator-h">
        <div className="wrap lp-creator">
        <div className="lp-creator-head">
          <h2 id="creator-h" className="lp-section-h">
            Make a <em className="kw">debunk</em>, step by step
          </h2>
          <p>For creators and health clinicians. AI drafts, people approve.</p>
        </div>
        <ol className="lp-route">
          {STEPS.map(([name, text], i) => (
            <li key={name} className="lp-stop">
              <span className="lp-dot" aria-hidden="true">
                {i + 1}
              </span>
              <h3>{name}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
        <Link className="btn" href="/desk">
          Open Creator mode
        </Link>
        </div>
      </section>
    </ClaimCheck>
  );
}
