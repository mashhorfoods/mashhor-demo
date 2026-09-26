// ============================================================================
// BACKEND / SUPERVISOR — Stage 13. Supervisor identity, sessions, attribution
// and the read models the supervisor portal consumes. A SEPARATE credential
// store and session table from customers (backend/identity.mjs): a customer
// session cookie is never accepted here and a supervisor session cookie is
// never accepted on /me/*. That separation IS the role boundary between the
// two roles — no client-supplied role flag exists anywhere in this backend.
//
// Reassignment and slug/profile management are admin-dashboard actions
// (Stage 14, staff-routes.mjs): this module implements the functions they call.
// ============================================================================
import { q, now, J, registerRule, pageQuery, whereClause, placeholders } from './db.mjs';
import { hex, HttpError, str, strArr, isSlug, imageJson, sessionCookies } from './http.mjs';
import { makeCredentialStore, normEmail } from './credentials.mjs';
import { audit } from './staff.mjs';

/* ---- rows → contract shapes ---------------------------------------------- */
/** Public-safe: what the (future) public directory and the portal's own "my profile" view may show anyone. No credential, no internal id. */
function publicSupervisor(s) {
  if (!s) return null;
  return {
    id: s.id, slug: s.slug ?? null, status: s.active ? 'active' : 'inactive',
    nameAr: s.name_ar ?? null, nameEn: s.name_en ?? null, titleAr: s.title_ar ?? null, titleEn: s.title_en ?? null, bioAr: s.bio_ar ?? null, bioEn: s.bio_en ?? null,
    image: J(s.image_json, null), languages: J(s.languages_json, []), specialties: J(s.specialties_json, []), services: J(s.services_json, []),
    phone: s.phone ?? null, whatsapp: s.whatsapp ?? null, email: s.email ?? null, city: s.city ?? null,
  };
}
/** The authenticated supervisor's own view of themself: adds what they may edit and what they may only read. */
export function privateSupervisor(s) {
  if (!s) return null;
  return { ...publicSupervisor(s), notificationPrefs: J(s.notification_prefs_json, {}), createdAt: s.created_at ?? null, updatedAt: s.updated_at ?? null };
}

/* ---- credentials: the same stack as customers (credentials.mjs), a SEPARATE store ---------------------------------
   Own tables, own cookie pair, `sv:`-prefixed lockout keys. Only an ACTIVE supervisor with a password already set
   signs in or is sent a reset — a freshly provisioned account (no password yet) never authenticates by guessing. */
export const supervisors = makeCredentialStore({
  table: 'supervisors', sessionTable: 'supervisor_sessions', resetTable: 'supervisor_reset_tokens', fk: 'supervisor_id',
  cookies: sessionCookies('no_supervisor_session', 'no_supervisor_csrf'), ctx: { sid: 'supervisorSid', session: 'supervisorSession', account: 'supervisor' },
  lockoutPrefix: 'sv:', log: 'supervisor.auth', tokenPrefix: 'svrs', activeOnly: true,
});
export const { byId: supervisorById, setPassword: setSupervisorPassword } = supervisors;
export const activeSupervisor = (id) => { const s = supervisorById(id); return s && s.active ? s : null; };

/* ---- attribution: business rule from business_config, server-authoritative (§9, §26, §27) ---- */
/** Stage 15B: `.status` derived from the Business Rules Register's own status column (Stage 15A), the same
    single-source-of-truth pattern as `lifecycleConfig()`/`taskPriorityLevels()` in staff.mjs — activating this
    rule from the Admin Dashboard is reflected here immediately; `model` stays whatever value the register holds
    (null until the business supplies one — never computed or guessed here). */
export const commissionModel = () => registerRule('commission_model', { model: null });

function logAttribution(customerId, supervisorId, previousSupervisorId, source, actor) {
  q.run('INSERT INTO attribution_events (customer_id, supervisor_id, previous_supervisor_id, source, actor, at) VALUES (?,?,?,?,?,?)', customerId, supervisorId, previousSupervisorId, source, actor, now());
}
/**
 * Apply attribution to a customer under the FIRST-ATTRIBUTION rule (the only rule implemented and confirmed as
 * current behaviour; see business_config). Never overwrites an existing attribution — every attempt is logged, even
 * when it changes nothing, so the audit trail shows every touch a customer received. Returns the customer's
 * attribution after the call (unchanged if one already existed).
 */
