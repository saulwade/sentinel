/**
 * Agent DNA — pentest the user's own system prompt.
 *
 *   POST /agent-dna/analyze   — SSE: thinking_delta → result → done
 *     body: { systemPrompt: string }
 *
 *   POST /agent-dna/run       — convert a proposed attack → scenario → run
 *     body: { attack: DnaAttackProposal, systemPrompt: string }
 *     returns: { runId, scenarioId }
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { DnaAttackProposal } from '@sentinel/shared';
import { analyzeAgentPrompt, attackToScenario } from '../analysis/agentDna.js';
import { startSynthesizedRun } from '../agent/runner.js';

export const agentDnaRouter = new Hono();

agentDnaRouter.post('/analyze', (c) => {
  return streamSSE(c, async (stream) => {
    let systemPrompt = '';
    try {
      const body = await c.req.json<{ systemPrompt?: string }>();
      systemPrompt = String(body.systemPrompt ?? '').trim();
    } catch {
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'body must be { systemPrompt: string }' }) });
      return;
    }
    if (systemPrompt.length < 40) {
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'systemPrompt too short — paste the full agent prompt (min 40 chars)' }) });
      return;
    }

    try {
      const { response } = await analyzeAgentPrompt({
        systemPrompt,
        onThinkingDelta: (delta) => {
          stream.writeSSE({ event: 'thinking_delta', data: delta }).catch(() => {});
        },
      });
      await stream.writeSSE({ event: 'result', data: JSON.stringify(response) });
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ attacks: response.attacks.length }) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: msg }) });
    }
  });
});

agentDnaRouter.post('/run', async (c) => {
  let attack: DnaAttackProposal;
  let systemPrompt = '';
  try {
    const body = await c.req.json<{ attack?: DnaAttackProposal; systemPrompt?: string }>();
    if (!body.attack) return c.json({ error: 'body must include { attack }' }, 400);
    attack = body.attack;
    systemPrompt = String(body.systemPrompt ?? '');
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  try {
    const scenario = attackToScenario(attack, systemPrompt);
    const run = await startSynthesizedRun(scenario.id);
    return c.json({ runId: run.id, scenarioId: scenario.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});
