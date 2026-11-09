// Shown in place of data when the brain does not answer. Never sample data.
export function LiveUnavailable({ what }: { what: string }) {
  return (
    <main className="wrap py-16">
      <div role="status" className="grid max-w-[40rem] gap-2 rounded-3xl border border-ink px-6 py-5">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Live data unavailable</h1>
        <p className="text-ink-2">
          The brain did not return {what}. Nothing is shown in its place. Start the brain, then reload this page.
        </p>
      </div>
    </main>
  );
}

/** Inline version for a section of a page. */
export function LiveUnavailableNote({ what }: { what: string }) {
  return (
    <p role="status" className="text-ink-2">
      <strong>Live data unavailable.</strong> The brain did not return {what}. Start it, then reload.
    </p>
  );
}
