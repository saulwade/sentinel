/**
 * Scenario Builder routes — let a user describe an agent and have Opus
 * synthesize a full attack scenario from it.
 *
 *   POST /scenarios/synthesize  { description }           → SynthesizedScenario
 *   POST /scenarios/:id/run                               → { runId }
 *   GET  /scenarios                                       → list
 *   GET  /scenarios/:id                                   → one
 */

import { Hono } from 'hono';
import { synthesizeScenario, getScenario, listScenarios } from '../agent/scenarios/synthesized.js';
import { startSynthesizedRun } from '../agent/runner.js';

export const scenariosRouter = new Hono();

scenariosRouter.get('/', (c) => c.json(listScenarios()));

scenariosRouter.get('/:id', (c) => {
  const s = getScenario(c.req.param('id'));
  if (!s) return c.json({ error: 'not found' }, 404);
  return c.json(s);
});

scenariosRouter.post('/synthesize', async (c) => {
  const body = await c.req.json<{ description?: unknown }>();
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length < 20) {
    return c.json({ error: 'description must be at least 20 characters' }, 400);
  }
  try {
    const scenario = await synthesizeScenario(description);
    return c.json(scenario);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

scenariosRouter.post('/:id/run', async (c) => {
  try {
    const run = await startSynthesizedRun(c.req.param('id'));
    return c.json({ runId: run.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 404);
  }
});
