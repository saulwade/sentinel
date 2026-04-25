"use client";

import { useState, useEffect, useCallback } from "react";
import Arena from "./Arena";
import { PixelLoader } from "./PixelLoader";
import { usePersistentState } from "../lib/usePersistentState";

import { ENGINE } from "../lib/engine";

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

// ─── Drift Detector types (mirror @sentinel/shared/drift) ─────────────────────

interface DriftRedundant {
  kind: "redundant";
  policyId: string;
  coveredBy: string;
  reasoning: string;
}
interface DriftBlindSpot {
  kind: "blind-spot";
  pattern: string;
  evidenceRuns: string[];
  suggestedPolicy: Policy;
  reasoning: string;
}
interface DriftDeadCode {
  kind: "dead-code";
  policyId: string;
  matchesInRuns: number;
  totalRunsConsidered: number;
  reasoning: string;
}
type DriftFinding = DriftRedundant | DriftBlindSpot | DriftDeadCode;

interface DriftAuditResponse {
  findings: DriftFinding[];
  policiesReviewed: number;
  runsReviewed: number;
  eventsReviewed: number;
  thinkingTokens?: number;
  contextTokens?: number;
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
  const [records, setRecords] = usePersistentState<AttackRecord[]>("redteam.records", []);
  const [currentIteration, setCurrentIteration] = usePersistentState<number>("redteam.currentIteration", 0);
  const [loopStatus, setLoopStatus] = useState<"idle" | "running" | "done">("idle");
  const [loopPhase, setLoopPhase] = useState<"generating" | "testing" | null>(null);
  const [loopSummary, setLoopSummary] = usePersistentState<LoopSummary | null>("redteam.loopSummary", null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selected, setSelected] = useState<AttackRecord | null>(null);
  const [synthesizing, setSynthesizing] = useState<string | null>(null);
  const [synthObj, setSynthObj] = usePersistentState<Record<string, Policy>>("redteam.synthesized", {});
  const synthesizedPolicies = new Map(Object.entries(synthObj));
  function setSynthesizedPolicies(next: Map<string, Policy> | ((prev: Map<string, Policy>) => Map<string, Policy>)) {
    setSynthObj((prev) => {
      const prevMap = new Map(Object.entries(prev));
      const nextMap = typeof next === "function" ? next(prevMap) : next;
      return Object.fromEntries(nextMap);
    });
  }
  const [adoptedIds, setAdoptedIds] = useState<Set<string>>(new Set());
  const [simLoading, setSimLoading] = useState<string | null>(null);
  const [simResults, setSimResults] = useState<Map<string, { totalRuns: number; wouldBlock: number; wouldPause: number; falsePositives: number }>>(new Map());
  const [authorText, setAuthorText] = usePersistentState<string>("redteam.authorText", "");
  const [authoring, setAuthoring] = useState(false);
  const [authorError, setAuthorError] = useState<string | null>(null);
  const [authoredPolicy, setAuthoredPolicy] = useState<Policy | null>(null);

