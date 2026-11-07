import Link from "next/link";
import { api, receiptVideoUrl } from "@/lib/api";

// Our published debunk video for this myth. Live data only: the fixture is the lymphatic placeholder.
export async function DebunkVideo({ id }: { id: string }) {
  const { data: p, from } = await api.published(id);
  if (from !== "live" || p.id !== id || !p.video_url) return null;
  return (
    <figure className="m-0 grid w-full max-w-[320px] gap-2.5">
      <video
        controls
        playsInline
        preload="metadata"
        src={receiptVideoUrl(p.video_url)}
        className="aspect-[9/16] w-full rounded-frame bg-ink object-contain"
      />
      <figcaption className="flex flex-wrap items-center gap-x-3 text-[0.9375rem] font-semibold text-ink-2">
        Our published debunk
        <Link href={`/r/${id}`} className="inline-flex min-h-11 items-center text-ink underline">
          See the receipts
        </Link>
      </figcaption>
    </figure>
  );
}
