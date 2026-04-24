"use client";

import { useEffect, useMemo, useState } from "react";

import { ENGINE } from "../lib/engine";
import { PixelLoader } from "./PixelLoader";

// ─── Types (mirror @sentinel/shared/whatif) ───────────────────────────────────

interface Mutation {
  id: string;
  strategy: string;
  rationale: string;
  tool: string;
  args: Record<string, unknown>;
}

interface Result {
  mutationId: string;
  verdict: "blocked" | "passed";
  matchedPolicyId?: string;
  matchedPolicyName?: string;
}

type PolicyCondition = Record<string, unknown>;

interface Fix {
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  when: PolicyCondition[];
  reasoning: string;
}

interface Summary {
  total: number;
  blocked: number;
  passed: number;
  dominantEvasion: string;
  headline: string;
  fixes: Fix[];
  thinkingTokens?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WhatIfSimulator({
  decisionEventId,
  onClose,
}: {
  decisionEventId: string;
  onClose: () => void;
}) {
  const [mutations, setMutations] = useState<Mutation[]>([]);
  const [results, setResults] = useState<Map<string, Result>>(new Map());
  const [generatorThinking, setGeneratorThinking] = useState("");
  const [summaryThinking, setSummaryThinking] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [phase, setPhase] = useState<"generating" | "evaluating" | "summarizing" | "done">("generating");
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [appliedFixIdx, setAppliedFixIdx] = useState<Set<number>>(new Set());
  const [showGenThinking, setShowGenThinking] = useState(false);
  const [showSumThinking, setShowSumThinking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${ENGINE}/whatif/${decisionEventId}`, { method: "POST" });
        if (!res.body) throw new Error("no response body");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const lines = frame.split("\n");
            let eventName = "message";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event:")) eventName = line.slice(6).trim();
              else if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (!data) continue;
            try {
              handleEvent(eventName, JSON.parse(data));
            } catch (e) {
              console.warn("[whatif] SSE parse error:", e, data);
            }
          }
        }
      } catch (e) {
        if (!cancelled) setFatalError(e instanceof Error ? e.message : String(e));
      }
    })();

    function handleEvent(name: string, payload: Record<string, unknown>) {
      switch (name) {
        case "whatif_start":
          setPhase("generating");
          break;
        case "generator_thinking":
          setGeneratorThinking((t) => t + String(payload.delta ?? ""));
          break;
        case "mutation_generated": {
          const m = payload.mutation as Mutation;
          setMutations((prev) => [...prev, m]);
          setPhase("evaluating");
          break;
        }
        case "mutation_result": {
          const r = payload.result as Result;
          setResults((prev) => new Map(prev).set(r.mutationId, r));
          break;
        }
        case "summary_thinking":
          setPhase("summarizing");
          setSummaryThinking((t) => t + String(payload.delta ?? ""));
          break;
        case "summary":
          setSummary(payload.summary as Summary);
          break;
        case "whatif_end":
          setPhase("done");
          break;
        case "error":
          setFatalError(String(payload.message ?? payload.error ?? "unknown"));
          break;
      }
    }

    return () => { cancelled = true; };
  }, [decisionEventId]);

  const blocked = useMemo(() => [...results.values()].filter((r) => r.verdict === "blocked").length, [results]);
  const passed = useMemo(() => [...results.values()].filter((r) => r.verdict === "passed").length, [results]);

  async function applyFix(idx: number) {
    if (!summary) return;
    const fix = summary.fixes[idx];
    if (!fix) return;
    try {
      const res = await fetch(`${ENGINE}/whatif/apply-fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...fix,
          sourceDecisionEventId: decisionEventId,
        }),
      });
      if (res.ok) {
        setAppliedFixIdx((prev) => new Set(prev).add(idx));
      }
    } catch { /* swallow */ }
  }

  function exportMarkdown() {
    if (!summary) return;
    const lines: string[] = [];
    lines.push(`# What-If Simulation — ${decisionEventId}`);
    lines.push("");
    lines.push(`**Headline:** ${summary.headline}`);
    lines.push("");
    lines.push(`**Dominant evasion:** ${summary.dominantEvasion}`);
    lines.push("");
    lines.push(`**Results:** ${summary.blocked}/${summary.total} blocked · ${summary.passed}/${summary.total} passed`);
    lines.push("");
    lines.push("## Mutations");
    for (const m of mutations) {
      if (!m || !m.id) continue;
      const r = results.get(m.id);
      const verdict = r ? (r.verdict === "blocked" ? `🛡️ BLOCKED (${r.matchedPolicyName ?? r.matchedPolicyId ?? "?"})` : "⚠️ PASSED") : "?";
      lines.push(`- **${m.id}** [${m.strategy ?? "—"}] → ${verdict}`);
      if (m.rationale) lines.push(`    - ${m.rationale}`);
      lines.push(`    - \`${m.tool ?? "?"}(${JSON.stringify(m.args ?? {}).slice(0, 120)})\``);
    }
    if (summary.fixes.length > 0) {
      lines.push("");
      lines.push("## Proposed Fixes");
      for (const f of summary.fixes) {
        lines.push(`### ${f.title} (${f.severity})`);
        lines.push(f.description);
        lines.push("");
        lines.push("```json");
        lines.push(JSON.stringify(f.when, null, 2));
        lines.push("```");
        lines.push(`**Why:** ${f.reasoning}`);
        lines.push("");
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whatif-${decisionEventId.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const phaseLabel = {
    generating: "Generating mutations…",
    evaluating: `Evaluating against policies · ${results.size}/${mutations.length || 20}`,
    summarizing: "Opus synthesizing fixes…",
    done: "Complete",
  }[phase];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={() => {
        if (phase === "done" || fatalError) onClose();
      }}
    >
      <div
        className="w-full max-w-[min(1400px,calc(100vw-24px))] max-h-[92vh] rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "#0E0E13", border: "1px solid #262630" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-3 px-4 sm:px-6 py-3 sm:py-4" style={{ borderBottom: "1px solid #262630" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="text-2xl shrink-0">🧪</span>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-mono font-semibold" style={{ color: "#F5F5F7" }}>What-If Simulator</h2>
                <p className="text-[11px] font-mono leading-snug" style={{ color: "#8A8A93" }}>
                  Opus generates 20 mutations · runs them against your current policies · proposes fixes
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <span
              className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded"
              style={{
                background: phase === "done" ? "rgba(45,212,164,0.12)" : "rgba(167,139,250,0.12)",
                color: phase === "done" ? "#2DD4A4" : "#A78BFA",
              }}
            >
              {phaseLabel}
            </span>
            <button
              onClick={exportMarkdown}
              disabled={!summary}
              className="text-xs font-mono px-3 py-1.5 rounded disabled:opacity-40"
              style={{ background: "rgba(167,139,250,0.08)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.3)" }}
            >
              Export .md
            </button>
            <button
              onClick={onClose}
              className="text-xs font-mono px-3 py-1.5 rounded"
              style={{ background: "rgba(255,90,90,0.08)", color: "#FF5A5A", border: "1px solid rgba(255,90,90,0.3)" }}
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] overflow-hidden">
          {/* ─── Left: mutation grid ──────────────────────────────────────── */}
          <div className="p-4 sm:p-6 overflow-auto lg:border-r border-b lg:border-b-0" style={{ borderColor: "#262630" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
                Adversarial Mutations
              </div>
              <div className="flex gap-3 text-[11px] font-mono">
                <span style={{ color: "#2DD4A4" }}>🛡 {blocked} blocked</span>
                <span style={{ color: "#FF5A5A" }}>⚠ {passed} passed</span>
              </div>
            </div>

            {mutations.length === 0 && !fatalError && (
              <PixelLoader
                variant="knight"
                label="Summoning mutations"
                sublabel="Opus is crafting 20 adversarial variants"
              />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Array.from({ length: 20 }).map((_, i) => {
                const m = mutations[i];
                const r = m ? results.get(m.id) : undefined;
                const color = !r ? "#8A8A93" : r.verdict === "blocked" ? "#2DD4A4" : "#FF5A5A";
                const bg = !r
                  ? "rgba(138,138,147,0.04)"
                  : r.verdict === "blocked"
                  ? "rgba(45,212,164,0.08)"
                  : "rgba(255,90,90,0.10)";
                const border = !r
                  ? "1px solid rgba(138,138,147,0.15)"
                  : r.verdict === "blocked"
                  ? "1px solid rgba(45,212,164,0.35)"
                  : "1px solid rgba(255,90,90,0.40)";
                return (
                  <div
                    key={i}
                    className="rounded-lg p-3 transition-all"
                    style={{ background: bg, border }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono font-semibold" style={{ color }}>
                        {m ? m.id : `m${i + 1}`}
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color }}>
                        {!r ? (m ? "eval…" : "…") : r.verdict}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono font-semibold mb-1" style={{ color: "#F5F5F7" }}>
                      {m?.strategy ?? "—"}
                    </div>
                    <div className="text-[10px] font-mono leading-snug" style={{ color: "#8A8A93" }}>
                      {m?.rationale ?? "waiting for generator…"}
                    </div>
                    {m && (
                      <div className="text-[9px] font-mono mt-1.5 truncate" style={{ color: "#666670" }}>
                        {m.tool}({JSON.stringify(m.args).slice(0, 60)})
                      </div>
                    )}
                    {r?.verdict === "blocked" && r.matchedPolicyName && (
                      <div className="text-[9px] font-mono mt-1" style={{ color: "#2DD4A4" }}>
                        ✓ {r.matchedPolicyName}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── Right: thinking + summary + fixes ───────────────────────── */}
          <div className="p-6 overflow-auto flex flex-col gap-4">
            {fatalError && (
              <div className="rounded-lg p-3" style={{ background: "rgba(255,90,90,0.08)", border: "1px solid rgba(255,90,90,0.3)" }}>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: "#FF5A5A" }}>Error</div>
                <div className="text-[11px] font-mono" style={{ color: "#FF5A5A" }}>{fatalError}</div>
              </div>
            )}

            {/* Right-panel loader — covers gap from first mutation until summary lands */}
            {!summary && !fatalError && mutations.length > 0 && (
              <PixelLoader
                variant="scroll"
                label={
                  summaryThinking
                    ? "Drafting policy fixes"
                    : results.size < 20
                    ? "Running mutations through policies"
                    : "Synthesizing the verdict"
                }
                sublabel={
                  summaryThinking
                    ? `Opus is writing recommendations · ~${Math.ceil(summaryThinking.length / 4)} tokens`
                    : results.size < 20
                    ? `${results.size}/20 evaluated`
                    : "Opus is reviewing the full result set"
                }
              />
            )}

            {/* Summary headline */}
            {summary && (
              <div
                className="rounded-lg p-4"
                style={{
                  background: "linear-gradient(135deg, rgba(167,139,250,0.10), rgba(125,211,252,0.06))",
                  border: "1px solid rgba(167,139,250,0.35)",
                }}
              >
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: "#A78BFA" }}>
                  Opus Verdict
                </div>
                <div className="text-sm font-mono font-semibold leading-relaxed" style={{ color: "#F5F5F7" }}>
                  {summary.headline}
                </div>
                <div className="text-[11px] font-mono mt-2" style={{ color: "#8A8A93" }}>
                  Dominant evasion: {summary.dominantEvasion}
                </div>
                <div className="flex gap-4 mt-3 text-[11px] font-mono">
                  <span style={{ color: "#2DD4A4" }}>🛡 {summary.blocked}/{summary.total} blocked</span>
                  <span style={{ color: "#FF5A5A" }}>⚠ {summary.passed}/{summary.total} slipped through</span>
                </div>
              </div>
            )}

            {/* Proposed fixes */}
            {summary && summary.fixes.length > 0 && (
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: "#8A8A93" }}>
                  Proposed Policy Fixes
                </div>
                <div className="flex flex-col gap-2">
                  {summary.fixes.map((fix, idx) => {
                    const applied = appliedFixIdx.has(idx);
                    return (
                      <div
                        key={idx}
                        className="rounded-lg p-3"
                        style={{
                          background: applied ? "rgba(45,212,164,0.06)" : "rgba(167,139,250,0.04)",
                          border: applied ? "1px solid rgba(45,212,164,0.35)" : "1px solid rgba(167,139,250,0.25)",
                        }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="text-xs font-mono font-semibold" style={{ color: "#F5F5F7" }}>
                            {fix.title}
                          </div>
                          <span
                            className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0"
                            style={{ background: "rgba(247,185,85,0.12)", color: "#F7B955" }}
                          >
                            {fix.severity}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono leading-relaxed mb-2" style={{ color: "#8A8A93" }}>
                          {fix.description}
                        </div>
                        <pre
                          className="text-[10px] font-mono rounded p-2 overflow-auto mb-2"
                          style={{ background: "#14141A", color: "#7DD3FC", border: "1px solid #262630" }}
                        >
                          {JSON.stringify(fix.when, null, 2)}
                        </pre>
                        <div className="text-[10px] font-mono italic mb-2" style={{ color: "#8A8A93" }}>
                          {fix.reasoning}
                        </div>
                        <button
                          onClick={() => applyFix(idx)}
                          disabled={applied}
                          className="text-[11px] font-mono px-3 py-1.5 rounded disabled:opacity-60"
                          style={{
                            background: applied ? "rgba(45,212,164,0.12)" : "rgba(167,139,250,0.10)",
                            color: applied ? "#2DD4A4" : "#A78BFA",
                            border: applied ? "1px solid rgba(45,212,164,0.4)" : "1px solid rgba(167,139,250,0.35)",
                          }}
                        >
                          {applied ? "✓ Adopted" : "+ Adopt policy"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Generator thinking (collapsible) */}
            {generatorThinking && (
              <div>
                <button
                  onClick={() => setShowGenThinking((v) => !v)}
                  className="text-[10px] font-mono uppercase tracking-widest"
                  style={{ color: "#8A8A93" }}
                >
                  {showGenThinking ? "▾" : "▸"} Generator thinking ({Math.ceil(generatorThinking.length / 4)} tok)
                </button>
                {showGenThinking && (
                  <pre
                    className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap mt-2 p-3 rounded max-h-[240px] overflow-auto"
                    style={{ background: "#14141A", color: "#A78BFA", border: "1px solid #262630" }}
                  >
                    {generatorThinking}
                  </pre>
                )}
              </div>
            )}

            {/* Summary thinking (collapsible) */}
            {summaryThinking && (
              <div>
                <button
                  onClick={() => setShowSumThinking((v) => !v)}
                  className="text-[10px] font-mono uppercase tracking-widest"
                  style={{ color: "#8A8A93" }}
                >
                  {showSumThinking ? "▾" : "▸"} Summarizer thinking ({Math.ceil(summaryThinking.length / 4)} tok)
                </button>
                {showSumThinking && (
                  <pre
                    className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap mt-2 p-3 rounded max-h-[240px] overflow-auto"
                    style={{ background: "#14141A", color: "#7DD3FC", border: "1px solid #262630" }}
                  >
                    {summaryThinking}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
