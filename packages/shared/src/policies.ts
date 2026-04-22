/**
 * Sentinel Policy DSL.
 *
 * A policy is a set of conditions (AND-ed) that, when all matched against
 * a proposed tool call + world state, fire an action (block / pause / allow).
 *
 * Design principles:
 *   - Deterministic. No LLM in evaluation. Runs in <5ms.
 *   - Flat. Conditions are AND-ed via array. For OR, write two policies.
 *   - JSON-serializable. Opus can generate these in Red Team synthesis.
 *   - Narrow. Only ~10 condition kinds — constrains what Opus must output.
 *
 * First matching policy wins (ordering matters — caller sorts by severity).
 * A matching policy with action='allow' short-circuits downstream evaluation.
 */

export type PolicyAction = 'block' | 'pause' | 'allow';
export type PolicySeverity = 'critical' | 'high' | 'medium' | 'low';
export type PolicySource = 'default' | 'auto-synthesized' | 'user';

export type ThresholdOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

/**
 * A single predicate evaluated against a tool call + world state.
 * Discriminated by `kind`.
 */
export type PolicyCondition =
  // Tool name matches (exact or one-of)
  | { kind: 'tool'; equals: string | string[] }

  // Arg equals a specific primitive value
  | { kind: 'argEquals'; arg: string; value: string | number | boolean }

  // Arg is absent / null / empty string / empty object
  | { kind: 'argAbsent'; arg: string }

  // String arg matches regex
  | { kind: 'argMatches'; arg: string; pattern: string; flags?: string }

  // String arg contains substring
  | { kind: 'argContains'; arg: string; substring: string; caseSensitive?: boolean }

  // Email-shaped arg: domain is NOT in allowlist
  | { kind: 'domainNotIn'; arg: string; allowlist: string[] }

  // Email-shaped arg: domain IS in blocklist
  | { kind: 'domainIn'; arg: string; blocklist: string[] }

  // Numeric arg vs threshold
  | { kind: 'valueThreshold'; arg: string; op: ThresholdOp; value: number }

  // World state: count of matching customers exceeds a max
  | { kind: 'worldCountExceeds'; selector: 'allCustomers' | 'enterpriseCustomers' | 'customersWithHighPii'; max: number }

  // World state: the customer referenced by `customerIdArg` has a given tier
  | { kind: 'worldCustomerTier'; customerIdArg: string; tier: 'enterprise' | 'pro' | 'free' };

export interface Policy {
  id: string;
  name: string;
  description: string;
  severity: PolicySeverity;
  action: PolicyAction;
  when: PolicyCondition[]; // ALL conditions must match
  reasoning?: string;      // human-readable, surfaced in decision events
  source: PolicySource;
  enabled: boolean;
  createdAt: number;
  sourceAttackId?: string; // when source === 'auto-synthesized'
}

export interface PolicyMatchResult {
  policy: Policy;
  action: PolicyAction;
  reasoning: string;
}
