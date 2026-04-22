/**
 * Analysis routes.
 *
 *   GET /analysis/:runId         — non-streaming JSON (blocks ~8-15s)
 *   GET /analysis/:runId/stream  — SSE: blast radius → thinking deltas → result
 *
 * Uses event sourcing to reconstruct the run, computes blast radius
 * deterministically, then asks Opus to produce incident intelligence.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getAllEvents } from '../timetravel/snapshot.js';
import { computeBlastRadius } from '../analysis/blastRadius.js';
import { analyzeRun } from '../analysis/analyze.js';
import { generateIncidentReport } from '../analysis/report.js';
import { getRun } from '../agent/runner.js';
import { getWorld } from '../agent/world.js';
import type { RunAnalysis } from '@sentinel/shared';

export const analysisRouter = new Hono();

function scenarioLabel(agentConfig: string | undefined): string {
  if (agentConfig === 'support-agent') return 'Customer Support Agent — ticket triage with refund + PII lookup authority';
  return 'Corporate Assistant — email summarization';
}

// ─── Blast only (fast, no Opus) ───────────────────────────────────────────────

analysisRouter.get('/:runId/blast', (c) => {
  const runId = c.req.param('runId');
  const run = getRun(runId);
  if (!run) return c.json({ error: 'run not found' }, 404);

  const events = getAllEvents(runId);
  if (events.length === 0) return c.json({ blast: null });

  const blast = computeBlastRadius(events);
  return c.json({ blast });
});

// ─── Non-streaming ────────────────────────────────────────────────────────────

analysisRouter.get('/:runId', async (c) => {
  const runId = c.req.param('runId');
  const run = getRun(runId);
  if (!run) return c.json({ error: 'run not found' }, 404);

  const events = getAllEvents(runId);
  if (events.length === 0) return c.json({ error: 'no events for run' }, 404);

  const blast = computeBlastRadius(events);

  const { analysis, thinkingText } = await analyzeRun({
    scenario: scenarioLabel(run.agentConfig),
    events,
    blast,
    world: getWorld(),
  });

  return c.json({
    runId,
    blast,
    analysis: { ...analysis, thinkingTokens: Math.ceil(thinkingText.length / 4) },
  });
});

// ─── Incident Report ─────────────────────────────────────────────────────────
// Accepts optional pre-computed analysis in body to avoid a second Opus call.
// If no analysis provided, calls analyzeRun() first.

analysisRouter.post('/:runId/incident-report', async (c) => {
  const runId = c.req.param('runId');
  const run = getRun(runId);
  if (!run) return c.json({ error: 'run not found' }, 404);

  const events = getAllEvents(runId);
  if (events.length === 0) return c.json({ error: 'no events for run' }, 404);

  const blast = computeBlastRadius(events);
  const scenario = scenarioLabel(run.agentConfig);

  // Use pre-computed analysis if provided in body (avoids double Opus call)
  let analysis: RunAnalysis | null = null;
  try {
    const body = await c.req.json<{ analysis?: RunAnalysis }>();
    if (body.analysis) analysis = body.analysis;
  } catch {}

  if (!analysis) {
    const result = await analyzeRun({ scenario, events, blast, world: getWorld() });
    analysis = result.analysis;
  }

  const markdown = generateIncidentReport({
    runId,
    scenario,
    blast,
    analysis,
    generatedAt: Date.now(),
  });

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="sentinel-incident-${runId.slice(0, 8)}.md"`,
    },
  });
});

// ─── Streaming ────────────────────────────────────────────────────────────────

analysisRouter.get('/:runId/stream', (c) => {
  const runId = c.req.param('runId');

  return streamSSE(c, async (stream) => {
    const run = getRun(runId);
    if (!run) {
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'run not found' }) });
      return;
    }

    const events = getAllEvents(runId);
    if (events.length === 0) {
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'no events for run' }) });
      return;
    }

    // 1. Compute blast radius and emit immediately (deterministic, <10ms)
    const blast = computeBlastRadius(events);
    await stream.writeSSE({ event: 'blast', data: JSON.stringify(blast) });

    // 2. Stream Opus thinking + collect final analysis
    let thinkingCharCount = 0;

    try {
      const { analysis, thinkingText } = await analyzeRun({
        scenario: scenarioLabel(run.agentConfig),
        events,
        blast,
        world: getWorld(),
        onThinkingDelta: (delta) => {
          thinkingCharCount += delta.length;
          stream.writeSSE({ event: 'thinking_delta', data: delta }).catch(() => {});
        },
      });

      // 3. Emit final analysis
      await stream.writeSSE({
        event: 'result',
        data: JSON.stringify({
          ...analysis,
          thinkingTokens: Math.ceil(thinkingText.length / 4),
        }),
      });
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ thinkingChars: thinkingCharCount }) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: message }) });
    }
  });
});
