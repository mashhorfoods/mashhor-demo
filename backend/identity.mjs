// ============================================================================
// BACKEND / IDENTITY — the identity module behind /auth/*.
//
// Implementation: BACKEND-MANAGED credentials (scrypt with a per-account
// salt, constant-time comparison, lockout on repeated failures) and server
// sessions in the database. A hosted identity provider, when the business
// selects one, replaces `createIdentity` and the customer credential store
// below (backend/credentials.mjs) and keeps the same session table and routes — the browser
// contract does not change. Until then: HOSTED IDENTITY PROVIDER NOT
// CONNECTED; MFA pending that selection.
// ============================================================================
import { q, now } from './db.mjs';
import { hex, HttpError, sessionCookies } from './http.mjs';
import { makeCredentialStore, hash, checkPassword, normEmail } from './credentials.mjs';

/** The customer credential store: its own tables, the `no_session` / `no_csrf` cookie pair, unprefixed lockout keys. */
export const customers = makeCredentialStore({
  table: 'customers', sessionTable: 'sessions', resetTable: 'reset_tokens', fk: 'customer_id',
  cookies: sessionCookies('no_session', 'no_csrf'), ctx: { sid: 'sid', session: 'session', account: 'customer' },
  lockoutPrefix: '', log: 'auth', tokenPrefix: 'rs', activeOnly: false,
});
export const customerById = customers.byId;

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
  return { id: c.id, name: c.name, email: c.email, phone: c.phone, locale: c.locale,
    supervisorId, attribution: c.attribution_supervisor ? { supervisorId, source: c.attribution_source, at: c.attribution_at } : null,
    acceptance: c.acceptance_json ? JSON.parse(c.acceptance_json) : null, createdAt: c.created_at };
}
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
  if (customers.byEmail(email)) throw new HttpError(409, 'exists');
  const id = `cus_${hex(8)}`; const salt = hex(8); const t = now(); const attr = validAttribution(attribution);
  q.run('INSERT INTO customers (id, email, name, phone, locale, password_salt, password_hash, attribution_supervisor, attribution_source, attribution_at, acceptance_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, normEmail(email), name, phone, locale, salt, hash(password, salt), attr?.supervisorId ?? null, attr?.source ?? null, attr?.at ?? null, acceptance ? JSON.stringify({ ...acceptance, at: t }) : null, t, t);
  // Stage 13 audit trail (§26): every attribution a customer receives is logged server-side, at creation included.
  if (attr) q.run('INSERT INTO attribution_events (customer_id, supervisor_id, previous_supervisor_id, source, actor, at) VALUES (?,?,?,?,?,?)', id, attr.supervisorId, null, 'sign-up', 'customer', t);
  return customerById(id);
}
