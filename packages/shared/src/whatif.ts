/**
 * What-If Simulator — Opus adversarial creativity on a blocked decision.
 *
 * Given a BLOCK/PAUSE event, Opus generates N mutations (variations) of the
 * same attack that try to evade the policy that fired. Each mutation is
 * evaluated deterministically against the current policy set. A final Opus
 * call summarizes the evasion pattern and proposes concrete policy fixes.
 */

import type { PolicyCondition, PolicySeverity } from './policies.js';

export interface WhatIfMutation {
  id: string;                        // m1 .. mN
  strategy: string;                  // short label, e.g. "threshold evasion", "domain typosquat"
  rationale: string;                 // why this mutation might evade the original block
  tool: string;
  args: Record<string, unknown>;
}

export interface WhatIfResult {
  mutationId: string;
  verdict: 'blocked' | 'passed';     // whether *current* policies would block it
  matchedPolicyId?: string;          // if blocked, the policy id that caught it
  matchedPolicyName?: string;
  source?: 'policy' | 'default';     // which policy layer caught it
}

export interface WhatIfFix {
  title: string;                     // short human title for the proposed policy
  description: string;
  severity: PolicySeverity;
  when: PolicyCondition[];
  reasoning: string;                 // why this fix closes the gap
}

export interface WhatIfSummary {
  total: number;
  blocked: number;
  passed: number;
  dominantEvasion: string;           // e.g. "10× splitting under $5k threshold"
  headline: string;                  // punchy one-liner for UI top banner
  fixes: WhatIfFix[];                // 1-2 proposed policy fixes
  thinkingTokens?: number;
}

export interface WhatIfSession {
  decisionEventId: string;
  runId: string;
  originalToolCall: { tool: string; args: Record<string, unknown> };
  originalVerdict: string;
  mutations: WhatIfMutation[];
  results: WhatIfResult[];
  summary: WhatIfSummary;
  durationMs: number;
}

export type WhatIfStreamEvent =
  | { kind: 'whatif_start'; decisionEventId: string; runId: string }
  | { kind: 'generator_thinking'; delta: string }
  | { kind: 'mutation_generated'; mutation: WhatIfMutation }
  | { kind: 'mutation_result'; result: WhatIfResult }
  | { kind: 'summary_thinking'; delta: string }
  | { kind: 'summary'; summary: WhatIfSummary }
  | { kind: 'whatif_end'; session: WhatIfSession }
  | { kind: 'error'; message: string };
