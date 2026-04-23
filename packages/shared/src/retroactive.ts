/**
 * Retroactive Policy Surgery — Opus synthesizes a policy that would
 * have blocked a past bypass, validated against all clean history.
 */

import type { Policy } from './policies.js';

export interface RetroactiveAffectedRun {
  runId: string;
  eventSeq: number;
  tool: string;
  estimatedImpact?: number;
}

export interface RetroactiveCounterfactual {
  wouldHaveBlockedCount: number;        // beyond the original bypass
  additionalMoneyInterdicted: number;
  affectedRuns: RetroactiveAffectedRun[];
  totalRunsAnalyzed: number;
}

export interface RetroactiveBypassEvent {
  runId: string;
  seq: number;
  tool: string;
  args: Record<string, unknown>;
  verdict: string;       // BLOCK | PAUSE
  reasoning: string;     // Pre-cog's reasoning
}

export interface RetroactiveSurgeryResponse {
  policy: Policy;
  bypassEvent: RetroactiveBypassEvent;
  counterfactual: RetroactiveCounterfactual;
  attempts: number;
  thinkingTokens?: number;
  contextTokens?: number;
}
