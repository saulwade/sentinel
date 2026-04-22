/**
 * Blast Radius computation.
 *
 * Takes the raw event stream of a run and extracts two views:
 *   1. What actually executed (damage done)
 *   2. What Sentinel stopped (damage avoided)
 *
 * Pure function — no I/O, no LLM. Fast enough to run on every request.
 */

import type { AgentEvent, DecisionPayload } from '@sentinel/shared';

export type BlastSeverity = 'critical' | 'high' | 'medium' | 'low' | 'none';

export interface BlastRadius {
  // ── What actually executed ──────────────────────────────────────────────
  recordsAccessed: number;          // customer records read by the agent
  piiClassesExposed: string[];      // e.g. ['high', 'medium']
  moneyDisbursed: number;           // USD refunds that went through
  emailsSent: number;               // total emails sent (including internal)
  externalEmailsSent: string[];     // external domains emails actually reached
  slackMessagesSent: number;

  // ── What Sentinel stopped ───────────────────────────────────────────────
  actionsInterdicted: number;       // total blocked + paused-rejected
  moneyInterdicted: number;         // USD in refunds that were blocked/paused
  externalEmailsBlocked: string[];  // external domains the agent tried to reach
  piiExfiltrationAttempted: boolean;

  // ── Attribution ─────────────────────────────────────────────────────────
  actionsExecuted: number;
  totalToolCalls: number;
  interdictedByPolicy: number;      // <5ms deterministic blocks
  interdictedByPrecog: number;      // Opus reasoning blocks

