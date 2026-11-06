import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-24">
      <h1 className="text-5xl font-semibold">MyBuster</h1>
      <p className="text-2xl text-slate-700">Find the health myth. Get the receipts. Make the debunk.</p>
      <div className="flex gap-4">
        <Link href="/desk" className="rounded-lg bg-blue-700 px-6 py-3 text-white">Open the desk</Link>
        <Link href="/calendar" className="rounded-lg border border-slate-300 px-6 py-3">See the calendar</Link>
      </div>
    </main>
  );
}
