import Link from "next/link";
import { api } from "@/lib/api";
import { exact } from "@/lib/format";
import { isPlaceholder, sortMyths, windowLabel } from "@/lib/view-model";
import { FixtureBadge } from "@/components/FixtureBadge";
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
  const { data, from } = await api.radar();
  const myths = sortMyths(data.myths);
  const span = `${windowLabel(data.window)}, ${data.window.to.slice(0, 4)}`;
  const draft = from === "fixture" && ["title", "harm_tier"].some((f) => isPlaceholder(data, `myths[].${f}`));

  return (
    <main>
      <section className="wrap lp-hero" aria-labelledby="hero-h">
        <h1 id="hero-h" className="lp-headline">
          Find the health myth. Get the <em className="kw kw-mark">receipts</em>. Make the debunk.
        </h1>
        <div className="lp-hero-actions">
          <Link className="btn lp-btn-lg lp-btn-solid" href="/desk">
            See the myth radar
          </Link>
          <ClaimCheck myths={myths.map(({ id, title, topic, claim }) => ({ id, title, topic, claim }))} />
        </div>
      </section>

      <section className="wrap lp-feed" id="trending" aria-labelledby="feed-h">
        <div className="lp-feed-head">
          <h2 id="feed-h">Trends in the measured window</h2>
          <span className="mono lp-window">{span} · Harm tier, then claim views</span>
          <FixtureBadge from={from} />
        </div>
        {myths.length === 0 ? (
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
                  {draft && (
                    <span className="databadge" title="Title and harm tier are drafts until the brain sets them">
                      placeholder
                    </span>
                  )}
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
    </main>
  );
}
