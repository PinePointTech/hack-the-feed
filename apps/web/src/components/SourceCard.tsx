"use client";
import type { Source } from "@/contracts/types";
import { track } from "@/lib/track";

export function SourceCard({ source, mythId, location }: { source: Source; mythId: string; location: "studio" | "receipts" }) {
  return (
    <article className="space-y-2 rounded-xl border border-slate-200 bg-white p-5">
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-lg font-medium text-blue-700 underline"
        onClick={() =>
          track("Source Clicked", { myth_id: mythId, source_id: source.id, publisher: source.publisher, location })
        }
      >
        {source.title}
      </a>
      <p className="text-sm text-slate-600">
        {source.publisher} · {source.kind.replace("_", " ")}
        {source.published && ` · ${source.published}`}
      </p>
      {source.excerpts.map((e, i) => (
        <blockquote key={i} className="border-l-4 border-slate-200 pl-3 text-slate-800">
          &ldquo;{e}&rdquo;
        </blockquote>
      ))}
    </article>
  );
}
