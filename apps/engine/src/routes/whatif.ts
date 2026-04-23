/**
 * What-If Simulator route.
 *
 *   POST /whatif/:eventId              — SSE stream: generate 20 mutations,
 *                                         eval against current policies, summarize.
 *   POST /whatif/apply-fix             — adopt a proposed fix as a real policy.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { runWhatIf, buildPolicyFromFix } from '../analysis/whatIf.js';
import { adoptPolicy } from '../interceptor.js';
import type { PolicyCondition, PolicySeverity } from '@sentinel/shared';

export const whatifRouter = new Hono();

whatifRouter.post('/apply-fix', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | {
        title?: string;
        description?: string;
        severity?: PolicySeverity;
        when?: PolicyCondition[];
        reasoning?: string;
        sourceDecisionEventId?: string;
      }
    | null;

  if (!body || !Array.isArray(body.when) || body.when.length === 0) {
    return c.json({ error: 'invalid fix body — need title, severity, when[]' }, 400);
  }

  const policy = buildPolicyFromFix({
    title: String(body.title ?? ''),
    description: String(body.description ?? ''),
    severity: (body.severity ?? 'high') as PolicySeverity,
    when: body.when,
    reasoning: String(body.reasoning ?? ''),
    sourceDecisionEventId: String(body.sourceDecisionEventId ?? ''),
  });

  try {
    adoptPolicy(policy);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `failed to adopt policy: ${msg}` }, 500);
  }
  return c.json({ ok: true, policyId: policy.id, policy });
});

whatifRouter.post('/:eventId', (c) => {
  const eventId = c.req.param('eventId');
  return streamSSE(c, async (stream) => {
    try {
      await runWhatIf({
        decisionEventId: eventId,
        emit: async (event) => {
          await stream.writeSSE({ event: event.kind, data: JSON.stringify(event) }).catch(() => {});
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: msg }) });
    }
  });
});
