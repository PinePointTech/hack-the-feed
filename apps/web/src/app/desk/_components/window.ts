import { windowLabel } from "@/lib/view-model";
import type { DateWindow } from "@/contracts/types";

export { day, windowLabel } from "@/lib/view-model";
/** "Oct 7 to Nov 6, 2026" */
export const windowWithYear = (w: DateWindow) => `${windowLabel(w)}, ${w.to.slice(0, 4)}`;
