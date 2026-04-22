/**
 * Engine settings — exposes runtime toggles over HTTP.
 *
 *   GET  /settings          — current settings
 *   POST /settings/demo-cache — { enabled: boolean }
 */

import { Hono } from 'hono';
import { setDemoCache } from '../interceptor.js';

export const settingsRouter = new Hono();

let _demoCache = true;

settingsRouter.get('/', (c) => {
  return c.json({ demoCache: _demoCache });
});

settingsRouter.post('/demo-cache', async (c) => {
  type Body = { enabled?: boolean };
  const body: Body = await c.req.json<Body>().catch(() => ({} as Body));
  if (typeof body.enabled !== 'boolean') {
    return c.json({ error: 'body must include { enabled: boolean }' }, 400);
  }
  _demoCache = body.enabled;
  setDemoCache(body.enabled);
  return c.json({ demoCache: _demoCache });
});
