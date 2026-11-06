"use client";
import { useMythOpened } from "@/lib/hooks/usePageViews";

type Props = { mythId: string; harmTier: string; trend: string; dataSource: "live" | "fixture" };

export function MythOpened({ mythId, harmTier, trend, dataSource }: Props) {
  useMythOpened({ id: mythId, harm_tier: harmTier, trend }, dataSource);
  return null;
}
