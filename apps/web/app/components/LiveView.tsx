"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const ENGINE = "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentEvent {
  id: string;
  runId: string;
  seq: number;
  timestamp: number;
  type: string;
  payload: Record<string, unknown>;
}

interface DecisionPayload {
  verdict: "ALLOW" | "PAUSE" | "BLOCK";
  reasoning: string;
  riskSignals: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isToolCall(ev: AgentEvent) { return ev.type === "tool_call"; }
function isDecision(ev: AgentEvent) { return ev.type === "decision"; }
function isToolResult(ev: AgentEvent) { return ev.type === "tool_result"; }
function isThought(ev: AgentEvent) { return ev.type === "thought"; }

function getVerdict(ev: AgentEvent): DecisionPayload | null {
  if (!isDecision(ev)) return null;
  return ev.payload as unknown as DecisionPayload;
}

function verdictStyle(v: string) {
  if (v === "ALLOW") return { color: "#2DD4A4", bg: "rgba(45,212,164,0.12)", border: "#2DD4A4" };
  if (v === "PAUSE") return { color: "#F7B955", bg: "rgba(247,185,85,0.12)", border: "#F7B955" };
  return { color: "#FF5A5A", bg: "rgba(255,90,90,0.12)", border: "#FF5A5A" };
}

function eventLabel(ev: AgentEvent): string {
  if (isToolCall(ev)) return String(ev.payload.tool);
  if (isToolResult(ev)) return `${ev.payload.tool} result`;
  if (isDecision(ev)) return `${(ev.payload as unknown as DecisionPayload).verdict}`;
  return ev.type;
}

function eventDotColor(ev: AgentEvent): string {
  if (isDecision(ev)) {
    const v = (ev.payload as unknown as DecisionPayload).verdict;
    if (v === "ALLOW") return "bg-[#2DD4A4]";
    if (v === "PAUSE") return "bg-[#F7B955]";
    return "bg-[#FF5A5A]";
  }
  if (isToolResult(ev)) return "bg-[#8A8A93]";
  return "bg-[#F5F5F7]";
}

function eventTextColor(ev: AgentEvent): string {
  if (isDecision(ev)) {
    const v = (ev.payload as unknown as DecisionPayload).verdict;
    return verdictStyle(v).color;
  }
  if (isToolResult(ev)) return "#8A8A93";
  return "#F5F5F7";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LiveView({ onRunStarted }: { onRunStarted?: (id: string) => void }) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [startTime, setStartTime] = useState<number>(0);
  const [agentMode, setAgentMode] = useState<"scenario" | "agent">("scenario");
  const [selected, setSelected] = useState<AgentEvent | null>(null);
  const [liveThinking, setLiveThinking] = useState("");
  const [thinkingMap, setThinkingMap] = useState<Record<string, string>>({});
  const [pendingDecisionId, setPendingDecisionId] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const currentToolCallId = useRef<string | null>(null);

  const handleEvent = useCallback((ev: AgentEvent) => {
    if (isThought(ev)) {
      setLiveThinking((prev) => prev + String(ev.payload.delta ?? ""));
      return;
    }

    if (ev.type === "observation" && (ev.payload as Record<string, unknown>).kind === "run_ended") {
      setStatus("done");
      setLiveThinking("");
      return;
    }

    if (isToolCall(ev)) {
      if (currentToolCallId.current) {
        setThinkingMap((prev) => ({
          ...prev,
          [currentToolCallId.current!]: prev[currentToolCallId.current!] ?? "",
        }));
      }
      setLiveThinking("");
      currentToolCallId.current = ev.id;
    }

    if (isDecision(ev)) {
      setLiveThinking((prev) => {
        setThinkingMap((m) => ({ ...m, [ev.id]: prev }));
        return "";
      });
      if (getVerdict(ev)?.verdict === "PAUSE") {
        setPendingDecisionId(ev.id);
      }
    }

    setEvents((prev) => [ev, ...prev]);
  }, []);

  async function startRun() {
    setEvents([]);
    setSelected(null);
    setStatus("running");
    setLiveThinking("");
    setThinkingMap({});
    setPendingDecisionId(null);
    setStartTime(Date.now());
    currentToolCallId.current = null;

    const res = await fetch(`${ENGINE}/runs/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: agentMode }),
    });
    const run = await res.json();
    setRunId(run.id);
    onRunStarted?.(run.id);

    const es = new EventSource(`${ENGINE}/runs/${run.id}/events`);
    esRef.current = es;
    es.onmessage = (e) => { try { handleEvent(JSON.parse(e.data)); } catch {} };
    es.onerror = () => { es.close(); setStatus("done"); };
  }

  async function decide(action: "approve" | "reject") {
    if (!pendingDecisionId) return;
    await fetch(`${ENGINE}/decide/${pendingDecisionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setPendingDecisionId(null);
  }

  useEffect(() => { return () => esRef.current?.close(); }, []);

  // Keyboard: R to run
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "r" && status !== "running") startRun();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status]);

  const selectedDecision = selected && isDecision(selected) ? getVerdict(selected) : null;
  const selectedThinking = selected ? thinkingMap[selected.id] ?? "" : "";

