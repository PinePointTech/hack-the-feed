import { compact, exact } from "@/lib/format";

// One dt/dd pair for a <dl>: a mono number shown compact, with the exact value on hover.
// A missing value renders nothing, so pages show only the numbers that exist (never "n/a" or 0).
export function Stat({ label, value, card }: { label: string; value?: number; card?: boolean }) {
  if (value === undefined) return null;
  return (
    <div
      className={`grid min-w-0 content-start gap-0.5 ${card ? "rounded-3xl border border-ink bg-paper px-[22px] py-5" : ""}`}
    >
      <dt className={card ? "text-[0.9375rem] font-bold" : "text-[0.8125rem] text-ink-2"}>{label}</dt>
      <dd
        className={`mono m-0 leading-[1.15] font-semibold [overflow-wrap:anywhere] ${
          card ? "text-[clamp(1.75rem,1.4rem+1.4vw,2.5rem)]" : "text-[1.5rem]"
        }`}
        title={exact(value)}
      >
        {compact(value)}
      </dd>
    </div>
  );
}
