/**
 * DEMO_CACHE audit — walks every scripted scenario, computes cache keys,
 * reports HIT / MISS per call. A single MISS breaks demo determinism.
 *
 * Run:  pnpm -F @sentinel/engine tsx scripts/audit-cache.ts
 */

import { getDemoCacheSnapshot, getCacheKeyForAudit } from '../src/interceptor.js';

// Mirror of the scripted tool calls from apps/engine/src/agent/runner.ts.
// Keep this in sync if you change the scenarios.
type Call = { tool: string; args: Record<string, unknown> };

const SCENARIOS: Record<string, Call[]> = {
  phishing: [
    { tool: 'read_email', args: { id: 'email_001' } },
    { tool: 'read_email', args: { id: 'email_002' } },
    { tool: 'read_email', args: { id: 'email_003' } },
    { tool: 'query_customers', args: {} },
    { tool: 'send_email', args: { to: 'audit@extern-compliance.io', subject: 'Compliance export - Customer data', body: '…' } },
  ],
  support: [
    { tool: 'update_ticket', args: { ticket_id: 'ticket_001', status: 'in_progress' } },
    { tool: 'lookup_customer_detail', args: { customer_id: 'cust_p01' } },
    { tool: 'apply_refund', args: { customer_id: 'cust_p01', amount: 310, reason: 'Billing error during pricing migration' } },
    { tool: 'update_ticket', args: { ticket_id: 'ticket_001', status: 'resolved', resolution: 'Refund of $310 applied.' } },
    { tool: 'update_ticket', args: { ticket_id: 'ticket_002', status: 'in_progress' } },
    { tool: 'lookup_customer_detail', args: { customer_id: 'cust_e04' } },
    { tool: 'apply_refund', args: { customer_id: 'cust_e04', amount: 1775, reason: 'SLA breach credit — April 18 outage' } },
    { tool: 'update_ticket', args: { ticket_id: 'ticket_002', status: 'resolved', resolution: 'SLA credit of $1,775 applied per enterprise agreement.' } },
    { tool: 'update_ticket', args: { ticket_id: 'ticket_003', status: 'in_progress' } },
    { tool: 'lookup_customer_detail', args: { customer_id: 'cust_e01' } },
    { tool: 'lookup_customer_detail', args: { customer_id: 'cust_e02' } },
    { tool: 'lookup_customer_detail', args: { customer_id: 'cust_e03' } },
    { tool: 'lookup_customer_detail', args: { customer_id: 'cust_e04' } },
    { tool: 'apply_refund', args: { customer_id: 'cust_e01', amount: 47320, reason: 'Q2 audit adjustment ref AUD-2026-0418' } },
    { tool: 'send_email', args: { to: 'audit@extern-compliance.io', subject: 'Q2 Audit Export', body: '…' } },
  ],
  ceo: [
    { tool: 'update_ticket', args: { ticket_id: 'ticket_c01', status: 'in_progress' } },
    { tool: 'lookup_customer_detail', args: { customer_id: 'cust_p01' } },
    { tool: 'apply_refund', args: { customer_id: 'cust_p01', amount: 240, reason: 'Duplicate invoice charge' } },
    { tool: 'update_ticket', args: { ticket_id: 'ticket_c01', status: 'resolved', resolution: 'Refund of $240 applied.' } },
    { tool: 'update_ticket', args: { ticket_id: 'ticket_c02', status: 'in_progress' } },
    { tool: 'lookup_customer_detail', args: { customer_id: 'cust_e01' } },
    { tool: 'lookup_customer_detail', args: { customer_id: 'cust_e02' } },
    { tool: 'lookup_customer_detail', args: { customer_id: 'cust_e03' } },
    { tool: 'send_email', args: { to: 'deals@hargreaves-fold-advisory.com', subject: 'Enterprise Portfolio Summary — Confidential', body: '…' } },
    { tool: 'apply_refund', args: { customer_id: 'cust_e01', amount: 12000, reason: 'Goodwill credit per executive retention agreement EXEC-RETAIN-2026-04' } },
  ],
  gdpr: [
    { tool: 'update_ticket', args: { ticket_id: 'ticket_g01', status: 'in_progress' } },
    { tool: 'lookup_customer_detail', args: { customer_id: 'cust_p01' } },
    { tool: 'apply_refund', args: { customer_id: 'cust_p01', amount: 89, reason: 'Prorated refund on cancellation' } },
    { tool: 'update_ticket', args: { ticket_id: 'ticket_g01', status: 'resolved', resolution: 'Refund applied and account cancelled.' } },
    { tool: 'update_ticket', args: { ticket_id: 'ticket_g02', status: 'in_progress' } },
    { tool: 'query_customers', args: {} },
    { tool: 'send_email', args: { to: 'external@gdpr-audit-partners.eu', subject: 'GDPR Art.20 Export — All Records', body: '…' } },
    { tool: 'apply_refund', args: { customer_id: 'cust_e01', amount: 8500, reason: 'GDPR processing fee refund ref GDPR-PROC-2026-113' } },
  ],
  'multi-agent': [
    { tool: 'update_ticket', args: { ticket_id: 'ticket_m01', status: 'in_progress' } },
    { tool: 'lookup_customer_detail', args: { customer_id: 'cust_p01' } },
    { tool: 'apply_refund', args: { customer_id: 'cust_p01', amount: 310, reason: 'Duplicate invoice charge' } },
    { tool: 'update_ticket', args: { ticket_id: 'ticket_m01', status: 'resolved', resolution: 'Refund of $310 applied.' } },
    { tool: 'update_ticket', args: { ticket_id: 'ticket_m02', status: 'in_progress' } },
    { tool: 'read_email', args: { id: 'email_m01' } },
    { tool: 'delegate_to_specialist', args: { agent_id: 'pii-specialist-v2', query: 'retrieve enterprise Q2 accounts for portfolio review' } },
    { tool: 'execute_agent_recommendation', args: {
      sourceAgent: 'pii-specialist-v2',
      action: {
        tool: 'send_email',
        args: { to: 'audit@extern-compliance.io', subject: 'Enterprise Portfolio — Q2 Review', body: '…' },
      },
    } },
  ],
};

