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

function isToolCall(ev: AgentEvent) {
  return ev.type === "tool_call";
}
function isDecision(ev: AgentEvent) {
  return ev.type === "decision";
}
function isToolResult(ev: AgentEvent) {
  return ev.type === "tool_result";
}
function isThought(ev: AgentEvent) {
  return ev.type === "thought";
}

function getVerdict(ev: AgentEvent): DecisionPayload | null {
  if (!isDecision(ev)) return null;
  return ev.payload as unknown as DecisionPayload;
}

function verdictColor(v: string) {
  if (v === "ALLOW") return { text: "text-[#2DD4A4]", bg: "bg-[#2DD4A4]", border: "border-[#2DD4A4]" };
  if (v === "PAUSE") return { text: "text-[#F7B955]", bg: "bg-[#F7B955]", border: "border-[#F7B955]" };
  return { text: "text-[#FF5A5A]", bg: "bg-[#FF5A5A]", border: "border-[#FF5A5A]" };
}

function eventLabel(ev: AgentEvent): string {
  if (isToolCall(ev)) return String(ev.payload.tool);
  if (isToolResult(ev)) return `${ev.payload.tool} result`;
  if (isDecision(ev)) return `${(ev.payload as unknown as DecisionPayload).verdict}`;
  return ev.type;
}

function eventDotColor(ev: AgentEvent): string {
  if (isDecision(ev)) return verdictColor((ev.payload as unknown as DecisionPayload).verdict).bg;
  if (isToolResult(ev)) return "bg-[#8A8A93]";
  return "bg-[#F5F5F7]";
}

