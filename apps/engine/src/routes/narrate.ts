/**
 * Live Narration endpoint.
 *
 * Takes a single AgentEvent + recent context → returns a 1-2 sentence
 * plain-English explanation of what just happened and why it matters.
 *
 * Uses Sonnet (not Opus) — speed over depth, sentences need to arrive
 * within ~1s so the UI feels live. No extended thinking needed here.
 */

import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';

export const narrateRouter = new Hono();

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-6';

const SYSTEM = `You are Sentinel's live narrator. As an AI agent executes actions, you explain each step in plain English — like a sports commentator, but for AI security.

Rules:
- 1-2 sentences MAX. Never more.
- Present tense, active voice.
- Be specific: use the tool name, amount, customer name, or domain when visible.
- Calibrate the tone to the verdict:
  - ALLOW: calm and informative ("The agent is doing X, which is routine.")
  - PAUSE: cautious ("Sentinel is pausing — X looks unusual because Y.")
  - BLOCK: urgent ("Sentinel just blocked X — this was an attack attempt.")
- Never use: jargon like "intercept", "interdiction", "blast radius", "pre-cog", "SSE".
- A non-technical executive should understand every sentence.`;

function buildPrompt(event: Record<string, unknown>, recentSummary: string): string {
  return `Recent context (last few steps):
${recentSummary || '(no prior events)'}

Current event:
type: ${event.type}
payload: ${JSON.stringify(event.payload, null, 2).slice(0, 600)}

Narrate this event in 1-2 plain English sentences. Be specific and concrete.`;
}

narrateRouter.post('/', async (c) => {
  let body: { event: Record<string, unknown>; recentSummary?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid body' }, 400);
  }

  if (!body.event?.type) {
    return c.json({ error: 'event.type is required' }, 400);
  }

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 120,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(body.event, body.recentSummary ?? '') }],
    });

    const text = msg.content.find((b) => b.type === 'text');
    const narration = text && text.type === 'text' ? text.text.trim() : '';
    return c.json({ narration });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'narration failed' }, 500);
  }
});
