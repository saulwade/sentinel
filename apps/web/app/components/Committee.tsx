"use client";

import { useState, useEffect, useRef } from "react";

import { ENGINE } from "../lib/engine";

// ─── Types (mirror @sentinel/shared/committee) ────────────────────────────────

type Persona = "ciso" | "legal" | "product";
type Verdict = "uphold" | "override" | "escalate";

interface Opinion {
  persona: Persona;
  verdict: Verdict;
  reasoning: string;
  concerns: string[];
  thinkingTokens?: number;
}

interface Consensus {
  consensus: Verdict;
  voteBreakdown: { uphold: number; override: number; escalate: number };
  keyDisagreements: string[];
  recommendedAction: string;
  reasoning: string;
  thinkingTokens?: number;
}

// ─── Persona metadata ─────────────────────────────────────────────────────────

const PERSONA_META: Record<Persona, { label: string; icon: string; color: string; subtitle: string }> = {
  ciso: { label: "CISO", icon: "👔", color: "#FF5A5A", subtitle: "Security-first, paranoid" },
  legal: { label: "Legal & Compliance", icon: "⚖️", color: "#7DD3FC", subtitle: "Regulatory exposure" },
  product: { label: "Product Lead", icon: "📊", color: "#2DD4A4", subtitle: "Customer experience" },
};

