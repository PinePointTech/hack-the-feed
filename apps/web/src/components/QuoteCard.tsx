import type { Platform, QuoteSource, VideoRef } from "@/contracts/types";
import { compact, exact, mss } from "@/lib/format";

const SOURCE_LABEL: Record<QuoteSource, string> = {
  transcript: "Transcript",
  caption: "Caption",
  on_screen_text: "On-screen text",
};
const PLATFORM: Record<Platform, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

// Never embed the video: thumbnail plus link only. Hide identity (handle, thumbnail, link) when nameable is false.
export function QuoteCard({ video }: { video: VideoRef }) {
  const named = video.nameable;
  return (
    <figure className="m-0 flex min-w-0 gap-4 rounded-3xl border border-ink bg-paper p-5">
      {named && video.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={video.thumbnail_url} alt="" className="h-28 w-20 shrink-0 rounded-2xl border border-ink object-cover" />
      ) : (
        <div
          aria-hidden="true"
          className="grid h-28 w-20 shrink-0 place-items-center rounded-2xl border border-dashed border-ink-2 p-2 text-center font-mono text-[0.625rem] leading-snug text-ink-2"
        >
          {named ? "No thumbnail yet" : "Not shown"}
        </div>
      )}
      <div className="grid min-w-0 content-start gap-3">
        <blockquote className="m-0 font-serif text-xl leading-snug">&ldquo;{video.quote}&rdquo;</blockquote>
        <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
          {named ? (
            <span className="font-semibold text-ink">
              From a video posted by @{video.handle}
              {video.display_name && ` (${video.display_name})`}
            </span>
          ) : (
            <span className="font-semibold text-ink">Creator not named (policy)</span>
          )}
          <span className="mono">
            {SOURCE_LABEL[video.quote_source]}
            {video.quote_start_s !== undefined && ` at ${mss(video.quote_start_s)}`}
          </span>
          <span className="mono" title={`${exact(video.views)} views`}>
            {compact(video.views)} views
          </span>
          <span>{PLATFORM[video.platform]}</span>
          {named && (
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center font-semibold text-ink underline"
            >
              Open the post
            </a>
          )}
        </figcaption>
      </div>
    </figure>
  );
}
