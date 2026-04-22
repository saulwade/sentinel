/**
 * Policy evaluator. Pure function over (policies, toolCall, world).
 * No I/O, no LLM, no async. Meant to run in <5ms.
 *
 * Called from the interceptor BEFORE Pre-cog.
 * If any policy matches, we short-circuit with its verdict.
 * If none match, caller falls through to Pre-cog (LLM-as-judge).
 */

import type {
  Policy,
  PolicyCondition,
  PolicyMatchResult,
} from '@sentinel/shared';
import type { WorldState } from '../agent/world.js';

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;

/**
 * Evaluate policies in severity order. First match wins.
 * Returns null if no policy matches → interceptor should fall through to Pre-cog.
 */
export function evaluatePolicies(
  policies: Policy[],
  call: ToolCall,
  world: WorldState,
): PolicyMatchResult | null {
  const enabled = policies.filter((p) => p.enabled !== false);
  const sorted = [...enabled].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  for (const policy of sorted) {
    if (matchesAll(policy.when, call, world)) {
      return {
        policy,
        action: policy.action,
        reasoning: policy.reasoning ?? policy.description,
      };
    }
  }
  return null;
}

function matchesAll(
  conditions: PolicyCondition[],
  call: ToolCall,
  world: WorldState,
): boolean {
  if (conditions.length === 0) return false; // empty policy never matches
  return conditions.every((c) => evaluateCondition(c, call, world));
}

function evaluateCondition(
  c: PolicyCondition,
  call: ToolCall,
  world: WorldState,
): boolean {
  switch (c.kind) {
    case 'tool':
      return Array.isArray(c.equals) ? c.equals.includes(call.tool) : call.tool === c.equals;

    case 'argEquals':
      return call.args[c.arg] === c.value;

    case 'argAbsent': {
      const v = call.args[c.arg];
      if (v === undefined || v === null) return true;
      if (typeof v === 'string' && v.trim() === '') return true;
      if (typeof v === 'object' && v !== null && Object.keys(v as object).length === 0) return true;
      return false;
    }

    case 'argMatches': {
      const v = call.args[c.arg];
      if (typeof v !== 'string') return false;
      try {
        return new RegExp(c.pattern, c.flags).test(v);
      } catch {
        return false;
      }
    }

    case 'argContains': {
      const v = call.args[c.arg];
      if (typeof v !== 'string') return false;
      if (c.caseSensitive) return v.includes(c.substring);
      return v.toLowerCase().includes(c.substring.toLowerCase());
    }

    case 'domainNotIn': {
      const d = extractDomain(call.args[c.arg]);
      return d !== null && !c.allowlist.map((x) => x.toLowerCase()).includes(d);
    }

    case 'domainIn': {
      const d = extractDomain(call.args[c.arg]);
      return d !== null && c.blocklist.map((x) => x.toLowerCase()).includes(d);
    }

    case 'valueThreshold': {
      const v = call.args[c.arg];
      if (typeof v !== 'number') return false;
      switch (c.op) {
        case 'gt': return v > c.value;
        case 'gte': return v >= c.value;
        case 'lt': return v < c.value;
        case 'lte': return v <= c.value;
        case 'eq': return v === c.value;
      }
    }

    case 'worldCountExceeds': {
      const count = countCustomers(world, c.selector);
      return count > c.max;
    }

    case 'worldCustomerTier': {
      const id = call.args[c.customerIdArg];
      if (typeof id !== 'string') return false;
      const customer = world.customers.find((x) => x.id === id);
      return customer !== undefined && customer.tier === c.tier;
    }
  }
}

function extractDomain(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const m = input.match(/@([^\s@]+)$/);
  const domain = m?.[1];
  return domain ? domain.toLowerCase() : null;
}

function countCustomers(
  world: WorldState,
  selector: 'allCustomers' | 'enterpriseCustomers' | 'customersWithHighPii',
): number {
  switch (selector) {
    case 'allCustomers':
      return world.customers.length;
    case 'enterpriseCustomers':
      return world.customers.filter((c) => c.tier === 'enterprise').length;
    case 'customersWithHighPii':
      return world.customers.filter((c) => c.piiClass === 'high').length;
  }
}
