import type { Radar, MythDetail, Brief, BriefRequest, CheckRequest, CheckResponse, QAReport,
  PublishRequest, PublishedDebunk, Impact, Calendar } from "@/contracts/types";
// Fallbacks are the real pipeline outputs (apps/web/src/data, copied from data/), not hand-written fixtures.
import radarFx from "@/data/radar.json";
import mythFx from "@/data/myth-lymphatic-detox.json";
import briefFx from "@/contracts/fixtures/brief-lymphatic-detox.json";
import checkFx from "@/contracts/fixtures/check.json";
import qaFx from "@/contracts/fixtures/qa.json";
import publishedFx from "@/data/published-lymphatic-detox.json";
import impactFx from "@/data/impact.json";
import calendarFx from "@/data/calendar.json";
import { mythFromFixtures, checkFromFixtures, brainErrorCode } from "./fixture-logic";

const BRAIN = process.env.NEXT_PUBLIC_BRAIN_URL ?? "http://localhost:8000";
const MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "1";
export type Sourced<T> = { data: T; from: "live" | "fixture" };
export type Result<T> = Sourced<T>;

async function call<T>(path: string, init: RequestInit | undefined, fixture: () => T, ms: number): Promise<Sourced<T>> {
  if (MOCKS) return { data: fixture(), from: "fixture" };
  return get(`${BRAIN}${path}`, init, fixture, ms);
}

async function get<T>(url: string, init: RequestInit | undefined, fixture: () => T, ms: number): Promise<Sourced<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) {
      const body = await res.text();
      const code = brainErrorCode(body);
      throw new Error(`${res.status}${code ? ` [${code}]` : ""} ${body.slice(0, 200)}`); // a 404 body is a whole HTML page
    }
    return { data: (await res.json()) as T, from: "live" };
  } catch (err) {
    console.warn(`[api] ${url} failed, using fixture`, err);
    return { data: fixture(), from: "fixture" };
  } finally {
    clearTimeout(timer);
  }
}
async function live<T>(path: string, init: RequestInit | undefined, ms: number) {
  const response = await fetch(`${BRAIN}${path}`, {
    ...init, signal: AbortSignal.timeout(ms), cache: "no-store",
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new Error(problem?.error?.message ?? `Brain returned HTTP ${response.status}.`);
  }
  return { data: (await response.json()) as T, from: "live" as const,
    videoUrl: response.headers.get("Content-Location") };
}

export function receiptVideoUrl(url: string) {
  return /^\/published\/[^/]+\/video\//.test(url) ? `${BRAIN}${url}` : url;
}

const post = (body: unknown): RequestInit => ({
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const fx = <T,>(x: unknown) => x as T;

const mythFallback = (id: string) => mythFromFixtures(id, fx<MythDetail>(mythFx), fx<Radar>(radarFx));
const checkFallback = (req: CheckRequest) => checkFromFixtures(req, fx<CheckResponse>(checkFx), fx<Brief>(briefFx));

export const api = {
  radar: () => call<Radar>("/radar", undefined, () => fx<Radar>(radarFx), 15000),
  myth: (id: string) => call<MythDetail>(`/myths/${id}`, undefined, () => mythFallback(id), 15000),
  brief: async (req: BriefRequest): Promise<Sourced<Brief>> => {
    try {
      const result = MOCKS ? { data: fx<Brief>(briefFx), from: "fixture" as const }
        : await live<Brief>("/brief", post(req), 90000);
      if (result.data.myth_id !== req.myth_id || result.data.script.format !== req.format ||
          !result.data.sources.length || !result.data.claims.length) {
        throw new Error("No verified draft is available for this claim and format.");
      }
      return result;
    } catch (error) {
      if (!req.refresh && req.myth_id === briefFx.myth_id && req.format === briefFx.script.format)
        return { data: fx<Brief>(briefFx), from: "fixture" };
      throw error;
    }
  },
  check: (req: CheckRequest) => call<CheckResponse>("/check", post(req), () => checkFallback(req), 15000),
  qa: (form: FormData) => MOCKS
    ? Promise.resolve({ data: fx<QAReport>(qaFx), from: "fixture" as const, videoUrl: null })
    : live<QAReport>("/qa", { method: "POST", body: form }, 120000),
  publish: (req: PublishRequest) => live<PublishedDebunk>("/publish", post(req), 30000),
  impact: (id: string) => call<Impact>(`/impact/${id}`, undefined, () => fx<Impact>(impactFx), 15000),
  published: async (id: string): Promise<Sourced<PublishedDebunk>> => {
    const path = `/published/${encodeURIComponent(id)}`;
    if (!MOCKS) {
      try { return await live<PublishedDebunk>(path, undefined, 6000); } catch {}
    }
    return get<PublishedDebunk>(`${path}.json`, undefined, () => fx<PublishedDebunk>(publishedFx), 15000);
  },
  calendar: () => get<Calendar>("/calendar.json", undefined, () => fx<Calendar>(calendarFx), 15000),
};
