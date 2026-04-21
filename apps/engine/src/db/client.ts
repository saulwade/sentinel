import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import * as schema from './schema.js';

const DB_PATH = process.env.DB_PATH ?? './data/sentinel.db';

// Ensure data directory exists
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

// Auto-create tables on import (no migration files needed for hackathon)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    agent_config TEXT NOT NULL,
    parent_run_id TEXT,
    fork_at_seq INTEGER
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id),
    seq INTEGER NOT NULL,
    parent_event_id TEXT,
    timestamp INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS run_seq_idx ON events(run_id, seq);
  CREATE INDEX IF NOT EXISTS parent_idx ON events(parent_event_id);
  CREATE INDEX IF NOT EXISTS run_type_idx ON events(run_id, type);
`);
