// Pure fixture fallbacks. No "@/..." imports so node --test can run this file directly.
import type { Radar, MythDetail, Brief, CheckRequest, CheckResponse, LineCheck } from "../contracts/types";

export function mythFromFixtures(id: string, myth: MythDetail, radar: Radar): MythDetail {
  if (id === myth.id) return myth;
  const m = radar.myths.find((x) => x.id === id);
  // Never invent numbers: only what the radar summary has.
  return m ? { ...m, videos: [], counter_voices: [], stance_counts: {} } : myth;
}

export const normalizeLine = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase().replace(/\.$/, "");

export function checkFromFixtures(req: CheckRequest, check: CheckResponse, brief: Brief): CheckResponse {
  const scripted = new Map(
    brief.script.lines.filter((l) => l.claim_id).map((l) => [normalizeLine(l.text), l.claim_id]),
  );
  return {
    results: req.lines.map((l): LineCheck => {
      if (/burns fat/i.test(l.text)) return { ...check.results[0], line_id: l.id };
      const claim = brief.claims.find((c) => c.id === scripted.get(normalizeLine(l.text)));
      if (claim)
        return { line_id: l.id, has_claim: true, support: claim.support, status: claim.status, evidence: claim.evidence, engine: "cached" };
      return { line_id: l.id, has_claim: false, engine: "cached", note: "Not checked (brain offline)" };
    }),
  };
}

export function brainErrorCode(body: string): string | undefined {
  try {
    const code = JSON.parse(body)?.error?.code;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}
