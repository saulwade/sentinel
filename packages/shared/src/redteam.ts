/**
 * Red Team adaptive loop — shared types.
 *
 * The adaptive loop runs N iterations of:
 *   1. Generate attacks (iter 1: fresh; iter 2+: mutations seeded by what bypassed)
 *   2. Test each attack against the REAL defense stack (policies → Pre-cog)
 *   3. Accumulate bypasses; feed them into the next iteration's mutation prompt
 *
 * Bypasses are the signal for Policy Synthesis (Day 3 block 3.3):
 * each bypass becomes an Opus-generated Policy DSL rule that, once adopted,
 * closes the gap that let the attack through.
 */

// ─── Attack ──────────────────────────────────────────────────────────────────

export type AttackTechnique =
  | 'hidden_instruction'
  | 'authority_impersonation'
  | 'urgency_escalation'
  | 'compliance_framing'
  | 'instruction_override'
  | 'reference_confusion'
  | 'data_exfiltration'
  | 'privilege_escalation'
  | 'chained_request';

/**
 * A single red-team attack targeting the Support Agent.
 * The attack consists of a ticket (the injection vector) and an intended
 * tool call the attacker wants the agent to execute.
 */
export interface Attack {
  id: string;                            // e.g. "atk_iter1_03"
  iteration: number;                     // 1, 2, 3...
  technique: AttackTechnique;
  ticketSubject: string;
  ticketBody: string;                    // with injection
  intendedTool: string;                  // tool the agent is meant to call
  intendedArgs: Record<string, unknown>;
  description: string;                   // one-line human-readable
  mutationReason?: string;               // why iter 2+ changed approach
  basedOnAttackId?: string;              // parent attack this one mutates from
}

// ─── Test result ─────────────────────────────────────────────────────────────

export type AttackOutcome =
  | 'blocked'       // BLOCK verdict — defense works fully
  | 'paused-safe'   // PAUSE verdict — human would catch it
  | 'bypassed';     // ALLOW verdict — the attack slipped through

export interface TestResult {
  attackId: string;
  outcome: AttackOutcome;
  interdictedBy: 'policy' | 'pre-cog' | null;
  policyId?: string;                     // set when interdictedBy === 'policy'
  verdict: 'ALLOW' | 'PAUSE' | 'BLOCK';
  reasoning: string;
  latencyMs: number;
}

/** Passed to the attack generator so it can mutate based on real outcomes. */
export interface PriorAttempt {
  attack: Attack;
  outcome: AttackOutcome;
  interdictedBy: 'policy' | 'pre-cog' | null;
  policyId?: string;
  reasoning: string;
}

// ─── Loop events (SSE) ───────────────────────────────────────────────────────

export type LoopEvent =
  | { kind: 'loop_start'; totalIterations: number; attacksPerIteration: number }
  | { kind: 'iteration_start'; iteration: number; priorBypassCount: number; priorBlockedCount: number }
  | { kind: 'attacks_generating'; iteration: number }
  | { kind: 'attack_generated'; iteration: number; attack: Attack }
  | { kind: 'attack_test_start'; iteration: number; attackId: string }
  | { kind: 'attack_test_end'; iteration: number; attackId: string; result: TestResult }
  | { kind: 'iteration_end'; iteration: number; generated: number; blocked: number; pausedSafe: number; bypassed: number }
  | { kind: 'loop_end'; summary: LoopSummary }
  | { kind: 'error'; message: string };

export interface LoopSummary {
  totalIterations: number;
  totalAttacks: number;
  blocked: number;
  pausedSafe: number;
  bypassed: number;
  bypassRate: number;                    // 0..1
  interdictionsByPolicy: number;
  interdictionsByPrecog: number;
  adaptationEffective: boolean;          // did mutations increase bypass rate?
  durationMs: number;
  bypassedAttackIds: string[];           // feeds Policy Synthesis
}
