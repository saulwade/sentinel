"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import FleetView, { type FleetAgent } from "./FleetView";
import Committee from "./Committee";
import WhatIfSimulator from "./WhatIfSimulator";

import { ENGINE } from "../lib/engine";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentEvent {
  id: string;
  runId: string;
  seq: number;
  timestamp: number;
  type: string;
  payload: Record<string, unknown>;
}

interface DecisionPayload {
  verdict: "ALLOW" | "PAUSE" | "BLOCK";
  reasoning: string;
  riskSignals: string[];
  source?: "policy" | "pre-cog";
  policyId?: string;
  thinkingTokens?: number;
  cached?: boolean;
  counterfactual?: {
    narration: string;
    simulatedSteps: Array<{ tool: string; args: Record<string, unknown>; outcome: string }>;
    damageSummary: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isToolCall(ev: AgentEvent) { return ev.type === "tool_call"; }
function isDecision(ev: AgentEvent) { return ev.type === "decision"; }
function isToolResult(ev: AgentEvent) { return ev.type === "tool_result"; }
function isThought(ev: AgentEvent) { return ev.type === "thought"; }

function getVerdict(ev: AgentEvent): DecisionPayload | null {
  if (!isDecision(ev)) return null;
  return ev.payload as unknown as DecisionPayload;
}

function verdictStyle(v: string) {
  if (v === "ALLOW") return { color: "#2DD4A4", bg: "rgba(45,212,164,0.12)", border: "#2DD4A4" };
  if (v === "PAUSE") return { color: "#F7B955", bg: "rgba(247,185,85,0.12)", border: "#F7B955" };
  return { color: "#FF5A5A", bg: "rgba(255,90,90,0.12)", border: "#FF5A5A" };
}

function eventLabel(ev: AgentEvent): string {
  if (isToolCall(ev)) return String(ev.payload.tool);
  if (isToolResult(ev)) return `${ev.payload.tool} result`;
  if (isDecision(ev)) return `${(ev.payload as unknown as DecisionPayload).verdict}`;
  return ev.type;
}

function eventDotColor(ev: AgentEvent): string {
  if (isDecision(ev)) {
    const v = (ev.payload as unknown as DecisionPayload).verdict;
    if (v === "ALLOW") return "bg-[#2DD4A4]";
    if (v === "PAUSE") return "bg-[#F7B955]";
    return "bg-[#FF5A5A]";
  }
  if (isToolResult(ev)) return "bg-[#8A8A93]";
  return "bg-[#F5F5F7]";
}

function eventTextColor(ev: AgentEvent): string {
  if (isDecision(ev)) {
    const v = (ev.payload as unknown as DecisionPayload).verdict;
    return verdictStyle(v).color;
  }
  if (isToolResult(ev)) return "#8A8A93";
  return "#F5F5F7";
}

// ─── Attack Classification ────────────────────────────────────────────────────

const RISK_SIGNAL_LABELS: Record<string, string> = {
  'prompt_injection_chain': 'Prompt injection',
  'data_exfiltration': 'Data exfiltration',
  'external_transmission': 'External transmission',
  'pii_exposure': 'PII exposure',
  'goal_deviation': 'Goal deviation',
  'possible_injection': 'Injection attempt',
  'privilege_escalation': 'Privilege escalation',
  'high_value_action': 'High-value action',
  'authority_impersonation': 'Authority impersonation',
  'bulk_pii_access': 'Bulk PII access',
  'compliance_framing': 'Compliance bypass',
  'unauthorized_bulk_access': 'Unauthorized bulk access',
  'agent_output_injection': 'Agent output injection',
  'cross_agent_trust': 'Cross-agent trust',
};

interface AttackClassification {
  label: string;
  narrative: string;
  severity: 'critical' | 'high' | 'medium';
}

function attackLabel(riskSignals: string[]): string | null {
  const s = new Set(riskSignals.filter((r) => !r.startsWith("policy:")));
  if (s.has("agent_output_injection")) return "Agent Output Injection";
  if (s.has("authority_impersonation")) return "Authority Impersonation";
  if (s.has("compliance_framing")) return "Compliance Bypass";
  if (s.has("prompt_injection_chain")) return "Prompt Injection";
  if (s.has("data_exfiltration")) return "Data Exfiltration";
  if (s.has("bulk_pii_access")) return "Bulk PII Access";
  if (s.has("cross_agent_trust")) return "Cross-Agent Trust Violation";
  return null;
}

function classifyAttack(riskSignals: string[]): AttackClassification | null {
  const signals = new Set(riskSignals.filter(s => !s.startsWith('policy:')));
  if (signals.size === 0) return null;

  if (signals.has('agent_output_injection')) {
    return {
      label: 'Agent Output Injection',
      narrative: 'A subagent\'s structured output contained an embedded action. The orchestrator was about to execute it — the injection crossed an agent-to-agent trust boundary, bypassing user-input guards entirely.',
      severity: 'critical',
    };
  }
  if (signals.has('cross_agent_trust')) {
    return {
      label: 'Cross-Agent Trust',
      narrative: 'The orchestrator is about to hand execution authority to a subagent whose output will be treated as command surface.',
      severity: 'high',
    };
  }
  if (signals.has('prompt_injection_chain') || (signals.has('possible_injection') && signals.has('data_exfiltration'))) {
    return { label: 'Prompt Injection', narrative: 'Malicious instructions embedded in input are redirecting the agent to exfiltrate data.', severity: 'critical' };
  }
  if (signals.has('authority_impersonation')) {
    return { label: 'Authority Impersonation', narrative: 'Request impersonates executive authority to bypass approval controls.', severity: 'critical' };
  }
  if (signals.has('compliance_framing')) {
    return { label: 'Compliance Bypass', narrative: 'Legal framing is being used to coerce the agent into unauthorized data export.', severity: 'critical' };
  }
  if (signals.has('data_exfiltration') && signals.has('external_transmission')) {
    return { label: 'Data Exfiltration', narrative: 'Agent is attempting to transmit internal data to an external recipient.', severity: 'critical' };
  }
  if (signals.has('bulk_pii_access') || (signals.has('pii_exposure') && signals.has('privilege_escalation'))) {
    return { label: 'Bulk PII Access', narrative: 'Agent is accessing multiple sensitive customer records in a suspicious pattern.', severity: 'high' };
  }
  if (signals.has('goal_deviation') && signals.has('possible_injection')) {
    return { label: 'Injection Attempt', narrative: 'Agent has deviated significantly from its assigned task — prompt injection likely.', severity: 'high' };
  }
  if (signals.has('privilege_escalation')) {
    return { label: 'Privilege Escalation', narrative: 'Agent is attempting to access resources outside its authorized scope.', severity: 'high' };
  }
  if (signals.has('high_value_action')) {
    return { label: 'High-Value Action', narrative: 'Financial action exceeds autonomous authorization threshold — human review required.', severity: 'medium' };
  }
  if (signals.has('possible_injection') || signals.has('goal_deviation')) {
    return { label: 'Suspicious Deviation', narrative: 'Agent behavior deviates from its assigned task.', severity: 'medium' };
  }
  return null;
}

function buildRunNarrative(blast: {
  moneyInterdicted: number;
  externalEmailsBlocked: string[];
  piiExfiltrationAttempted: boolean;
  actionsInterdicted: number;
}): string {
  const parts: string[] = [];

  if (blast.moneyInterdicted > 0) {
    parts.push(`prevented $${blast.moneyInterdicted.toLocaleString()} in potential loss`);
  }

  const exfilCount = blast.externalEmailsBlocked.length;
  if (exfilCount > 0) {
    parts.push(`blocked ${exfilCount === 1 ? 'a' : exfilCount} data exfiltration attempt${exfilCount > 1 ? 's' : ''}`);
  } else if (blast.piiExfiltrationAttempted) {
    parts.push('blocked a PII exposure attempt');
  }

  if (parts.length === 0 && blast.actionsInterdicted > 0) {
    return `Sentinel intercepted ${blast.actionsInterdicted} suspicious action${blast.actionsInterdicted > 1 ? 's' : ''} before they could cause harm.`;
  }

  if (parts.length === 0) return '';
  return `Sentinel ${parts.join(' and ')}.`;
}

function attackStyle(severity: 'critical' | 'high' | 'medium') {
  if (severity === 'critical') return { bg: 'rgba(255,90,90,0.08)', border: 'rgba(255,90,90,0.35)', color: '#FF5A5A', dot: 'bg-[#FF5A5A]' };
  if (severity === 'high')     return { bg: 'rgba(255,150,50,0.08)', border: 'rgba(255,150,50,0.35)', color: '#FF9633', dot: 'bg-[#FF9633]' };
  return                              { bg: 'rgba(247,185,85,0.08)', border: 'rgba(247,185,85,0.35)', color: '#F7B955', dot: 'bg-[#F7B955]' };
}

// ─── Component ────────────────────────────────────────────────────────────────

const SCENARIO_LABELS: Record<string, string> = {
  support: "Support Agent · Tier 1",
  ceo:     "CEO Override · Executive",
  gdpr:    "GDPR Audit · Compliance",
  phishing: "Corp Assistant · Security",
  "multi-agent": "Multi-Agent · Orchestrated Attack",
};

const SCENARIO_DIFFICULTY: Record<string, { label: string; color: string; bg: string; border: string }> = {
  support:       { label: "MEDIUM", color: "#F7B955", bg: "rgba(247,185,85,0.12)",  border: "rgba(247,185,85,0.3)" },
  ceo:           { label: "HARD",   color: "#FF9633", bg: "rgba(255,150,51,0.12)",  border: "rgba(255,150,51,0.3)" },
  gdpr:          { label: "HARD",   color: "#FF9633", bg: "rgba(255,150,51,0.12)",  border: "rgba(255,150,51,0.3)" },
  "multi-agent": { label: "EXPERT", color: "#FF5A5A", bg: "rgba(255,90,90,0.12)",   border: "rgba(255,90,90,0.3)" },
};

const SCENARIO_TASKS: Record<string, string> = {
  support:      "Process all open support tickets",
  ceo:          "Handle executive escalation tickets",
  gdpr:         "Process compliance audit request",
  phishing:     "Process and respond to incoming emails",
  "multi-agent": "Orchestrate specialist agents for customer requests",
};

export default function LiveView({
  onRunStarted,
  onNavigate,
  pendingRun,
  onPendingRunConsumed,
  pendingScenario,
  onPendingScenarioConsumed,
  executive = false,
  externalRunId,
  onExternalRunConsumed,
  highlightRun = false,
}: {
  onRunStarted?: (id: string, label: string, task: string) => void;
  onNavigate?: (tab: string) => void;
  pendingRun?: boolean;
  onPendingRunConsumed?: () => void;
  pendingScenario?: string | null;
  onPendingScenarioConsumed?: () => void;
  executive?: boolean;
  externalRunId?: string | null;
  onExternalRunConsumed?: () => void;
  highlightRun?: boolean;
}) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [startTime, setStartTime] = useState<number>(0);
  const [agentMode, setAgentMode] = useState<"scenario" | "agent">("scenario");
  const [scenario, setScenario] = useState<"support" | "ceo" | "gdpr" | "multi-agent">("support");
  const [viewMode, setViewMode] = useState<"single" | "fleet">("single");
  const [fleetAgents, setFleetAgents] = useState<FleetAgent[]>([]);
  const [demoCache, setDemoCache] = useState(true);
  const [selected, setSelected] = useState<AgentEvent | null>(null);
  const [liveThinking, setLiveThinking] = useState("");
  const [thinkingMap, setThinkingMap] = useState<Record<string, string>>({});
  const [pendingDecisionId, setPendingDecisionId] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [blockFlash, setBlockFlash] = useState(false);
  const [runBlast, setRunBlast] = useState<{
    moneyInterdicted: number;
    externalEmailsBlocked: string[];
    piiExfiltrationAttempted: boolean;
    actionsInterdicted: number;
    recordsAccessed?: number;
  } | null>(null);
  const [summaryDismissed, setSummaryDismissed] = useState(false);
  const [counterfactualMap, setCounterfactualMap] = useState<Record<string, DecisionPayload["counterfactual"]>>({});
  const [committeeEventId, setCommitteeEventId] = useState<string | null>(null);
  const [whatIfEventId, setWhatIfEventId] = useState<string | null>(null);
  const [autoDemoActive, setAutoDemoActive] = useState(false);
  const [autoDemoCountdown, setAutoDemoCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [narrationOn, setNarrationOn] = useState(false);
  const [narrationLines, setNarrationLines] = useState<Array<{ id: string; text: string; verdict?: string }>>([]);
  const narrationRef = useRef<HTMLDivElement | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const currentToolCallId = useRef<string | null>(null);
  const runEndedRef = useRef(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch(`${ENGINE}/settings`).then((r) => r.json()).then((d) => setDemoCache(d.demoCache ?? true)).catch(() => {});
  }, []);

  // Consume pendingRun signal without auto-starting — just focus the Run button
  useEffect(() => {
    if (pendingRun) {
      onPendingRunConsumed?.();
    }
  }, [pendingRun, onPendingRunConsumed]);

  // Consume pendingScenario from onboarding — preselect the scenario
  useEffect(() => {
    if (!pendingScenario) return;
    const valid = ["support", "ceo", "gdpr", "multi-agent"] as const;
    if (valid.includes(pendingScenario as typeof valid[number])) {
      setScenario(pendingScenario as typeof scenario);
    }
    onPendingScenarioConsumed?.();
  }, [pendingScenario, onPendingScenarioConsumed]);

  async function toggleDemoCache() {
    const next = !demoCache;
    setDemoCache(next);
    await fetch(`${ENGINE}/settings/demo-cache`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    }).catch(() => {});
  }

