import { api } from "@/lib/api";
import { Studio } from "./_components/Studio";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await api.radar();
  const title = data.myths.find((myth) => myth.id === id)?.title ?? id;
  return <Studio key={id} mythId={id} title={title} />;
}
