/**
 * Pre-cog verifier. Calls Opus with extended thinking to evaluate a proposed tool call.
 * Returns a structured verdict (ALLOW / PAUSE / BLOCK) with reasoning.
 *
 * Streaming: emits thinking tokens to an optional callback so the UI can show
 * the purple reasoning panel in real time.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AgentEvent, Verdict, DecisionPayload } from '@sentinel/shared';
import type { WorldState } from '../agent/world.js';
import { PRECOG_SYSTEM, buildUserPrompt } from './prompts.js';

const client = new Anthropic({ timeout: 120_000 });

const MODEL = 'claude-opus-4-7';
const THINKING_BUDGET = 8_000;

export interface VerifyResult {
  verdict: Verdict;
  reasoning: string;
  riskSignals: string[];
  thinkingText: string; // full thinking content for storage
}

export async function verify(
  proposedCall: { tool: string; args: Record<string, unknown> },
  recentEvents: AgentEvent[],
  worldSnapshot: Partial<WorldState>,
  onThinkingDelta?: (text: string) => void,
): Promise<VerifyResult> {
  const userPrompt = buildUserPrompt(proposedCall, recentEvents, worldSnapshot);

  let thinkingText = '';
  let responseText = '';

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16_000,
    thinking: { type: 'adaptive' } as any,
    system: PRECOG_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      if (event.delta.type === 'thinking_delta') {
        thinkingText += event.delta.thinking;
        onThinkingDelta?.(event.delta.thinking);
      } else if (event.delta.type === 'text_delta') {
        responseText += event.delta.text;
      }
    }
  }

  // Parse the structured JSON response
  const parsed = parseVerdict(responseText);

  return {
    verdict: parsed.verdict,
    reasoning: parsed.reasoning,
    riskSignals: parsed.riskSignals,
    thinkingText,
  };
}

function parseVerdict(text: string): { verdict: Verdict; reasoning: string; riskSignals: string[] } {
  try {
    // Strip markdown code fences if present
    const clean = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const obj = JSON.parse(clean);

    const verdict = (['ALLOW', 'PAUSE', 'BLOCK'].includes(obj.verdict))
      ? (obj.verdict as Verdict)
      : 'PAUSE'; // default to PAUSE if parsing is ambiguous

    return {
      verdict,
      reasoning: String(obj.reasoning ?? ''),
      riskSignals: Array.isArray(obj.riskSignals) ? obj.riskSignals.map(String) : [],
    };
  } catch {
    // If Opus returned something we can't parse, err on the side of caution
    console.warn('[precog] failed to parse verdict, defaulting to PAUSE:', text.slice(0, 200));
    return {
      verdict: 'PAUSE',
      reasoning: `Pre-cog output could not be parsed. Raw: ${text.slice(0, 100)}`,
      riskSignals: ['parse_error'],
    };
  }
}
