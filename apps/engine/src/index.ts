import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { runsRouter } from './routes/runs.js';
import { decisionsRouter } from './routes/decisions.js';
import { timelineRouter } from './routes/timeline.js';
import { forkRouter } from './routes/fork.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: ['http://localhost:3000'] }));

app.get('/', (c) => c.json({ service: 'sentinel-engine', status: 'ok' }));
app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

app.route('/runs', runsRouter);
app.route('/decide', decisionsRouter);
app.route('/timeline', timelineRouter);
app.route('/fork', forkRouter);

const PORT = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[engine] listening on http://localhost:${info.port}`);
});
