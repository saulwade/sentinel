"use client";

import { useState, useEffect, useCallback } from "react";

const ENGINE = "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrustScore {
  score: number;
  grade: string;
  breakdown: { interdictionEffectiveness: number; policyCoverage: number; label: string };
}

interface BlastSummary {
  severity: string;
  actionsInterdicted: number;
  moneyInterdicted: number;
  piiExfiltrationAttempted: boolean;
  reversible: boolean;
  summary: string;
}

interface RunSummary {
  runId: string;
  createdAt: number;
  agentConfig: string;
  status: string;
  blast: BlastSummary | null;
}

interface Stats {
  trust: TrustScore;
  policies: { active: number; bySource: { default: number; autoSynthesized: number; user: number } };
  runs: { total: number; recent: RunSummary[] };
  aggregate: { totalToolCalls: number; totalInterdictions: number; totalMoneyInterdicted: number; interdictionRate: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityColor(s: string) {
  if (s === "critical") return "#FF5A5A";
  if (s === "high") return "#F7B955";
  if (s === "medium") return "#FCD34D";
  return "#2DD4A4";
}

function gradeColor(g: string) {
  if (g === "A+" || g === "A") return "#2DD4A4";
  if (g === "B") return "#7DD3FC";
  if (g === "C") return "#F7B955";
  return "#FF5A5A";
}

function agentLabel(config: string) {
  if (config === "support-agent") return "Support Agent · Tier 1";
  if (config === "corp-assistant") return "Corp Assistant · Security";
  return config;
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent, hero,
}: { label: string; value: string; sub?: string; accent?: string; hero?: boolean }) {
  return (
    <div
      className="flex flex-col gap-1 p-4 rounded-lg"
      style={{
        background: hero ? "rgba(255,90,90,0.04)" : "#0D0D12",
        border: `1px solid ${hero ? "rgba(255,90,90,0.25)" : "#262630"}`,
      }}
    >
      <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: hero ? "#FF5A5A" : "#8A8A93", opacity: hero ? 0.7 : 1 }}>
        {label}
      </span>
      <span className={`${hero ? "text-3xl" : "text-2xl"} font-mono font-bold`} style={{ color: accent ?? "#F5F5F7" }}>
        {value}
      </span>
      {sub && (
        <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function RunRow({ run, onClick }: { run: RunSummary; onClick: () => void }) {
  const severity = run.blast?.severity ?? "none";
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-left transition-all duration-150 hover:bg-[#1C1C24]"
      style={{ background: "#0D0D12", border: "1px solid #1C1C24" }}
    >
      <span
        className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
        style={{
          background: `${severityColor(severity)}18`,
          color: severityColor(severity),
          border: `1px solid ${severityColor(severity)}30`,
        }}
      >
        {severity.toUpperCase()}
      </span>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-xs font-mono" style={{ color: "#F5F5F7" }}>
          {agentLabel(run.agentConfig)}
        </span>
        {run.blast && (
          <span className="text-[10px] font-mono truncate" style={{ color: "#8A8A93" }}>
            {run.blast.actionsInterdicted} interdicted
            {run.blast.moneyInterdicted > 0 && ` · $${run.blast.moneyInterdicted.toLocaleString()} blocked`}
            {run.blast.piiExfiltrationAttempted && " · PII exfil stopped"}
          </span>
        )}
      </div>
      <span className="text-[10px] font-mono shrink-0" style={{ color: "#8A8A93" }}>
        {timeAgo(run.createdAt)}
      </span>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CommandCenterProps {
  onNavigate: (tab: string) => void;
  onRequestRun?: () => void;
}

export default function CommandCenter({ onNavigate, onRequestRun }: CommandCenterProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${ENGINE}/stats`);
      if (res.ok) setStats(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  function runAgent() {
    onRequestRun?.();
    onNavigate("Runtime");
  }

  const trust = stats?.trust;
  const score = trust?.score ?? 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#0A0A0D" }}>
      <div className="max-w-5xl mx-auto w-full px-6 py-6 space-y-6">

        {/* ── Hero — Trust Score ──────────────────────────────────────── */}
        <div
          className="flex items-center gap-8 p-6 rounded-xl"
          style={{ background: "#0D0D12", border: "1px solid #262630" }}
        >
          {/* Score ring */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="relative w-24 h-24">
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#1C1C24" strokeWidth="8" />
                <circle
                  cx="40" cy="40" r="34" fill="none"
                  stroke={trust ? gradeColor(trust.grade) : "#262630"}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 34}`}
                  strokeDashoffset={`${2 * Math.PI * 34 * (1 - score / 100)}`}
                  style={{ transition: "stroke-dashoffset 1s ease-out" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="text-2xl font-mono font-bold leading-none"
                  style={{ color: trust ? gradeColor(trust.grade) : "#8A8A93" }}
                >
                  {loading ? "—" : score}
                </span>
                <span className="text-[9px] font-mono" style={{ color: "#8A8A93" }}>/ 100</span>
              </div>
            </div>
            <span
              className="text-lg font-mono font-bold"
              style={{ color: trust ? gradeColor(trust.grade) : "#8A8A93" }}
            >
              {trust?.grade ?? "—"}
            </span>
          </div>

          {/* Score breakdown */}
          <div className="flex-1">
            <h2 className="text-base font-mono font-semibold mb-1" style={{ color: "#F5F5F7" }}>
              Production Readiness
            </h2>
            <p className="text-xs font-mono mb-4" style={{ color: "#8A8A93" }}>
              {trust?.breakdown.label ?? "Loading..."}
            </p>
            <div className="space-y-2">
              {[
                {
                  label: "Interdiction effectiveness",
                  value: trust ? Math.round(trust.breakdown.interdictionEffectiveness * 100) : 0,
                  color: "#2DD4A4",
                },
                {
                  label: "Policy coverage",
                  value: trust ? Math.round(trust.breakdown.policyCoverage * 100) : 0,
                  color: "#818CF8",
                },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-[10px] font-mono w-44 shrink-0" style={{ color: "#8A8A93" }}>
                    {label}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#1C1C24" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${value}%`,
                        background: color,
                        transition: "width 1s ease-out",
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-mono w-8 text-right" style={{ color }}>
                    {value}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={runAgent}
              disabled={false}
              className="px-4 py-2 rounded text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-50"
              style={{ background: "#A78BFA", color: "#0A0A0D" }}
            >
              ▶  Run Agent
            </button>
            <button
              onClick={() => onNavigate("Pre-flight")}
              className="px-4 py-2 rounded text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110"
              style={{ background: "#1C1C24", color: "#7DD3FC", border: "1px solid #7DD3FC30" }}
            >
              ⟳  Pre-flight
            </button>
            <button
              onClick={() => onNavigate("Red Team")}
              className="px-4 py-2 rounded text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110"
              style={{ background: "#1C1C24", color: "#FF5A5A", border: "1px solid #FF5A5A30" }}
            >
              ⚔  Red Team
            </button>
          </div>
        </div>

        {/* ── Stat cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="Potential Loss Prevented"
            value={stats ? `$${stats.aggregate.totalMoneyInterdicted.toLocaleString()}` : "—"}
            sub={stats?.aggregate.totalMoneyInterdicted === 0 ? "Run a scenario to see results" : "unauthorized transfers blocked"}
            accent="#FF5A5A"
            hero
          />
          <StatCard
            label="Interdictions"
            value={String(stats?.aggregate.totalInterdictions ?? "—")}
            sub={stats ? `${stats.aggregate.interdictionRate}% of all tool calls` : undefined}
            accent="#F7B955"
          />
          <StatCard
            label="Active policies"
            value={String(stats?.policies.active ?? "—")}
            sub={stats ? `${stats.policies.bySource.autoSynthesized} auto-synthesized` : undefined}
            accent="#818CF8"
          />
          <StatCard
            label="Total runs"
            value={String(stats?.runs.total ?? "—")}
            sub={stats?.runs.recent[0] ? timeAgo(stats.runs.recent[0].createdAt) : undefined}
          />
        </div>

        {/* ── Recent runs ─────────────────────────────────────────────── */}
        {stats && stats.runs.recent.length > 0 && (
          <div>
            <div
              className="text-[10px] font-mono uppercase tracking-widest mb-2"
              style={{ color: "#8A8A93" }}
            >
              Recent Runs
            </div>
            <div className="space-y-1.5">
              {stats.runs.recent.map((run) => (
                <RunRow
                  key={run.runId}
                  run={run}
                  onClick={() => onNavigate("Runtime")}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────── */}
        {!loading && stats && stats.runs.total === 0 && (
          <div
            className="flex flex-col items-center justify-center py-12 rounded-xl"
            style={{ background: "#0D0D12", border: "1px dashed #262630" }}
          >
            <p className="font-mono text-sm mb-2" style={{ color: "#8A8A93" }}>
              No runs yet
            </p>
            <p className="font-mono text-xs mb-5" style={{ color: "#8A8A93" }}>
              Click Run Agent to see Sentinel in action
            </p>
            <button
              onClick={runAgent}
              className="px-5 py-2 rounded text-sm font-mono font-medium transition-all active:scale-95 hover:brightness-110"
              style={{ background: "#A78BFA", color: "#0A0A0D" }}
            >
              Run Agent
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse" />
              <span className="font-mono text-xs" style={{ color: "#8A8A93" }}>Loading...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