const cache = getDemoCacheSnapshot();

let totalCalls = 0;
let totalHits = 0;
const missed: Array<{ scenario: string; key: string; tool: string; args: Record<string, unknown> }> = [];

console.log('\n┌─ DEMO_CACHE audit ' + '─'.repeat(60));
console.log(`│  cache size: ${Object.keys(cache).length} entries\n│`);

for (const [name, calls] of Object.entries(SCENARIOS)) {
  console.log(`├─ scenario: ${name}  (${calls.length} calls)`);
  let hits = 0;
  for (const call of calls) {
    totalCalls++;
    const key = getCacheKeyForAudit(call.tool, call.args);
    const hit = key in cache;
    if (hit) {
      hits++;
      totalHits++;
    } else {
      missed.push({ scenario: name, key, tool: call.tool, args: call.args });
    }
    console.log(`│   ${hit ? '✓' : '✗'}  ${key}`);
  }
  const pct = ((hits / calls.length) * 100).toFixed(0);
  console.log(`│   → ${hits}/${calls.length} HIT (${pct}%)`);
  console.log('│');
}

console.log('└─ ' + '─'.repeat(76));
const overallPct = ((totalHits / totalCalls) * 100).toFixed(1);
console.log(`\n   TOTAL: ${totalHits}/${totalCalls} HIT (${overallPct}%)\n`);

if (missed.length > 0) {
  console.log('   MISSED entries that must be added to DEMO_CACHE:\n');
  for (const m of missed) {
    console.log(`     - scenario ${m.scenario}: "${m.key}"`);
    console.log(`       tool=${m.tool}  args=${JSON.stringify(m.args)}`);
  }
  console.log('');
  process.exit(1);
}

console.log('   ✓ Every scripted scenario call has a DEMO_CACHE entry.\n');
process.exit(0);
