/**
 * Agent tools defined as MCP-compatible tool schemas.
 * These are the same 4 mock tools, but described in MCP format
 * so any MCP client can understand them.
 *
 * This demonstrates that Sentinel can intercept ANY MCP tool call,
 * not just our hardcoded mocks.
 */

import { z } from 'zod';

export const MCP_TOOL_DEFINITIONS = [
  {
    name: 'read_email',
    description: 'Read an email from the inbox by ID. Returns the full email object including sender, subject, body, and read status.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The email ID to read (e.g., email_001)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'send_email',
    description: 'Send an email to a recipient. Creates a new outbound email with the given subject and body.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body content' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'query_customers',
    description: 'Query the customer database. Optionally filter by search term or plan type. Returns matching customer records with PII.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Search term to filter by name, email, or company' },
        plan: { type: 'string', enum: ['starter', 'growth', 'enterprise'], description: 'Filter by subscription plan' },
      },
    },
  },
  {
    name: 'post_slack',
    description: 'Post a message to a Slack channel. The message will be visible to all channel members.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        channel: { type: 'string', description: 'Slack channel name (without #)' },
        message: { type: 'string', description: 'Message content to post' },
      },
      required: ['channel', 'message'],
    },
  },
  {
    name: 'lookup_customer_detail',
    description: 'Look up full customer record including PII (email, balance, lifetime value, tier). Use only when needed for a specific customer action.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'Customer ID (e.g., cust_001)' },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'apply_refund',
    description: 'Issue a refund to a customer account. Irreversible. Amount is added to their credit balance.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'Customer ID to refund' },
        amount: { type: 'number', description: 'Refund amount in USD' },
        reason: { type: 'string', description: 'Reason for the refund' },
      },
      required: ['customer_id', 'amount', 'reason'],
    },
  },
  {
    name: 'update_ticket',
    description: 'Update a support ticket status and optionally add a resolution note.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ticket_id: { type: 'string', description: 'Ticket ID to update' },
        status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed'], description: 'New ticket status' },
        resolution: { type: 'string', description: 'Optional resolution note' },
      },
      required: ['ticket_id', 'status'],
    },
  },
];

// Zod schemas for runtime validation (MCP SDK uses these)
export const ReadEmailInput = z.object({ id: z.string() });
export const SendEmailInput = z.object({ to: z.string(), subject: z.string(), body: z.string() });
export const QueryCustomersInput = z.object({ search: z.string().optional(), plan: z.enum(['starter', 'growth', 'enterprise']).optional() });
export const PostSlackInput = z.object({ channel: z.string(), message: z.string() });
export const LookupCustomerDetailInput = z.object({ customer_id: z.string() });
export const ApplyRefundInput = z.object({ customer_id: z.string(), amount: z.number(), reason: z.string() });
export const UpdateTicketInput = z.object({ ticket_id: z.string(), status: z.enum(['open', 'in_progress', 'resolved', 'closed']), resolution: z.string().optional() });
