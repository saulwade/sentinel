export type EventType =
  | 'observation'
  | 'thought'
  | 'tool_call'
  | 'tool_result'
  | 'decision'
  | 'user_input'
  | 'fork_narration'
  | 'sim_event'
  | 'counterfactual';

export interface CounterfactualPayload {
  decisionEventId: string;
  narration: string;
  simulatedSteps: Array<{
    tool: string;
    args: Record<string, unknown>;
    outcome: string;
  }>;
  damageSummary: string;
  source: 'opus';
}

export type Verdict = 'ALLOW' | 'PAUSE' | 'BLOCK';

export type RunMode = 'live' | 'replay' | 'preflight';

export type RunStatus = 'running' | 'paused' | 'completed' | 'error';

export interface AgentEvent {
  id: string;
  runId: string;
  seq: number;
  parentEventId?: string;
  timestamp: number;
  type: EventType;
  payload: unknown;
}

export interface ToolCallPayload {
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolResultPayload {
  tool: string;
  result: unknown;
  error?: string;
}

export type DecisionSource = 'policy' | 'pre-cog';

export interface DecisionPayload {
  verdict: Verdict;
  reasoning: string;
  riskSignals: string[];
  source?: DecisionSource;
  policyId?: string;   // set when source === 'policy'
  thinkingTokens?: number; // set when source === 'pre-cog'
  cached?: boolean;    // true when pre-cog verdict came from demo cache
  counterfactual?: {
    narration: string;
    simulatedSteps: Array<{
      tool: string;
      args: Record<string, unknown>;
      outcome: string;
    }>;
    damageSummary: string;
  };
}

export interface Run {
  id: string;
  createdAt: number;
  mode: RunMode;
  parentRunId?: string;
  forkAtEventId?: string;
  agentConfig: string;
  status: RunStatus;
}

export type WSMessage =
  | { kind: 'event'; event: AgentEvent }
  | { kind: 'run_started'; run: Run }
  | { kind: 'run_ended'; runId: string; status: RunStatus }
  | { kind: 'ping'; ts: number };
