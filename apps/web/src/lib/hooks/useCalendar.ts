"use client";
import { useEffect, useState } from "react";
import type { Calendar } from "../../contracts/types";
import { api, type Sourced } from "../api";
import { track } from "../track";
import { useTrackOnce } from "./useTrackOnce";

/** Loads the myth calendar from the brain. Returns { data, failed, reuseScript }; tracks "Calendar Viewed" once. No fixture fallback. */
export function useCalendar() {
  const [res, setRes] = useState<Sourced<Calendar> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api.calendar().then((r) => live && setRes(r), () => live && setFailed(true));
    return () => { live = false; };
  }, []);

  useTrackOnce("Calendar Viewed", () => ({
    week_of: res!.data.week_of,
    item_count: res!.data.this_week.length + res!.data.watchlist.length,
  }), !!res);

  const reuseScript = (myth_id: string) => track("Script Reused", { myth_id, from: "calendar" });

  return { data: res?.data ?? null, failed, reuseScript };
}
