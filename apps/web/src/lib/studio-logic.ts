// Pure studio rules. No "@/..." imports so node --test can run this file directly.
import type { ApprovalChecklist, ClaimCheck, LineCheck, ScriptLine, Source, SupportStatus } from "../contracts/types";

export type LineStatus = SupportStatus | "no_claim" | "pending" | "failed";
export type Ticks = Omit<ApprovalChecklist, "approved_by" | "approved_at">;
export const REQUIRED_TICKS = ["every_claim_has_source", "quotes_are_exact", "targets_claim_not_person", "no_minors_or_illness_stories"] as const;

export const statusFromSupport = (s: number): SupportStatus => (s >= 0.8 ? "supported" : s >= 0.5 ? "weak" : "unsupported");

// undefined means no result for the current text yet.
export function lineStatus(c: LineCheck | undefined): LineStatus {
  if (!c) return "pending";
  if (c.note === "Not checked (brain offline)") return "failed";
  if (!c.has_claim) return "no_claim";
  if (c.status) return c.status;
  return c.support === undefined ? "failed" : statusFromSupport(c.support);
}

export const canApprove = (ticks: Ticks, statuses: LineStatus[]) =>
  REQUIRED_TICKS.every((k) => ticks[k]) && statuses.length > 0 &&
  statuses.every((s) => s === "supported" || s === "no_claim");

// Lines whose text differs from the text last sent to (or seeded from) the brain.
export const changedLines = (lines: ScriptLine[], checked: Record<string, string>) =>
  lines.filter((l) => checked[l.id] !== l.text).map((l) => ({ id: l.id, text: l.text }));

export const flagKey = (lineId: string, text: string) => `${lineId}\u0000${text}`;

export const copyScriptText = (lines: ScriptLine[]) =>
  lines.map((l) => (l.on_screen ? `${l.text}\nOn screen: ${l.on_screen}` : l.text)).join("\n\n");

export const unsupportedCount = (claims: ClaimCheck[]) => claims.filter((c) => c.status === "unsupported").length;

// LineCheck per script line, taken from the brief's own claim checks.
export function seedChecks(lines: ScriptLine[], claims: ClaimCheck[]): Record<string, LineCheck> {
  const engine = claims[0]?.engine ?? "cached";
  return Object.fromEntries(lines.map((l) => {
    const c = claims.find((x) => x.id === l.claim_id);
    const check: LineCheck = c
      ? { line_id: l.id, has_claim: true, support: c.support, status: c.status, evidence: c.evidence, engine: c.engine }
      : { line_id: l.id, has_claim: false, engine };
    return [l.id, check];
  }));
}

type Checked = { status: LineStatus; check?: LineCheck; checkedFrom?: "live" | "fixture" };

// "Every claim has a source" is derived: each line has a live check, and every claim line cites an excerpt of a brief source.
export const sourceCoverage = (lines: Checked[], sources: Source[]) =>
  lines.length > 0 && lines.every(({ status, check, checkedFrom }) =>
    checkedFrom === "live" && (status === "no_claim" || (status === "supported" &&
      !!check?.evidence?.some((c) => sources.some((s) => s.id === c.source_id && s.excerpts.includes(c.excerpt))))));

// Publishing needs a live QA pass for the exact script that was locked, a video that QA returned a URL for, and final approval.
export const canPublish = (s: { finalApproved: boolean; videoUrl: string | null; qaPass: boolean; publishing: boolean }) =>
  s.finalApproved && !!s.videoUrl && s.qaPass && !s.publishing;

// Why the script cannot be locked yet, worst line first. Empty when every line is supported or has no claim.
export function blockReason(statuses: LineStatus[]): string {
  if (statuses.includes("unsupported")) return "A script line has no source. Fix it before you approve.";
  if (statuses.includes("failed")) return "A line could not be checked. Retry the line checks before you approve.";
  if (statuses.includes("pending")) return "A line is still being checked.";
  if (statuses.includes("weak")) return "A line has weak support. Strengthen it or cut it before you approve.";
  return "";
}
