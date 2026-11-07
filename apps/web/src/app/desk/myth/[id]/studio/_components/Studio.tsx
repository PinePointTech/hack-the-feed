"use client";
import Link from "next/link";
import type { Format, HookStyle, LineCheck } from "@/contracts/types";
import { useStudio } from "@/lib/hooks/useStudio";
import type { LineStatus, Ticks } from "@/lib/studio-logic";
import { FixtureBadge } from "@/components/FixtureBadge";
import { SourceCard } from "@/components/SourceCard";
import { SupportBadge } from "@/components/SupportBadge";
import { Checklist } from "@/components/Checklist";
import { Qr } from "@/components/Qr";
import { ModelCredits } from "@/components/ModelCredits";
import { QAReportView } from "./QAReportView";

const FORMATS: { value: Format; label: string }[] = [
  { value: "stitch", label: "Stitch" },
  { value: "duet", label: "Duet" },
  { value: "standalone", label: "Standalone" },
  { value: "no_camera", label: "No camera" },
];
const HOOK_STYLE: Record<HookStyle, string> = {
  question: "Question",
  myth_quote: "Myth quote",
  stat: "Stat",
  pov: "POV",
  stitch_reaction: "Stitch reaction",
};
// Projector state colors: red unsupported, amber weak, green supported. v2 has no green token, so it lives here.
const LINE_STYLE: Record<LineStatus, string> = {
  supported: "border-[#1f6b2e] bg-[#e3f2dc]",
  weak: "border-[#b86e00] bg-false-fill",
  unsupported: "border-harmful-text bg-harmful-fill",
  no_claim: "border-rule bg-paper",
  pending: "border-ink-2 border-dashed bg-paper",
};
const LINE_LABEL: Partial<Record<LineStatus, string>> = { no_claim: "No health claim", pending: "Checking" };
const CHECKS: { key: keyof Ticks; label: string }[] = [
  { key: "every_claim_has_source", label: "Every script claim has a source" },
  { key: "quotes_are_exact", label: "Quotes are exact" },
  { key: "targets_claim_not_person", label: "Targets the claim, not the person" },
  { key: "no_minors_or_illness_stories", label: "No minors or illness stories" },
  { key: "video_qa_passed", label: "Video QA passed" },
];
const STEPS = ["Brief", "Hooks", "Script", "Approval", "Video", "Publish"];

const Placeholder = () => <span className="databadge">placeholder</span>;
const pill =
  "inline-flex min-h-11 items-center justify-center rounded-pill border border-ink px-5 text-lg font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const h3 = "border-b border-ink pb-2.5 text-xl font-extrabold tracking-[-0.01em] md:text-2xl";
const card = "rounded-[24px] border border-ink p-5 md:p-6";
const Locked = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-[24px] border border-dashed border-ink-2 p-5 text-lg text-ink-2">{children}</p>
);

function Step({ n, done, children }: { n: number; done: boolean; children: React.ReactNode }) {
  return (
    <li
      id={`step-${n}`}
      className="relative grid scroll-mt-28 grid-cols-[36px_minmax(0,1fr)] gap-x-3 pb-16 after:absolute after:bottom-0 after:left-[17px] after:top-12 after:border-l-2 after:border-dashed after:border-ink last:pb-0 last:after:hidden md:grid-cols-[56px_minmax(0,1fr)] md:gap-x-8 md:pb-24 md:after:left-[27px] md:after:top-16"
    >
      <span
        aria-hidden="true"
        className={`relative z-[1] grid size-9 place-items-center rounded-full border-2 border-ink font-mono text-sm font-semibold md:size-14 md:text-xl ${
          done ? "bg-ink text-paper" : "bg-paper"
        }`}
      >
        {n}
      </span>
      <section aria-labelledby={`step-${n}-h`} className="min-w-0 space-y-8">
        <h2
          id={`step-${n}-h`}
          className="pt-0.5 text-[clamp(1.75rem,1.3rem+1.6vw,2.75rem)] font-extrabold leading-[1.05] tracking-[-0.025em] [font-variation-settings:'opsz'_72] md:pt-2"
        >
          <span className="sr-only">Step {n}: </span>
          {STEPS[n - 1]}
          {done && <span className="sr-only"> (done)</span>}
        </h2>
        {children}
      </section>
    </li>
  );
}

