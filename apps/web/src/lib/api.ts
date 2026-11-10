import type { Radar, MythDetail, Brief, BriefRequest, CheckRequest, CheckResponse, QAReport,
  PublishRequest, PublishedDebunk, Impact, Calendar, MythCandidates, ConfirmedMyth, DateWindow, MythSummary } from "@/contracts/types";
// Radar, myth, impact and calendar are live only. Fixtures remain for brief, check, qa and published (studio and receipts).
import briefFx from "@/contracts/fixtures/brief-lymphatic-detox.json";
import checkFx from "@/contracts/fixtures/check.json";
import qaFx from "@/contracts/fixtures/qa.json";
import publishedFx from "@/data/published-lymphatic-detox.json";
import { checkFromFixtures, brainErrorCode } from "./fixture-logic";
import type { FeedPost, FeedResponse, PollResponse } from "./feed";

const BRAIN = process.env.NEXT_PUBLIC_BRAIN_URL ?? "http://localhost:8000";
const MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "1";
export type Sourced<T> = { data: T; from: "live" | "fixture" };
export type Result<T> = Sourced<T>;

/** A non-2xx answer from the brain. `status` lets a page tell "no such myth" (404) from "brain broken". */
export class BrainError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

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
    throw new BrainError(problem?.error?.message ?? `Brain returned HTTP ${response.status}.`, response.status, problem?.error?.code);
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

const checkFallback = (req: CheckRequest) => checkFromFixtures(req, fx<CheckResponse>(checkFx), fx<Brief>(briefFx));

/** Awaits a live read without throwing: the data, or ok:false with the HTTP status (null when nothing answered). */
export const settle = <T,>(read: Promise<Sourced<T>>) =>
  read.then((r) => ({ ok: true as const, ...r }),
    (e: unknown) => ({ ok: false as const, status: e instanceof BrainError ? e.status : null }));

// Live reads ignore NEXT_PUBLIC_USE_MOCKS on purpose: a down brain must show "Live data unavailable", never sample data.
// `valid` checks the fields pages read without a guard, so a malformed answer counts as "unavailable", not a crash.
const read = <T,>(path: string, valid: (d: T) => unknown, ms = 15000) => live<T>(path, undefined, ms).then((r) => {
  if (!valid(r.data)) throw new Error(`The brain sent an unexpected answer for ${path}.`);
  return r;
});
type Loose<T> = { [K in keyof T]?: unknown } | null | undefined;
const isWindow = (w: unknown) => typeof (w as Loose<DateWindow>)?.from === "string" && typeof (w as Loose<DateWindow>)?.to === "string";
const isMyth = (m: Loose<MythSummary>) => typeof m?.id === "string" && typeof m.topic === "string" && typeof m.claim === "string" && isWindow(m.window);
const isList = Array.isArray;

export const api = {
  radar: () => read<Radar>("/radar", (d) => isWindow(d?.window) && isList(d.myths) && d.myths.every(isMyth)),
  myth: (id: string, ms?: number) => read<MythDetail>(`/myths/${encodeURIComponent(id)}`,
    (d) => isMyth(d) && isList(d.videos) && isList(d.counter_voices) && !!d.stance_counts, ms),
  brief: async (req: BriefRequest): Promise<Sourced<Brief>> => {
    try {
      let result: Sourced<Brief> | undefined;
      // A first draft for a newly confirmed myth keeps running in the brain; ask again until it is saved (about 2 minutes).
      for (let tries = 0; !result; tries++) {
        try {
          result = MOCKS ? { data: fx<Brief>(briefFx), from: "fixture" as const } : await live<Brief>("/brief", post(req), 90000);
        } catch (e) {
          if (!(e instanceof BrainError && e.code === "brief_drafting" && tries < 6)) throw e;
          await new Promise((done) => setTimeout(done, 15000));
        }
      }
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
  impact: (id: string) => read<Impact>(`/impact/${encodeURIComponent(id)}`, (d) => typeof d?.myth_id === "string" && isWindow(d.window)),
  published: async (id: string): Promise<Sourced<PublishedDebunk>> => {
    const path = `/published/${encodeURIComponent(id)}`;
    if (!MOCKS) {
      try { return await read<PublishedDebunk>(path, (d) => isMyth(d?.myth) && isList(d.sources) && isList(d.quoted), 6000); } catch {}
    }
    // The static copy is a relative URL, which only a browser can fetch.
    if (typeof window === "undefined") return { data: fx<PublishedDebunk>(publishedFx), from: "fixture" };
    return get<PublishedDebunk>(`${path}.json`, undefined, () => fx<PublishedDebunk>(publishedFx), 15000);
  },
  calendar: () => read<Calendar>("/calendar", (d) => typeof d?.week_of === "string" && isList(d.this_week) && isList(d.watchlist)),
  // Live feed: no fixture fallback, a down brain must surface as an error. live() ignores NEXT_PUBLIC_USE_MOCKS on purpose.
  feed: (limit = 50) => read<FeedResponse>(`/feed?limit=${limit}`, (d) => isList(d?.posts)),
  // Posts whose correction passed the strict check in the brain, for one myth. Live only.
  corrections: (mythId?: string) => read<{ posts: FeedPost[] }>(mythId ? `/corrections?myth_id=${encodeURIComponent(mythId)}` : "/corrections",
    (d) => isList(d?.posts)),
  hideCorrection: (orianeId: string, token?: string) => live<{ oriane_id: string; hidden: true }>(`/corrections/${encodeURIComponent(orianeId)}/hide`,
    { method: "POST", headers: token ? { "X-Review-Token": token } : undefined }, 15000),
  poll: () => live<PollResponse>("/poll", { method: "POST" }, 90000),
  // Candidate myths: live only, no fixtures. A person confirms; nothing here confirms on its own.
  candidates: () => read<MythCandidates>("/myths/candidates", (d) => isList(d?.candidates)),
  confirmMyth: (id: string, token?: string) => live<ConfirmedMyth>(`/myths/${encodeURIComponent(id)}/confirm`,
    { method: "POST", headers: token ? { "X-Review-Token": token } : undefined }, 15000),
  rejectMyth: (id: string, token?: string) => live<{ id: string; rejected: true }>(`/myths/${encodeURIComponent(id)}/reject`,
    { method: "POST", headers: token ? { "X-Review-Token": token } : undefined }, 15000),
};
