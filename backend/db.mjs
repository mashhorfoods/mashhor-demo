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

  // Stage 15 — the service operational catalogue, keyed by the SAME ids as the frontend registry
  // (assets/js/data/services.js SERVICE_REGISTRY) so the two never drift; this table adds only the
  // operational config (active, booking-enabled, workflow type) — names and descriptions stay in that file.
  if (d.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='services'").get()) {
    const svcIns = d.prepare('INSERT OR IGNORE INTO services (id, active, booking_enabled, created_at, updated_at) VALUES (?, 1, ?, ?, ?)');
    const SERVICE_IDS = ['flights', 'hotels', 'visa', 'packages', 'umrah', 'transport', 'groups', 'medical', 'study', 'work', 'issue', 'change', 'cancel'];
    for (const id of SERVICE_IDS) svcIns.run(id, 1, t, t);
    // The example workflows the Stage 15 brief itself gives (§09) — seeded as the working default for the
    // services it names; every other service starts with no configured workflow (honestly unconfigured). Guarded
    // once PER SERVICE (not per step) so a fresh seed writes every step, while a later migrate() run never re-seeds
    // a service an admin has since reconfigured.
    const wfIns = d.prepare('INSERT INTO service_workflows (service_id, step_order, step_key, label_ar, label_en) VALUES (?,?,?,?,?)');
    const wfHas = d.prepare('SELECT 1 FROM service_workflows WHERE service_id = ?');
    const WORKFLOWS = {
      flights: [['search', 'البحث', 'Search'], ['select', 'الاختيار', 'Selection'], ['passengers', 'بيانات المسافرين', 'Passenger data'], ['payment', 'الدفع', 'Payment'], ['ticketing', 'إصدار التذكرة', 'Ticketing'], ['confirmation', 'التأكيد', 'Confirmation']],
      visa: [['application', 'الطلب', 'Application'], ['documents', 'المستندات', 'Documents'], ['review', 'المراجعة', 'Review'], ['submission', 'التقديم', 'Submission'], ['processing', 'المعالجة', 'Processing'], ['decision', 'القرار', 'Decision']],
      hotels: [['search', 'البحث', 'Search'], ['select', 'الاختيار', 'Selection'], ['payment', 'الدفع', 'Payment'], ['supplier_confirmation', 'تأكيد المزود', 'Supplier confirmation'], ['customer_confirmation', 'تأكيد العميل', 'Customer confirmation']],
      medical: [['request', 'الطلب', 'Request'], ['information', 'المعلومات', 'Information'], ['review', 'المراجعة', 'Review'], ['provider_coordination', 'التنسيق مع المزود', 'Provider coordination'], ['confirmation', 'التأكيد', 'Confirmation']],
    };
    for (const [serviceId, steps] of Object.entries(WORKFLOWS)) { if (wfHas.get(serviceId)) continue; steps.forEach(([key, ar, en], i) => wfIns.run(serviceId, i, key, ar, en)); }
  }
  return n;
}
export const q = {
  get: (sql, ...p) => open().prepare(sql).get(...p) ?? null,
  all: (sql, ...p) => open().prepare(sql).all(...p),
  run: (sql, ...p) => open().prepare(sql).run(...p),
  tx: (fn) => { const d = open(); d.exec('BEGIN'); try { const r = fn(); d.exec('COMMIT'); return r; } catch (e) { d.exec('ROLLBACK'); throw e; } },
};
export const now = () => new Date().toISOString();

/** The page/pageSize/total/nextPage shape every list read model answers with, in one place instead of nine near-identical copies. `all` is the already-filtered, already-ordered full result set — this only clamps and slices it. */
export function paginate(all, page = 1, pageSize = 20, maxPageSize = 100) {
  const size = Math.min(maxPageSize, Math.max(1, pageSize));
  const p = Math.max(1, page);
  return { slice: all.slice((p - 1) * size, p * size), page: p, pageSize: size, total: all.length, nextPage: p * size < all.length ? p + 1 : null };
}