function verdictColor(v: Verdict) {
  if (v === "uphold") return "#2DD4A4";
  if (v === "override") return "#FF5A5A";
  return "#F7B955";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Committee({
  decisionEventId,
  onClose,
}: {
  decisionEventId: string;
  onClose: () => void;
}) {
  const [thinking, setThinking] = useState<Record<Persona | "moderator", string>>({
    ciso: "", legal: "", product: "", moderator: "",
  });
  const [opinions, setOpinions] = useState<Map<Persona, Opinion>>(new Map());
  const [errors, setErrors] = useState<Map<Persona, string>>(new Map());
  const [consensus, setConsensus] = useState<Consensus | null>(null);
  const [running, setRunning] = useState(true);
  const [showThinking, setShowThinking] = useState<Record<Persona | "moderator", boolean>>({
    ciso: false, legal: false, product: false, moderator: false,
  });
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"deliberating" | "synthesizing" | "done">("deliberating");
  const startedAt = useRef(Date.now()).current;
  const [durationMs, setDurationMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${ENGINE}/committee/${decisionEventId}`, { method: "POST" });
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
            } catch { /* ignore */ }
          }
        }
      } catch (e) {
        if (!cancelled) setFatalError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) {
          setRunning(false);
          setDurationMs(Date.now() - startedAt);
        }
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionEventId]);

  function handleEvent(kind: string, ev: Record<string, unknown>) {
    if (kind === "persona_thinking") {
      const persona = ev.persona as Persona;
      setThinking((prev) => ({ ...prev, [persona]: prev[persona] + String(ev.delta ?? "") }));
    } else if (kind === "persona_opinion") {
      const op = ev.opinion as Opinion;
      setOpinions((prev) => new Map(prev).set(op.persona, op));
    } else if (kind === "persona_error") {
      const persona = ev.persona as Persona;
      setErrors((prev) => new Map(prev).set(persona, String(ev.error ?? "unknown")));
    } else if (kind === "moderator_thinking") {
      setPhase("synthesizing");
      setThinking((prev) => ({ ...prev, moderator: prev.moderator + String(ev.delta ?? "") }));
    } else if (kind === "moderator_consensus") {
      setConsensus(ev.consensus as Consensus);
      setPhase("done");
    } else if (kind === "error") {
      setFatalError(String(ev.message ?? ev.error ?? "unknown"));
    }
  }

  function exportMarkdown() {
    const lines: string[] = [
      `# Security Committee Transcript`,
      ``,
      `**Decision Event:** \`${decisionEventId}\``,
      `**Duration:** ${durationMs != null ? `${(durationMs / 1000).toFixed(1)}s` : "—"}`,
      ``,
      `---`,
      ``,
    ];

    (["ciso", "legal", "product"] as Persona[]).forEach((p) => {
      const op = opinions.get(p);
      const meta = PERSONA_META[p];
      lines.push(`## ${meta.icon} ${meta.label}`);
      if (op) {
        lines.push(``, `**Verdict:** ${op.verdict.toUpperCase()}`, ``, op.reasoning, ``, `**Concerns:**`);
        op.concerns.forEach((c) => lines.push(`- ${c}`));
      } else {
        lines.push(`_(error: ${errors.get(p) ?? "no opinion"})_`);
      }
      lines.push(``, `---`, ``);
    });

    if (consensus) {
      lines.push(`## 🎭 Moderator Consensus`);
      lines.push(``, `**Result:** ${consensus.consensus.toUpperCase()}`, ``);
      lines.push(`**Vote:** uphold ${consensus.voteBreakdown.uphold} · override ${consensus.voteBreakdown.override} · escalate ${consensus.voteBreakdown.escalate}`);
      lines.push(``, consensus.reasoning, ``);
      if (consensus.keyDisagreements.length) {
        lines.push(`**Key disagreements:**`);
        consensus.keyDisagreements.forEach((d) => lines.push(`- ${d}`));
        lines.push(``);
      }
      lines.push(`**Recommended action:** ${consensus.recommendedAction}`);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `committee-${decisionEventId.slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const allFinished = opinions.size + errors.size === 3;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(10,10,13,0.85)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl w-full max-w-[min(1100px,calc(100vw-24px))] max-h-[90vh] flex flex-col"
        style={{ background: "#0D0D12", border: "1px solid #262630", boxShadow: "0 40px 80px rgba(0,0,0,0.6)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 sm:px-5 py-3 border-b shrink-0" style={{ borderColor: "#262630" }}>
          <span className="text-lg">🏛️</span>
          <span className="text-sm font-mono font-semibold" style={{ color: "#F5F5F7" }}>
            Security Committee
          </span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(167,139,250,0.1)", color: "#A78BFA" }}>
            4× OPUS 4.7
          </span>
          <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
            {phase === "deliberating" && "Three personas deliberating in parallel…"}
            {phase === "synthesizing" && "Moderator synthesizing consensus…"}
            {phase === "done" && `Consensus reached in ${((durationMs ?? 0) / 1000).toFixed(1)}s`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {consensus && (
              <button
                onClick={exportMarkdown}
                className="text-[10px] font-mono px-2 py-0.5 rounded transition-all hover:brightness-110"
                style={{ color: "#F5F5F7", background: "#1C1C24", border: "1px solid #262630" }}
              >
                ↓ Export transcript
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[10px] font-mono px-2 py-0.5 rounded transition-all hover:brightness-150"
              style={{ color: "#8A8A93", background: "#1C1C24", border: "1px solid #262630" }}
            >
              Esc ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {fatalError && (
            <div className="rounded-lg px-4 py-3" style={{ background: "rgba(255,90,90,0.05)", border: "1px solid rgba(255,90,90,0.3)" }}>
              <p className="text-xs font-mono" style={{ color: "#FF5A5A" }}>{fatalError}</p>
            </div>
          )}

          {/* Three personas grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(["ciso", "legal", "product"] as Persona[]).map((p) => {
              const meta = PERSONA_META[p];
              const op = opinions.get(p);
              const err = errors.get(p);
              const pThinking = thinking[p];
              const active = running && !op && !err;
              return (
                <div
                  key={p}
                  className="rounded-lg p-3 flex flex-col"
                  style={{
                    background: `${meta.color}08`,
                    border: `1px solid ${meta.color}${active ? "55" : "25"}`,
                    boxShadow: active ? `0 0 16px ${meta.color}22` : "none",
                    transition: "all 0.3s ease",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">{meta.icon}</span>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-mono font-semibold" style={{ color: meta.color }}>
                        {meta.label}
                      </span>
                      <span className="text-[9px] font-mono" style={{ color: "#8A8A93" }}>
                        {meta.subtitle}
                      </span>
                    </div>
                    {active && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: meta.color }} />
                    )}
                    {op && (
                      <span
                        className="ml-auto text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase"
                        style={{ background: `${verdictColor(op.verdict)}20`, color: verdictColor(op.verdict) }}
                      >
                        {op.verdict}
                      </span>
                    )}
                  </div>

                  {/* Thinking */}
                  {pThinking && (
                    <div className="mb-2">
                      <button
                        onClick={() => setShowThinking((prev) => ({ ...prev, [p]: !prev[p] }))}
                        className="text-[9px] font-mono transition-all hover:brightness-150"
                        style={{ color: meta.color }}
                      >
                        {showThinking[p] ? "hide" : "show"} thinking · ~{Math.ceil(pThinking.length / 4)} tokens
                      </button>
                      {showThinking[p] && (
                        <pre className="mt-1 text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-words rounded p-2" style={{ color: meta.color, opacity: 0.7, background: "rgba(0,0,0,0.2)", maxHeight: "120px", overflowY: "auto" }}>
                          {pThinking}
                        </pre>
                      )}
                    </div>
                  )}

                  {/* Opinion */}
                  {op && (
                    <>
                      <p className="text-[11px] font-mono leading-relaxed mb-2" style={{ color: "#F5F5F7" }}>
                        {op.reasoning}
                      </p>
                      {op.concerns.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
                            Concerns
                          </div>
                          {op.concerns.map((c, i) => (
                            <div key={i} className="text-[10px] font-mono leading-relaxed pl-2" style={{ color: "#8A8A93", borderLeft: `2px solid ${meta.color}40` }}>
                              {c}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {err && (
                    <p className="text-[10px] font-mono" style={{ color: "#FF5A5A" }}>
                      Error: {err}
                    </p>
                  )}

                  {!op && !err && !pThinking && (
                    <p className="text-[10px] font-mono" style={{ color: "#5A5A63" }}>
                      Awaiting opinion…
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Moderator panel */}
          {(allFinished || consensus || thinking.moderator) && (
            <div
              className="rounded-lg p-4"
              style={{
                background: consensus ? "rgba(167,139,250,0.06)" : "rgba(167,139,250,0.03)",
                border: `1px solid ${consensus ? "rgba(167,139,250,0.35)" : "rgba(167,139,250,0.2)"}`,
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🎭</span>
                <span className="text-[11px] font-mono font-semibold" style={{ color: "#A78BFA" }}>
                  Moderator
                </span>
                <span className="text-[9px] font-mono" style={{ color: "#8A8A93" }}>
                  synthesizes consensus (does not vote)
                </span>
                {!consensus && phase === "synthesizing" && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#A78BFA" }} />
                )}
                {consensus && (
                  <span
                    className="ml-auto text-xs font-mono font-bold px-2 py-0.5 rounded uppercase"
                    style={{ background: `${verdictColor(consensus.consensus)}20`, color: verdictColor(consensus.consensus), border: `1px solid ${verdictColor(consensus.consensus)}40` }}
                  >
                    {consensus.consensus}
                  </span>
                )}
              </div>

              {/* Moderator thinking */}
              {thinking.moderator && (
                <div className="mb-3">
                  <button
                    onClick={() => setShowThinking((prev) => ({ ...prev, moderator: !prev.moderator }))}
                    className="text-[9px] font-mono transition-all hover:brightness-150"
                    style={{ color: "#A78BFA" }}
                  >
                    {showThinking.moderator ? "hide" : "show"} moderator thinking · ~{Math.ceil(thinking.moderator.length / 4)} tokens
                  </button>
                  {showThinking.moderator && (
                    <pre className="mt-1 text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-words rounded p-2" style={{ color: "#A78BFA", opacity: 0.7, background: "rgba(0,0,0,0.2)", maxHeight: "140px", overflowY: "auto" }}>
                      {thinking.moderator}
                    </pre>
                  )}
                </div>
              )}

              {consensus && (
                <>
                  {/* Vote breakdown */}
                  <div className="flex items-center gap-1 mb-3">
                    <div className="text-[9px] font-mono uppercase tracking-widest mr-2" style={{ color: "#8A8A93" }}>
                      Vote
                    </div>
                    {(["uphold", "override", "escalate"] as Verdict[]).map((v) => (
                      <div
                        key={v}
                        className="text-[10px] font-mono px-2 py-0.5 rounded tabular-nums"
                        style={{ background: `${verdictColor(v)}14`, color: verdictColor(v), border: `1px solid ${verdictColor(v)}30`, opacity: consensus.voteBreakdown[v] > 0 ? 1 : 0.4 }}
                      >
                        {v}: {consensus.voteBreakdown[v]}
                      </div>
                    ))}
                  </div>

                  <p className="text-xs font-mono leading-relaxed mb-3" style={{ color: "#F5F5F7" }}>
                    {consensus.reasoning}
                  </p>

                  {consensus.keyDisagreements.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "#8A8A93" }}>
                        Key Disagreements
                      </div>
                      <div className="space-y-1">
                        {consensus.keyDisagreements.map((d, i) => (
                          <div key={i} className="text-[11px] font-mono leading-relaxed pl-2" style={{ color: "#F7B955", borderLeft: "2px solid rgba(247,185,85,0.4)" }}>
                            {d}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded px-3 py-2" style={{ background: "rgba(45,212,164,0.06)", border: "1px solid rgba(45,212,164,0.25)" }}>
                    <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: "#2DD4A4" }}>
                      Recommended Action
                    </div>
                    <p className="text-[11px] font-mono leading-relaxed" style={{ color: "#F5F5F7" }}>
                      {consensus.recommendedAction}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
