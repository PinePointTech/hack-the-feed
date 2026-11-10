import { notFound } from "next/navigation";
import { api, settle } from "@/lib/api";
import { Studio } from "./_components/Studio";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const myth = await settle(api.myth(id));
  if (!myth.ok && myth.status === 404) notFound(); // unknown myth id; a down brain still opens the studio
  const title = (myth.ok && myth.data.title) || id;
  return <Studio key={id} mythId={id} title={title} />;
}
