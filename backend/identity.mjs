// ============================================================================
// BACKEND / IDENTITY — the identity module behind /auth/*.
//
// Implementation: BACKEND-MANAGED credentials (scrypt with a per-account
// salt, constant-time comparison, lockout on repeated failures) and server
// sessions in the database. A hosted identity provider, when the business
// selects one, replaces the `verifyPassword` / `createIdentity` / reset
// functions here and keeps the same session table and routes — the browser
// contract does not change. Until then: HOSTED IDENTITY PROVIDER NOT
// CONNECTED; MFA pending that selection.
// ============================================================================
import { scryptSync, timingSafeEqual } from 'node:crypto';
import { config } from './config.mjs';
import { q, now } from './db.mjs';
import { hex, HttpError, seenStale, loginAttempts, recordLoginFailure, clearLoginFailures } from './http.mjs';
import { warn } from './logger.mjs';

// Exported so backend/supervisor.mjs (Stage 13) can hash and compare supervisor passwords with the same scrypt settings
// without a second implementation; the credential STORE is separate (a different table), only the algorithm is shared.
export const hash = (password, salt) => scryptSync(password, salt, 32).toString('hex');
// Byte lengths, not string lengths: timingSafeEqual throws on buffers of different sizes, and a non-ASCII value can
// have the same number of characters as the secret but more bytes.
export const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
export const normEmail = (e) => String(e ?? '').trim().toLowerCase();

/** Customer-facing responses expose a supervisor's PUBLIC slug, never the internal backend id: the frontend registry
    (assets/js/data/supervisors.js) only recognises a supervisor by slug. Falls back to the raw id only if a
    supervisor genuinely has no slug yet. Returns a lookup that remembers what it resolved, so mapping a list costs
    one query per distinct supervisor — not one per row (the N+1 the 2026-09-25 review found). Create one per
    response, never share it across requests: an admin can change a slug at any time. */
export const slugLookup = () => {
  const seen = new Map();
  return (id) => {
    if (!id) return null;
    if (!seen.has(id)) seen.set(id, q.get('SELECT slug FROM supervisors WHERE id = ?', id)?.slug ?? id);
    return seen.get(id);
  };
};
export function publicCustomer(c, slug = slugLookup()) {
  if (!c) return null;
  const supervisorId = slug(c.attribution_supervisor);
  return { id: c.id, name: c.name, email: c.email, phone: c.phone, locale: c.locale, image: c.image ?? null,
    supervisorId, attribution: c.attribution_supervisor ? { supervisorId, source: c.attribution_source, at: c.attribution_at } : null,
    acceptance: c.acceptance_json ? JSON.parse(c.acceptance_json) : null, createdAt: c.created_at };
}
export const customerById = (id) => q.get('SELECT * FROM customers WHERE id = ?', id);
export const customerByEmail = (email) => q.get('SELECT * FROM customers WHERE email = ?', normEmail(email));

export function checkPassword(password) { if (typeof password !== 'string' || password.length < config.passwordMinLength || password.length > 256) throw new HttpError(422, 'weak'); }

/** Attribution is accepted once, at creation, and only for a supervisor the backend knows. Never editable by the
    customer. The frontend always carries the supervisor SLUG (the public route segment, `?supervisor=<slug>` — see
    assets/js/data/supervisors.js), never a real backend id, so resolution is by slug first, falling back to id for
    a caller that already has the real id (an admin action, or a pre-slug row). Whichever matched, the REAL backend
    id is what gets returned and stored — every FK (customers.attribution_supervisor, bookings.supervisor_id, …)
    stays keyed on the one real id, never on the public-facing slug. */
export function validAttribution(a) {
  const key = typeof a?.supervisorId === 'string' ? a.supervisorId : null;
  if (!key) return null;
  const row = q.get('SELECT id FROM supervisors WHERE (slug = ? OR id = ?) AND active = 1', key, key);
  if (!row) return null;
  return { supervisorId: row.id, source: a.source === 'booking' ? 'booking' : 'link', at: now() };
}

