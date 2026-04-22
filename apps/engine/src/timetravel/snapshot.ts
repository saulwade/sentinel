/**
 * Snapshot: reconstruct world state at any event in a run.
 *
 * Replays events 0..N against a fresh world, applying tool_result effects.
 * Returns the world state as it was at event #seq.
 */

import { db } from '../db/client.js';
import { events as eventsTable } from '../db/schema.js';
import { eq, and, lte } from 'drizzle-orm';
import type { AgentEvent, ToolResultPayload } from '@sentinel/shared';
import type { WorldState, Email, Customer } from '../agent/world.js';
import { INBOX, CUSTOMERS } from '../agent/scenarios/phishing.js';

export interface Snapshot {
  seq: number;
  world: WorldState;
  events: AgentEvent[];
}

export function getEventsUpTo(runId: string, seq: number): AgentEvent[] {
  const rows = db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.runId, runId), lte(eventsTable.seq, seq)))
    .orderBy(eventsTable.seq)
    .all();

  return rows.map((r) => ({
    id: r.id,
    runId: r.runId,
    seq: r.seq,
    parentEventId: r.parentEventId ?? undefined,
    timestamp: r.timestamp,
    type: r.type as AgentEvent['type'],
    payload: r.payload as unknown,
  }));
}

export function getAllEvents(runId: string): AgentEvent[] {
  const rows = db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.runId, runId))
    .orderBy(eventsTable.seq)
    .all();

  return rows.map((r) => ({
    id: r.id,
    runId: r.runId,
    seq: r.seq,
    parentEventId: r.parentEventId ?? undefined,
    timestamp: r.timestamp,
    type: r.type as AgentEvent['type'],
    payload: r.payload as unknown,
  }));
}

/**
 * Reconstruct world state by replaying events up to `seq`.
 * Starts from the scenario seed and applies tool_result effects.
 */
export function snapshot(runId: string, seq: number): Snapshot {
  const eventList = getEventsUpTo(runId, seq);

  // Start from a clean seed copy
  const world: WorldState = {
    inbox: structuredClone(INBOX),
    customers: structuredClone(CUSTOMERS),
    slackLog: [],
    sentEmails: [],
    tickets: [],
    refunds: [],
  };

  // Replay tool_result effects
  for (const evt of eventList) {
    if (evt.type !== 'tool_result') continue;
    const p = evt.payload as ToolResultPayload;

    switch (p.tool) {
      case 'read_email': {
        // Mark email as read
        const result = p.result as Email | null;
        if (result) {
          const email = world.inbox.find((e) => e.id === result.id);
          if (email) email.read = true;
        }
        break;
      }
      case 'send_email': {
        const result = p.result as { success: boolean; messageId: string };
        if (result.success) {
          // Find the corresponding tool_call to get the args
          const callEvt = eventList.find(
            (e) => e.type === 'tool_call' && e.seq === evt.seq - 1,
          );
          if (callEvt) {
            const args = (callEvt.payload as { args: Record<string, unknown> }).args;
            world.sentEmails.push({
              to: String(args.to),
              subject: String(args.subject),
              body: String(args.body),
              sentAt: evt.timestamp,
            });
          }
        }
        break;
      }
      case 'post_slack': {
        const result = p.result as { ts: string; channel: string };
        const callEvt = eventList.find(
          (e) => e.type === 'tool_call' && e.seq === evt.seq - 1,
        );
        if (callEvt) {
          const args = (callEvt.payload as { args: Record<string, unknown> }).args;
          world.slackLog.push({
            channel: result.channel,
            message: String(args.message),
            sentAt: evt.timestamp,
          });
        }
        break;
      }
      // query_customers is read-only, no state mutation
    }
  }

  return { seq, world, events: eventList };
}
