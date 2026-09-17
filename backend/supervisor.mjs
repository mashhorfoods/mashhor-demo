// ============================================================================
// BACKEND / SUPERVISOR — Stage 13. Supervisor identity, sessions, attribution
// and the read models the supervisor portal consumes. A SEPARATE credential
// store and session table from customers (backend/identity.mjs): a customer
// session cookie is never accepted here and a supervisor session cookie is
// never accepted on /me/*. That separation IS the role boundary between the
// two roles — no client-supplied role flag exists anywhere in this backend.
//
// Reassignment and slug/profile management belong to the future Admin
// Dashboard (Stage 14): this module implements the functions and a
// minimal, disabled-by-default admin entry point (routes.mjs `admin`,
// guarded by BACKEND_ADMIN_TOKEN) so the architecture is ready without a
// UI being built now (§40).
// ============================================================================
import { config } from './config.mjs';
import { q, now } from './db.mjs';
import { hex, HttpError, str } from './http.mjs';
import { hash, same, checkPassword, normEmail } from './identity.mjs';
import { warn } from './logger.mjs';

const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

/** Reserved route segments under /supervisor/ that a slug may never take (they are the portal's own pages). */
export const RESERVED_SLUGS = ['dashboard', 'customers', 'leads', 'bookings', 'revenue', 'performance', 'notifications', 'settings', 'profile', 'sign-in', 'sign-up', 'sign-out', 'forgot-password', 'reset-password', 'admin', 'me', 'auth', 'api'];
export const isValidSlug = (slug) => typeof slug === 'string' && /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(slug) && !RESERVED_SLUGS.includes(slug);

/* ---- rows → contract shapes ---------------------------------------------- */
/** Public-safe: what the (future) public directory and the portal's own "my profile" view may show anyone. No credential, no internal id. */
export function publicSupervisor(s) {
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
  return { ...publicSupervisor(s), internalId: s.internal_id ?? null, notificationPrefs: J(s.notification_prefs_json, {}), createdAt: s.created_at ?? null, updatedAt: s.updated_at ?? null };
}
export const supervisorById = (id) => q.get('SELECT * FROM supervisors WHERE id = ?', id);
export const supervisorByEmail = (email) => q.get('SELECT * FROM supervisors WHERE email = ?', normEmail(email));
export const supervisorBySlug = (slug) => q.get('SELECT * FROM supervisors WHERE slug = ?', slug);
export const activeSupervisor = (id) => { const s = supervisorById(id); return s && s.active ? s : null; };

/* ---- credentials (same algorithm as identity.mjs; a separate store) ------ */
/** True only for an ACTIVE supervisor with a password already set — a freshly provisioned account (no password yet) never authenticates by guessing. */
export function verifySupervisorPassword({ email, password, ip }) {
  const e = normEmail(email); const keys = [`sv:e:${e}`, `sv:ip:${ip}`];
  if (keys.some((k) => attempts(k) >= config.lockout.attempts)) { warn('supervisor.auth.lockout', { ip }); throw new HttpError(429, 'rateLimited', { retryAfter: Math.ceil(config.lockout.windowMs / 1000) }); }
  const s = supervisorByEmail(e);
  const ok = !!s && s.active && s.password_hash && typeof password === 'string' && same(hash(password, s.password_salt), s.password_hash);
  if (!ok) { keys.forEach(recordFailure); throw new HttpError(401, 'invalid'); }
  keys.forEach(clearFailures); return s;
}
export function setSupervisorPassword(supervisorId, password) { checkPassword(password); const salt = hex(8); q.run('UPDATE supervisors SET password_salt = ?, password_hash = ?, updated_at = ? WHERE id = ?', salt, hash(password, salt), now(), supervisorId); }
export function changeSupervisorPassword(supervisorId, current, next) {
  const s = supervisorById(supervisorId); if (!s) throw new HttpError(401, 'unauthenticated');
  if (!s.password_hash || !same(hash(String(current ?? ''), s.password_salt), s.password_hash)) throw new HttpError(422, 'invalid');
  setSupervisorPassword(s.id, next);
}
function attempts(key) { const row = q.get('SELECT * FROM login_attempts WHERE key = ?', key); const t = Date.now(); if (!row || t - row.window_start > config.lockout.windowMs) return 0; return row.count; }
function recordFailure(key) { const t = Date.now(); const row = q.get('SELECT * FROM login_attempts WHERE key = ?', key); if (!row || t - row.window_start > config.lockout.windowMs) q.run('INSERT OR REPLACE INTO login_attempts (key, count, window_start) VALUES (?, 1, ?)', key, t); else q.run('UPDATE login_attempts SET count = count + 1 WHERE key = ?', key); }
const clearFailures = (key) => q.run('DELETE FROM login_attempts WHERE key = ?', key);

