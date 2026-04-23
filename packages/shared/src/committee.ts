/**
 * Opus Security Committee — 3 personas + 1 moderator deliberate a BLOCK.
 *
 * CISO, Legal, and Product run in parallel (Promise.all streams).
 * Moderator synthesizes consensus after all three return.
 */

export type CommitteePersona = 'ciso' | 'legal' | 'product';
export type CommitteeVerdict = 'uphold' | 'override' | 'escalate';

export interface CommitteeOpinion {
  persona: CommitteePersona;
  verdict: CommitteeVerdict;
  reasoning: string;
  concerns: string[];
  thinkingTokens?: number;
}

export interface CommitteeConsensus {
  consensus: CommitteeVerdict;
  voteBreakdown: {
    uphold: number;
    override: number;
    escalate: number;
  };
  keyDisagreements: string[];
  recommendedAction: string;
  reasoning: string;
  thinkingTokens?: number;
}

export interface CommitteeSession {
  decisionEventId: string;
  runId: string;
  originalVerdict: string;        // the BLOCK/PAUSE under review
  opinions: CommitteeOpinion[];
  consensus: CommitteeConsensus;
  durationMs: number;
}

export type CommitteeStreamEvent =
  | { kind: 'committee_start'; decisionEventId: string; runId: string }
  | { kind: 'persona_thinking'; persona: CommitteePersona; delta: string }
  | { kind: 'persona_opinion'; opinion: CommitteeOpinion }
  | { kind: 'persona_error'; persona: CommitteePersona; error: string }
  | { kind: 'moderator_thinking'; delta: string }
  | { kind: 'moderator_consensus'; consensus: CommitteeConsensus }
  | { kind: 'committee_end'; session: CommitteeSession }
  | { kind: 'error'; message: string };
