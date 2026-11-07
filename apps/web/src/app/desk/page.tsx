import { api } from "@/lib/api";
import { FixtureBadge } from "@/components/FixtureBadge";
import { MythCard } from "./_components/MythCard";
import { RadarViewed } from "./_components/RadarViewed";
import { windowWithYear } from "./_components/window";
import { sortMyths } from "@/lib/view-model";

export default async function Desk() {
  const { data, from } = await api.radar();
  const myths = sortMyths(data.myths);
  return (
    <main className="wrap grid gap-8 pt-10 pb-24 min-[1100px]:pt-14">
      <RadarViewed mythCount={myths.length} from={from} />
      <header className="grid gap-4 border-b border-ink pb-6">
        <p className="mono text-xs font-semibold text-ink-2">Creator mode, myth radar</p>
        <h1 className="text-[clamp(2.25rem,1.3rem+2.8vw,3.75rem)] leading-[1] font-extrabold tracking-[-0.03em] [font-stretch:90%] [font-variation-settings:'opsz'_96]">
          Health myths <em className="kw kw-mark">trending</em> in this window
        </h1>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <p className="text-[1.125rem] text-ink-2">Ordered by harm tier, then claim views within each tier.</p>
          <span className="mono text-sm text-ink-2">{windowWithYear(data.window)}</span>
          <FixtureBadge from={from} />
        </div>
      </header>
      {myths.length === 0 ? (
        <p className="text-[1.125rem] text-ink-2">No myths found in this window.</p>
      ) : (
        <ol className="m-0 grid list-none grid-cols-1 gap-5 p-0 min-[1100px]:grid-cols-3 min-[1100px]:items-start min-[1100px]:[&>li:nth-child(3n+2)]:mt-14 min-[1100px]:[&>li:nth-child(3n+3)]:mt-6">
          {myths.map((m, i) => (
            <li key={m.id} className="min-w-0">
              <MythCard myth={m} rank={i + 1} fixture={from === "fixture"} />
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
