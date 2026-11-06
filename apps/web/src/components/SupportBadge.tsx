import type { SupportStatus } from "@/contracts/types";

const STYLE: Record<SupportStatus, string> = {
  supported: "bg-green-100 text-green-800 ring-green-300",
  weak: "bg-amber-100 text-amber-800 ring-amber-300",
  unsupported: "bg-red-100 text-red-800 ring-red-300",
};

export function SupportBadge({ status, support }: { status?: SupportStatus; support?: number }) {
  if (!status) return null;
  return (
    <span className={`inline-flex gap-1 rounded-full px-3 py-1 text-sm font-medium ring-1 ${STYLE[status]}`}>
      {status}
      {support !== undefined && <span className="tabular-nums">{support.toFixed(2)}</span>}
    </span>
  );
}
