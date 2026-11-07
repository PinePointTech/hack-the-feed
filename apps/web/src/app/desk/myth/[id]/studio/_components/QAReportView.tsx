import type { QAIssue, QAReport } from "@/contracts/types";
import { mss } from "@/lib/format";
import { ModelCredits } from "@/components/ModelCredits";

const PROBLEM: Record<QAIssue["problem"], string> = {
  text_not_in_script: "This text is not in the approved script",
  unsupported_claim: "This claim has no source behind it",
  missing_source: "The source is not shown on screen",
  typo: "This looks like a typo",
};

export function QAReportView({ report, placeholder }: { report: QAReport; placeholder: boolean }) {
  return (
    <div className="grid gap-5 rounded-[24px] border border-ink p-5 md:p-6" role="status">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-pill border-2 px-4 py-1 text-xl font-extrabold ${
            report.pass ? "border-[#1f6b2e] bg-[#e3f2dc] text-[#1f5a27]" : "border-harmful-text bg-harmful-fill text-harmful-text"
          }`}
        >
          {report.pass ? "QA passed" : "QA failed"}
        </span>
        {report.ran_in === "cached" && <span className="databadge">cached</span>}
        {placeholder && <span className="databadge">placeholder</span>}
      </div>
      <p className="text-lg text-ink-2">
        <span className="font-mono font-semibold text-ink">{report.frames_checked}</span> frames checked,{" "}
        <span className="font-mono font-semibold text-ink">{report.texts_found}</span> on-screen texts found.
      </p>
      <ModelCredits models={report.models} />
      {report.issues.length > 0 ? (
        <ul className="grid gap-3">
          {report.issues.map((i, n) => (
            <li key={n} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-2xl border-2 border-harmful-text bg-harmful-fill p-4">
              <span className="row-span-3 font-mono text-2xl font-semibold text-harmful-text">{mss(i.t_s)}</span>
              {i.expected_line_id && <span className="font-mono text-sm text-ink-2">line {i.expected_line_id}</span>}
              <p className="font-serif text-xl">&ldquo;{i.found_text}&rdquo;</p>
              <p className="text-lg font-semibold text-harmful-text">{PROBLEM[i.problem]}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-lg">No issues found.</p>
      )}
    </div>
  );
}
