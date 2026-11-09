"use client";
import { useCallback, useEffect, useState } from "react";
import { api, BrainError } from "../api";
import { reviewRows, type ReviewRow } from "../candidates";
import { track } from "../track";

/**
 * Candidate myths for review. Returns { rows, loading, unavailable, busy, notice, confirm }.
 * `unavailable` means the brain did not answer the candidates read. The feed read only adds source links, so it may fail quietly.
 * confirm(id) and reject(id) call POST /myths/{id}/confirm or /reject; each drops the row on success or 404 (already gone), and tracks "Myth Confirmed" on success.
 * A public brain answers 401 until the reviewer enters its token; the token stays in this tab's sessionStorage only.
 */
const TOKEN_KEY = "mybuster-review-token";
const readToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } };
export function useCandidates() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsToken, setNeedsToken] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([api.candidates(), api.feed().then((r) => r.data.posts, () => [])]).then(
      ([{ data }, posts]) => {
        if (!live) return;
        setRows(reviewRows(data.candidates, posts));
        setLoading(false);
      },
      () => {
        if (!live) return;
        setUnavailable(true);
        setLoading(false);
      },
    );
    return () => { live = false; };
  }, []);

  const review = useCallback(async (id: string, action: "confirm" | "reject") => {
    setBusy(id);
    setNotice(null);
    try {
      const token = readToken() || undefined;
      if (action === "confirm") await api.confirmMyth(id, token);
      else await api.rejectMyth(id, token);
      track(action === "confirm" ? "Myth Confirmed" : "Myth Rejected", { myth_id: id });
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (err) {
      if (err instanceof BrainError && err.status === 401) {
        setNeedsToken(true);
        setNotice(`Enter the reviewer token, then press ${action === "confirm" ? "Confirm" : "Reject"} again.`);
      } else if (err instanceof BrainError && err.status === 404) {
        setRows((r) => r.filter((x) => x.id !== id));
        setNotice("That myth is no longer a candidate, so it was removed from the list.");
      } else {
        setNotice(`Could not ${action} that myth. Check that the brain is running, then try again.`);
      }
    } finally {
      setBusy(null);
    }
  }, []);
  const confirm = useCallback((id: string) => review(id, "confirm"), [review]);
  const reject = useCallback((id: string) => review(id, "reject"), [review]);

  const saveToken = useCallback((token: string) => {
    try { sessionStorage.setItem(TOKEN_KEY, token.trim()); } catch { /* private mode: the next confirm asks again */ }
  }, []);

  return { rows, loading, unavailable, busy, notice, confirm, reject, needsToken, saveToken };
}
