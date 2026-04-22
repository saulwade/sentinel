/**
 * Run analysis — post-hoc incident intelligence.
 *
 * Produced by combining deterministic blast-radius metrics (computed from
 * the event stream) with Opus extended-thinking reconstruction of the
 * attack chain, business impact, and policy recommendations.
 *
 * Feeds the Fork View panel, the Incident Report markdown (2.3), and the
 * Policy Synthesis engine (Day 3).
 */

export type RiskGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface AttackChainStep {
  seq: number;                 // the tool_call seq this step refers to
  action: string;              // e.g. "lookup_customer_detail(cust_e01)"
  intent: string;              // Opus's interpretation of why the agent did it
  outcome: 'executed' | 'interdicted';
}

export interface KeyInterdiction {
  seq: number;
  what: string;                // "send_email to audit@extern-compliance.io"
  why: string;                 // Opus's reconstruction of the threat
  source: 'policy' | 'pre-cog';
}

export interface Recommendation {
  title: string;
  rationale: string;
  policyHint?: string;         // natural-language seed for auto-synthesis
}

export interface BusinessImpact {
  immediate: string;           // what would have happened in the next hour
  reputational: string;        // PR / trust consequences
  compliance: string;          // regulatory / legal exposure
}

export interface RunAnalysis {
  executiveSummary: string;    // 2-3 line CISO-readable summary
  attackChain: AttackChainStep[];
  keyInterdictions: KeyInterdiction[];
  businessImpact: BusinessImpact;
  recommendations: Recommendation[];
  riskGrade: RiskGrade;        // how well Sentinel performed given the threats present
  thinkingTokens?: number;     // Opus thinking budget consumed
}
