"use client";

import { useState } from "react";

const ENGINE = "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventSummary {
  id: string;
  seq: number;
  type: string;
  payload: Record<string, unknown>;
}

interface ForkData {
  forkRunId: string;
  forkStatus: string;
  originalEvents: EventSummary[];
  forkEvents: EventSummary[];
  narration: string;
}

interface BlastRadius {
  recordsAccessed: number;
  piiClassesExposed: string[];
  moneyDisbursed: number;
  emailsSent: number;
  externalEmailsSent: string[];
  slackMessagesSent: number;
  actionsInterdicted: number;
  moneyInterdicted: number;
  externalEmailsBlocked: string[];
  piiExfiltrationAttempted: boolean;
  actionsExecuted: number;
  totalToolCalls: number;
  interdictedByPolicy: number;
  interdictedByPrecog: number;
  reversible: boolean;
  severity: string;
  summary: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function eventRow(ev: EventSummary) {
  if (ev.type === "tool_call") {
    const tool = ev.payload.tool as string;
    const args = JSON.stringify(ev.payload.args).slice(0, 70);
    return { label: tool, detail: args };
  }
  if (ev.type === "decision") {
    const v = ev.payload.verdict as string;
    const src = ev.payload.source === "policy" ? " [POLICY]" : " [OPUS]";
    const r = (ev.payload.reasoning as string)?.slice(0, 60) ?? "";
    return { label: v + src, detail: r };
  }
  return { label: ev.type, detail: "" };
}

function verdictColor(label: string) {
  if (label.startsWith("ALLOW")) return "#2DD4A4";
  if (label.startsWith("PAUSE")) return "#F7B955";
  if (label.startsWith("BLOCK")) return "#FF5A5A";
  return "#F5F5F7";
}

function severityColor(s: string) {
  if (s === "critical") return "#FF5A5A";
  if (s === "high") return "#F7B955";
  if (s === "medium") return "#FCD34D";
  return "#2DD4A4";
}

function BlastCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className="flex flex-col gap-0.5 p-2.5 rounded"
      style={{ background: "#0A0A0D", border: `1px solid ${highlight ? "#F7B955" : "#262630"}` }}
    >
      <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
        {label}
      </span>
      <span
        className="text-sm font-mono font-bold"
        style={{ color: highlight ? "#F7B955" : "#F5F5F7" }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ForkView({ runId }: { runId: string | null }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ForkData | null>(null);
  const [originalBlast, setOriginalBlast] = useState<BlastRadius | null>(null);
  const [forkBlast, setForkBlast] = useState<BlastRadius | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  async function triggerFork() {
    if (!runId) return;
    setLoading(true);
    setError(null);
    setOriginalBlast(null);
    setForkBlast(null);

    try {
      const snapRes = await fetch(`${ENGINE}/timeline/${runId}/snapshot/999`);
      const snap = await snapRes.json();

      // Remove the injection ticket from the world
      const editedWorld = {
        ...snap.world,
        inbox: (snap.world.inbox ?? []).filter((e: { id: string }) => e.id !== "email_003"),
        tickets: (snap.world.tickets ?? []).filter((t: { id: string }) => t.id !== "ticket_003"),
      };

      const res = await fetch(`${ENGINE}/fork/${runId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromSeq: 1, editedWorld }),
      });

      if (!res.ok) throw new Error(`Fork failed: ${res.status}`);
      const forkData: ForkData = await res.json();
      setData(forkData);

      // Fetch blast radius for both runs (fast, no Opus)
      const [origBlastRes, forkBlastRes] = await Promise.all([
        fetch(`${ENGINE}/analysis/${runId}/blast`),
        fetch(`${ENGINE}/analysis/${forkData.forkRunId}/blast`),
      ]);
      const origBlastJson = await origBlastRes.json();
      const forkBlastJson = await forkBlastRes.json();
      if (origBlastJson.blast) setOriginalBlast(origBlastJson.blast);
      if (forkBlastJson.blast) setForkBlast(forkBlastJson.blast);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function downloadReport() {
    if (!runId) return;
    setReportLoading(true);
    try {
      const res = await fetch(`${ENGINE}/analysis/${runId}/incident-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Report failed: ${res.status}`);
      const md = await res.text();
      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sentinel-incident-${runId.slice(0, 8)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Report error:", err);
    } finally {
      setReportLoading(false);
    }
  }

  // ── Empty states ───────────────────────────────────────────────────────────

  if (!runId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="font-mono text-sm" style={{ color: "#8A8A93" }}>
          Run the agent first, then view forks.
        </p>
      </div>
    );
  }

  if (!data && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-2" style={{ background: "#14141A" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7DD3FC" strokeWidth="1.5">
            <path d="M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9a9 9 0 01-9 9" />
          </svg>
        </div>
        <p className="font-mono text-sm" style={{ color: "#F5F5F7" }}>Fork reality</p>
        <p className="font-mono text-xs mb-3 text-center max-w-[280px]" style={{ color: "#8A8A93" }}>
          Remove the injection and replay the agent. See exactly what Sentinel prevented.
        </p>
        <button
          onClick={triggerFork}
          className="px-5 py-2 rounded text-sm font-mono font-medium transition-all duration-150 active:scale-95 hover:brightness-110"
          style={{ background: "#7DD3FC", color: "#0A0A0D" }}
        >
          Fork & Replay
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[#A78BFA] animate-pulse" />
          <span className="w-2 h-2 rounded-full bg-[#7DD3FC] animate-pulse" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-[#2DD4A4] animate-pulse" style={{ animationDelay: "300ms" }} />
        </div>
        <p className="font-mono text-sm" style={{ color: "#A78BFA" }}>Forking reality...</p>
        <p className="font-mono text-xs" style={{ color: "#8A8A93" }}>Replaying agent in alternate timeline</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="font-mono text-sm" style={{ color: "#FF5A5A" }}>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-fade-in" style={{ background: "#0A0A0D" }}>

      {/* ── Blast Radius panel ────────────────────────────────────────── */}
      {originalBlast && (
        <div
          className="px-4 py-3 border-b shrink-0"
          style={{ borderColor: "#262630", background: "#0D0D12" }}
        >
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-mono font-bold px-2 py-0.5 rounded"
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
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono" style={{ color: originalBlast.reversible ? "#2DD4A4" : "#FF5A5A" }}>
                {originalBlast.reversible ? "✓ reversible" : "⚠ irreversible"}
              </span>
              <button
                onClick={downloadReport}
                disabled={reportLoading}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-50"
                style={{ background: "#1C1C24", color: "#A78BFA", border: "1px solid #A78BFA40" }}
              >
                {reportLoading ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse" />
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                )}
                {reportLoading ? "Generating..." : "Incident Report"}
              </button>
            </div>
          </div>

          {/* Metrics grid — two columns: Original vs Fork */}
          <div className="grid grid-cols-2 gap-2">
            {/* Original run */}
            <div className="space-y-1.5">
              <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: "#8A8A93" }}>
                Original run
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <BlastCard
                  label="Money interdicted"
                  value={`$${originalBlast.moneyInterdicted.toLocaleString()}`}
                  highlight={originalBlast.moneyInterdicted > 0}
                />
                <BlastCard
                  label="Exfil blocked"
                  value={originalBlast.externalEmailsBlocked.length > 0
                    ? originalBlast.externalEmailsBlocked[0]
                    : "none"}
                  highlight={originalBlast.externalEmailsBlocked.length > 0}
                />
                <BlastCard
                  label="Records accessed"
                  value={String(originalBlast.recordsAccessed)}
                />
                <BlastCard
                  label="Interdictions"
                  value={`${originalBlast.actionsInterdicted} (${originalBlast.interdictedByPolicy}P / ${originalBlast.interdictedByPrecog}O)`}
                />
              </div>
            </div>

            {/* Fork run */}
            <div className="space-y-1.5">
              <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: "#7DD3FC" }}>
                Fork (injection removed)
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <BlastCard
                  label="Money disbursed"
                  value={forkBlast ? `$${forkBlast.moneyDisbursed.toLocaleString()}` : "—"}
                />
                <BlastCard
                  label="External emails"
                  value={forkBlast
                    ? forkBlast.externalEmailsSent.length > 0 ? forkBlast.externalEmailsSent[0] : "none"
                    : "—"}
                />
                <BlastCard
                  label="Records accessed"
                  value={forkBlast ? String(forkBlast.recordsAccessed) : "—"}
                />
                <BlastCard
                  label="Interdictions"
                  value={forkBlast ? String(forkBlast.actionsInterdicted) : "—"}
                />
              </div>
            </div>
          </div>

          {/* Summary line */}
          <p className="text-[11px] font-mono mt-2.5 leading-relaxed" style={{ color: "#8A8A93" }}>
            {originalBlast.summary}
          </p>
        </div>
      )}

      {/* ── Two-column event stream ────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Branch A: Original */}
        <div className="flex-1 border-r flex flex-col" style={{ borderColor: "#262630" }}>
          <div
            className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest shrink-0 flex items-center gap-2"
            style={{ color: "#F5F5F7", borderBottom: "1px solid #262630" }}
          >
            <span className="w-2 h-2 rounded-full bg-[#F5F5F7]" />
            Original Run
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {data?.originalEvents.map((ev) => {
              const { label, detail } = eventRow(ev);
              const isDecision = ev.type === "decision";
              return (
                <div
                  key={ev.id}
                  className="flex items-start gap-2 px-2 py-1.5 rounded text-xs font-mono"
                  style={{ background: "#14141A" }}
                >
                  <span className="w-5 text-right shrink-0" style={{ color: "#8A8A93" }}>
                    #{ev.seq}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span style={{ color: isDecision ? verdictColor(label) : "#F5F5F7" }}>
                      {label}
                    </span>
                    {detail && (
                      <span className="truncate text-[10px]" style={{ color: "#8A8A93" }}>
                        {detail}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Branch B: Fork */}
        <div className="flex-1 flex flex-col" style={{ background: "rgba(125, 211, 252, 0.02)" }}>
          <div
            className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest shrink-0 flex items-center gap-2"
            style={{ color: "#7DD3FC", borderBottom: "1px solid #262630" }}
          >
            <span className="w-2 h-2 rounded-full bg-[#7DD3FC]" />
            Fork — injection removed
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {data?.forkEvents.map((ev) => {
              const { label, detail } = eventRow(ev);
              const isDecision = ev.type === "decision";
              return (
                <div
                  key={ev.id}
                  className="flex items-start gap-2 px-2 py-1.5 rounded text-xs font-mono"
                  style={{ background: "#14141A" }}
                >
                  <span className="w-5 text-right shrink-0" style={{ color: "#8A8A93" }}>
                    #{ev.seq}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span style={{ color: isDecision ? verdictColor(label) : "#7DD3FC" }}>
                      {label}
                    </span>
                    {detail && (
                      <span className="truncate text-[10px]" style={{ color: "#8A8A93" }}>
                        {detail}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Narration panel ───────────────────────────────────────────── */}
      {data?.narration && (
        <div
          className="px-5 py-3 border-t shrink-0"
          style={{ borderColor: "#262630", background: "#14141A" }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA]" />
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#A78BFA" }}>
              Opus Counterfactual Analysis
            </span>
          </div>
          <p className="text-xs font-mono leading-relaxed" style={{ color: "#A78BFA" }}>
            {data.narration}
          </p>
        </div>
      )}
    </div>
  );
}
