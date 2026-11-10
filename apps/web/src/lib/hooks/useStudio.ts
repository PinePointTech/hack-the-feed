"use client";
import { useEffect, useRef, useState } from "react";
import type { Brief, ClaimCheck, Format, LineCheck, PublishedDebunk, QAReport, ScriptLine } from "@/contracts/types";
import { api } from "@/lib/api";
import { track } from "@/lib/track";
import {
  type LineStatus, type Ticks, lineStatus, canApprove as rulesAllowApproval, changedLines, flagKey,
  copyScriptText as scriptText, unsupportedCount, seedChecks, sourceCoverage, canPublish, blockReason,
} from "@/lib/studio-logic";

type From = "live" | "fixture";
export type StudioLine = ScriptLine & { status: LineStatus; check?: LineCheck };
export const FORMATS: Format[] = ["stitch", "duet", "standalone", "no_camera"];
const NO_TICKS: Ticks = {
  every_claim_has_source: false, quotes_are_exact: false, targets_claim_not_person: false,
  no_minors_or_illness_stories: false, video_qa_passed: false,
};

export function useStudio(mythId: string) {
  const openedAt = useRef(0);
  const [format, setFormat] = useState<Format>("standalone");
  const [briefLoading, setBriefLoading] = useState(false);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [from, setFrom] = useState<From>("live");
  const [error, setError] = useState<string | null>(null);
  const [hookId, setHookId] = useState<string>();
  const [lines, setLines] = useState<ScriptLine[]>([]);
  // Each check remembers the text it was made for; a mismatch means pending.
  const [checks, setChecks] = useState<Record<string, { text: string; check: LineCheck; from: From }>>({});
  const [checkFrom, setCheckFrom] = useState<From>("live");
  const [checklist, setChecklist] = useState<Ticks>(NO_TICKS);
  const [approvedLines, setApprovedLines] = useState<ScriptLine[] | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [finalApproved, setFinalApproved] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [video, setVideo] = useState<File | null>(null);
  const [qa, setQa] = useState<QAReport | null>(null);
  const [qaFrom, setQaFrom] = useState<From>("live");
  const [qaRunning, setQaRunning] = useState(false);
  const [published, setPublished] = useState<PublishedDebunk | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishFrom, setPublishFrom] = useState<From>("live");

  const draftVersion = useRef(0);
  const qaVersion = useRef(0);
  const linesRef = useRef<ScriptLine[]>([]);
  const sentText = useRef<Record<string, string>>({});
  const flagged = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function resetQA() {
    qaVersion.current += 1;
    setQa(null);
    setQaRunning(false);
    setVideoUrl(null);
    setFinalApproved(false);
    setPublished(null);
  }

  function unlockScript() {
    setApprovedLines(null);
    setCopied(false);
    resetQA();
  }

  async function generateBrief(f: Format = format, refresh = false) {
    const version = ++draftVersion.current;
    clearTimeout(timer.current);
    linesRef.current = [];
    sentText.current = {};
    setLines([]);
    setChecks({});
    setBrief(null);
    setChecklist(NO_TICKS);
    setVideo(null);
    unlockScript();
    setFormat(f);
    setBriefLoading(true);
    setError(null);
    const t0 = performance.now();
    try {
      const { data, from } = await api.brief({ myth_id: mythId, format: f, refresh });
      if (version !== draftVersion.current) return;
      const seed = seedChecks(data.script.lines, data.claims);
      clearTimeout(timer.current);
      sentText.current = Object.fromEntries(data.script.lines.map((l) => [l.id, l.text]));
      setBrief(data);
      setFrom(from);
      setHookId(undefined);
      linesRef.current = data.script.lines;
      setLines(data.script.lines);
      setChecks(Object.fromEntries(data.script.lines.map((l) => [l.id, { text: l.text, check: seed[l.id], from }])));
      setCheckFrom(from);
      track("Brief Generated", {
        myth_id: mythId, format: f, source_count: data.sources.length, claim_count: data.claims.length,
        unsupported_count: unsupportedCount(data.claims), latency_ms: Math.round(performance.now() - t0),
        engine: data.claims[0]?.engine ?? "none",
      });
    } catch (e) {
      if (version === draftVersion.current) setError(`Draft unavailable. ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (version === draftVersion.current) setBriefLoading(false);
    }
  }

  // Load the brief for the default format once on open, so the evidence is on screen when the studio appears (demo 1:05).
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (autoLoaded.current) return;
    autoLoaded.current = true;
    openedAt.current = Date.now();
    void generateBrief();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runCheck() {
    const version = draftVersion.current;
    const sent = changedLines(linesRef.current, sentText.current);
    if (!sent.length) return;
    for (const l of sent) sentText.current[l.id] = l.text;
    try {
      const { data, from } = await api.check({ myth_id: mythId, lines: sent });
      if (version !== draftVersion.current) return;
      setCheckFrom(from);
      const fresh: Record<string, { text: string; check: LineCheck; from: From }> = {};
      for (const r of data.results) {
        const s = sent.find((x) => x.id === r.line_id);
        if (!s || linesRef.current.find((line) => line.id === r.line_id)?.text !== s.text) continue; // stale response
        fresh[r.line_id] = { text: s.text, check: r, from };
        const status = lineStatus(r);
        const key = flagKey(r.line_id, s.text);
        if ((status === "weak" || status === "unsupported") && !flagged.current.has(key)) {
          flagged.current.add(key);
          track("Claim Flagged", { myth_id: mythId, line_id: r.line_id, status, support: r.support, engine: r.engine });
        }
      }
      for (const line of sent) {
        if (!fresh[line.id] && linesRef.current.find((current) => current.id === line.id)?.text === line.text) {
          fresh[line.id] = { text: line.text, from: "fixture",
            check: { line_id: line.id, has_claim: false, engine: "cached", note: "Not checked (brain offline)" } };
        }
      }
      setChecks((c) => ({ ...c, ...fresh }));
    } catch (e) {
      if (version !== draftVersion.current) return;
      setChecks((previous) => ({
        ...previous,
        ...Object.fromEntries(sent.filter((line) => linesRef.current.some((current) =>
          current.id === line.id && current.text === line.text)).map((line) => [
          line.id, { text: line.text, from: "fixture", check: {
            line_id: line.id, has_claim: false, engine: "cached", note: "Not checked (brain offline)",
          } },
        ])),
      }));
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function setLineText(id: string, text: string, syncOverlay = false) {
    if (approvedLines) return;
    const next = linesRef.current.map((l) => (l.id === id
      ? { ...l, text, ...(syncOverlay || l.on_screen ? { on_screen: text } : {}) }
      : l));
    delete sentText.current[id];
    setChecks((previous) => {
      const updated = { ...previous };
      delete updated[id];
      return updated;
    });
    resetQA();
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
    if (lines[0]) setLineText(lines[0].id, h.text, true);
  }

  const studioLines = lines.map((line) => {
    const entry = checks[line.id];
    const current = entry?.text === line.text ? entry : undefined;
    return { ...line, check: current?.check, checkedFrom: current?.from, status: lineStatus(current?.check) };
  });
  const coverage = sourceCoverage(studioLines, brief?.sources ?? []);
  const effectiveChecklist = { ...checklist, every_claim_has_source: coverage,
    video_qa_passed: !!qa?.pass && qaFrom === "live" && !!videoUrl };
  const canLock = !!brief && !approvedLines && rulesAllowApproval(effectiveChecklist, studioLines.map((line) => line.status));
  const canApprove = !!approvedLines && effectiveChecklist.video_qa_passed && !!reviewer.trim() && !finalApproved;

  const toggle = (key: keyof Ticks) => {
    if (key === "video_qa_passed" || key === "every_claim_has_source" || approvedLines) return;
    setChecklist((ticks) => ({ ...ticks, [key]: !ticks[key] }));
  };

  const [editedClaims, setEditedClaims] = useState<ClaimCheck[]>([]);

  function lockScript() {
    if (!canLock || !brief) return;
    const added: ClaimCheck[] = [];
    const locked = lines.map((line) => {
      const result = checks[line.id].check;
      if (!result.has_claim) return { ...line, claim_id: undefined, source_id: undefined };
      if (brief.script.lines.some((original) => original.id === line.id && original.text === line.text && original.claim_id && original.source_id))
        return line;
      const evidence = result.evidence!.filter((citation) => brief.sources.some((source) =>
        source.id === citation.source_id && source.excerpts.includes(citation.excerpt)));
      const claim = { id: `reviewed-${line.id}`, text: line.text, evidence, support: result.support!,
        status: "supported" as const, engine: result.engine };
      added.push(claim);
      return { ...line, claim_id: claim.id, source_id: evidence[0].source_id };
    });
    setEditedClaims(added);
    setApprovedLines(locked);
  }

  function approve() {
    if (!canApprove || !approvedLines) return;
    setFinalApproved(true);
    track("Brief Approved", {
      myth_id: mythId, format, line_count: approvedLines.length, claim_count: approvedLines.filter((line) => line.claim_id).length,
      minutes_since_open: Math.round((Date.now() - openedAt.current) / 60000),
    });
  }

  const copyScriptText = scriptText(approvedLines ?? lines);
  async function copyScript() {
    await navigator.clipboard.writeText(copyScriptText);
    setCopied(true);
  }

  function attachVideo(file: File | null) {
    resetQA();
    setError(null);
    if (file && (!/\.mp4$/i.test(file.name) || file.size > 100 * 1024 * 1024)) {
      setVideo(null);
      setError("Attach an MP4 up to 100 MiB.");
      return;
    }
    setVideo(file);
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
    resetQA();
    setError(null);
    const version = qaVersion.current;
    setQaRunning(true);
    try {
      const form = new FormData();
      form.append("myth_id", mythId);
      form.append("approved_lines", JSON.stringify(approvedLines));
      form.append("file", video);
      const { data, from, videoUrl } = await api.qa(form);
      if (version !== qaVersion.current) return;
      setQa(data);
      setQaFrom(from);
      if (from === "live" && data.myth_id === mythId && data.pass) setVideoUrl(videoUrl);
      track("Video QA Completed", {
        myth_id: mythId, pass: data.pass, issue_count: data.issues.length, frames_checked: data.frames_checked, ran_in: data.ran_in,
      });
    } catch (e) {
      if (version === qaVersion.current) setError(`Video QA unavailable. ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (version === qaVersion.current) setQaRunning(false);
    }
  }

  function retryChecks() {
    for (const line of studioLines) {
      if (line.status === "failed" || line.checkedFrom === "fixture") delete sentText.current[line.id];
    }
    void runCheck();
  }

  async function publish() {
    if (!brief || !approvedLines || !videoUrl || !canPublish({ finalApproved, videoUrl, qaPass: effectiveChecklist.video_qa_passed, publishing })) return;
    setPublishing(true);
    try {
      const { data, from } = await api.publish({
        myth_id: mythId,
        brief: { ...brief, claims: [...brief.claims, ...editedClaims], script: { ...brief.script, format, lines: approvedLines } },
        approval: { ...effectiveChecklist, approved_by: reviewer.trim(), approved_at: new Date().toISOString() },
        video_url: videoUrl,
      });
      setPublished(data);
      setPublishFrom(from);
      track("Debunk Published", { myth_id: mythId, has_video: !!video, certified_by_clinician: data.certified_by_clinician });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  }

  return {
    format, FORMATS, generateBrief, briefLoading, brief, from, error,
    hookId, selectHook,
    lines: studioLines, setLineText, checkFrom, blocked: blockReason(studioLines.map((line) => line.status)),
    checklist: effectiveChecklist, toggle, canLock, lockScript, unlockScript, canApprove, approve,
    reviewer, setReviewer, finalApproved, approved: !!approvedLines, approvedLines, retryChecks,
    copyScriptText, copyScript, copied,
    video, attachVideo, runQA, qa, qaFrom, qaRunning,
    publish, publishing, published, publishFrom, receiptsHref: `/r/${published?.id ?? mythId}`,
  };
}
