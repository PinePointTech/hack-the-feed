import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ORIANE_URL = "https://connect.oriane.xyz/rest/contents/search";
const TTL_MS = 10 * 60 * 1000;
const MAX_LIVE = 20; // upstream requests per 10 minutes, including analysis windows
const DAY_MS = 24 * 60 * 60 * 1000;
const STOP = new Set("a an and are be can cause causes caused do does did for from give gives how i in is it its make makes my of on or really that the this to will with you your".split(" "));

type Video = {
  id: string;
  thumbnail_url: string | null;
  url: string | null;
  views: number | null;
  platform: string;
  published_at: string | null;
  snippet: string;
  snippet_source: string | null;
};
export type SearchResult = {
  query: string;
  terms: string[];
  total: number;
  totalKnown: boolean;
  views: number | null;
  interactions: number | null;
  videos: Video[];
};

type DateWindow = { from: string; to: string };
type WindowMetrics = DateWindow & { posts: number | null };
export type TopicAnalysisResult = {
  query: string;
  recent: WindowMetrics;
  previous: WindowMetrics;
};

// In-memory per serverless instance.
const cache = new Map<string, { at: number; body: SearchResult | TopicAnalysisResult }>();
let liveCalls: number[] = [];
// shortcut: per server instance, so each cold start may spend one call to learn credits are still out.
let outOfCreditsUntil = 0;
const OUT_OF_CREDITS = "Live search is paused. The Oriane account is out of credits.";
class OutOfCredits extends Error {}

const field = (values: string[]) => ({ includesExactly: { operator: "or", values } });

function postUrl(platform: string, id: string | null, handle: string | null): string | null {
  if (!id) return null;
  if (platform === "youtube") return `https://www.youtube.com/watch?v=${id}`;
  if (platform === "instagram") return `https://www.instagram.com/p/${id}/`;
  if (platform === "tiktok" && handle) return `https://www.tiktok.com/@${handle}/video/${id}`;
  return null;
}

type Item = {
  id: string;
  platform?: string;
  platformId?: string;
  profileHandle?: string;
  caption?: string | null;
  thumbnailMediaUrl?: string | null;
  viewsCount?: number | null;
  publishedAt?: string | null;
  media?: { transcript?: string | null; onScreenText?: string[] | null }[] | null;
};

type OrianeResponse = {
  data?: {
    results?: Item[];
    aggregations?: { totalViewsCount?: number; totalInteractionsCount?: number };
  };
  metadata?: { pagination?: { totalCount?: number } };
};

// Show a verbatim excerpt from the field that contains the most search terms
// in one excerpt. A caption can be unrelated to a match in the transcript.
function matchingExcerpt(item: Item, terms: string[]) {
  const fields: [string, string][] = [["Caption", item.caption ?? ""]];
  for (const media of item.media ?? []) {
    fields.push(["Transcript", media.transcript ?? ""]);
    for (const text of media.onScreenText ?? []) {
      if (typeof text === "string") fields.push(["On-screen text", text]);
    }
  }

  const pattern = new RegExp(`\\b(?:${terms.join("|")})\\b`, "gi");
  let best = { snippet: "", snippet_source: null as string | null };
  let bestScore = 0;
  for (const [source, text] of fields) {
    for (const hit of text.matchAll(pattern)) {
      const start = Math.max(0, hit.index - 60);
      const excerpt = text.slice(start, start + 220).trim();
      const score = new Set(excerpt.toLowerCase().match(pattern)).size;
      if (score > bestScore) {
        best = { snippet: excerpt, snippet_source: source };
        bestScore = score;
      }
      if (bestScore === terms.length) return best;
    }
  }
  return best;
}

const reportedCount = (count: number | null | undefined) =>
  typeof count === "number" && Number.isFinite(count) && count >= 0 ? count : null;

