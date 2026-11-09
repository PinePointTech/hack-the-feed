"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { mergeFeed, type FeedPost, type FeedResponse } from "../feed";
import { useTrackOnce } from "./useTrackOnce";

const REFETCH_MS = 60_000;

/**
 * Live feed from the brain. On mount and on refresh(): POST /poll, then GET /feed. Every 60 s: GET /feed only.
 * Returns { posts, fresh, latest, loading, refreshing, error, down, refresh, showFresh }.
 * `fresh` are posts from a background fetch that wait behind the "N new posts" pill until showFresh().
 */
export function useFeed() {
  const [shown, setShown] = useState<FeedPost[]>([]);
  const [latest, setLatest] = useState<FeedResponse | null>(null);
  const [error, setError] = useState<{ message: string; down: boolean } | null>(null);
  const [busy, setBusy] = useState(true);
  const inflight = useRef(false);
  const mounted = useRef(true);

  const pull = useCallback(async (runPoll: boolean) => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      if (runPoll) await api.poll().catch(() => undefined); // a failed poll still leaves the stored posts readable
      const { data } = await api.feed();
      if (!mounted.current) return;
      setLatest(data);
      setShown((s) => (runPoll || s.length === 0 ? data.posts : s));
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      // fetch failures (TypeError, TimeoutError) mean nothing answered; an HTTP error from live() is a plain Error
      const down = !(err instanceof Error) || err.name !== "Error";
      setError({ message: err instanceof Error ? err.message : "Unknown error", down });
    } finally {
      inflight.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pull() sets state only after its awaits
    pull(true);
    const timer = setInterval(() => pull(false), REFETCH_MS);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [pull]);

  const refresh = () => {
    if (inflight.current) return;
    setBusy(true); // busy starts true for the first pull; later pulls turn it on here, in the click handler
    pull(true);
  };

  const { posts, fresh } = mergeFeed(shown, latest?.posts ?? []);
  const showFresh = () => setShown([...fresh, ...posts]);

  useTrackOnce("Feed Viewed", () => ({
    post_count: shown.length,
    labeled_count: shown.filter((p) => p.label).length,
  }), !!latest);

  return { posts, fresh, latest, loading: !latest && !error, refreshing: busy, error, refresh, showFresh };
}
