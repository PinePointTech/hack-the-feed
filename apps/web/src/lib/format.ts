const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const exactFmt = new Intl.NumberFormat("en-US");

export const compact = (n: number) => compactFmt.format(n); // 49537321 -> "49.5M"
export const exact = (n: number) => exactFmt.format(n); // 49537321 -> "49,537,321"

export function mss(seconds: number) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; // 7.44 -> "0:07"
}

export const pct = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n)}%`; // -22 -> "-22%"
