import { api, settle } from "@/lib/api";
import { Studio } from "./_components/Studio";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const radar = await settle(api.radar());
  const title = (radar.ok && radar.data.myths.find((myth) => myth.id === id)?.title) || id;
  return <Studio key={id} mythId={id} title={title} />;
}
