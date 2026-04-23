"use client";

import { useState, useRef, useEffect } from "react";

const ENGINE = "http://localhost:3001";

interface Evidence {
  runId: string;
  eventSeq?: number | null;
  quote: string;
}

interface AskResult {
  tldr: string;
  analysis: string;
  evidence: Evidence[];
  recommendation?: string | null;
  thinkingTokens?: number;
  contextTokens?: number;
}

interface Turn {
  id: string;
  question: string;
  thinking: string;
  result: AskResult | null;
  error: string | null;
  loading: boolean;
  thinkingTokens: number;
}

const SUGGESTIONS = [
  "Am I more secure than last week?",
  "Which of my policies are redundant?",
  "If I added a wire-transfer tool, what risks would that open?",
  "What's my most dangerous attack pattern?",
];

function newTurnId() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export default function AskOpus() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function submit(question: string) {
    const q = question.trim();
    if (q.length < 4 || busy) return;

    const id = newTurnId();
    const turn: Turn = { id, question: q, thinking: "", result: null, error: null, loading: true, thinkingTokens: 0 };
    setTurns((prev) => [...prev, turn]);
    setInput("");
    setBusy(true);

    // Use fetch+reader for SSE with POST body
    try {
      const res = await fetch(`${ENGINE}/ask/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.body) throw new Error("no response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const patchTurn = (patch: Partial<Turn>) =>
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE frames (event: X\ndata: Y\n\n)
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
            setTurns((prev) =>
              prev.map((t) =>
                t.id === id
                  ? { ...t, thinking: t.thinking + data, thinkingTokens: Math.ceil((t.thinking.length + data.length) / 4) }
                  : t,
              ),
            );
          } else if (eventName === "result") {
            try {
              const parsed: AskResult = JSON.parse(data);
              patchTurn({ result: parsed });
            } catch {
              patchTurn({ error: "failed to parse response" });
            }
          } else if (eventName === "error") {
            try {
              const err = JSON.parse(data);
              patchTurn({ error: err.error ?? "unknown error" });
            } catch {
              patchTurn({ error: data });
            }
          } else if (eventName === "done") {
            patchTurn({ loading: false });
          }
        }
      }
    } catch (e) {
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, error: e instanceof Error ? e.message : String(e), loading: false } : t)),
      );
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit(input);
    }
  }

  const showSuggestions = turns.length === 0 && !busy;

  return (
    <div className="flex flex-col h-full" style={{ background: "#0A0A0D" }}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-5 py-2.5 border-b shrink-0"
        style={{ borderColor: "#262630" }}
      >
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
          Ask Opus
        </span>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(167,139,250,0.1)", color: "#A78BFA" }}>
          OPUS 4.7 · 1M CONTEXT
        </span>
        <span className="text-[10px] font-mono ml-auto" style={{ color: "#8A8A93" }}>
          Your CISO · grounded in every run, event, and policy
        </span>
      </div>

      {/* ── Conversation ─────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
          {showSuggestions && (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center" style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.3)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <p className="font-mono text-sm font-semibold" style={{ color: "#F5F5F7" }}>
                  Ask Sentinel anything
                </p>
                <p className="font-mono text-xs" style={{ color: "#8A8A93" }}>
                  Opus reads your full operational history and answers like a CISO.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="text-left px-3 py-2.5 rounded text-xs font-mono transition-all active:scale-[0.98] hover:brightness-125"
                    style={{ background: "#14141A", border: "1px solid #262630", color: "#F5F5F7" }}
                  >
                    <span style={{ color: "#A78BFA" }}>✦</span> {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn) => (
            <TurnCard key={turn.id} turn={turn} />
          ))}
        </div>
      </div>

      {/* ── Composer ─────────────────────────────────────────────────── */}
      <div className="border-t shrink-0 px-5 py-3" style={{ borderColor: "#262630", background: "#0D0D12" }}>
        <div className="max-w-3xl mx-auto flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about your security posture…  (⌘↵ to send)"
            rows={2}
            className="flex-1 px-3 py-2 rounded text-xs font-mono resize-none"
            style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630", outline: "none" }}
            disabled={busy}
          />
          <button
            onClick={() => submit(input)}
            disabled={busy || input.trim().length < 4}
            className="px-4 py-2 rounded text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-40 shrink-0 self-end"
            style={{ background: "#A78BFA", color: "#0A0A0D" }}
          >
            {busy ? "Thinking…" : "Ask →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Turn card ────────────────────────────────────────────────────────────────

function TurnCard({ turn }: { turn: Turn }) {
  const [showThinking, setShowThinking] = useState(false);

  return (
    <div className="space-y-3">
      {/* Question */}
      <div className="flex gap-3">
        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "#1C1C24", border: "1px solid #262630" }}>
          <span className="text-[10px] font-mono font-bold" style={{ color: "#F5F5F7" }}>Y</span>
        </div>
        <div className="flex-1 text-sm font-mono leading-relaxed pt-0.5" style={{ color: "#F5F5F7" }}>
          {turn.question}
        </div>
      </div>

      {/* Response */}
      <div className="flex gap-3">
        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)" }}>
          <span className="text-[10px] font-mono font-bold" style={{ color: "#A78BFA" }}>O</span>
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          {/* Thinking stream */}
          {(turn.thinking || turn.loading) && (
            <div className="rounded-lg" style={{ background: "rgba(167,139,250,0.04)", border: "1px solid rgba(167,139,250,0.2)" }}>
              <button
                onClick={() => setShowThinking((v) => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: turn.loading ? "#A78BFA" : "#8A8A93", animation: turn.loading ? "pulse 1.5s ease-in-out infinite" : undefined }} />
                <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#A78BFA" }}>
                  {turn.loading ? "Opus thinking" : "Thinking"}
                </span>
                <span className="text-[10px] font-mono tabular-nums" style={{ color: "#8A8A93" }}>
                  ~{turn.thinkingTokens || (turn.result?.thinkingTokens ?? 0)} tokens
                </span>
                <span className="ml-auto text-[10px] font-mono" style={{ color: "#8A8A93" }}>
                  {showThinking ? "hide" : "show"}
                </span>
              </button>
              {showThinking && turn.thinking && (
                <pre className="px-3 pb-3 pt-0 text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-words" style={{ color: "#A78BFA", maxHeight: "240px", overflowY: "auto" }}>
                  {turn.thinking}
                </pre>
              )}
            </div>
          )}

          {/* Result */}
          {turn.result && (
            <>
              <div
                className="rounded-lg px-4 py-3"
                style={{ background: "#0D0D12", border: "1px solid #262630" }}
              >
                <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "#8A8A93" }}>
                  TL;DR
                </div>
                <p className="text-sm font-mono leading-relaxed" style={{ color: "#F5F5F7" }}>
                  {turn.result.tldr}
                </p>
              </div>

              <div className="px-4">
                <p className="text-xs font-mono leading-relaxed" style={{ color: "#8A8A93" }}>
                  {turn.result.analysis}
                </p>
              </div>

              {turn.result.evidence.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[9px] font-mono uppercase tracking-widest px-4" style={{ color: "#8A8A93" }}>
                    Evidence · cited from operational data
                  </div>
                  {turn.result.evidence.map((e, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 px-4 py-2 rounded"
                      style={{ background: "rgba(45,212,164,0.04)", border: "1px solid rgba(45,212,164,0.15)" }}
                    >
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 mt-0.5" style={{ background: "rgba(45,212,164,0.15)", color: "#2DD4A4" }}>
                        run {e.runId.slice(0, 6)}
                        {e.eventSeq != null ? ` · seq ${e.eventSeq}` : ""}
                      </span>
                      <span className="text-[11px] font-mono leading-relaxed" style={{ color: "#F5F5F7" }}>
                        {e.quote}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {turn.result.recommendation && (
                <div
                  className="rounded-lg px-4 py-3"
                  style={{ background: "rgba(247,185,85,0.04)", border: "1px solid rgba(247,185,85,0.2)" }}
                >
                  <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "#F7B955" }}>
                    Recommendation
                  </div>
                  <p className="text-xs font-mono leading-relaxed" style={{ color: "#F5F5F7" }}>
                    {turn.result.recommendation}
                  </p>
                </div>
              )}

              {turn.result.contextTokens != null && (
                <div className="text-[9px] font-mono px-4" style={{ color: "#5A5A63" }}>
                  Opus read ~{turn.result.contextTokens.toLocaleString()} tokens of your operational data
                </div>
              )}
            </>
          )}

          {turn.error && (
            <div className="rounded-lg px-4 py-3" style={{ background: "rgba(255,90,90,0.05)", border: "1px solid rgba(255,90,90,0.25)" }}>
              <p className="text-xs font-mono" style={{ color: "#FF5A5A" }}>
                {turn.error}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
