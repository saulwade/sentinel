"use client";

import { useState, useEffect, useCallback } from "react";

const ENGINE = "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Attack {
  id: string;
  iteration: number;
  technique: string;
  ticketSubject: string;
  ticketBody: string;
  intendedTool: string;
  intendedArgs: Record<string, unknown>;
  description: string;
  mutationReason?: string;
  basedOnAttackId?: string;
}

interface TestResult {
  attackId: string;
  outcome: "blocked" | "paused-safe" | "bypassed";
  interdictedBy: "policy" | "pre-cog" | null;
  policyId?: string;
  verdict: string;
  reasoning: string;
  latencyMs: number;
}

interface AttackRecord {
  attack: Attack;
  result: TestResult | null;
}

interface LoopSummary {
  totalIterations: number;
  totalAttacks: number;
  blocked: number;
  pausedSafe: number;
  bypassed: number;
  bypassRate: number;
  interdictionsByPolicy: number;
  interdictionsByPrecog: number;
  adaptationEffective: boolean;
  durationMs: number;
  bypassedAttackIds: string[];
}

interface Policy {
  id: string;
  name: string;
  description: string;
  severity: string;
  action: string;
  reasoning?: string;
  source: "default" | "auto-synthesized" | "user";
  enabled: boolean;
  createdAt: number;
  sourceAttackId?: string;
  when: unknown[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function outcomeColor(o: string) {
  if (o === "blocked") return "#2DD4A4";
  if (o === "paused-safe") return "#F7B955";
  if (o === "bypassed") return "#FF5A5A";
  return "#8A8A93";
}

function sourceLabel(s: string) {
  if (s === "auto-synthesized") return "AUTO";
  if (s === "default") return "DEFAULT";
  return "USER";
}

function sourceBadgeStyle(s: string): React.CSSProperties {
  if (s === "auto-synthesized") return { background: "rgba(99,102,241,0.15)", color: "#818CF8", border: "1px solid rgba(99,102,241,0.3)" };
  if (s === "default") return { background: "rgba(45,212,164,0.1)", color: "#2DD4A4", border: "1px solid rgba(45,212,164,0.2)" };
  return { background: "rgba(167,139,250,0.1)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.2)" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RedTeam() {
  const [records, setRecords] = useState<AttackRecord[]>([]);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [loopStatus, setLoopStatus] = useState<"idle" | "running" | "done">("idle");
  const [loopSummary, setLoopSummary] = useState<LoopSummary | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selected, setSelected] = useState<AttackRecord | null>(null);
  const [synthesizing, setSynthesizing] = useState<string | null>(null);
  const [synthesizedPolicies, setSynthesizedPolicies] = useState<Map<string, Policy>>(new Map());
  const [adoptedIds, setAdoptedIds] = useState<Set<string>>(new Set());
  const [simLoading, setSimLoading] = useState<string | null>(null);
  const [simResults, setSimResults] = useState<Map<string, { totalRuns: number; wouldBlock: number; wouldPause: number; falsePositives: number }>>(new Map());

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await fetch(`${ENGINE}/policies`);
      if (res.ok) {
        const data = await res.json();
        setPolicies(data.policies ?? []);
        setAdoptedIds(new Set((data.policies ?? []).map((p: Policy) => p.id)));
      }
    } catch {}
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  async function startLoop() {
    setRecords([]);
    setSelected(null);
    setLoopSummary(null);
    setCurrentIteration(1);
    setLoopStatus("running");
    setSynthesizedPolicies(new Map());

    try {
      const res = await fetch(`${ENGINE}/redteam/adaptive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iterations: 3, attacksPerIteration: 5 }),
      });
      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              dispatch(currentEvent, data);
            } catch {}
          }
        }
      }
    } catch (err) {
      console.error("Red team error:", err);
    }
    setLoopStatus("done");
    await fetchPolicies();
  }

  function dispatch(event: string, data: Record<string, unknown>) {
    switch (event) {
      case "iteration_start":
        setCurrentIteration(Number(data.iteration));
        break;
      case "attack_generated":
        setRecords((prev) => [...prev, { attack: data.attack as Attack, result: null }]);
        break;
      case "attack_test_end":
        setRecords((prev) =>
          prev.map((r) =>
            r.attack.id === (data.result as TestResult).attackId
              ? { ...r, result: data.result as TestResult }
              : r
          )
        );
        break;
      case "loop_end":
        setLoopSummary(data.summary as LoopSummary);
        break;
    }
  }

  async function synthesize(record: AttackRecord) {
    if (!record.result || synthesizing) return;
    setSynthesizing(record.attack.id);
    try {
      const res = await fetch(`${ENGINE}/redteam/synthesize-policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attack: record.attack, testResult: record.result }),
      });
      if (res.ok) {
        const data = await res.json();
        setSynthesizedPolicies((prev) => new Map(prev).set(record.attack.id, data.policy));
      }
    } catch {}
    setSynthesizing(null);
  }

  async function simulate(policy: Policy) {
    if (simLoading) return;
    setSimLoading(policy.id);
    try {
      const res = await fetch(`${ENGINE}/policies/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy }),
      });
      if (res.ok) {
        const data = await res.json();
        setSimResults((prev) => new Map(prev).set(policy.id, data));
      }
    } catch {}
    setSimLoading(null);
  }

  async function adopt(policy: Policy) {
    try {
      const res = await fetch(`${ENGINE}/policies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      if (res.ok) {
        setAdoptedIds((prev) => new Set(prev).add(policy.id));
        await fetchPolicies();
      }
    } catch {}
  }

  async function revokePolicy(id: string) {
    try {
      const res = await fetch(`${ENGINE}/policies/${id}`, { method: "DELETE" });
      if (res.ok) await fetchPolicies();
    } catch {}
  }

  const totalIterations = 3;
  const iters = [1, 2, 3];

  return (
    <div className="flex flex-col h-full" style={{ background: "#0A0A0D" }}>
      {/* ── Controls ───────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-4 px-5 py-2.5 border-b shrink-0"
        style={{ borderColor: "#262630" }}
      >
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
          Red Team & Policies
        </span>

        {/* Iteration indicator */}
        {loopStatus !== "idle" && (
          <div className="flex items-center gap-1.5">
            {iters.map((i) => (
              <div
                key={i}
                className="flex items-center gap-1"
              >
                <span
                  className="text-[9px] font-mono"
                  style={{ color: currentIteration >= i ? "#F5F5F7" : "#8A8A93" }}
                >
                  {i}
                </span>
                <span
                  className="w-6 h-1 rounded-full"
                  style={{
                    background: loopStatus === "done" || currentIteration > i
                      ? "#2DD4A4"
                      : currentIteration === i
                      ? "#F7B955"
                      : "#262630",
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {loopStatus === "running" && (
          <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "#F7B955" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#F7B955] animate-pulse" />
            iter {currentIteration}/{totalIterations}
          </span>
        )}

        {loopSummary && (
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span style={{ color: "#2DD4A4" }}>{loopSummary.blocked} blocked</span>
            <span style={{ color: "#F7B955" }}>{loopSummary.pausedSafe} paused</span>
            <span style={{ color: "#FF5A5A" }}>{loopSummary.bypassed} bypassed</span>
            {loopSummary.adaptationEffective && (
              <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: "rgba(255,90,90,0.1)", color: "#FF5A5A", border: "1px solid rgba(255,90,90,0.2)" }}>
                attacker adapted
              </span>
            )}
          </div>
        )}

        <button
          onClick={startLoop}
          disabled={loopStatus === "running"}
          className="ml-auto px-4 py-1.5 rounded text-xs font-mono font-medium disabled:opacity-40 transition-all duration-150 active:scale-95 hover:brightness-110"
          style={{ background: "#FF5A5A", color: "#0A0A0D" }}
        >
          {loopStatus === "idle" ? "⚔  Run Adaptive Loop" : loopStatus === "done" ? "⚔  Re-run" : "Attacking..."}
        </button>
      </div>

      {/* ── Main body ─────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Attack list */}
        <div className="flex-1 flex flex-col border-r min-h-0" style={{ borderColor: "#262630" }}>
          <div
            className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest shrink-0 flex items-center gap-2"
            style={{ color: "#8A8A93", borderBottom: "1px solid #262630" }}
          >
            Attacks
            {records.length > 0 && (
              <span className="ml-auto tabular-nums">{records.length} generated</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loopStatus === "idle" && (
              <div className="flex flex-col items-center justify-center h-full gap-2 px-6">
                <p className="font-mono text-sm text-center" style={{ color: "#8A8A93" }}>
                  Opus generates 5 attacks per iteration. In each iteration, it sees what was blocked and mutates to evade.
                </p>
                <p className="font-mono text-xs text-center" style={{ color: "#8A8A93" }}>
                  Bypasses go to Policy Synthesis → auto-generated DSL rules.
                </p>
              </div>
            )}

            {records.map((r) => {
              const isBypassed = r.result?.outcome === "bypassed";
              const isSelected = selected?.attack.id === r.attack.id;
              return (
                <button
                  key={r.attack.id}
                  onClick={() => setSelected(r)}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 border-b transition-all duration-150 hover:bg-[#14141A] animate-slide-up"
                  style={{
                    borderColor: "#1C1C24",
                    background: isSelected ? "#1C1C24" : undefined,
                    borderLeft: isSelected ? "2px solid #A78BFA" : "2px solid transparent",
                  }}
                >
                  {/* Iter badge */}
                  <span
                    className="text-[9px] font-mono font-bold px-1 py-0.5 rounded shrink-0"
                    style={{ background: "#1C1C24", color: "#8A8A93", border: "1px solid #262630" }}
                  >
                    I{r.attack.iteration}
                  </span>

                  {/* Status dot */}
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background: r.result ? outcomeColor(r.result.outcome) : "#262630",
                      animation: !r.result ? "pulse 1.5s ease-in-out infinite" : undefined,
                    }}
                  />

                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-mono text-xs truncate" style={{ color: "#F5F5F7" }}>
                      {r.attack.ticketSubject}
                    </span>
                    <span className="font-mono text-[10px] truncate" style={{ color: "#8A8A93" }}>
                      {r.attack.intendedTool} · {r.attack.technique}
                    </span>
                  </div>

                  {r.result && (
                    <span
                      className="shrink-0 text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded"
                      style={{
                        color: outcomeColor(r.result.outcome),
                        background: `${outcomeColor(r.result.outcome)}18`,
                        border: `1px solid ${outcomeColor(r.result.outcome)}30`,
                      }}
                    >
                      {r.result.outcome}
                    </span>
                  )}

                  {isBypassed && synthesizedPolicies.has(r.attack.id) && (
                    <span className="text-[9px] font-mono px-1 py-0.5 rounded" style={{ color: "#818CF8", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
                      policy ready
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Inspector + Policy catalog */}
        <div className="w-[440px] shrink-0 flex flex-col min-h-0">
          {/* Inspector */}
          <div className="flex-1 overflow-y-auto border-b" style={{ borderColor: "#262630" }}>
            <div
              className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest shrink-0"
              style={{ color: "#8A8A93", borderBottom: "1px solid #262630" }}
            >
              {selected ? `Attack ${selected.attack.id}` : "Inspector"}
            </div>
            {!selected ? (
              <div className="flex items-center justify-center h-32">
                <p className="font-mono text-xs" style={{ color: "#8A8A93" }}>Select an attack</p>
              </div>
            ) : (
              <div className="px-4 py-3 space-y-3">
                {/* Header */}
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: "#1C1C24", color: "#8A8A93", border: "1px solid #262630" }}>
                    ITER {selected.attack.iteration}
                  </span>
                  <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
                    {selected.attack.technique}
                  </span>
                  {selected.result && (
                    <span className="font-mono text-[10px] font-bold uppercase" style={{ color: outcomeColor(selected.result.outcome) }}>
                      {selected.result.outcome}
                    </span>
                  )}
                </div>

                {/* Mutation reason */}
                {selected.attack.mutationReason && (
                  <div className="p-2 rounded text-[11px] font-mono" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", color: "#818CF8" }}>
                    ↳ {selected.attack.mutationReason}
                  </div>
                )}

                {/* Target */}
                <div>
                  <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "#8A8A93" }}>Target</div>
                  <code className="text-xs font-mono" style={{ color: "#F7B955" }}>
                    {selected.attack.intendedTool}({JSON.stringify(selected.attack.intendedArgs).slice(0, 80)})
                  </code>
                </div>

                {/* Ticket body */}
                <div>
                  <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "#8A8A93" }}>Ticket body</div>
                  <pre className="text-[10px] font-mono p-2 rounded whitespace-pre-wrap max-h-32 overflow-y-auto" style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630" }}>
                    {selected.attack.ticketBody}
                  </pre>
                </div>

                {/* Defender verdict */}
                {selected.result && (
                  <div>
                    <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "#8A8A93" }}>Defender reasoning</div>
                    <p className="text-[11px] font-mono leading-relaxed" style={{ color: "#F5F5F7" }}>
                      {selected.result.reasoning}
                    </p>
                    {selected.result.interdictedBy && (
                      <p className="text-[10px] font-mono mt-1" style={{ color: "#8A8A93" }}>
                        Caught by: {selected.result.interdictedBy === "policy" ? `policy · ${selected.result.policyId ?? ""}` : "Pre-cog (Opus)"}
                        {" "} · {selected.result.latencyMs}ms
                      </p>
                    )}
                  </div>
                )}

                {/* Policy synthesis for bypassed attacks */}
                {selected.result?.outcome === "bypassed" && (() => {
                  const synth = synthesizedPolicies.get(selected.attack.id);
                  const isAdopted = synth && adoptedIds.has(synth.id);
                  const isSynth = synthesizing === selected.attack.id;
                  return (
                    <div className="space-y-2">
                      {!synth && (
                        <button
                          onClick={() => synthesize(selected)}
                          disabled={!!synthesizing}
                          className="w-full py-2 rounded text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-50"
                          style={{ background: "rgba(99,102,241,0.15)", color: "#818CF8", border: "1px solid rgba(99,102,241,0.4)" }}
                        >
                          {isSynth ? "⟳ Synthesizing with Opus..." : "✦ Synthesize Policy"}
                        </button>
                      )}
                      {synth && (
                        <div className="p-3 rounded space-y-2" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.3)" }}>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#818CF8" }}>
                              Auto-Synthesized Policy
                            </span>
                            {!isAdopted ? (
                              <button
                                onClick={() => adopt(synth)}
                                className="text-[10px] font-mono font-bold px-2 py-1 rounded transition-all active:scale-95 hover:brightness-110"
                                style={{ background: "#818CF8", color: "#0A0A0D" }}
                              >
                                Adopt →
                              </button>
                            ) : (
                              <span className="text-[10px] font-mono" style={{ color: "#2DD4A4" }}>✓ Adopted</span>
                            )}
                          </div>
                          <p className="text-[11px] font-mono font-bold" style={{ color: "#F5F5F7" }}>{synth.name}</p>
                          <p className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>{synth.description}</p>
                          <p className="text-[10px] font-mono italic" style={{ color: "#818CF8" }}>{synth.reasoning}</p>
                          {/* Policy Simulator */}
                          {!isAdopted && (() => {
                            const sim = simResults.get(synth.id);
                            const isSimming = simLoading === synth.id;
                            if (sim) {
                              const fp = sim.falsePositives;
                              const hits = sim.wouldBlock + sim.wouldPause;
                              return (
                                <div
                                  className="flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-mono"
                                  style={{
                                    background: fp === 0 ? "rgba(45,212,164,0.06)" : "rgba(247,185,85,0.06)",
                                    border: `1px solid ${fp === 0 ? "rgba(45,212,164,0.2)" : "rgba(247,185,85,0.2)"}`,
                                  }}
                                >
                                  <span style={{ color: fp === 0 ? "#2DD4A4" : "#F7B955" }}>
                                    {sim.totalRuns === 0
                                      ? "No runs to test against"
                                      : fp === 0
                                      ? `✓ Would catch ${hits} attack${hits !== 1 ? "s" : ""} · 0 false positives`
                                      : `⚠ Catches ${hits} · ${fp} false positive${fp !== 1 ? "s" : ""} on clean runs`}
                                  </span>
                                </div>
                              );
                            }
                            return (
                              <button
                                onClick={() => simulate(synth)}
                                disabled={isSimming}
                                className="w-full py-1.5 rounded text-[10px] font-mono transition-all active:scale-95 hover:brightness-110 disabled:opacity-50"
                                style={{ background: "#14141A", color: "#8A8A93", border: "1px solid #262630" }}
                              >
                                {isSimming ? "Testing…" : "Test against history →"}
                              </button>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Policy catalog */}
          <div className="h-[220px] overflow-y-auto shrink-0">
            <div
              className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest sticky top-0 flex items-center gap-2"
              style={{ color: "#8A8A93", borderBottom: "1px solid #262630", background: "#0A0A0D" }}
            >
              Active Policies
              <span className="ml-auto tabular-nums">{policies.length}</span>
            </div>
            {policies.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 border-b"
                style={{ borderColor: "#1C1C24" }}
              >
                <span
                  className="text-[9px] font-mono font-bold px-1 py-0.5 rounded shrink-0"
                  style={sourceBadgeStyle(p.source)}
                >
                  {sourceLabel(p.source)}
                </span>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[11px] font-mono truncate" style={{ color: "#F5F5F7" }}>{p.name}</span>
                  {p.sourceAttackId && (
                    <span className="text-[9px] font-mono" style={{ color: "#8A8A93" }}>
                      ← {p.sourceAttackId}
                    </span>
                  )}
                </div>
                <span
                  className="text-[9px] font-mono uppercase px-1 py-0.5 rounded shrink-0"
                  style={{ color: p.action === "block" ? "#FF5A5A" : "#F7B955", background: "rgba(0,0,0,0.3)" }}
                >
                  {p.action}
                </span>
                {p.source !== "default" && (
                  <button
                    onClick={() => revokePolicy(p.id)}
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded transition-all hover:brightness-150"
                    style={{ color: "#8A8A93", background: "#1C1C24" }}
                    title="Revoke"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
