/**
 * Ask Opus — CISO conversational over Sentinel's operational history.
 *
 *   POST /ask          — non-streaming JSON
 *   POST /ask/stream   — SSE: thinking_delta → result → done
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { askOpus } from '../analysis/askOpus.js';

export const askRouter = new Hono();

askRouter.post('/', async (c) => {
  let question = '';
  try {
    const body = await c.req.json<{ question?: string }>();
    question = String(body.question ?? '').trim();
  } catch {
    return c.json({ error: 'body must be { question: string }' }, 400);
  }
  if (question.length < 4) return c.json({ error: 'question is too short' }, 400);

  try {
    const { response, contextTokens } = await askOpus({ question });
    return c.json({ ...response, contextTokens });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

askRouter.post('/stream', (c) => {
  return streamSSE(c, async (stream) => {
    let question = '';
    try {
      const body = await c.req.json<{ question?: string }>();
      question = String(body.question ?? '').trim();
    } catch {
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'invalid body' }) });
      return;
    }
    if (question.length < 4) {
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'question too short' }) });
      return;
    }

    let thinkingChars = 0;
    try {
      const { response, thinkingText, contextTokens } = await askOpus({
        question,
        onThinkingDelta: (delta) => {
          thinkingChars += delta.length;
          stream.writeSSE({ event: 'thinking_delta', data: delta }).catch(() => {});
        },
      });

      await stream.writeSSE({
        event: 'result',
        data: JSON.stringify({ ...response, contextTokens }),
      });
      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ thinkingChars, thinkingTokens: Math.ceil(thinkingText.length / 4) }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: msg }) });
    }
  });
});
