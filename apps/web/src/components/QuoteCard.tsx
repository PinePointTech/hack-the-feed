import type { QuoteSource, VideoRef } from "@/contracts/types";
import { compact, exact, mss } from "@/lib/format";

const SOURCE_LABEL: Record<QuoteSource, string> = {
  transcript: "transcript",
  caption: "caption",
  on_screen_text: "on-screen text",
};

// Never embed the video: thumbnail plus link only. Hide identity when nameable is false.
export function QuoteCard({ video }: { video: VideoRef }) {
  const named = video.nameable;
  return (
    <figure className="flex gap-4 rounded-xl border border-slate-200 bg-white p-5">
      {named && video.thumbnail_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={video.thumbnail_url} alt="" className="h-28 w-20 shrink-0 rounded-md object-cover" />
      )}
      <div className="min-w-0 space-y-2">
        <blockquote className="text-xl leading-snug">&ldquo;{video.quote}&rdquo;</blockquote>
        <figcaption className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
          {named ? (
            <span>
              From a video posted by @{video.handle}
              {video.display_name && ` (${video.display_name})`}
            </span>
          ) : (
            <span>Creator not named (policy)</span>
          )}
          <span>
            {SOURCE_LABEL[video.quote_source]}
            {video.quote_start_s !== undefined && ` at ${mss(video.quote_start_s)}`}
          </span>
          <span title={`${exact(video.views)} views`}>{compact(video.views)} views</span>
          <span>{video.platform}</span>
          <a href={video.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
            Open the post
          </a>
        </figcaption>
      </div>
    </figure>
  );
}
