"use client";
import type { Source } from "@/contracts/types";
import { track } from "@/lib/track";

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function SourceCard({ source, mythId, location }: { source: Source; mythId: string; location: "studio" | "receipts" }) {
  return (
    <article className="grid min-w-0 content-start gap-1.5 rounded-3xl border border-ink bg-paper px-5 py-[18px]">
      <span className="mono text-xs font-semibold text-ink-2">{source.publisher}</span>
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block min-h-11 py-1 font-serif text-lg leading-snug font-semibold [overflow-wrap:anywhere]"
        onClick={() =>
          track("Source Clicked", { myth_id: mythId, source_id: source.id, publisher: source.publisher, location })
        }
      >
        {source.title}
      </a>
      <span className="mono text-xs text-ink-2 [overflow-wrap:anywhere]">
        {host(source.url)} · {source.kind.replace("_", " ")}
        {source.published && ` · ${source.published}`}
      </span>
      {source.excerpts.map((e, i) => (
        <blockquote key={i} className="m-0 mt-2 border-t border-rule pt-3 font-serif text-[1.0625rem] leading-normal">
          &ldquo;{e}&rdquo;
        </blockquote>
      ))}
    </article>
  );
}
