import type { Stance } from "@/contracts/types";

const COLOR: Record<Stance, string> = {
  promotes: "bg-red-500",
  debunks: "bg-green-500",
  neutral: "bg-slate-400",
  ad: "bg-amber-400",
  unrelated: "bg-slate-200",
};

export function StanceBar({ counts, sampleSize }: { counts: Partial<Record<Stance, number>>; sampleSize?: number }) {
  const entries = (Object.keys(COLOR) as Stance[]).filter((s) => (counts[s] ?? 0) > 0).map((s) => [s, counts[s]!] as const);
  const total = entries.reduce((a, [, n]) => a + n, 0);
  if (!total) return <p className="text-slate-600">No stance data yet</p>;
  return (
    <div className="space-y-2">
      <div className="flex h-4 overflow-hidden rounded-full">
        {entries.map(([s, n]) => (
          <div key={s} className={COLOR[s]} style={{ width: `${(n / total) * 100}%` }} title={`${s}: ${n}`} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        {entries.map(([s, n]) => (
          <li key={s} className="flex items-center gap-1">
            <span className={`h-3 w-3 rounded-full ${COLOR[s]}`} />
            {s} {n}
          </li>
        ))}
        {sampleSize !== undefined && <li>n = {sampleSize}</li>}
      </ul>
    </div>
  );
}
