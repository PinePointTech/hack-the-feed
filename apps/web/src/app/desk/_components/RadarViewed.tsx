"use client";
import { useEffect, useRef } from "react";
import { track } from "@/lib/track";

export function RadarViewed({ mythCount, from }: { mythCount: number; from: "live" | "fixture" }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track("Radar Viewed", { myth_count: mythCount, data_source: from });
  }, [mythCount, from]);
  return null;
}
