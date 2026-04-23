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
import { streamSSE } from 'hono/streaming';
import type { Policy } from '@sentinel/shared';
import { getActivePolicies, adoptPolicy, revokePolicy } from '../interceptor.js';
import { getAllRuns } from '../agent/runner.js';
import { getAllEvents } from '../timetravel/snapshot.js';
import { evaluatePolicies } from '../policies/engine.js';
import { getWorld } from '../agent/world.js';
import { synthesizePolicyFromText } from '../redteam/synthesize.js';
import { auditPolicies } from '../analysis/driftDetect.js';

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

// ─── Export / Import ─────────────────────────────────────────────────────────

policiesRouter.get('/export', (c) => {
  const policies = getActivePolicies();
  const filename = `sentinel-policies-${new Date().toISOString().slice(0, 10)}.json`;
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  c.header('Content-Type', 'application/json');
  return c.body(JSON.stringify(policies, null, 2));
});

policiesRouter.post('/import', async (c) => {
  let incoming: unknown;
  try {
    incoming = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  if (!Array.isArray(incoming)) {
    return c.json({ error: 'body must be a JSON array of policies' }, 400);
  }

  const adopted: string[] = [];
  const failed: Array<{ id: unknown; reason: string }> = [];

  for (const item of incoming) {
    const p = item as Partial<Policy>;
    if (!p.id || !p.name || !Array.isArray(p.when) || p.when.length === 0) {
      failed.push({ id: p.id ?? '?', reason: 'missing required fields (id, name, when)' });
      continue;
    }
    const normalized: Policy = {
      ...p as Policy,
      enabled: p.enabled !== false,
      createdAt: p.createdAt ?? Date.now(),
      source: p.source ?? 'user',
    };
    adoptPolicy(normalized);
    adopted.push(normalized.id);
  }

  return c.json({ adopted: adopted.length, failed: failed.length, details: { adopted, failed } }, 200);
});

// ─── Policy Simulator ─────────────────────────────────────────────────────────
// Test a draft policy against historical runs before adopting it.
// Returns: how many tool calls it would catch, how many it would false-positive on.

policiesRouter.post('/simulate', async (c) => {
  let policy: Policy;
  try {
    policy = await c.req.json<{ policy: Policy }>().then((b) => b.policy);
  } catch {
    return c.json({ error: 'body must be { policy: Policy }' }, 400);
  }
  if (!policy?.id || !Array.isArray(policy.when)) {
    return c.json({ error: 'invalid policy' }, 400);
  }

  const runs = getAllRuns();
  const world = getWorld(); // approximation — good enough for DSL evaluation

  interface MatchedEvent {
    runId: string;
    seq: number;
    tool: string;
    args: Record<string, unknown>;
    actualVerdict: string;
    simulatedAction: string;
  }

  let wouldBlock = 0;
  let wouldPause = 0;
  let falsePositives = 0; // policy fires on events that were originally ALLOW
  const matchedEvents: MatchedEvent[] = [];

  for (const run of runs) {
    const events = getAllEvents(run.id);
    for (const ev of events) {
      if (ev.type !== 'tool_call') continue;

      const payload = ev.payload as Record<string, unknown>;
      const call = {
        tool: String(payload.tool ?? ''),
        args: (payload.args ?? {}) as Record<string, unknown>,
      };

      const match = evaluatePolicies([policy], call, world);
      if (!match) continue;

      // Find the actual verdict for this tool call (next decision event)
      const decisionEv = events.find(
        (d) => d.type === 'decision' && d.seq === ev.seq + 1,
      );
      const actualVerdict = String(
        (decisionEv?.payload as Record<string, unknown>)?.verdict ?? 'UNKNOWN',
      );

      if (match.action === 'block') wouldBlock++;
      if (match.action === 'pause') wouldPause++;
      if (actualVerdict === 'ALLOW') falsePositives++;

      matchedEvents.push({
        runId: run.id,
        seq: ev.seq,
        tool: call.tool,
        args: call.args,
        actualVerdict,
        simulatedAction: match.action,
      });
    }
  }

  const totalMatches = wouldBlock + wouldPause;

  return c.json({
    totalRuns: runs.length,
    totalMatches,
    wouldBlock,
    wouldPause,
    falsePositives,
    matchedEvents: matchedEvents.slice(0, 20), // cap at 20 for response size
  });
});

// ─── Natural-language policy authoring ────────────────────────────────────────
// Proactive flow: user describes a policy in plain English, Opus synthesizes
// the DSL. The returned policy is NOT adopted automatically — caller should
// preview it, optionally run /policies/simulate, then POST /policies to adopt.

policiesRouter.post('/synthesize-from-text', async (c) => {
  let description = '';
  try {
    const body = await c.req.json<{ description?: string }>();
    description = String(body.description ?? '');
  } catch {
    return c.json({ error: 'body must be { description: string }' }, 400);
  }

  if (description.trim().length < 8) {
    return c.json({ error: 'description is too short' }, 400);
  }

  try {
    const result = await synthesizePolicyFromText(description);
    return c.json({
      policy: result.policy,
      rationale: result.rationale,
      thinkingText: result.thinkingText,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

// ─── Drift audit (Opus meta-audits the policy set) ────────────────────────────

policiesRouter.post('/audit', (c) => {
  return streamSSE(c, async (stream) => {
    try {
      const { response, thinkingText } = await auditPolicies({
        onThinkingDelta: (delta) => {
          stream.writeSSE({ event: 'thinking_delta', data: delta }).catch(() => {});
        },
      });
      await stream.writeSSE({ event: 'result', data: JSON.stringify(response) });
      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ thinkingTokens: Math.ceil(thinkingText.length / 4) }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: msg }) });
    }
  });
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
