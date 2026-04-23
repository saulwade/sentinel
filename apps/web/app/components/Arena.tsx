"use client";

import { useState, useRef, useEffect } from "react";

import { ENGINE } from "../lib/engine";

// ─── Types (mirror @sentinel/shared/arena) ────────────────────────────────────

interface Attack {
  id: string;
  iteration?: number;
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

interface Policy {
  id: string;
  name: string;
  description: string;
  action: string;
  severity: string;
  source: string;
  enabled: boolean;
  createdAt: number;
  sourceAttackId?: string;
  when?: unknown[];
}

interface RoundStats {
  round: number;
  generated: number;
  blocked: number;
  pausedSafe: number;
  bypassed: number;
  policiesSynthesized: number;
  trustScore: number;
  trustGrade: string;
}

interface ArenaSummary {
  rounds: number;
  totalAttacks: number;
  blocked: number;
  pausedSafe: number;
  bypassed: number;
  policiesSynthesized: Policy[];
  trustScoreTrajectory: number[];
  trustGradeTrajectory: string[];
  durationMs: number;
}

interface BattleReport {
  markdown: string;
  techniquesDetected: string[];
  mostDangerousAttackId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeColor(g: string) {
  if (g === "A+" || g === "A") return "#2DD4A4";
  if (g === "B") return "#7DD3FC";
  if (g === "C") return "#F7B955";
  if (g === "D") return "#FF9633";
  return "#FF5A5A";
}

function outcomeColor(o: string) {
  if (o === "blocked") return "#2DD4A4";
  if (o === "paused-safe") return "#F7B955";
  return "#FF5A5A";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Arena() {
  const [rounds, setRounds] = useState(3);
  const [attacksPerRound, setAttacksPerRound] = useState(2);
  const [running, setRunning] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(3);
  const [redThinking, setRedThinking] = useState("");
  const [blueThinking, setBlueThinking] = useState("");
  const [attacks, setAttacks] = useState<Attack[]>([]);
  const [results, setResults] = useState<Map<string, TestResult>>(new Map());
  const [policies, setPolicies] = useState<Array<{ policy: Policy; round: number; sourceAttackId: string }>>([]);
  const [roundStats, setRoundStats] = useState<RoundStats[]>([]);
  const [summary, setSummary] = useState<ArenaSummary | null>(null);
  const [battleReport, setBattleReport] = useState<BattleReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"red" | "blue" | null>(null);
  const [showReport, setShowReport] = useState(true);

  const redScrollRef = useRef<HTMLDivElement>(null);
  const blueScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    redScrollRef.current?.scrollTo({ top: redScrollRef.current.scrollHeight });
  }, [redThinking, attacks]);
  useEffect(() => {
    blueScrollRef.current?.scrollTo({ top: blueScrollRef.current.scrollHeight });
  }, [blueThinking, policies]);

