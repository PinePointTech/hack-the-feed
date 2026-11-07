"use client";
import { useEffect, useState } from "react";
import type { AudienceResponse, AudienceStats } from "../amplitude-audience";

const EVERY = 10_000;

/** Polls /api/audience/{id} every 10 s while the tab is visible. Returns { stats, configured, loading, error, updatedAt }. */
export function useAudience(id: string) {
  const [res, setRes] = useState<AudienceResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      clearTimeout(timer);
      if (busy || document.visibilityState !== "visible") return; // resumes on visibilitychange
      busy = true;
      try {
        const r = await fetch(`/api/audience/${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const body = (await r.json()) as AudienceResponse;
        if (live) { setRes(body); setFailed(false); }
      } catch {
        if (live) setFailed(true);
      }
      busy = false;
      if (live) timer = setTimeout(load, EVERY);
    };
    load();
    document.addEventListener("visibilitychange", load);
    return () => { live = false; clearTimeout(timer); document.removeEventListener("visibilitychange", load); };
  }, [id]);

  const stats: AudienceStats | null = res?.stats ?? null;
  return {
    stats,
    configured: res?.configured ?? null,
    loading: !res && !failed,
    error: failed ? "Amplitude is not answering right now" : res?.error ?? null,
    updatedAt: res?.updated_at ?? null,
  };
}
