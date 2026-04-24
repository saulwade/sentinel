import type { SSEStreamingApi } from 'hono/streaming';

export function startHeartbeat(stream: SSEStreamingApi, intervalMs = 15_000): () => void {
  const timer = setInterval(() => {
    stream.writeSSE({ event: 'heartbeat', data: '{}' }).catch(() => {});
  }, intervalMs);
  return () => clearInterval(timer);
}
