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

// ─── Attack surface heatmap ───────────────────────────────────────────────────
// Which tools are being attacked most? Groups all BLOCK+PAUSE decisions by the
// tool that triggered them, across all runs.

// ─── MCP server status ────────────────────────────────────────────────────────
// Tells the UI which MCP tools are exposed so the dashboard can show them.
// Status is always 'active' while the HTTP server is running — the MCP server
// runs alongside via stdio (same process entry point).

const MCP_TOOLS = [
  { name: 'sentinel_start_run',        category: 'execution',      description: 'Start a monitored agent run for any scenario' },
  { name: 'sentinel_get_events',       category: 'observability',  description: 'Stream all tool calls and Pre-cog decisions' },
  { name: 'sentinel_get_blast_radius', category: 'analysis',       description: 'Compute damage done vs. damage prevented' },
  { name: 'sentinel_get_policies',     category: 'policy',         description: 'List all active security policies' },
  { name: 'sentinel_get_trust_score',  category: 'metrics',        description: 'Get system production-readiness score (A+–F)' },
  { name: 'sentinel_snapshot',         category: 'time-travel',    description: 'Reconstruct world state at any event seq' },
  { name: 'sentinel_list_agent_tools', category: 'introspection',  description: 'Inspect tools available to monitored agents' },
] as const;

statsRouter.get('/mcp-status', (c) => {
  const runs = getAllRuns();
  return c.json({
    status: 'active',
    version: '0.2.0',
    transport: 'stdio',
    tools: MCP_TOOLS,
    stats: {
      totalRuns: runs.length,
      lastRunAt: runs[0]?.createdAt ?? null,
    },
  });
});

statsRouter.get('/attack-surface', (c) => {
  const allRuns = getAllRuns();
  const counts: Record<string, { attacks: number; total: number }> = {};

  for (const run of allRuns) {
    const events = getAllEvents(run.id);
    const bySeq = new Map(events.map((e) => [e.seq, e]));

    for (const ev of events) {
      if (ev.type !== 'tool_call') continue;
      const tool = String((ev.payload as Record<string, unknown>).tool ?? '');
      if (!tool) continue;

      if (!counts[tool]) counts[tool] = { attacks: 0, total: 0 };
      counts[tool].total++;

      const decision = bySeq.get(ev.seq + 1);
      if (!decision || decision.type !== 'decision') continue;
      const verdict = String((decision.payload as Record<string, unknown>).verdict ?? '');
      if (verdict === 'BLOCK' || verdict === 'PAUSE') {
        counts[tool].attacks++;
      }
    }
  }

  return c.json({ tools: counts, totalRuns: allRuns.length });
});

// ─── Policy effectiveness trend ───────────────────────────────────────────────
// For each run (oldest→newest), records the seq of the first BLOCK or PAUSE.
// A decreasing seq means Sentinel catches threats earlier over time.

statsRouter.get('/policy-trend', (c) => {
  const allRuns = getAllRuns().slice().reverse(); // oldest first

  const points = allRuns.map((run) => {
    const events = getAllEvents(run.id);
    const firstBlock = events.find((e) => {
      if (e.type !== 'decision') return false;
      const v = String((e.payload as Record<string, unknown>).verdict ?? '');
      return v === 'BLOCK' || v === 'PAUSE';
    });
    return {
      runId: run.id,
      createdAt: run.createdAt,
      firstInterceptSeq: firstBlock ? firstBlock.seq : null,
    };
  });

  const withData = points.filter((p) => p.firstInterceptSeq !== null);
  let improving = false;
  if (withData.length >= 2) {
    const half = Math.ceil(withData.length / 2);
    const earlyAvg = withData.slice(0, half).reduce((a, p) => a + (p.firstInterceptSeq ?? 0), 0) / half;
    const lateAvg = withData.slice(-half).reduce((a, p) => a + (p.firstInterceptSeq ?? 0), 0) / half;
    improving = lateAvg < earlyAvg;
  }

  return c.json({ points, improving, runsWithData: withData.length });
});

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
