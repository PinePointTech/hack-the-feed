import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap py-16">
      <div className="grid max-w-[40rem] gap-3">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Page not found</h1>
        <p className="text-ink-2">There is no myth or page at this address.</p>
        <Link href="/desk" className="font-semibold underline underline-offset-2">See the myths</Link>
      </div>
    </main>
  );
}