  return (
    <div className="flex flex-col h-full" style={{ background: "#0A0A0D" }}>
      {/* ── Controls + Stats bar ─────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 py-2 border-b shrink-0" style={{ borderColor: "#262630" }}>
        {/* Agent mode selector */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid #262630" }}>
            <button
              onClick={() => setAgentMode("scenario")}
              className="px-2.5 py-1 text-[10px] font-mono transition-all duration-150"
              style={{
                background: agentMode === "scenario" ? "#A78BFA" : "transparent",
                color: agentMode === "scenario" ? "#0A0A0D" : "#8A8A93",
                fontWeight: agentMode === "scenario" ? 600 : 400,
              }}
              title="Pre-scripted phishing attack scenario — fast, reliable for demos"
            >
              Demo Scenario
            </button>
            <button
              onClick={() => setAgentMode("agent")}
              className="px-2.5 py-1 text-[10px] font-mono transition-all duration-150"
              style={{
                background: agentMode === "agent" ? "#7DD3FC" : "transparent",
                color: agentMode === "agent" ? "#0A0A0D" : "#8A8A93",
                fontWeight: agentMode === "agent" ? 600 : 400,
              }}
              title="Real LLM agent (Haiku) decides autonomously — Pre-cog monitors every action"
            >
              Live Agent
            </button>
          </div>
          <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
            {agentMode === "scenario" ? "scripted attack" : "LLM decides"}
          </span>
        </div>

        {/* Status */}
        {status === "running" && (
          <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "#F7B955" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#F7B955] animate-pulse" />
            {agentMode === "agent" ? "agent thinking" : "running"}
          </span>
        )}
        {status === "done" && (
          <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "#2DD4A4" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#2DD4A4]" />
            completed
          </span>
        )}

        {/* Stats */}
        {events.length > 0 && (
          <div className="flex items-center gap-3 text-[10px] font-mono" style={{ color: "#8A8A93" }}>
            <span>{events.filter(isToolCall).length} calls</span>
            <span style={{ color: "#2DD4A4" }}>
              {events.filter((e) => isDecision(e) && getVerdict(e)?.verdict === "ALLOW").length} allow
            </span>
            <span style={{ color: "#F7B955" }}>
              {events.filter((e) => isDecision(e) && getVerdict(e)?.verdict === "PAUSE").length} pause
            </span>
            <span style={{ color: "#FF5A5A" }}>
              {events.filter((e) => isDecision(e) && getVerdict(e)?.verdict === "BLOCK").length} block
            </span>
          </div>
        )}

        <button
          onClick={startRun}
          disabled={status === "running"}
          className="ml-auto px-4 py-1.5 rounded text-xs font-mono font-medium transition-all duration-150 active:scale-95 disabled:opacity-40 hover:brightness-110"
          style={{ background: "#A78BFA", color: "#0A0A0D" }}
        >
          {status === "idle" ? "Run agent" : "Re-run"}
        </button>
      </div>

      {/* ── PAUSE banner ──────────────────────────────────────────────── */}
      {pendingDecisionId && (
        <div
          className="flex items-center gap-4 px-5 py-2.5 border-b shrink-0 animate-fade-in"
          style={{ background: "rgba(247,185,85,0.08)", borderColor: "#F7B955" }}
        >
          <span className="w-2 h-2 rounded-full bg-[#F7B955] animate-pulse" />
          <span className="font-mono text-sm" style={{ color: "#F7B955" }}>
            Action paused — awaiting your decision
          </span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => decide("approve")}
              className="px-3 py-1.5 rounded text-xs font-mono font-bold transition-all duration-150 active:scale-95 hover:brightness-110"
              style={{ background: "#2DD4A4", color: "#0A0A0D" }}
            >
              Approve
            </button>
            <button
              onClick={() => decide("reject")}
              className="px-3 py-1.5 rounded text-xs font-mono font-bold transition-all duration-150 active:scale-95 hover:brightness-110"
              style={{ background: "#FF5A5A", color: "#0A0A0D" }}
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {/* ── Live thinking bar ─────────────────────────────────────────── */}
      {liveThinking && (
        <div
          className="px-5 py-2.5 border-b shrink-0 overflow-hidden animate-fade-in"
          style={{ background: "rgba(167,139,250,0.06)", borderColor: "#262630" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#A78BFA" }}>
              Opus Extended Thinking
            </span>
          </div>
          <p className="text-xs font-mono leading-relaxed line-clamp-3" style={{ color: "#A78BFA" }}>
            {liveThinking.slice(-400)}
          </p>
        </div>
      )}

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Action stream ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col border-r min-h-0" style={{ borderColor: "#262630" }}>
          <div
            className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest shrink-0 flex items-center gap-2"
            style={{ color: "#8A8A93", borderBottom: "1px solid #262630" }}
          >
            Action Stream
            {events.length > 0 && (
              <span className="ml-auto tabular-nums">{events.length} events</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Skeleton loading state */}
            {events.length === 0 && status === "idle" && (
              <div className="p-4 space-y-2">
                {[1, 0.8, 0.6, 0.4, 0.2].map((opacity, i) => (
                  <div key={i} className="skeleton h-9 w-full" style={{ opacity }} />
                ))}
                <p className="text-xs font-mono text-center pt-4" style={{ color: "#8A8A93" }}>
                  Press <span style={{ color: "#A78BFA" }}>Run agent</span> or <span style={{ color: "#A78BFA" }}>R</span> to begin
                </p>
              </div>
            )}

            {/* Running skeleton */}
            {events.length === 0 && status === "running" && (
              <div className="p-4 space-y-2">
                {[1, 0.6, 0.3].map((opacity, i) => (
                  <div key={i} className="skeleton h-9 w-full" style={{ opacity }} />
                ))}
              </div>
            )}

            {events.map((ev, i) => (
              <button
                key={`${ev.id}-${ev.seq}`}
                onClick={() => setSelected(ev)}
                className="w-full text-left flex items-center gap-3 px-4 py-2 border-b transition-all duration-150 hover:bg-[#14141A] animate-slide-up"
                style={{
                  borderColor: "#1C1C24",
                  background: selected?.id === ev.id ? "#1C1C24" : undefined,
                  borderLeft: selected?.id === ev.id ? "2px solid #A78BFA" : "2px solid transparent",
                  animationDelay: `${Math.min(i * 30, 150)}ms`,
                }}
              >
                {ev.seq > 0 && (
                  <span className="font-mono text-[10px] w-6 text-right shrink-0" style={{ color: "#8A8A93" }}>
                    #{ev.seq}
                  </span>
                )}
                <span className={`w-2 h-2 rounded-full shrink-0 ${eventDotColor(ev)}`} />
                <span className="font-mono text-sm" style={{ color: eventTextColor(ev) }}>
                  {eventLabel(ev)}
                </span>
                {isToolCall(ev) && (
                  <span className="font-mono text-[11px] truncate ml-auto max-w-[200px]" style={{ color: "#8A8A93" }}>
                    {JSON.stringify(ev.payload.args).slice(0, 50)}
                  </span>
                )}
                {isDecision(ev) && (
                  <span className="font-mono text-[11px] truncate ml-auto max-w-[250px]" style={{ color: "#8A8A93" }}>
                    {(ev.payload as unknown as DecisionPayload).reasoning.slice(0, 60)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Detail panel ──────────────────────────────────────────── */}
        <div className="w-[420px] shrink-0 flex flex-col min-h-0">
          <div
            className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest shrink-0"
            style={{ color: "#8A8A93", borderBottom: "1px solid #262630" }}
          >
            {selected ? `Event #${selected.seq} — ${selected.type}` : "Inspector"}
          </div>

          <div className="flex-1 overflow-y-auto">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full px-8">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: "#14141A" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A8A93" strokeWidth="1.5">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-xs font-mono text-center" style={{ color: "#8A8A93" }}>
                  Select an event to inspect
                </p>
              </div>
            ) : (
              <div className="px-4 py-4 space-y-4 animate-fade-in">
                {/* Verdict badge */}
                {selectedDecision && (
                  <div
                    className="flex items-center gap-3 p-3 rounded"
                    style={{
                      background: verdictStyle(selectedDecision.verdict).bg,
                      border: `1px solid ${verdictStyle(selectedDecision.verdict).border}`,
                    }}
                  >
                    <span
                      className="px-2.5 py-1 rounded text-xs font-mono font-bold"
                      style={{ color: verdictStyle(selectedDecision.verdict).color }}
                    >
                      {selectedDecision.verdict}
                    </span>
                    <div className="flex gap-1.5 flex-wrap">
                      {selectedDecision.riskSignals.map((s, i) => (
                        <span
                          key={i}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: "#0A0A0D", color: "#FF5A5A" }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reasoning */}
                {selectedDecision && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "#8A8A93" }}>
                      Reasoning
                    </div>
                    <p className="text-sm font-mono leading-relaxed" style={{ color: "#F5F5F7" }}>
                      {selectedDecision.reasoning}
                    </p>
                  </div>
                )}

                {/* Payload */}
                <div>
                  <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "#8A8A93" }}>
                    Payload
                  </div>
                  <pre
                    className="text-xs rounded-lg p-3 overflow-auto font-mono whitespace-pre-wrap break-all"
                    style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630" }}
                  >
                    {JSON.stringify(selected.payload, null, 2)}
                  </pre>
                </div>

                {/* Opus thinking */}
                {selectedThinking && (
                  <div className="rounded-lg p-3" style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.2)" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA]" />
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: "#A78BFA" }}>
                        Opus Extended Thinking
                      </span>
                    </div>
                    <p className="text-xs font-mono leading-relaxed whitespace-pre-wrap" style={{ color: "#A78BFA" }}>
                      {selectedThinking}
                    </p>
                  </div>
                )}

                {/* Timestamp */}
                <div className="text-[10px] font-mono pt-2" style={{ color: "#8A8A93" }}>
                  {new Date(selected.timestamp).toLocaleTimeString()} — seq {selected.seq}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
