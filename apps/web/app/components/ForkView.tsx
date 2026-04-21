"use client";

import { useState, useEffect, useRef } from "react";

const ENGINE = "http://localhost:3001";

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

function eventRow(ev: EventSummary) {
  if (ev.type === "tool_call") {
    const tool = ev.payload.tool as string;
    const args = JSON.stringify(ev.payload.args).slice(0, 80);
    return { label: tool, detail: args };
  }
  if (ev.type === "decision") {
    const v = ev.payload.verdict as string;
    const r = (ev.payload.reasoning as string)?.slice(0, 80) ?? "";
    return { label: v, detail: r };
  }
  return { label: ev.type, detail: "" };
}

function verdictStyle(verdict: string) {
  if (verdict === "ALLOW") return { color: "#2DD4A4" };
  if (verdict === "PAUSE") return { color: "#F7B955" };
  if (verdict === "BLOCK") return { color: "#FF5A5A" };
  return { color: "#F5F5F7" };
}

export default function ForkView({ runId }: { runId: string | null }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ForkData | null>(null);
  const [streamingNarration, setStreamingNarration] = useState("");
  const [error, setError] = useState<string | null>(null);

  // For the demo: auto-fork when we have a runId (remove email_003 scenario)
  async function triggerFork() {
    if (!runId) return;
    setLoading(true);
    setError(null);
    setStreamingNarration("");

    try {
      // Get current snapshot to build edited world (remove phishing email)
      const snapRes = await fetch(`${ENGINE}/timeline/${runId}/snapshot/999`);
      const snap = await snapRes.json();

      const editedWorld = {
        ...snap.world,
        inbox: snap.world.inbox.filter((e: { id: string }) => e.id !== "email_003"),
      };

      const res = await fetch(`${ENGINE}/fork/${runId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromSeq: 1, editedWorld }),
      });

      if (!res.ok) throw new Error(`Fork failed: ${res.status}`);
      const forkData: ForkData = await res.json();
      setData(forkData);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

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
        <p className="font-mono text-sm" style={{ color: "#8A8A93" }}>
          Fork reality: remove the phishing email and replay.
        </p>
        <button
          onClick={triggerFork}
          className="px-4 py-2 rounded text-sm font-mono font-medium"
          style={{ background: "#7DD3FC", color: "#0A0A0D" }}
        >
          Fork: Remove email_003 & replay
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3">
        <span className="w-2 h-2 rounded-full bg-[#A78BFA] animate-pulse" />
        <p className="font-mono text-sm" style={{ color: "#A78BFA" }}>
          Forking reality... Opus is replaying the alternate timeline
        </p>
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
    <div className="flex flex-col h-full">
      {/* ── Two columns ───────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Branch A: Original (what happened) */}
        <div className="flex-1 border-r flex flex-col" style={{ borderColor: "#262630" }}>
          <div
            className="px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest shrink-0 flex items-center gap-2"
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
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono"
                  style={{ background: "#14141A" }}
                >
                  <span className="w-5 text-right" style={{ color: "#8A8A93" }}>
                    #{ev.seq}
                  </span>
                  <span style={isDecision ? verdictStyle(label) : { color: "#F5F5F7" }}>
                    {label}
                  </span>
                  <span className="truncate" style={{ color: "#8A8A93" }}>
                    {detail}
                  </span>
                </div>
              );
            })}
            {/* Damage summary */}
            <div className="mt-4 p-3 rounded" style={{ background: "#1C1C24", border: "1px solid #FF5A5A" }}>
              <div className="text-xs font-mono font-bold" style={{ color: "#FF5A5A" }}>
                BLOCKED — Pre-cog detected injection chain
              </div>
              <div className="text-[11px] font-mono mt-1" style={{ color: "#8A8A93" }}>
                query_customers was blocked before data exfiltration
              </div>
            </div>
          </div>
        </div>

        {/* Branch B: Fork (alternate reality) */}
        <div
          className="flex-1 flex flex-col"
          style={{ background: "rgba(125, 211, 252, 0.02)" }}
        >
          <div
            className="px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest shrink-0 flex items-center gap-2"
            style={{ color: "#7DD3FC", borderBottom: "1px solid #262630" }}
          >
            <span className="w-2 h-2 rounded-full bg-[#7DD3FC]" />
            Forked Run — email_003 removed
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {data?.forkEvents.map((ev) => {
              const { label, detail } = eventRow(ev);
              const isDecision = ev.type === "decision";
              return (
                <div
                  key={ev.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs font-mono"
                  style={{ background: "#14141A" }}
                >
                  <span className="w-5 text-right" style={{ color: "#8A8A93" }}>
                    #{ev.seq}
                  </span>
                  <span style={isDecision ? verdictStyle(label) : { color: "#7DD3FC" }}>
                    {label}
                  </span>
                  <span className="truncate" style={{ color: "#8A8A93" }}>
                    {detail}
                  </span>
                </div>
              );
            })}
            {/* Clean outcome */}
            <div className="mt-4 p-3 rounded" style={{ background: "#1C1C24", border: "1px solid #2DD4A4" }}>
              <div className="text-xs font-mono font-bold" style={{ color: "#2DD4A4" }}>
                CLEAN RUN — No injection, no exfiltration
              </div>
              <div className="text-[11px] font-mono mt-1" style={{ color: "#8A8A93" }}>
                Agent summarized emails normally. 0 records leaked.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Narration panel ───────────────────────────────────────────── */}
      {data?.narration && (
        <div
          className="px-5 py-4 border-t shrink-0"
          style={{ borderColor: "#262630", background: "#14141A" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA]" />
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#A78BFA" }}>
              Opus Narration
            </span>
          </div>
          <p className="text-sm font-mono leading-relaxed" style={{ color: "#A78BFA" }}>
            {data.narration}
          </p>
        </div>
      )}
    </div>
  );
}
