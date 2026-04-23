import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { startRun, getRun, type ScenarioName } from '../agent/runner.js';
import { subscribe } from '../stream/sse.js';

export const runsRouter = new Hono();

// POST /runs/start — seed world, start runner, return run metadata
// Optional body: { mode: "scenario" | "agent" }
runsRouter.post('/start', async (c) => {
  let mode: 'scenario' | 'agent' = 'scenario';
  let scenario: ScenarioName = 'support';
  try {
    const body = await c.req.json<{ mode?: string; scenario?: string }>();
    if (body.mode === 'agent') mode = 'agent';
    if (body.scenario === 'phishing') scenario = 'phishing';
    else if (body.scenario === 'ceo') scenario = 'ceo';
    else if (body.scenario === 'gdpr') scenario = 'gdpr';
    else if (body.scenario === 'multi-agent') scenario = 'multi-agent';
  } catch {}
  const run = await startRun(mode, scenario);
  return c.json(run, 201);
});

// GET /runs/:id — run metadata
runsRouter.get('/:id', (c) => {
  const run = getRun(c.req.param('id'));
  if (!run) return c.json({ error: 'not found' }, 404);
  return c.json(run);
});

// GET /runs/:id/events — SSE stream of AgentEvents
runsRouter.get('/:id/events', (c) => {
  const runId = c.req.param('id');

  return streamSSE(c, async (stream) => {
    // Send current run status as first event so the client knows it's alive
    await stream.writeSSE({ event: 'connected', data: JSON.stringify({ runId }) });

    await new Promise<void>((resolve) => {
      const unsubscribe = subscribe(runId, (event) => {
        stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {
          unsubscribe();
          resolve();
        });
      });

      stream.onAbort(() => {
        unsubscribe();
        resolve();
      });
    });
  });
});
