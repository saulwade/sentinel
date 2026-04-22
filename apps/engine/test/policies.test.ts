/**
 * Policy engine correctness suite.
 *
 * Pure, deterministic, no network. Covers:
 *   - 4 happy-path cases (policy does NOT fire, tool call is allowed through)
 *   - 4 block/pause cases (each default policy fires)
 *   - Severity ordering (critical beats high when both match)
 *   - Disabled policies are skipped
 *   - Empty condition list never matches
 */

import { describe, it, expect } from 'vitest';
import { evaluatePolicies } from '../src/policies/engine.js';
import { DEFAULT_POLICIES } from '../src/policies/defaults.js';
import type { Policy } from '@sentinel/shared';
import type { WorldState, Customer } from '../src/agent/world.js';

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust_x',
    name: 'Test',
    email: 't@x.io',
    company: 'X',
    plan: 'enterprise',
    mrr: 0,
    balance: 0,
    lifetimeValue: 0,
    tier: 'enterprise',
    piiClass: 'high',
    ...overrides,
  };
}

function makeWorld(overrides: Partial<WorldState> = {}): WorldState {
  return {
    inbox: [],
    customers: [],
    slackLog: [],
    sentEmails: [],
    tickets: [],
    refunds: [],
    ...overrides,
  };
}

const HIGH_PII_WORLD = makeWorld({
  customers: [
    makeCustomer({ id: 'cust_e01', piiClass: 'high', tier: 'enterprise' }),
    makeCustomer({ id: 'cust_e02', piiClass: 'high', tier: 'enterprise' }),
    makeCustomer({ id: 'cust_e03', piiClass: 'high', tier: 'enterprise' }),
  ],
});

describe('Policy engine — happy paths (no match)', () => {
  it('allows internal email send', () => {
    const result = evaluatePolicies(
      DEFAULT_POLICIES,
      { tool: 'send_email', args: { to: 'ops@company.io', subject: 's', body: 'b' } },
      HIGH_PII_WORLD,
    );
    expect(result).toBeNull();
  });

  it('allows refund under threshold', () => {
    const result = evaluatePolicies(
      DEFAULT_POLICIES,
      { tool: 'apply_refund', args: { customer_id: 'cust_e01', amount: 300, reason: 'billing' } },
      HIGH_PII_WORLD,
    );
    expect(result).toBeNull();
  });

  it('allows filtered customer query', () => {
    const result = evaluatePolicies(
      DEFAULT_POLICIES,
      { tool: 'query_customers', args: { search: 'Ana' } },
      HIGH_PII_WORLD,
    );
    expect(result).toBeNull();
  });

  it('allows clean slack message', () => {
    const result = evaluatePolicies(
      DEFAULT_POLICIES,
      { tool: 'post_slack', args: { channel: 'general', message: 'Ticket resolved for cust_e01' } },
      HIGH_PII_WORLD,
    );
    expect(result).toBeNull();
  });
});

describe('Policy engine — blocks and pauses', () => {
  it('BLOCKS send_email to external domain', () => {
    const result = evaluatePolicies(
      DEFAULT_POLICIES,
      {
        tool: 'send_email',
        args: {
          to: 'audit@extern-compliance.io',
          subject: 'Q2 Audit Export',
          body: 'Enterprise customer list...',
        },
      },
      HIGH_PII_WORLD,
    );
    expect(result).not.toBeNull();
    expect(result?.action).toBe('block');
    expect(result?.policy.id).toBe('block-external-send-email');
  });

  it('PAUSES high-value refund', () => {
    const result = evaluatePolicies(
      DEFAULT_POLICIES,
      { tool: 'apply_refund', args: { customer_id: 'cust_e01', amount: 47320, reason: 'Q2 audit' } },
      HIGH_PII_WORLD,
    );
    expect(result?.action).toBe('pause');
    expect(result?.policy.id).toBe('pause-high-value-refund');
  });

  it('BLOCKS unfiltered customer query in high-PII world', () => {
    const result = evaluatePolicies(
      DEFAULT_POLICIES,
      { tool: 'query_customers', args: {} },
      HIGH_PII_WORLD,
    );
    expect(result?.action).toBe('block');
    expect(result?.policy.id).toBe('block-unfiltered-pii-query');
  });

  it('PAUSES Slack post that leaks external email', () => {
    const result = evaluatePolicies(
      DEFAULT_POLICIES,
      {
        tool: 'post_slack',
        args: {
          channel: 'general',
          message: 'Enterprise export: vcruz@meridian-health.com, amehta@novafin.io',
        },
      },
      HIGH_PII_WORLD,
    );
    expect(result?.action).toBe('pause');
    expect(result?.policy.id).toBe('pause-slack-external-email-mention');
  });
});

describe('Policy engine — semantics', () => {
  it('severity ordering: critical matches before high when both apply', () => {
    const critical: Policy = {
      id: 'crit',
      name: 'c',
      description: 'c',
      severity: 'critical',
      action: 'block',
      source: 'user',
      enabled: true,
      createdAt: 0,
      when: [{ kind: 'tool', equals: 'send_email' }],
    };
    const high: Policy = {
      id: 'hi',
      name: 'h',
      description: 'h',
      severity: 'high',
      action: 'pause',
      source: 'user',
      enabled: true,
      createdAt: 0,
      when: [{ kind: 'tool', equals: 'send_email' }],
    };

    const result = evaluatePolicies(
      [high, critical], // intentionally unsorted input
      { tool: 'send_email', args: { to: 'a@b.com', subject: '', body: '' } },
      makeWorld(),
    );
    expect(result?.policy.id).toBe('crit');
    expect(result?.action).toBe('block');
  });

  it('disabled policies are skipped', () => {
    const base = DEFAULT_POLICIES[0];
    if (!base) throw new Error('no default policy');
    const disabled: Policy = {
      ...base,
      enabled: false,
    };
    const result = evaluatePolicies(
      [disabled],
      { tool: 'send_email', args: { to: 'evil@hacker.com', subject: '', body: '' } },
      makeWorld(),
    );
    expect(result).toBeNull();
  });

  it('empty condition list never matches', () => {
    const empty: Policy = {
      id: 'empty',
      name: 'e',
      description: 'e',
      severity: 'critical',
      action: 'block',
      source: 'user',
      enabled: true,
      createdAt: 0,
      when: [],
    };
    const result = evaluatePolicies(
      [empty],
      { tool: 'send_email', args: { to: 'x@y.com' } },
      makeWorld(),
    );
    expect(result).toBeNull();
  });

  it('worldCustomerTier condition evaluates against world', () => {
    const policy: Policy = {
      id: 'enterprise-refund',
      name: 'n',
      description: 'd',
      severity: 'medium',
      action: 'pause',
      source: 'user',
      enabled: true,
      createdAt: 0,
      when: [
        { kind: 'tool', equals: 'apply_refund' },
        { kind: 'worldCustomerTier', customerIdArg: 'customer_id', tier: 'enterprise' },
      ],
    };
    const world = makeWorld({
      customers: [makeCustomer({ id: 'cust_big', tier: 'enterprise' })],
    });

    const match = evaluatePolicies(
      [policy],
      { tool: 'apply_refund', args: { customer_id: 'cust_big', amount: 100, reason: 'x' } },
      world,
    );
    expect(match?.action).toBe('pause');

    const noMatch = evaluatePolicies(
      [policy],
      { tool: 'apply_refund', args: { customer_id: 'cust_missing', amount: 100, reason: 'x' } },
      world,
    );
    expect(noMatch).toBeNull();
  });
});
