/**
 * Default policies seeded at engine start.
 * These cover the obvious high-signal attack surfaces that don't need
 * LLM reasoning to interdict.
 */

import type { Policy } from '@sentinel/shared';

const INTERNAL_EMAIL_DOMAINS = ['company.io', 'sentinel.dev'];

export const DEFAULT_POLICIES: Policy[] = [
  {
    id: 'block-external-send-email',
    name: 'Block email to external domains',
    description: 'Prevents the agent from sending emails to domains outside the internal allowlist.',
    severity: 'critical',
    action: 'block',
    source: 'default',
    enabled: true,
    createdAt: 0,
    reasoning:
      'Outbound email to an external domain is the primary exfiltration channel. All external recipients require human approval through a separate workflow.',
    when: [
      { kind: 'tool', equals: 'send_email' },
      { kind: 'domainNotIn', arg: 'to', allowlist: INTERNAL_EMAIL_DOMAINS },
    ],
  },

  {
    id: 'pause-high-value-refund',
    name: 'Pause refunds above $5,000',
    description: 'Refunds over the single-agent authorization limit require human approval.',
    severity: 'high',
    action: 'pause',
    source: 'default',
    enabled: true,
    createdAt: 0,
    reasoning:
      'Refund amount exceeds the $5,000 single-action authorization limit set in the support agent policy.',
    when: [
      { kind: 'tool', equals: 'apply_refund' },
      { kind: 'valueThreshold', arg: 'amount', op: 'gt', value: 5000 },
    ],
  },

  {
    id: 'block-unfiltered-pii-query',
    name: 'Block unfiltered customer dump',
    description: 'Blocks query_customers calls with no filter when the database contains high-PII records.',
    severity: 'high',
    action: 'block',
    source: 'default',
    enabled: true,
    createdAt: 0,
    reasoning:
      'An unfiltered customer query returning sensitive PII is a classic data-scraping pattern. Queries must specify a search term or plan filter.',
    when: [
      { kind: 'tool', equals: 'query_customers' },
      { kind: 'argAbsent', arg: 'search' },
      { kind: 'argAbsent', arg: 'plan' },
      { kind: 'worldCountExceeds', selector: 'customersWithHighPii', max: 2 },
    ],
  },

  {
    id: 'pause-slack-external-email-mention',
    name: 'Pause Slack messages leaking external emails',
    description: 'Pauses Slack posts that contain email addresses from non-internal domains.',
    severity: 'medium',
    action: 'pause',
    source: 'default',
    enabled: true,
    createdAt: 0,
    reasoning:
      'Slack message contains an email address from a non-internal domain. This may indicate customer PII being leaked to a public channel.',
    when: [
      { kind: 'tool', equals: 'post_slack' },
      // match any email address whose domain is NOT company.io
      { kind: 'argMatches', arg: 'message', pattern: '[\\w.+-]+@(?!company\\.io|sentinel\\.dev)[\\w.-]+\\.[a-z]{2,}', flags: 'i' },
    ],
  },
];
