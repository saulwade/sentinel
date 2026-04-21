/**
 * In-memory SSE pub/sub. One channel per runId.
 * Subscribers receive AgentEvent objects; the route layer formats them for SSE.
 */

import type { AgentEvent } from '@sentinel/shared';

type Sender = (event: AgentEvent) => void;

const subscribers = new Map<string, Set<Sender>>();

export function subscribe(runId: string, send: Sender): () => void {
  if (!subscribers.has(runId)) subscribers.set(runId, new Set());
  subscribers.get(runId)!.add(send);
  return () => {
    const subs = subscribers.get(runId);
    if (!subs) return;
    subs.delete(send);
    if (subs.size === 0) subscribers.delete(runId);
  };
}

export function broadcast(runId: string, event: AgentEvent): void {
  const subs = subscribers.get(runId);
  if (!subs?.size) return;
  for (const send of subs) send(event);
}
