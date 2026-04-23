/**
 * Agent DNA — Opus reads a user's own system prompt and designs
 * surgical attacks specifically against its weaknesses.
 */

export type DnaSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface DnaAttackProposal {
  id: string;
  technique: string;               // authority_impersonation, data_exfiltration, etc.
  title: string;                   // one-line summary
  rationale: string;               // why THIS prompt is vulnerable (quotes the input)
  expectedBypass: string;          // what the attacker achieves if it works
  severity: DnaSeverity;
  ticketSubject: string;
  ticketBody: string;              // the injection payload
  intendedTool: string;            // must be a valid ToolName
  intendedArgs: Record<string, unknown>;
}

export interface DnaAnalysisResponse {
  vulnerabilities: string[];       // 3-5 weaknesses with quotes from the input
  attacks: DnaAttackProposal[];
  thinkingTokens?: number;
  contextTokens?: number;
}

export interface DnaRunResponse {
  runId: string;
  scenarioId: string;
}
