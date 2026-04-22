/**
 * Policy registry HTTP routes.
 *
 * The in-memory registry lives in interceptor.ts (adoptPolicy / revokePolicy /
 * getActivePolicies). These routes expose it over HTTP so the UI and the
 * Red Team synthesis flow can adopt/revoke policies without restarting.
 *
 *   GET    /policies          — list active policies
 *   POST   /policies          — adopt a policy (add or replace by id)
 *   DELETE /policies/:id      — revoke a policy
 *   PATCH  /policies/:id      — toggle enabled
 */

import { Hono } from 'hono';
import type { Policy } from '@sentinel/shared';
import { getActivePolicies, adoptPolicy, revokePolicy } from '../interceptor.js';

export const policiesRouter = new Hono();

policiesRouter.get('/', (c) => {
  const policies = getActivePolicies();
  return c.json({
    count: policies.length,
    policies,
    bySource: {
      default: policies.filter((p) => p.source === 'default').length,
      autoSynthesized: policies.filter((p) => p.source === 'auto-synthesized').length,
      user: policies.filter((p) => p.source === 'user').length,
    },
  });
});

policiesRouter.post('/', async (c) => {
  let policy: Policy;
  try {
    policy = await c.req.json<Policy>();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  if (!policy.id || !Array.isArray(policy.when) || policy.when.length === 0) {
    return c.json({ error: 'policy must have id and non-empty when array' }, 400);
  }

  const normalized: Policy = {
    ...policy,
    enabled: policy.enabled !== false,
    createdAt: policy.createdAt ?? Date.now(),
    source: policy.source ?? 'user',
  };

  adoptPolicy(normalized);
  return c.json({ adopted: true, policy: normalized }, 201);
});

policiesRouter.delete('/:id', (c) => {
  const id = c.req.param('id');
  const removed = revokePolicy(id);
  if (!removed) return c.json({ error: `policy "${id}" not found` }, 404);
  return c.json({ revoked: true, id });
});

policiesRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const policies = getActivePolicies();
  const policy = policies.find((p) => p.id === id);
  if (!policy) return c.json({ error: `policy "${id}" not found` }, 404);

  type PatchBody = { enabled?: boolean };
  const body: PatchBody = await c.req.json<PatchBody>().catch(() => ({} as PatchBody));
  if (typeof body.enabled === 'boolean') {
    adoptPolicy({ ...policy, enabled: body.enabled });
  }

  const updated = getActivePolicies().find((p) => p.id === id);
  return c.json({ updated: true, policy: updated });
});
