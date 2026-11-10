import { notFound } from "next/navigation";
import { api, settle } from "@/lib/api";
import { Receipts } from "./Receipts";

export default async function ReceiptsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Unknown myth id: 404. A short wait, since this public page must not stall on a slow brain.
  const myth = await settle(api.myth(id, 5000));
  if (!myth.ok && myth.status === 404) notFound();
  return <Receipts id={id} />;
}
