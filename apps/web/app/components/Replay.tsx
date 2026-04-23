"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import AttackChain from "./AttackChain";

import { ENGINE } from "../lib/engine";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentEvent {
  id: string;
  seq: number;
  type: string;
  payload: Record<string, unknown>;
}

interface WorldSnapshot {
  inbox: Array<{ id: string; from: string; subject: string; read: boolean }>;
  tickets?: Array<{ id: string; customerId: string; subject: string; status: string; priority: string }>;
  customers: Array<{ id: string; name: string; email: string; company: string; mrr: number; tier?: string; piiClass?: string }>;
  sentEmails: Array<{ to: string; subject: string }>;
  slackLog: Array<{ channel: string; message: string }>;
  refunds?: Array<{ id: string; customerId: string; amount: number; reason: string }>;
}

interface Snapshot {
  seq: number;
  world: WorldSnapshot;
  events: AgentEvent[];
}

interface BlastRadius {
  recordsAccessed: number;
  piiClassesExposed: string[];
  moneyDisbursed: number;
  externalEmailsSent: string[];
  externalEmailsBlocked: string[];
  moneyInterdicted: number;
  piiExfiltrationAttempted: boolean;
  actionsExecuted: number;
  actionsInterdicted: number;
  interdictedByPolicy: number;
  interdictedByPrecog: number;
  reversible: boolean;
  severity: string;
  summary: string;
}

interface ForkResult {
  forkRunId: string;
  originalEvents: AgentEvent[];
  forkEvents: AgentEvent[];
  narration: string;
}

interface Recommendation {
  title: string;
  rationale: string;
  policyHint?: string;
}

interface RunAnalysis {
  executiveSummary: string;
  riskGrade: string;
  recommendations: Recommendation[];
  keyInterdictions: Array<{ seq: number; what: string; why: string; source: string }>;
}

interface Policy {
  id: string;
  name: string;
  description: string;
  action: string;
  severity: string;
  enabled: boolean;
  conditions: unknown;
  when?: unknown[];
  reasoning?: string;
  source?: string;
  createdAt?: number;
}

// ─── Intelligence types (mirror engine/analysis/intelligence) ────────────────

interface ThreatProfile {
  sophistication: number;
  sophisticationLabel: string;
  motivation: string;
  technique: string;
  mitreTactic: string;
  nextMove: string;
  attackerType: string;
}

interface BoardBriefing {
  headline: string;
  damagePrevented: string;
  whatHappened: string;
  whyItMatters: string;
  whatNext: string;
}

interface Intelligence {
  threatProfile: ThreatProfile;
  narrative: string;
  boardBriefing: BoardBriefing;
  thinkingTokens?: number;
}

// ─── Retroactive Surgery types (mirror @sentinel/shared/retroactive) ──────────