// Plain view: all behaviour lives in useStudio.
export function Studio({ mythId }: { mythId: string }) {
  const s = useStudio(mythId);
  const { brief, format, hookId, checkFrom, canApprove, published, qa, lines, approved } = s;
  const loading = s.briefLoading;
  const checks: Record<string, LineCheck | undefined> = Object.fromEntries(lines.map((l) => [l.id, l.check]));
  const ticks = s.checklist;
  const fixture = s.from === "fixture";
  const sourceName = (id?: string) => brief?.sources.find((x) => x.id === id)?.publisher;
  const receiptsPath = s.receiptsHref;
  const done = [
    !!brief,
    !!hookId,
    !!brief && lines.length > 0 && !lines.some((l) => l.status === "unsupported" || l.status === "pending"),
    approved,
    !!qa?.pass,
    !!published,
  ];

  return (
    <main className="wrap pb-24 pt-10 md:pt-14">
      <header className="grid gap-6 border-b border-ink pb-10">
        <Link href={`/desk/myth/${mythId}`} className="inline-flex min-h-11 items-center self-start justify-self-start rounded-pill border border-ink px-[18px] font-semibold no-underline hover:bg-ink hover:text-paper">
          Back to the myth
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-3">
            <h1 className="text-[clamp(2.75rem,1.5rem+3.4vw,4.75rem)] font-extrabold leading-[0.98] tracking-[-0.035em] [font-stretch:90%] [font-variation-settings:'opsz'_96]">
              Studio
            </h1>
            <p className="text-lg text-ink-2 md:text-xl">Pick a format and a hook. Every line is re-checked.</p>
          </div>
          {brief && <FixtureBadge from={s.from} />}
        </div>
        <nav aria-label="Studio steps">
          <ol className="flex flex-wrap gap-2">
            {STEPS.map((name, i) => (
              <li key={name}>
                <a
                  href={`#step-${i + 1}`}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-pill border border-ink py-1 pl-1.5 pr-4 font-semibold no-underline ${
                    done[i] ? "bg-ink text-paper" : "hover:bg-ink hover:text-paper"
                  }`}
                >
                  <span aria-hidden="true" className={`grid size-8 place-items-center rounded-full border font-mono text-sm ${done[i] ? "border-paper" : "border-ink"}`}>
                    {i + 1}
                  </span>
                  {name}
                  {done[i] && <span className="sr-only"> (done)</span>}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <ol className="pt-12 md:pt-16">
        <Step n={1} done={done[0]}>
          <div className="flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Format" className="flex flex-wrap gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  aria-pressed={format === f.value}
                  disabled={loading || approved}
                  onClick={() => {
                    s.setFormat(f.value);
                    if (brief) s.generateBrief(f.value);
                  }}
                  className={`${pill} ${format === f.value ? "bg-ink text-paper" : "bg-paper hover:bg-ink hover:text-paper"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button disabled={loading || approved} onClick={() => s.generateBrief(format)} className={`${pill} bg-paper`}>
              {brief ? "Generate again" : "Generate brief"}
            </button>
          </div>
          {loading && (
            <p className={`${card} text-lg`} role="status">
              Searching sources, drafting and checking claims. This can take up to 45 seconds.
            </p>
          )}
          {s.error && (
            <p role="alert" className="rounded-[24px] bg-harmful-fill p-5 text-lg font-semibold text-harmful-text">
              {s.error}
            </p>
          )}

          {brief && (
            <div className="grid gap-12">
              <div className="grid gap-3">
                <span className="font-mono text-sm font-semibold text-ink-2">Verdict</span>
                <p className="max-w-[36em] font-serif text-[clamp(1.5rem,1.2rem+1vw,2rem)] font-normal leading-[1.35]">{brief.verdict}</p>
                <ModelCredits models={brief.models} />
              </div>

              <div className="grid gap-8 lg:grid-cols-2">
                {[
                  { title: "What is true", items: brief.what_is_true },
                  { title: "What is false", items: brief.what_is_false },
                ].map((col) => (
                  <div key={col.title}>
                    <h3 className={h3}>{col.title}</h3>
                    <ul>
                      {col.items.map((t, i) => (
                        <li key={i} className="border-b border-rule py-3 font-serif text-lg leading-normal md:text-xl">
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="grid gap-5">
                <h3 className={h3}>Script claims</h3>
                <ul className="grid gap-4 lg:grid-cols-2">
                  {brief.claims.map((c) => (
                    <li key={c.id} className={`${card} grid content-start gap-3`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span title={`Engine: ${c.engine}`}>
                          <SupportBadge status={c.status} support={c.support} />
                        </span>
                        {fixture && <Placeholder />}
                      </div>
                      <p className="text-xl font-bold leading-snug">{c.text}</p>
                      {c.evidence.map((e, i) => (
                        <blockquote key={i} className="grid gap-1 border-l-2 border-ink pl-4">
                          <p className="font-serif text-lg leading-normal">&ldquo;{e.excerpt}&rdquo;</p>
                          <span className="font-mono text-sm text-ink-2">{sourceName(e.source_id) ?? e.source_id}</span>
                        </blockquote>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-5">
                <h3 className={h3}>Sources</h3>
                {brief.sources.length ? (
                  <ul className="grid gap-4 lg:grid-cols-2">
                    {brief.sources.map((x) => (
                      <li key={x.id} className="min-w-0">
                        <SourceCard source={x} mythId={mythId} location="studio" />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-lg text-ink-2">No good source found</p>
                )}
              </div>
            </div>
          )}
        </Step>

        <Step n={2} done={done[1]}>
          {brief ? (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {brief.hooks.map((h) => {
                const on = hookId === h.id;
                return (
                  <li key={h.id} className="grid">
                    <button
                      aria-pressed={on}
                      disabled={approved}
                      onClick={() => s.selectHook(h.id)}
                      className={`grid min-h-11 content-start gap-3 rounded-[24px] border border-ink p-5 text-left disabled:cursor-not-allowed md:p-6 ${
                        on ? "bg-ink text-paper" : "bg-paper enabled:hover:-translate-y-1 disabled:opacity-60"
                      } transition-transform duration-200 ease-v2 motion-reduce:transition-none`}
                    >
                      <span className="flex items-center justify-between gap-2 font-mono text-sm font-semibold">
                        {HOOK_STYLE[h.style] ?? h.style}
                        {on && <span className="rounded-pill bg-paper px-2.5 py-0.5 font-sans text-ink">Selected</span>}
                      </span>
                      <span className="text-xl font-bold leading-snug">{h.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Locked>The hooks appear when the brief is ready.</Locked>
          )}
        </Step>

        <Step n={3} done={done[2]}>
          {brief ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                <span className="rounded-pill border-2 border-[#1f6b2e] bg-[#e3f2dc] px-3 py-1 text-[#1f5a27]">Supported</span>
                <span className="rounded-pill border-2 border-[#b86e00] bg-false-fill px-3 py-1 text-false-text">Weak</span>
                <span className="rounded-pill border-2 border-harmful-text bg-harmful-fill px-3 py-1 text-harmful-text">Unsupported</span>
                <FixtureBadge from={checkFrom} />
              </div>
              <ol className="grid gap-4">
                {lines.map((l, i) => {
                  const c = checks[l.id];
                  return (
                    <li key={l.id} className={`grid gap-3 rounded-[24px] border-2 border-l-[10px] p-4 md:p-5 ${LINE_STYLE[l.status]}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-ink-2">{String(i + 1).padStart(2, "0")}</span>
                        {LINE_LABEL[l.status] && (
                          <span className="rounded-pill border border-ink-2 px-2.5 py-0.5 text-sm font-semibold text-ink-2" role={l.status === "pending" ? "status" : undefined}>
                            {LINE_LABEL[l.status]}
                          </span>
                        )}
                        {c?.has_claim && (
                          <span title={`Engine: ${c.engine}`}>
                            <SupportBadge status={c.status} support={c.support} />
                          </span>
                        )}
                        {c?.has_claim && checkFrom === "fixture" && <Placeholder />}
                      </div>
                      <textarea
                        rows={1}
                        name={`line-${l.id}`}
                        value={l.text}
                        readOnly={approved}
                        onChange={(e) => s.setLineText(l.id, e.target.value)}
                        aria-label={`Script line ${l.id}`}
                        className="min-h-14 w-full min-w-0 resize-none rounded-2xl border border-ink bg-paper px-4 py-3 text-lg text-ink [field-sizing:content] read-only:border-rule md:text-xl"
                      />
                      {c?.note && <p className="text-lg font-semibold">{c.note}</p>}
                      {(l.on_screen || l.source_id) && (
                        <dl className="grid gap-1 text-base">
                          {l.on_screen && (
                            <div className="flex flex-wrap gap-x-2">
                              <dt className="font-semibold text-ink-2">On screen</dt>
                              <dd className="min-w-0 font-mono">{l.on_screen}</dd>
                            </div>
                          )}
                          {l.source_id && (
                            <div className="flex flex-wrap gap-x-2">
                              <dt className="font-semibold text-ink-2">Cites</dt>
                              <dd>{sourceName(l.source_id) ?? l.source_id}</dd>
                            </div>
                          )}
                        </dl>
                      )}
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <Locked>The script appears when the brief is ready.</Locked>
          )}
        </Step>

        <Step n={4} done={done[3]}>
          {brief ? (
            <div className={`${card} grid max-w-3xl gap-6`}>
              <Checklist
                items={CHECKS.map((c) => ({
                  key: c.key,
                  label: c.label,
                  checked: ticks[c.key],
                  disabled: c.key !== "video_qa_passed" && approved,
                  note: c.key === "video_qa_passed" ? "Ticks itself when QA passes" : undefined,
                }))}
                onChange={(k, v) => {
                  if (ticks[k as keyof Ticks] !== v) s.toggle(k as keyof Ticks);
                }}
              />
              {s.hasUnsupported && (
                <p role="alert" className="rounded-2xl bg-harmful-fill p-4 text-lg font-semibold text-harmful-text">
                  A script line has no source. Fix it before you approve.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-4">
                <button
                  disabled={!canApprove}
                  onClick={s.approve}
                  className={`btn ${approved ? "border-[#1f6b2e] bg-[#1f6b2e] disabled:opacity-100" : ""}`}
                >
                  {approved ? "Approved" : "Approve script"}
                </button>
                <span className="text-lg font-semibold text-ink-2">AI drafts, you approve.</span>
              </div>
            </div>
          ) : (
            <Locked>The checklist appears when the brief is ready.</Locked>
          )}
        </Step>

        <Step n={5} done={done[4]}>
          {approved ? (
            <div className="grid max-w-3xl gap-6">
              <ol className="grid gap-4 text-lg">
                {[
                  <>
                    Copy the script.{" "}
                    <button onClick={s.copyScript} className={`${pill} ml-2 bg-paper hover:bg-ink hover:text-paper`}>
                      {s.copied ? "Copied" : "Copy script"}
                    </button>
                  </>,
                  <>
                    Open Compound (
                    <a href="https://compound.mov" target="_blank" rel="noopener noreferrer" className="underline">
                      compound.mov
                    </a>
                    ,{" "}
                    <a href="https://compound.mov/download" target="_blank" rel="noopener noreferrer" className="underline">
                      download
                    </a>
                    ) and record in 9:16.
                  </>,
                  <>Edit and caption in Compound.</>,
                  <>
                    Export the MP4 to <span className="font-mono text-base">apps/web/public/video/lymphatic-detox.mp4</span>.
                  </>,
                ].map((body, i) => (
                  <li key={i} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-baseline border-b border-rule pb-4">
                    <span className="font-mono text-sm font-semibold text-ink-2">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 [overflow-wrap:anywhere]">{body}</span>
                  </li>
                ))}
              </ol>
              <label className={`${card} grid gap-3`}>
                <span className="text-xl font-bold">Attach the exported MP4</span>
                <input
                  type="file"
                  name="video"
                  accept="video/mp4"
                  onChange={(e) => s.attachVideo(e.target.files?.[0] ?? null)}
                  className="block min-w-0 text-lg file:mr-4 file:min-h-11 file:cursor-pointer file:rounded-pill file:border file:border-solid file:border-ink file:bg-paper file:px-5 file:font-semibold file:text-ink"
                />
              </label>
              <button disabled={!s.video || s.qaRunning} onClick={s.runQA} className="btn justify-self-start">
                {s.qaRunning ? "Checking the video..." : "Run video QA"}
              </button>
              {qa && <QAReportView report={qa} placeholder={s.qaFrom === "fixture"} />}
            </div>
          ) : (
            <Locked>Approve the script to record and check the video.</Locked>
          )}
        </Step>

        <Step n={6} done={done[5]}>
          {!approved ? (
            <Locked>Approve the script to publish the receipts.</Locked>
          ) : published ? (
            <div className={`${card} flex flex-wrap items-center gap-8`}>
              <div className="grid justify-items-start gap-4">
                <Link href={receiptsPath} className="btn">
                  Open receipts
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  <FixtureBadge from={s.publishFrom} />
                  {published.certified_by_clinician && (
                    <span className="rounded-pill bg-[#e3f2dc] px-3 py-1 font-bold text-[#1f5a27]">Certified by clinician</span>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-ink bg-white p-3">
                <Qr url={`${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}${receiptsPath}?utm_source=demo_qr&utm_medium=qr`} size={160} />
              </div>
            </div>
          ) : (
            <button disabled={s.publishing} onClick={s.publish} className="btn">
              {s.publishing ? "Publishing..." : "Publish receipts"}
            </button>
          )}
        </Step>
      </ol>
    </main>
  );
}
