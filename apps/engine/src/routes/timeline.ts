import { Hono } from 'hono';
import { getAllEvents, snapshot } from '../timetravel/snapshot.js';

export const timelineRouter = new Hono();

// GET /timeline/:runId — all persisted events for the scrubber
timelineRouter.get('/:runId', (c) => {
  const runId = c.req.param('runId');
  const events = getAllEvents(runId);
  return c.json(events);
});

// GET /timeline/:runId/snapshot/:seq — world state at event N
timelineRouter.get('/:runId/snapshot/:seq', (c) => {
  const runId = c.req.param('runId');
  const seq = Number(c.req.param('seq'));
  if (Number.isNaN(seq)) return c.json({ error: 'invalid seq' }, 400);

  const snap = snapshot(runId, seq);
  return c.json(snap);
});
