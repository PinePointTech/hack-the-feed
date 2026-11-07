import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request: Request) {
  const token = process.env.FACT_CHECK_API_TOKEN;
  if (!token) return NextResponse.json({ error: "Post fact-checking is not configured." }, { status: 503 });

  const body = await request.json().catch(() => null);
  const postId = body?.post_id;
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  if (typeof postId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(postId) || topic.length < 2 || topic.length > 120) {
    return NextResponse.json({ error: "A valid Oriane post and search topic are required." }, { status: 400 });
  }

  const brain = process.env.NEXT_PUBLIC_BRAIN_URL ?? "http://localhost:8000";
  try {
    const response = await fetch(`${brain.replace(/\/$/, "")}/fact-check`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: postId, topic }),
      cache: "no-store",
      signal: AbortSignal.timeout(48_000),
    });
    if (response.ok) return NextResponse.json(await response.json());
    if (response.status === 404) {
      return NextResponse.json({ error: "Oriane no longer has this post." }, { status: 404 });
    }
    if (response.status === 429) {
      return NextResponse.json({ error: "Fact-checking is busy. Try again in a few minutes." }, { status: 429 });
    }
  } catch {
    // A network error or an upstream timeout is a retryable failure.
  }
  return NextResponse.json({ error: "Fact-checking is temporarily unavailable. Try again." }, { status: 503 });
}