async function queryOriane(key: string, terms: string[], window?: DateWindow): Promise<OrianeResponse> {
  // Every term must appear in the transcript, caption or on-screen text.
  const body = {
    operator: "and",
    ...(window && { filters: { publishedAt: { after: window.from, before: window.to } } }),
    queries: terms.map((term) => ({
      operator: "or",
      filters: { transcript: field([term]), caption: field([term]), onScreenText: field([term]) },
    })),
  };
  const url = new URL(ORIANE_URL);
  url.searchParams.set("projection", window ? "basic" : "default");
  url.searchParams.set("limit", window ? "1" : "8");
  url.searchParams.set("sort", "viewsCount:desc");
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 402) throw new OutOfCredits();
  if (!response.ok) throw new Error(`Oriane ${response.status}`);
  const payload: OrianeResponse = await response.json();
  if (!Array.isArray(payload.data?.results)) throw new Error("Invalid Oriane results");
  return payload;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 120) return NextResponse.json({ error: "Enter 2 to 120 characters." }, { status: 400 });
  const key = process.env.ORIANE_API_KEY;
  if (!key) return NextResponse.json({ error: "Live search is not set up." }, { status: 503 });

  const norm = q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const terms = [...new Set(norm.split(" ").filter((w) => w.length > 1 && !STOP.has(w)))].slice(0, 6);
  if (!terms.length) return NextResponse.json({ error: "Add a few more words to the claim." }, { status: 400 });

  const analyze = params.get("analyze") === "1";
  const now = Date.now();
  const daysAgo = (days: number) => new Date(now - days * DAY_MS).toISOString().slice(0, 10);
  const cacheKey = analyze ? `analysis:${daysAgo(0)}:${norm}` : `search:${norm}`;
  for (const [cacheKey, entry] of cache) {
    if (now - entry.at >= TTL_MS) cache.delete(cacheKey);
  }
  const hit = cache.get(cacheKey);
  if (hit) return NextResponse.json({ ...hit.body, query: q });
  if (now < outOfCreditsUntil) return NextResponse.json({ error: OUT_OF_CREDITS }, { status: 503 });
  liveCalls = liveCalls.filter((time) => now - time < TTL_MS);
  const requestCount = analyze ? 2 : 1;
  if (liveCalls.length + requestCount > MAX_LIVE) {
    return NextResponse.json({ error: "Oriane is busy. Try again in a few minutes." }, { status: 429 });
  }
  for (let i = 0; i < requestCount; i++) liveCalls.push(now);

  try {
    if (analyze) {
      const recent = { from: daysAgo(30), to: daysAgo(1) };
      const previous = { from: daysAgo(60), to: daysAgo(31) };
      const counts = await Promise.all([recent, previous].map(async (window) =>
        reportedCount((await queryOriane(key, terms, window)).metadata?.pagination?.totalCount)));
      const result: TopicAnalysisResult = {
        query: q,
        recent: { ...recent, posts: counts[0] },
        previous: { ...previous, posts: counts[1] },
      };
      cache.set(cacheKey, { at: now, body: result });
      return NextResponse.json(result);
    }

    const result = searchResult(q, terms, await queryOriane(key, terms));
    cache.set(cacheKey, { at: now, body: result });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof OutOfCredits) {
      outOfCreditsUntil = now + 60 * 60 * 1000; // stop calling Oriane for an hour
      return NextResponse.json({ error: OUT_OF_CREDITS }, { status: 503 });
    }
    return NextResponse.json({ error: "Oriane did not answer. Try again." }, { status: 502 });
  }
}

function searchResult(q: string, terms: string[], payload: OrianeResponse): SearchResult {
  const videos: Video[] = (payload.data?.results ?? []).map((item) => {
    const platform = item.platform ?? "unknown";
    return {
      id: item.id,
      thumbnail_url: item.thumbnailMediaUrl ?? null,
      url: postUrl(platform, item.platformId ?? null, item.profileHandle ?? null),
      views: reportedCount(item.viewsCount),
      platform,
      published_at: item.publishedAt ?? null,
      ...matchingExcerpt(item, terms),
    };
  });
  const total = reportedCount(payload.metadata?.pagination?.totalCount);
  return {
    query: q,
    terms,
    total: total ?? videos.length,
    totalKnown: total !== null,
    views: reportedCount(payload.data?.aggregations?.totalViewsCount),
    interactions: reportedCount(payload.data?.aggregations?.totalInteractionsCount),
    videos,
  };
}
