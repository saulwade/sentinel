"use client";

import { useState, useEffect, useCallback } from "react";
import { exportSecurityReport } from "./securityReportPdf";

import { ENGINE } from "../lib/engine";

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

interface AttackSurface {
  tools: Record<string, { attacks: number; total: number }>;
  totalRuns: number;
}

interface PolicyTrend {
  improving: boolean;
  runsWithData: number;
}

interface McpTool {
  name: string;
  category: string;
  description: string;
}

interface McpStatus {
  status: "active" | "standby";
  version: string;
  transport: string;
  tools: McpTool[];
  stats: { totalRuns: number; lastRunAt: number | null };
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
  if (config === "orchestrator-agent") return "Billing Orchestrator · Multi-Agent";
  if (config.startsWith("custom:")) return `${config.slice(7)} · Custom`;
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

function RunSparkline({ runs }: { runs: RunSummary[] }) {
  if (runs.length === 0) return null;
  const pts = runs.slice().reverse().slice(0, 20);
  const W = 120, H = 28, gap = 4;
  const barW = Math.max(3, Math.floor((W - gap * (pts.length - 1)) / pts.length));
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-mono uppercase tracking-widest shrink-0" style={{ color: "#8A8A93" }}>
        Last {pts.length} runs
      </span>
      <svg width={W} height={H} className="shrink-0">
        {pts.map((r, i) => {
          const interdicted = (r.blast?.actionsInterdicted ?? 0) > 0;
          const color = interdicted ? "#2DD4A4" : "#FF5A5A";
          const h = interdicted ? H : H / 2;
          return (
            <rect
              key={r.runId}
              x={i * (barW + gap)}
              y={H - h}
              width={barW}
              height={h}
              rx={1}
              fill={color}
              opacity={0.75}
            />
          );
        })}
      </svg>
      <span className="text-[9px] font-mono" style={{ color: "#2DD4A4" }}>
        {pts.filter((r) => (r.blast?.actionsInterdicted ?? 0) > 0).length} blocked
      </span>
    </div>
  );
}

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
  executive?: boolean;
}

