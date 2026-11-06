import { Receipts } from "./Receipts";

export default async function ReceiptsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Receipts id={id} />;
}
