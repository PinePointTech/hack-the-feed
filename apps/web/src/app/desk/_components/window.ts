import type { DateWindow } from "@/contracts/types";

const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
// "2026-10-07" -> "Oct 7"; dates are ISO days, so read them as UTC to avoid an off-by-one.
export const day = (iso: string) => fmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
export const windowLabel = (w: DateWindow) => `${day(w.from)} to ${day(w.to)}`;
