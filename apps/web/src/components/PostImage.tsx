"use client";
import { useState, type ReactNode } from "react";

/**
 * A post's thumbnail. A creator we may not name is shown blurred past recognition: the picture keeps its colors and
 * shape, never a face or a handle on screen. Falls back to `fallback` when there is no image or it fails to load.
 * The box (size, aspect, rounding) comes from className.
 */
export function PostImage({ src, named, className = "", fallback }: {
  src: string | null | undefined; named: boolean; className?: string; fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className={`grid place-content-center bg-rule text-center text-sm text-ink-2 ${className}`}>{fallback}</div>;
  return (
    <div className={`relative overflow-hidden bg-rule ${className}`}>
      {/* Oriane CDN thumbnails from three platforms; next/image domains are not configured for them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}
        className={`absolute inset-0 h-full w-full object-cover ${named ? "" : "scale-125 blur-2xl saturate-150"}`} />
      {!named && (
        <span title="The creator is not named, so the picture is blurred" className="absolute top-2 left-2 rounded-pill bg-paper/90 px-2 py-0.5 text-[0.6875rem] font-semibold text-ink">
          Blurred<span className="sr-only">: creator not named</span>
        </span>
      )}
    </div>
  );
}
