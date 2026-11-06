// Pure studio rules. No "@/..." imports so node --test can run this file directly.
import type { ApprovalChecklist, ClaimCheck, LineCheck, ScriptLine, SupportStatus } from "../contracts/types";

export type LineStatus = SupportStatus | "no_claim" | "pending";
export type Ticks = Omit<ApprovalChecklist, "approved_by" | "approved_at">;
export const REQUIRED_TICKS = ["every_claim_has_source", "quotes_are_exact", "targets_claim_not_person", "no_minors_or_illness_stories"] as const;

export const statusFromSupport = (s: number): SupportStatus => (s >= 0.8 ? "supported" : s >= 0.5 ? "weak" : "unsupported");

// undefined means no result for the current text yet.
export function lineStatus(c: LineCheck | undefined): LineStatus {
  if (!c) return "pending";
  if (!c.has_claim) return "no_claim";
  if (c.status) return c.status;
  // A claim with no score cannot be verified: flag it without blocking approval.
  return c.support === undefined ? "weak" : statusFromSupport(c.support);
}

export const canApprove = (ticks: Ticks, statuses: LineStatus[]) =>
  REQUIRED_TICKS.every((k) => ticks[k]) && !statuses.some((s) => s === "unsupported" || s === "pending");

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
