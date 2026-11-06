"use client";
import { useEffect, useRef } from "react";
import { track } from "@/lib/track";

type Props = { mythId: string; harmTier: string; trend: string; from: "radar" | "calendar" | "direct"; dataSource: "live" | "fixture" };

export function MythOpened({ mythId, harmTier, trend, from, dataSource }: Props) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track("Myth Opened", { myth_id: mythId, harm_tier: harmTier, trend, from, data_source: dataSource });
  }, [mythId, harmTier, trend, from, dataSource]);
  return null;
}
