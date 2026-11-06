"use client";
import { useRadarViewed } from "@/lib/hooks/usePageViews";

export function RadarViewed({ mythCount, from }: { mythCount: number; from: "live" | "fixture" }) {
  useRadarViewed(mythCount, from);
  return null;
}
