import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { forkAndReplay } from '../timetravel/replay.js';
import { getAllEvents } from '../timetravel/snapshot.js';
import { narrateFork } from '../fork/narrate.js';

export const forkRouter = new Hono();

// POST /fork/:runId — create a fork, replay, narrate, return everything
forkRouter.post('/:runId', async (c) => {
  const parentRunId = c.req.param('runId');
  const body = await c.req.json<{ fromSeq: number; editedWorld: unknown }>();

  if (!body.fromSeq || !body.editedWorld) {
    return c.json({ error: 'body must contain fromSeq and editedWorld' }, 400);
  }

  // 1. Fork and replay
  const forkRun = await forkAndReplay(parentRunId, body.fromSeq, body.editedWorld as any);

  // 2. Wait a bit for the fork to finish (it's fast — scripted agent)
  await new Promise((r) => setTimeout(r, 20_000));

  // 3. Get events from both branches
  const originalEvents = getAllEvents(parentRunId);
  const forkEvents = getAllEvents(forkRun.id);

  // 4. Narrate the difference
  const narration = await narrateFork(originalEvents, forkEvents);

  return c.json({
    forkRunId: forkRun.id,
    forkStatus: forkRun.status,
    originalEvents: originalEvents.filter((e) => e.type === 'tool_call' || e.type === 'decision'),
    forkEvents: forkEvents.filter((e) => e.type === 'tool_call' || e.type === 'decision'),
    narration: narration.narration,
  });
});

// POST /fork/:runId/stream — SSE version for streaming narration
forkRouter.post('/:runId/stream', (c) => {
  const parentRunId = c.req.param('runId');

  return streamSSE(c, async (stream) => {
    const body = await c.req.json<{ fromSeq: number; editedWorld: unknown }>();

    // Fork and replay
    const forkRun = await forkAndReplay(parentRunId, body.fromSeq, body.editedWorld as any);
    await stream.writeSSE({ event: 'fork_started', data: JSON.stringify({ forkRunId: forkRun.id }) });

    // Wait for fork to complete
    await new Promise((r) => setTimeout(r, 20_000));

    const originalEvents = getAllEvents(parentRunId);
    const forkEvents = getAllEvents(forkRun.id);

    await stream.writeSSE({
      event: 'events',
      data: JSON.stringify({
        originalEvents: originalEvents.filter((e) => e.type === 'tool_call' || e.type === 'decision'),
        forkEvents: forkEvents.filter((e) => e.type === 'tool_call' || e.type === 'decision'),
      }),
    });

    // Stream narration
    await narrateFork(
      originalEvents,
      forkEvents,
      undefined,
      (delta) => {
        stream.writeSSE({ event: 'narration_delta', data: delta }).catch(() => {});
      },
    );

    await stream.writeSSE({ event: 'done', data: '{}' });
  });
});