interface SurgeryAffectedRun {
  runId: string;
  eventSeq: number;
  tool: string;
  estimatedImpact?: number;
}
interface SurgeryCounterfactual {
  wouldHaveBlockedCount: number;
  additionalMoneyInterdicted: number;
  affectedRuns: SurgeryAffectedRun[];
  totalRunsAnalyzed: number;
}
interface SurgeryBypass {
  runId: string;
  seq: number;
  tool: string;
  args: Record<string, unknown>;
  verdict: string;
  reasoning: string;
}
interface SurgeryResult {
  policy: Policy;
  bypassEvent: SurgeryBypass;
  counterfactual: SurgeryCounterfactual;
  attempts: number;
  thinkingTokens?: number;
  contextTokens?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function eventColor(ev: AgentEvent): string {
  if (ev.type === "decision") {
    const v = (ev.payload as { verdict?: string }).verdict;
    if (v === "ALLOW") return "#2DD4A4";
    if (v === "PAUSE") return "#F7B955";
    if (v === "BLOCK") return "#FF5A5A";
  }
  if (ev.type === "tool_result") return "#8A8A93";
  return "#F5F5F7";
}

function eventIcon(ev: AgentEvent): string {
  if (ev.type === "tool_call") return (ev.payload.tool as string)?.[0]?.toUpperCase() ?? "T";
  if (ev.type === "decision") {
    const v = (ev.payload as { verdict?: string }).verdict;
    if (v === "ALLOW") return "✓";
    if (v === "PAUSE") return "⏸";
    if (v === "BLOCK") return "✗";
  }
  if (ev.type === "tool_result") return "←";
  return "•";
}

function forkEventLabel(ev: AgentEvent): { label: string; detail: string } {
  if (ev.type === "tool_call") {
    const src = ev.payload.source === "policy" ? " [P]" : ev.payload.source === "pre-cog" ? " [O]" : "";
    return { label: String(ev.payload.tool), detail: JSON.stringify(ev.payload.args ?? {}).slice(0, 60) };
  }
  if (ev.type === "decision") {
    const v = ev.payload.verdict as string;
    return { label: v, detail: (ev.payload.reasoning as string)?.slice(0, 60) ?? "" };
  }
  return { label: ev.type, detail: "" };
}

function verdictColor(v: string) {
  if (v.startsWith("ALLOW")) return "#2DD4A4";
  if (v.startsWith("PAUSE")) return "#F7B955";
  if (v.startsWith("BLOCK")) return "#FF5A5A";
  return "#F5F5F7";
}

function severityColor(s: string) {
  if (s === "critical") return "#FF5A5A";
  if (s === "high") return "#F7B955";
  return "#2DD4A4";
}

// ─── Share button ─────────────────────────────────────────────────────────────

function ShareButton({ runId }: { runId: string }) {
  const [copied, setCopied] = useState(false);
  function share() {
    const url = `${window.location.origin}/share/${runId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={share}
      className="text-[10px] font-mono px-2 py-0.5 rounded transition-all hover:brightness-125"
      style={{ background: "#14141A", color: copied ? "#2DD4A4" : "#8A8A93", border: "1px solid #262630" }}
      title="Copy shareable link to this run"
    >
      {copied ? "✓ Copied" : "⤢ Share"}
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Replay({
  runId,
  visible,
  autoAnalyze,
  onAutoAnalyzeConsumed,
  onNavigate,
}: {
  runId: string | null;
  visible?: boolean;
  autoAnalyze?: boolean;
  onAutoAnalyzeConsumed?: () => void;
  onNavigate?: (tab: string) => void;
}) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [cursor, setCursor] = useState(0);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [editJson, setEditJson] = useState("");
  const [forking, setForking] = useState(false);
  const [forkResult, setForkResult] = useState<ForkResult | null>(null);
  const [originalBlast, setOriginalBlast] = useState<BlastRadius | null>(null);
  const [forkBlast, setForkBlast] = useState<BlastRadius | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [chainView, setChainView] = useState<"timeline" | "chain">("timeline");
  const [analysis, setAnalysis] = useState<RunAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisThinking, setAnalysisThinking] = useState("");
  const [synthPreviews, setSynthPreviews] = useState<Map<number, Policy>>(new Map());
  const [synthLoading, setSynthLoading] = useState<number | null>(null);
  const [adoptedIds, setAdoptedIds] = useState<Set<string>>(new Set());

  // Intelligence state
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligenceThinking, setIntelligenceThinking] = useState("");
  const [boardExpanded, setBoardExpanded] = useState(false);

  // Active stream refs for cleanup on unmount / run change
  const analysisSourceRef = useRef<EventSource | null>(null);
  const intelligenceControllerRef = useRef<AbortController | null>(null);

  // Retroactive Surgery state
  const [surgeryOpen, setSurgeryOpen] = useState(false);
  const [surgeryRunning, setSurgeryRunning] = useState(false);
  const [surgeryThinking, setSurgeryThinking] = useState("");
  const [surgeryAttempt, setSurgeryAttempt] = useState<{ n: number; status: string; detail?: string } | null>(null);
  const [surgeryResult, setSurgeryResult] = useState<SurgeryResult | null>(null);
  const [surgeryError, setSurgeryError] = useState<string | null>(null);
  const [surgeryAdopted, setSurgeryAdopted] = useState(false);

  useEffect(() => {
    if (!runId || !visible) return;
    // Abort any streams from the previous run
    analysisSourceRef.current?.close();
    analysisSourceRef.current = null;
    intelligenceControllerRef.current?.abort();
    intelligenceControllerRef.current = null;
    setForkResult(null);
    setOriginalBlast(null);
    setForkBlast(null);
    setAnalysis(null);
    setAnalysisLoading(false);
    setAnalysisThinking("");
    setIntelligence(null);
    setIntelligenceLoading(false);
    setIntelligenceThinking("");
    setBoardExpanded(false);
    setSynthPreviews(new Map());
    setAdoptedIds(new Set());
    fetch(`${ENGINE}/timeline/${runId}`)
      .then((r) => r.json())
      .then((evts: AgentEvent[]) => {
        setEvents(evts);
        if (evts.length > 0) setCursor(evts[evts.length - 1].seq);
      });
  }, [runId, visible]);

  // Clean up any active streams on unmount — avoids leaks and stray
  // state updates after the component is gone.
  useEffect(() => {
    return () => {
      analysisSourceRef.current?.close();
      analysisSourceRef.current = null;
      intelligenceControllerRef.current?.abort();
      intelligenceControllerRef.current = null;
    };
  }, []);

  // Auto Demo: trigger analysis automatically when signaled from Shell
  useEffect(() => {
    if (!autoAnalyze || !visible || !runId || analysisLoading) return;
    onAutoAnalyzeConsumed?.();
    const t = setTimeout(() => startAnalysis(), 900);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnalyze, visible, runId]);

  useEffect(() => {
    if (!runId || cursor === 0) return;
    fetch(`${ENGINE}/timeline/${runId}/snapshot/${cursor}`)
      .then((r) => r.json())
      .then((s: Snapshot) => {
        setSnap(s);
        setEditJson(JSON.stringify(s.world, null, 2));
      });
  }, [runId, cursor]);

  useEffect(() => {
    if (!visible || events.length === 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") {
        setCursor((c) => {
          const idx = events.findIndex((ev) => ev.seq === c);
          return idx > 0 ? (events[idx - 1]?.seq ?? c) : c;
        });
      }
      if (e.key === "ArrowRight") {
        setCursor((c) => {
          const idx = events.findIndex((ev) => ev.seq === c);
          return idx < events.length - 1 ? (events[idx + 1]?.seq ?? c) : c;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, events]);

  const handleFork = useCallback(async () => {
    if (!runId || !editJson) return;
    setForking(true);
    setForkResult(null);
    setOriginalBlast(null);
    setForkBlast(null);
    try {
      const parsed = JSON.parse(editJson);
      const res = await fetch(`${ENGINE}/fork/${runId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromSeq: cursor, editedWorld: parsed }),
      });
      if (!res.ok) throw new Error(`Fork failed: ${res.status}`);
      const data: ForkResult = await res.json();
      setForkResult(data);

      const [origRes, forkRes] = await Promise.all([
        fetch(`${ENGINE}/analysis/${runId}/blast`),
        fetch(`${ENGINE}/analysis/${data.forkRunId}/blast`),
      ]);
      const [origJson, forkJson] = await Promise.all([origRes.json(), forkRes.json()]);
      if (origJson.blast) setOriginalBlast(origJson.blast);
      if (forkJson.blast) setForkBlast(forkJson.blast);
    } catch (err) {
      console.error("Fork failed:", err);
    } finally {
      setForking(false);
    }
  }, [runId, cursor, editJson]);

  async function downloadReport() {
    if (!runId) return;
    setReportLoading(true);
    try {
      const res = await fetch(`${ENGINE}/analysis/${runId}/incident-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const md = await res.text();
      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sentinel-incident-${runId?.slice(0, 8) ?? "run"}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
    setReportLoading(false);
  }

  function startAnalysis() {
    if (!runId || analysisLoading) return;
    // Close any previous stream first
    analysisSourceRef.current?.close();
    setAnalysisLoading(true);
    setAnalysis(null);
    setAnalysisThinking("");
    setSynthPreviews(new Map());
    setAdoptedIds(new Set());
    const es = new EventSource(`${ENGINE}/analysis/${runId}/stream`);
    analysisSourceRef.current = es;
    es.addEventListener("thinking_delta", (e) => {
      setAnalysisThinking((prev) => prev + (e as MessageEvent).data);
    });
    es.addEventListener("result", (e) => {
      setAnalysis(JSON.parse((e as MessageEvent).data) as RunAnalysis);
      setAnalysisLoading(false);
      es.close();
      analysisSourceRef.current = null;
    });
    es.addEventListener("done", () => { setAnalysisLoading(false); es.close(); analysisSourceRef.current = null; });
    es.addEventListener("error", () => { setAnalysisLoading(false); es.close(); analysisSourceRef.current = null; });
  }

  async function startIntelligence() {
    if (!runId || intelligenceLoading) return;
    // Abort any previous stream first
    intelligenceControllerRef.current?.abort();
    const controller = new AbortController();
    intelligenceControllerRef.current = controller;
    setIntelligenceLoading(true);
    setIntelligenceThinking("");
    setIntelligence(null);

    try {
      const res = await fetch(`${ENGINE}/analysis/${runId}/intelligence`, { method: "POST", signal: controller.signal });
      if (!res.body) throw new Error("no response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        if (controller.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const lines = frame.split("\n");
          let eventName = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          if (eventName === "thinking_delta") {
            setIntelligenceThinking((t) => t + data);
          } else if (eventName === "result") {
            try { setIntelligence(JSON.parse(data) as Intelligence); } catch {}
          }
        }
      }
    } catch {
      // swallow — either user-abort or network error
    } finally {
      if (intelligenceControllerRef.current === controller) {
        intelligenceControllerRef.current = null;
      }
      setIntelligenceLoading(false);
    }
  }

  function exportBoardBriefing() {
    if (!intelligence || !runId) return;
    const bb = intelligence.boardBriefing;
    const md = [
      `# ${bb.headline}`,
      ``,
      `*${bb.damagePrevented}*`,
      ``,
      `---`,
      ``,
      `## What happened`,
      bb.whatHappened,
      ``,
      `## Why it matters`,
      bb.whyItMatters,
      ``,
      `## What's next`,
      bb.whatNext,
      ``,
      `---`,
      ``,
      `*Generated by Sentinel · Opus 4.7 · Run \`${runId.slice(0, 12)}\`*`,
    ].join("\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `board-briefing-${runId.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function synthesizeRec(rec: Recommendation, idx: number) {
    if (!runId || synthLoading !== null) return;
    setSynthLoading(idx);
    try {
      const res = await fetch(`${ENGINE}/analysis/${runId}/synthesize-recommendation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyHint: rec.policyHint, title: rec.title }),
      });
      if (res.ok) {
        const data = await res.json() as { policy: Policy };
        setSynthPreviews((prev) => new Map(prev).set(idx, data.policy));
      }
    } catch {}
    setSynthLoading(null);
  }

  async function adoptPolicy(policy: Policy) {
    try {
      const res = await fetch(`${ENGINE}/policies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      if (res.ok) setAdoptedIds((prev) => new Set(prev).add(policy.id));
    } catch {}
  }

  // ─── Retroactive Surgery ─────────────────────────────────────────────────
  async function runSurgery() {
    if (!runId || surgeryRunning) return;
    setSurgeryOpen(true);
    setSurgeryRunning(true);
    setSurgeryThinking("");
    setSurgeryAttempt(null);
    setSurgeryResult(null);
    setSurgeryError(null);
    setSurgeryAdopted(false);

    try {
      const res = await fetch(`${ENGINE}/analysis/${runId}/retroactive-surgery`, { method: "POST" });
      if (!res.body) throw new Error("no response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const lines = frame.split("\n");
          let eventName = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;

          if (eventName === "thinking_delta") {
            setSurgeryThinking((prev) => prev + data);
          } else if (eventName === "attempt") {
            try {
              const a = JSON.parse(data);
              setSurgeryAttempt({ n: a.attempt, status: a.status, detail: a.detail });
            } catch {}
          } else if (eventName === "result") {
            try { setSurgeryResult(JSON.parse(data)); } catch { setSurgeryError("failed to parse result"); }
          } else if (eventName === "error") {
            try { setSurgeryError(JSON.parse(data).error ?? data); } catch { setSurgeryError(data); }
          }
        }
      }
    } catch (e) {
      setSurgeryError(e instanceof Error ? e.message : String(e));
    } finally {
      setSurgeryRunning(false);
    }
  }

  async function adoptSurgeryPolicy() {
    if (!surgeryResult) return;
    try {
      const res = await fetch(`${ENGINE}/policies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(surgeryResult.policy),
      });
      if (res.ok) setSurgeryAdopted(true);
    } catch {}
  }

  if (!runId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#14141A", border: "1px solid #262630" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A8A93" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <div className="text-center space-y-1.5">
          <p className="font-mono text-sm font-semibold" style={{ color: "#F5F5F7" }}>No incident to investigate</p>
          <p className="font-mono text-xs max-w-xs leading-relaxed" style={{ color: "#8A8A93" }}>
            Run an agent scenario first — then come back here to scrub the timeline, edit world state, and branch to an alternate reality.
          </p>
        </div>
        {onNavigate && (
          <button
            onClick={() => onNavigate("Runtime")}
            className="px-4 py-2 rounded text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110"
            style={{ background: "#A78BFA", color: "#0A0A0D" }}
          >
            ▶  Run Agent →
          </button>
        )}
      </div>
    );
  }

  const currentEvt = snap?.events.find((e) => e.seq === cursor);

  // Does this run have a Pre-cog bypass (BLOCK/PAUSE not caught by any policy)?
  // If yes, "Fix Retroactively" is available.
  const hasBypass = events.some((ev, i) => {
    if (ev.type !== "decision") return false;
    const p = ev.payload as { verdict?: string; source?: string };
    if (p.source !== "pre-cog") return false;
    if (p.verdict !== "BLOCK" && p.verdict !== "PAUSE") return false;
    const prev = events[i - 1];
    return prev?.type === "tool_call";
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#0A0A0D" }}>

      {/* ── Scrubber ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b shrink-0" style={{ borderColor: "#262630" }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
            Investigate
          </span>
          <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>{events.length} events</span>
          {chainView === "timeline" && (
            <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>← → to scrub</span>
          )}
          {runId && (
            <ShareButton runId={runId} />
          )}
          {/* View toggle */}
          <div className="flex rounded overflow-hidden ml-auto" style={{ border: "1px solid #262630" }}>
            <button
              onClick={() => setChainView("timeline")}
              className="px-2.5 py-1 text-[9px] font-mono transition-all"
              style={{
                background: chainView === "timeline" ? "#1C1C24" : "transparent",
                color: chainView === "timeline" ? "#F5F5F7" : "#8A8A93",
              }}
            >
              Timeline
            </button>
            <button
              onClick={() => setChainView("chain")}
              className="px-2.5 py-1 text-[9px] font-mono transition-all"
              style={{
                background: chainView === "chain" ? "#1C1C24" : "transparent",
                color: chainView === "chain" ? "#F5F5F7" : "#8A8A93",
              }}
            >
              Attack Chain
            </button>
          </div>
        </div>
        {chainView === "timeline" && (
        <div className="flex gap-1 flex-wrap mb-2">
          {events.map((ev) => {
            const isCurrent = ev.seq === cursor;
            const color = eventColor(ev);
            return (
              <button
                key={ev.id}
                onClick={() => setCursor(ev.seq)}
                className="flex items-center gap-0.5 px-1.5 py-1 rounded text-[10px] font-mono transition-all duration-100"
                style={{
                  background: isCurrent ? color + "20" : "#14141A",
                  border: isCurrent ? `1px solid ${color}` : "1px solid #1C1C24",
                  color: isCurrent ? color : "#8A8A93",
                  transform: isCurrent ? "scale(1.08)" : undefined,
                }}
              >
                <span>{eventIcon(ev)}</span>
                <span>#{ev.seq}</span>
              </button>
            );
          })}
        </div>
        )}
        {chainView === "chain" && (
          <div className="mb-2">
            <AttackChain
              events={events}
              onSelectSeq={setCursor}
              selectedSeq={cursor}
            />
          </div>
        )}
        {events.length > 0 && (
          <input
            type="range"
            min={events[0]?.seq ?? 1}
            max={events[events.length - 1]?.seq ?? 1}
            value={cursor}
            onChange={(e) => setCursor(Number(e.target.value))}
            className="w-full"
          />
        )}
      </div>

      {/* ── World state + Edit panel ──────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row shrink-0" style={{ borderBottom: "1px solid #262630" }}>
        {/* World state */}
        <div className="flex-1 min-w-0 overflow-y-auto p-4 lg:border-r border-b lg:border-b-0" style={{ borderColor: "#262630", minHeight: "280px" }}>
          {currentEvt && (
            <div
              className="mb-3 p-2.5 rounded-lg"
              style={{ background: eventColor(currentEvt) + "08", border: `1px solid ${eventColor(currentEvt)}25` }}
            >
              <span className="text-[10px] font-mono uppercase tracking-widest mr-2" style={{ color: "#8A8A93" }}>
                Event #{cursor}
              </span>
              <span className="text-xs font-mono font-bold" style={{ color: eventColor(currentEvt) }}>
                {currentEvt.type === "tool_call"
                  ? `${currentEvt.payload.tool}(${JSON.stringify(currentEvt.payload.args).slice(0, 40)})`
                  : currentEvt.type === "decision"
                  ? `${currentEvt.payload.verdict} — ${String(currentEvt.payload.reasoning ?? "").slice(0, 60)}`
                  : currentEvt.type}
              </span>
            </div>
          )}

          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: "#8A8A93" }}>
            World at #{cursor}
          </div>

          {snap && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Tickets", value: snap.world.tickets?.length ?? 0, color: "#F5F5F7" },
                  { label: "Refunds", value: snap.world.refunds?.length ?? 0, color: snap.world.refunds?.length ? "#F7B955" : "#8A8A93" },
                  { label: "Emails sent", value: snap.world.sentEmails.length, color: snap.world.sentEmails.length > 0 ? "#FF5A5A" : "#2DD4A4" },
                ].map((s) => (
                  <div key={s.label} className="p-2 rounded text-center" style={{ background: "#14141A" }}>
                    <div className="text-lg font-mono font-bold" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[9px] font-mono uppercase" style={{ color: "#8A8A93" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {snap.world.tickets && snap.world.tickets.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono mb-1" style={{ color: "#F5F5F7" }}>Tickets</div>
                  {snap.world.tickets.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 px-2.5 py-1 rounded mb-1 text-xs font-mono" style={{ background: "#14141A" }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.status === "open" ? "#F7B955" : t.status === "resolved" ? "#2DD4A4" : "#8A8A93" }} />
                      <span className="truncate" style={{ color: "#F5F5F7" }}>{t.subject}</span>
                      <span className="shrink-0 ml-auto" style={{ color: "#8A8A93" }}>{t.status}</span>
                    </div>
                  ))}
                </div>
              )}

              {snap.world.sentEmails.length > 0 && (
                <div>
                  <div className="text-[10px] font-mono mb-1" style={{ color: "#FF5A5A" }}>Sent emails ⚠</div>
                  {snap.world.sentEmails.map((e, i) => (
                    <div key={i} className="text-xs font-mono px-2.5 py-1 rounded mb-1" style={{ background: "#14141A", color: "#FF5A5A" }}>
                      → {e.to}: {e.subject}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Edit + fork */}
        <div className="w-full lg:w-[380px] lg:shrink-0 flex flex-col p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: "#8A8A93" }}>
            Edit World State
          </div>
          <p className="text-[10px] font-mono mb-2" style={{ color: "#8A8A93" }}>
            Modify JSON · press Branch to replay from #{cursor} in an alternate timeline
          </p>
          <textarea
            value={editJson}
            onChange={(e) => setEditJson(e.target.value)}
            className="flex-1 rounded-lg p-3 text-[10px] font-mono resize-none focus:outline-none focus:ring-1 focus:ring-[#7DD3FC]"
            style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630", minHeight: "140px" }}
            spellCheck={false}
          />
          <button
            onClick={handleFork}
            disabled={forking}
            className="mt-2 px-4 py-2 rounded text-xs font-mono font-medium transition-all duration-150 active:scale-95 disabled:opacity-40 hover:brightness-110"
            style={{ background: "#7DD3FC", color: "#0A0A0D" }}
          >
            {forking ? "Branching..." : "⎇  Branch from here"}
          </button>
        </div>
      </div>

      {/* ── Opus Analysis panel ──────────────────────────────────────── */}
      <div className="shrink-0 border-b" style={{ borderColor: "#262630" }}>
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid #1C1C24" }}>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA]" />
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
              Opus Analysis
            </span>
            {analysis && (
              <span
                className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                style={{
                  background: analysis.riskGrade === "A+" || analysis.riskGrade === "A"
                    ? "rgba(45,212,164,0.12)" : "rgba(247,185,85,0.12)",
                  color: analysis.riskGrade === "A+" || analysis.riskGrade === "A" ? "#2DD4A4" : "#F7B955",
                  border: `1px solid ${analysis.riskGrade === "A+" || analysis.riskGrade === "A" ? "rgba(45,212,164,0.3)" : "rgba(247,185,85,0.3)"}`,
                }}
              >
                {analysis.riskGrade}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasBypass && (
              <button
                onClick={runSurgery}
                disabled={surgeryRunning}
                title="Opus synthesizes a deterministic policy that would have blocked this bypass — validated against all clean history"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-50"
                style={{ background: "rgba(255,90,90,0.08)", color: "#FF5A5A", border: "1px solid rgba(255,90,90,0.25)" }}
              >
                <span className={surgeryRunning ? "animate-spin" : ""}>🔧</span>
                {surgeryRunning ? "Operating…" : "Fix Retroactively"}
              </button>
            )}
            {!analysis && (
              <button
                onClick={startAnalysis}
                disabled={analysisLoading}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-50"
                style={{ background: "rgba(167,139,250,0.1)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.3)" }}
              >
                <span className={analysisLoading ? "animate-spin" : ""}>◈</span>
                {analysisLoading ? "Analyzing…" : "Analyze Run →"}
              </button>
            )}
          </div>
        </div>

        {/* Thinking stream */}
        {analysisLoading && (
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-1 h-1 rounded-full bg-[#A78BFA] animate-pulse" />
              <span className="text-[10px] font-mono" style={{ color: "#A78BFA" }}>Opus extended thinking…</span>
            </div>
            {analysisThinking && (
              <p className="text-[10px] font-mono leading-relaxed" style={{ color: "#A78BFA", opacity: 0.6 }}>
                {analysisThinking.slice(-400)}
              </p>
            )}
          </div>
        )}

        {/* Analysis result */}
        {analysis && (
          <div className="px-4 py-3 space-y-4">
            <p className="text-xs font-mono leading-relaxed" style={{ color: "#F5F5F7", opacity: 0.85 }}>
              {analysis.executiveSummary}
            </p>

            {analysis.recommendations.length > 0 && (
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: "#8A8A93" }}>
                  Hardening Recommendations
                </div>
                <div className="space-y-2">
                  {analysis.recommendations.map((rec, idx) => {
                    const preview = synthPreviews.get(idx);
                    const isAdopted = preview ? adoptedIds.has(preview.id) : false;
                    return (
                      <div
                        key={idx}
                        className="rounded-lg p-3"
                        style={{ background: "#14141A", border: "1px solid #1C1C24" }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono font-semibold" style={{ color: "#F5F5F7" }}>{rec.title}</p>
                            <p className="text-[11px] font-mono mt-0.5 leading-relaxed" style={{ color: "#8A8A93" }}>{rec.rationale}</p>
                          </div>
                          <div className="shrink-0">
                            {isAdopted ? (
                              <span className="text-[9px] font-mono" style={{ color: "#2DD4A4" }}>✓ Adopted</span>
                            ) : rec.policyHint && !preview ? (
                              <button
                                onClick={() => synthesizeRec(rec, idx)}
                                disabled={synthLoading !== null}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-40"
                                style={{ background: "rgba(99,102,241,0.1)", color: "#818CF8", border: "1px solid rgba(99,102,241,0.3)" }}
                              >
                                {synthLoading === idx ? "…" : "→ Harden"}
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {/* Policy preview */}
                        {preview && !isAdopted && (
                          <div className="mt-2.5 p-2.5 rounded" style={{ background: "#0A0A0D", border: "1px solid rgba(99,102,241,0.3)" }}>
                            <div className="text-[9px] font-mono mb-1" style={{ color: "#818CF8" }}>
                              SYNTHESIZED POLICY · AUTO
                            </div>
                            <p className="text-[11px] font-mono font-semibold" style={{ color: "#F5F5F7" }}>{preview.name}</p>
                            <p className="text-[10px] font-mono mt-0.5 leading-relaxed" style={{ color: "#8A8A93" }}>{preview.description}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <span
                                className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                                style={{ background: "rgba(255,90,90,0.1)", color: "#FF5A5A", border: "1px solid rgba(255,90,90,0.2)" }}
                              >
                                {String(preview.action).toUpperCase()}
                              </span>
                              <span className="text-[9px] font-mono" style={{ color: "#8A8A93" }}>{preview.severity}</span>
                              <button
                                onClick={() => adoptPolicy(preview)}
                                className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded text-[9px] font-mono font-bold transition-all active:scale-95 hover:brightness-110"
                                style={{ background: "#818CF8", color: "#0A0A0D" }}
                              >
                                Adopt →
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Incident Intelligence panel ──────────────────────────────── */}
      {analysis && (
        <div className="shrink-0 border-b" style={{ borderColor: "#262630", background: "#0D0D12" }}>
          <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap" style={{ borderBottom: "1px solid #1C1C24" }}>
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(125,211,252,0.12)", color: "#7DD3FC", border: "1px solid rgba(125,211,252,0.3)" }}>
              INCIDENT INTELLIGENCE
            </span>
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
              Threat profile · Narrative · Board briefing
            </span>
            {intelligence?.thinkingTokens !== undefined && (
              <span className="text-[10px] font-mono" style={{ color: "#A78BFA" }}>
                ~{intelligence.thinkingTokens.toLocaleString()} thinking tokens
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {intelligence && (
                <button
                  onClick={exportBoardBriefing}
                  className="text-[10px] font-mono px-2 py-0.5 rounded transition-all hover:brightness-125"
                  style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630" }}
                  title="Download board-ready executive briefing as markdown"
                >
                  ↓ Board briefing
                </button>
              )}
              {!intelligence && !intelligenceLoading && (
                <button
                  onClick={startIntelligence}
                  className="text-[10px] font-mono px-2 py-0.5 rounded transition-all hover:brightness-125 font-semibold"
                  style={{ background: "rgba(125,211,252,0.1)", color: "#7DD3FC", border: "1px solid rgba(125,211,252,0.3)" }}
                >
                  ✦ Generate
                </button>
              )}
              {intelligenceLoading && (
                <span className="flex items-center gap-1.5 text-[10px] font-mono" style={{ color: "#A78BFA" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse" />
                  Opus reasoning…
                </span>
              )}
            </div>
          </div>

          <div className="px-4 py-3 space-y-4">
            {!intelligence && !intelligenceLoading && (
              <p className="text-[11px] font-mono" style={{ color: "#8A8A93" }}>
                One Opus call · three outputs tuned for three audiences: security team (threat profile), engineering (cinematic narrative), and the board (executive briefing).
              </p>
            )}

            {intelligenceLoading && intelligenceThinking && (
              <div className="rounded-lg px-3 py-2" style={{ background: "rgba(167,139,250,0.04)", border: "1px solid rgba(167,139,250,0.2)" }}>
                <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: "#A78BFA" }}>
                  Live thinking · {Math.ceil(intelligenceThinking.length / 4).toLocaleString()} tokens
                </div>
                <p className="text-[10px] font-mono leading-relaxed line-clamp-3" style={{ color: "rgba(167,139,250,0.7)" }}>
                  {intelligenceThinking.slice(-400)}
                </p>
              </div>
            )}

            {intelligence && (
              <>
                {/* Threat Profile */}
                <div className="rounded-lg p-3" style={{ background: "#14141A", border: "1px solid rgba(255,90,90,0.25)" }}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(255,90,90,0.15)", color: "#FF5A5A" }}>
                      THREAT PROFILE
                    </span>
                    <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>{intelligence.threatProfile.attackerType}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Sophistication meter */}
                    <div>
                      <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: "#8A8A93" }}>Sophistication</div>
                      <div className="flex items-baseline gap-1.5 mb-1">
                        <span className="text-2xl font-mono font-bold" style={{ color: intelligence.threatProfile.sophistication >= 8 ? "#FF5A5A" : intelligence.threatProfile.sophistication >= 5 ? "#F7B955" : "#2DD4A4" }}>
                          {intelligence.threatProfile.sophistication}
                        </span>
                        <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>/ 10</span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: "#1C1C24" }}>
                        <div className="h-full rounded-full" style={{ width: `${intelligence.threatProfile.sophistication * 10}%`, background: intelligence.threatProfile.sophistication >= 8 ? "#FF5A5A" : intelligence.threatProfile.sophistication >= 5 ? "#F7B955" : "#2DD4A4", transition: "width 1s ease-out" }} />
                      </div>
                      <div className="text-[10px] font-mono mt-1" style={{ color: "#8A8A93" }}>{intelligence.threatProfile.sophisticationLabel}</div>
                    </div>
                    <div className="sm:col-span-2 space-y-1.5">
                      <div>
                        <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>Motivation</div>
                        <div className="text-[11px] font-mono" style={{ color: "#F5F5F7" }}>{intelligence.threatProfile.motivation}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>Technique · {intelligence.threatProfile.mitreTactic}</div>
                        <div className="text-[11px] font-mono" style={{ color: "#F5F5F7" }}>{intelligence.threatProfile.technique}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "#F7B955" }}>Predicted next move</div>
                        <div className="text-[11px] font-mono" style={{ color: "#F7B955" }}>→ {intelligence.threatProfile.nextMove}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Narrative */}
                <div className="rounded-lg p-3" style={{ background: "#14141A", border: "1px solid rgba(167,139,250,0.2)" }}>
                  <div className="text-[9px] font-mono font-bold uppercase tracking-widest mb-2" style={{ color: "#A78BFA" }}>
                    ATTACK NARRATIVE
                  </div>
                  <div className="text-[12px] font-mono leading-relaxed whitespace-pre-wrap" style={{ color: "#F5F5F7", opacity: 0.9 }}>
                    {intelligence.narrative}
                  </div>
                </div>

                {/* Board Briefing — collapsible */}
                <div className="rounded-lg overflow-hidden" style={{ background: "#14141A", border: "1px solid rgba(45,212,164,0.25)" }}>
                  <button
                    onClick={() => setBoardExpanded((v) => !v)}
                    className="w-full px-3 py-2.5 flex items-center gap-2 text-left transition-all hover:brightness-125"
                  >
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(45,212,164,0.15)", color: "#2DD4A4" }}>
                      BOARD BRIEFING
                    </span>
                    <span className="text-[11px] font-mono font-semibold truncate flex-1" style={{ color: "#F5F5F7" }}>
                      {intelligence.boardBriefing.headline}
                    </span>
                    <span className="text-[10px] font-mono shrink-0" style={{ color: "#8A8A93" }}>{boardExpanded ? "▲" : "▼"}</span>
                  </button>
                  {boardExpanded && (
                    <div className="px-3 py-3 space-y-3" style={{ borderTop: "1px solid #1C1C24" }}>
                      <p className="text-[11px] font-mono italic" style={{ color: "#2DD4A4" }}>
                        {intelligence.boardBriefing.damagePrevented}
                      </p>
                      <div>
                        <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: "#8A8A93" }}>What happened</div>
                        <p className="text-[11px] font-mono leading-relaxed" style={{ color: "#F5F5F7" }}>{intelligence.boardBriefing.whatHappened}</p>
                      </div>
                      <div>
                        <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: "#8A8A93" }}>Why it matters</div>
                        <p className="text-[11px] font-mono leading-relaxed" style={{ color: "#F5F5F7" }}>{intelligence.boardBriefing.whyItMatters}</p>
                      </div>
                      <div>
                        <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: "#8A8A93" }}>What&apos;s next</div>
                        <p className="text-[11px] font-mono leading-relaxed" style={{ color: "#F5F5F7" }}>{intelligence.boardBriefing.whatNext}</p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Retroactive Surgery panel ────────────────────────────────── */}
      {surgeryOpen && (
        <div className="shrink-0 border-b" style={{ borderColor: "#262630", background: "#0D0D12" }}>
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: "1px solid #1C1C24" }}>
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(255,90,90,0.12)", color: "#FF5A5A", border: "1px solid rgba(255,90,90,0.3)" }}>
              RETROACTIVE SURGERY
            </span>
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
              Opus 4.7 · 1M context over clean history
            </span>
            <button
              onClick={() => setSurgeryOpen(false)}
              className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded transition-all hover:brightness-150"
              style={{ color: "#8A8A93", background: "#1C1C24", border: "1px solid #262630" }}
            >
              ✕
            </button>
          </div>

          <div className="px-4 py-3 space-y-3">
            {/* Attempt ticker */}
            {surgeryAttempt && (
              <div className="flex items-center gap-2 text-[10px] font-mono" style={{ color: "#A78BFA" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse" />
                Attempt {surgeryAttempt.n}/3 ·{" "}
                {surgeryAttempt.status === "thinking" && "Opus reasoning over full history"}
                {surgeryAttempt.status === "validating" && "Validating against 100+ clean tool calls"}
                {surgeryAttempt.status === "retry" && <span style={{ color: "#F7B955" }}>retrying with feedback</span>}
              </div>
            )}
            {surgeryAttempt?.status === "retry" && surgeryAttempt.detail && (
              <div className="text-[10px] font-mono px-3 py-2 rounded" style={{ background: "#14141A", color: "#F7B955", border: "1px solid rgba(247,185,85,0.2)" }}>
                {surgeryAttempt.detail}
              </div>
            )}

            {/* Thinking tail */}
            {surgeryRunning && surgeryThinking && (
              <p className="text-[10px] font-mono leading-relaxed" style={{ color: "#A78BFA", opacity: 0.55 }}>
                {surgeryThinking.slice(-300)}
              </p>
            )}

            {surgeryError && (
              <div className="rounded-lg px-3 py-2.5" style={{ background: "rgba(255,90,90,0.05)", border: "1px solid rgba(255,90,90,0.25)" }}>
                <p className="text-xs font-mono" style={{ color: "#FF5A5A" }}>{surgeryError}</p>
              </div>
            )}

            {surgeryResult && (
              <>
                {/* Bypass reference */}
                <div className="rounded-lg px-3 py-2.5" style={{ background: "#14141A", border: "1px solid #262630" }}>
                  <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: "#8A8A93" }}>
                    Bypass being fixed · seq {surgeryResult.bypassEvent.seq}
                  </div>
                  <div className="text-[11px] font-mono" style={{ color: "#F5F5F7" }}>
                    <code>{surgeryResult.bypassEvent.tool}</code> · {surgeryResult.bypassEvent.verdict}
                  </div>
                  <p className="text-[10px] font-mono mt-1 leading-relaxed" style={{ color: "#8A8A93" }}>
                    {surgeryResult.bypassEvent.reasoning}
                  </p>
                </div>

                {/* Synthesized policy */}
                <div className="rounded-lg px-3 py-2.5" style={{ background: "rgba(255,90,90,0.04)", border: "1px solid rgba(255,90,90,0.3)" }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: surgeryResult.policy.action === "block" ? "rgba(255,90,90,0.15)" : "rgba(247,185,85,0.15)", color: surgeryResult.policy.action === "block" ? "#FF5A5A" : "#F7B955" }}>
                      {surgeryResult.policy.action.toUpperCase()}
                    </span>
                    <span className="text-[11px] font-mono font-semibold" style={{ color: "#F5F5F7" }}>
                      {surgeryResult.policy.name}
                    </span>
                    <span className="ml-auto text-[9px] font-mono" style={{ color: "#8A8A93" }}>
                      validated in {surgeryResult.attempts} attempt{surgeryResult.attempts > 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono leading-relaxed" style={{ color: "#8A8A93" }}>
                    {surgeryResult.policy.description}
                  </p>
                </div>

                {/* Counterfactual quantification */}
                <div className="rounded-lg px-3 py-2.5" style={{ background: "rgba(45,212,164,0.05)", border: "1px solid rgba(45,212,164,0.25)" }}>
                  <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: "#2DD4A4" }}>
                    Counterfactual · if you had adopted this earlier
                  </div>
                  {surgeryResult.counterfactual.wouldHaveBlockedCount === 0 ? (
                    <p className="text-[11px] font-mono leading-relaxed" style={{ color: "#F5F5F7" }}>
                      Would have blocked the original bypass exclusively — no other historical calls match. Surgical precision, zero collateral.
                    </p>
                  ) : (
                    <p className="text-[11px] font-mono leading-relaxed" style={{ color: "#F5F5F7" }}>
                      Would have also caught{" "}
                      <strong style={{ color: "#2DD4A4" }}>
                        {surgeryResult.counterfactual.wouldHaveBlockedCount} additional attack{surgeryResult.counterfactual.wouldHaveBlockedCount > 1 ? "s" : ""}
                      </strong>
                      {surgeryResult.counterfactual.additionalMoneyInterdicted > 0 && (
                        <> worth <strong style={{ color: "#2DD4A4" }}>${surgeryResult.counterfactual.additionalMoneyInterdicted.toLocaleString()}</strong></>
                      )}{" "}
                      across {surgeryResult.counterfactual.affectedRuns.length} other run{surgeryResult.counterfactual.affectedRuns.length !== 1 ? "s" : ""}.
                    </p>
                  )}
                  {surgeryResult.counterfactual.affectedRuns.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {surgeryResult.counterfactual.affectedRuns.map((r, i) => (
                        <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(45,212,164,0.1)", color: "#2DD4A4" }}>
                          run {r.runId.slice(0, 6)} · seq {r.eventSeq}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={adoptSurgeryPolicy}
                    disabled={surgeryAdopted}
                    className="px-3 py-1.5 rounded text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-60"
                    style={{ background: surgeryAdopted ? "#2DD4A4" : "#A78BFA", color: "#0A0A0D" }}
                  >
                    {surgeryAdopted ? "✓ Adopted" : "Adopt Policy →"}
                  </button>
                  <span className="text-[9px] font-mono" style={{ color: "#5A5A63" }}>
                    ~{surgeryResult.contextTokens?.toLocaleString()} tokens read · ~{surgeryResult.thinkingTokens} thinking tokens
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Fork comparison (appears after branching) ─────────────────── */}
      {(forkResult || forking) && (
        <div className="shrink-0">
          {/* Blast radius panel */}
          {originalBlast && (
            <div className="px-4 py-3 border-b" style={{ borderColor: "#262630", background: "#0D0D12" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                    style={{
                      background: `${severityColor(originalBlast.severity)}18`,
                      color: severityColor(originalBlast.severity),
                      border: `1px solid ${severityColor(originalBlast.severity)}40`,
                    }}
                  >
                    {originalBlast.severity.toUpperCase()}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
                    Blast Radius
                  </span>
                  <span className="text-[10px] font-mono" style={{ color: originalBlast.reversible ? "#2DD4A4" : "#FF5A5A" }}>
                    {originalBlast.reversible ? "✓ reversible" : "⚠ irreversible"}
                  </span>
                </div>
                <button
                  onClick={downloadReport}
                  disabled={reportLoading}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-50"
                  style={{ background: "#1C1C24", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.3)" }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  {reportLoading ? "Generating..." : "Incident Report"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>Original</div>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { label: "$ interdicted", value: `$${originalBlast.moneyInterdicted.toLocaleString()}`, hi: originalBlast.moneyInterdicted > 0 },
                      { label: "exfil blocked", value: originalBlast.externalEmailsBlocked[0] ?? "none", hi: originalBlast.externalEmailsBlocked.length > 0 },
                      { label: "interdictions", value: `${originalBlast.actionsInterdicted} (${originalBlast.interdictedByPolicy}P/${originalBlast.interdictedByPrecog}O)`, hi: false },
                      { label: "records", value: String(originalBlast.recordsAccessed), hi: false },
                    ].map(({ label, value, hi }) => (
                      <div key={label} className="flex flex-col p-1.5 rounded" style={{ background: "#0A0A0D", border: `1px solid ${hi ? "#F7B955" : "#1C1C24"}` }}>
                        <span className="text-[8px] font-mono" style={{ color: "#8A8A93" }}>{label}</span>
                        <span className="text-[11px] font-mono font-bold" style={{ color: hi ? "#F7B955" : "#F5F5F7" }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "#7DD3FC" }}>Fork</div>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { label: "$ disbursed", value: forkBlast ? `$${forkBlast.moneyDisbursed.toLocaleString()}` : "—" },
                      { label: "external", value: forkBlast ? (forkBlast.externalEmailsSent[0] ?? "none") : "—" },
                      { label: "interdictions", value: forkBlast ? String(forkBlast.actionsInterdicted) : "—" },
                      { label: "records", value: forkBlast ? String(forkBlast.recordsAccessed) : "—" },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex flex-col p-1.5 rounded" style={{ background: "#0A0A0D", border: "1px solid #1C1C24" }}>
                        <span className="text-[8px] font-mono" style={{ color: "#8A8A93" }}>{label}</span>
                        <span className="text-[11px] font-mono font-bold" style={{ color: "#7DD3FC" }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-[10px] font-mono mt-2" style={{ color: "#8A8A93" }}>{originalBlast.summary}</p>
            </div>
          )}

          {/* Two-column event comparison */}
          {forkResult && (
            <div className="flex" style={{ minHeight: "200px" }}>
              <div className="flex-1 border-r p-3" style={{ borderColor: "#262630" }}>
                <div className="text-[9px] font-mono uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: "#F5F5F7" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F5F5F7]" /> Original
                </div>
                {forkResult.originalEvents.map((ev) => {
                  const { label, detail } = forkEventLabel(ev);
                  const isDecision = ev.type === "decision";
                  return (
                    <div key={ev.id} className="flex items-start gap-1.5 mb-1 text-[10px] font-mono">
                      <span className="shrink-0 w-5 text-right" style={{ color: "#8A8A93" }}>#{ev.seq}</span>
                      <div>
                        <span style={{ color: isDecision ? verdictColor(label) : "#F5F5F7" }}>{label}</span>
                        {detail && <span className="ml-1.5" style={{ color: "#8A8A93" }}>{detail}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex-1 p-3" style={{ background: "rgba(125,211,252,0.02)" }}>
                <div className="text-[9px] font-mono uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: "#7DD3FC" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7DD3FC]" /> Branch
                </div>
                {forkResult.forkEvents.map((ev) => {
                  const { label, detail } = forkEventLabel(ev);
                  const isDecision = ev.type === "decision";
                  return (
                    <div key={ev.id} className="flex items-start gap-1.5 mb-1 text-[10px] font-mono">
                      <span className="shrink-0 w-5 text-right" style={{ color: "#8A8A93" }}>#{ev.seq}</span>
                      <div>
                        <span style={{ color: isDecision ? verdictColor(label) : "#7DD3FC" }}>{label}</span>
                        {detail && <span className="ml-1.5" style={{ color: "#8A8A93" }}>{detail}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Narration */}
          {forkResult?.narration && (
            <div className="px-4 py-3 border-t" style={{ borderColor: "#262630", background: "#0D0D12" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA]" />
                <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#A78BFA" }}>
                  Opus Counterfactual
                </span>
              </div>
              <p className="text-xs font-mono leading-relaxed" style={{ color: "#A78BFA" }}>
                {forkResult.narration}
              </p>
            </div>
          )}

          {forking && !forkResult && (
            <div className="flex items-center gap-3 px-4 py-4">
              <span className="w-2 h-2 rounded-full bg-[#7DD3FC] animate-pulse" />
              <span className="font-mono text-xs" style={{ color: "#7DD3FC" }}>Branching reality...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
