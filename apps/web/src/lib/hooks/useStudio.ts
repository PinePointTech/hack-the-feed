"use client";
/**
 * useStudio(mythId): every studio behaviour, headless. The view only renders what this returns.
 *
 * Brief
 * - format: Format ("stitch" default). setFormat(f) only sets it; call generateBrief() to fetch.
 * - FORMATS: Format[] in display order.
 * - generateBrief(f = format): POST /brief. Fires "Brief Generated". Resets hook, lines, checks.
 * - briefLoading: boolean. brief: Brief | null. from: "live" | "fixture" (brief source). error: string | null.
 *
 * Hooks
 * - hookId: string | undefined. selectHook(id): fires "Hook Selected" and puts the hook text in line 1.
 *
 * Script lines
 * - lines: { ...ScriptLine, status: LineStatus, check?: LineCheck }[] in order; on_screen is kept.
 *   status is "supported" | "weak" | "unsupported" | "no_claim" | "pending" (pending = edited, waiting for the check).
 * - setLineText(id, text): edits a line; about 600 ms after the last edit, POST /check for the changed lines.
 *   Weak or unsupported results fire "Claim Flagged" once per distinct line text.
 * - checkFrom: "live" | "fixture" (source of the latest check). hasUnsupported: boolean.
 *
 * Approval
 * - checklist: Ticks (the ApprovalChecklist booleans). toggle(key) flips one; video_qa_passed is set only by runQA, and nothing changes after approve().
 * - canApprove: four required ticks set, no unsupported or pending line, brief loaded, not yet approved.
 * - approve(): fires "Brief Approved" and freezes the lines. approved: boolean. approvedLines: ScriptLine[] | null.
 *
 * Handoff to Compound (Mac app, no API)
 * - copyScriptText: approved lines (or current lines before approval) with their on-screen text.
 * - copyScript(): writes copyScriptText to the clipboard. copied: boolean.
 *
 * Video
 * - video: File | null. attachVideo(file | null): stores it, fires "Video Exported" (duration when readable).
 * - runQA(): POST /qa with the approved lines and the file; fires "Video QA Completed"; a pass ticks video_qa_passed.
 * - qa: QAReport | null. qaFrom: "live" | "fixture". qaRunning: boolean.
 *
 * Publish
 * - publish(): only after approve(); POST /publish; fires "Debunk Published".
 * - publishing: boolean. published: PublishedDebunk | null. publishFrom: "live" | "fixture". receiptsHref: "/r/{id}".
 */
import { useEffect, useRef, useState } from "react";
import type { Brief, Format, LineCheck, PublishedDebunk, QAReport, ScriptLine } from "@/contracts/types";
import { api } from "@/lib/api";
import { track } from "@/lib/track";
import {
  type LineStatus, type Ticks, lineStatus, canApprove as rulesAllowApproval, changedLines, flagKey,
  copyScriptText as scriptText, unsupportedCount, seedChecks,
} from "@/lib/studio-logic";

type From = "live" | "fixture";
export type StudioLine = ScriptLine & { status: LineStatus; check?: LineCheck };
export const FORMATS: Format[] = ["stitch", "duet", "standalone", "no_camera"];
const NO_TICKS: Ticks = {
  every_claim_has_source: false, quotes_are_exact: false, targets_claim_not_person: false,
  no_minors_or_illness_stories: false, video_qa_passed: false,
};

