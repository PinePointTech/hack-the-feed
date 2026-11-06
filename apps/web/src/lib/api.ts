import type { Radar, MythDetail, Brief, BriefRequest, CheckRequest, CheckResponse, QAReport,
  PublishRequest, PublishedDebunk, Impact, Calendar } from "@/contracts/types";
import radarFx from "@/contracts/fixtures/radar.json";
import mythFx from "@/contracts/fixtures/myth-lymphatic-detox.json";
import briefFx from "@/contracts/fixtures/brief-lymphatic-detox.json";
import checkFx from "@/contracts/fixtures/check.json";
import qaFx from "@/contracts/fixtures/qa.json";
import publishedFx from "@/contracts/fixtures/published-lymphatic-detox.json";
import impactFx from "@/contracts/fixtures/impact.json";
import calendarFx from "@/contracts/fixtures/calendar.json";
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
      throw new Error(`${res.status}${code ? ` [${code}]` : ""} ${body}`);
    }
    return { data: (await res.json()) as T, from: "live" };
  } catch (err) {
    console.warn(`[api] ${url} failed, using fixture`, err);
    return { data: fixture(), from: "fixture" };
  } finally {
    clearTimeout(timer);
  }
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
  brief: (req: BriefRequest) => call<Brief>("/brief", post(req), () => fx<Brief>(briefFx), 90000),
  check: (req: CheckRequest) => call<CheckResponse>("/check", post(req), () => checkFallback(req), 15000),
  qa: (form: FormData) => call<QAReport>("/qa", { method: "POST", body: form }, () => fx<QAReport>(qaFx), 120000),
  publish: (req: PublishRequest) => call<PublishedDebunk>("/publish", post(req), () => fx<PublishedDebunk>(publishedFx), 30000),
  impact: (id: string) => call<Impact>(`/impact/${id}`, undefined, () => fx<Impact>(impactFx), 15000),
  // Public pages: same-origin static files, never the brain. Call from client components.
  published: (id: string) =>
    get<PublishedDebunk>(`/published/${encodeURIComponent(id)}.json`, undefined, () => fx<PublishedDebunk>(publishedFx), 15000),
  calendar: () => get<Calendar>("/calendar.json", undefined, () => fx<Calendar>(calendarFx), 15000),
};
