"use client";
import Link from "next/link";
import type { Format, LineCheck } from "@/contracts/types";
import { useStudio } from "@/lib/hooks/useStudio";
import type { LineStatus, Ticks } from "@/lib/studio-logic";
import { FixtureBadge } from "@/components/FixtureBadge";
import { SourceCard } from "@/components/SourceCard";
import { SupportBadge } from "@/components/SupportBadge";
import { Checklist } from "@/components/Checklist";
import { Qr } from "@/components/Qr";
import { QAReportView } from "./QAReportView";

const FORMATS: { value: Format; label: string }[] = [
  { value: "stitch", label: "Stitch" },
  { value: "duet", label: "Duet" },
  { value: "standalone", label: "Standalone" },
  { value: "no_camera", label: "No camera" },
];
const LINE_STYLE: Record<LineStatus, string> = {
  supported: "border-green-400 bg-green-50",
  weak: "border-amber-400 bg-amber-50",
  unsupported: "border-red-400 bg-red-50",
  no_claim: "border-slate-200 bg-white",
  pending: "border-slate-200 bg-white",
};
const CHECKS: { key: keyof Ticks; label: string }[] = [
  { key: "every_claim_has_source", label: "Every script claim has a source" },
  { key: "quotes_are_exact", label: "Quotes are exact" },
  { key: "targets_claim_not_person", label: "Targets the claim, not the person" },
  { key: "no_minors_or_illness_stories", label: "No minors or illness stories" },
  { key: "video_qa_passed", label: "Video QA passed" },
];

const Placeholder = () => <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">placeholder</span>;
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-4">
    <h2 className="text-2xl font-semibold">{title}</h2>
    {children}
  </section>
);

