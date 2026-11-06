import { Studio } from "./_components/Studio";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Studio mythId={id} />;
}
