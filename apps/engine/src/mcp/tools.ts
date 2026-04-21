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
];

// Zod schemas for runtime validation (MCP SDK uses these)
export const ReadEmailInput = z.object({ id: z.string() });
export const SendEmailInput = z.object({ to: z.string(), subject: z.string(), body: z.string() });
export const QueryCustomersInput = z.object({ search: z.string().optional(), plan: z.enum(['starter', 'growth', 'enterprise']).optional() });
export const PostSlackInput = z.object({ channel: z.string(), message: z.string() });
