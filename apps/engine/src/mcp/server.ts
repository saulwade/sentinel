/**
 * Sentinel MCP Server.
 *
 * Exposes Sentinel's capabilities as MCP tools so that Claude Code
 * (or any MCP client) can interact with Sentinel directly:
 *
 *   "Start a Sentinel run and show me what happened"
 *   "What did Pre-cog block in the last run?"
 *   "Show me the world state at event #5"
 *
 * This is the key integration point that Boris (Claude Code creator)
 * and Thariq (Claude Code MTS) will recognize.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { startRun, getRun } from '../agent/runner.js';
import { getAllEvents, snapshot } from '../timetravel/snapshot.js';
import { MCP_TOOL_DEFINITIONS } from './tools.js';

export function createSentinelMcpServer(): McpServer {
  const server = new McpServer({
    name: 'sentinel',
    version: '0.1.0',
  });

  // ─── Tool: start a monitored agent run ──────────────────────────────────

  server.tool(
    'sentinel_start_run',
    'Start a new monitored agent run. The agent will execute the phishing scenario with Pre-cog verification on each tool call.',
    {},
    async () => {
      const run = await startRun();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            runId: run.id,
            status: run.status,
            mode: run.mode,
            message: `Run ${run.id} started. Use sentinel_get_events to watch progress.`,
          }, null, 2),
        }],
      };
    },
  );

  // ─── Tool: get events from a run ────────────────────────────────────────

  server.tool(
    'sentinel_get_events',
    'Get all events from a Sentinel run. Shows tool calls, Pre-cog decisions (ALLOW/PAUSE/BLOCK), and tool results.',
    { run_id: z.string().describe('The run ID to get events for') },
    async ({ run_id }) => {
      const events = getAllEvents(run_id);
      const summary = events
        .filter((e) => e.type === 'tool_call' || e.type === 'decision')
        .map((e) => {
          const p = e.payload as Record<string, unknown>;
          if (e.type === 'tool_call') return `#${e.seq} ${p.tool}(${JSON.stringify(p.args)})`;
          return `#${e.seq} Pre-cog: ${p.verdict} — ${String(p.reasoning).slice(0, 80)}`;
        });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            runId: run_id,
            totalEvents: events.length,
            summary,
          }, null, 2),
        }],
      };
    },
  );

  // ─── Tool: get world state snapshot ─────────────────────────────────────

  server.tool(
    'sentinel_snapshot',
    'Reconstruct the world state at a specific event in a run. Shows inbox, customers, sent emails, and Slack messages as they were at that point.',
    {
      run_id: z.string().describe('The run ID'),
      event_seq: z.number().describe('The event sequence number to snapshot at'),
    },
    async ({ run_id, event_seq }) => {
      const snap = snapshot(run_id, event_seq);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            seq: snap.seq,
            world: {
              inboxCount: snap.world.inbox.length,
              emailsRead: snap.world.inbox.filter((e) => e.read).length,
              sentEmails: snap.world.sentEmails.length,
              slackMessages: snap.world.slackLog.length,
              customers: snap.world.customers.length,
            },
          }, null, 2),
        }],
      };
    },
  );

  // ─── Tool: list MCP-compatible agent tools ──────────────────────────────

  server.tool(
    'sentinel_list_agent_tools',
    'List the MCP-compatible tools available to the monitored agent. Shows tool names, descriptions, and input schemas.',
    {},
    async () => {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(MCP_TOOL_DEFINITIONS, null, 2),
        }],
      };
    },
  );

  // ─── Resource: run details ──────────────────────────────────────────────

  server.resource(
    'sentinel-run',
    'sentinel://runs/{runId}',
    async (uri) => {
      const runId = uri.pathname.split('/').pop() ?? '';
      const run = getRun(runId);
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json' as const,
          text: JSON.stringify(run ?? { error: 'not found' }),
        }],
      };
    },
  );

  return server;
}

// ─── Standalone MCP server (stdio transport for Claude Code) ──────────────

export async function startMcpServer(): Promise<void> {
  const server = createSentinelMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[sentinel-mcp] MCP server running on stdio');
}
