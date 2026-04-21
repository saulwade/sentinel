import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  mode: text('mode', { enum: ['live', 'replay', 'preflight'] }).notNull(),
  status: text('status', { enum: ['running', 'paused', 'completed', 'error'] }).notNull(),
  agentConfig: text('agent_config').notNull(),
  parentRunId: text('parent_run_id'),
  forkAtSeq: integer('fork_at_seq'),
});

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull().references(() => runs.id),
    seq: integer('seq').notNull(),
    parentEventId: text('parent_event_id'),
    timestamp: integer('timestamp', { mode: 'number' }).notNull(),
    type: text('type').notNull(),
    payload: text('payload', { mode: 'json' }).notNull(),
  },
  (t) => ({
    runSeqIdx: uniqueIndex('run_seq_idx').on(t.runId, t.seq),
    parentIdx: index('parent_idx').on(t.parentEventId),
    runTypeIdx: index('run_type_idx').on(t.runId, t.type),
  }),
);
