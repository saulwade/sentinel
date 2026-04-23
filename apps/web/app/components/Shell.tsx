"use client";

import { useState, useCallback, useEffect } from "react";
import CommandCenter from "./CommandCenter";
import LiveView from "./LiveView";
import Replay from "./Replay";
import Preflight from "./Preflight";
import RedTeam from "./RedTeam";
import AskOpus from "./AskOpus";
import OnboardingOverlay from "./OnboardingOverlay";
import { ENGINE } from "../lib/engine";

const TABS = ["Command Center", "Runtime", "Replay", "Pre-flight", "Red Team", "Ask"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  "Command Center": "Command Center",
  "Runtime":        "Runtime",
  "Replay":         "Investigate",
  "Pre-flight":     "Test Before Deploy",
  "Red Team":       "Stress Test & Policies",
  "Ask":            "Ask Opus",
};

const TAB_SUBTITLES: Record<Tab, string> = {
  "Command Center": "Trust Score, policy stats, and agent fleet overview",
  "Runtime":        "Watch agents run in real-time — Sentinel intercepts every action",
  "Replay":         "Investigate past incidents, scrub the timeline, and adopt hardening policies",
  "Pre-flight":     "Simulate attack scenarios before deploying your agent to verify it's safe",
  "Red Team":       "Run adaptive adversarial attacks and synthesize new security policies from bypasses",
  "Ask":            "Ask Sentinel anything — Opus 4.7 answers grounded in your full operational history",
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
        { keys: ["1", "2", "3", "4", "5", "6"], desc: "Switch tabs" },
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
        className="rounded-xl p-6 w-[min(440px,calc(100vw-1.5rem))] mx-3 animate-fade-in"
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
  const [taskDescription, setTaskDescription] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [pendingRun, setPendingRun] = useState(false);
  const [pendingScenario, setPendingScenario] = useState<string | null>(null);
  const [externalRunId, setExternalRunId] = useState<string | null>(null);
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [executive, setExecutive] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [engineOnline, setEngineOnline] = useState<boolean | null>(null);

  async function handleReset() {
    setResetting(true);
    try {
      await fetch(`${ENGINE}/admin/reset`, { method: "POST" });
      setRunId(null);
      setAgentLabel("Sentinel Agent");
      setTaskDescription(null);
      setPendingRun(false);
      setPendingScenario(null);
      setExternalRunId(null);
    } finally {
      setResetting(false);
      setShowResetConfirm(false);
    }
  }

  useEffect(() => {
    try {
      if (!localStorage.getItem("sentinel_onboarding_seen")) setShowOnboarding(true);
      if (localStorage.getItem("sentinel_view_mode") === "executive") setExecutive(true);
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch(`${ENGINE}/health`, { signal: controller.signal });
        if (!cancelled) setEngineOnline(res.ok);
      } catch {
        if (!cancelled) setEngineOnline(false);
      } finally {
        clearTimeout(t);
      }
    }
    ping();
    const t = setInterval(ping, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const toggleExecutive = useCallback(() => {
    setExecutive((v) => {
      const next = !v;
      try { localStorage.setItem("sentinel_view_mode", next ? "executive" : "technical"); } catch {}
      return next;
    });
  }, []);

  const handleRunStarted = useCallback((id: string, label?: string, task?: string) => {
    setRunId(id);
    if (label) setAgentLabel(label);
    if (task) setTaskDescription(task);
  }, []);

  const handleAutoDemoNavigate = useCallback((tab: string) => {
    setActiveTab(tab as Tab);
    if (tab === "Replay") setAutoAnalyze(true);
  }, []);

  const handleOnboardingStart = useCallback(() => {
    setShowOnboarding(false);
    try { localStorage.setItem("sentinel_onboarding_seen", "1"); } catch {}
    setPendingScenario("ceo");
    setPendingRun(true);
    setActiveTab("Runtime");
  }, []);

  const handleOnboardingSkip = useCallback(() => {
    setShowOnboarding(false);
    try { localStorage.setItem("sentinel_onboarding_seen", "1"); } catch {}
  }, []);

  const handleRequestRun = useCallback(() => {
    setPendingRun(true);
    setActiveTab("Runtime");
  }, []);

  const handleLaunchedCustomRun = useCallback((runId: string, label: string, task: string) => {
    handleRunStarted(runId, label, task);
    setExternalRunId(runId);
    setActiveTab("Runtime");
  }, [handleRunStarted]);

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
      {showOnboarding && (
        <OnboardingOverlay onStartDemo={handleOnboardingStart} onSkip={handleOnboardingSkip} />
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1 flex-wrap px-4 py-2 border-b shrink-0"
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
              {TAB_LABELS[tab]}
            </button>
          );
        })}

        {/* Agent context + help hint */}
        <div className="ml-auto flex items-center gap-3">
          <div
            className="flex rounded overflow-hidden shrink-0"
            style={{ border: "1px solid #262630" }}
            title="Switch between technical detail and an exec-friendly overview"
          >
            <button
              onClick={() => executive && toggleExecutive()}
              className="px-2 py-0.5 text-[10px] font-mono transition-all"
              style={{
                background: !executive ? "#1C1C24" : "transparent",
                color: !executive ? "#F5F5F7" : "#8A8A93",
                fontWeight: !executive ? 600 : 400,
              }}
            >
              Technical
            </button>
            <button
              onClick={() => !executive && toggleExecutive()}
              className="px-2 py-0.5 text-[10px] font-mono transition-all"
              style={{
                background: executive ? "#6B4EEA" : "transparent",
                color: executive ? "#0A0A0D" : "#8A8A93",
                fontWeight: executive ? 600 : 400,
              }}
            >
              Executive
            </button>
          </div>
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
          {engineOnline !== null && (
            <span
              className="flex items-center gap-1.5 text-[10px] font-mono"
              style={{ color: engineOnline ? "#2DD4A4" : "#FF5A5A" }}
              title={engineOnline ? "Engine is reachable" : `Engine offline — run: cd apps/engine && pnpm dev`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: engineOnline ? "#2DD4A4" : "#FF5A5A", boxShadow: engineOnline ? "0 0 6px rgba(45,212,164,0.6)" : undefined }}
              />
              {engineOnline ? "LIVE" : "OFFLINE"}
            </span>
          )}
          {showResetConfirm ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono" style={{ color: "#F7B955" }}>Reset demo?</span>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="font-mono text-[10px] px-2 py-0.5 rounded transition-all hover:brightness-110 disabled:opacity-50"
                style={{ background: "#FF5A5A", color: "#0A0A0D" }}
              >
                {resetting ? "…" : "Yes"}
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="font-mono text-[10px] px-2 py-0.5 rounded transition-all hover:brightness-110"
                style={{ background: "#1C1C24", color: "#8A8A93", border: "1px solid #262630" }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="font-mono text-[10px] px-1.5 py-0.5 rounded transition-all hover:brightness-150"
              style={{ color: "#8A8A93", background: "#14141A", border: "1px solid #262630" }}
              title="Clear all runs and reset policies to defaults"
            >
              ↺ Reset
            </button>
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
            &quot;{taskDescription ?? "Process agent tasks"}&quot;
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
                executive={executive}
              />
            )}
            {tab === "Runtime" && (
              <LiveView
                onRunStarted={handleRunStarted}
                onNavigate={handleAutoDemoNavigate}
                pendingRun={pendingRun}
                onPendingRunConsumed={() => setPendingRun(false)}
                pendingScenario={pendingScenario}
                onPendingScenarioConsumed={() => setPendingScenario(null)}
                executive={executive}
                externalRunId={externalRunId}
                onExternalRunConsumed={() => setExternalRunId(null)}
              />
            )}
            {tab === "Replay" && (
              <Replay
                runId={runId}
                visible={activeTab === "Replay"}
                autoAnalyze={autoAnalyze}
                onAutoAnalyzeConsumed={() => setAutoAnalyze(false)}
                onNavigate={(t) => setActiveTab(t as Tab)}
              />
            )}
            {tab === "Pre-flight" && <Preflight onLaunchedCustomRun={handleLaunchedCustomRun} />}
            {tab === "Red Team" && <RedTeam />}
            {tab === "Ask" && <AskOpus />}
          </div>
        ))}
      </div>
    </div>
  );
}
