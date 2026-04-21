"use client";

import { useState, useCallback, useEffect } from "react";
import LiveView from "./LiveView";
import Timeline from "./Timeline";
import ForkView from "./ForkView";
import Preflight from "./Preflight";
import RedTeam from "./RedTeam";

const TABS = ["Live", "Timeline", "Fork", "Pre-flight", "Red Team"] as const;
type Tab = (typeof TABS)[number];

export default function Shell() {
  const [activeTab, setActiveTab] = useState<Tab>("Live");
  const [runId, setRunId] = useState<string | null>(null);

  const handleRunStarted = useCallback((id: string) => {
    setRunId(id);
  }, []);

  // Keyboard shortcuts: 1-5 to switch tabs
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < TABS.length) {
        setActiveTab(TABS[idx]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-col h-screen" style={{ background: "#0A0A0D" }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1 px-4 py-2 border-b shrink-0"
        style={{ borderColor: "#262630" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 mr-5">
          <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "#A78BFA" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A0A0D" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="font-mono text-sm font-medium tracking-widest" style={{ color: "#F5F5F7" }}>
            SENTINEL
          </span>
        </div>

        {/* Tabs */}
        {TABS.map((tab, i) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-150 active:scale-95"
              style={{
                background: isActive ? "#1C1C24" : "transparent",
                color: isActive ? "#F5F5F7" : "#8A8A93",
                border: isActive ? "1px solid #262630" : "1px solid transparent",
                boxShadow: isActive ? "0 0 12px rgba(167,139,250,0.08)" : "none",
              }}
            >
              <span className="opacity-40 mr-1">{i + 1}</span>
              {tab}
            </button>
          );
        })}

        {/* Agent context */}
        <div className="ml-auto flex items-center gap-3">
          {runId && (
            <>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded" style={{ color: "#8A8A93", background: "#14141A" }}>
                corp-assistant
              </span>
              <span className="font-mono text-[10px]" style={{ color: "#8A8A93" }}>
                {runId.slice(0, 8)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Agent task banner (shows what the agent was asked to do) ──── */}
      {runId && (
        <div
          className="flex items-center gap-3 px-5 py-1.5 border-b shrink-0"
          style={{ borderColor: "#262630", background: "#14141A" }}
        >
          <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
            Task
          </span>
          <span className="text-xs font-mono" style={{ color: "#F5F5F7" }}>
            &quot;Summarize my unread emails&quot;
          </span>
          <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
            4 tools: read_email, send_email, query_customers, post_slack
          </span>
        </div>
      )}

      {/* ── Tab content with fade transitions ──────────────────────────── */}
      <div className="flex-1 min-h-0 relative">
        {TABS.map((tab) => (
          <div
            key={tab}
            className="absolute inset-0 transition-opacity duration-200"
            style={{
              opacity: activeTab === tab ? 1 : 0,
              pointerEvents: activeTab === tab ? "auto" : "none",
            }}
          >
            {tab === "Live" && <LiveView onRunStarted={handleRunStarted} />}
            {tab === "Timeline" && <Timeline runId={runId} visible={activeTab === "Timeline"} />}
            {tab === "Fork" && <ForkView runId={runId} />}
            {tab === "Pre-flight" && <Preflight />}
            {tab === "Red Team" && <RedTeam />}
          </div>
        ))}
      </div>
    </div>
  );
}