export function assignAttribution(customerId, supervisorId, source, actor = 'customer', at = now()) {
  const c = q.get('SELECT * FROM customers WHERE id = ?', customerId); if (!c) return null;
  if (c.attribution_supervisor) { logAttribution(customerId, c.attribution_supervisor, c.attribution_supervisor, `${source}:no-op(first-wins)`, actor); return { supervisorId: c.attribution_supervisor, source: c.attribution_source, at: c.attribution_at }; }
  if (!supervisorId || !activeSupervisor(supervisorId)) return null;
  q.run('UPDATE customers SET attribution_supervisor = ?, attribution_source = ?, attribution_at = ?, updated_at = ? WHERE id = ?', supervisorId, source, at, at, customerId);
  logAttribution(customerId, supervisorId, null, source, actor);
  return { supervisorId, source, at };
}
/**
 * Reassignment — an ADMIN action only (§27), never reachable by a supervisor's own session. Preserves history: the
 * previous supervisor's attribution to this customer's past bookings/trips is untouched; only the customer's CURRENT
 * attribution pointer moves, and the change is logged with who did it.
 */
export function reassignAttribution(customerId, newSupervisorId, actor) {
  const c = q.get('SELECT * FROM customers WHERE id = ?', customerId); if (!c) throw new HttpError(404, 'notFound');
  if (newSupervisorId && !activeSupervisor(newSupervisorId)) throw new HttpError(422, 'invalid');
  const at = now(); const previous = c.attribution_supervisor;
  q.run('UPDATE customers SET attribution_supervisor = ?, attribution_source = ?, attribution_at = ?, updated_at = ? WHERE id = ?', newSupervisorId, 'reassigned', at, at, customerId);
  logAttribution(customerId, newSupervisorId, previous, 'reassigned', actor);
  return { supervisorId: newSupervisorId, source: 'reassigned', at, previousSupervisorId: previous };
}

/* ---- scoped read models: everything here takes supervisorId from the SESSION, never from a request value --------- */
const custOf = (id) => q.get('SELECT * FROM customers WHERE id = ?', id);
export function supervisorCustomers(supervisorId, { search = '', status = '', page = 1, pageSize = 20 } = {}) {
  const s = search ? `%${search}%` : '';
  const { sql, params } = whereClause([['attribution_supervisor = ?', supervisorId], ['(name LIKE ? OR email LIKE ? OR phone LIKE ?)', s && [s, s, s]]]);
  const { slice, ...meta } = pageQuery(`customers ${sql}`, 'created_at DESC', params, page, pageSize, 50);
  // One batched query for the page's booking stats instead of two per row (was an N+1 on this list screen).
  const ids = slice.map((c) => c.id); const stats = new Map();
  if (ids.length) for (const r of q.all(`SELECT customer_id, COUNT(*) AS n, MAX(created_at) AS m FROM bookings WHERE customer_id IN (${placeholders(ids)}) GROUP BY customer_id`, ...ids)) stats.set(r.customer_id, r);
  return {
    items: slice.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, locale: c.locale, attributionAt: c.attribution_at, createdAt: c.created_at,
      bookingsCount: stats.get(c.id)?.n ?? 0, lastActivityAt: stats.get(c.id)?.m ?? c.created_at })),
    ...meta,
  };
}
/** A customer detail — ONLY when currently attributed to this supervisor; a foreign customer id is 404, exactly like /me/*. */
export function supervisorCustomer(supervisorId, customerId) {
  const c = custOf(customerId); if (!c || c.attribution_supervisor !== supervisorId) return null;
  const bookings = q.all('SELECT * FROM bookings WHERE customer_id = ? AND supervisor_id = ? ORDER BY created_at DESC', customerId, supervisorId);
  const trips = q.all('SELECT * FROM trips WHERE customer_id = ? AND supervisor_id = ? ORDER BY created_at DESC', customerId, supervisorId);
  const history = q.all('SELECT * FROM attribution_events WHERE customer_id = ? ORDER BY at', customerId);
  return {
    id: c.id, name: c.name, email: c.email, phone: c.phone, locale: c.locale, createdAt: c.created_at,
    attribution: { supervisorId: c.attribution_supervisor, source: c.attribution_source, at: c.attribution_at },
    bookings: bookings.map((b) => ({ id: b.id, service: b.service, status: b.status, paymentStatus: b.payment_status, amount: b.amount, currency: b.currency, createdAt: b.created_at })),
    trips: trips.map((t) => ({ id: t.id, titleAr: t.title_ar, titleEn: t.title_en, status: t.status, startDate: t.start_date, endDate: t.end_date })),
    attributionHistory: history.map((h) => ({ supervisorId: h.supervisor_id, previousSupervisorId: h.previous_supervisor_id, source: h.source, actor: h.actor, at: h.at })),
  };
}
export function supervisorBookings(supervisorId, { status = '', service = '', page = 1, pageSize = 20 } = {}) {
  const { sql, params } = whereClause([['supervisor_id = ?', supervisorId], ['status = ?', status], ['service = ?', service]]);
  const { slice, ...meta } = pageQuery(`bookings ${sql}`, 'created_at DESC', params, page, pageSize, 50);
  // One batched customer-name lookup for the page instead of one query per row (was an N+1 on this list screen).
  const ids = [...new Set(slice.map((b) => b.customer_id))]; const names = new Map();
  if (ids.length) for (const c of q.all(`SELECT id, name FROM customers WHERE id IN (${placeholders(ids)})`, ...ids)) names.set(c.id, c.name);
  return { items: slice.map((b) => ({ id: b.id, customerId: b.customer_id, customerName: names.get(b.customer_id) ?? '', service: b.service, status: b.status, paymentStatus: b.payment_status, amount: b.amount, currency: b.currency, createdAt: b.created_at, tripId: b.trip_id })), ...meta };
}
/** ONLY a booking currently attributed to this supervisor — never any booking by id. */
export function supervisorBooking(supervisorId, bookingId) {
  const b = q.get('SELECT * FROM bookings WHERE id = ? AND supervisor_id = ?', bookingId, supervisorId); if (!b) return null;
  const c = custOf(b.customer_id);
  return { id: b.id, customerId: b.customer_id, customerName: c?.name ?? '', service: b.service, status: b.status, paymentStatus: b.payment_status, amount: b.amount, currency: b.currency, createdAt: b.created_at, detail: J(b.detail_json, {}) };
}
export function supervisorLeads(supervisorId, { status = '', page = 1, pageSize = 20 } = {}) {
  const { sql, params } = whereClause([['supervisor_id = ?', supervisorId], ['status = ?', status]]);
  const { slice, ...meta } = pageQuery(`leads ${sql}`, 'created_at DESC', params, page, pageSize, 50);
  return { items: slice.map(nLead), ...meta };
}
const nLead = (l) => ({ id: l.id, customerId: l.customer_id, name: l.name, contact: l.contact, source: l.source, serviceInterest: l.service_interest, status: l.status, convertedBookingId: l.converted_booking_id, createdAt: l.created_at, updatedAt: l.updated_at });
export const LEAD_STATUSES = ['new', 'contacted', 'in_progress', 'converted', 'closed'];
export function updateLeadStatus(supervisorId, leadId, status) {
  if (!LEAD_STATUSES.includes(status)) throw new HttpError(422, 'invalid');
  const l = q.get('SELECT * FROM leads WHERE id = ? AND supervisor_id = ?', leadId, supervisorId); if (!l) return null;
  q.run('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?', status, now(), leadId);
  return nLead(q.get('SELECT * FROM leads WHERE id = ?', leadId));
}

