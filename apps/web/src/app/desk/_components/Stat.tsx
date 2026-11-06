import { compact, exact } from "@/lib/format";

// A big number shown compact, with the exact value on hover.
export function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <div className="text-3xl font-semibold tabular-nums" title={value === undefined ? undefined : exact(value)}>
        {value === undefined ? "n/a" : compact(value)}
      </div>
      <div className="text-sm text-slate-600">{label}</div>
    </div>
  );
}
