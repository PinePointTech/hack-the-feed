import type { QAIssue, QAReport } from "@/contracts/types";
import { mss } from "@/lib/format";

const PROBLEM: Record<QAIssue["problem"], string> = {
  text_not_in_script: "This text is not in the approved script",
  unsupported_claim: "This claim has no source behind it",
  missing_source: "The source is not shown on screen",
  typo: "This looks like a typo",
};

export function QAReportView({ report, placeholder }: { report: QAReport; placeholder: boolean }) {
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full px-3 py-1 text-lg font-medium ring-1 ${
            report.pass ? "bg-green-100 text-green-800 ring-green-300" : "bg-red-100 text-red-800 ring-red-300"
          }`}
        >
          {report.pass ? "QA passed" : "QA failed"}
        </span>
        {report.ran_in === "cached" && <span className="rounded-full bg-slate-200 px-3 py-1 text-sm">cached</span>}
        {placeholder && <span className="rounded-full bg-slate-200 px-3 py-1 text-sm">placeholder</span>}
      </div>
      <p className="text-slate-700">
        {report.frames_checked} frames checked, {report.texts_found} on-screen texts found.
      </p>
      {report.issues.length > 0 ? (
        <ul className="space-y-3">
          {report.issues.map((i, n) => (
            <li key={n} className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm text-slate-500">
                At {mss(i.t_s)}
                {i.expected_line_id && ` (line ${i.expected_line_id})`}
              </p>
              <p className="text-lg">&ldquo;{i.found_text}&rdquo;</p>
              <p className="text-slate-700">{PROBLEM[i.problem]}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-700">No issues found.</p>
      )}
    </div>
  );
}
