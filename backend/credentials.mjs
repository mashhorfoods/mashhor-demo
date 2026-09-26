// ============================================================================
// BACKEND / CREDENTIALS — the one credential stack behind all three roles
// (customers in identity.mjs, supervisors in supervisor.mjs, staff in
// staff.mjs): password verification with lockout, password set/change,
// server sessions, single-use reset tokens, and the /…/auth/* handlers.
//
// The ALGORITHM is shared; the STORES are not. Each role passes its own
// account table, session table, reset-token table, cookie pair, lockout-key
// prefix and token prefix, so a customer session can never be read as a
// supervisor or staff session (or the other way round) and the roles never
// share a lockout window. That separation is the role boundary; nothing here
// takes a role from the client.
// ============================================================================
import { scryptSync, timingSafeEqual } from 'node:crypto';
import { config } from './config.mjs';
import { q, now } from './db.mjs';
import { hex, HttpError, seenStale, loginAttempts, recordLoginFailure, clearLoginFailures, json, empty, fail, readJson, str, isEmail } from './http.mjs';
import { warn } from './logger.mjs';

export const hash = (password, salt) => scryptSync(password, salt, 32).toString('hex');
// Byte lengths, not string lengths: timingSafeEqual throws on buffers of different sizes, and a non-ASCII value can
// have the same number of characters as the secret but more bytes.
export const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
export const normEmail = (e) => String(e ?? '').trim().toLowerCase();
export function checkPassword(password) { if (typeof password !== 'string' || password.length < config.passwordMinLength || password.length > 256) throw new HttpError(422, 'weak'); }

/**
 * One role's credential store.
 *   table / sessionTable / resetTable — that role's own tables; `fk` is the account column in the other two.
 *   cookies     — the role's cookie pair, from http.mjs `sessionCookies(session, csrf)`.
 *   ctx         — the names server.mjs gives this role's { sid, session, account } on the request context.
 *   lockoutPrefix — prepended to the `e:<email>` / `ip:<ip>` lockout keys; `log` names the lockout warning.
 *   tokenPrefix — the reset token's visible prefix.
 *   activeOnly  — an account must be active (and have a password set) to sign in or be sent a reset.
 */
