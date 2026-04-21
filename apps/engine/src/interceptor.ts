/**
 * Tool interceptor. Wraps every tool call:
 *   1. Emits a tool_call event
 *   2. Runs Pre-cog verification (Opus extended thinking)
 *   3. Emits a decision event with verdict
 *   4. On ALLOW → execute tool → emit tool_result
 *      On PAUSE → wait for human decision
 *      On BLOCK → emit block, skip execution
 */

import { nanoid } from 'nanoid';
import type { AgentEvent, ToolCallPayload, ToolResultPayload, DecisionPayload } from '@sentinel/shared';
import type { ToolName } from './agent/tools.js';
import { callTool } from './agent/tools.js';
import { getWorld } from './agent/world.js';
import { broadcast } from './stream/sse.js';
import { verify } from './precog/verify.js';
import { db } from './db/client.js';
import { events as eventsTable } from './db/schema.js';

// ─── Sequence counters ──────────────────────────────────────────────────────

const seqCounters = new Map<string, number>();

function nextSeq(runId: string): number {
  const n = (seqCounters.get(runId) ?? 0) + 1;
  seqCounters.set(runId, n);
  return n;
}

export function resetSeq(runId: string): void {
  seqCounters.delete(runId);
}

// ─── Event history per run (for Pre-cog context) ────────────────────────────

const eventHistory = new Map<string, AgentEvent[]>();

function pushEvent(runId: string, event: AgentEvent): void {
  if (!eventHistory.has(runId)) eventHistory.set(runId, []);
  eventHistory.get(runId)!.push(event);

  // Persist to SQLite (seq 0 = ephemeral, skip)
  if (event.seq > 0) {
    db.insert(eventsTable)
      .values({
        id: event.id,
        runId: event.runId,
        seq: event.seq,
        parentEventId: event.parentEventId,
        timestamp: event.timestamp,
        type: event.type,
        payload: event.payload,
      })
      .run();
  }
}

function getRecentEvents(runId: string, n = 20): AgentEvent[] {
  return (eventHistory.get(runId) ?? []).slice(-n);
}

export function resetHistory(runId: string): void {
  eventHistory.delete(runId);
}

// ─── PAUSE queue ─────────────────────────────────────────────────────────────

type PendingResolve = (action: 'approve' | 'reject') => void;
const pendingDecisions = new Map<string, PendingResolve>();

export function resolveDecision(eventId: string, action: 'approve' | 'reject'): boolean {
  const resolve = pendingDecisions.get(eventId);
  if (!resolve) return false;
  resolve(action);
  pendingDecisions.delete(eventId);
  return true;
}

function waitForHuman(eventId: string): Promise<'approve' | 'reject'> {
  return new Promise((resolve) => {
    pendingDecisions.set(eventId, resolve);
  });
}

// ─── Interceptor factory ─────────────────────────────────────────────────────

export class BlockedActionError extends Error {
  constructor(public reasoning: string) {
    super(`Action blocked by Pre-cog: ${reasoning}`);
    this.name = 'BlockedActionError';
  }
}

export function createInterceptor(runId: string) {
  return async function intercept(name: ToolName, args: Record<string, unknown>): Promise<unknown> {
    // 1. Emit tool_call
    const callEvent: AgentEvent = {
      id: nanoid(),
      runId,
      seq: nextSeq(runId),
      timestamp: Date.now(),
      type: 'tool_call',
      payload: { tool: name, args } satisfies ToolCallPayload,
    };
    broadcast(runId, callEvent);
    pushEvent(runId, callEvent);

    // 2. Run Pre-cog
    const proposedCall = { tool: name, args };
    const recentEvents = getRecentEvents(runId);
    const worldSnapshot = getWorld();

    // Stream thinking tokens to the UI
    const thinkingEventId = nanoid();
    const result = await verify(
      proposedCall,
      recentEvents,
      worldSnapshot,
      (delta) => {
        // Emit thinking deltas so the UI can show purple streaming text
        broadcast(runId, {
          id: thinkingEventId,
          runId,
          seq: 0, // seq 0 = ephemeral stream, not a persisted event
          timestamp: Date.now(),
          type: 'thought',
          payload: { delta, source: 'precog' },
        });
      },
    );

    // 3. Emit decision event
    const decisionPayload: DecisionPayload = {
      verdict: result.verdict,
      reasoning: result.reasoning,
      riskSignals: result.riskSignals,
    };

    const decisionEvent: AgentEvent = {
      id: nanoid(),
      runId,
      seq: nextSeq(runId),
      timestamp: Date.now(),
      type: 'decision',
      payload: decisionPayload,
    };
    broadcast(runId, decisionEvent);
    pushEvent(runId, decisionEvent);

    // 4. Act on verdict
    switch (result.verdict) {
      case 'ALLOW': {
        const toolResult = callTool(name, args);
        const resultEvent: AgentEvent = {
          id: nanoid(),
          runId,
          seq: nextSeq(runId),
          timestamp: Date.now(),
          type: 'tool_result',
          payload: { tool: name, result: toolResult } satisfies ToolResultPayload,
        };
        broadcast(runId, resultEvent);
        pushEvent(runId, resultEvent);
        return toolResult;
      }

      case 'PAUSE': {
        console.log(`[precog] PAUSE on ${name} — waiting for human decision on ${decisionEvent.id}`);
        const humanAction = await waitForHuman(decisionEvent.id);
        if (humanAction === 'approve') {
          const toolResult = callTool(name, args);
          const resultEvent: AgentEvent = {
            id: nanoid(),
            runId,
            seq: nextSeq(runId),
            timestamp: Date.now(),
            type: 'tool_result',
            payload: { tool: name, result: toolResult } satisfies ToolResultPayload,
          };
          broadcast(runId, resultEvent);
          pushEvent(runId, resultEvent);
          return toolResult;
        }
        // Rejected by human — treat like BLOCK
        throw new BlockedActionError('Human rejected the action');
      }

      case 'BLOCK': {
        console.log(`[precog] BLOCK on ${name}: ${result.reasoning}`);
        throw new BlockedActionError(result.reasoning);
      }
    }
  };
}