  async function start() {
    setRunning(true);
    setCurrentRound(0);
    setTotalRounds(rounds);
    setRedThinking("");
    setBlueThinking("");
    setAttacks([]);
    setResults(new Map());
    setPolicies([]);
    setRoundStats([]);
    setSummary(null);
    setBattleReport(null);
    setError(null);
    setPhase(null);

    try {
      const res = await fetch(`${ENGINE}/arena/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rounds, attacksPerRound }),
      });
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
          try {
            handleEvent(eventName, JSON.parse(data));
          } catch { /* ignore malformed */ }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setPhase(null);
    }
  }

  function handleEvent(kind: string, ev: Record<string, unknown>) {
    if (kind === "round_start") {
      setCurrentRound(Number(ev.round ?? 0));
      setTotalRounds(Number(ev.totalRounds ?? rounds));
      setPhase("red");
      setRedThinking("");
      setBlueThinking("");
    } else if (kind === "red_thinking") {
      setRedThinking((prev) => prev + String(ev.delta ?? ""));
      setPhase("red");
    } else if (kind === "red_attack") {
      const attack = ev.attack as Attack;
      setAttacks((prev) => [...prev, attack]);
    } else if (kind === "test_result") {
      const result = ev.result as TestResult;
      setResults((prev) => new Map(prev).set(String(ev.attackId), result));
    } else if (kind === "blue_thinking") {
      setBlueThinking((prev) => prev + String(ev.delta ?? ""));
      setPhase("blue");
    } else if (kind === "blue_policy") {
      setPolicies((prev) => [
        ...prev,
        {
          policy: ev.policy as Policy,
          round: Number(ev.round ?? 0),
          sourceAttackId: String(ev.sourceAttackId ?? ""),
        },
      ]);
    } else if (kind === "round_end") {
      setRoundStats((prev) => [...prev, ev.stats as RoundStats]);
    } else if (kind === "battle_report") {
      setBattleReport(ev.report as BattleReport);
    } else if (kind === "arena_end") {
      setSummary(ev.summary as ArenaSummary);
    } else if (kind === "error") {
      setError(String(ev.message ?? ev.error ?? "unknown error"));
    }
  }

  async function adoptAll() {
    for (const { policy } of policies) {
      try {
        await fetch(`${ENGINE}/policies`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(policy),
        });
      } catch { /* ignore */ }
    }
  }

  const latestScore = roundStats.length > 0 ? roundStats[roundStats.length - 1].trustScore : 0;
  const latestGrade = roundStats.length > 0 ? roundStats[roundStats.length - 1].trustGrade : "—";
  const firstScore = roundStats.length > 0 ? roundStats[0].trustScore : 0;

  return (
    <div className="flex flex-col h-full" style={{ background: "#0A0A0D" }}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b shrink-0" style={{ borderColor: "#262630" }}>
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
          Adversarial Evolution Arena
        </span>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(167,139,250,0.1)", color: "#A78BFA" }}>
          2× OPUS 4.7
        </span>

        {!running && !summary && (
          <div className="flex items-center gap-2 ml-4">
            <label className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
              Rounds:
              <input
                type="number" min={1} max={5}
                value={rounds}
                onChange={(e) => setRounds(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
                className="ml-1 w-10 px-1 py-0.5 rounded text-[10px] font-mono tabular-nums"
                style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630" }}
              />
            </label>
            <label className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
              Attacks/round:
              <input
                type="number" min={1} max={4}
                value={attacksPerRound}
                onChange={(e) => setAttacksPerRound(Math.max(1, Math.min(4, Number(e.target.value) || 1)))}
                className="ml-1 w-10 px-1 py-0.5 rounded text-[10px] font-mono tabular-nums"
                style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630" }}
              />
            </label>
          </div>
        )}

        {(running || summary) && currentRound > 0 && (
          <span className="text-[10px] font-mono ml-2" style={{ color: "#8A8A93" }}>
            Round <strong style={{ color: "#F5F5F7" }}>{currentRound}</strong> / {totalRounds}
            {phase && (
              <span className="ml-2">
                · phase:{" "}
                <strong style={{ color: phase === "red" ? "#FF5A5A" : "#7DD3FC" }}>
                  {phase === "red" ? "Red attacks" : "Blue defends"}
                </strong>
              </span>
            )}
          </span>
        )}

        {/* Trust Score arc */}
        {roundStats.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>Trust Score</span>
            <div className="flex items-center gap-1">
              {roundStats.map((rs, i) => (
                <div key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-[10px]" style={{ color: "#8A8A93" }}>→</span>}
                  <span
                    className="text-[10px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded"
                    style={{ background: `${gradeColor(rs.trustGrade)}20`, color: gradeColor(rs.trustGrade) }}
                  >
                    {rs.trustScore} {rs.trustGrade}
                  </span>
                </div>
              ))}
            </div>
            {roundStats.length >= 2 && (
              <span className="text-[10px] font-mono" style={{ color: latestScore > firstScore ? "#2DD4A4" : "#F7B955" }}>
                {latestScore > firstScore ? `+${latestScore - firstScore}` : latestScore - firstScore}
              </span>
            )}
          </div>
        )}

        {!running && !summary && (
          <button
            onClick={start}
            className="ml-auto px-4 py-1.5 rounded text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110"
            style={{ background: "#A78BFA", color: "#0A0A0D" }}
          >
            ▶  Start Arena
          </button>
        )}
        {!running && summary && (
          <button
            onClick={start}
            className="px-3 py-1 rounded text-[10px] font-mono font-medium transition-all active:scale-95 hover:brightness-110"
            style={{ background: "#1C1C24", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.3)" }}
          >
            ↻ Run again
          </button>
        )}
      </div>

      {/* ── Split screen ────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Red panel */}
        <div className="flex-1 flex flex-col border-r min-h-0" style={{ borderColor: "#262630" }}>
          <div
            className="flex items-center gap-2 px-4 py-2 border-b shrink-0"
            style={{ borderColor: "#262630", background: phase === "red" ? "rgba(255,90,90,0.06)" : "transparent" }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: "#FF5A5A", boxShadow: phase === "red" ? "0 0 8px #FF5A5A" : "none", animation: phase === "red" ? "pulse 1.5s ease-in-out infinite" : undefined }} />
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#FF5A5A" }}>
              Red Opus · Attacker
            </span>
            <span className="text-[10px] font-mono ml-auto tabular-nums" style={{ color: "#8A8A93" }}>
              {attacks.length} attack{attacks.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div ref={redScrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {redThinking && (
              <div className="rounded-lg p-2.5" style={{ background: "rgba(255,90,90,0.04)", border: "1px solid rgba(255,90,90,0.15)" }}>
                <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: "#FF5A5A" }}>
                  Thinking · ~{Math.ceil(redThinking.length / 4)} tokens
                </div>
                <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-words" style={{ color: "#FF5A5A", opacity: 0.75, maxHeight: "180px", overflowY: "auto" }}>
                  {redThinking}
                </pre>
              </div>
            )}

            {attacks.map((a) => {
              const r = results.get(a.id);
              return (
                <div
                  key={a.id}
                  className="rounded-lg p-2.5"
                  style={{ background: "#14141A", border: r ? `1px solid ${outcomeColor(r.outcome)}33` : "1px solid #262630" }}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0" style={{ background: "#1C1C24", color: "#FF5A5A" }}>
                      {a.id.slice(-5)}
                    </span>
                    <span className="text-[10px] font-mono font-semibold flex-1 min-w-0" style={{ color: "#F5F5F7" }}>
                      {a.description}
                    </span>
                    {r ? (
                      <span
                        className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 uppercase"
                        style={{ background: `${outcomeColor(r.outcome)}20`, color: outcomeColor(r.outcome) }}
                      >
                        {r.outcome}
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono" style={{ color: "#8A8A93" }}>…</span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-1 text-[9px] font-mono" style={{ color: "#8A8A93" }}>
                    <span>{a.technique}</span>
                    <span>→ {a.intendedTool}</span>
                    {a.mutationReason && <span style={{ color: "#FF9633" }}>· mutation</span>}
                  </div>
                  {a.mutationReason && (
                    <p className="text-[9px] font-mono mt-1 leading-relaxed" style={{ color: "#FF9633" }}>
                      {a.mutationReason}
                    </p>
                  )}
                </div>
              );
            })}

            {attacks.length === 0 && !running && (
              <div className="text-center text-[11px] font-mono pt-12" style={{ color: "#5A5A63" }}>
                Red Opus generates adversarial attacks here
              </div>
            )}
          </div>
        </div>

        {/* Blue panel */}
        <div className="flex-1 flex flex-col min-h-0">
          <div
            className="flex items-center gap-2 px-4 py-2 border-b shrink-0"
            style={{ borderColor: "#262630", background: phase === "blue" ? "rgba(125,211,252,0.06)" : "transparent" }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: "#7DD3FC", boxShadow: phase === "blue" ? "0 0 8px #7DD3FC" : "none", animation: phase === "blue" ? "pulse 1.5s ease-in-out infinite" : undefined }} />
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#7DD3FC" }}>
              Blue Opus · Defender
            </span>
            <span className="text-[10px] font-mono ml-auto tabular-nums" style={{ color: "#8A8A93" }}>
              {policies.length} polic{policies.length === 1 ? "y" : "ies"}
            </span>
          </div>

          <div ref={blueScrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {blueThinking && (
              <div className="rounded-lg p-2.5" style={{ background: "rgba(125,211,252,0.04)", border: "1px solid rgba(125,211,252,0.15)" }}>
                <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: "#7DD3FC" }}>
                  Thinking · ~{Math.ceil(blueThinking.length / 4)} tokens
                </div>
                <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-words" style={{ color: "#7DD3FC", opacity: 0.75, maxHeight: "180px", overflowY: "auto" }}>
                  {blueThinking}
                </pre>
              </div>
            )}

            {policies.map(({ policy, round, sourceAttackId }, i) => (
              <div
                key={i}
                className="rounded-lg p-2.5"
                style={{ background: "#14141A", border: "1px solid rgba(125,211,252,0.25)" }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 uppercase" style={{ background: policy.action === "block" ? "rgba(255,90,90,0.15)" : "rgba(247,185,85,0.15)", color: policy.action === "block" ? "#FF5A5A" : "#F7B955" }}>
                    {policy.action}
                  </span>
                  <span className="text-[10px] font-mono font-semibold flex-1 min-w-0" style={{ color: "#F5F5F7" }}>
                    {policy.name}
                  </span>
                  <span className="text-[9px] font-mono" style={{ color: "#7DD3FC" }}>R{round}</span>
                </div>
                <p className="text-[10px] font-mono mt-1 leading-relaxed" style={{ color: "#8A8A93" }}>
                  {policy.description}
                </p>
                <div className="text-[9px] font-mono mt-1" style={{ color: "#5A5A63" }}>
                  ← {sourceAttackId.slice(-5)}
                </div>
              </div>
            ))}

            {policies.length === 0 && !running && (
              <div className="text-center text-[11px] font-mono pt-12" style={{ color: "#5A5A63" }}>
                Blue Opus synthesizes defensive policies here
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer / Report ─────────────────────────────────────────────── */}
      {error && (
        <div className="shrink-0 px-4 py-2 border-t" style={{ borderColor: "#262630", background: "rgba(255,90,90,0.05)" }}>
          <span className="text-[11px] font-mono" style={{ color: "#FF5A5A" }}>{error}</span>
        </div>
      )}

      {summary && (
        <div className="shrink-0 border-t flex flex-col" style={{ borderColor: "#262630", background: "#0D0D12", maxHeight: "40vh" }}>
          <div className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0" style={{ borderColor: "#1C1C24" }}>
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#A78BFA" }}>
              Battle Report
            </span>
            <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
              {summary.totalAttacks} attacks · {summary.blocked} blocked · {summary.bypassed} bypassed · {summary.policiesSynthesized.length} policies
            </span>
            <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
              · {(summary.durationMs / 1000).toFixed(1)}s
            </span>
            {battleReport?.techniquesDetected.length ? (
              <span className="text-[10px] font-mono" style={{ color: "#F7B955" }}>
                · techniques: {battleReport.techniquesDetected.join(", ")}
              </span>
            ) : null}
            <div className="ml-auto flex gap-2">
              {summary.policiesSynthesized.length > 0 && (
                <button
                  onClick={adoptAll}
                  className="px-2.5 py-1 rounded text-[10px] font-mono font-medium transition-all active:scale-95 hover:brightness-110"
                  style={{ background: "#A78BFA", color: "#0A0A0D" }}
                >
                  Adopt all {summary.policiesSynthesized.length} →
                </button>
              )}
              <button
                onClick={() => setShowReport((v) => !v)}
                className="px-2 py-1 rounded text-[10px] font-mono transition-all hover:brightness-150"
                style={{ color: "#8A8A93", background: "#1C1C24", border: "1px solid #262630" }}
              >
                {showReport ? "hide" : "show"}
              </button>
            </div>
          </div>

          {showReport && battleReport && (
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap" style={{ color: "#F5F5F7" }}>
                {battleReport.markdown}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
