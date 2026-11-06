import Link from "next/link";
import { api } from "@/lib/api";
import { FixtureBadge } from "@/components/FixtureBadge";

// Stub for HTF-2: the radar agent replaces this page.
export default async function Desk() {
  const { data, from } = await api.radar();
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-12">
      <header className="flex items-center gap-4">
        <h1 className="text-3xl font-semibold">Myth radar</h1>
        <FixtureBadge from={from} />
      </header>
      <ul className="space-y-3">
        {data.myths.map((m) => (
          <li key={m.id}>
            <Link href={`/desk/myth/${m.id}`} className="block rounded-xl border border-slate-200 bg-white p-5 text-xl">
              {m.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
