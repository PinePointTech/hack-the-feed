import { loadAudience, type AudienceResponse } from "@/lib/amplitude-audience";

// Live audience for a myth's receipts page, read from Amplitude with the server-only secret key.
export const dynamic = "force-dynamic";

const TTL = 15_000;
// Keyed by myth id; holds the in-flight promise so polling tabs share one set of Amplitude calls (5 concurrent max per project).
const cache = new Map<string, { at: number; body: Promise<AudienceResponse> }>();

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9-]{1,64}$/.test(id)) {
    return Response.json({ error: { code: "bad_request", message: "Myth id must be lowercase letters, digits and dashes" } }, { status: 400 });
  }
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return Response.json(await hit.body, { headers: { "Cache-Control": "no-store" } });
  if (cache.size > 200) cache.clear(); // ids are user input: keep the map small
  const body = loadAudience(id, process.env);
  cache.set(id, { at: Date.now(), body });
  return Response.json(await body, { headers: { "Cache-Control": "no-store" } });
}
