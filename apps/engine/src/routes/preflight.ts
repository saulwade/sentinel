import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { runPreflight } from '../preflight/runner.js';

export const preflightRouter = new Hono();

// POST /preflight/start — generates scenarios + runs evaluation, streams results via SSE
preflightRouter.post('/start', (c) => {
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: 'started', data: '{}' });

    try {
      const result = await runPreflight(
        (dayResult) => {
          stream.writeSSE({
            event: 'day',
            data: JSON.stringify(dayResult),
          }).catch(() => {});
        },
        (msg) => {
          stream.writeSSE({
            event: 'progress',
            data: JSON.stringify({ message: msg }),
          }).catch(() => {});
        },
      );

      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify(result),
      });
    } catch (err) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      }).catch(() => {});
    }
  });
});
