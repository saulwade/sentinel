"use client";

import { useState, useCallback } from "react";
import LiveView from "./LiveView";
import Timeline from "./Timeline";
import ForkView from "./ForkView";

const TABS = ["Live", "Timeline", "Fork", "Pre-flight", "Red Team"] as const;
type Tab = (typeof TABS)[number];

export default function Shell() {
  const [activeTab, setActiveTab] = useState<Tab>("Live");
  const [runId, setRunId] = useState<string | null>(null);

  const handleRunStarted = useCallback((id: string) => {
    setRunId(id);
  }, []);

  return (
    <div className="flex flex-col h-screen" style={{ background: "#0A0A0D" }}>
      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1 px-4 py-2 border-b shrink-0"
        style={{ borderColor: "#262630" }}
      >
        <span
          className="font-mono text-sm font-medium tracking-widest mr-4"
          style={{ color: "#F5F5F7" }}
        >
          SENTINEL
        </span>
        {TABS.map((tab, i) => {
          const enabled = tab === "Live" || tab === "Timeline" || tab === "Fork";
          return (
            <button
              key={tab}
              onClick={() => enabled && setActiveTab(tab)}
              className="px-3 py-1.5 rounded text-xs font-mono transition-colors"
              style={{
                background: activeTab === tab ? "#1C1C24" : undefined,
                color: activeTab === tab ? "#F5F5F7" : enabled ? "#8A8A93" : "#3a3a44",
                border: activeTab === tab ? "1px solid #262630" : "1px solid transparent",
                cursor: enabled ? "pointer" : "default",
              }}
            >
              {i + 1}. {tab}
            </button>
          );
        })}
        {runId && (
          <span className="ml-auto font-mono text-xs" style={{ color: "#8A8A93" }}>
            {runId.slice(0, 8)}
          </span>
        )}
      </div>

      {/* ── Tab content — hidden, not unmounted, to preserve state ────── */}
      <div className="flex-1 min-h-0 relative">
        <div className={`absolute inset-0 ${activeTab === "Live" ? "" : "hidden"}`}>
          <LiveView onRunStarted={handleRunStarted} />
        </div>
        <div className={`absolute inset-0 ${activeTab === "Timeline" ? "" : "hidden"}`}>
          <Timeline runId={runId} />
        </div>
        <div className={`absolute inset-0 ${activeTab === "Fork" ? "" : "hidden"}`}>
          <ForkView runId={runId} />
        </div>
        <div className={`absolute inset-0 flex items-center justify-center ${activeTab === "Pre-flight" ? "" : "hidden"}`}>
          <p className="font-mono text-sm" style={{ color: "#8A8A93" }}>Pre-flight — Day 3</p>
        </div>
        <div className={`absolute inset-0 flex items-center justify-center ${activeTab === "Red Team" ? "" : "hidden"}`}>
          <p className="font-mono text-sm" style={{ color: "#8A8A93" }}>Red Team — Day 3</p>
        </div>
      </div>
    </div>
  );
}