  // Drift Detector state
  const [driftOpen, setDriftOpen] = useState(false);
  const [driftRunning, setDriftRunning] = useState(false);
  const [driftThinking, setDriftThinking] = useState("");
  const [driftResult, setDriftResult] = usePersistentState<DriftAuditResponse | null>("redteam.driftResult", null);
  const [driftError, setDriftError] = useState<string | null>(null);
  const [driftAdopted, setDriftAdopted] = useState<Set<string>>(new Set());
  const [mode, setMode] = usePersistentState<"standard" | "arena">("redteam.mode", "standard");

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
    setLoopPhase("generating");
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
    setLoopPhase(null);
    await fetchPolicies();
  }

  function dispatch(event: string, data: Record<string, unknown>) {
    switch (event) {
      case "iteration_start":
        setCurrentIteration(Number(data.iteration));
        setLoopPhase("generating");
        break;
      case "attacks_generating":
        setLoopPhase("generating");
        break;
      case "attack_generated":
        setLoopPhase("testing");
        setRecords((prev) => [...prev, { attack: data.attack as Attack, result: null }]);
        break;
      case "attack_test_start":
        setLoopPhase("testing");
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

  async function authorPolicy() {
    const description = authorText.trim();
    if (description.length < 8 || authoring) return;
    setAuthoring(true);
    setAuthorError(null);
    setAuthoredPolicy(null);
    try {
      const res = await fetch(`${ENGINE}/policies/synthesize-from-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthorError(data.error ?? "Synthesis failed");
      } else {
        setAuthoredPolicy(data.policy as Policy);
      }
    } catch (err) {
      setAuthorError(err instanceof Error ? err.message : "Network error");
    }
    setAuthoring(false);
  }

  function dismissAuthored() {
    setAuthoredPolicy(null);
    setAuthorError(null);
    setAuthorText("");
    setSimResults((prev) => {
      const next = new Map(prev);
      if (authoredPolicy) next.delete(authoredPolicy.id);
      return next;
    });
  }

  async function revokePolicy(id: string) {
    try {
      const res = await fetch(`${ENGINE}/policies/${id}`, { method: "DELETE" });
      if (res.ok) await fetchPolicies();
    } catch {}
  }

  async function runAudit() {
    setDriftOpen(true);
    setDriftRunning(true);
    setDriftThinking("");
    setDriftResult(null);
    setDriftError(null);
    setDriftAdopted(new Set());

    try {
      const res = await fetch(`${ENGINE}/policies/audit`, { method: "POST" });
      if (!res.body) throw new Error("no response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
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

          if (eventName === "thinking_delta") {
            setDriftThinking((prev) => prev + data);
          } else if (eventName === "result") {
            try {
              setDriftResult(JSON.parse(data));
            } catch {
              setDriftError("failed to parse findings");
            }
          } else if (eventName === "error") {
            try { setDriftError(JSON.parse(data).error ?? data); } catch { setDriftError(data); }
          }
        }
      }
    } catch (e) {
      setDriftError(e instanceof Error ? e.message : String(e));
    } finally {
      setDriftRunning(false);
    }
  }

  async function adoptSuggestedPolicy(p: Policy) {
    try {
      const res = await fetch(`${ENGINE}/policies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(p),
      });
      if (res.ok) {
        setDriftAdopted((prev) => new Set(prev).add(p.id));
        await fetchPolicies();
      }
    } catch {}
  }

  async function revokeFromDrift(id: string) {
    try {
      const res = await fetch(`${ENGINE}/policies/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDriftAdopted((prev) => new Set(prev).add(`revoked:${id}`));
        await fetchPolicies();
      }
    } catch {}
  }

  async function exportPolicies() {
    try {
      const res = await fetch(`${ENGINE}/policies/export`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sentinel-policies-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }

  async function importPolicies(file: File) {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      await fetch(`${ENGINE}/policies/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(json),
      });
      fetchPolicies();
    } catch {}
  }

  const totalIterations = 3;
  const iters = [1, 2, 3];

  if (mode === "arena") {
    return (
      <div className="flex flex-col h-full" style={{ background: "#0A0A0D" }}>
        <div className="flex items-center gap-3 px-3 sm:px-5 py-2 border-b shrink-0" style={{ borderColor: "#262630" }}>
          <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid #262630" }}>
            <button
              onClick={() => setMode("standard")}
              className="px-3 py-1 text-[10px] font-mono transition-all whitespace-nowrap"
              style={{ background: "transparent", color: "#8A8A93" }}
            >
              Standard
            </button>
            <button
              onClick={() => setMode("arena")}
              className="px-3 py-1 text-[10px] font-mono font-semibold whitespace-nowrap"
              style={{ background: "#A78BFA", color: "#0A0A0D" }}
            >
              ⚔ Arena
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <Arena />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "#0A0A0D" }}>
      {/* ── Controls ───────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 sm:px-5 py-2.5 border-b shrink-0"
        style={{ borderColor: "#262630" }}
      >
        <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid #262630" }}>
          <button
            onClick={() => setMode("standard")}
            className="px-3 py-1 text-[10px] font-mono font-semibold whitespace-nowrap"
            style={{ background: "#A78BFA", color: "#0A0A0D" }}
          >
            Standard
          </button>
          <button
            onClick={() => setMode("arena")}
            className="px-3 py-1 text-[10px] font-mono transition-all whitespace-nowrap"
            style={{ background: "transparent", color: "#8A8A93" }}
            title="Adversarial Evolution Arena — two Opus instances co-evolve in real time"
          >
            ⚔ Arena
          </button>
        </div>
        <span className="hidden md:inline text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
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
            <span className="text-[10px]" style={{ color: "#8A8A93" }}>
              · {loopPhase === "generating" ? "Opus generating attacks…" : "testing…"}
            </span>
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
          {loopStatus === "idle" ? "⚔  Run Adaptive Loop"
            : loopStatus === "done" ? "⚔  Re-run"
            : loopPhase === "generating" ? "Generating…"
            : "Testing…"}
        </button>
        {loopStatus !== "running" && records.length > 0 && (
          <button
            onClick={() => {
              setRecords([]);
              setLoopSummary(null);
              setSynthObj({});
              setCurrentIteration(0);
              setSelected(null);
              setAuthoredPolicy(null);
              setAuthorText("");
            }}
            className="px-3 py-1 rounded text-[10px] font-mono transition-all active:scale-95 hover:brightness-110"
            style={{ background: "#1C1C24", color: "#8A8A93", border: "1px solid #262630" }}
            title="Clear Red Team state"
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* ── Main body ─────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Attack list */}
        <div className="flex-1 min-w-0 flex flex-col lg:border-r border-b lg:border-b-0 min-h-0" style={{ borderColor: "#262630" }}>
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
            {loopStatus === "idle" && records.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 px-6">
                <p className="font-mono text-sm text-center" style={{ color: "#8A8A93" }}>
                  Opus generates 5 attacks per iteration. In each iteration, it sees what was blocked and mutates to evade.
                </p>
                <p className="font-mono text-xs text-center" style={{ color: "#8A8A93" }}>
                  Bypasses go to Policy Synthesis → auto-generated DSL rules.
                </p>
              </div>
            )}

            {loopStatus === "running" && records.length === 0 && (
              <PixelLoader
                variant="knight"
                label="Forging the first wave"
                sublabel={loopPhase === "generating" ? "Opus is drafting 5 novel attacks" : "Testing attacks against policies"}
              />
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
        <div className="w-full lg:w-[440px] lg:shrink-0 flex flex-col min-h-0">
          {/* Policy authoring — moved to top so it's visible without scroll */}
          <div className="shrink-0 border-b" style={{ borderColor: "#262630" }}>
            <div
              className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest flex items-center gap-2"
              style={{ color: "#8A8A93", borderBottom: "1px solid #262630", background: "#0A0A0D" }}
            >
              ✎ Author Policy
              <span className="text-[9px] normal-case tracking-normal" style={{ color: "#8A8A93" }}>
                natural language → DSL via Opus
              </span>
            </div>
            <div className="p-3 space-y-2">
              {!authoredPolicy && (
                <>
                  <textarea
                    value={authorText}
                    onChange={(e) => setAuthorText(e.target.value)}
                    placeholder="e.g. Block any refund over $5,000 unless it references a verified SLA breach"
                    rows={2}
                    disabled={authoring}
                    className="w-full px-2.5 py-1.5 rounded text-[11px] font-mono resize-none disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-[#A78BFA]"
                    style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630" }}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={authorPolicy}
                      disabled={authoring || authorText.trim().length < 8}
                      className="py-1.5 px-3 rounded text-[10px] font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-40"
                      style={{ background: "rgba(167,139,250,0.15)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.4)" }}
                    >
                      {authoring ? "⟳ Synthesizing with Opus…" : "✦ Synthesize →"}
                    </button>
                    {authorError && (
                      <span className="text-[10px] font-mono" style={{ color: "#FF5A5A" }}>{authorError}</span>
                    )}
                  </div>
                </>
              )}
              {authoredPolicy && (() => {
                const isAdopted = adoptedIds.has(authoredPolicy.id);
                const sim = simResults.get(authoredPolicy.id);
                const isSimming = simLoading === authoredPolicy.id;
                return (
                  <div className="p-2.5 rounded space-y-2" style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.3)" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#A78BFA" }}>
                        Authored Policy
                      </span>
                      <div className="flex items-center gap-1.5">
                        {!isAdopted ? (
                          <button
                            onClick={() => adopt(authoredPolicy)}
                            className="text-[10px] font-mono font-bold px-2 py-0.5 rounded transition-all active:scale-95 hover:brightness-110"
                            style={{ background: "#A78BFA", color: "#0A0A0D" }}
                          >
                            Adopt →
                          </button>
                        ) : (
                          <span className="text-[10px] font-mono" style={{ color: "#2DD4A4" }}>✓ Adopted</span>
                        )}
                        <button
                          onClick={dismissAuthored}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded transition-all hover:brightness-150"
                          style={{ color: "#8A8A93", background: "#1C1C24" }}
                          title="Dismiss"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] font-mono font-bold" style={{ color: "#F5F5F7" }}>{authoredPolicy.name}</p>
                    <p className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>{authoredPolicy.description}</p>
                    {authoredPolicy.reasoning && (
                      <p className="text-[10px] font-mono italic" style={{ color: "#A78BFA" }}>{authoredPolicy.reasoning}</p>
                    )}
                    {!isAdopted && (
                      sim ? (
                        <div
                          className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono"
                          style={{
                            background: sim.falsePositives === 0 ? "rgba(45,212,164,0.06)" : "rgba(247,185,85,0.06)",
                            border: `1px solid ${sim.falsePositives === 0 ? "rgba(45,212,164,0.2)" : "rgba(247,185,85,0.2)"}`,
                          }}
                        >
                          <span style={{ color: sim.falsePositives === 0 ? "#2DD4A4" : "#F7B955" }}>
                            {sim.totalRuns === 0
                              ? "No runs to test against"
                              : sim.falsePositives === 0
                              ? `✓ Would catch ${sim.wouldBlock + sim.wouldPause} · 0 false positives`
                              : `⚠ ${sim.wouldBlock + sim.wouldPause} matches · ${sim.falsePositives} false positives`}
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => simulate(authoredPolicy)}
                          disabled={isSimming}
                          className="w-full py-1 rounded text-[10px] font-mono transition-all active:scale-95 hover:brightness-110 disabled:opacity-50"
                          style={{ background: "#14141A", color: "#8A8A93", border: "1px solid #262630" }}
                        >
                          {isSimming ? "Testing…" : "Test against history →"}
                        </button>
                      )
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

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
              <span className="tabular-nums">{policies.length}</span>
              <button
                onClick={runAudit}
                disabled={driftRunning}
                title="Opus audits the active policy set — finds redundancy, blind spots, and dead code"
                className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-mono transition-all hover:brightness-150 disabled:opacity-50"
                style={{ color: "#A78BFA", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)" }}
              >
                ✦ Audit
              </button>
              <button
                onClick={exportPolicies}
                title="Download all policies as JSON"
                className="px-1.5 py-0.5 rounded text-[9px] font-mono transition-all hover:brightness-150"
                style={{ color: "#8A8A93", background: "#1C1C24", border: "1px solid #262630" }}
              >
                ↓ Export
              </button>
              <label
                title="Import policies from JSON file"
                className="px-1.5 py-0.5 rounded text-[9px] font-mono transition-all hover:brightness-150 cursor-pointer"
                style={{ color: "#8A8A93", background: "#1C1C24", border: "1px solid #262630" }}
              >
                ↑ Import
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) importPolicies(f); e.target.value = ""; }}
                />
              </label>
            </div>
            {policies.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-center px-4">
                <p className="text-xs font-mono font-semibold" style={{ color: "#F5F5F7" }}>No policies yet</p>
                <p className="text-[10px] font-mono leading-relaxed" style={{ color: "#8A8A93" }}>
                  Run a scenario → Investigate the attack → let Opus synthesize your first policy from the bypass
                </p>
              </div>
            )}
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

      {/* ── Drift Audit Panel ──────────────────────────────────────────── */}
      {driftOpen && (
        <DriftPanel
          running={driftRunning}
          thinking={driftThinking}
          result={driftResult}
          error={driftError}
          adopted={driftAdopted}
          onClose={() => setDriftOpen(false)}
          onAdopt={adoptSuggestedPolicy}
          onRevoke={revokeFromDrift}
          onRerun={runAudit}
        />
      )}
    </div>
  );
}

