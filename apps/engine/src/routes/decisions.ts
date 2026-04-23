import { Hono } from 'hono';
import { resolveDecision } from '../interceptor.js';

export const decisionsRouter = new Hono();

// POST /decide/:eventId — human approves or rejects a paused action
decisionsRouter.post('/:eventId', async (c) => {
  const eventId = c.req.param('eventId');

  let body: { action?: 'approve' | 'reject' };
  try {
    body = await c.req.json<{ action: 'approve' | 'reject' }>();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  if (!body.action || !['approve', 'reject'].includes(body.action)) {
    return c.json({ error: 'body must contain action: "approve" | "reject"' }, 400);
  }

  const resolved = resolveDecision(eventId, body.action);
  if (!resolved) {
    return c.json({ error: 'no pending decision for this eventId' }, 404);
  }

  return c.json({ ok: true, eventId, action: body.action });
});
