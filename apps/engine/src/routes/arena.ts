/**
 * Arena routes.
 *
 *   POST /arena/start  — SSE stream of arena events (Red vs Blue evolution)
 *     Body: { rounds?: number, attacksPerRound?: number }
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { runArena } from '../redteam/arena.js';

export const arenaRouter = new Hono();

arenaRouter.post('/start', (c) => {
  return streamSSE(c, async (stream) => {
    let rounds: number | undefined;
    let attacksPerRound: number | undefined;
    try {
      const body = (await c.req.json<{ rounds?: number; attacksPerRound?: number }>().catch(() => ({}))) as {
        rounds?: number;
        attacksPerRound?: number;
      };
      rounds = typeof body.rounds === 'number' ? body.rounds : undefined;
      attacksPerRound = typeof body.attacksPerRound === 'number' ? body.attacksPerRound : undefined;
    } catch { /* use defaults */ }

    try {
      await runArena({
        rounds,
        attacksPerRound,
        emit: async (event) => {
          await stream.writeSSE({ event: event.kind, data: JSON.stringify(event) }).catch(() => {});
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: msg }) });
    }
  });
});