export default function CommandCenter({ onNavigate, onRequestRun, executive = false }: CommandCenterProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [attackSurface, setAttackSurface] = useState<AttackSurface | null>(null);
  const [policyTrend, setPolicyTrend] = useState<PolicyTrend | null>(null);
  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setExportErr(null);
    try {
      await exportSecurityReport();
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : "export failed");
    } finally {
      setExporting(false);
    }
  }

  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, surfaceRes, trendRes, mcpRes] = await Promise.all([
        fetch(`${ENGINE}/stats`),
        fetch(`${ENGINE}/stats/attack-surface`),
        fetch(`${ENGINE}/stats/policy-trend`),
        fetch(`${ENGINE}/stats/mcp-status`),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (surfaceRes.ok) setAttackSurface(await surfaceRes.json());
      if (trendRes.ok) setPolicyTrend(await trendRes.json());
      if (mcpRes.ok) setMcpStatus(await mcpRes.json());
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
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 space-y-6">

        {/* ── Hero — Trust Score ──────────────────────────────────────── */}
        <div
          className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8 p-4 sm:p-6 rounded-xl"
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
                  label: executive ? "Threat catch rate" : "Interdiction effectiveness",
                  value: trust ? Math.round(trust.breakdown.interdictionEffectiveness * 100) : 0,
                  color: "#2DD4A4",
                },
                {
                  label: executive ? "Protection coverage" : "Policy coverage",
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
              ⟳  Test Before Deploy
            </button>
            <button
              onClick={() => onNavigate("Red Team")}
              className="px-4 py-2 rounded text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110"
              style={{ background: "#1C1C24", color: "#FF5A5A", border: "1px solid #FF5A5A30" }}
            >
              ⚔  Stress Test & Policies
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || !stats}
              title={exportErr ?? "Download a shareable PDF snapshot of this dashboard"}
              className="px-4 py-2 rounded text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-50"
              style={{ background: "#1C1C24", color: "#F5F5F7", border: "1px solid #262630" }}
            >
              {exporting ? "Generating…" : exportErr ? "Retry Export" : "⤓  Export Report"}
            </button>
          </div>
        </div>

        {/* ── Stat cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label={executive ? "Fraud Prevented" : "Potential Loss Prevented"}
            value={stats ? `$${stats.aggregate.totalMoneyInterdicted.toLocaleString()}` : "—"}
            sub={stats?.aggregate.totalMoneyInterdicted === 0 ? "Run a scenario to see results" : executive ? "unauthorized transfers stopped" : "unauthorized transfers blocked"}
            accent="#FF5A5A"
            hero
          />
          <StatCard
            label={executive ? "Threats Stopped" : "Interdictions"}
            value={String(stats?.aggregate.totalInterdictions ?? "—")}
            sub={stats && !executive ? `${stats.aggregate.interdictionRate}% of all tool calls` : executive && stats ? "across all agent sessions" : undefined}
            accent="#F7B955"
          />
          <StatCard
            label={executive ? "Safeguards In Place" : "Active policies"}
            value={String(stats?.policies.active ?? "—")}
            sub={stats && !executive ? `${stats.policies.bySource.autoSynthesized} auto-synthesized` : executive && stats ? "protecting production" : undefined}
            accent="#818CF8"
          />
          <div className="flex flex-col gap-1 p-4 rounded-lg" style={{ background: "#0D0D12", border: "1px solid #262630" }}>
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
              {executive ? "Agent Sessions" : "Total runs"}
            </span>
            <span className="text-2xl font-mono font-bold" style={{ color: "#F5F5F7" }}>
              {stats?.runs.total ?? "—"}
            </span>
            {stats?.runs.recent[0] && (
              <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
                {timeAgo(stats.runs.recent[0].createdAt)}
              </span>
            )}
            {stats && <RunSparkline runs={stats.runs.recent} />}
          </div>
        </div>

        {/* ── Empty state — no runs yet ───────────────────────────────── */}
        {stats && stats.runs.total === 0 && (
          <div
            className="flex flex-col items-center justify-center gap-4 py-12 rounded-xl text-center"
            style={{ background: "#0D0D12", border: "1px dashed #262630" }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-mono font-semibold" style={{ color: "#F5F5F7" }}>
                No runs yet — see Sentinel in action
              </p>
              <p className="text-xs font-mono max-w-sm mx-auto leading-relaxed" style={{ color: "#8A8A93" }}>
                Run a CEO Override attack and watch Sentinel intercept every malicious tool call in real time.
              </p>
            </div>
            <button
              onClick={runAgent}
              className="px-5 py-2.5 rounded-xl text-sm font-mono font-bold transition-all active:scale-95 hover:brightness-110"
              style={{ background: "#A78BFA", color: "#0A0A0D" }}
            >
              ▶  Start Demo — CEO Override attack
            </button>
          </div>
        )}

        {/* ── Recent runs ─────────────────────────────────────────────── */}
        {stats && stats.runs.recent.length > 0 && (
          <div>
            <div
              className="text-[10px] font-mono uppercase tracking-widest mb-2"
              style={{ color: "#8A8A93" }}
            >
              {executive ? "Recent Incidents" : "Recent Runs"}
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

        {/* ── Attack Surface Heatmap ──────────────────────────────────── */}
        {!executive && attackSurface && attackSurface.totalRuns > 0 && (() => {
          const tools = Object.entries(attackSurface.tools);
          if (tools.length === 0) return null;
          const maxAttacks = Math.max(...tools.map(([, v]) => v.attacks), 1);

          function heatColor(attacks: number): { bg: string; border: string; text: string } {
            if (attacks === 0) return { bg: "rgba(45,212,164,0.06)", border: "rgba(45,212,164,0.2)", text: "#2DD4A4" };
            const ratio = attacks / maxAttacks;
            if (ratio >= 0.7) return { bg: "rgba(255,90,90,0.12)", border: "rgba(255,90,90,0.4)", text: "#FF5A5A" };
            if (ratio >= 0.3) return { bg: "rgba(247,185,85,0.1)", border: "rgba(247,185,85,0.35)", text: "#F7B955" };
            return { bg: "rgba(253,211,77,0.08)", border: "rgba(253,211,77,0.25)", text: "#FCD34D" };
          }

          const sorted = tools.sort(([, a], [, b]) => b.attacks - a.attacks);

          return (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
                  Attack Surface
                </span>
                <span className="text-[9px] font-mono" style={{ color: "#8A8A93" }}>
                  — which tools are targeted most
                </span>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                {sorted.map(([tool, data]) => {
                  const colors = heatColor(data.attacks);
                  return (
                    <div
                      key={tool}
                      className="flex flex-col gap-1 px-3 py-2 rounded-lg"
                      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
                    >
                      <span className="text-[10px] font-mono font-medium truncate" style={{ color: colors.text }}>
                        {tool.replace(/_/g, "_​")}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: data.total > 0 ? `${Math.round((data.attacks / data.total) * 100)}%` : "0%",
                              background: colors.text,
                            }}
                          />
                        </div>
                        <span className="text-[9px] font-mono tabular-nums shrink-0" style={{ color: colors.text }}>
                          {data.attacks}/{data.total}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono" style={{ color: "#8A8A93" }}>
                        {data.attacks === 0
                          ? "no attacks"
                          : data.attacks === 1
                          ? "1 attack intercepted"
                          : `${data.attacks} attacks intercepted`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── Policy Effectiveness Trend ───────────────────────────────── */}
        {!executive && policyTrend && policyTrend.runsWithData >= 2 && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-lg"
            style={{
              background: policyTrend.improving ? "rgba(45,212,164,0.05)" : "rgba(247,185,85,0.05)",
              border: `1px solid ${policyTrend.improving ? "rgba(45,212,164,0.2)" : "rgba(247,185,85,0.2)"}`,
            }}
          >
            <span className="text-base" style={{ color: policyTrend.improving ? "#2DD4A4" : "#F7B955" }}>
              {policyTrend.improving ? "↓" : "→"}
            </span>
            <div>
              <span className="text-xs font-mono font-semibold" style={{ color: policyTrend.improving ? "#2DD4A4" : "#F7B955" }}>
                {policyTrend.improving ? "Detection getting faster" : "Detection stable"}
              </span>
              <span className="text-[10px] font-mono ml-2" style={{ color: "#8A8A93" }}>
                across {policyTrend.runsWithData} runs
                {policyTrend.improving ? " — policies are catching threats earlier in the tool-call sequence" : ""}
              </span>
            </div>
          </div>
        )}

        {/* ── MCP Integration ─────────────────────────────────────────── */}
        {!executive && mcpStatus && (
          <div
            className="p-4 rounded-xl space-y-3"
            style={{ background: "#0D0D12", border: "1px solid #262630" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: mcpStatus.status === "active" ? "#2DD4A4" : "#8A8A93",
                    boxShadow: mcpStatus.status === "active" ? "0 0 6px #2DD4A4" : "none",
                  }}
                />
                <span className="text-xs font-mono font-semibold" style={{ color: "#F5F5F7" }}>
                  MCP Integration
                </span>
                <span
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-widest"
                  style={{ background: "rgba(45,212,164,0.1)", color: "#2DD4A4", border: "1px solid rgba(45,212,164,0.2)" }}
                >
                  {mcpStatus.status}
                </span>
              </div>
              <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
                v{mcpStatus.version} · {mcpStatus.transport}
              </span>
            </div>

            <p className="text-[11px] font-mono" style={{ color: "#8A8A93" }}>
              Connect Claude Code, Claude Desktop, or any MCP client — monitor agents, query policies, and pull blast radius reports programmatically.
            </p>

            {/* Tool chips */}
            <div className="flex flex-wrap gap-1.5">
              {mcpStatus.tools.map((tool) => {
                const categoryColor: Record<string, { bg: string; text: string }> = {
                  execution:     { bg: "rgba(167,139,250,0.1)", text: "#A78BFA" },
                  observability: { bg: "rgba(125,211,252,0.1)", text: "#7DD3FC" },
                  analysis:      { bg: "rgba(255,90,90,0.1)",   text: "#FF5A5A" },
                  policy:        { bg: "rgba(99,102,241,0.1)",  text: "#818CF8" },
                  metrics:       { bg: "rgba(45,212,164,0.1)",  text: "#2DD4A4" },
                  "time-travel": { bg: "rgba(247,185,85,0.1)",  text: "#F7B955" },
                  introspection: { bg: "rgba(139,139,147,0.1)", text: "#8A8A93" },
                };
                const c = categoryColor[tool.category] ?? { bg: "rgba(139,139,147,0.1)", text: "#8A8A93" };
                return (
                  <div
                    key={tool.name}
                    className="group relative"
                    title={tool.description}
                  >
                    <span
                      className="text-[9px] font-mono px-2 py-1 rounded cursor-default"
                      style={{ background: c.bg, color: c.text }}
                    >
                      {tool.name}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Connect instructions */}
            <div
              className="px-3 py-2 rounded text-[10px] font-mono"
              style={{ background: "#14141A", border: "1px solid #262630", color: "#8A8A93" }}
            >
              <span style={{ color: "#4ADE80" }}>$</span>{" "}
              <span style={{ color: "#F5F5F7" }}>npx</span>{" "}
              <span style={{ color: "#7DD3FC" }}>tsx</span>{" "}
              <span>apps/engine/src/mcp/index.ts</span>
              <span className="ml-3 text-[9px]" style={{ color: "#8A8A93" }}>
                — Claude Code: add to .mcp.json as stdio transport
              </span>
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
