/**
 * Ask Opus — CISO conversational types.
 */

export interface AskEvidence {
  runId: string;
  eventSeq?: number | null;
  quote: string;
}

export interface AskResponse {
  tldr: string;
  analysis: string;
  evidence: AskEvidence[];
  recommendation?: string | null;
  thinkingTokens?: number;
}
