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
import { committeeRouter } from './routes/committee.js';
import { whatifRouter } from './routes/whatif.js';

// Fail fast if the Anthropic API key is missing — every Opus-backed route
// would fail with a cryptic 401 otherwise. Better to refuse to boot.
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[fatal] ANTHROPIC_API_KEY is not set. Copy apps/engine/.env.example to .env and fill it in.');
  process.exit(1);
}

// Hydrate in-memory registries from SQLite on startup.
// If hydration fails, log clearly and continue — in-memory registries
// will start empty but the engine stays up.
try {
  loadPoliciesFromDb();
} catch (err) {
  console.error('[engine] failed to load policies from DB — starting with empty policy set:', err instanceof Error ? err.message : err);
}

try {
  loadRunsFromDb();
} catch (err) {
  console.error('[engine] failed to load runs from DB — starting with empty run registry:', err instanceof Error ? err.message : err);
}

const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(',') }));

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
app.route('/committee', committeeRouter);
app.route('/whatif', whatifRouter);

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("[engine] ANTHROPIC_API_KEY is not set — Opus calls will fail");
  process.exit(1);
}

const PORT = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[engine] listening on http://localhost:${info.port}`);
});
