/**
 * Security Committee route.
 *
 *   POST /committee/:eventId  — SSE stream
 *     4 Opus calls (3 personas parallel + 1 moderator) deliberate a BLOCK.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { convokeCommittee } from '../analysis/committee.js';

export const committeeRouter = new Hono();

committeeRouter.post('/:eventId', (c) => {
  const eventId = c.req.param('eventId');
  return streamSSE(c, async (stream) => {
    try {
      await convokeCommittee({
        decisionEventId: eventId,
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
