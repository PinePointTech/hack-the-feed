import { pulledAt } from "@/lib/format";

/** "Data pulled <time>" from the response's own timestamp. */
export function DataPulled({ at }: { at?: string | null }) {
  return <span className="mono text-sm text-ink-2">{at ? `Data pulled ${pulledAt(at)}` : "Data pull time not recorded"}</span>;
}
