"use client";
import { useEffect, useState } from "react";
import type { PublishedDebunk } from "../../contracts/types";
import { api, type Sourced } from "../api";
import { track } from "../track";
import { useTrackOnce } from "./useTrackOnce";

export type VoteAnswer = "yes" | "no" | "already_knew";

/** Loads a published debunk. Returns { data, from, loading, notFound, vote, voted, qrUrl }; tracks "Receipts Viewed" and one "Mind Changed Vote". */
export function useReceipts(id: string) {
  const [res, setRes] = useState<Sourced<PublishedDebunk> | null>(null);
  const [voted, setVoted] = useState(false);

  useEffect(() => {
    let live = true;
    api.published(id).then((r) => {
      if (!live) return;
      try { if (localStorage.getItem(`mb_voted_${id}`)) setVoted(true); } catch {} // one vote per device
      setRes(r);
    });
    return () => { live = false; };
  }, [id]);

  const loading = !res;
  const notFound = !!res && res.data.id !== id; // fallback fixture is a different id: treat as not published

  useTrackOnce("Receipts Viewed", () => {
    const q = new URLSearchParams(window.location.search);
    return { myth_id: id, utm_source: q.get("utm_source") ?? undefined, utm_medium: q.get("utm_medium") ?? undefined };
  }, !loading && !notFound);

  const vote = (answer: VoteAnswer) => {
    if (voted) return;
    setVoted(true);
    try { localStorage.setItem(`mb_voted_${id}`, "1"); } catch {}
    track("Mind Changed Vote", { myth_id: id, answer, utm_source: new URLSearchParams(window.location.search).get("utm_source") ?? undefined });
  };

  return {
    data: notFound ? null : res?.data ?? null,
    from: res?.from ?? null,
    loading,
    notFound,
    vote,
    voted,
    qrUrl: `${process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")}/r/${id}?utm_source=demo_qr&utm_medium=qr`,
  };
}
