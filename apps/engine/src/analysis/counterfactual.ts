/**
 * Live counterfactual generator — Opus imagines what would have happened
 * if Sentinel hadn't blocked this specific action.
 *
 * Runs in the background after a BLOCK verdict when there's no cached
 * counterfactual. The result is broadcast over SSE so the Inspector can
 * replace the "Generating…" placeholder with the narration.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AgentEvent } from '@sentinel/shared';
import type { WorldState } from '../agent/world.js';

const client = new Anthropic();
const MODEL = 'claude-opus-4-6';

export interface LiveCounterfactual {
  narration: string;
  simulatedSteps: Array<{
    tool: string;
    args: Record<string, unknown>;
    outcome: string;
  }>;
  damageSummary: string;
}

const SYSTEM = `You are Sentinel's forensic "what-if" analyst. You imagine the damage that would have happened if a blocked action had been allowed to execute.

Be concrete and numeric. Reference specific customers, amounts, domains, or data classes visible in the run history. Never invent entities that aren't present.

Return a single JSON object with this exact shape:
{
  "narration": "1-2 sentences, present tense, describing what would unfold next.",
  "simulatedSteps": [
    { "tool": "...", "args": { ... }, "outcome": "concrete consequence (1 line)" }
  ],
  "damageSummary": "One bold sentence quantifying the prevented loss — dollars, records, accounts."
}

Rules:
- 2 to 4 simulated steps (not more, not fewer)
- Each "outcome" must reference a concrete artifact (a customer id, a dollar amount, an external domain, a PII class)
- "damageSummary" must contain at least one number or named entity
- No markdown, no code fences — pure JSON only`;

export async function generateCounterfactual(
  toolCall: { tool: string; args: Record<string, unknown> },
  decision: { reasoning: string; riskSignals: string[] },
  recentEvents: AgentEvent[],
  world: WorldState,
): Promise<LiveCounterfactual> {
  const prompt = buildPrompt(toolCall, decision, recentEvents, world);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 6_000,
    thinking: { type: 'enabled', budget_tokens: 4_000 },
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';

  return parseCounterfactual(raw);
}

function buildPrompt(
  toolCall: { tool: string; args: Record<string, unknown> },
  decision: { reasoning: string; riskSignals: string[] },
  recentEvents: AgentEvent[],
  world: WorldState,
): string {
  const history = recentEvents
    .filter((e) => e.type === 'tool_call' || e.type === 'decision')
    .slice(-10)
    .map((e) => {
      const p = e.payload as Record<string, unknown>;
      if (e.type === 'tool_call') {
        return `  [call] ${p.tool} ${JSON.stringify(p.args).slice(0, 180)}`;
      }
      return `  [decision] ${p.verdict} — ${String(p.reasoning).slice(0, 140)}`;
    })
    .join('\n');

  const customers = (world.customers ?? [])
    .slice(0, 6)
    .map((c) => `  ${c.id} · ${c.name} · ${c.company ?? '—'} · ${c.tier ?? c.plan} · LTV $${c.lifetimeValue ?? 0}`)
    .join('\n');

  return `## Blocked action
tool: ${toolCall.tool}
args: ${JSON.stringify(toolCall.args).slice(0, 400)}

## Why Sentinel blocked it
${decision.reasoning}

Risk signals: ${decision.riskSignals.join(', ') || '(none)'}

## Recent run history
${history || '  (no prior events)'}

## Relevant world state (sample)
${customers || '  (no customers)'}

Now: imagine Sentinel had NOT intervened. What would the agent have done next?
Emit 2-4 follow-up tool calls that a compromised agent would chain after this blocked action, with concrete outcomes and a damage summary. Return JSON only.`;
}

function parseCounterfactual(raw: string): LiveCounterfactual {
  const trimmed = raw.trim().replace(/^```(?:json)?/, '').replace(/```$/, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Attempt to extract the first JSON object via brace matching
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        parsed = JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        parsed = null;
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return fallback();
  }

  const obj = parsed as Record<string, unknown>;
  const narration = typeof obj.narration === 'string' ? obj.narration : '';
  const damageSummary = typeof obj.damageSummary === 'string' ? obj.damageSummary : '';
  const stepsRaw = Array.isArray(obj.simulatedSteps) ? obj.simulatedSteps : [];

  const simulatedSteps = stepsRaw
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map((s) => ({
      tool: typeof s.tool === 'string' ? s.tool : 'unknown',
      args: (typeof s.args === 'object' && s.args !== null ? s.args : {}) as Record<string, unknown>,
      outcome: typeof s.outcome === 'string' ? s.outcome : '',
    }))
    .filter((s) => s.outcome.length > 0);

  if (!narration || !damageSummary || simulatedSteps.length === 0) return fallback();
  return { narration, simulatedSteps, damageSummary };
}

function fallback(): LiveCounterfactual {
  return {
    narration: 'Without Sentinel, the agent would have proceeded with the blocked action and the attack chain would have continued unchecked.',
    simulatedSteps: [
      { tool: 'unknown', args: {}, outcome: 'Action executed against production systems' },
    ],
    damageSummary: 'Damage magnitude could not be precisely simulated.',
  };
}
