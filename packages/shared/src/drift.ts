/**
 * Policy Drift Detector — meta-audit findings.
 *
 * Opus inspects the active policy set + recent events and reports
 * three classes of issue:
 *   - redundant:  one policy fully covered by another
 *   - blind-spot: attack pattern visible in events, no policy catches it
 *   - dead-code:  policy that never fires across 5+ runs
 */

import type { Policy } from './policies.js';

export interface DriftRedundant {
  kind: 'redundant';
  policyId: string;
  coveredBy: string;
  reasoning: string;
}

export interface DriftBlindSpot {
  kind: 'blind-spot';
  pattern: string;
  evidenceRuns: string[];
  suggestedPolicy: Policy;
  reasoning: string;
}

export interface DriftDeadCode {
  kind: 'dead-code';
  policyId: string;
  matchesInRuns: number;
  totalRunsConsidered: number;
  reasoning: string;
}

export type DriftFinding = DriftRedundant | DriftBlindSpot | DriftDeadCode;

export interface DriftAuditResponse {
  findings: DriftFinding[];
  policiesReviewed: number;
  runsReviewed: number;
  eventsReviewed: number;
  thinkingTokens?: number;
  contextTokens?: number;
}
