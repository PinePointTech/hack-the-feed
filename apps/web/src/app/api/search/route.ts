import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ORIANE_URL = "https://connect.oriane.xyz/rest/contents/search";
const TTL_MS = 10 * 60 * 1000;
const MAX_LIVE = 20; // distinct live queries per 10 minutes, so open demos cannot burn credits
const STOP = new Set("a an and are be can cause causes caused do does did for from give gives how i in is it its make makes my of on or really that the this to will with you your".split(" "));

type Video = { thumbnail_url: string | null; url: string | null; views: number | null; platform: string; published_at: string | null; snippet: string };
type Result = { query: string; total: number; videos: Video[] };

// shortcut: in-memory per serverless instance, upgrade to a shared store if traffic grows past a demo
const cache = new Map<string, { at: number; body: Result }>();
let liveCalls: number[] = [];

const field = (values: string[]) => ({ includesExactly: { operator: "or", values } });

function postUrl(platform: string, id: string | null, handle: string | null): string | null {
  if (!id) return null;
  if (platform === "youtube") return `https://www.youtube.com/watch?v=${id}`;
  if (platform === "instagram") return `https://www.instagram.com/p/${id}/`;
  if (platform === "tiktok" && handle) return `https://www.tiktok.com/@${handle}/video/${id}`;
  return null;
}

// Exact substring of the post's own text around the first matched term.
function snippetOf(text: string, terms: string[]): string {
  const lower = text.toLowerCase();
  const hit = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, hit - 60);
  return text.slice(start, start + 220).trim();
}

type Item = {
  platform?: string; platformId?: string; profileHandle?: string; caption?: string | null; title?: string | null;
  thumbnailMediaUrl?: string | null; viewsCount?: number | null; publishedAt?: string | null;
  media?: { transcriptChunks?: { text: string }[] }[];
};

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 120) return NextResponse.json({ error: "Enter 2 to 120 characters." }, { status: 400 });
  const key = process.env.ORIANE_API_KEY;
  if (!key) return NextResponse.json({ error: "Live search is not set up." }, { status: 503 });

  const norm = q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const terms = norm.split(" ").filter((w) => w.length > 1 && !STOP.has(w)).slice(0, 6);
  if (!terms.length) return NextResponse.json({ error: "Add a few more words to the claim." }, { status: 400 });

  const now = Date.now();
  const hit = cache.get(norm);
  if (hit && now - hit.at < TTL_MS) return NextResponse.json(hit.body);
  liveCalls = liveCalls.filter((t) => now - t < TTL_MS);
  if (liveCalls.length >= MAX_LIVE) return NextResponse.json({ error: "Live search is busy. Try again in a few minutes." }, { status: 429 });
  liveCalls.push(now);

  // Every term must appear in the transcript, caption or on-screen text.
  const body = {
    operator: "and",
    queries: terms.map((t) => ({ operator: "or", filters: { transcript: field([t]), caption: field([t]), onScreenText: field([t]) } })),
  };
  let payload: { data?: { results?: Item[] }; metadata?: { pagination?: { totalCount?: number } } };
  try {
    const res = await fetch(`${ORIANE_URL}?projection=default&limit=8&sort=viewsCount:desc`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Oriane ${res.status}`);
    payload = await res.json();
  } catch {
    return NextResponse.json({ error: "Oriane did not answer. Try again." }, { status: 502 });
  }

  const videos: Video[] = (payload.data?.results ?? []).map((r) => {
    const transcript = (r.media ?? []).flatMap((m) => m.transcriptChunks ?? []).map((c) => c.text.trim()).join(" ");
    const text = r.caption || transcript || r.title || "";
    const platform = r.platform ?? "unknown";
    return {
      thumbnail_url: r.thumbnailMediaUrl ?? null,
      url: postUrl(platform, r.platformId ?? null, r.profileHandle ?? null),
      views: typeof r.viewsCount === "number" ? r.viewsCount : null,
      platform,
      published_at: r.publishedAt ?? null,
      snippet: snippetOf(text, terms),
    };
  });
  const result: Result = { query: q, total: payload.metadata?.pagination?.totalCount ?? videos.length, videos };
  cache.set(norm, { at: now, body: result });
  return NextResponse.json(result);
}
