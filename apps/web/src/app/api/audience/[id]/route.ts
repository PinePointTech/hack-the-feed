import { AUDIENCE_ERROR, loadAudience, type AudienceResponse } from "@/lib/amplitude-audience";

// Live audience for a myth's receipts page, read from Amplitude with the server-only secret key.
export const dynamic = "force-dynamic";

const TTL = 30_000;
const MAX_IDS = 3; // live upstream loads per TTL window: each costs 3 calls, Amplitude allows 5 concurrent
// Keyed by myth id; holds the in-flight promise so polling tabs share one set of Amplitude calls.
// shortcut: the cache is per server instance, so two warm Vercel instances double the calls; move to a shared store if 429s show up.
const cache = new Map<string, { at: number; body: Promise<AudienceResponse> }>();
const json = (b: AudienceResponse, status = 200) => Response.json(b, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9-]{1,64}$/.test(id)) {
    return Response.json({ error: { code: "bad_request", message: "Myth id must be lowercase letters, digits and dashes" } }, { status: 400 });
  }
  const now = Date.now();
  const hit = cache.get(id);
  if (hit && now - hit.at < TTL) return json(await hit.body);
  for (const [k, v] of cache) if (now - v.at >= TTL) cache.delete(k);
  // ids are user input: bound upstream work so random ids cannot burn the Amplitude budget or evict the demo myth.
  if (cache.size >= MAX_IDS && process.env.AMPLITUDE_SECRET_KEY) {
    return json({ configured: true, myth_id: id, error: AUDIENCE_ERROR, updated_at: new Date(now).toISOString() }, 503);
  }
  const prev = hit?.body;
  // On a failure (often a 429) keep the last good numbers for one more window; updated_at still shows their real age.
  const body = loadAudience(id, process.env).then(async (b) => {
    const p = b.error && prev ? await prev : undefined;
    return p?.stats && now - Date.parse(p.updated_at) < 2 * TTL ? p : b;
  });
  cache.set(id, { at: now, body });
  return json(await body);
}