/** Revenue — computed from THIS supervisor's own bookings/payments only, never a cross-supervisor read. §17 */
export function supervisorRevenue(supervisorId, { since = null } = {}) {
  const { sql, params } = whereClause([['supervisor_id = ?', supervisorId], ['created_at >= ?', since]]);
  // Summed in SQL, one row per currency: amounts in different currencies are never added together.
  const byCurrency = q.all(`SELECT currency, COUNT(*) AS bookingsCount,
      COALESCE(SUM(amount), 0) AS gross,
      COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount END), 0) AS completed,
      COALESCE(SUM(CASE WHEN payment_status = 'unpaid' THEN amount END), 0) AS pending,
      COALESCE(SUM(CASE WHEN status = 'cancelled' THEN amount END), 0) AS cancelled
    FROM bookings ${sql} GROUP BY currency ORDER BY gross DESC`, ...params).map((r) => ({ ...r }));
  // The flat fields describe the single currency when there is one; with several they are null (never a mixed sum),
  // and byCurrency carries the figures.
  const one = byCurrency.length <= 1 ? (byCurrency[0] ?? { currency: 'USD', gross: 0, completed: 0, pending: 0, cancelled: 0 }) : null;
  return {
    currency: one ? one.currency : null,
    gross: one ? one.gross : null,
    completed: one ? one.completed : null,
    pending: one ? one.pending : null,
    cancelled: one ? one.cancelled : null,
    bookingsCount: byCurrency.reduce((n, r) => n + r.bookingsCount, 0),
    byCurrency,
    commission: commissionModel(),
  };
}
export function supervisorPerformance(supervisorId, { since = null } = {}) {
  const withSince = (col) => whereClause([[`${col} = ?`, supervisorId], ['created_at >= ?', since]]);
  const cust = withSince('attribution_supervisor');
  const customers = q.get(`SELECT COUNT(*) AS n FROM customers ${cust.sql}`, ...cust.params).n;
  const bk = withSince('supervisor_id');
  const b = q.get(`SELECT COUNT(*) AS n, COUNT(CASE WHEN status = 'confirmed' THEN 1 END) AS confirmed, COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled FROM bookings ${bk.sql}`, ...bk.params);
  const ld = withSince('supervisor_id');
  const l = q.get(`SELECT COUNT(*) AS n, COUNT(CASE WHEN status = 'converted' THEN 1 END) AS converted FROM leads ${ld.sql}`, ...ld.params);
  return {
    customers, leads: l.n, leadsConverted: l.converted, conversionRate: l.n ? l.converted / l.n : null,
    bookings: b.n, bookingsConfirmed: b.confirmed, bookingsCancelled: b.cancelled,
  };
}
export const nSupervisorNotification = (r) => ({ id: r.id, kind: r.kind, at: r.at, read: !!r.read, titleAr: r.title_ar, titleEn: r.title_en, textAr: r.text_ar, textEn: r.text_en, href: r.href, bookingId: r.booking_id });

