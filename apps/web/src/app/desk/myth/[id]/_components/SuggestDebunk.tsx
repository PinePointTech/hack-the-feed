"use client";
import { useState } from "react";
import type { Brief, VideoRef } from "@/contracts/types";
import { api } from "@/lib/api";
import { track } from "@/lib/track";

const FORMAT = "standalone" as const;
type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; brief: Brief }
  | { status: "error"; message: string };

// The brain drafts hooks and a caption for a debunk on this myth. The creator edits and approves in Compound.
export function SuggestDebunk({ mythId, video }: { mythId: string; video: VideoRef }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function suggest() {
    setState({ status: "loading" });
    try {
      const { data } = await api.brief({ myth_id: mythId, format: FORMAT });
      setState({ status: "done", brief: data });
      track("Video Suggested", { myth_id: mythId, video_id: video.oriane_id, format: FORMAT, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "The suggestion failed.";
      setState({ status: "error", message });
      track("Video Suggested", { myth_id: mythId, video_id: video.oriane_id, format: FORMAT, ok: false });
    }
  }

  return (
    <div className="grid content-start gap-3 self-start">
      {state.status !== "done" && (
        <button
          type="button"
          onClick={suggest}
          disabled={state.status === "loading"}
          className="inline-flex min-h-11 w-fit items-center rounded-pill border border-ink px-[18px] font-semibold hover:bg-ink hover:text-paper disabled:opacity-60"
        >
          {state.status === "loading" ? "Drafting a debunk..." : "Suggest a debunk for Compound"}
        </button>
      )}
      {state.status === "loading" && (
        <p className="text-sm text-ink-2">The brain can take up to a minute on a cold run.</p>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-sm text-ink-2">
          {state.message} Try again later, or open the studio.
        </p>
      )}
      {state.status === "done" && (
        <div className="grid gap-3 rounded-2xl border border-ink p-4">
          <p className="mono text-xs font-semibold text-ink-2">Suggested for Compound, {state.brief.script.duration_s}s</p>
          <ul className="m-0 grid list-none gap-2 p-0">
            {state.brief.hooks.map((h) => (
              <li key={h.id} className="font-serif text-[1.0625rem] leading-normal">
                <span className="mono mr-2 text-xs text-ink-2">{h.style.replace("_", " ")}</span>
                {h.text}
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-2">Caption: {state.brief.script.caption}</p>
          <p className="text-sm text-ink-2">Call to action: {state.brief.script.cta}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <a href="https://compound.mov" target="_blank" rel="noopener noreferrer" className="underline">
              Open Compound
            </a>
            <a href={`/desk/myth/${mythId}/studio`} className="underline">
              Open the full studio
            </a>
          </div>
          <p className="text-xs text-ink-2">AI drafts, people approve.</p>
        </div>
      )}
    </div>
  );
}