// Plain view: all behaviour lives in useStudio.
export function Studio({ mythId }: { mythId: string }) {
  const s = useStudio(mythId);
  const { brief, format, hookId, checkFrom, canApprove, published, qa } = s;
  const loading = s.briefLoading;
  const briefFrom = s.from;
  const approved = s.approved;
  const lines = s.lines;
  const checks: Record<string, LineCheck | undefined> = Object.fromEntries(lines.map((l) => [l.id, l.check]));
  const ticks = s.checklist;
  const hasRed = s.hasUnsupported;
  const file = s.video;
  const qaRunning = s.qaRunning;
  const publishing = s.publishing;
  const generate = s.generateBrief;

  const fixture = briefFrom === "fixture";
  const sourceName = (id?: string) => brief?.sources.find((s) => s.id === id)?.publisher;
  const receiptsPath = s.receiptsHref;

  return (
    <main className="mx-auto max-w-6xl space-y-12 px-6 py-10 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href={`/desk/myth/${mythId}`} className="text-blue-700 underline">Back to the myth</Link>
          <h1 className="mt-2 text-4xl font-semibold">Studio</h1>
        </div>
        {brief && <FixtureBadge from={briefFrom} />}
      </header>

      <Section title="1. Brief">
        <div className="flex flex-wrap items-center gap-3">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              disabled={loading || !!approved}
              onClick={() => {
                s.setFormat(f.value);
                if (brief) generate(f.value);
              }}
              className={`rounded-full px-4 py-2 text-lg ring-1 disabled:opacity-50 ${
                format === f.value ? "bg-blue-700 text-white ring-blue-700" : "bg-white ring-slate-300"
              }`}
            >
              {f.label}
            </button>
          ))}
          <button
            disabled={loading || !!approved}
            onClick={() => generate(format)}
            className="rounded-lg bg-blue-700 px-5 py-2 text-lg font-medium text-white disabled:opacity-50"
          >
            {brief ? "Generate again" : "Generate brief"}
          </button>
        </div>
        {loading && (
          <p className="rounded-xl bg-slate-100 p-5 text-lg text-slate-700" role="status">
            Searching sources, drafting and checking claims. This can take up to 45 seconds.
          </p>
        )}
        {s.error && <p role="alert" className="text-red-800">{s.error}</p>}
      </Section>

      {brief && (
        <div className="grid gap-12 lg:grid-cols-2">
          <div className="space-y-10">
            <Section title="What the sources say">
              <p className="text-xl leading-relaxed">{brief.verdict}</p>
              <div>
                <h3 className="text-lg font-semibold text-green-800">What is true</h3>
                <ul className="mt-2 list-disc space-y-1 pl-6 text-lg">{brief.what_is_true.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-800">What is false</h3>
                <ul className="mt-2 list-disc space-y-1 pl-6 text-lg">{brief.what_is_false.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            </Section>

            <Section title="Script claims">
              {brief.claims.map((c) => (
                <article key={c.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span title={`Engine: ${c.engine}`}><SupportBadge status={c.status} support={c.support} /></span>
                    {fixture && <Placeholder />}
                  </div>
                  <p className="text-lg">{c.text}</p>
                  {c.evidence.map((e, i) => (
                    <blockquote key={i} className="border-l-4 border-slate-200 pl-3 text-slate-700">
                      &ldquo;{e.excerpt}&rdquo; <span className="text-sm text-slate-500">({sourceName(e.source_id) ?? e.source_id})</span>
                    </blockquote>
                  ))}
                </article>
              ))}
            </Section>

            <Section title="Sources">
              {brief.sources.length ? (
                brief.sources.map((s) => <SourceCard key={s.id} source={s} mythId={mythId} location="studio" />)
              ) : (
                <p className="text-lg text-slate-700">No good source found</p>
              )}
            </Section>
          </div>

          <div className="space-y-10">
            <Section title="2. Hooks">
              <div className="grid gap-3">
                {brief.hooks.map((h) => (
                  <button
                    key={h.id}
                    disabled={!!approved}
                    onClick={() => s.selectHook(h.id)}
                    className={`rounded-xl p-4 text-left ring-1 disabled:opacity-60 ${
                      hookId === h.id ? "bg-blue-50 ring-2 ring-blue-700" : "bg-white ring-slate-200"
                    }`}
                  >
                    <span className="text-sm text-slate-500">{h.style.replace("_", " ")}</span>
                    <p className="text-lg">{h.text}</p>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="3. Script">
              <div className="flex items-center gap-2"><FixtureBadge from={checkFrom} /></div>
              <ol className="space-y-4">
                {lines.map((l) => {
                  const c = checks[l.id];
                  return (
                    <li key={l.id} className={`space-y-2 rounded-xl border-2 p-4 ${LINE_STYLE[l.status]}`}>
                      <input
                        name={`line-${l.id}`}
                        value={l.text}
                        readOnly={!!approved}
                        onChange={(e) => s.setLineText(l.id, e.target.value)}
                        aria-label={`Script line ${l.id}`}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-lg"
                      />
                      {l.on_screen && <p className="text-sm text-slate-600">On screen: {l.on_screen}</p>}
                      {l.source_id && <p className="text-sm text-slate-600">Cites: {sourceName(l.source_id) ?? l.source_id}</p>}
                      {c && (
                        <div className="flex flex-wrap items-center gap-2">
                          {c.has_claim && <span title={`Engine: ${c.engine}`}><SupportBadge status={c.status} support={c.support} /></span>}
                          {c.has_claim && checkFrom === "fixture" && <Placeholder />}
                          {c.note && <span className="text-slate-700">{c.note}</span>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </Section>
          </div>
        </div>
      )}

      {brief && (
        <Section title="4. Approval">
          <Checklist
            items={CHECKS.map((c) => ({
              key: c.key,
              label: c.label,
              checked: ticks[c.key],
              disabled: c.key !== "video_qa_passed" && !!approved,
              note: c.key === "video_qa_passed" ? "Ticks itself when QA passes" : undefined,
            }))}
            onChange={(k, v) => { if (ticks[k as keyof Ticks] !== v) s.toggle(k as keyof Ticks); }}
          />
          {hasRed && <p className="text-red-800">A script line has no source. Fix it before you approve.</p>}
          <div className="flex flex-wrap items-center gap-4">
            <button
              disabled={!canApprove}
              onClick={s.approve}
              className="rounded-lg bg-blue-700 px-5 py-2 text-lg font-medium text-white disabled:opacity-50"
            >
              {approved ? "Approved" : "Approve script"}
            </button>
            <span className="text-slate-600">AI drafts, you approve.</span>
          </div>
        </Section>
      )}

      {approved && (
        <Section title="5. Video">
          <ol className="list-decimal space-y-2 pl-6 text-lg">
            <li>
              Copy the script.{" "}
              <button onClick={s.copyScript} className="ml-2 rounded-lg px-4 py-1 ring-1 ring-slate-300">
                {s.copied ? "Copied" : "Copy script"}
              </button>
            </li>
            <li>
              Open Compound (<a href="https://compound.mov" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">compound.mov</a>,{" "}
              <a href="https://compound.mov/download" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">download</a>) and record in 9:16.
            </li>
            <li>Edit and caption in Compound.</li>
            <li>Export the MP4 to apps/web/public/video/lymphatic-detox.mp4.</li>
          </ol>
          <label className="block space-y-2">
            <span className="text-lg">Attach the exported MP4</span>
            <input type="file" name="video" accept="video/mp4" onChange={(e) => s.attachVideo(e.target.files?.[0] ?? null)} className="block text-lg" />
          </label>
          <button
            disabled={!file || qaRunning}
            onClick={s.runQA}
            className="rounded-lg bg-blue-700 px-5 py-2 text-lg font-medium text-white disabled:opacity-50"
          >
            {qaRunning ? "Checking the video..." : "Run video QA"}
          </button>
          {qa && <QAReportView report={qa} placeholder={s.qaFrom === "fixture"} />}
        </Section>
      )}

      {approved && (
        <Section title="6. Publish">
          {published ? (
            <div className="flex flex-wrap items-center gap-8">
              <div className="space-y-2">
                <Link href={receiptsPath} className="text-xl text-blue-700 underline">Open receipts</Link>
                <FixtureBadge from={s.publishFrom} />
                {published.certified_by_clinician && <p className="text-green-800">Certified by clinician</p>}
              </div>
              <Qr url={`${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}${receiptsPath}?utm_source=demo_qr&utm_medium=qr`} size={160} />
            </div>
          ) : (
            <button
              disabled={publishing}
              onClick={s.publish}
              className="rounded-lg bg-blue-700 px-5 py-2 text-lg font-medium text-white disabled:opacity-50"
            >
              {publishing ? "Publishing..." : "Publish receipts"}
            </button>
          )}
        </Section>
      )}
    </main>
  );
}
