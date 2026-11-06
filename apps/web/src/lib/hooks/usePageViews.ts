"use client";
import { useTrackOnce } from "./useTrackOnce";
import { openedFrom } from "../view-model";

type Source = "live" | "fixture";

/** Fires "Radar Viewed" once. Returns nothing. */
export function useRadarViewed(mythCount: number, dataSource: Source) {
  useTrackOnce("Radar Viewed", { myth_count: mythCount, data_source: dataSource });
}

/** Fires "Myth Opened" once, with from read from ?from= (radar, calendar or direct). Returns nothing. */
export function useMythOpened(myth: { id: string; harm_tier: string; trend: string }, dataSource: Source) {
  useTrackOnce("Myth Opened", () => ({
    myth_id: myth.id, harm_tier: myth.harm_tier, trend: myth.trend,
    from: openedFrom(window.location.search), data_source: dataSource,
  }));
}
