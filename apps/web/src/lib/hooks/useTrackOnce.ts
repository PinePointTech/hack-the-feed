"use client";
import { useEffect, useRef } from "react";
import { track } from "../track";

type Name = Parameters<typeof track>[0];
type Props<K extends Name> = Parameters<typeof track<K>>[1];

/** Fires a typed track() event once per mount (StrictMode-safe). Props may be a function, read when it fires. Returns nothing. */
export function useTrackOnce<K extends Name>(name: K, props: Props<K> | (() => Props<K>), enabled = true) {
  const sent = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    if (!enabled || sent.current) return;
    sent.current = true;
    const p = latest.current;
    track(name, typeof p === "function" ? (p as () => Props<K>)() : p);
  }, [name, enabled]);
}