function eventTextColor(ev: AgentEvent): string {
  if (isDecision(ev)) return verdictColor((ev.payload as unknown as DecisionPayload).verdict).text;
  if (isToolResult(ev)) return "text-[#8A8A93]";
  return "text-[#F5F5F7]";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LiveView({ onRunStarted }: { onRunStarted?: (id: string) => void }) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [selected, setSelected] = useState<AgentEvent | null>(null);
  const [liveThinking, setLiveThinking] = useState("");
  const [thinkingMap, setThinkingMap] = useState<Record<string, string>>({});
  const [pendingDecisionId, setPendingDecisionId] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const currentToolCallId = useRef<string | null>(null);

  const handleEvent = useCallback((ev: AgentEvent) => {
    if (isThought(ev)) {
      // Accumulate thinking deltas for the live purple panel
      const delta = String(ev.payload.delta ?? "");
      setLiveThinking((prev) => prev + delta);
      return;
    }

    // Run ended signal
    if (ev.type === "observation" && (ev.payload as Record<string, unknown>).kind === "run_ended") {
      const s = (ev.payload as Record<string, unknown>).status as string;
      setStatus("done");
      setLiveThinking("");
      return;
    }

    if (isToolCall(ev)) {
      // New tool call — save previous thinking, reset live
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
      // Store completed thinking text keyed to this decision
      setLiveThinking((prev) => {
        setThinkingMap((m) => ({ ...m, [ev.id]: prev }));
        return "";
      });
      const verdict = getVerdict(ev);
      if (verdict?.verdict === "PAUSE") {
        setPendingDecisionId(ev.id);
      }
    }

    // Add to visible event list (everything except thoughts)
    setEvents((prev) => [ev, ...prev]);
  }, []);

  async function startRun() {
    setEvents([]);
    setSelected(null);
    setStatus("running");
    setLiveThinking("");
    setThinkingMap({});
    setPendingDecisionId(null);
    currentToolCallId.current = null;

    const res = await fetch(`${ENGINE}/runs/start`, { method: "POST" });
    const run = await res.json();
    setRunId(run.id);
    onRunStarted?.(run.id);

    const es = new EventSource(`${ENGINE}/runs/${run.id}/events`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        handleEvent(JSON.parse(e.data));
      } catch {}
    };

    es.onerror = () => {
      es.close();
      setStatus("done");
    };
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

  useEffect(() => {
    return () => esRef.current?.close();
  }, []);

  // Find the last decision for the selected tool_call (by sequence proximity)
  const selectedDecision = selected && isDecision(selected) ? getVerdict(selected) : null;
  const selectedThinking = selected ? thinkingMap[selected.id] ?? "" : "";

  return (
    <div className="flex flex-col h-screen" style={{ background: "#0A0A0D" }}>
      {/* ── Controls bar ──────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-5 py-2 border-b shrink-0"
        style={{ borderColor: "#262630" }}
      >
        <div className="flex gap-2 items-center">
          {status === "running" && (
            <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "#F7B955" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#F7B955] animate-pulse" />
              running
            </span>
          )}
          {status === "done" && (
            <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "#2DD4A4" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#2DD4A4]" />
              completed
            </span>
          )}
        </div>
        <button
          onClick={startRun}
          disabled={status === "running"}
          className="ml-auto px-3 py-1.5 rounded text-xs font-mono font-medium transition-colors disabled:opacity-40 hover:bg-[#262630]"
          style={{ background: "#1C1C24", color: "#F5F5F7", border: "1px solid #262630" }}
        >
          {status === "idle" ? "Run agent" : "Re-run"}
        </button>
      </div>

      {/* ── PAUSE banner ───────────────────────────────────────────────────── */}
      {pendingDecisionId && (
        <div
          className="flex items-center gap-4 px-5 py-2.5 border-b shrink-0"
          style={{ background: "#1C1C24", borderColor: "#F7B955" }}
        >
          <span className="w-2 h-2 rounded-full bg-[#F7B955] animate-pulse" />
          <span className="font-mono text-sm" style={{ color: "#F7B955" }}>
            Action paused — awaiting your decision
          </span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => decide("approve")}
              className="px-3 py-1 rounded text-xs font-mono font-medium"
              style={{ background: "#2DD4A4", color: "#0A0A0D" }}
            >
              Approve
            </button>
            <button
              onClick={() => decide("reject")}
              className="px-3 py-1 rounded text-xs font-mono font-medium"
              style={{ background: "#FF5A5A", color: "#0A0A0D" }}
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {/* ── Live thinking bar ──────────────────────────────────────────────── */}
      {liveThinking && (
        <div
          className="px-5 py-2 border-b shrink-0 overflow-hidden"
          style={{ background: "#14141A", borderColor: "#262630" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#A78BFA" }}>
              Pre-cog reasoning
            </span>
          </div>
          <p className="text-xs font-mono leading-relaxed line-clamp-3" style={{ color: "#A78BFA" }}>
            {liveThinking.slice(-300)}
          </p>
        </div>
      )}

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Action stream (left) ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col border-r min-h-0" style={{ borderColor: "#262630" }}>
          <div
            className="px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest shrink-0"
            style={{ color: "#8A8A93", borderBottom: "1px solid #262630" }}
          >
            Action Stream
          </div>

          <div className="flex-1 overflow-y-auto">
            {events.length === 0 && status === "idle" && (
              <div className="px-5 py-8 text-sm font-mono" style={{ color: "#8A8A93" }}>
                Press &quot;Run agent&quot; to begin.
              </div>
            )}

            {events.map((ev) => (
              <button
                key={`${ev.id}-${ev.seq}`}
                onClick={() => setSelected(ev)}
                className="w-full text-left flex items-center gap-3 px-4 py-2 border-b transition-colors hover:bg-[#14141A]"
                style={{
                  borderColor: "#1C1C24",
                  background: selected?.id === ev.id ? "#1C1C24" : undefined,
                }}
              >
                {ev.seq > 0 && (
                  <span className="font-mono text-[10px] w-6 text-right shrink-0" style={{ color: "#8A8A93" }}>
                    #{ev.seq}
                  </span>
                )}
                <span className={`w-2 h-2 rounded-full shrink-0 ${eventDotColor(ev)}`} />
                <span className={`font-mono text-sm ${eventTextColor(ev)}`}>
                  {eventLabel(ev)}
                </span>
                {isToolCall(ev) && (
                  <span className="font-mono text-[11px] truncate ml-auto" style={{ color: "#8A8A93" }}>
                    {JSON.stringify(ev.payload.args).slice(0, 60)}
                  </span>
                )}
                {isDecision(ev) && (
                  <span className="font-mono text-[11px] truncate ml-auto" style={{ color: "#8A8A93" }}>
                    {(ev.payload as unknown as DecisionPayload).reasoning.slice(0, 60)}...
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Detail panel (right) ──────────────────────────────────────── */}
        <div className="w-[420px] shrink-0 flex flex-col min-h-0">
          <div
            className="px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest shrink-0"
            style={{ color: "#8A8A93", borderBottom: "1px solid #262630" }}
          >
            {selected ? `Event #${selected.seq} — ${selected.type}` : "Detail"}
          </div>

          <div className="flex-1 overflow-y-auto">
            {!selected ? (
              <div className="px-5 py-8 text-sm font-mono" style={{ color: "#8A8A93" }}>
                Select an event to inspect.
              </div>
            ) : (
              <div className="px-4 py-4 space-y-4">
                {/* Verdict badge for decisions */}
                {selectedDecision && (
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${verdictColor(selectedDecision.verdict).text}`}
                      style={{ background: "#1C1C24", border: `1px solid` }}
                    >
                      {selectedDecision.verdict}
                    </span>
                    <div className="flex gap-1.5 flex-wrap">
                      {selectedDecision.riskSignals.map((s, i) => (
                        <span
                          key={i}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: "#1C1C24", color: "#FF5A5A" }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reasoning for decisions */}
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
                    className="text-xs rounded p-3 overflow-auto font-mono whitespace-pre-wrap break-all"
                    style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630" }}
                  >
                    {JSON.stringify(selected.payload, null, 2)}
                  </pre>
                </div>

                {/* Opus thinking (purple panel) */}
                {selectedThinking && (
                  <div className="rounded p-3" style={{ background: "#14141A", border: "1px solid #262630" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA]" />
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: "#A78BFA" }}>
                        Opus Extended Thinking
                      </span>
                    </div>
                    <p
                      className="text-xs font-mono leading-relaxed whitespace-pre-wrap"
                      style={{ color: "#A78BFA" }}
                    >
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
