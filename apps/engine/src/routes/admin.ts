/**
 * Admin routes — dev/demo utilities.
 *
 *   POST /admin/reset  — wipe runs + events, revoke user-added policies, reseed defaults
 */

import { Hono } from 'hono';
import { db } from '../db/client.js';
import { runs as runsTable, events as eventsTable, policies as policiesTable } from '../db/schema.js';
import { setActivePolicies, loadPoliciesFromDb } from '../interceptor.js';
import { DEFAULT_POLICIES } from '../policies/defaults.js';
import { clearRuns } from '../agent/runner.js';
import { eq, ne } from 'drizzle-orm';

export const adminRouter = new Hono();

adminRouter.post('/reset', (c) => {
  const expected = process.env.ADMIN_TOKEN;
  if (expected) {
    const provided = c.req.header('x-admin-token');
    if (provided !== expected) {
      return c.json({ error: 'unauthorized' }, 401);
    }
  }
  // Wipe all events and runs — DB + in-memory registry
  db.delete(eventsTable).run();
  db.delete(runsTable).run();
  clearRuns();

  // Keep default policies, remove user-added/synthesized ones
  db.delete(policiesTable)
    .where(ne(policiesTable.source, 'default'))
    .run();

  // Restore defaults in DB in case they were modified
  for (const p of DEFAULT_POLICIES) {
    db.insert(policiesTable)
      .values({
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        severity: p.severity,
        action: p.action,
        source: p.source,
        enabled: p.enabled !== false,
        reasoning: p.reasoning ?? null,
        whenJson: JSON.stringify(p.when),
        createdAt: p.createdAt ?? 0,
        sourceAttackId: null,
        orgId: 'default-org',
      })
      .onConflictDoUpdate({
        target: policiesTable.id,
        set: { enabled: true },
      })
      .run();
  }

  // Reload memory from DB
  loadPoliciesFromDb();

  return c.json({ ok: true, message: 'Demo state reset — runs cleared, default policies restored' });
});
