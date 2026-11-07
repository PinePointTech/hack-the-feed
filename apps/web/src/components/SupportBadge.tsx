import type { SupportStatus } from "@/contracts/types";

const STYLE: Record<SupportStatus, string> = {
  supported: "bg-ink text-paper",
  weak: "chip--false",
  unsupported: "chip--harmful",
};
const LABEL: Record<SupportStatus, string> = { supported: "Supported", weak: "Weak", unsupported: "Unsupported" };

export function SupportBadge({ status, support }: { status?: SupportStatus; support?: number }) {
  if (!status) return null;
  return (
    <span className={`chip gap-1.5 ${STYLE[status]}`}>
      {LABEL[status]}
      {support !== undefined && <span className="mono" title="Estimated evidence support">{Math.round(support * 100)}% support</span>}
    </span>
  );
}