/** Supervisor rights / commission, scoped to this supervisor only. Empty (not fabricated) until the business configures a model; existing rows read status 'pending_configuration' with a null amount rather than a guessed figure. §18 */
export function supervisorCommissions(supervisorId, { page = 1, pageSize = 20 } = {}) {
  const { slice, ...meta } = pageQuery('commissions WHERE supervisor_id = ?', 'created_at DESC', [supervisorId], page, pageSize, 50);
  return { model: commissionModel(), items: slice.map((c) => ({ id: c.id, bookingId: c.booking_id, amount: c.amount, currency: c.currency, status: c.status, period: c.period, createdAt: c.created_at })), ...meta };
}

// ============================================================================
// Stage 14 — ADMIN DASHBOARD: supervisor management admin-wide. Genuinely
// absent before this stage — supervisors existed only via a fixed row list
// seeded from `config.supervisors` (backend/db.mjs) and were never
// creatable/editable through any API. `supervisorCustomers`/`Bookings`/
// `Leads`/`Revenue`/`Performance`/`Commissions` above already take an
// explicit `supervisorId`, so they are reused as-is by the admin routes —
// nothing above this line changes. Reassignment reuses `reassignAttribution`
// above, the SAME function the bearer-token `admin.reassign` route already
// called; a staff-session route just gives it a second, permission-checked
// entry point (the old bearer-token route is untouched, for compatibility).
// ============================================================================
const RESERVED_SLUGS = ['dashboard', 'customers', 'leads', 'bookings', 'revenue', 'performance', 'notifications', 'settings', 'profile', 'sign-in', 'sign-up', 'sign-out', 'forgot-password', 'reset-password', 'admin', 'me', 'auth', 'api'];
const isValidSlug = (slug) => isSlug(slug, 40, RESERVED_SLUGS);

