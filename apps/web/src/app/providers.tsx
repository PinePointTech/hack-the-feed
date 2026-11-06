"use client";
import { useEffect } from "react";
import { initAmplitude } from "@/lib/track";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => initAmplitude(), []);
  return <>{children}</>;
}
