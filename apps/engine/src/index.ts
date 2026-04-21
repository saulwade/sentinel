import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: ['http://localhost:3000'] }));

app.get('/', (c) => c.json({ service: 'sentinel-engine', status: 'ok' }));

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

const PORT = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[engine] listening on http://localhost:${info.port}`);
});
