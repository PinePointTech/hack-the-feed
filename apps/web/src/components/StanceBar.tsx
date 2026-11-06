import type { Stance } from "@/contracts/types";

const COLOR: Record<Stance, string> = {
  promotes: "bg-harmful-text",
  debunks: "bg-ink",
  neutral: "bg-ink-2",
  ad: "bg-false-fill",
  unrelated: "bg-rule",
};
const LABEL: Record<Stance, string> = { promotes: "Promotes", debunks: "Debunks", neutral: "Neutral", ad: "Ad", unrelated: "Unrelated" };

export function StanceBar({ counts, sampleSize }: { counts: Partial<Record<Stance, number>>; sampleSize?: number }) {
  const entries = (Object.keys(COLOR) as Stance[]).filter((s) => (counts[s] ?? 0) > 0).map((s) => [s, counts[s]!] as const);
  const total = entries.reduce((a, [, n]) => a + n, 0);
  if (!total) return <p className="text-ink-2">No stance data yet</p>;
  return (
    <div className="grid gap-3">
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-pill border border-ink">
        {entries.map(([s, n]) => (
          <div key={s} className={COLOR[s]} style={{ width: `${(n / total) * 100}%` }} title={`${LABEL[s]}: ${n}`} />
        ))}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm">
        {entries.map(([s, n]) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-full border border-ink ${COLOR[s]}`} aria-hidden />
            {LABEL[s]} <span className="mono">{n}</span>
          </li>
        ))}
        {sampleSize !== undefined && (
          <li className="mono text-ink-2">n = {sampleSize}</li>
        )}
      </ul>
    </div>
  );
}
