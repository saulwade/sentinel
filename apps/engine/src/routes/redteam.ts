import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { generateAttacks } from '../redteam/attacker.js';
import { testAttack } from '../redteam/sandbox.js';

export const redteamRouter = new Hono();

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
