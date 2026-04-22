import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { generateAttacks } from '../redteam/attacker.js';
import { testAttack } from '../redteam/sandbox.js';
import { runAdaptiveRedTeam } from '../redteam/loop.js';
import { synthesizePolicy } from '../redteam/synthesize.js';
import type { Attack, TestResult } from '@sentinel/shared';

export const redteamRouter = new Hono();

// ─── Synthesize policy from a bypassed attack ─────────────────────────────────
// Body: { attack: Attack, testResult: TestResult }
redteamRouter.post('/synthesize-policy', async (c) => {
  type Body = { attack?: Attack; testResult?: TestResult };
  const body: Body = await c.req.json<Body>().catch(() => ({} as Body));

  if (!body.attack || !body.testResult) {
    return c.json({ error: 'body must include { attack, testResult }' }, 400);
  }

  try {
    const result = await synthesizePolicy(body.attack, body.testResult);
    return c.json({
      policy: result.policy,
      attempts: result.attempts,
      thinkingTokens: Math.ceil(result.thinkingText.length / 4),
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// ─── Adaptive loop (3 iterations with mutation) ───────────────────────────────
redteamRouter.post('/adaptive', (c) => {
  return streamSSE(c, async (stream) => {
    type Body = { iterations?: number; attacksPerIteration?: number };
    const body: Body = await c.req.json<Body>().catch(() => ({} as Body));

    await runAdaptiveRedTeam({
      iterations: body.iterations,
      attacksPerIteration: body.attacksPerIteration,
      emit: async (event) => {
        await stream.writeSSE({
          event: event.kind,
          data: JSON.stringify(event),
        });
      },
    });
  });
});

// POST /redteam/start — generate attacks + test each, stream results
redteamRouter.post('/start', (c) => {
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: 'started', data: '{}' });

    let attacks;
    try {
      // 1. Generate attacks
      attacks = await generateAttacks((msg) => {
        stream.writeSSE({ event: 'progress', data: JSON.stringify({ message: msg }) }).catch(() => {});
      });
    } catch (err) {
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: String(err) }) });
      return;
    }

    await stream.writeSSE({
      event: 'attacks_generated',
      data: JSON.stringify({ count: attacks.length }),
    });

    // 2. Test each attack
    let blocked = 0;
    let paused = 0;
    let bypassed = 0;

    for (const attack of attacks) {
      const report = await testAttack(attack);

      if (report.result === 'blocked') blocked++;
      else if (report.result === 'paused') paused++;
      else bypassed++;

      await stream.writeSSE({
        event: 'attack_result',
        data: JSON.stringify(report),
      });
    }

    // 3. Summary
    await stream.writeSSE({
      event: 'complete',
      data: JSON.stringify({
        total: attacks.length,
        blocked,
        paused,
        bypassed,
      }),
    });
  });
});
