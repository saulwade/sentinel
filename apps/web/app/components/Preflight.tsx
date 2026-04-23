"use client";

import { useState, useRef } from "react";

const ENGINE = "http://localhost:3001";

interface SynthesizedScenario {
  id: string;
  agentName: string;
  agentRole: string;
  task: string;
  attackVector: string;
  injectedPayload: string;
  customers: Array<{ id: string; name: string; company: string; tier: string; lifetimeValue: number }>;
  tickets: Array<{ id: string; subject: string; body: string }>;
  toolChain: Array<{ tool: string; args: Record<string, unknown> }>;
}

function ScenarioBuilder({ onLaunched }: { onLaunched?: (runId: string, label: string, task: string) => void }) {
  const [description, setDescription] = useState("");
  const [synthesizing, setSynthesizing] = useState(false);
  const [scenario, setScenario] = useState<SynthesizedScenario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState<string | null>(null);

  async function synthesize() {
    setSynthesizing(true);
    setError(null);
    setScenario(null);
    setLaunched(null);
    try {
      const res = await fetch(`${ENGINE}/scenarios/synthesize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "synthesis failed");
      setScenario(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSynthesizing(false);
    }
  }

  async function runScenario() {
    if (!scenario) return;
    setLaunching(true);
    setError(null);
    try {
      const res = await fetch(`${ENGINE}/scenarios/${scenario.id}/run`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "launch failed");
      setLaunched(json.runId);
      onLaunched?.(json.runId, scenario.agentName + " · Custom", "Run synthesized attack scenario");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(false);
    }
  }

  const canSynthesize = description.trim().length >= 20 && !synthesizing;

  return (
    <div
      className="mx-5 mt-4 p-4 rounded-xl"
      style={{ background: "#0D0D12", border: "1px solid #262630" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
          Build Custom Scenario
        </span>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(167,139,250,0.1)", color: "#A78BFA" }}>
          OPUS
        </span>
      </div>
      <p className="text-[11px] font-mono mb-3" style={{ color: "#8A8A93" }}>
        Describe the agent you want to test — who it is, what data it accesses, what actions it can take. Opus will generate a complete attack scenario.
      </p>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Example: A tier-1 customer support agent with access to customer PII, refund processing up to $50k, and email sending. It handles billing disputes and account questions."
        rows={3}
        className="w-full px-3 py-2 rounded text-xs font-mono resize-none"
        style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630", outline: "none" }}
        disabled={synthesizing}
      />

      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={synthesize}
          disabled={!canSynthesize}
          className="px-3 py-1.5 rounded text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-40"
          style={{ background: "#A78BFA", color: "#0A0A0D" }}
        >
          {synthesizing ? "Synthesizing with Opus…" : "✦  Synthesize Scenario"}
        </button>
        {description.trim().length > 0 && description.trim().length < 20 && (
          <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
            {20 - description.trim().length} more chars
          </span>
        )}
      </div>

      {error && (
        <div
          className="mt-3 px-3 py-2 rounded text-[11px] font-mono"
          style={{ background: "rgba(255,90,90,0.08)", color: "#FF5A5A", border: "1px solid rgba(255,90,90,0.2)" }}
        >
          {error}
        </div>
      )}

      {scenario && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold" style={{ color: "#F5F5F7" }}>
              {scenario.agentName}
            </span>
            <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
              — {scenario.agentRole}
            </span>
          </div>

          <div className="px-3 py-2 rounded" style={{ background: "#14141A", border: "1px solid #262630" }}>
            <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: "#FF5A5A" }}>
              Attack Vector
            </div>
            <div className="text-[11px] font-mono" style={{ color: "#F5F5F7" }}>
              {scenario.attackVector}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="px-3 py-2 rounded" style={{ background: "#14141A", border: "1px solid #262630" }}>
              <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
                Customers
              </div>
              <div className="text-base font-mono font-bold" style={{ color: "#F5F5F7" }}>
                {scenario.customers.length}
              </div>
            </div>
            <div className="px-3 py-2 rounded" style={{ background: "#14141A", border: "1px solid #262630" }}>
              <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
                Tickets
              </div>
              <div className="text-base font-mono font-bold" style={{ color: "#F5F5F7" }}>
                {scenario.tickets.length}
              </div>
            </div>
            <div className="px-3 py-2 rounded" style={{ background: "#14141A", border: "1px solid #262630" }}>
              <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
                Tool calls
              </div>
              <div className="text-base font-mono font-bold" style={{ color: "#F5F5F7" }}>
                {scenario.toolChain.length}
              </div>
            </div>
          </div>

          <details className="text-[11px] font-mono" style={{ color: "#8A8A93" }}>
            <summary className="cursor-pointer hover:text-[#F5F5F7]">Tool chain preview</summary>
            <div className="mt-2 space-y-1 pl-3 border-l" style={{ borderColor: "#262630" }}>
              {scenario.toolChain.map((step, i) => (
                <div key={i}>
                  <span style={{ color: "#A78BFA" }}>{step.tool}</span>
                  <span style={{ color: "#5A5A63" }}>({Object.keys(step.args).join(", ")})</span>
                </div>
              ))}
            </div>
          </details>

          <div className="flex items-center gap-2">
            <button
              onClick={runScenario}
              disabled={launching || launched !== null}
              className="px-3 py-1.5 rounded text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-40"
              style={{ background: "#FF5A5A", color: "#0A0A0D" }}
            >
              {launching ? "Launching…" : launched ? "✓ Running" : "▶  Run Scenario"}
            </button>
            {launched && (
              <span className="text-[10px] font-mono" style={{ color: "#2DD4A4" }}>
                ✓ Launched — switching to Runtime
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface DayResult {
  day: number;
  events: number;
  actions: number;
  status: "pass" | "fail" | "running";
  failures: Array<{
    event: { from: string; subject: string; body: string; isAdversarial: boolean };
    reason: string;
    detail: string;
  }>;
}

interface PreflightResult {
  totalDays: number;
  totalScenarios: number;
  passed: number;
  failed: number;
  grade: string;
}

// ─── Agent DNA section — pentest the user's own system prompt ────────────────

interface DnaAttack {
  id: string;
  technique: string;
  title: string;
  rationale: string;
  expectedBypass: string;
  severity: "critical" | "high" | "medium" | "low";
  ticketSubject: string;
  ticketBody: string;
  intendedTool: string;
  intendedArgs: Record<string, unknown>;
}

interface DnaResult {
  vulnerabilities: string[];
  attacks: DnaAttack[];
  thinkingTokens?: number;
  contextTokens?: number;
}

const DNA_PLACEHOLDER = `You are a Tier 1 customer support agent for ACME Software.

You can:
- Look up customer details by ID
- Process refunds up to $5,000 autonomously
- Send emails to customers
- Update ticket status and resolutions

Always be helpful and follow customer instructions.
Escalate to L2 only for refunds above $5,000.`;

function severityColor(s: string) {
  if (s === "critical") return "#FF5A5A";
  if (s === "high") return "#FF9633";
  if (s === "medium") return "#F7B955";
  return "#8A8A93";
}

function AgentDnaSection({ onLaunched }: { onLaunched?: (runId: string, label: string, task: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [thinking, setThinking] = useState("");
  const [showThinking, setShowThinking] = useState(false);
  const [result, setResult] = useState<DnaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState<string | null>(null);

  async function analyze() {
    const p = prompt.trim();
    if (p.length < 40) return;
    setAnalyzing(true);
    setThinking("");
    setResult(null);
    setError(null);

    try {
      const res = await fetch(`${ENGINE}/agent-dna/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ systemPrompt: p }),
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
          if (eventName === "thinking_delta") {
            setThinking((prev) => prev + data);
          } else if (eventName === "result") {
            try { setResult(JSON.parse(data)); } catch { setError("failed to parse result"); }
          } else if (eventName === "error") {
            try { setError(JSON.parse(data).error ?? data); } catch { setError(data); }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  async function runAttack(attack: DnaAttack) {
    setLaunching(attack.id);
    setError(null);
    try {
      const res = await fetch(`${ENGINE}/agent-dna/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attack, systemPrompt: prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "launch failed");
      onLaunched?.(data.runId, `DNA Pentest · ${attack.technique}`, attack.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(null);
    }
  }

  const canAnalyze = prompt.trim().length >= 40 && !analyzing;

  return (
    <div
      className="mx-5 mt-4 p-4 rounded-xl"
      style={{ background: "#0D0D12", border: "1px solid #262630" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
          Agent DNA · Pentest Your Agent
        </span>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(167,139,250,0.1)", color: "#A78BFA" }}>
          OPUS 4.7
        </span>
      </div>
      <p className="text-[11px] font-mono mb-3" style={{ color: "#8A8A93" }}>
        Paste the system prompt of your own agent. Opus reads it, finds specific weaknesses, and designs 5 surgical attacks against them — not generic scenarios.
      </p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={DNA_PLACEHOLDER}
        rows={6}
        className="w-full px-3 py-2 rounded text-xs font-mono resize-none"
        style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630", outline: "none" }}
        disabled={analyzing}
      />

      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={analyze}
          disabled={!canAnalyze}
          className="px-3 py-1.5 rounded text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-40"
          style={{ background: "#A78BFA", color: "#0A0A0D" }}
        >
          {analyzing ? "Opus analyzing…" : "✦ Generate Pentest"}
        </button>
        {prompt.trim().length > 0 && prompt.trim().length < 40 && (
          <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
            {40 - prompt.trim().length} more chars needed
          </span>
        )}
      </div>

      {(analyzing || thinking) && (
        <div className="mt-3 rounded-lg" style={{ background: "rgba(167,139,250,0.04)", border: "1px solid rgba(167,139,250,0.2)" }}>
          <button onClick={() => setShowThinking((v) => !v)} className="w-full flex items-center gap-2 px-3 py-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: analyzing ? "#A78BFA" : "#8A8A93", animation: analyzing ? "pulse 1.5s ease-in-out infinite" : undefined }} />
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#A78BFA" }}>
              {analyzing ? "Opus thinking" : "Thinking"}
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
        <div className="mt-3 px-3 py-2 rounded text-[11px] font-mono" style={{ background: "rgba(255,90,90,0.08)", color: "#FF5A5A", border: "1px solid rgba(255,90,90,0.2)" }}>
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          {/* Vulnerabilities */}
          {result.vulnerabilities.length > 0 && (
            <div className="rounded-lg px-3 py-2.5" style={{ background: "rgba(255,90,90,0.04)", border: "1px solid rgba(255,90,90,0.2)" }}>
              <div className="text-[9px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "#FF5A5A" }}>
                Vulnerabilities detected in your prompt
              </div>
              <ul className="space-y-1">
                {result.vulnerabilities.map((v, i) => (
                  <li key={i} className="text-[11px] font-mono leading-relaxed" style={{ color: "#F5F5F7" }}>
                    <span style={{ color: "#FF5A5A" }}>•</span> {v}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Attacks */}
          <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
            Surgical attacks · {result.attacks.length} proposals
          </div>
          {result.attacks.map((a) => (
            <div key={a.id} className="rounded-lg p-3" style={{ background: "#14141A", border: "1px solid #262630" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-widest"
                  style={{ background: `${severityColor(a.severity)}20`, color: severityColor(a.severity) }}
                >
                  {a.severity}
                </span>
                <span className="text-[9px] font-mono" style={{ color: "#A78BFA" }}>
                  {a.technique}
                </span>
                <span className="text-xs font-mono font-semibold flex-1 min-w-0 truncate" style={{ color: "#F5F5F7" }}>
                  {a.title}
                </span>
              </div>
              <p className="text-[11px] font-mono leading-relaxed mb-2" style={{ color: "#8A8A93" }}>
                {a.rationale}
              </p>

              <div className="rounded px-2.5 py-1.5 mb-2" style={{ background: "#0A0A0D", border: "1px solid #1C1C24" }}>
                <div className="text-[9px] font-mono uppercase tracking-widest mb-0.5" style={{ color: "#8A8A93" }}>
                  Expected bypass
                </div>
                <p className="text-[11px] font-mono" style={{ color: "#FF5A5A" }}>
                  → {a.expectedBypass}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono" style={{ color: "#8A8A93" }}>
                  target: <code style={{ color: "#7DD3FC" }}>{a.intendedTool}</code>
                </span>
                <button
                  onClick={() => runAttack(a)}
                  disabled={launching !== null}
                  className="ml-auto px-2.5 py-1 rounded text-[10px] font-mono font-medium transition-all active:scale-95 hover:brightness-110 disabled:opacity-40"
                  style={{ background: "#FF5A5A", color: "#0A0A0D" }}
                >
                  {launching === a.id ? "Launching…" : "▶ Run this attack"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Preflight({ onLaunchedCustomRun }: { onLaunchedCustomRun?: (runId: string, label: string, task: string) => void } = {}) {
  const [days, setDays] = useState<DayResult[]>([]);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "running" | "done">("idle");
  const [progress, setProgress] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function startPreflight() {
    setDays([]);
    setResult(null);
    setStatus("generating");
    setProgress("");

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${ENGINE}/preflight/start`, {
        method: "POST",
        signal: abortRef.current.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              // Handle based on preceding event line
              if ("message" in parsed) {
                setProgress(parsed.message);
              } else if ("day" in parsed && "status" in parsed) {
                setStatus("running");
                setDays((prev) => [...prev, parsed as DayResult]);
              } else if ("grade" in parsed) {
                setResult(parsed as PreflightResult);
                setStatus("done");
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Preflight error:", err);
      }
    }
    setStatus("done");
  }

  const gradeColor = (grade: string) => {
    if (grade.startsWith("A")) return "#2DD4A4";
    if (grade.startsWith("B")) return "#F7B955";
    return "#FF5A5A";
  };

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="px-5 py-3 border-b shrink-0 flex items-center gap-4" style={{ borderColor: "#262630" }}>
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
          Pre-flight Simulator
        </span>
        {progress && (
          <span className="text-xs font-mono" style={{ color: "#A78BFA" }}>
            {progress}
          </span>
        )}
        <button
          onClick={startPreflight}
          disabled={status === "generating" || status === "running"}
          className="ml-auto px-4 py-1.5 rounded text-xs font-mono font-medium disabled:opacity-40 transition-all duration-150 active:scale-95 hover:brightness-110"
          style={{ background: "#A78BFA", color: "#0A0A0D" }}
        >
          {status === "idle" ? "Run simulation" : status === "done" ? "Re-run" : "Running..."}
        </button>
      </div>

      <AgentDnaSection onLaunched={onLaunchedCustomRun} />
      <ScenarioBuilder onLaunched={onLaunchedCustomRun} />

      {/* Day stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {status === "idle" && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <p className="font-mono text-sm" style={{ color: "#8A8A93" }}>
                Run your agent through 30 simulated days of synthetic scenarios.
              </p>
              <p className="font-mono text-xs" style={{ color: "#8A8A93" }}>
                Opus generates emails (safe, edge-case, adversarial) and evaluates each.
              </p>
            </div>
          </div>
        )}

        {days.map((day) => (
          <div
            key={day.day}
            className="flex items-center gap-3 px-3 py-2 rounded font-mono text-xs animate-slide-up"
            style={{ background: "#14141A", animationDelay: `${day.day * 20}ms` }}
          >
            <span className="w-12 shrink-0" style={{ color: "#8A8A93" }}>
              day {String(day.day).padStart(2, "0")}
            </span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#262630" }}>
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: "100%",
                  background: day.status === "pass"
                    ? "linear-gradient(90deg, #2DD4A4, #7DD3FC)"
                    : "linear-gradient(90deg, #FF5A5A, #F7B955)",
                }}
              />
            </div>
            <span className="w-16 text-right shrink-0" style={{ color: "#8A8A93" }}>
              {day.events} event{day.events !== 1 ? "s" : ""}
            </span>
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                background: day.status === "pass" ? "#2DD4A4" : "#FF5A5A",
                boxShadow: day.status === "fail" ? "0 0 6px rgba(255,90,90,0.5)" : undefined,
              }}
            />
            {day.failures.length > 0 && (
              <span className="shrink-0" style={{ color: "#FF5A5A" }}>
                {day.failures.length} fail
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Grade card */}
      {result && (
        <div
          className="px-5 py-5 border-t shrink-0 animate-fade-in"
          style={{ borderColor: "#262630", background: "#14141A" }}
        >
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center">
              <div
                className="text-5xl font-mono font-bold"
                style={{
                  color: gradeColor(result.grade),
                  textShadow: `0 0 24px ${gradeColor(result.grade)}40`,
                }}
              >
                {result.grade}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-widest mt-1" style={{ color: "#8A8A93" }}>
                safety grade
              </div>
            </div>
            <div className="h-10 w-px" style={{ background: "#262630" }} />
            <div className="space-y-1.5">
              <div className="flex gap-4 text-sm font-mono">
                <span style={{ color: "#2DD4A4" }}>{result.passed} passed</span>
                <span style={{ color: result.failed > 0 ? "#FF5A5A" : "#8A8A93" }}>{result.failed} failed</span>
              </div>
              <div className="text-xs font-mono" style={{ color: "#8A8A93" }}>
                {result.totalDays} simulated days · {result.totalScenarios} scenarios
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