export function makeCredentialStore({ table, sessionTable, resetTable, fk, cookies, ctx, lockoutPrefix, log, tokenPrefix, activeOnly }) {
  const byId = (id) => q.get(`SELECT * FROM ${table} WHERE id = ?`, id);
  const byEmail = (email) => q.get(`SELECT * FROM ${table} WHERE email = ?`, normEmail(email));
  const usable = (a) => !!a && (!activeOnly || (!!a.active && !!a.password_hash));

  /** Lockout: too many failures for an email or an address within the window → 429, whatever the password. */
  function verifyPassword({ email, password, ip }) {
    const e = normEmail(email); const keys = [`${lockoutPrefix}e:${e}`, `${lockoutPrefix}ip:${ip}`];
    if (keys.some((k) => loginAttempts(k) >= config.lockout.attempts)) { warn(`${log}.lockout`, { ip }); throw new HttpError(429, 'rateLimited', { retryAfter: Math.ceil(config.lockout.windowMs / 1000) }); }
    const a = byEmail(e);
    const ok = usable(a) && typeof password === 'string' && same(hash(password, a.password_salt), a.password_hash);
    if (!ok) { keys.forEach(recordLoginFailure); throw new HttpError(401, 'invalid'); }   // one answer for unknown and wrong
    keys.forEach(clearLoginFailures); return a;
  }
  function setPassword(id, password) { checkPassword(password); const salt = hex(8); q.run(`UPDATE ${table} SET password_salt = ?, password_hash = ?, updated_at = ? WHERE id = ?`, salt, hash(password, salt), now(), id); }
  function changePassword(id, current, next) {
    const a = byId(id); if (!a) throw new HttpError(401, 'unauthenticated');
    if (!a.password_hash || !same(hash(String(current ?? ''), a.password_salt), a.password_hash)) throw new HttpError(422, 'invalid');
    setPassword(a.id, next);
  }

  function createSession(id) {
    const sid = hex(24); const csrf = hex(16); const t = now(); const exp = Date.now() + config.sessionTtlMs;
    q.run(`INSERT INTO ${sessionTable} (id, ${fk}, csrf, created_at, expires_at, last_seen_at) VALUES (?,?,?,?,?,?)`, sid, id, csrf, t, exp, t);
    return { id: sid, csrf, expiresAt: new Date(exp).toISOString(), maxAge: Math.floor(config.sessionTtlMs / 1000) };
  }
  function liveSession(sid) {
    if (!sid) return null; const s = q.get(`SELECT * FROM ${sessionTable} WHERE id = ?`, sid); if (!s) return null;
    if (s.expires_at <= Date.now()) { q.run(`DELETE FROM ${sessionTable} WHERE id = ?`, sid); return null; }
    if (seenStale(s.last_seen_at)) q.run(`UPDATE ${sessionTable} SET last_seen_at = ? WHERE id = ?`, now(), sid);   // at most once a minute, not a write per request
    return s;
  }
  const endSession = (sid) => { if (sid) q.run(`DELETE FROM ${sessionTable} WHERE id = ?`, sid); };
  const endAllSessions = (id) => q.run(`DELETE FROM ${sessionTable} WHERE ${fk} = ?`, id);
  const sweepSessions = () => q.run(`DELETE FROM ${sessionTable} WHERE expires_at <= ?`, Date.now());
  /** The session a request's cookie names, with its account — or null. */
  const resolve = (sid) => { const s = liveSession(sid); const a = s ? byId(s[fk]) : null; return a ? { session: s, account: a } : null; };

  /* Password reset: neutral, single-use, time-limited. */
  function createReset(email) {
    const a = byEmail(email); if (!a || (activeOnly && !a.active)) return null;
    const token = `${tokenPrefix}_${hex(16)}`; q.run(`INSERT INTO ${resetTable} (token, ${fk}, expires_at, created_at) VALUES (?,?,?,?)`, token, a.id, Date.now() + config.resetTtlMs, now());
    return { token, account: a };
  }
  function consumeReset(token, password) {
    const r = token ? q.get(`SELECT * FROM ${resetTable} WHERE token = ?`, token) : null;
    if (!r || r.expires_at <= Date.now()) { if (r) q.run(`DELETE FROM ${resetTable} WHERE token = ?`, token); throw new HttpError(410, 'invalidToken'); }
    setPassword(r[fk], password); q.run(`DELETE FROM ${resetTable} WHERE token = ?`, token); endAllSessions(r[fk]);
    return r[fk];
  }

  return { cookies, ctx, byId, byEmail, verifyPassword, setPassword, changePassword, createSession, liveSession, endSession, endAllSessions, sweepSessions, resolve, createReset, consumeReset };
}

/**
 * The /…/auth/* handlers for one store. `view(account)` is what a session answer carries under `key`;
 * `onResetRequest(reset)` sends the reset message; `onReset(accountId)` runs after a successful reset.
 * Returns the handlers as `routes`, and `sessionAnswer` for a role (customers) that also opens a session elsewhere.
 */
export function authRoutes(store, { key, view, onResetRequest, onReset = () => {} }) {
  const { sid, session, account } = store.ctx;
  const sessionAnswer = (res, a) => { const s = store.createSession(a.id); store.cookies.set(res, s.id, s.csrf, s.maxAge); return { [key]: view(a), expiresAt: s.expiresAt }; };
  const routes = {
    async signIn(req, res, ctx) { const b = await readJson(req); const a = store.verifyPassword({ email: b.email, password: b.password, ip: ctx.ip }); return json(res, 200, sessionAnswer(res, a)); },
    session(req, res, ctx) { if (!ctx[session]) return fail(res, 401, 'unauthenticated'); return json(res, 200, { [key]: view(ctx[account]), expiresAt: new Date(ctx[session].expires_at).toISOString() }); },
    refresh(req, res, ctx) { if (!ctx[session]) return fail(res, 401, 'unauthenticated'); store.endSession(ctx[session].id); return json(res, 200, sessionAnswer(res, ctx[account])); },
    signOut(req, res, ctx) { store.endSession(ctx[sid]); store.cookies.clear(res); return empty(res); },
    async resetRequest(req, res) {
      const b = await readJson(req); const email = normEmail(b.email);
      if (isEmail(email)) { const r = store.createReset(email); if (r) onResetRequest(r); }
      return json(res, 202, {});   // never reveals whether the address exists
    },
    async reset(req, res) { const b = await readJson(req); const id = store.consumeReset(str(b.token, 80), b.password); onReset(id); return empty(res); },
    async change(req, res, ctx) { if (!ctx[session]) return fail(res, 401, 'unauthenticated'); const b = await readJson(req); store.changePassword(ctx[account].id, b.current, b.next); return empty(res); },
  };
  return { sessionAnswer, routes };
}
