"use client";

// Last resort when a page throws while rendering, e.g. on a brain answer the shape checks did not catch.
export default function PageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="wrap py-16">
      <div role="status" className="grid max-w-[40rem] justify-items-start gap-3 rounded-3xl border border-ink px-6 py-5">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">This page could not load</h1>
        <p className="text-ink-2">Something in the data did not look right, so nothing is shown in its place.</p>
        <button type="button" onClick={reset} className="font-semibold underline underline-offset-2">Try again</button>
      </div>
    </main>
  );
}
