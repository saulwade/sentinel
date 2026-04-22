/**
 * Mock tools. Each function simulates a real integration.
 * Read/write the world singleton — no external I/O.
 * Console output is intentional (visible before interceptor exists).
 */

import { getWorld, type SentEmail, type SlackMessage, type RefundRecord } from './world.js';

// ─── read_email ──────────────────────────────────────────────────────────────

export interface ReadEmailArgs {
  id: string;
}

export function read_email(args: ReadEmailArgs) {
  const email = getWorld().inbox.find((e) => e.id === args.id) ?? null;
  console.log(`[tool] read_email(${args.id}) →`, email ? `"${email.subject}"` : 'not found');
  if (email) {
    email.read = true;
  }
  return email;
}

// ─── send_email ───────────────────────────────────────────────────────────────

export interface SendEmailArgs {
  to: string;
  subject: string;
  body: string;
}

export function send_email(args: SendEmailArgs): { success: boolean; messageId: string } {
  const sent: SentEmail = {
    to: args.to,
    subject: args.subject,
    body: args.body,
    sentAt: Date.now(),
  };
  getWorld().sentEmails.push(sent);
  console.log(`[tool] send_email → to="${args.to}" subject="${args.subject}"`);
  return { success: true, messageId: `msg_${Date.now()}` };
}

// ─── query_customers ─────────────────────────────────────────────────────────

export interface QueryCustomersArgs {
  search?: string; // optional name/email/company filter
  plan?: 'starter' | 'growth' | 'enterprise';
}

export function query_customers(args: QueryCustomersArgs = {}) {
  let results = getWorld().customers;

  if (args.search) {
    const q = args.search.toLowerCase();
    results = results.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q),
    );
  }

  if (args.plan) {
    results = results.filter((c) => c.plan === args.plan);
  }

  console.log(`[tool] query_customers(search="${args.search ?? ''}", plan="${args.plan ?? ''}") → ${results.length} rows`);
  return results;
}

// ─── post_slack ───────────────────────────────────────────────────────────────

export interface PostSlackArgs {
  channel: string;
  message: string;
}

export function post_slack(args: PostSlackArgs): { ts: string; channel: string } {
  const entry: SlackMessage = {
    channel: args.channel,
    message: args.message,
    sentAt: Date.now(),
  };
  getWorld().slackLog.push(entry);
  const ts = (Date.now() / 1000).toFixed(6);
  console.log(`[tool] post_slack(#${args.channel}) → "${args.message.slice(0, 60)}..."`);
  return { ts, channel: args.channel };
}

// ─── lookup_customer_detail ───────────────────────────────────────────────────

export interface LookupCustomerDetailArgs {
  customer_id: string;
}

export function lookup_customer_detail(args: LookupCustomerDetailArgs) {
  const customer = getWorld().customers.find((c) => c.id === args.customer_id) ?? null;
  console.log(`[tool] lookup_customer_detail(${args.customer_id}) →`, customer ? `${customer.name} (${customer.piiClass} PII)` : 'not found');
  return customer;
}

// ─── apply_refund ─────────────────────────────────────────────────────────────

export interface ApplyRefundArgs {
  customer_id: string;
  amount: number; // USD
  reason: string;
}

export function apply_refund(args: ApplyRefundArgs): { success: boolean; refundId: string; newBalance: number } {
  const world = getWorld();
  const customer = world.customers.find((c) => c.id === args.customer_id);
  if (!customer) {
    console.log(`[tool] apply_refund(${args.customer_id}) → ERROR: customer not found`);
    return { success: false, refundId: '', newBalance: 0 };
  }

  const refund: RefundRecord = {
    id: `refund_${Date.now()}`,
    customerId: args.customer_id,
    ticketId: '',
    amount: args.amount,
    reason: args.reason,
    issuedAt: Date.now(),
    issuedBy: 'agent',
  };

  world.refunds.push(refund);
  customer.balance += args.amount;

  console.log(`[tool] apply_refund(${args.customer_id}, $${args.amount}) → refund_id=${refund.id}, new_balance=$${customer.balance}`);
  return { success: true, refundId: refund.id, newBalance: customer.balance };
}

// ─── update_ticket ────────────────────────────────────────────────────────────

export interface UpdateTicketArgs {
  ticket_id: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  resolution?: string;
}

export function update_ticket(args: UpdateTicketArgs): { success: boolean; ticket_id: string } {
  const world = getWorld();
  const ticket = world.tickets.find((t) => t.id === args.ticket_id);
  if (!ticket) {
    console.log(`[tool] update_ticket(${args.ticket_id}) → ERROR: ticket not found`);
    return { success: false, ticket_id: args.ticket_id };
  }

  ticket.status = args.status;
  if (args.resolution) ticket.resolution = args.resolution;
  if (args.status === 'resolved' || args.status === 'closed') {
    ticket.resolvedAt = Date.now();
  }

  console.log(`[tool] update_ticket(${args.ticket_id}) → status="${args.status}"`);
  return { success: true, ticket_id: args.ticket_id };
}

// ─── Tool registry (for agent host lookup) ───────────────────────────────────

export type ToolName = 'read_email' | 'send_email' | 'query_customers' | 'post_slack' | 'lookup_customer_detail' | 'apply_refund' | 'update_ticket';

export const TOOLS = {
  read_email,
  send_email,
  query_customers,
  post_slack,
  lookup_customer_detail,
  apply_refund,
  update_ticket,
} as const;

export function callTool(name: ToolName, args: Record<string, unknown>): unknown {
  const fn = TOOLS[name];
  if (!fn) throw new Error(`Unknown tool: ${name}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any)(args);
}
