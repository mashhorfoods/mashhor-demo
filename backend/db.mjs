// BACKEND / DB — one SQLite connection (node:sqlite, in Node 22), migrations from ./migrations, small query helpers.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from './config.mjs';
import { info } from './logger.mjs';

let db = null;
export function open() {
  if (db) return db;
  if (config.databasePath !== ':memory:') mkdirSync(dirname(config.databasePath), { recursive: true });
  db = new DatabaseSync(config.databasePath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  return db;
}
export function migrate() {
  const d = open();
  d.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const dir = new URL('./migrations/', import.meta.url).pathname;
  const applied = new Set(d.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let n = 0;
  for (const f of files) {
    if (applied.has(f)) continue;
    d.exec('BEGIN'); try { d.exec(readFileSync(join(dir, f), 'utf8')); d.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(f, new Date().toISOString()); d.exec('COMMIT'); n++; info('db.migrated', { version: f }); }
    catch (e) { d.exec('ROLLBACK'); throw e; }
  }
  const hasProfileCols = d.prepare("SELECT 1 FROM pragma_table_info('supervisors') WHERE name = 'created_at'").get();
  const ins = hasProfileCols
    ? d.prepare('INSERT OR IGNORE INTO supervisors (id, active, created_at, updated_at) VALUES (?, 1, ?, ?)')
    : d.prepare('INSERT OR IGNORE INTO supervisors (id, active) VALUES (?, 1)');
  const t = new Date().toISOString();
  for (const s of config.supervisors) hasProfileCols ? ins.run(s, t, t) : ins.run(s);
  return n;
}
export const q = {
  get: (sql, ...p) => open().prepare(sql).get(...p) ?? null,
  all: (sql, ...p) => open().prepare(sql).all(...p),
  run: (sql, ...p) => open().prepare(sql).run(...p),
  tx: (fn) => { const d = open(); d.exec('BEGIN'); try { const r = fn(); d.exec('COMMIT'); return r; } catch (e) { d.exec('ROLLBACK'); throw e; } },
};
export const now = () => new Date().toISOString();
