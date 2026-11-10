// Pure view helpers. No "@/..." imports so node --test can run this file directly.
import type { DateWindow, HarmTier, MythSummary } from "../contracts/types";

const TIER_ORDER: Record<HarmTier, number> = { harmful: 0, false: 1, unproven: 2 };

/** True when the window has posts on the topic. A myth with none is not trending, whatever its harm tier. */
export const isActive = (m: Pick<MythSummary, "topic_views">) => (m.topic_views ?? 0) > 0;

/** Radar order: myths with posts in the window first, then harmful, false, unproven, then most claim views,
 * then most topic views. Returns a new array. */
export const sortMyths = <T extends Pick<MythSummary, "harm_tier" | "claim_views" | "topic_views">>(myths: T[]): T[] =>
  [...myths].sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || TIER_ORDER[a.harm_tier] - TIER_ORDER[b.harm_tier]
    || (b.claim_views ?? 0) - (a.claim_views ?? 0) || (b.topic_views ?? 0) - (a.topic_views ?? 0));

const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
// "2026-10-07" -> "Oct 7"; dates are ISO days, so read them as UTC to avoid an off-by-one.
export const day = (iso: string) => dayFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
/** "Oct 7 to Nov 6" */
export const windowLabel = (w: DateWindow) => `${day(w.from)} to ${day(w.to)}`;

/** format(value), or "Pending" when the value is missing. */
export const pendingOr = <T,>(value: T | null | undefined, format: (v: T) => string = String) =>
  value === undefined || value === null ? "Pending" : format(value);

/** True when fieldPath (e.g. "claims[2].support") is listed in fixture._fixture.placeholders, or sits under a listed path. */
export function isPlaceholder(fixtureJson: unknown, fieldPath: string): boolean {
  const list = (fixtureJson as { _fixture?: { placeholders?: string[] } } | null)?._fixture?.placeholders ?? [];
  const path = fieldPath.replace(/\[\d*\]/g, "[]");
  return list.some((p) => path === p || path.startsWith(`${p}.`) || path.startsWith(`${p}[]`));
}

export type OpenedFrom = "radar" | "calendar" | "direct";
/** Reads ?from= from a query string; anything else is "direct". */
export function openedFrom(search: string): OpenedFrom {
  const f = new URLSearchParams(search).get("from");
  return f === "radar" || f === "calendar" ? f : "direct";
}