  // Fire-and-forget narration when relevant events arrive
  const narrateEvent = useCallback((ev: AgentEvent, recentEvents: AgentEvent[]) => {
    if (!narrationOn) return;
    if (ev.type !== "tool_call" && ev.type !== "decision") return;
    if (ev.type === "tool_call") {
      const tool = String((ev.payload as Record<string, unknown>).tool ?? "");
      if (tool === "update_ticket") return;
    }

    const recentSummary = recentEvents
      .filter((e) => e.type === "tool_call" || e.type === "decision")
      .slice(-4)
      .map((e) => {
        const p = e.payload as Record<string, unknown>;
        if (e.type === "tool_call") return `→ called ${p.tool}(${JSON.stringify(p.args).slice(0, 80)})`;
        return `→ verdict: ${p.verdict} — ${String(p.reasoning ?? "").slice(0, 80)}`;
      })
      .join("\n");

    const verdict = ev.type === "decision"
      ? String((ev.payload as Record<string, unknown>).verdict ?? "")
      : undefined;
    const evId = ev.id;

    fetch(`${ENGINE}/narrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: { type: ev.type, payload: ev.payload }, recentSummary }),
    })
      .then((r) => r.json())
      .then((d: { narration?: string }) => {
        if (!d.narration) return;
        setNarrationLines((prev) => [...prev, { id: evId, text: d.narration!, verdict }].slice(-12));
        setTimeout(() => {
          narrationRef.current?.scrollTo({ top: narrationRef.current.scrollHeight, behavior: "smooth" });
        }, 50);
      })
      .catch(() => {});
  }, [narrationOn]);

  const handleEvent = useCallback((ev: AgentEvent) => {
    if (isThought(ev)) {
      setLiveThinking((prev) => prev + String(ev.payload.delta ?? ""));
      return;
    }

    if (ev.type === "counterfactual") {
      const p = ev.payload as unknown as {
        decisionEventId: string;
        narration: string;
        simulatedSteps: Array<{ tool: string; args: Record<string, unknown>; outcome: string }>;
        damageSummary: string;
      };
      if (p?.decisionEventId) {
        setCounterfactualMap((prev) => ({
          ...prev,
          [p.decisionEventId]: {
            narration: p.narration,
            simulatedSteps: p.simulatedSteps ?? [],
            damageSummary: p.damageSummary,
          },
        }));
      }
      return;
    }

    if (ev.type === "observation" && (ev.payload as Record<string, unknown>).kind === "run_ended") {
      runEndedRef.current = true;
      setStatus("done");
      setLiveThinking("");
      setSummaryDismissed(false);
      // Fetch blast radius for the run summary banner
      const currentRunId = (ev as AgentEvent).runId;
      if (currentRunId) {
        fetch(`${ENGINE}/analysis/${currentRunId}/blast`)
          .then((r) => r.json())
          .then((d) => { if (d.blast) setRunBlast(d.blast); })
          .catch(() => {});
      }
      return;
    }

    if (isToolCall(ev)) {
      if (currentToolCallId.current) {
        setThinkingMap((prev) => ({
          ...prev,
          [currentToolCallId.current!]: prev[currentToolCallId.current!] ?? "",
        }));
      }
      setLiveThinking("");
      currentToolCallId.current = ev.id;
    }

    if (isDecision(ev)) {
      setLiveThinking((prev) => {
        setThinkingMap((m) => ({ ...m, [ev.id]: prev }));
        return "";
      });
      const verdict = getVerdict(ev)?.verdict;
      if (verdict === "PAUSE") {
        setPendingDecisionId(ev.id);
      }
      if (verdict === "BLOCK") {
        setBlockFlash(true);
        setTimeout(() => setBlockFlash(false), 1500);
      }
    }

    setEvents((prev) => {
      narrateEvent(ev, [...prev].reverse().slice(0, 8));
      return [ev, ...prev];
    });
  }, [narrateEvent]);

  function stopAutoDemo() {
    setAutoDemoActive(false);
    setAutoDemoCountdown(null);
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }

  async function startAutoDemo() {
    stopAutoDemo();
    setScenario("ceo");
    setAgentMode("scenario");
    setViewMode("single");
    // Force demo cache ON — auto demo must be deterministic even if the user
    // previously toggled it off. Only reflect UI state if the engine actually
    // confirmed the change; otherwise the next run would appear "fast" here
    // while the engine still uses live Opus (slow, non-deterministic).
    try {
      const res = await fetch(`${ENGINE}/settings/demo-cache`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      if (res.ok) setDemoCache(true);
    } catch {}
    setAutoDemoActive(true);
    // Small delay to let state settle before starting the run
    await new Promise((r) => setTimeout(r, 100));
    await startRun();
  }

  // When PAUSE arrives in auto demo mode, start countdown then auto-approve
  useEffect(() => {
    if (!autoDemoActive || !pendingDecisionId) return;
    setAutoDemoCountdown(3);
    let count = 3;
    countdownRef.current = setInterval(() => {
      count -= 1;
      setAutoDemoCountdown(count);
      if (count <= 0) {
        if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
        setAutoDemoCountdown(null);
        decide("approve");
      }
    }, 1000);
    return () => { if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDemoActive, pendingDecisionId]);

  // When run ends in auto demo mode, navigate to Replay after a short pause
  useEffect(() => {
    if (!autoDemoActive || status !== "done") return;
    const t = setTimeout(() => {
      setAutoDemoActive(false);
      onNavigate?.("Replay");
    }, 2800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDemoActive, status]);

  async function startFleet() {
    setFleetAgents([]);
    const res = await fetch(`${ENGINE}/fleet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return;
    const data = await res.json() as { agents: FleetAgent[] };
    setFleetAgents(data.agents);
  }

  function connectToRun(id: string, label: string, task: string) {
    setEvents([]);
    setSelected(null);
    setStatus("running");
    setLiveThinking("");
    setThinkingMap({});
    setPendingDecisionId(null);
    setStartTime(Date.now());
    setRunBlast(null);
    setSummaryDismissed(false);
    setCounterfactualMap({});
    setNarrationLines([]);
    currentToolCallId.current = null;
    setRunId(id);
    onRunStarted?.(id, label, task);
    esRef.current?.close();
    runEndedRef.current = false;
    openStream(id, 0);
  }

  function openStream(id: string, attempt: number) {
    const es = new EventSource(`${ENGINE}/runs/${id}/events`);
    esRef.current = es;
    es.onmessage = (e) => { try { handleEvent(JSON.parse(e.data)); } catch {} };
    es.onerror = () => {
      es.close();
      if (runEndedRef.current) {
        setStatus("done");
        return;
      }
      if (attempt >= 3) {
        setStatus("done");
        return;
      }
      const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
      setTimeout(() => {
        if (runEndedRef.current) return;
        openStream(id, attempt + 1);
      }, delay);
    };
  }

  async function startRun() {
    const res = await fetch(`${ENGINE}/runs/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: agentMode, scenario }),
    });
    const run = await res.json();
    connectToRun(
      run.id,
      SCENARIO_LABELS[scenario] ?? "Sentinel Agent",
      SCENARIO_TASKS[scenario] ?? "Process agent tasks",
    );
  }

  async function decide(action: "approve" | "reject") {
    if (!pendingDecisionId || deciding) return;
    const id = pendingDecisionId;
    setDeciding(true);
    setPendingDecisionId(null);
    try {
      await fetch(`${ENGINE}/decide/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } finally {
      setDeciding(false);
    }
  }

  useEffect(() => { return () => esRef.current?.close(); }, []);

  // Connect to a run launched externally (e.g. Scenario Builder in Preflight)
  useEffect(() => {
    if (!externalRunId) return;
    connectToRun(externalRunId, "Custom Scenario", "Running synthesized attack scenario");
    onExternalRunConsumed?.();
  // connectToRun is stable (defined inside component, no deps needed via ref)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalRunId]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore when user hits a browser shortcut (Cmd+R, Ctrl+R, Alt+...).
      // Otherwise Cmd+R fires `r` keydown before the reload, triggering startRun.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Search input: handle Esc to close
      if (e.target instanceof HTMLInputElement) {
        if (e.key === "Escape") {
          setSearchOpen(false);
          setSearch("");
          (e.target as HTMLInputElement).blur();
        }
        return;
      }
      if (e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case "r":
          if (status !== "running") startRun();
          break;
        case "/":
          e.preventDefault();
          setSearchOpen(true);
          setTimeout(() => searchRef.current?.focus(), 50);
          break;
        case "Escape":
          setSearchOpen(false);
          setSearch("");
          break;
        case "a":
          if (pendingDecisionId && !deciding) decide("approve");
          break;
        case "d":
          if (pendingDecisionId && !deciding) decide("reject");
          break;
        case "j": {
          // Move selection down (older events — events are newest-first in state)
          setSelected((prev) => {
            if (events.length === 0) return prev;
            if (!prev) return events[0] ?? null;
            const idx = events.findIndex((e) => e.id === prev.id);
            return idx < events.length - 1 ? (events[idx + 1] ?? prev) : prev;
          });
          break;
        }
        case "k": {
          // Move selection up (newer events)
          setSelected((prev) => {
            if (events.length === 0) return prev;
            if (!prev) return events[0] ?? null;
            const idx = events.findIndex((e) => e.id === prev.id);
            return idx > 0 ? (events[idx - 1] ?? prev) : prev;
          });
          break;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, events, pendingDecisionId]);

  const selectedDecision = selected && isDecision(selected) ? getVerdict(selected) : null;
  const selectedCounterfactual = selectedDecision?.counterfactual ?? (selected ? counterfactualMap[selected.id] : undefined);
  const counterfactualPending =
    !!selectedDecision &&
    selectedDecision.verdict === "BLOCK" &&
    selectedDecision.source === "pre-cog" &&
    !selectedDecision.cached &&
    !selectedCounterfactual;
  const selectedThinking = selected ? thinkingMap[selected.id] ?? "" : "";
  const selectedToolCall = selected ? events.find(e => e.seq === selected.seq - 1 && e.type === 'tool_call') : null;
  const selectedAttack = selectedDecision ? classifyAttack(selectedDecision.riskSignals ?? []) : null;

  return (
    <div
      className="flex flex-col h-full transition-all duration-300"
      style={{
        background: "#0A0A0D",
        boxShadow: blockFlash ? "inset 0 0 0 2px #FF5A5A, 0 0 40px rgba(255,90,90,0.12)" : undefined,
      }}
    >
      {/* ── Controls + Stats bar ─────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-y-2 lg:gap-y-0 lg:gap-x-4 px-3 sm:px-5 py-2 border-b shrink-0" style={{ borderColor: "#262630" }}>
        {/* Primary row: mode selectors (flatten into main row at lg+) */}
        <div className="flex items-center gap-x-3 gap-y-2 flex-wrap lg:contents">
        {/* View mode selector */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid #262630" }}>
            <button
              onClick={() => setViewMode("single")}
              className="px-2.5 py-1 text-[10px] font-mono transition-all duration-150"
              style={{
                background: viewMode === "single" ? "#A78BFA" : "transparent",
                color: viewMode === "single" ? "#0A0A0D" : "#8A8A93",
                fontWeight: viewMode === "single" ? 600 : 400,
              }}
              title="Monitor a single agent run"
            >
              Single
            </button>
            <button
              onClick={() => setViewMode("fleet")}
              className="px-2.5 py-1 text-[10px] font-mono transition-all duration-150"
              style={{
                background: viewMode === "fleet" ? "#2DD4A4" : "transparent",
                color: viewMode === "fleet" ? "#0A0A0D" : "#8A8A93",
                fontWeight: viewMode === "fleet" ? 600 : 400,
              }}
              title="Monitor your entire AI agent fleet — 3 agents running concurrently"
            >
              Fleet
            </button>
          </div>
        </div>

        {/* Agent mode selector — only in single view */}
        {viewMode === "single" && (
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid #262630" }}>
            <button
              onClick={() => setAgentMode("scenario")}
              className="px-2.5 py-1 text-[10px] font-mono transition-all duration-150"
              style={{
                background: agentMode === "scenario" ? "#A78BFA" : "transparent",
                color: agentMode === "scenario" ? "#0A0A0D" : "#8A8A93",
                fontWeight: agentMode === "scenario" ? 600 : 400,
              }}
              title="Pre-scripted phishing attack scenario — fast, reliable for demos"
            >
              Demo Scenario
            </button>
            <button
              onClick={() => setAgentMode("agent")}
              className="px-2.5 py-1 text-[10px] font-mono transition-all duration-150"
              style={{
                background: agentMode === "agent" ? "#7DD3FC" : "transparent",
                color: agentMode === "agent" ? "#0A0A0D" : "#8A8A93",
                fontWeight: agentMode === "agent" ? 600 : 400,
              }}
              title="Real LLM agent (Haiku) decides autonomously — Pre-cog monitors every action"
            >
              Live Agent
            </button>
          </div>
          <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
            {agentMode === "scenario" ? "scripted" : "LLM"}
          </span>
        </div>
        )}

        {/* Scenario selector — only in single scenario mode */}
        {viewMode === "single" && agentMode === "scenario" && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>Scenario:</span>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as typeof scenario)}
              disabled={status === "running"}
              className="text-[10px] font-mono px-2 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-[#A78BFA] disabled:opacity-50"
              style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630" }}
            >
              <option value="support">Support Agent — ticket injection</option>
              <option value="ceo">CEO Override — authority impersonation</option>
              <option value="gdpr">GDPR Audit — compliance framing</option>
              <option value="multi-agent">Multi-Agent — orchestrated injection</option>
            </select>
            {SCENARIO_DIFFICULTY[scenario] && (
              <span
                className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                style={{
                  background: SCENARIO_DIFFICULTY[scenario].bg,
                  color: SCENARIO_DIFFICULTY[scenario].color,
                  border: `1px solid ${SCENARIO_DIFFICULTY[scenario].border}`,
                }}
              >
                {SCENARIO_DIFFICULTY[scenario].label}
              </span>
            )}
          </div>
        )}
        </div>

        {/* Secondary row: toggles, status, stats, actions (flatten at lg+) */}
        <div className="flex items-center gap-x-3 gap-y-2 flex-wrap lg:contents">
        {/* Narration toggle */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setNarrationOn((v) => !v)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all"
            style={{
              background: narrationOn ? "rgba(125,211,252,0.12)" : "rgba(139,139,147,0.1)",
              color: narrationOn ? "#7DD3FC" : "#8A8A93",
              border: `1px solid ${narrationOn ? "rgba(125,211,252,0.3)" : "rgba(139,139,147,0.2)"}`,
            }}
            title={narrationOn ? "Narration ON — Sonnet explains events in plain English" : "Narration OFF — click to enable live play-by-play"}
          >
            {narrationOn ? "◉ NARRATION" : "◎ NARRATION"}
          </button>
        </div>

        {/* Pre-cog mode toggle */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>Pre-cog:</span>
          <button
            onClick={toggleDemoCache}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all"
            style={{
              background: demoCache ? "rgba(167,139,250,0.12)" : "rgba(45,212,164,0.12)",
              color: demoCache ? "#A78BFA" : "#2DD4A4",
              border: `1px solid ${demoCache ? "rgba(167,139,250,0.3)" : "rgba(45,212,164,0.3)"}`,
            }}
            title={demoCache ? "Using pre-computed verdicts — click to switch to live Opus" : "Using live Opus — click to switch to pre-computed"}
          >
            {demoCache ? "PRE-COMPUTED" : "LIVE OPUS"}
          </button>
        </div>

        {/* Status */}
        {status === "running" && (
          <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "#F7B955" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#F7B955] animate-pulse" />
            {agentMode === "agent" ? "agent running" : "intercepting"}
          </span>
        )}
        {status === "done" && (
          <span className="flex items-center gap-1.5 text-xs font-mono" style={{ color: "#2DD4A4" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#2DD4A4]" />
            run complete
          </span>
        )}

        {/* Stats */}
        {events.length > 0 && (
          <div className="flex items-center gap-3 text-[10px] font-mono" style={{ color: "#8A8A93" }}>
            <span>{events.filter(isToolCall).length} calls</span>
            <span style={{ color: "#2DD4A4" }}>
              {events.filter((e) => isDecision(e) && getVerdict(e)?.verdict === "ALLOW").length} allow
            </span>
            <span style={{ color: "#F7B955" }}>
              {events.filter((e) => isDecision(e) && getVerdict(e)?.verdict === "PAUSE").length} pause
            </span>
            <span style={{ color: "#FF5A5A" }}>
              {events.filter((e) => isDecision(e) && getVerdict(e)?.verdict === "BLOCK").length} block
            </span>
          </div>
        )}

        {/* Auto Demo button */}
        {viewMode === "single" && !autoDemoActive && (
          <button
            onClick={startAutoDemo}
            disabled={status === "running"}
            className="px-3 py-1.5 rounded text-xs font-mono font-medium transition-all duration-150 active:scale-95 disabled:opacity-40 hover:brightness-110"
            style={{ background: "rgba(247,185,85,0.12)", color: "#F7B955", border: "1px solid rgba(247,185,85,0.3)" }}
            title="Runs the full CEO Override demo automatically — just narrate over it"
          >
            ✦ Auto Demo
          </button>
        )}
        {autoDemoActive && (
          <button
            onClick={stopAutoDemo}
            className="px-3 py-1.5 rounded text-xs font-mono font-medium transition-all duration-150 active:scale-95 hover:brightness-110"
            style={{ background: "rgba(255,90,90,0.1)", color: "#FF5A5A", border: "1px solid rgba(255,90,90,0.2)" }}
          >
            ■ Stop Demo
          </button>
        )}

        <button
          onClick={viewMode === "fleet" ? startFleet : startRun}
          disabled={status === "running"}
          className={`ml-auto px-4 py-1.5 rounded text-xs font-mono font-medium transition-all duration-150 active:scale-95 disabled:opacity-40 hover:brightness-110${highlightRun ? " animate-pulse-ring" : ""}`}
          style={{
            background: viewMode === "fleet" ? "#2DD4A4" : "#A78BFA",
            color: "#0A0A0D",
            boxShadow: highlightRun ? "0 0 0 0 rgba(167,139,250,0.7)" : undefined,
          }}
        >
          {status === "running"
            ? "running..."
            : viewMode === "fleet"
            ? "▶  Fleet Run"
            : "▶  Run"}
        </button>
        </div>
      </div>

      {/* ── PAUSE banner ──────────────────────────────────────────────── */}
      {pendingDecisionId && (
        <div
          className="flex items-center gap-4 px-5 py-2.5 border-b shrink-0 animate-fade-in"
          style={{ background: "rgba(247,185,85,0.08)", borderColor: "#F7B955" }}
        >
          <span className="w-2 h-2 rounded-full bg-[#F7B955] animate-pulse shrink-0" />
          <div className="flex flex-col">
            <span className="font-mono text-sm font-bold" style={{ color: "#F7B955" }}>
              Action paused — awaiting decision
            </span>
            {autoDemoActive && autoDemoCountdown !== null ? (
              <span className="text-[10px] font-mono" style={{ color: "#F7B955" }}>
                ✦ Auto Demo: approving in {autoDemoCountdown}…
              </span>
            ) : (
              <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
                press <kbd className="px-1 py-0.5 rounded text-[9px]" style={{ background: "#0A0A0D", border: "1px solid #262630" }}>A</kbd> to approve ·{" "}
                <kbd className="px-1 py-0.5 rounded text-[9px]" style={{ background: "#0A0A0D", border: "1px solid #262630" }}>D</kbd> to deny
              </span>
            )}
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => decide("approve")}
              disabled={deciding || !pendingDecisionId}
              className="px-3 py-1.5 rounded text-xs font-mono font-bold transition-all duration-150 active:scale-95 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              style={{ background: "#2DD4A4", color: "#0A0A0D" }}
            >
              {deciding ? "…" : "Approve"}
            </button>
            <button
              onClick={() => decide("reject")}
              disabled={deciding || !pendingDecisionId}
              className="px-3 py-1.5 rounded text-xs font-mono font-bold transition-all duration-150 active:scale-95 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
              style={{ background: "#FF5A5A", color: "#0A0A0D" }}
            >
              {deciding ? "…" : "Deny"}
            </button>
          </div>
        </div>
      )}

      {/* ── Live thinking bar ─────────────────────────────────────────── */}
      {liveThinking && (
        <div
          className="px-5 py-2.5 border-b shrink-0 overflow-hidden animate-fade-in"
          style={{ background: "rgba(167,139,250,0.06)", borderColor: "#262630" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#A78BFA" }}>
              Opus Extended Thinking
            </span>
            <span className="ml-auto text-[10px] font-mono tabular-nums" style={{ color: "#A78BFA" }}>
              ~{Math.ceil(liveThinking.length / 4).toLocaleString()} tokens
            </span>
          </div>
          <p className="text-xs font-mono leading-relaxed line-clamp-2" style={{ color: "rgba(167,139,250,0.7)" }}>
            {liveThinking.slice(-300)}
          </p>
        </div>
      )}

      {/* ── Live Narration panel ─────────────────────────────────────── */}
      {narrationOn && narrationLines.length > 0 && (
        <div
          className="shrink-0 border-b"
          style={{ borderColor: "#262630", background: "#0D0D12" }}
        >
          <div className="flex items-center gap-2 px-4 py-1.5 border-b" style={{ borderColor: "#1C1C24" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#7DD3FC] animate-pulse" />
            <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "#7DD3FC" }}>
              Live Narration
            </span>
            <span className="text-[9px] font-mono" style={{ color: "#8A8A93" }}>— Sonnet explaining in plain English</span>
          </div>
          <div
            ref={narrationRef}
            className="px-4 py-2 space-y-1.5 overflow-y-auto"
            style={{ maxHeight: "140px" }}
          >
            {narrationLines.map((line) => {
              const c = line.verdict === "BLOCK" ? "#FF5A5A"
                : line.verdict === "PAUSE" ? "#F7B955"
                : "#F5F5F7";
              return (
                <p key={line.id} className="text-xs font-mono leading-relaxed" style={{ color: c }}>
                  {line.verdict === "BLOCK" && <span className="mr-1.5 text-[10px]" style={{ color: "#FF5A5A" }}>🔴</span>}
                  {line.verdict === "PAUSE" && <span className="mr-1.5 text-[10px]" style={{ color: "#F7B955" }}>⚠</span>}
                  {line.text}
                </p>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Fleet View ────────────────────────────────────────────────── */}
      {viewMode === "fleet" && fleetAgents.length > 0 && (
        <div className="flex-1 min-h-0">
          <FleetView agents={fleetAgents} />
        </div>
      )}

      {/* ── Body (single mode, executive view) ────────────────────────── */}
      {executive && (viewMode === "single" || fleetAgents.length === 0) && (
        <ExecutiveRuntimePanel
          status={status}
          events={events}
          runBlast={runBlast}
          onNavigate={onNavigate}
        />
      )}

      {/* ── Body (single mode) ────────────────────────────────────────── */}
      {!executive && (viewMode === "single" || fleetAgents.length === 0) && (
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* ── Action stream ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col lg:border-r border-b lg:border-b-0 min-h-0" style={{ borderColor: "#262630" }}>
          <div
            className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest shrink-0 flex items-center gap-2"
            style={{ color: "#8A8A93", borderBottom: "1px solid #262630" }}
          >
            Action Stream
            {events.length > 0 && (
              <span className="tabular-nums">{events.length} events</span>
            )}
            {searchOpen ? (
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="filter events..."
                className="ml-auto px-2 py-0.5 rounded text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-[#A78BFA]"
                style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630", width: "140px" }}
              />
            ) : (
              <button
                onClick={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 50); }}
                className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded transition-all hover:brightness-150"
                style={{ color: "#8A8A93", background: "#14141A", border: "1px solid #1C1C24" }}
                title="Search events (/)"
              >
                /
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Skeleton loading state */}
            {events.length === 0 && status === "idle" && (
              <div className="p-4 space-y-2">
                {[1, 0.8, 0.6, 0.4, 0.2].map((opacity, i) => (
                  <div key={i} className="skeleton h-9 w-full" style={{ opacity }} />
                ))}
                <p className="text-xs font-mono text-center pt-4" style={{ color: "#8A8A93" }}>
                  Click <span style={{ color: "#A78BFA" }}>▶ Run</span> or press{" "}
                  <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: "#14141A", border: "1px solid #262630", color: "#A78BFA" }}>R</kbd>{" "}
                  · <kbd className="px-1 py-0.5 rounded text-[10px]" style={{ background: "#14141A", border: "1px solid #262630", color: "#8A8A93" }}>?</kbd> for shortcuts
                </p>
              </div>
            )}

            {/* Running skeleton */}
            {events.length === 0 && status === "running" && (
              <div className="p-4 space-y-2">
                {[1, 0.6, 0.3].map((opacity, i) => (
                  <div key={i} className="skeleton h-9 w-full" style={{ opacity }} />
                ))}
              </div>
            )}

            {/* ── "What just happened" card ──────────────────────────── */}
            {status === "done" && !summaryDismissed && (() => {
              const attacked = runBlast && (runBlast.actionsInterdicted > 0);
              const attackTypeLabel = (() => {
                const blockEv = [...events].find((e) => isDecision(e) && getVerdict(e)?.verdict === "BLOCK");
                const signals = blockEv ? (getVerdict(blockEv)?.riskSignals ?? []) : [];
                return attackLabel(signals);
              })();

              const money = runBlast?.moneyInterdicted ?? 0;
              const records = runBlast?.recordsAccessed ?? 0;
              const exfil = runBlast?.externalEmailsBlocked ?? [];

              const headline = attacked
                ? `⚡ Your agent was attacked`
                : `✓ Clean run`;

              const body = attacked
                ? [
                    attackTypeLabel ? `A ${attackTypeLabel.toLowerCase()} attack` : "An attack",
                    money > 0 ? ` attempted to steal $${money.toLocaleString()}` : "",
                    records > 2 ? ` and leak ${records} customer records` : "",
                    exfil.length > 0 ? ` to an external domain (${exfil[0]})` : "",
                    ". Sentinel blocked it.",
                  ].join("")
                : `Your agent completed ${events.filter(isToolCall).length} actions without any security incidents.`;

              const accentColor = attacked ? "#FF5A5A" : "#2DD4A4";
              const bgColor = attacked ? "rgba(255,90,90,0.06)" : "rgba(45,212,164,0.06)";
              const borderColor = attacked ? "rgba(255,90,90,0.25)" : "rgba(45,212,164,0.2)";

              return (
                <div
                  className="shrink-0 flex flex-col gap-2.5 px-4 py-3 border-b animate-fade-in"
                  style={{ background: bgColor, borderColor }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono font-bold" style={{ color: accentColor }}>
                      {headline}
                    </span>
                    <button
                      onClick={() => setSummaryDismissed(true)}
                      className="text-[11px] font-mono opacity-40 hover:opacity-80 transition-opacity"
                      style={{ color: accentColor }}
                    >
                      ×
                    </button>
                  </div>
                  <p className="text-xs font-mono leading-relaxed" style={{ color: "#F5F5F7" }}>
                    {body}
                  </p>
                  {attacked && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => onNavigate?.("Replay")}
                        className="px-3 py-1.5 rounded text-[10px] font-mono font-bold transition-all active:scale-95 hover:brightness-110"
                        style={{ background: "rgba(167,139,250,0.15)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.3)" }}
                      >
                        Investigate →
                      </button>
                      <button
                        onClick={() => onNavigate?.("Red Team")}
                        className="px-3 py-1.5 rounded text-[10px] font-mono font-bold transition-all active:scale-95 hover:brightness-110"
                        style={{ background: "rgba(99,102,241,0.12)", color: "#818CF8", border: "1px solid rgba(99,102,241,0.25)" }}
                      >
                        Harden →
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {events.filter((ev) => {
              if (!search) return true;
              const q = search.toLowerCase();
              const label = eventLabel(ev).toLowerCase();
              const payload = JSON.stringify(ev.payload).toLowerCase();
              return label.includes(q) || payload.includes(q);
            }).map((ev, i) => (
              <button
                key={`${ev.id}-${ev.seq}`}
                onClick={() => setSelected(ev)}
                className="w-full text-left flex items-center gap-3 px-4 py-2 border-b transition-all duration-150 hover:bg-[#14141A] animate-slide-up"
                style={{
                  borderColor: "#1C1C24",
                  background: selected?.id === ev.id ? "#1C1C24" : undefined,
                  borderLeft: selected?.id === ev.id ? "2px solid #A78BFA" : "2px solid transparent",
                  animationDelay: `${Math.min(i * 30, 150)}ms`,
                }}
              >
                {ev.seq > 0 && (
                  <span className="font-mono text-[10px] w-6 text-right shrink-0" style={{ color: "#8A8A93" }}>
                    #{ev.seq}
                  </span>
                )}
                <span className={`w-2 h-2 rounded-full shrink-0 ${eventDotColor(ev)}`} />
                <span className="font-mono text-sm" style={{ color: eventTextColor(ev) }}>
                  {isDecision(ev) ? (() => {
                    const d = ev.payload as unknown as DecisionPayload;
                    if (d.verdict !== 'ALLOW') {
                      const atk = classifyAttack(d.riskSignals ?? []);
                      if (atk) return `${d.verdict} · ${atk.label}`;
                    }
                    return d.verdict;
                  })() : eventLabel(ev)}
                </span>
                {isToolCall(ev) && (
                  <span className="font-mono text-[11px] truncate ml-auto max-w-[200px]" style={{ color: "#8A8A93" }}>
                    {JSON.stringify(ev.payload.args ?? {}).slice(0, 50)}
                  </span>
                )}
                {isDecision(ev) && (() => {
                  const d = ev.payload as unknown as DecisionPayload;
                  const isPolicy = d.source === "policy";
                  const attack = classifyAttack(d.riskSignals ?? []);
                  const showAttackChip = attack && (d.verdict === 'BLOCK' || d.verdict === 'PAUSE');
                  const st = showAttackChip ? attackStyle(attack.severity) : null;
                  return (
                    <div className="flex items-center gap-1.5 ml-auto shrink-0">
                      {showAttackChip && st && (
                        <span
                          className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                          style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}
                        >
                          ⚡ {attack.label.toUpperCase()}
                        </span>
                      )}
                      <span
                        className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                        style={{
                          background: isPolicy ? "rgba(99,102,241,0.15)" : "rgba(167,139,250,0.12)",
                          color: isPolicy ? "#818CF8" : "#A78BFA",
                          border: `1px solid ${isPolicy ? "rgba(99,102,241,0.3)" : "rgba(167,139,250,0.2)"}`,
                        }}
                      >
                        {isPolicy ? "POLICY" : "OPUS"}
                      </span>
                      {!isPolicy && d.cached && (
                        <span
                          className="text-[9px] font-mono px-1 py-0.5 rounded"
                          style={{ background: "rgba(138,138,147,0.08)", color: "#8A8A93", border: "1px solid rgba(138,138,147,0.15)" }}
                        >
                          CACHED
                        </span>
                      )}
                      {!showAttackChip && (
                        <span className="font-mono text-[11px] truncate max-w-[160px]" style={{ color: "#8A8A93" }}>
                          {d.reasoning.slice(0, 45)}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </button>
            ))}
          </div>
        </div>

        {/* ── Detail panel ──────────────────────────────────────────── */}
        <div className="w-full lg:w-[420px] lg:shrink-0 flex flex-col min-h-0">
          <div
            className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest shrink-0"
            style={{ color: "#8A8A93", borderBottom: "1px solid #262630" }}
          >
            {selected ? `Event #${selected.seq} — ${selected.type}` : "Inspector"}
          </div>

          <div className="flex-1 overflow-y-auto">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full px-8">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: "#14141A" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A8A93" strokeWidth="1.5">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-xs font-mono text-center" style={{ color: "#8A8A93" }}>
                  Select an event to inspect
                </p>
              </div>
            ) : (
              <div className="px-4 py-4 space-y-4 animate-fade-in">
                {/* Attack Detection Panel */}
                {selectedAttack && selectedDecision && selectedDecision.verdict !== 'ALLOW' && (() => {
                  const st = attackStyle(selectedAttack.severity);
                  const toolArgs = (selectedToolCall?.payload?.args ?? {}) as Record<string, unknown>;
                  const toolName = selectedToolCall?.payload?.tool as string | undefined;
                  return (
                    <div className="rounded-lg p-3" style={{ background: st.bg, border: `1px solid ${st.border}` }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 animate-pulse ${st.dot}`} />
                        <span className="text-[11px] font-mono font-bold tracking-widest" style={{ color: st.color }}>
                          ⚡ {selectedAttack.label.toUpperCase()} DETECTED
                        </span>
                      </div>
                      <p className="text-xs font-mono leading-relaxed" style={{ color: st.color, opacity: 0.85 }}>
                        {selectedAttack.narrative}
                      </p>
                      {toolName === 'send_email' && typeof toolArgs.to === 'string' && (
                        <p className="text-[11px] font-mono mt-2 pt-2" style={{ color: st.color, opacity: 0.6, borderTop: `1px solid ${st.border}` }}>
                          Destination: {toolArgs.to}
                        </p>
                      )}
                      {toolName === 'apply_refund' && typeof toolArgs.amount === 'number' && (
                        <p className="text-[11px] font-mono mt-2 pt-2" style={{ color: st.color, opacity: 0.6, borderTop: `1px solid ${st.border}` }}>
                          Amount at risk: ${toolArgs.amount.toLocaleString()}
                        </p>
                      )}
                      {toolName === 'query_customers' && (
                        <p className="text-[11px] font-mono mt-2 pt-2" style={{ color: st.color, opacity: 0.6, borderTop: `1px solid ${st.border}` }}>
                          Action: Unfiltered customer dump (all records)
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Verdict + source badge */}
                {selectedDecision && (() => {
                  const isPolicy = selectedDecision.source === "policy";
                  return (
                    <div
                      className="flex items-start gap-3 p-3 rounded"
                      style={{
                        background: verdictStyle(selectedDecision.verdict).bg,
                        border: `1px solid ${verdictStyle(selectedDecision.verdict).border}`,
                      }}
                    >
                      <span
                        className="px-2.5 py-1 rounded text-xs font-mono font-bold shrink-0"
                        style={{ color: verdictStyle(selectedDecision.verdict).color }}
                      >
                        {selectedDecision.verdict}
                      </span>
                      <div className="flex flex-col gap-2 flex-1 min-w-0">
                        {/* Source badge */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                            style={{
                              background: isPolicy ? "rgba(99,102,241,0.15)" : "rgba(167,139,250,0.12)",
                              color: isPolicy ? "#818CF8" : "#A78BFA",
                              border: `1px solid ${isPolicy ? "rgba(99,102,241,0.3)" : "rgba(167,139,250,0.2)"}`,
                            }}
                          >
                            {isPolicy
                              ? `POLICY · ${selectedDecision.policyId ?? "unknown"}`
                              : "OPUS · extended thinking"}
                          </span>
                          {!isPolicy && selectedDecision.cached && (
                            <span
                              className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                              style={{ background: "rgba(138,138,147,0.08)", color: "#8A8A93", border: "1px solid rgba(138,138,147,0.15)" }}
                              title="Pre-computed verdict. Switch to Live Opus for real-time reasoning."
                            >
                              PRE-COMPUTED
                            </span>
                          )}
                        </div>
                        {/* Risk signals */}
                        {selectedDecision.riskSignals.filter(s => !s.startsWith("policy:")).length > 0 && (
                          <div className="flex gap-1.5 flex-wrap">
                            {selectedDecision.riskSignals.filter(s => !s.startsWith("policy:")).map((s, i) => (
                              <span
                                key={i}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                                style={{ background: "#0A0A0D", color: "#FF5A5A" }}
                              >
                                {RISK_SIGNAL_LABELS[s] ?? s.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Reasoning */}
                {selectedDecision && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "#8A8A93" }}>
                      Reasoning
                    </div>
                    <p className="text-sm font-mono leading-relaxed" style={{ color: "#F5F5F7" }}>
                      {selectedDecision.reasoning}
                    </p>
                  </div>
                )}

                {/* Without Sentinel — counterfactual panel */}
                {selectedCounterfactual && selectedDecision && selectedDecision.verdict !== 'ALLOW' && (
                  <div className="rounded-lg p-3" style={{ background: 'rgba(255,90,90,0.05)', border: '1px solid rgba(255,90,90,0.25)' }}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A5A]" />
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: '#FF5A5A' }}>
                        Without Sentinel
                      </span>
                      {!selectedDecision.counterfactual && (
                        <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ background: 'rgba(167,139,250,0.15)', color: '#A78BFA' }}>
                          Live · Opus
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono leading-relaxed mb-3" style={{ color: '#F5F5F7', opacity: 0.75 }}>
                      {selectedCounterfactual.narration}
                    </p>
                    {selectedCounterfactual.simulatedSteps.length > 0 && (
                      <ul className="space-y-1.5 mb-3">
                        {selectedCounterfactual.simulatedSteps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2 text-[11px] font-mono" style={{ color: '#FF5A5A', opacity: 0.85 }}>
                            <span className="shrink-0">→</span>
                            <span>{step.outcome}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[11px] font-mono font-semibold pt-2" style={{ color: '#FF5A5A', borderTop: '1px solid rgba(255,90,90,0.2)' }}>
                      {selectedCounterfactual.damageSummary}
                    </p>
                  </div>
                )}

                {/* Convene Committee — only for BLOCK/PAUSE decisions */}
                {selectedDecision && selected && (selectedDecision.verdict === 'BLOCK' || selectedDecision.verdict === 'PAUSE') && (
                  <button
                    onClick={() => setCommitteeEventId(selected.id)}
                    title="Spawn 3 Opus personas (CISO, Legal, Product) + moderator to deliberate this decision"
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110"
                    style={{ background: "rgba(167,139,250,0.08)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.3)" }}
                  >
                    🏛️ Convene Security Committee
                    <span className="text-[9px] opacity-70">· 4× Opus 4.7</span>
                  </button>
                )}

                {/* What-If Simulator — only for BLOCK/PAUSE decisions */}
                {selectedDecision && selected && (selectedDecision.verdict === 'BLOCK' || selectedDecision.verdict === 'PAUSE') && (
                  <button
                    onClick={() => setWhatIfEventId(selected.id)}
                    title="Opus generates 20 mutations of this attack and tests them against your current policies"
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110"
                    style={{ background: "rgba(125,211,252,0.08)", color: "#7DD3FC", border: "1px solid rgba(125,211,252,0.3)" }}
                  >
                    🧪 What-If: Generate 20 Variations
                    <span className="text-[9px] opacity-70">· 2× Opus 4.7</span>
                  </button>
                )}

                {/* Without Sentinel — pending (Opus is thinking) */}
                {counterfactualPending && (
                  <div className="rounded-lg p-3" style={{ background: 'rgba(255,90,90,0.04)', border: '1px dashed rgba(255,90,90,0.25)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A5A] animate-pulse" />
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: '#FF5A5A' }}>
                        Without Sentinel
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ background: 'rgba(167,139,250,0.15)', color: '#A78BFA' }}>
                        Generating…
                      </span>
                    </div>
                    <p className="text-[11px] font-mono leading-relaxed" style={{ color: '#8A8A93' }}>
                      Opus is simulating what the attack chain would have done next…
                    </p>
                  </div>
                )}

                {/* Policy rule box — shown when source is policy */}
                {selectedDecision?.source === "policy" && selectedDecision.policyId && (
                  <div className="rounded-lg p-3" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#818CF8]" />
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: "#818CF8" }}>
                        Matched Policy Rule
                      </span>
                    </div>
                    <p className="text-xs font-mono" style={{ color: "#818CF8" }}>
                      {selectedDecision.policyId}
                    </p>
                    <p className="text-[11px] font-mono mt-1.5 leading-relaxed" style={{ color: "#8A8A93" }}>
                      Deterministic evaluation · No LLM required · &lt;5ms
                    </p>
                  </div>
                )}

                {/* Payload */}
                <div>
                  <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "#8A8A93" }}>
                    Payload
                  </div>
                  <pre
                    className="text-xs rounded-lg p-3 overflow-auto font-mono whitespace-pre-wrap break-all"
                    style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630" }}
                  >
                    {JSON.stringify(selected.payload, null, 2)}
                  </pre>
                </div>

                {/* Opus thinking — shown only when source is pre-cog */}
                {selectedDecision?.source !== "policy" && selectedThinking && (
                  <div className="rounded-lg p-3" style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.2)" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA]" />
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: "#A78BFA" }}>
                        Opus Extended Thinking
                      </span>
                    </div>
                    <p className="text-xs font-mono leading-relaxed whitespace-pre-wrap" style={{ color: "#A78BFA" }}>
                      {selectedThinking}
                    </p>
                  </div>
                )}

                {/* Timestamp */}
                <div className="text-[10px] font-mono pt-2" style={{ color: "#8A8A93" }}>
                  {new Date(selected.timestamp).toLocaleTimeString()} — seq {selected.seq}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ── Security Committee modal ──────────────────────────────────── */}
      {committeeEventId && (
        <Committee
          decisionEventId={committeeEventId}
          onClose={() => setCommitteeEventId(null)}
        />
      )}

      {/* ── What-If Simulator modal ─────────────────────────────────────── */}
      {whatIfEventId && (
        <WhatIfSimulator
          decisionEventId={whatIfEventId}
          onClose={() => setWhatIfEventId(null)}
        />
      )}
    </div>
  );
}

// ─── Executive view ──────────────────────────────────────────────────────────
function ExecutiveRuntimePanel({
  status,
  events,
  runBlast,
  onNavigate,
}: {
  status: "idle" | "running" | "done";
  events: AgentEvent[];
  runBlast: {
    moneyInterdicted: number;
    externalEmailsBlocked: string[];
    piiExfiltrationAttempted: boolean;
    actionsInterdicted: number;
    recordsAccessed?: number;
  } | null;
  onNavigate?: (tab: string) => void;
}) {
  const incidents = events
    .filter((e) => e.type === "decision")
    .map((e) => {
      const d = e.payload as unknown as DecisionPayload;
      if (d.verdict === "ALLOW") return null;
      const attack = classifyAttack(d.riskSignals ?? []);
      const prevTool = events.find((x) => x.seq === e.seq - 1 && x.type === "tool_call");
      const toolArgs = (prevTool?.payload as { args?: Record<string, unknown> } | undefined)?.args ?? {};
      return {
        id: e.id,
        verdict: d.verdict,
        label: attack?.label ?? (d.verdict === "BLOCK" ? "Blocked action" : "Paused for review"),
        narrative: attack?.narrative ?? d.reasoning,
        destination: (toolArgs as { to?: string }).to,
        amount: (toolArgs as { amount?: number }).amount,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const blocked = incidents.filter((i) => i.verdict === "BLOCK").length;
  const paused = incidents.filter((i) => i.verdict === "PAUSE").length;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-10 space-y-6">
        <div
          className="flex items-center gap-4 p-5 rounded-xl"
          style={{
            background: status === "running" ? "rgba(167,139,250,0.05)" : "#0D0D12",
            border: `1px solid ${status === "running" ? "rgba(167,139,250,0.25)" : "#262630"}`,
          }}
        >
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{
              background: status === "running" ? "#A78BFA" : status === "done" ? "#2DD4A4" : "#8A8A93",
              boxShadow: status === "running" ? "0 0 12px #A78BFA" : "none",
              animation: status === "running" ? "pulse 1.5s ease-in-out infinite" : undefined,
            }}
          />
          <div className="flex-1">
            <div className="text-base font-mono font-semibold" style={{ color: "#F5F5F7" }}>
              {status === "running" && "AI agent is working"}
              {status === "done" && "Session complete"}
              {status === "idle" && "Ready to monitor"}
            </div>
            <div className="text-xs font-mono mt-1" style={{ color: "#8A8A93" }}>
              {status === "running" && "Sentinel is reviewing every action before it's executed"}
              {status === "done" && "All actions have been evaluated — see summary below"}
              {status === "idle" && "Start a scenario from the controls above to see Sentinel in action"}
            </div>
          </div>
        </div>

        {incidents.length > 0 && (
          <div className="space-y-3">
            <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
              Incidents this session — {blocked} blocked · {paused} paused
            </div>
            {incidents.map((inc) => {
              const isBlock = inc.verdict === "BLOCK";
              const color = isBlock ? "#FF5A5A" : "#F7B955";
              return (
                <div
                  key={inc.id}
                  className="p-4 rounded-lg"
                  style={{
                    background: isBlock ? "rgba(255,90,90,0.04)" : "rgba(247,185,85,0.04)",
                    border: `1px solid ${isBlock ? "rgba(255,90,90,0.25)" : "rgba(247,185,85,0.25)"}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-widest"
                      style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
                    >
                      {isBlock ? "Blocked" : "Held for review"}
                    </span>
                    <span className="text-sm font-mono font-semibold" style={{ color: "#F5F5F7" }}>
                      {inc.label}
                    </span>
                  </div>
                  <p className="text-xs font-mono leading-relaxed" style={{ color: "#8A8A93" }}>
                    {inc.narrative}
                  </p>
                  {(inc.destination || inc.amount) && (
                    <div className="flex gap-4 mt-2 text-[11px] font-mono" style={{ color }}>
                      {inc.amount !== undefined && <span>Amount: ${inc.amount.toLocaleString()}</span>}
                      {inc.destination && <span>Destination: {inc.destination}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {status === "done" && runBlast && (
          <div
            className="p-5 rounded-xl space-y-3"
            style={{ background: "#0D0D12", border: "1px solid #262630" }}
          >
            <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
              Business Impact
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="text-2xl font-mono font-bold" style={{ color: "#FF5A5A" }}>
                  ${runBlast.moneyInterdicted.toLocaleString()}
                </div>
                <div className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
                  in fraud prevented
                </div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold" style={{ color: "#F7B955" }}>
                  {runBlast.actionsInterdicted}
                </div>
                <div className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
                  threats intercepted
                </div>
              </div>
              <div>
                <div className="text-2xl font-mono font-bold" style={{ color: runBlast.piiExfiltrationAttempted ? "#FF5A5A" : "#2DD4A4" }}>
                  {runBlast.piiExfiltrationAttempted ? "Yes" : "No"}
                </div>
                <div className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
                  customer data leak attempt
                </div>
              </div>
            </div>
            {onNavigate && (
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => onNavigate("Replay")}
                  className="px-3 py-1.5 rounded text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110"
                  style={{ background: "#A78BFA", color: "#0A0A0D" }}
                >
                  Investigate →
                </button>
                <button
                  onClick={() => onNavigate("Red Team")}
                  className="px-3 py-1.5 rounded text-xs font-mono font-medium transition-all active:scale-95 hover:brightness-110"
                  style={{ background: "#1C1C24", color: "#F5F5F7", border: "1px solid #262630" }}
                >
                  Harden →
                </button>
              </div>
            )}
          </div>
        )}

        {status === "done" && incidents.length === 0 && (
          <div
            className="p-8 rounded-xl text-center"
            style={{ background: "#0D0D12", border: "1px dashed #262630" }}
          >
            <div className="text-sm font-mono" style={{ color: "#2DD4A4" }}>
              No threats detected — agent completed {events.filter((e) => e.type === "tool_call").length} actions cleanly.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
