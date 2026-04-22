/**
 * Stats routes — powers the Command Center dashboard.
 *
 *   GET /stats             — full dashboard data (runs, policies, trust score)
 *   GET /stats/trust-score — just the score + grade
 */

import { Hono } from 'hono';
import { getAllRuns } from '../agent/runner.js';
import { getAllEvents } from '../timetravel/snapshot.js';
import { computeBlastRadius } from '../analysis/blastRadius.js';
import { getActivePolicies } from '../interceptor.js';
import type { BlastRadius } from '../analysis/blastRadius.js';

export const statsRouter = new Hono();

export type TrustGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface TrustScore {
  score: number;         // 0-100
  grade: TrustGrade;
  breakdown: {
    interdictionEffectiveness: number; // 0-1
    policyCoverage: number;            // 0-1
    label: string;
  };
}

export interface RunSummary {
  runId: string;
  createdAt: number;
  agentConfig: string;
  status: string;
  blast: BlastRadius | null;
}

function computeTrustScore(
  recentBlasts: Array<BlastRadius | null>,
  policyCount: number,
): TrustScore {
  // Interdiction effectiveness: avg interdiction rate across recent runs
  const runsWithData = recentBlasts.filter(Boolean) as BlastRadius[];
  let interdictionEff = 0.5; // neutral if no data
  if (runsWithData.length > 0) {
    const rates = runsWithData.map((b) =>
      b.totalToolCalls > 0 ? b.actionsInterdicted / b.totalToolCalls : 0,
    );
    interdictionEff = rates.reduce((a, c) => a + c, 0) / rates.length;
  }

  // Policy coverage: 4 policies = 70%, 6 = 85%, 8+ = 100%
  const policyCoverage = Math.min(policyCount / 8, 1);

  // Weighted score
  const score = Math.round(
    40 * interdictionEff + 30 * policyCoverage + 30, // 30 base points
  );
  const clamped = Math.min(100, Math.max(0, score));

  const grade = scoreToGrade(clamped);

  return {
    score: clamped,
    grade,
    breakdown: {
      interdictionEffectiveness: interdictionEff,
      policyCoverage,
      label: runsWithData.length === 0
        ? 'No runs yet — base score from policy coverage only'
        : `Based on ${runsWithData.length} run${runsWithData.length > 1 ? 's' : ''}`,
    },
  };
}

function scoreToGrade(score: number): TrustGrade {
  if (score >= 95) return 'A+';
  if (score >= 88) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

// ─── Routes ───────────────────────────────────────────────────────────────────

statsRouter.get('/trust-score', (c) => {
  const runs = getAllRuns().slice(0, 5);
  const blasts = runs.map((r) => {
    const events = getAllEvents(r.id);
    return events.length > 0 ? computeBlastRadius(events) : null;
  });
  const policies = getActivePolicies();
  const trust = computeTrustScore(blasts, policies.length);
  return c.json(trust);
});

statsRouter.get('/', (c) => {
  const allRuns = getAllRuns();
  const recentRuns = allRuns.slice(0, 5);

  const runSummaries: RunSummary[] = recentRuns.map((r) => {
    const events = getAllEvents(r.id);
    const blast = events.length > 0 ? computeBlastRadius(events) : null;
    return {
      runId: r.id,
      createdAt: r.createdAt,
      agentConfig: r.agentConfig,
      status: r.status,
      blast,
    };
  });

  const policies = getActivePolicies();

  // Aggregate stats across all runs
  const allBlasts = runSummaries.map((r) => r.blast).filter(Boolean) as BlastRadius[];
  const totalInterdictions = allBlasts.reduce((a, b) => a + b.actionsInterdicted, 0);
  const totalToolCalls = allBlasts.reduce((a, b) => a + b.totalToolCalls, 0);
  const totalMoneyInterdicted = allBlasts.reduce((a, b) => a + b.moneyInterdicted, 0);

  const trust = computeTrustScore(allBlasts, policies.length);

  return c.json({
    trust,
    policies: {
      active: policies.length,
      bySource: {
        default: policies.filter((p) => p.source === 'default').length,
        autoSynthesized: policies.filter((p) => p.source === 'auto-synthesized').length,
        user: policies.filter((p) => p.source === 'user').length,
      },
    },
    runs: {
      total: allRuns.length,
      recent: runSummaries,
    },
    aggregate: {
      totalToolCalls,
      totalInterdictions,
      totalMoneyInterdicted,
      interdictionRate: totalToolCalls > 0
        ? Math.round((totalInterdictions / totalToolCalls) * 100)
        : 0,
    },
  });
});
