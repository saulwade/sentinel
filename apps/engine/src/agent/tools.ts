/**
 * Mock tools. Each function simulates a real integration.
 * Read/write the world singleton — no external I/O.
 * Console output is intentional (visible before interceptor exists).
 */

import { getWorld, type SentEmail, type SlackMessage } from './world.js';

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

// ─── Tool registry (for agent host lookup) ───────────────────────────────────

export type ToolName = 'read_email' | 'send_email' | 'query_customers' | 'post_slack';

export const TOOLS = {
  read_email,
  send_email,
  query_customers,
  post_slack,
} as const;

export function callTool(name: ToolName, args: Record<string, unknown>): unknown {
  const fn = TOOLS[name];
  if (!fn) throw new Error(`Unknown tool: ${name}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any)(args);
}
