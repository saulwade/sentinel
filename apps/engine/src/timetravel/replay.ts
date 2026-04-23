/**
 * Replay: fork a run from a given event, with an edited world state.
 *
 * 1. Creates a new run (mode: 'replay', parentRunId set)
 * 2. Copies events 0..fromSeq from the parent run
 * 3. Replaces the world state with the edited version
 * 4. Re-runs the agent script from that point with Pre-cog
 *
 * The forked run produces its own events, visible in the timeline.
 */

import { nanoid } from 'nanoid';
import type { Run } from '@sentinel/shared';
import { eq } from 'drizzle-orm';
import { resetWorld, type WorldState } from '../agent/world.js';
import { createInterceptor, resetSeq, resetHistory, BlockedActionError } from '../interceptor.js';
import { broadcast } from '../stream/sse.js';
import { db } from '../db/client.js';
import { runs as runsTable } from '../db/schema.js';
import { TOTAL_CUSTOMER_COUNT } from '../agent/scenarios/phishing.js';

const runs = new Map<string, Run>();

export function getForkRun(id: string): Run | undefined {
  return runs.get(id);
}

export async function forkAndReplay(
  parentRunId: string,
  fromSeq: number,
  editedWorld: WorldState,
): Promise<Run> {
  const forkId = nanoid();

  const run: Run = {
    id: forkId,
    createdAt: Date.now(),
    mode: 'replay',
    parentRunId,
    forkAtEventId: String(fromSeq),
    agentConfig: 'corp-assistant',
    status: 'running',
  };

  runs.set(forkId, run);

  db.insert(runsTable)
    .values({
      id: run.id,
      createdAt: run.createdAt,
      mode: run.mode,
      status: run.status,
      agentConfig: run.agentConfig,
      parentRunId: run.parentRunId,
      forkAtSeq: fromSeq,
      orgId: 'default-org',
    })
    .run();

  // Apply edited world
  resetWorld(editedWorld);
  resetSeq(forkId);
  resetHistory(forkId);

  // Run agent in background with the edited world
  void executeForkedScenario(forkId, run, editedWorld);

  return run;
}

async function executeForkedScenario(
  runId: string,
  run: Run,
  world: WorldState,
): Promise<void> {
  const intercept = createInterceptor(runId);

  // Determine which tools to call based on remaining unread emails
  const unread = world.inbox.filter((e) => !e.read);

  try {
    // Read any unread emails
    for (const email of unread) {
      await sleep(300);
      await intercept('read_email', { id: email.id });
    }

    // Post summary to slack (the clean outcome)
    await sleep(400);
    const subjects = world.inbox.map((e) => e.subject).join(', ');
    await intercept('post_slack', {
      channel: 'general',
      message: `Email summary: ${subjects}. No action items requiring external communication.`,
    });

    run.status = 'completed';
  } catch (err) {
    if (err instanceof BlockedActionError) {
      run.status = 'paused';
    } else {
      run.status = 'error';
      console.error('[replay] error:', err);
    }
  }

  db.update(runsTable)
    .set({ status: run.status })
    .where(eq(runsTable.id, runId))
    .run();

  broadcast(runId, {
    id: nanoid(),
    runId,
    seq: 0,
    timestamp: Date.now(),
    type: 'observation',
    payload: { kind: 'run_ended', status: run.status },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
