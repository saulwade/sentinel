"use client";

import { useState, useRef } from "react";

const ENGINE = "http://localhost:3001";

interface DayResult {
  day: number;
  events: number;
  actions: number;
  status: "pass" | "fail" | "running";
  failures: Array<{
    event: { from: string; subject: string; body: string; isAdversarial: boolean };
    reason: string;
    detail: string;
  }>;
}

interface PreflightResult {
  totalDays: number;
  totalScenarios: number;
  passed: number;
  failed: number;
  grade: string;
}

export default function Preflight() {
  const [days, setDays] = useState<DayResult[]>([]);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "running" | "done">("idle");
  const [progress, setProgress] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function startPreflight() {
    setDays([]);
    setResult(null);
    setStatus("generating");
    setProgress("");

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${ENGINE}/preflight/start`, {
        method: "POST",
        signal: abortRef.current.signal,
      });

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
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              // Handle based on preceding event line
              if ("message" in parsed) {
                setProgress(parsed.message);
              } else if ("day" in parsed && "status" in parsed) {
                setStatus("running");
                setDays((prev) => [...prev, parsed as DayResult]);
              } else if ("grade" in parsed) {
                setResult(parsed as PreflightResult);
                setStatus("done");
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Preflight error:", err);
      }
    }
    setStatus("done");
  }

  const gradeColor = (grade: string) => {
    if (grade.startsWith("A")) return "#2DD4A4";
    if (grade.startsWith("B")) return "#F7B955";
    return "#FF5A5A";
  };

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="px-5 py-3 border-b shrink-0 flex items-center gap-4" style={{ borderColor: "#262630" }}>
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
          Pre-flight Simulator
        </span>
        {progress && (
          <span className="text-xs font-mono" style={{ color: "#A78BFA" }}>
            {progress}
          </span>
        )}
        <button
          onClick={startPreflight}
          disabled={status === "generating" || status === "running"}
          className="ml-auto px-4 py-1.5 rounded text-xs font-mono font-medium disabled:opacity-40"
          style={{ background: "#A78BFA", color: "#0A0A0D" }}
        >
          {status === "idle" ? "Run simulation" : status === "done" ? "Re-run" : "Running..."}
        </button>
      </div>

      {/* Day stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {status === "idle" && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <p className="font-mono text-sm" style={{ color: "#8A8A93" }}>
                Run your agent through 30 simulated days of synthetic scenarios.
              </p>
              <p className="font-mono text-xs" style={{ color: "#8A8A93" }}>
                Opus generates emails (safe, edge-case, adversarial) and evaluates each.
              </p>
            </div>
          </div>
        )}

        {days.map((day) => (
          <div
            key={day.day}
            className="flex items-center gap-3 px-3 py-2 rounded font-mono text-xs"
            style={{ background: "#14141A" }}
          >
            <span className="w-12" style={{ color: "#8A8A93" }}>
              day {String(day.day).padStart(2, "0")}
            </span>
            <div
              className="flex-1 h-1.5 rounded-full"
              style={{ background: "#262630" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: "100%",
                  background: day.status === "pass" ? "#2DD4A4" : "#FF5A5A",
                }}
              />
            </div>
            <span style={{ color: "#8A8A93" }}>
              {day.events} events
            </span>
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background: day.status === "pass" ? "#2DD4A4" : "#FF5A5A",
              }}
            />
            {day.failures.length > 0 && (
              <span style={{ color: "#FF5A5A" }}>
                {day.failures.length} fail{day.failures.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Grade card */}
      {result && (
        <div
          className="px-5 py-4 border-t shrink-0"
          style={{ borderColor: "#262630", background: "#14141A" }}
        >
          <div className="flex items-center gap-6">
            <div
              className="text-4xl font-mono font-bold"
              style={{ color: gradeColor(result.grade) }}
            >
              {result.grade}
            </div>
            <div className="space-y-1">
              <div className="text-sm font-mono" style={{ color: "#F5F5F7" }}>
                {result.passed} passed · {result.failed} failed · {result.totalScenarios} total
              </div>
              <div className="text-xs font-mono" style={{ color: "#8A8A93" }}>
                {result.totalDays} simulated days · {result.totalScenarios} scenarios evaluated
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
