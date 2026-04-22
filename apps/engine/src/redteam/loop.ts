/**
 * Red Team adaptive loop orchestrator.
 *
 * Runs N iterations of generate → test against real defense stack.
 * Streams events through a provided emitter so SSE routes (and eventually
 * the UI) can render iterations as they happen.
 *
 * The mutation intelligence lives in generateAttacksForIteration (currently
 * a stub; block 3.2 makes it adaptive). The orchestrator itself is
 * mutation-agnostic — it only moves state between iterations and emits events.
 */

import type { Attack, LoopEvent, LoopSummary, TestResult, PriorAttempt } from '@sentinel/shared';
import { generateAttacksForIteration } from './generate.js';
import { testAttack } from './tester.js';

export type LoopEmitter = (event: LoopEvent) => void | Promise<void>;

export interface RunLoopOptions {
  iterations?: number;
  attacksPerIteration?: number;
  emit: LoopEmitter;
}

interface AttackRecord {
  attack: Attack;
  result: TestResult;
  iteration: number;
}

export async function runAdaptiveRedTeam(opts: RunLoopOptions): Promise<LoopSummary> {
  const totalIterations = opts.iterations ?? 3;
  const attacksPerIteration = opts.attacksPerIteration ?? 5;
  const startedAt = Date.now();

  const allRecords: AttackRecord[] = [];

  await opts.emit({ kind: 'loop_start', totalIterations, attacksPerIteration });

  for (let iter = 1; iter <= totalIterations; iter++) {
    const priorAttempts: PriorAttempt[] = allRecords.map((r) => ({
      attack: r.attack,
      outcome: r.result.outcome,
      interdictedBy: r.result.interdictedBy,
      policyId: r.result.policyId,
      reasoning: r.result.reasoning,
    }));
    const priorBypassCount = priorAttempts.filter((p) => p.outcome === 'bypassed').length;
    const priorBlockedCount = priorAttempts.length - priorBypassCount;

    await opts.emit({
      kind: 'iteration_start',
      iteration: iter,
      priorBypassCount,
      priorBlockedCount,
    });

    await opts.emit({ kind: 'attacks_generating', iteration: iter });

    let attacks: Attack[];
    try {
      attacks = await generateAttacksForIteration({
        iteration: iter,
        count: attacksPerIteration,
        priorAttempts,
      });
    } catch (err) {
      await opts.emit({
        kind: 'error',
        message: `Attack generation failed on iteration ${iter}: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    for (const attack of attacks) {
      await opts.emit({ kind: 'attack_generated', iteration: iter, attack });
    }

    // Test each attack sequentially (Pre-cog calls are expensive; no parallelism)
    const iterResults: TestResult[] = [];
    for (const attack of attacks) {
      await opts.emit({ kind: 'attack_test_start', iteration: iter, attackId: attack.id });
      try {
        const result = await testAttack(attack);
        iterResults.push(result);
        allRecords.push({ attack, result, iteration: iter });
        await opts.emit({ kind: 'attack_test_end', iteration: iter, attackId: attack.id, result });
      } catch (err) {
        await opts.emit({
          kind: 'error',
          message: `Test failed for ${attack.id}: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    const stats = tallyResults(iterResults);
    await opts.emit({
      kind: 'iteration_end',
      iteration: iter,
      generated: attacks.length,
      blocked: stats.blocked,
      pausedSafe: stats.pausedSafe,
      bypassed: stats.bypassed,
    });
  }

  const summary = buildSummary(allRecords, totalIterations, Date.now() - startedAt);
  await opts.emit({ kind: 'loop_end', summary });
  return summary;
}

// ─── Tally helpers ───────────────────────────────────────────────────────────

function tallyResults(results: TestResult[]): { blocked: number; pausedSafe: number; bypassed: number } {
  let blocked = 0, pausedSafe = 0, bypassed = 0;
  for (const r of results) {
    if (r.outcome === 'blocked') blocked++;
    else if (r.outcome === 'paused-safe') pausedSafe++;
    else bypassed++;
  }
  return { blocked, pausedSafe, bypassed };
}

function buildSummary(records: AttackRecord[], totalIterations: number, durationMs: number): LoopSummary {
  const totalAttacks = records.length;
  const { blocked, pausedSafe, bypassed } = tallyResults(records.map((r) => r.result));
  const bypassRate = totalAttacks > 0 ? bypassed / totalAttacks : 0;

  const interdictionsByPolicy = records.filter((r) => r.result.interdictedBy === 'policy').length;
  const interdictionsByPrecog = records.filter((r) => r.result.interdictedBy === 'pre-cog').length;

  // Adaptation effectiveness: did later iterations find more bypasses than iter 1?
  // If yes, the attacker is learning and we should be worried.
  const iter1Bypasses = records.filter((r) => r.iteration === 1 && r.result.outcome === 'bypassed').length;
  const laterBypasses = records.filter((r) => r.iteration > 1 && r.result.outcome === 'bypassed').length;
  const adaptationEffective = laterBypasses > iter1Bypasses;

  return {
    totalIterations,
    totalAttacks,
    blocked,
    pausedSafe,
    bypassed,
    bypassRate,
    interdictionsByPolicy,
    interdictionsByPrecog,
    adaptationEffective,
    durationMs,
    bypassedAttackIds: records
      .filter((r) => r.result.outcome === 'bypassed')
      .map((r) => r.attack.id),
  };
}