/* ---- sessions (own table, own cookies — backend/http.mjs) ----------------- */
export function createSupervisorSession(supervisorId) {
  const id = hex(24); const csrf = hex(16); const t = now(); const exp = Date.now() + config.sessionTtlMs;
  q.run('INSERT INTO supervisor_sessions (id, supervisor_id, csrf, created_at, expires_at, last_seen_at) VALUES (?,?,?,?,?,?)', id, supervisorId, csrf, t, exp, t);
  return { id, csrf, expiresAt: new Date(exp).toISOString(), maxAge: Math.floor(config.sessionTtlMs / 1000) };
}
export function liveSupervisorSession(sid) {
  if (!sid) return null; const s = q.get('SELECT * FROM supervisor_sessions WHERE id = ?', sid); if (!s) return null;
  if (s.expires_at <= Date.now()) { q.run('DELETE FROM supervisor_sessions WHERE id = ?', sid); return null; }
  q.run('UPDATE supervisor_sessions SET last_seen_at = ? WHERE id = ?', now(), sid); return s;
}
export const endSupervisorSession = (sid) => { if (sid) q.run('DELETE FROM supervisor_sessions WHERE id = ?', sid); };
export const endAllSupervisorSessions = (supervisorId) => q.run('DELETE FROM supervisor_sessions WHERE supervisor_id = ?', supervisorId);
export const sweepSupervisorSessions = () => q.run('DELETE FROM supervisor_sessions WHERE expires_at <= ?', Date.now());

/* ---- password reset: neutral, single-use, time-limited (mirrors identity.mjs) */
export function createSupervisorReset(email) {
  const s = supervisorByEmail(email); if (!s || !s.active) return null;
  const token = `svrs_${hex(16)}`; q.run('INSERT INTO supervisor_reset_tokens (token, supervisor_id, expires_at, created_at) VALUES (?,?,?,?)', token, s.id, Date.now() + config.resetTtlMs, now());
  return { token, supervisor: s };
}
export function consumeSupervisorReset(token, password) {
  const r = token ? q.get('SELECT * FROM supervisor_reset_tokens WHERE token = ?', token) : null;
  if (!r || r.expires_at <= Date.now()) { if (r) q.run('DELETE FROM supervisor_reset_tokens WHERE token = ?', token); throw new HttpError(410, 'invalidToken'); }
  setSupervisorPassword(r.supervisor_id, password); q.run('DELETE FROM supervisor_reset_tokens WHERE token = ?', token); endAllSupervisorSessions(r.supervisor_id);
  return r.supervisor_id;
}

/* ---- attribution: business rule from business_config, server-authoritative (§9, §26, §27) ---- */
export const attributionModel = () => J(q.get("SELECT value_json FROM business_config WHERE key = 'attribution_model'")?.value_json, { rule: 'first', status: 'pending_business_confirmation' });
export const commissionModel = () => J(q.get("SELECT value_json FROM business_config WHERE key = 'commission_model'")?.value_json, { model: null, status: 'pending_business_configuration' });

function logAttribution(customerId, supervisorId, previousSupervisorId, source, actor) {
  q.run('INSERT INTO attribution_events (customer_id, supervisor_id, previous_supervisor_id, source, actor, at) VALUES (?,?,?,?,?,?)', customerId, supervisorId, previousSupervisorId, source, actor, now());
}
/**
 * Apply attribution to a customer under the FIRST-ATTRIBUTION rule (the only rule implemented and confirmed as
 * current behaviour; see business_config). Never overwrites an existing attribution — every attempt is logged, even
 * when it changes nothing, so the audit trail shows every touch a customer received. Returns the customer's
 * attribution after the call (unchanged if one already existed).
 */
