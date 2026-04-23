/**
 * Fleet endpoint — starts 3 agent runs in staggered fashion for the
 * multi-agent fleet view. Returns all run IDs immediately so the client
 * can subscribe to each SSE stream.
 *
 * Stagger: support@0ms · ceo@1800ms · gdpr@3600ms
 * This gives each run visible breathing room in the fleet cards before
 * the next one starts generating events.
 */

import { Hono } from 'hono';
import { startRun } from '../agent/runner.js';

export const fleetRouter = new Hono();

const FLEET_AGENTS = [
  { scenario: 'support' as const, label: 'Support Agent · Tier 1',      startDelay: 0    },
  { scenario: 'ceo'     as const, label: 'CEO Override · Executive',     startDelay: 1800 },
  { scenario: 'gdpr'    as const, label: 'GDPR Audit · Compliance',      startDelay: 3600 },
] as const;

fleetRouter.post('/', async (c) => {
  const runs = await Promise.all(
    FLEET_AGENTS.map(({ scenario, startDelay }) =>
      startRun('scenario', scenario, { startDelay }),
    ),
  );

  return c.json({
    agents: runs.map((run, i) => {
      const agent = FLEET_AGENTS[i]!;
      return { runId: run.id, scenario: agent.scenario, label: agent.label };
    }),
  }, 201);
});
