"use client";

import { useState, useEffect, useRef } from "react";

import { ENGINE } from "../lib/engine";

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
  source?: "policy" | "pre-cog";
  cached?: boolean;
}

export interface FleetAgent {
  runId: string;
  scenario: string;
  label: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RISK_SIGNAL_LABELS: Record<string, string> = {
  agent_output_injection: "Agent Output Injection",
  authority_impersonation: "Authority Impersonation",
  compliance_framing: "Compliance Bypass",
  data_exfiltration: "Data Exfiltration",
  bulk_pii_access: "Bulk PII Access",
  prompt_injection_chain: "Prompt Injection",
  high_value_action: "High-Value Action",
  pii_exposure: "PII Exposure",
  external_transmission: "External Transmission",
  cross_agent_trust: "Cross-Agent Trust",
  privilege_escalation: "Privilege Escalation",
};

function attackLabel(riskSignals: string[]): string | null {
  const s = new Set(riskSignals.filter((r) => !r.startsWith("policy:")));
  if (s.has("agent_output_injection")) return "Agent Output Injection";
  if (s.has("authority_impersonation")) return "Authority Impersonation";
  if (s.has("compliance_framing")) return "Compliance Bypass";
  if (s.has("prompt_injection_chain")) return "Prompt Injection";
  if (s.has("data_exfiltration")) return "Data Exfiltration";
  if (s.has("bulk_pii_access")) return "Bulk PII Access";
  for (const sig of s) if (RISK_SIGNAL_LABELS[sig]) return RISK_SIGNAL_LABELS[sig];
  return null;
}

function verdictColor(v: string) {
  if (v === "ALLOW") return "#2DD4A4";
  if (v === "PAUSE") return "#F7B955";
  return "#FF5A5A";
}

function shortTool(tool: string) {
  return tool.replace(/_/g, " ").replace(/customer detail/i, "detail");
}

// ─── FleetCard ────────────────────────────────────────────────────────────────

function FleetCard({ agent }: { agent: FleetAgent }) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<"pending" | "running" | "paused" | "done">("pending");
  const [pendingDecisionId, setPendingDecisionId] = useState<string | null>(null);
  const [pendingToolLabel, setPendingToolLabel] = useState<string>("");
  const [blockFlash, setBlockFlash] = useState(false);
  const [attackType, setAttackType] = useState<string | null>(null);
  const [interdictions, setInterdictions] = useState(0);
  const [moneyBlocked, setMoneyBlocked] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Give the engine a moment to register the SSE subscriber before connecting
    const timeout = setTimeout(() => {
      setStatus("running");
      const es = new EventSource(`${ENGINE}/runs/${agent.runId}/events`);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const ev: AgentEvent = JSON.parse(e.data);
          handleEvent(ev);
        } catch {}
      };
      es.onerror = () => { es.close(); setStatus((s) => s === "running" ? "done" : s); };
    }, 200);

    return () => {
      clearTimeout(timeout);
      esRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.runId]);

  function handleEvent(ev: AgentEvent) {
    if (ev.type === "observation" && (ev.payload as Record<string, unknown>).kind === "run_ended") {
      setStatus("done");
      return;
    }

    if (ev.type === "thought" || ev.type === "counterfactual") return;

    if (ev.type === "decision") {
      const p = ev.payload as unknown as DecisionPayload;

      if (p.verdict === "PAUSE") {
        setPendingDecisionId(ev.id);
        setStatus("paused");
        setEvents((prev) => {
          const last = [...prev].reverse().find((e) => e.type === "tool_call");
          if (last) setPendingToolLabel(String((last.payload as Record<string, unknown>).tool ?? ""));
          return prev;
        });
      }

      if (p.verdict === "BLOCK") {
        setBlockFlash(true);
        setTimeout(() => setBlockFlash(false), 2000);
        setInterdictions((n) => n + 1);
        const label = attackLabel(p.riskSignals ?? []);
        if (label) setAttackType(label);
        // count money blocked from the preceding tool_call
        setEvents((prev) => {
          const last = [...prev].reverse().find((e) => e.type === "tool_call");
          if (last) {
            const args = (last.payload as Record<string, unknown>).args as Record<string, unknown> | undefined;
            const amount = args?.amount;
            if (typeof amount === "number") setMoneyBlocked((m) => m + amount);
          }
          return prev;
        });
      }

      if (p.verdict === "PAUSE") setInterdictions((n) => n + 1);
    }

    setEvents((prev) => [ev, ...prev].slice(0, 12));
  }

  async function decide(action: "approve" | "reject") {
    if (!pendingDecisionId) return;
    const id = pendingDecisionId;
    setPendingDecisionId(null);
    setStatus("running");
    await fetch(`${ENGINE}/decide/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
  }

  const visibleEvents = events
    .filter((e) => e.type === "tool_call" || e.type === "decision")
    .slice(0, 6);

  const statusColor = status === "running" ? "#F7B955"
    : status === "paused" ? "#F7B955"
    : status === "done" ? "#2DD4A4"
    : "#8A8A93";

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden transition-all duration-300"
      style={{
        background: "#0D0D12",
        border: `1px solid ${blockFlash ? "#FF5A5A" : status === "paused" ? "rgba(247,185,85,0.5)" : "#262630"}`,
        boxShadow: blockFlash ? "0 0 16px rgba(255,90,90,0.3)" : "none",
        flex: 1,
        minWidth: 0,
      }}
    >
      {/* Card header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0"
        style={{ borderColor: "#1C1C24" }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{
            background: statusColor,
            boxShadow: status === "running" ? `0 0 4px ${statusColor}` : "none",
            animation: status === "running" ? "pulse 1.5s infinite" : "none",
          }}
        />
        <span className="text-[11px] font-mono font-semibold truncate flex-1" style={{ color: "#F5F5F7" }}>
          {agent.label}
        </span>
        <span className="text-[9px] font-mono uppercase tracking-widest shrink-0" style={{ color: statusColor }}>
          {status === "pending" ? "waiting" : status}
        </span>
      </div>

      {/* PAUSE banner */}
      {status === "paused" && pendingDecisionId && (
        <div
          className="flex flex-col gap-2 px-3 py-2 border-b shrink-0"
          style={{ background: "rgba(247,185,85,0.06)", borderColor: "rgba(247,185,85,0.2)" }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono font-bold" style={{ color: "#F7B955" }}>⚠ AWAITING REVIEW</span>
          </div>
          <p className="text-[10px] font-mono truncate" style={{ color: "#F5F5F7" }}>
            {pendingToolLabel}
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={() => decide("approve")}
              className="flex-1 py-1 rounded text-[9px] font-mono font-bold transition-all active:scale-95 hover:brightness-110"
              style={{ background: "rgba(45,212,164,0.15)", color: "#2DD4A4", border: "1px solid rgba(45,212,164,0.3)" }}
            >
              Approve ✓
            </button>
            <button
              onClick={() => decide("reject")}
              className="flex-1 py-1 rounded text-[9px] font-mono font-bold transition-all active:scale-95 hover:brightness-110"
              style={{ background: "rgba(255,90,90,0.1)", color: "#FF5A5A", border: "1px solid rgba(255,90,90,0.2)" }}
            >
              Deny ✗
            </button>
          </div>
        </div>
      )}

      {/* Attack badge */}
      {attackType && (
        <div className="px-3 py-1.5 border-b shrink-0" style={{ borderColor: "#1C1C24" }}>
          <span
            className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
            style={{ background: "rgba(255,90,90,0.12)", color: "#FF5A5A", border: "1px solid rgba(255,90,90,0.3)" }}
          >
            ⚡ {attackType}
          </span>
        </div>
      )}

      {/* Event log */}
      <div className="flex-1 overflow-hidden px-2 py-1.5 space-y-0.5 min-h-0">
        {status === "pending" && (
          <p className="text-[10px] font-mono py-4 text-center" style={{ color: "#8A8A93" }}>
            Starting…
          </p>
        )}
        {visibleEvents.length === 0 && status !== "pending" && (
          <p className="text-[10px] font-mono py-4 text-center" style={{ color: "#8A8A93" }}>
            Waiting for events…
          </p>
        )}
        {visibleEvents.map((ev) => {
          const isDecision = ev.type === "decision";
          const p = ev.payload as Record<string, unknown>;
          if (isDecision) {
            const verdict = String(p.verdict ?? "");
            return (
              <div key={ev.id} className="flex items-center gap-1.5 py-0.5">
                <span
                  className="text-[9px] font-mono font-bold px-1 py-0 rounded shrink-0"
                  style={{
                    color: verdictColor(verdict),
                    background: `${verdictColor(verdict)}15`,
                  }}
                >
                  {verdict}
                </span>
                <span className="text-[9px] font-mono truncate" style={{ color: "#8A8A93" }}>
                  {String(p.reasoning ?? "").slice(0, 60)}
                </span>
              </div>
            );
          }
          // tool_call
          return (
            <div key={ev.id} className="flex items-center gap-1.5 py-0.5">
              <span className="text-[9px] font-mono" style={{ color: "#8A8A93" }}>→</span>
              <span className="text-[9px] font-mono truncate" style={{ color: "#F5F5F7" }}>
                {shortTool(String(p.tool ?? ""))}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer stats */}
      <div
        className="flex items-center gap-3 px-3 py-1.5 border-t shrink-0"
        style={{ borderColor: "#1C1C24" }}
      >
        <span className="text-[9px] font-mono tabular-nums" style={{ color: interdictions > 0 ? "#FF5A5A" : "#8A8A93" }}>
          {interdictions} interdicted
        </span>
        {moneyBlocked > 0 && (
          <span className="text-[9px] font-mono tabular-nums" style={{ color: "#FF5A5A" }}>
            ${moneyBlocked.toLocaleString()} blocked
          </span>
        )}
        {status === "done" && interdictions === 0 && (
          <span className="text-[9px] font-mono" style={{ color: "#2DD4A4" }}>✓ clean</span>
        )}
      </div>
    </div>
  );
}

// ─── FleetView ────────────────────────────────────────────────────────────────

interface FleetViewProps {
  agents: FleetAgent[];
}

export default function FleetView({ agents }: FleetViewProps) {
  return (
    <div className="flex flex-col h-full" style={{ background: "#0A0A0D" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-2 border-b shrink-0"
        style={{ borderColor: "#262630" }}
      >
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
          Fleet Monitor
        </span>
        <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
          — {agents.length} agents running concurrently
        </span>
        <span
          className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded uppercase tracking-widest"
          style={{ background: "rgba(45,212,164,0.1)", color: "#2DD4A4", border: "1px solid rgba(45,212,164,0.2)" }}
        >
          Enterprise
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 flex gap-3 p-4 min-h-0">
        {agents.map((agent) => (
          <FleetCard key={agent.runId} agent={agent} />
        ))}
      </div>
    </div>
  );
}
