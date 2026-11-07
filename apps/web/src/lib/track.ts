"use client";
import * as amplitude from "@amplitude/analytics-browser";

let started = false;
export function initAmplitude() {
  if (started || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  if (!key) return console.warn("[amp] no key, events not sent");
  amplitude.init(key, { autocapture: true });
  started = true;
  syncUser();
}

// Desk events carry a fixed user id; public pages stay anonymous. The SDK persists the id, so clear it off /desk.
function syncUser() {
  const uid = window.location.pathname.startsWith("/desk") ? "creator_demo" : undefined;
  if (amplitude.getUserId() !== uid) amplitude.setUserId(uid);
}

type Events = {
  "Radar Viewed": { myth_count: number; data_source: "live" | "fixture" };
  "Myth Opened": { myth_id: string; harm_tier: string; trend: string; from: "radar" | "calendar" | "direct"; data_source: "live" | "fixture" };
  "Brief Generated": { myth_id: string; format: string; source_count: number; claim_count: number; unsupported_count: number; latency_ms: number; engine: string };
  "Hook Selected": { myth_id: string; hook_style: string };
  "Claim Flagged": { myth_id: string; line_id: string; status: string; support?: number; engine: string };
  "Brief Approved": { myth_id: string; format: string; line_count: number; claim_count: number; minutes_since_open: number };
  "Video Exported": { myth_id: string; tool: "compound"; duration_s?: number };
  "Video QA Completed": { myth_id: string; pass: boolean; issue_count: number; frames_checked: number; ran_in: string };
  "Debunk Published": { myth_id: string; has_video: boolean; certified_by_clinician: boolean };
  "Receipts Viewed": { myth_id: string; utm_source?: string; utm_medium?: string };
  "Source Clicked": { myth_id: string; source_id: string; publisher: string; location: "receipts" | "studio" };
  "Mind Changed Vote": { myth_id: string; answer: "yes" | "no" | "already_knew" };
  "Calendar Viewed": { week_of: string; item_count: number };
  "Script Reused": { myth_id: string; from: "calendar" };
};

export function track<K extends keyof Events>(name: K, props: Events[K]) {
  initAmplitude(); // child effects run before the provider's effect, so init here too
  if (!started) return;
  syncUser();
  amplitude.track(name, props);
}