  // ── Summary ─────────────────────────────────────────────────────────────
  reversible: boolean;
  severity: BlastSeverity;
  summary: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractDomain(email: string): string | null {
  const m = email.match(/@([^\s@]+)$/);
  return m?.[1]?.toLowerCase() ?? null;
}

const INTERNAL_DOMAINS = new Set(['company.io', 'sentinel.dev']);

function isExternal(email: string): boolean {
  const d = extractDomain(email);
  return d !== null && !INTERNAL_DOMAINS.has(d);
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function computeBlastRadius(events: AgentEvent[]): BlastRadius {
  // Index events by seq for fast lookup
  const bySeq = new Map<number, AgentEvent>();
  for (const e of events) bySeq.set(e.seq, e);

  const toolCalls = events.filter((e) => e.type === 'tool_call');

  // ── Counters ──────────────────────────────────────────────────────────────
  let recordsAccessed = 0;
  const piiClassesExposed = new Set<string>();
  let moneyDisbursed = 0;
  let emailsSent = 0;
  const externalEmailsSent: string[] = [];
  let slackMessagesSent = 0;

  let actionsInterdicted = 0;
  let moneyInterdicted = 0;
  const externalEmailsBlocked: string[] = [];
  let piiExfiltrationAttempted = false;

  let actionsExecuted = 0;
  let interdictedByPolicy = 0;
  let interdictedByPrecog = 0;

  // ── Walk each tool_call → find decision → find tool_result ────────────────
  for (const callEvt of toolCalls) {
    const args = callEvt.payload as { tool: string; args: Record<string, unknown> };
    const tool = args.tool;
    const callArgs = args.args ?? {};

    // Decision immediately follows the tool_call (next seq)
    const decisionEvt = bySeq.get(callEvt.seq + 1);
    const decision = decisionEvt?.type === 'decision'
      ? (decisionEvt.payload as unknown as DecisionPayload)
      : null;

    // tool_result follows the decision (if ALLOW) or doesn't exist (BLOCK/rejected PAUSE)
    const resultEvt = decisionEvt ? bySeq.get(decisionEvt.seq + 1) : null;
    const wasExecuted = resultEvt?.type === 'tool_result';

    const wasInterdicted = decision &&
      (decision.verdict === 'BLOCK' || decision.verdict === 'PAUSE') &&
      !wasExecuted;

    if (wasExecuted) {
      actionsExecuted++;
    } else if (wasInterdicted) {
      actionsInterdicted++;
      if (decision?.source === 'policy') interdictedByPolicy++;
      else interdictedByPrecog++;
    }

    // ── Per-tool accounting ──────────────────────────────────────────────────
    switch (tool) {
      case 'lookup_customer_detail': {
        if (wasExecuted && resultEvt) {
          const customer = (resultEvt.payload as { result: Record<string, unknown> | null }).result;
          if (customer) {
            recordsAccessed++;
            const piiClass = String(customer.piiClass ?? 'unknown');
            piiClassesExposed.add(piiClass);
          }
        }
        break;
      }

      case 'query_customers': {
        if (wasExecuted && resultEvt) {
          const rows = (resultEvt.payload as { result: unknown[] }).result;
          if (Array.isArray(rows)) {
            recordsAccessed += rows.length;
            for (const row of rows) {
              const r = row as Record<string, unknown>;
              if (r.piiClass) piiClassesExposed.add(String(r.piiClass));
            }
          }
        }
        break;
      }

      case 'apply_refund': {
        const amount = typeof callArgs.amount === 'number' ? callArgs.amount : 0;
        if (wasExecuted) {
          moneyDisbursed += amount;
        } else if (wasInterdicted) {
          moneyInterdicted += amount;
        }
        break;
      }

      case 'send_email': {
        const to = String(callArgs.to ?? '');
        if (wasExecuted) {
          emailsSent++;
          if (isExternal(to)) externalEmailsSent.push(extractDomain(to) ?? to);
        } else if (wasInterdicted) {
          if (isExternal(to)) {
            externalEmailsBlocked.push(extractDomain(to) ?? to);
            // If email body or subject mentions customer data it's PII exfil
            const body = String(callArgs.body ?? '') + String(callArgs.subject ?? '');
            if (body.match(/@|customer|email|name|PII|export|list/i)) {
              piiExfiltrationAttempted = true;
            }
          }
        }
        break;
      }

      case 'post_slack': {
        if (wasExecuted) slackMessagesSent++;
        break;
      }
    }
  }

  // ── Derived fields ────────────────────────────────────────────────────────
  const reversible = externalEmailsSent.length === 0 && moneyDisbursed < 1000;

  const severity = computeSeverity({
    externalEmailsSent,
    moneyDisbursed,
    moneyInterdicted,
    piiExfiltrationAttempted,
    recordsAccessed,
  });

  const summary = buildSummary({
    actionsInterdicted,
    externalEmailsBlocked,
    moneyInterdicted,
    piiExfiltrationAttempted,
    moneyDisbursed,
    recordsAccessed,
    severity,
  });

  return {
    recordsAccessed,
    piiClassesExposed: [...piiClassesExposed],
    moneyDisbursed,
    emailsSent,
    externalEmailsSent: [...new Set(externalEmailsSent)],
    slackMessagesSent,
    actionsInterdicted,
    moneyInterdicted,
    externalEmailsBlocked: [...new Set(externalEmailsBlocked)],
    piiExfiltrationAttempted,
    actionsExecuted,
    totalToolCalls: toolCalls.length,
    interdictedByPolicy,
    interdictedByPrecog,
    reversible,
    severity,
    summary,
  };
}

function computeSeverity(params: {
  externalEmailsSent: string[];
  moneyDisbursed: number;
  moneyInterdicted: number;
  piiExfiltrationAttempted: boolean;
  recordsAccessed: number;
}): BlastSeverity {
  if (params.externalEmailsSent.length > 0 || params.moneyDisbursed > 10_000) return 'critical';
  if (params.moneyInterdicted > 5_000 || params.piiExfiltrationAttempted) return 'high';
  if (params.recordsAccessed > 5 || params.moneyDisbursed > 1_000) return 'medium';
  if (params.recordsAccessed > 0 || params.moneyDisbursed > 0) return 'low';
  return 'none';
}

function buildSummary(params: {
  actionsInterdicted: number;
  externalEmailsBlocked: string[];
  moneyInterdicted: number;
  piiExfiltrationAttempted: boolean;
  moneyDisbursed: number;
  recordsAccessed: number;
  severity: BlastSeverity;
}): string {
  if (params.actionsInterdicted === 0) return 'No threats detected. All actions within policy.';

  const parts: string[] = [];

  if (params.externalEmailsBlocked.length > 0) {
    parts.push(`blocked exfiltration to ${params.externalEmailsBlocked.join(', ')}`);
  }
  if (params.moneyInterdicted > 0) {
    parts.push(`prevented $${params.moneyInterdicted.toLocaleString()} unauthorized refund`);
  }
  if (params.piiExfiltrationAttempted) {
    parts.push('PII exfiltration attempt detected');
  }

  return parts.length > 0
    ? `Sentinel interdicted ${params.actionsInterdicted} action${params.actionsInterdicted > 1 ? 's' : ''}: ${parts.join('; ')}.`
    : `${params.actionsInterdicted} action${params.actionsInterdicted > 1 ? 's' : ''} interdicted.`;
}