export function useStudio(mythId: string) {
  const openedAt = useRef(Date.now());
  const [format, setFormat] = useState<Format>("stitch");
  const [briefLoading, setBriefLoading] = useState(false);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [from, setFrom] = useState<From>("live");
  const [error, setError] = useState<string | null>(null);
  const [hookId, setHookId] = useState<string>();
  const [lines, setLines] = useState<ScriptLine[]>([]);
  // Each check remembers the text it was made for; a mismatch means pending.
  const [checks, setChecks] = useState<Record<string, { text: string; check: LineCheck }>>({});
  const [checkFrom, setCheckFrom] = useState<From>("live");
  const [checklist, setChecklist] = useState<Ticks>(NO_TICKS);
  const [approvedLines, setApprovedLines] = useState<ScriptLine[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [video, setVideo] = useState<File | null>(null);
  const [qa, setQa] = useState<QAReport | null>(null);
  const [qaFrom, setQaFrom] = useState<From>("live");
  const [qaRunning, setQaRunning] = useState(false);
  const [published, setPublished] = useState<PublishedDebunk | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishFrom, setPublishFrom] = useState<From>("live");

  const linesRef = useRef<ScriptLine[]>([]);
  linesRef.current = lines;
  const sentText = useRef<Record<string, string>>({});
  const flagged = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function generateBrief(f: Format = format) {
    setFormat(f);
    setBriefLoading(true);
    setError(null);
    const t0 = performance.now();
    try {
      const { data, from } = await api.brief({ myth_id: mythId, format: f });
      const seed = seedChecks(data.script.lines, data.claims);
      clearTimeout(timer.current);
      sentText.current = Object.fromEntries(data.script.lines.map((l) => [l.id, l.text]));
      setBrief(data);
      setFrom(from);
      setHookId(undefined);
      setLines(data.script.lines);
      setChecks(Object.fromEntries(data.script.lines.map((l) => [l.id, { text: l.text, check: seed[l.id] }])));
      setCheckFrom(from);
      track("Brief Generated", {
        myth_id: mythId, format: f, source_count: data.sources.length, claim_count: data.claims.length,
        unsupported_count: unsupportedCount(data.claims), latency_ms: Math.round(performance.now() - t0),
        engine: data.claims[0]?.engine ?? "none",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBriefLoading(false);
    }
  }

  async function runCheck() {
    const sent = changedLines(linesRef.current, sentText.current);
    if (!sent.length) return;
    for (const l of sent) sentText.current[l.id] = l.text;
    try {
      const { data, from } = await api.check({ myth_id: mythId, lines: sent });
      setCheckFrom(from);
      const fresh: Record<string, { text: string; check: LineCheck }> = {};
      for (const r of data.results) {
        const s = sent.find((x) => x.id === r.line_id);
        if (!s || sentText.current[r.line_id] !== s.text) continue; // stale response
        fresh[r.line_id] = { text: s.text, check: r };
        const status = lineStatus(r);
        const key = flagKey(r.line_id, s.text);
        if ((status === "weak" || status === "unsupported") && !flagged.current.has(key)) {
          flagged.current.add(key);
          track("Claim Flagged", { myth_id: mythId, line_id: r.line_id, status, support: r.support, engine: r.engine });
        }
      }
      setChecks((c) => ({ ...c, ...fresh }));
    } catch (e) {
      // Let the next edit retry these lines.
      for (const l of sent) delete sentText.current[l.id];
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function setLineText(id: string, text: string) {
    if (approvedLines) return;
    const next = linesRef.current.map((l) => (l.id === id ? { ...l, text } : l));
    linesRef.current = next;
    setLines(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(runCheck, 600);
  }

  function selectHook(id: string) {
    const h = brief?.hooks.find((x) => x.id === id);
    if (!h || approvedLines) return;
    setHookId(id);
    track("Hook Selected", { myth_id: mythId, hook_style: h.style });
    if (lines[0]) setLineText(lines[0].id, h.text);
  }

  const studioLines: StudioLine[] = lines.map((l) => {
    const c = checks[l.id];
    const check = c && c.text === l.text ? c.check : undefined;
    return { ...l, check, status: lineStatus(check) };
  });
  const hasUnsupported = studioLines.some((l) => l.status === "unsupported");
  const canApprove = !!brief && !approvedLines && rulesAllowApproval(checklist, studioLines.map((l) => l.status));

  const toggle = (key: keyof Ticks) => {
    if (key === "video_qa_passed" || approvedLines) return; // QA ticks itself in runQA
    setChecklist((t) => ({ ...t, [key]: !t[key] }));
  };

  function approve() {
    if (!canApprove) return;
    setApprovedLines(lines);
    track("Brief Approved", {
      myth_id: mythId, format, line_count: lines.length, claim_count: lines.filter((l) => l.claim_id).length,
      minutes_since_open: Math.round((Date.now() - openedAt.current) / 60000),
    });
  }

  const copyScriptText = scriptText(approvedLines ?? lines);
  async function copyScript() {
    await navigator.clipboard.writeText(copyScriptText);
    setCopied(true);
  }

  function attachVideo(file: File | null) {
    setVideo(file);
    setQa(null);
    if (!file) return;
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    let sent = false;
    const send = (d?: number) => {
      if (sent) return;
      sent = true;
      URL.revokeObjectURL(url);
      track("Video Exported", { myth_id: mythId, tool: "compound", ...(d && Number.isFinite(d) ? { duration_s: Math.round(d) } : {}) });
    };
    v.preload = "metadata";
    v.onloadedmetadata = () => send(v.duration);
    v.onerror = () => send();
    v.src = url;
  }

  async function runQA() {
    if (!approvedLines || !video) return;
    setQaRunning(true);
    try {
      const form = new FormData();
      form.append("myth_id", mythId);
      form.append("approved_lines", JSON.stringify(approvedLines));
      form.append("file", video);
      const { data, from } = await api.qa(form);
      setQa(data);
      setQaFrom(from);
      if (data.pass) setChecklist((t) => ({ ...t, video_qa_passed: true }));
      track("Video QA Completed", {
        myth_id: mythId, pass: data.pass, issue_count: data.issues.length, frames_checked: data.frames_checked, ran_in: data.ran_in,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setQaRunning(false);
    }
  }

  async function publish() {
    if (!brief || !approvedLines || publishing) return;
    setPublishing(true);
    try {
      const { data, from } = await api.publish({
        myth_id: mythId,
        brief: { ...brief, script: { ...brief.script, format, lines: approvedLines } },
        approval: { ...checklist, approved_by: "Vi", approved_at: new Date().toISOString() },
        ...(video ? { video_url: `/video/${mythId}.mp4` } : {}),
      });
      setPublished(data);
      setPublishFrom(from);
      if (from === "live") track("Debunk Published", { myth_id: mythId, has_video: !!video, certified_by_clinician: data.certified_by_clinician });
      else if (process.env.NEXT_PUBLIC_USE_MOCKS !== "1") setError("Publish failed, showing the example receipts");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  }

  return {
    format, setFormat, FORMATS, generateBrief, briefLoading, brief, from, error,
    hookId, selectHook,
    lines: studioLines, setLineText, checkFrom, hasUnsupported,
    checklist, toggle, canApprove, approve, approved: !!approvedLines, approvedLines,
    copyScriptText, copyScript, copied,
    video, attachVideo, runQA, qa, qaFrom, qaRunning,
    publish, publishing, published, publishFrom, receiptsHref: `/r/${published?.id ?? mythId}`,
  };
}
