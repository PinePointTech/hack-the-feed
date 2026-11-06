"use client";
import { useEffect, useState } from "react";
import type { Calendar } from "../../contracts/types";
import { api, type Sourced } from "../api";
import { track } from "../track";
import { useTrackOnce } from "./useTrackOnce";

/** Loads the myth calendar. Returns { data, from, loading, reuseScript }; tracks "Calendar Viewed" once. */
export function useCalendar() {
  const [res, setRes] = useState<Sourced<Calendar> | null>(null);

  useEffect(() => {
    let live = true;
    api.calendar().then((r) => live && setRes(r));
    return () => { live = false; };
  }, []);

  useTrackOnce("Calendar Viewed", () => ({
    week_of: res!.data.week_of,
    item_count: res!.data.this_week.length + res!.data.watchlist.length,
  }), !!res);

  const reuseScript = (myth_id: string) => track("Script Reused", { myth_id, from: "calendar" });

  return { data: res?.data ?? null, from: res?.from ?? null, loading: !res, reuseScript };
}
