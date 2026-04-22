"use client";

import { useState, useCallback, useEffect } from "react";
import CommandCenter from "./CommandCenter";
import LiveView from "./LiveView";
import Replay from "./Replay";
import Preflight from "./Preflight";
import RedTeam from "./RedTeam";

const TABS = ["Command Center", "Runtime", "Replay", "Pre-flight", "Red Team"] as const;
type Tab = (typeof TABS)[number];

const TAB_SUBTITLES: Record<Tab, string> = {
  "Command Center": "Trust Score · Stats · Policy overview",
  "Runtime":        "Live interception · Pre-cog · Approve/Deny",
  "Replay":         "Timeline scrubber · Fork · Opus analysis",
  "Pre-flight":     "Synthetic scenario simulator · Safety grade",
  "Red Team":       "Adaptive attacker · Policy synthesis · Catalog",
};

// ─── Help modal ───────────────────────────────────────────────────────────────

function HelpModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "?") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sections = [
    {
      label: "Navigation",
      shortcuts: [
        { keys: ["1", "2", "3", "4", "5"], desc: "Switch tabs" },
        { keys: ["?"], desc: "Toggle this help" },
        { keys: ["Esc"], desc: "Close modal / clear search" },
      ],
    },
    {
      label: "Live — Events",
      shortcuts: [
        { keys: ["r"], desc: "Run agent" },
        { keys: ["j", "k"], desc: "Navigate events (down / up)" },
        { keys: ["a"], desc: "Approve paused action" },
        { keys: ["d"], desc: "Deny paused action" },
        { keys: ["/"], desc: "Open event search" },
      ],
    },
    {
      label: "Replay",
      shortcuts: [
        { keys: ["←", "→"], desc: "Scrub timeline" },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(10,10,13,0.8)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-6 w-[440px] animate-fade-in"
        style={{ background: "#14141A", border: "1px solid #262630", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <span className="font-mono text-sm font-semibold" style={{ color: "#F5F5F7" }}>
            Keyboard shortcuts
          </span>
          <button
            onClick={onClose}
            className="text-[10px] font-mono px-2 py-1 rounded transition-all hover:brightness-150"
            style={{ color: "#8A8A93", background: "#1C1C24" }}
          >
            Esc
          </button>
        </div>

        <div className="space-y-5">
          {sections.map(({ label, shortcuts }) => (
            <div key={label}>
              <div className="text-[9px] font-mono uppercase tracking-widest mb-2" style={{ color: "#8A8A93" }}>
                {label}
              </div>
              <div className="space-y-1.5">
                {shortcuts.map(({ keys, desc }) => (
                  <div key={desc} className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {keys.map((k) => (
                        <kbd
                          key={k}
                          className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                          style={{ background: "#0A0A0D", color: "#F5F5F7", border: "1px solid #262630" }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                    <span className="text-xs font-mono" style={{ color: "#8A8A93" }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t text-[10px] font-mono text-center" style={{ borderColor: "#262630", color: "#8A8A93" }}>
          Press <kbd className="px-1 py-0.5 rounded mx-1" style={{ background: "#0A0A0D", border: "1px solid #262630" }}>?</kbd> anytime to toggle
        </div>
      </div>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function Shell() {
  const [activeTab, setActiveTab] = useState<Tab>("Command Center");
  const [runId, setRunId] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState<string>("Sentinel Agent");
  const [showHelp, setShowHelp] = useState(false);
  const [pendingRun, setPendingRun] = useState(false);

  const handleRunStarted = useCallback((id: string, label?: string) => {
    setRunId(id);
    if (label) setAgentLabel(label);
  }, []);

  const handleRequestRun = useCallback(() => {
    setPendingRun(true);
    setActiveTab("Runtime");
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      // Tab switching: 1-5
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < TABS.length) {
        setActiveTab(TABS[idx] as Tab);
        return;
      }
      // Help modal
      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-col h-screen" style={{ background: "#0A0A0D" }}>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

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
          <div className="flex flex-col">
            <span className="font-mono text-sm font-medium tracking-widest" style={{ color: "#F5F5F7" }}>
              SENTINEL
            </span>
            <span className="font-mono text-[9px] tracking-widest" style={{ color: "#8A8A93" }}>
              AI Agent Security Platform
            </span>
          </div>
        </div>

        {/* Tabs */}
        {TABS.map((tab, i) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              title={TAB_SUBTITLES[tab]}
              className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-150 active:scale-95"
              style={{
                background: isActive ? "#1C1C24" : "transparent",
                color: isActive ? "#F5F5F7" : "#8A8A93",
                border: isActive ? "1px solid #262630" : "1px solid transparent",
                boxShadow: isActive ? "0 0 12px rgba(167,139,250,0.08)" : "none",
              }}
            >
              <span className="opacity-40 mr-1">{i + 1}</span>
              {tab === "Red Team" ? "Red Team & Policies" : tab}
            </button>
          );
        })}

        {/* Agent context + help hint */}
        <div className="ml-auto flex items-center gap-3">
          {runId && (
            <>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded" style={{ color: "#8A8A93", background: "#14141A" }}>
                {agentLabel}
              </span>
              <span className="font-mono text-[10px]" style={{ color: "#8A8A93" }}>
                {runId.slice(0, 8)}
              </span>
            </>
          )}
          <button
            onClick={() => setShowHelp(true)}
            className="font-mono text-[10px] px-1.5 py-0.5 rounded transition-all hover:brightness-150"
            style={{ color: "#8A8A93", background: "#14141A", border: "1px solid #262630" }}
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>
        </div>
      </div>

      {/* ── Agent task banner ────────────────────────────────────────── */}
      {runId && (
        <div
          className="flex items-center gap-3 px-5 py-1.5 border-b shrink-0"
          style={{ borderColor: "#262630", background: "#14141A" }}
        >
          <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
            Task
          </span>
          <span className="text-xs font-mono" style={{ color: "#F5F5F7" }}>
            &quot;Process all open support tickets&quot;
          </span>
          <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
            7 tools: lookup_customer_detail, apply_refund, update_ticket, send_email, post_slack…
          </span>
        </div>
      )}

      {/* ── Tab content ──────────────────────────────────────────────── */}
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
            {tab === "Command Center" && (
              <CommandCenter
                onNavigate={(t) => setActiveTab(t as Tab)}
                onRequestRun={handleRequestRun}
              />
            )}
            {tab === "Runtime" && (
              <LiveView
                onRunStarted={handleRunStarted}
                pendingRun={pendingRun}
                onPendingRunConsumed={() => setPendingRun(false)}
              />
            )}
            {tab === "Replay" && <Replay runId={runId} visible={activeTab === "Replay"} />}
            {tab === "Pre-flight" && <Preflight />}
            {tab === "Red Team" && <RedTeam />}
          </div>
        ))}
      </div>
    </div>
  );
}
