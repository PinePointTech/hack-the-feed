import { api } from "@/lib/api";
import { FixtureBadge } from "@/components/FixtureBadge";
import { MythCard } from "./_components/MythCard";
import { RadarViewed } from "./_components/RadarViewed";
import { sortMyths, windowLabel } from "@/lib/view-model";

export default async function Desk() {
  const { data, from } = await api.radar();
  const myths = sortMyths(data.myths);
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
      <RadarViewed mythCount={myths.length} from={from} />
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-4xl font-semibold">Myth radar</h1>
          <FixtureBadge from={from} />
        </div>
        <p className="text-lg text-slate-600">
          Health myths spreading on short video, {windowLabel(data.window)}. Most harmful first.
        </p>
      </header>
      {myths.length === 0 ? (
        <p className="text-lg text-slate-600">No myths found in this window.</p>
      ) : (
        <ul className="space-y-6">
          {myths.map((m) => (
            <li key={m.id}>
              <MythCard myth={m} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
