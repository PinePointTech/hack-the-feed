// Pure fixture fallbacks. No "@/..." imports so node --test can run this file directly.
import type { Radar, MythDetail, Brief, CheckRequest, CheckResponse, LineCheck } from "../contracts/types";

export function mythFromFixtures(id: string, myth: MythDetail, radar: Radar): MythDetail {
  if (id === myth.id) return myth;
  const m = radar.myths.find((x) => x.id === id);
  if (!m) return myth;
  // Never invent numbers: only what the radar summary has. Its top video is real, so list it by its stance.
  const top = m.top_video ? [m.top_video] : [];
  return {
    ...m,
    videos: top.filter((v) => v.stance === "promotes"),
    counter_voices: top.filter((v) => v.stance === "debunks"),
    stance_counts: {},
  };
}

export const normalizeLine = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase().replace(/\.$/, "");

export function checkFromFixtures(req: CheckRequest, check: CheckResponse, brief: Brief): CheckResponse {
  const scripted = new Map(
    brief.script.lines.filter((l) => l.claim_id).map((l) => [normalizeLine(l.text), l.claim_id]),
  );
  return {
    results: req.lines.map((l): LineCheck => {
      if (req.myth_id === brief.myth_id && normalizeLine(l.text) === normalizeLine("Lymphatic drainage burns fat."))
        return { ...check.results[0], line_id: l.id };
      if (req.myth_id !== brief.myth_id)
        return { line_id: l.id, has_claim: false, engine: "cached", note: "Not checked (brain offline)" };
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
