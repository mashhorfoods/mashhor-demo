// BACKEND / DB — one SQLite connection (node:sqlite, in Node 22), migrations from ./migrations, small query helpers.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from './config.mjs';
import { info } from './logger.mjs';

// The five launch supervisor profiles — DEMO / PLACEHOLDER SUPERVISOR DATA, not real employees. Backfilled onto the
// bare rows `config.supervisors` seeds below, once, by slug (see migrate()). The business replaces every field
// through the real Admin → Supervisors screen (PATCH /admin/supervisors/:id) when real staff are supplied; nothing
// here needs a redesign or a new route to update later. ids match config.supervisors' default so attribution keeps
// working for anything already stored against them; slugs are the real public route each profile answers at.
const LAUNCH_SUPERVISORS = [
  { id: 'supervisor-1', slug: 'ahmed-mohamed', nameAr: 'أحمد محمد', nameEn: 'Ahmed Mohamed', titleAr: 'مشرف سفر', titleEn: 'Travel Supervisor',
    bioAr: 'متخصص في مساعدة المسافرين على اختيار الرحلات والحجوزات المناسبة لاحتياجاتهم وميزانيتهم، مع التركيز على سهولة الإجراءات وسرعة المتابعة.',
    bioEn: 'Specialises in helping travellers choose flights and bookings that fit their needs and budget, focusing on simple procedures and fast follow-up.',
    image: { src: 'assets/images/supervisors/ahmed-mohamed.webp', altAr: 'صورة أحمد محمد', altEn: 'Photo of Ahmed Mohamed' },
    languages: ['ar', 'en'], specialties: ['visit', 'tourism'], services: ['flights', 'hotels', 'packages'],
    phone: '+971900000001', whatsapp: '+971900000001', email: 'ahmed.demo@travel-demo.example', city: 'Dubai' },
  { id: 'supervisor-2', slug: 'mohamed-abdullah', nameAr: 'محمد عبدالله', nameEn: 'Mohamed Abdullah', titleAr: 'مشرف سفر', titleEn: 'Travel Supervisor',
    bioAr: 'يساعد المسافرين في ترتيب متطلبات السفر والتأشيرات وخيارات الدراسة والعمل، مع تقديم إرشاد واضح خلال مراحل الرحلة.',
    bioEn: 'Helps travellers arrange visas and study or work travel requirements, with clear guidance through every stage of the journey.',
    image: { src: 'assets/images/supervisors/mohamed-abdullah.webp', altAr: 'صورة محمد عبدالله', altEn: 'Photo of Mohamed Abdullah' },
    languages: ['ar', 'en'], specialties: ['study', 'work'], services: ['visa', 'study', 'work'],
    phone: '+90900000002', whatsapp: '+90900000002', email: 'mohamed.demo@travel-demo.example', city: 'Istanbul' },
  { id: 'supervisor-3', slug: 'sara-ahmed', nameAr: 'سارة أحمد', nameEn: 'Sara Ahmed', titleAr: 'مشرفة سفر', titleEn: 'Travel Supervisor',
    bioAr: 'متخصصة في تنظيم الرحلات السياحية والرحلات الجماعية، ومساعدة العائلات والمسافرين على الوصول إلى خيارات سفر عملية ومناسبة.',
    bioEn: 'Specialises in organising tourism and group trips, helping families and travellers reach practical, suitable travel options.',
    image: { src: 'assets/images/supervisors/sara-ahmed.webp', altAr: 'صورة سارة أحمد', altEn: 'Photo of Sara Ahmed' },
    languages: ['ar', 'en'], specialties: ['tourism', 'visit'], services: ['packages'],
    phone: '+974900000003', whatsapp: '+974900000003', email: 'sara.demo@travel-demo.example', city: 'Doha' },
  { id: 'supervisor-4', slug: 'omar-hassan', nameAr: 'عمر حسن', nameEn: 'Omar Hassan', titleAr: 'مشرف سفر', titleEn: 'Travel Supervisor',
    bioAr: 'يساعد المسافرين في تنسيق رحلات العمرة وحجوزات الفنادق وتذاكر الطيران، مع متابعة تفاصيل الرحلة من الحجز حتى الاستعداد للسفر.',
    bioEn: 'Helps travellers coordinate Umrah trips, hotel bookings and flight tickets, following up on every detail from booking through departure.',
    image: { src: 'assets/images/supervisors/omar-hassan.webp', altAr: 'صورة عمر حسن', altEn: 'Photo of Omar Hassan' },
    languages: ['ar', 'en'], specialties: ['umrah'], services: ['umrah', 'hotels', 'flights'],
    phone: '+966900000004', whatsapp: '+966900000004', email: 'omar.demo@travel-demo.example', city: 'Jeddah' },
  { id: 'supervisor-5', slug: 'maryam-ali', nameAr: 'مريم علي', nameEn: 'Maryam Ali', titleAr: 'مشرفة سفر', titleEn: 'Travel Supervisor',
    bioAr: 'تساعد المسافرين والعائلات في تنسيق احتياجات السفر، بما في ذلك السفر العلاجي واختيار الرحلات والحجوزات المناسبة.',
    bioEn: 'Helps travellers and families coordinate their travel needs, including medical travel and choosing the right flights and bookings.',
    image: { src: 'assets/images/supervisors/maryam-ali.webp', altAr: 'صورة مريم علي', altEn: 'Photo of Maryam Ali' },
    languages: ['ar', 'en'], specialties: ['medical', 'visit'], services: ['medical', 'flights'],
    phone: '+60900000005', whatsapp: '+60900000005', email: 'maryam.demo@travel-demo.example', city: 'Kuala Lumpur' },
];

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
  // Every migration has run by this point (002 adds the supervisor profile columns, 003 the services table), so the
  // seeding below writes to the current schema unconditionally.
  const ins = d.prepare('INSERT OR IGNORE INTO supervisors (id, active, created_at, updated_at) VALUES (?, 1, ?, ?)');
  const t = new Date().toISOString();
  for (const s of config.supervisors) ins.run(s, t, t);

  // The five launch profiles (frontend registry: assets/js/data/supervisors.js) — DEMO / PLACEHOLDER data, not real
  // employees; the business will replace every field once real staff are supplied. Backfilled by SLUG (never by id,
  // which stays whatever `config.supervisors` already seeded above) so an admin's own edit is never overwritten:
  // once a row's slug is no longer NULL, this UPDATE's WHERE clause stops matching it, forever.
  const bf = d.prepare(`UPDATE supervisors SET slug = ?, name_ar = ?, name_en = ?, title_ar = ?, title_en = ?, bio_ar = ?, bio_en = ?,
    image_json = ?, languages_json = ?, specialties_json = ?, services_json = ?, phone = ?, whatsapp = ?, email = ?, city = ?, updated_at = ?
    WHERE id = ? AND slug IS NULL`);
  for (const s of LAUNCH_SUPERVISORS) {
    bf.run(s.slug, s.nameAr, s.nameEn, s.titleAr, s.titleEn, s.bioAr, s.bioEn,
      JSON.stringify(s.image), JSON.stringify(s.languages), JSON.stringify(s.specialties), JSON.stringify(s.services),
      s.phone, s.whatsapp, s.email, s.city, t, s.id);
  }

  // Stage 15 — the service operational catalogue, keyed by the SAME ids as the frontend registry
  // (assets/js/data/services.js SERVICE_REGISTRY) so the two never drift; this table adds only the
  // operational config (active, booking-enabled, workflow type) — names and descriptions stay in that file.
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
  return n;
}
export const q = {
  get: (sql, ...p) => open().prepare(sql).get(...p) ?? null,
  all: (sql, ...p) => open().prepare(sql).all(...p),
  run: (sql, ...p) => open().prepare(sql).run(...p),
  /** Runs `fn` atomically. Nests safely: an inner tx() becomes a SAVEPOINT, so a helper that wraps its own writes
      (transitionBooking, applyRuleChange) can also run inside a caller's transaction. `fn` must be synchronous. */
  tx: (fn) => {
    const d = open(); const sp = txDepth ? `sp${txDepth}` : null;
    d.exec(sp ? `SAVEPOINT ${sp}` : 'BEGIN'); txDepth++;
    try { const r = fn(); txDepth--; d.exec(sp ? `RELEASE ${sp}` : 'COMMIT'); return r; }
    catch (e) { txDepth--; d.exec(sp ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK'); throw e; }
  },
};
let txDepth = 0;
export const now = () => new Date().toISOString();

/** One page of `SELECT * FROM <from> ORDER BY <order>`, counted and sliced in SQL (COUNT + LIMIT/OFFSET), in the
    page/pageSize/total/nextPage shape every list read model answers with. `from` is the table plus its WHERE clause
    (from whereClause()), `params` its values. Only the requested page is ever read into memory. */
export function pageQuery(from, order, params, page = 1, pageSize = 20, maxPageSize = 100) {
  const size = Math.min(maxPageSize, Math.max(1, Number(pageSize) || 20));
  const p = Math.max(1, Number(page) || 1);
  const total = q.get(`SELECT COUNT(*) AS n FROM ${from}`, ...params).n;
  const slice = q.all(`SELECT * FROM ${from} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, size, (p - 1) * size);
  return { slice, page: p, pageSize: size, total, nextPage: p * size < total ? p + 1 : null };
}

/** Builds a `WHERE a = ? AND b = ?` clause (or '' if every filter is empty) from [condition, value] pairs,
    skipping falsy values — the optional-filter scaffolding every list read model in staff.mjs/supervisor.mjs/
    business-rules.mjs otherwise hand-rolled the same way. `value` may be an array for a condition with more than
    one placeholder (e.g. a multi-column LIKE), spread into params in order. */
export function whereClause(pairs) {
  const where = []; const params = [];
  for (const [cond, value] of pairs) {
    if (Array.isArray(value) ? value.length : value) { where.push(cond); params.push(...(Array.isArray(value) ? value : [value])); }
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

/** `?` placeholders for a batched `IN (...)` lookup — `IN (${placeholders(ids)})`. Callers still guard `ids.length`. */
export const placeholders = (ids) => ids.map(() => '?').join(',');