export function listSupervisors({ search = '', page = 1, pageSize = 20 } = {}) {
  const like = search ? `%${str(search, 120)}%` : '';
  const { sql, params } = whereClause([['(name_ar LIKE ? OR name_en LIKE ? OR email LIKE ? OR slug LIKE ? OR id LIKE ?)', like && [like, like, like, like, like]]]);
  const { slice, ...meta } = pageQuery(`supervisors ${sql}`, 'created_at DESC', params, page, pageSize, 100);
  const ids = slice.map((s) => s.id); const customersCount = new Map();
  if (ids.length) for (const r of q.all(`SELECT attribution_supervisor AS id, COUNT(*) AS n FROM customers WHERE attribution_supervisor IN (${placeholders(ids)}) GROUP BY attribution_supervisor`, ...ids)) customersCount.set(r.id, r.n);
  return { items: slice.map((s) => ({ ...privateSupervisor(s), customersCount: customersCount.get(s.id) ?? 0 })), ...meta };
}
export function createSupervisor({ slug, nameAr, nameEn, email, phone = '', city = '' }, actor) {
  if (!isValidSlug(slug)) throw new HttpError(422, 'invalid');
  if (!nameAr && !nameEn) throw new HttpError(422, 'invalid');
  const e = email ? normEmail(email) : null;
  if (q.get('SELECT id FROM supervisors WHERE slug = ?', slug)) throw new HttpError(409, 'exists');
  if (e && q.get('SELECT id FROM supervisors WHERE email = ?', e)) throw new HttpError(409, 'exists');
  const id = `sv_${hex(8)}`; const t = now();
  q.run('INSERT INTO supervisors (id, active, slug, name_ar, name_en, email, phone, city, languages_json, specialties_json, services_json, notification_prefs_json, created_at, updated_at) VALUES (?,1,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, slug, str(nameAr, 120) || null, str(nameEn, 120) || null, e, str(phone, 30) || null, str(city, 60) || null, '[]', '[]', '[]', '{}', t, t);
  audit(actor, 'supervisor.create', 'supervisor', id, { slug });
  return privateSupervisor(supervisorById(id));
}
export function updateSupervisor(id, patch, actor) {
  const s = supervisorById(id); if (!s) throw new HttpError(404, 'notFound');
  if (patch.slug !== undefined && patch.slug !== s.slug) {
    if (!isValidSlug(patch.slug)) throw new HttpError(422, 'invalid');
    if (q.get('SELECT id FROM supervisors WHERE slug = ? AND id != ?', patch.slug, id)) throw new HttpError(409, 'exists');
  }
  const v = (k, cur, n = 120) => (patch[k] !== undefined ? str(patch[k], n) || null : cur);
  const active = patch.active !== undefined ? (patch.active ? 1 : 0) : s.active;
  const languagesJson = patch.languages !== undefined ? JSON.stringify(strArr(patch.languages, 6, 8)) : s.languages_json;
  const specialtiesJson = patch.specialties !== undefined ? JSON.stringify(strArr(patch.specialties)) : s.specialties_json;
  const servicesJson = patch.services !== undefined ? JSON.stringify(strArr(patch.services)) : s.services_json;
  const image = patch.image !== undefined ? imageJson(patch.image) : s.image_json;
  q.run('UPDATE supervisors SET slug = ?, name_ar = ?, name_en = ?, title_ar = ?, title_en = ?, bio_ar = ?, bio_en = ?, image_json = ?, languages_json = ?, specialties_json = ?, services_json = ?, phone = ?, whatsapp = ?, email = ?, city = ?, active = ?, updated_at = ? WHERE id = ?',
    v('slug', s.slug, 40), v('nameAr', s.name_ar), v('nameEn', s.name_en), v('titleAr', s.title_ar), v('titleEn', s.title_en), v('bioAr', s.bio_ar, 600), v('bioEn', s.bio_en, 600),
    image, languagesJson, specialtiesJson, servicesJson,
    v('phone', s.phone, 30), v('whatsapp', s.whatsapp, 30), patch.email !== undefined ? normEmail(patch.email) || null : s.email, v('city', s.city, 60), active, now(), id);
  audit(actor, active !== s.active ? (active ? 'supervisor.activate' : 'supervisor.deactivate') : 'supervisor.update', 'supervisor', id, {});
  return privateSupervisor(supervisorById(id));
}
/** The admin-side unified view of one supervisor: profile plus every scoped read model above, called explicitly with
    this supervisor's id rather than derived from a session — the same functions the supervisor's own portal uses. */
export function supervisorDetailForStaff(id) {
  const s = supervisorById(id); if (!s) return null;
  return {
    ...privateSupervisor(s),
    customers: supervisorCustomers(id, { pageSize: 50 }).items,
    bookings: supervisorBookings(id, { pageSize: 50 }).items,
    leads: supervisorLeads(id, { pageSize: 50 }).items,
    revenue: supervisorRevenue(id),
    performance: supervisorPerformance(id),
    commissions: supervisorCommissions(id, { pageSize: 20 }).items,
  };
}
/** Admin-wide leads across every supervisor — `supervisorLeads` above stays scoped to one supervisor's own session. */
export function adminLeads({ supervisorId = '', status = '', page = 1, pageSize = 20 } = {}) {
  const { sql, params } = whereClause([['supervisor_id = ?', supervisorId], ['status = ?', status]]);
  const { slice, ...meta } = pageQuery(`leads ${sql}`, 'created_at DESC', params, page, pageSize, 100);
  return { items: slice.map(nLead), ...meta };
}
/** Admin-wide attribution history — `supervisorCustomer` above reads this table too, but only for one customer reached through one supervisor's own session. */
export function adminAttributionEvents({ supervisorId = '', customerId = '', page = 1, pageSize = 20 } = {}) {
  const { sql, params } = whereClause([['supervisor_id = ?', supervisorId], ['customer_id = ?', customerId]]);
  const { slice, ...meta } = pageQuery(`attribution_events ${sql}`, 'at DESC', params, page, pageSize, 100);
  return { items: slice.map((h) => ({ customerId: h.customer_id, supervisorId: h.supervisor_id, previousSupervisorId: h.previous_supervisor_id, source: h.source, actor: h.actor, at: h.at })), ...meta };
}
