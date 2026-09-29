/**
 * SQLite connection and migrations.
 *
 * `node:sqlite` is built into Node 22.5+ (unflagged from 24), so the database
 * is a file with no native module to compile and no separate service to run.
 * That is the whole reason the deployment is a single container.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type Db = DatabaseSync;

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations');

/**
 * Open the database and bring it up to date.
 *
 * The pragmas matter individually:
 *   foreign_keys       OFF by default in SQLite, which would silently ignore the
 *                      `goal_id` cascade and leave orphaned records behind.
 *   journal_mode WAL   lets a reader run while a write is in flight, so a slow
 *                      dashboard query never blocks a tap being saved.
 *   busy_timeout       turns a concurrent write into a short wait instead of an
 *                      immediate SQLITE_BUSY error.
 *   recursive_triggers deliberately left OFF. The schema's AFTER triggers issue
 *                      a corrective UPDATE; with recursion on, that UPDATE would
 *                      re-enter the trigger and loop forever.
 */
export const openDatabase = (dbPath: string): Db => {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA recursive_triggers = OFF');
  db.exec('PRAGMA synchronous = NORMAL');

  migrate(db);
  return db;
};

/**
 * Apply any migration file not yet recorded in `schema_migrations`.
 *
 * Each file runs in its own transaction, so a failure leaves the ledger and the
 * schema consistent — the next boot retries the same file rather than skipping
 * it or half-applying it.
 */
const migrate = (db: Db): void => {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((row) => row.name as string),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const name of files) {
    if (applied.has(name)) continue;

    const sql = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
      db.exec('COMMIT');
      console.log(`arise: applied migration ${name}`);
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${name} failed: ${(error as Error).message}`, { cause: error });
    }
  }
};

/**
 * Run `fn` inside a transaction.
 *
 * Used for writes that read before they write — creating a goal has to look up
 * the next sort order, and a record upsert has to know whether a row exists.
 * Without this, two concurrent taps could pick the same position.
 */
export const transaction = <T>(db: Db, fn: () => T): T => {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};
