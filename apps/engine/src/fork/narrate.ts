/**
 * Fork Narrator: Opus generates a counterfactual narration comparing
 * two branches (what happened vs what would have happened).
 *
 * Used when Pre-cog blocks an action, or when the user creates a manual fork.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AgentEvent } from '@sentinel/shared';

const client = new Anthropic();
const MODEL = 'claude-opus-4-7';

export interface Narration {
  narration: string;
  thinkingText: string;
}

export async function narrateFork(
  originalEvents: AgentEvent[],
  forkEvents: AgentEvent[],
  onThinkingDelta?: (delta: string) => void,
  onTextDelta?: (delta: string) => void,
): Promise<Narration> {
  const prompt = buildNarrationPrompt(originalEvents, forkEvents);

  let thinkingText = '';
  let narration = '';

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 8_000,
    thinking: { type: 'enabled', budget_tokens: 4_000 },
    system: `You are a forensic analyst for AI agent security. You compare two execution branches of the same agent — the original run and an alternate (forked) run — and narrate the differences.

Be specific about consequences: data leaked, records affected, systems compromised. Use concrete numbers when available. Keep it under 150 words. Write in present tense as if narrating events unfolding.`,
    messages: [{ role: 'user', content: prompt }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      if (event.delta.type === 'thinking_delta') {
        thinkingText += event.delta.thinking;
        onThinkingDelta?.(event.delta.thinking);
      } else if (event.delta.type === 'text_delta') {
        narration += event.delta.text;
        onTextDelta?.(event.delta.text);
      }
    }
  }

  return { narration, thinkingText };
}

function buildNarrationPrompt(original: AgentEvent[], fork: AgentEvent[]): string {
  const fmt = (events: AgentEvent[]) =>
    events
      .filter((e) => e.type === 'tool_call' || e.type === 'decision')
      .map((e) => {
        const p = e.payload as Record<string, unknown>;
        if (e.type === 'tool_call') return `  [${e.type}] ${p.tool} ${JSON.stringify(p.args).slice(0, 150)}`;
        return `  [${e.type}] ${p.verdict} — ${String(p.reasoning).slice(0, 100)}`;
      })
      .join('\n');

  return `## Original run (what happened)
${fmt(original) || '  (no events)'}

## Forked run (alternate reality)
${fmt(fork) || '  (no events)'}

Compare these two branches. What damage was avoided (or caused) by the divergence? Be specific.`;
}
