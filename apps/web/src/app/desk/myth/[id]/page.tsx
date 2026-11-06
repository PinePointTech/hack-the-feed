// Placeholder: another agent replaces this page.
export default async function MythPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Myth</h1>
      <p className="mt-4 text-slate-600">Coming soon for {id}.</p>
    </main>
  );
}