export function assignAttribution(customerId, supervisorId, source, actor = 'customer') {
  const c = q.get('SELECT * FROM customers WHERE id = ?', customerId); if (!c) return null;
  if (c.attribution_supervisor) { logAttribution(customerId, c.attribution_supervisor, c.attribution_supervisor, `${source}:no-op(first-wins)`, actor); return { supervisorId: c.attribution_supervisor, source: c.attribution_source, at: c.attribution_at }; }
  if (!supervisorId || !activeSupervisor(supervisorId)) return null;
  const at = now();
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
  const where = ['attribution_supervisor = ?']; const params = [supervisorId];
  if (search) { where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ?)'); const s = `%${search}%`; params.push(s, s, s); }
  const sql = `SELECT * FROM customers WHERE ${where.join(' AND ')} ORDER BY created_at DESC`;
  const all = q.all(sql, ...params);
  const size = Math.min(50, Math.max(1, pageSize)); const p = Math.max(1, page);
  const slice = all.slice((p - 1) * size, p * size);
  return {
    items: slice.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, locale: c.locale, attributionAt: c.attribution_at, createdAt: c.created_at,
      bookingsCount: q.get('SELECT COUNT(*) AS n FROM bookings WHERE customer_id = ?', c.id).n, lastActivityAt: q.get('SELECT MAX(created_at) AS m FROM bookings WHERE customer_id = ?', c.id).m ?? c.created_at })),
    page: p, pageSize: size, total: all.length, nextPage: p * size < all.length ? p + 1 : null,
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
  const where = ['supervisor_id = ?']; const params = [supervisorId];
  if (status) { where.push('status = ?'); params.push(status); }
  if (service) { where.push('service = ?'); params.push(service); }
  const all = q.all(`SELECT * FROM bookings WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, ...params);
  const size = Math.min(50, Math.max(1, pageSize)); const p = Math.max(1, page); const slice = all.slice((p - 1) * size, p * size);
  return { items: slice.map((b) => ({ id: b.id, customerId: b.customer_id, customerName: custOf(b.customer_id)?.name ?? '', service: b.service, status: b.status, paymentStatus: b.payment_status, amount: b.amount, currency: b.currency, createdAt: b.created_at, tripId: b.trip_id })), page: p, pageSize: size, total: all.length, nextPage: p * size < all.length ? p + 1 : null };
}
/** ONLY a booking currently attributed to this supervisor — never any booking by id. */
export function supervisorBooking(supervisorId, bookingId) {
  const b = q.get('SELECT * FROM bookings WHERE id = ? AND supervisor_id = ?', bookingId, supervisorId); if (!b) return null;
  const c = custOf(b.customer_id);
  return { id: b.id, customerId: b.customer_id, customerName: c?.name ?? '', service: b.service, status: b.status, paymentStatus: b.payment_status, amount: b.amount, currency: b.currency, createdAt: b.created_at, detail: J(b.detail_json, {}) };
}
export function supervisorLeads(supervisorId, { status = '', page = 1, pageSize = 20 } = {}) {
  const where = ['supervisor_id = ?']; const params = [supervisorId];
  if (status) { where.push('status = ?'); params.push(status); }
  const all = q.all(`SELECT * FROM leads WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, ...params);
  const size = Math.min(50, Math.max(1, pageSize)); const p = Math.max(1, page); const slice = all.slice((p - 1) * size, p * size);
  return { items: slice.map(nLead), page: p, pageSize: size, total: all.length, nextPage: p * size < all.length ? p + 1 : null };
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
  const params = [supervisorId]; let clause = 'supervisor_id = ?';
  if (since) { clause += ' AND created_at >= ?'; params.push(since); }
  const rows = q.all(`SELECT status, payment_status, amount, currency FROM bookings WHERE ${clause}`, ...params);
  const sum = (pred) => rows.filter(pred).reduce((n, r) => n + (r.amount || 0), 0);
  const currency = rows[0]?.currency ?? 'USD';
  return {
    currency,
    gross: sum(() => true),
    completed: sum((r) => r.payment_status === 'paid'),
    pending: sum((r) => r.payment_status === 'unpaid'),
    cancelled: sum((r) => r.status === 'cancelled'),
    bookingsCount: rows.length,
    commission: commissionModel(),
  };
}
export function supervisorPerformance(supervisorId, { since = null } = {}) {
  const params = [supervisorId]; let clause = 'attribution_supervisor = ?';
  if (since) { clause += ' AND created_at >= ?'; params.push(since); }
  const customers = q.get(`SELECT COUNT(*) AS n FROM customers WHERE ${clause}`, ...params).n;
  const bookingParams = [supervisorId]; let bClause = 'supervisor_id = ?';
  if (since) { bClause += ' AND created_at >= ?'; bookingParams.push(since); }
  const bookings = q.all(`SELECT status FROM bookings WHERE ${bClause}`, ...bookingParams);
  const leadParams = [supervisorId]; let lClause = 'supervisor_id = ?';
  if (since) { lClause += ' AND created_at >= ?'; leadParams.push(since); }
  const leads = q.all(`SELECT status FROM leads WHERE ${lClause}`, ...leadParams);
  const converted = leads.filter((l) => l.status === 'converted').length;
  return {
    customers, leads: leads.length, leadsConverted: converted, conversionRate: leads.length ? converted / leads.length : null,
    bookings: bookings.length, bookingsConfirmed: bookings.filter((b) => b.status === 'confirmed').length, bookingsCancelled: bookings.filter((b) => b.status === 'cancelled').length,
  };
}
export const nSupervisorNotification = (r) => ({ id: r.id, kind: r.kind, at: r.at, read: !!r.read, titleAr: r.title_ar, titleEn: r.title_en, textAr: r.text_ar, textEn: r.text_en, href: r.href, bookingId: r.booking_id });

/** Supervisor rights / commission, scoped to this supervisor only. Empty (not fabricated) until the business configures a model; existing rows read status 'pending_configuration' with a null amount rather than a guessed figure. §18 */
export function supervisorCommissions(supervisorId, { page = 1, pageSize = 20 } = {}) {
  const all = q.all('SELECT * FROM commissions WHERE supervisor_id = ? ORDER BY created_at DESC', supervisorId);
  const size = Math.min(50, Math.max(1, pageSize)); const p = Math.max(1, page); const slice = all.slice((p - 1) * size, p * size);
  return { model: commissionModel(), items: slice.map((c) => ({ id: c.id, bookingId: c.booking_id, amount: c.amount, currency: c.currency, status: c.status, period: c.period, createdAt: c.created_at })), page: p, pageSize: size, total: all.length, nextPage: p * size < all.length ? p + 1 : null };
}
