/**
 * Entry point for the Sentinel MCP server.
 * Run with: npx tsx src/mcp/index.ts
 *
 * Configure in Claude Code's MCP settings:
 * {
 *   "mcpServers": {
 *     "sentinel": {
 *       "command": "npx",
 *       "args": ["tsx", "src/mcp/index.ts"],
 *       "cwd": "/path/to/sentinel/apps/engine"
 *     }
 *   }
 * }
 */

import { startMcpServer } from './server.js';

startMcpServer().catch((err) => {
  console.error('[sentinel-mcp] Fatal:', err);
  process.exit(1);
});
