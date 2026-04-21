import { Hono } from 'hono';
import { resolveDecision } from '../interceptor.js';

export const decisionsRouter = new Hono();

// POST /decide/:eventId — human approves or rejects a paused action
decisionsRouter.post('/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const body = await c.req.json<{ action: 'approve' | 'reject' }>();

  if (!body.action || !['approve', 'reject'].includes(body.action)) {
    return c.json({ error: 'body must contain action: "approve" | "reject"' }, 400);
  }

  const resolved = resolveDecision(eventId, body.action);
  if (!resolved) {
    return c.json({ error: 'no pending decision for this eventId' }, 404);
  }

  return c.json({ ok: true, eventId, action: body.action });
});
