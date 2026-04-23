import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { runsRouter } from './routes/runs.js';
import { decisionsRouter } from './routes/decisions.js';
import { timelineRouter } from './routes/timeline.js';
import { forkRouter } from './routes/fork.js';
import { preflightRouter } from './routes/preflight.js';
import { redteamRouter } from './routes/redteam.js';
import { analysisRouter } from './routes/analysis.js';
import { statsRouter } from './routes/stats.js';
import { policiesRouter } from './routes/policies.js';
import { settingsRouter } from './routes/settings.js';
import { fleetRouter } from './routes/fleet.js';
import { narrateRouter } from './routes/narrate.js';
import { scenariosRouter } from './routes/scenarios.js';
import { loadPoliciesFromDb } from './interceptor.js';
import { loadRunsFromDb } from './agent/runner.js';
import { adminRouter } from './routes/admin.js';
import { askRouter } from './routes/ask.js';
import { arenaRouter } from './routes/arena.js';
import { agentDnaRouter } from './routes/agentDna.js';

// Hydrate in-memory registries from SQLite on startup
loadPoliciesFromDb();
loadRunsFromDb();

const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: ['http://localhost:3000'] }));

app.get('/', (c) => c.json({ service: 'sentinel-engine', status: 'ok' }));
app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

app.route('/runs', runsRouter);
app.route('/decide', decisionsRouter);
app.route('/timeline', timelineRouter);
app.route('/fork', forkRouter);
app.route('/preflight', preflightRouter);
app.route('/redteam', redteamRouter);
app.route('/analysis', analysisRouter);
app.route('/stats', statsRouter);
app.route('/policies', policiesRouter);
app.route('/settings', settingsRouter);
app.route('/fleet', fleetRouter);
app.route('/narrate', narrateRouter);
app.route('/scenarios', scenariosRouter);
app.route('/admin', adminRouter);
app.route('/ask', askRouter);
app.route('/arena', arenaRouter);
app.route('/agent-dna', agentDnaRouter);

const PORT = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[engine] listening on http://localhost:${info.port}`);
});