// ─── Drift Audit Panel ────────────────────────────────────────────────────────

function DriftPanel({
  running, thinking, result, error, adopted, onClose, onAdopt, onRevoke, onRerun,
}: {
  running: boolean;
  thinking: string;
  result: DriftAuditResponse | null;
  error: string | null;
  adopted: Set<string>;
  onClose: () => void;
  onAdopt: (p: Policy) => void;
  onRevoke: (id: string) => void;
  onRerun: () => void;
}) {
  const [showThinking, setShowThinking] = useState(false);
  const findingColor = (k: string) =>
    k === "blind-spot" ? "#FF5A5A" : k === "redundant" ? "#F7B955" : "#8A8A93";
  const findingLabel = (k: string) =>
    k === "blind-spot" ? "Blind Spot" : k === "redundant" ? "Redundant" : "Dead Code";

  return (
    <div
      className="fixed inset-y-0 right-0 w-[min(520px,100vw)] z-40 flex flex-col shadow-2xl animate-slide-in-right"
      style={{ background: "#0D0D12", borderLeft: "1px solid #262630" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0" style={{ borderColor: "#262630" }}>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(167,139,250,0.1)", color: "#A78BFA" }}>
          OPUS AUDIT
        </span>
        <span className="text-sm font-mono font-semibold" style={{ color: "#F5F5F7" }}>
          Policy Drift
        </span>
        {result && (
          <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
            {result.policiesReviewed} policies · {result.runsReviewed} runs · {result.eventsReviewed} events
          </span>
        )}
        <button
          onClick={onClose}
          className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded transition-all hover:brightness-150"
          style={{ color: "#8A8A93", background: "#1C1C24", border: "1px solid #262630" }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {running && !thinking && !result && !error && (
          <PixelLoader
            variant="scroll"
            label="Auditing your defenses"
            sublabel="Opus is reviewing every policy against run history"
          />
        )}
        {/* Thinking */}
        {(running || thinking) && (
          <div className="rounded-lg" style={{ background: "rgba(167,139,250,0.04)", border: "1px solid rgba(167,139,250,0.2)" }}>
            <button onClick={() => setShowThinking((v) => !v)} className="w-full flex items-center gap-2 px-3 py-2">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: running ? "#A78BFA" : "#8A8A93", animation: running ? "pulse 1.5s ease-in-out infinite" : undefined }} />
              <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#A78BFA" }}>
                {running ? "Opus auditing" : "Thinking"}
              </span>
              <span className="text-[10px] font-mono tabular-nums" style={{ color: "#8A8A93" }}>
                ~{Math.ceil(thinking.length / 4)} tokens
              </span>
              <span className="ml-auto text-[10px] font-mono" style={{ color: "#8A8A93" }}>
                {showThinking ? "hide" : "show"}
              </span>
            </button>
            {showThinking && thinking && (
              <pre className="px-3 pb-3 text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-words" style={{ color: "#A78BFA", maxHeight: "200px", overflowY: "auto" }}>
                {thinking}
              </pre>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg px-4 py-3" style={{ background: "rgba(255,90,90,0.05)", border: "1px solid rgba(255,90,90,0.25)" }}>
            <p className="text-xs font-mono" style={{ color: "#FF5A5A" }}>{error}</p>
          </div>
        )}

        {result && result.findings.length === 0 && !running && (
          <div className="rounded-lg px-4 py-6 text-center" style={{ background: "rgba(45,212,164,0.04)", border: "1px solid rgba(45,212,164,0.2)" }}>
            <div className="text-sm font-mono" style={{ color: "#2DD4A4" }}>
              ✓ Policy set looks healthy
            </div>
            <div className="text-[11px] font-mono mt-1" style={{ color: "#8A8A93" }}>
              Opus found no redundancy, blind spots, or dead code across {result.runsReviewed} runs
            </div>
          </div>
        )}

        {result?.findings.map((f, i) => {
          const color = findingColor(f.kind);
          return (
            <div
              key={i}
              className="rounded-lg p-3 space-y-2"
              style={{ background: `${color}0D`, border: `1px solid ${color}33` }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                  style={{ background: `${color}26`, color }}>
                  {findingLabel(f.kind)}
                </span>
                {f.kind === "blind-spot" && (
                  <span className="text-[10px] font-mono truncate" style={{ color: "#F5F5F7" }}>
                    {f.pattern}
                  </span>
                )}
                {f.kind === "redundant" && (
                  <span className="text-[10px] font-mono truncate" style={{ color: "#F5F5F7" }}>
                    <code>{f.policyId}</code> ⊆ <code>{f.coveredBy}</code>
                  </span>
                )}
                {f.kind === "dead-code" && (
                  <span className="text-[10px] font-mono truncate" style={{ color: "#F5F5F7" }}>
                    <code>{f.policyId}</code> · 0 matches in {f.totalRunsConsidered} runs
                  </span>
                )}
              </div>

              <p className="text-[11px] font-mono leading-relaxed" style={{ color: "#8A8A93" }}>
                {f.reasoning}
              </p>

              {f.kind === "blind-spot" && (
                <>
                  <div className="rounded p-2" style={{ background: "#14141A", border: "1px solid #262630" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
                        Suggested policy
                      </span>
                      <span className="text-[9px] font-mono px-1 py-0.5 rounded"
                        style={{ background: f.suggestedPolicy.action === "block" ? "rgba(255,90,90,0.15)" : "rgba(247,185,85,0.15)", color: f.suggestedPolicy.action === "block" ? "#FF5A5A" : "#F7B955" }}>
                        {f.suggestedPolicy.action.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono" style={{ color: "#F5F5F7" }}>
                      {f.suggestedPolicy.name}
                    </div>
                    {f.suggestedPolicy.description && (
                      <div className="text-[10px] font-mono mt-1" style={{ color: "#8A8A93" }}>
                        {f.suggestedPolicy.description}
                      </div>
                    )}
                  </div>
                  {f.evidenceRuns.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {f.evidenceRuns.map((r) => (
                        <span key={r} className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(45,212,164,0.1)", color: "#2DD4A4" }}>
                          run {r.slice(0, 6)}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => onAdopt(f.suggestedPolicy)}
                    disabled={adopted.has(f.suggestedPolicy.id)}
                    className="px-3 py-1 rounded text-[10px] font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-60"
                    style={{ background: adopted.has(f.suggestedPolicy.id) ? "#2DD4A4" : "#A78BFA", color: "#0A0A0D" }}
                  >
                    {adopted.has(f.suggestedPolicy.id) ? "✓ Adopted" : "Adopt →"}
                  </button>
                </>
              )}

              {(f.kind === "redundant" || f.kind === "dead-code") && (
                <button
                  onClick={() => onRevoke(f.policyId)}
                  disabled={adopted.has(`revoked:${f.policyId}`)}
                  className="px-3 py-1 rounded text-[10px] font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-60"
                  style={{ background: adopted.has(`revoked:${f.policyId}`) ? "#8A8A93" : "#1C1C24", color: adopted.has(`revoked:${f.policyId}`) ? "#0A0A0D" : "#FF5A5A", border: "1px solid #FF5A5A30" }}
                >
                  {adopted.has(`revoked:${f.policyId}`) ? "✓ Revoked" : "Revoke →"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="shrink-0 p-3 border-t flex items-center gap-2" style={{ borderColor: "#262630" }}>
        <button
          onClick={onRerun}
          disabled={running}
          className="text-[10px] font-mono px-3 py-1.5 rounded transition-all hover:brightness-125 disabled:opacity-50"
          style={{ background: "#1C1C24", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.3)" }}
        >
          {running ? "Auditing…" : "↻ Re-audit"}
        </button>
        <span className="text-[9px] font-mono ml-auto" style={{ color: "#5A5A63" }}>
          Opus 4.7 · 5k thinking budget
        </span>
      </div>
    </div>
  );
}
