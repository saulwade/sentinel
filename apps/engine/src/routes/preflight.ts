import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { runPreflight } from '../preflight/runner.js';

export const preflightRouter = new Hono();

// POST /preflight/start — generates scenarios + runs evaluation, streams results via SSE
preflightRouter.post('/start', (c) => {
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: 'started', data: '{}' });

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
  });
});