export function createIdentity({ name, email, phone, locale, password, attribution, acceptance }) {
  checkPassword(password);
  if (customerByEmail(email)) throw new HttpError(409, 'exists');
  const id = `cus_${hex(8)}`; const salt = hex(8); const t = now(); const attr = validAttribution(attribution);
  q.run('INSERT INTO customers (id, email, name, phone, locale, password_salt, password_hash, attribution_supervisor, attribution_source, attribution_at, acceptance_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, normEmail(email), name, phone, locale, salt, hash(password, salt), attr?.supervisorId ?? null, attr?.source ?? null, attr?.at ?? null, acceptance ? JSON.stringify({ ...acceptance, at: t }) : null, t, t);
  // Stage 13 audit trail (§26): every attribution a customer receives is logged server-side, at creation included.
  if (attr) q.run('INSERT INTO attribution_events (customer_id, supervisor_id, previous_supervisor_id, source, actor, at) VALUES (?,?,?,?,?,?)', id, attr.supervisorId, null, 'sign-up', 'customer', t);
  return customerById(id);
}

/** Lockout: too many failures for an email or an address within the window → 429, whatever the password. */
export function verifyPassword({ email, password, ip }) {
  const e = normEmail(email); const keys = [`e:${e}`, `ip:${ip}`];
  if (keys.some((k) => loginAttempts(k) >= config.lockout.attempts)) { warn('auth.lockout', { ip }); throw new HttpError(429, 'rateLimited', { retryAfter: Math.ceil(config.lockout.windowMs / 1000) }); }
  const c = customerByEmail(e);
  const ok = !!c && typeof password === 'string' && same(hash(password, c.password_salt), c.password_hash);
  if (!ok) { keys.forEach(recordLoginFailure); throw new HttpError(401, 'invalid'); }   // one answer for unknown and wrong
  keys.forEach(clearLoginFailures); return c;
}
export function changePassword(customerId, current, next) {
  const c = customerById(customerId); if (!c) throw new HttpError(401, 'unauthenticated');
  if (!same(hash(String(current ?? ''), c.password_salt), c.password_hash)) throw new HttpError(422, 'invalid');
  setPassword(c.id, next);
}
export function setPassword(customerId, password) { checkPassword(password); const salt = hex(8); q.run('UPDATE customers SET password_salt = ?, password_hash = ?, updated_at = ? WHERE id = ?', salt, hash(password, salt), now(), customerId); }

/* ---- sessions -------------------------------------------------------- */
export function createSession(customerId) {
  const id = hex(24); const csrf = hex(16); const t = now(); const exp = Date.now() + config.sessionTtlMs;
  q.run('INSERT INTO sessions (id, customer_id, csrf, created_at, expires_at, last_seen_at) VALUES (?,?,?,?,?,?)', id, customerId, csrf, t, exp, t);
  return { id, csrf, expiresAt: new Date(exp).toISOString(), maxAge: Math.floor(config.sessionTtlMs / 1000) };
}
export function liveSession(sid) {
  if (!sid) return null; const s = q.get('SELECT * FROM sessions WHERE id = ?', sid); if (!s) return null;
  if (s.expires_at <= Date.now()) { q.run('DELETE FROM sessions WHERE id = ?', sid); return null; }
  if (seenStale(s.last_seen_at)) q.run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', now(), sid);   // at most once a minute, not a write per request
  return s;
}
export const endSession = (sid) => { if (sid) q.run('DELETE FROM sessions WHERE id = ?', sid); };
export const endAllSessions = (customerId) => q.run('DELETE FROM sessions WHERE customer_id = ?', customerId);
export const sweepSessions = () => q.run('DELETE FROM sessions WHERE expires_at <= ?', Date.now());

/* ---- password reset: neutral, single-use, time-limited ------------------ */
export function createReset(email) {
  const c = customerByEmail(email); if (!c) return null;
  const token = `rs_${hex(16)}`; q.run('INSERT INTO reset_tokens (token, customer_id, expires_at, created_at) VALUES (?,?,?,?)', token, c.id, Date.now() + config.resetTtlMs, now());
  return { token, customer: c };
}
export function consumeReset(token, password) {
  const r = token ? q.get('SELECT * FROM reset_tokens WHERE token = ?', token) : null;
  if (!r || r.expires_at <= Date.now()) { if (r) q.run('DELETE FROM reset_tokens WHERE token = ?', token); throw new HttpError(410, 'invalidToken'); }
  setPassword(r.customer_id, password); q.run('DELETE FROM reset_tokens WHERE token = ?', token); endAllSessions(r.customer_id);
  return r.customer_id;
}
