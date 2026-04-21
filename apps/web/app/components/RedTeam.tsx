"use client";

import { useState } from "react";

const ENGINE = "http://localhost:3001";

interface Attack {
  id: number;
  technique: string;
  payload: string;
  from: string;
  subject: string;
  targetTool: string;
  description: string;
}

interface AttackReport {
  attack: Attack;
  result: "blocked" | "paused" | "bypassed";
  precoqVerdict: string;
  suggestedPolicy?: string;
}

interface Summary {
  total: number;
  blocked: number;
  paused: number;
  bypassed: number;
}

export default function RedTeam() {
  const [reports, setReports] = useState<AttackReport[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "testing" | "done">("idle");
  const [progress, setProgress] = useState("");
  const [selected, setSelected] = useState<AttackReport | null>(null);

  async function startRedTeam() {
    setReports([]);
    setSummary(null);
    setSelected(null);
    setStatus("generating");
    setProgress("");

    try {
      const res = await fetch(`${ENGINE}/redteam/start`, { method: "POST" });
      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if ("message" in data) {
                setProgress(data.message);
              } else if ("count" in data) {
                setStatus("testing");
                setProgress(`Testing ${data.count} attacks...`);
              } else if ("attack" in data && "result" in data) {
                setReports((prev) => [...prev, data as AttackReport]);
              } else if ("total" in data && "bypassed" in data) {
                setSummary(data as Summary);
                setStatus("done");
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      console.error("Red team error:", err);
    }
    setStatus("done");
  }

  const resultColor = (r: string) => {
    if (r === "blocked") return "#2DD4A4";
    if (r === "paused") return "#F7B955";
    return "#FF5A5A";
  };

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="px-5 py-3 border-b shrink-0 flex items-center gap-4" style={{ borderColor: "#262630" }}>
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
          Red Team
        </span>
        {progress && (
          <span className="text-xs font-mono" style={{ color: "#A78BFA" }}>
            {progress}
          </span>
        )}
        <button
          onClick={startRedTeam}
          disabled={status === "generating" || status === "testing"}
          className="ml-auto px-4 py-1.5 rounded text-xs font-mono font-medium disabled:opacity-40 transition-all duration-150 active:scale-95 hover:brightness-110"
          style={{ background: "#FF5A5A", color: "#0A0A0D" }}
        >
          {status === "idle" ? "Launch attack" : status === "done" ? "Re-run" : "Attacking..."}
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Attack list */}
        <div className="flex-1 overflow-y-auto border-r" style={{ borderColor: "#262630" }}>
          {status === "idle" && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <p className="font-mono text-sm" style={{ color: "#8A8A93" }}>
                  Opus generates 10 novel injection attacks tailored to your agent.
                </p>
                <p className="font-mono text-xs" style={{ color: "#8A8A93" }}>
                  Each is tested against Pre-cog. Bypasses get auto-generated policies.
                </p>
              </div>
            </div>
          )}

          {reports.map((r, i) => (
            <button
              key={i}
              onClick={() => setSelected(r)}
              className="w-full text-left flex items-center gap-3 px-4 py-2.5 border-b transition-all duration-150 hover:bg-[#14141A] animate-slide-up"
              style={{
                borderColor: "#1C1C24",
                background: selected === r ? "#1C1C24" : undefined,
                borderLeft: selected === r ? "2px solid #A78BFA" : "2px solid transparent",
                animationDelay: `${i * 50}ms`,
              }}
            >
              <span className="font-mono text-[10px] w-6 text-right" style={{ color: "#8A8A93" }}>
                #{r.attack.id}
              </span>
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: resultColor(r.result) }}
              />
              <span className="font-mono text-xs truncate" style={{ color: "#F5F5F7" }}>
                {r.attack.subject}
              </span>
              <span
                className="ml-auto font-mono text-[10px] uppercase px-1.5 py-0.5 rounded"
                style={{
                  color: resultColor(r.result),
                  background: "#1C1C24",
                }}
              >
                {r.result}
              </span>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="w-[420px] shrink-0 overflow-y-auto p-4">
          {!selected ? (
            <div className="text-sm font-mono" style={{ color: "#8A8A93" }}>
              Select an attack to inspect.
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#8A8A93" }}>
                  Technique
                </div>
                <div className="font-mono text-sm" style={{ color: "#F5F5F7" }}>
                  {selected.attack.technique}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#8A8A93" }}>
                  Description
                </div>
                <div className="font-mono text-xs" style={{ color: "#8A8A93" }}>
                  {selected.attack.description}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#8A8A93" }}>
                  Target Tool
                </div>
                <div className="font-mono text-sm" style={{ color: "#F7B955" }}>
                  {selected.attack.targetTool}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#8A8A93" }}>
                  Result
                </div>
                <span
                  className="font-mono text-sm font-bold uppercase"
                  style={{ color: resultColor(selected.result) }}
                >
                  {selected.result}
                </span>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#8A8A93" }}>
                  Attack Payload
                </div>
                <pre
                  className="text-xs font-mono p-3 rounded whitespace-pre-wrap"
                  style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630" }}
                >
                  From: {selected.attack.from}{"\n"}Subject: {selected.attack.subject}{"\n\n"}{selected.attack.payload}
                </pre>
              </div>
              {selected.suggestedPolicy && (
                <div className="rounded p-3" style={{ background: "#14141A", border: "1px solid #2DD4A4" }}>
                  <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#2DD4A4" }}>
                    Auto-Generated Policy
                  </div>
                  <p className="text-xs font-mono" style={{ color: "#2DD4A4" }}>
                    {selected.suggestedPolicy}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Summary bar */}
      {summary && (
        <div className="px-5 py-4 border-t shrink-0 flex items-center gap-6 animate-fade-in" style={{ borderColor: "#262630", background: "#14141A" }}>
          <div className="font-mono text-sm font-medium" style={{ color: "#F5F5F7" }}>
            {summary.total} attacks
          </div>
          <div className="h-8 w-px" style={{ background: "#262630" }} />
          <div className="flex gap-5 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#2DD4A4]" />
              <span style={{ color: "#2DD4A4" }}>{summary.blocked} blocked</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#F7B955]" />
              <span style={{ color: "#F7B955" }}>{summary.paused} paused</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#FF5A5A]" />
              <span style={{ color: "#FF5A5A" }}>{summary.bypassed} bypassed</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
