/* ============================================================================
   ACCOUNT / ADAPTERS / DEV AUTH — the development authentication stand-in.

   ⚠ Development only. Accounts live in this browser's localStorage; the
   password is never stored, only a salted SHA-256 digest, but that is a
   convenience for testing the screens — it is NOT security. A production
   provider (hosted identity, server sessions, HttpOnly cookies) replaces this
   file in installed.js. Nothing here is presented as production security:
   every sign-in screen shows the development notice while this adapter is
   registered.

   QA switches (sessionStorage):  no.dev.auth = 'error' | 'slow'
   ========================================================================= */

import { registerAuthProvider, AuthError } from '../auth.js';

const KEY = 'no.dev.auth';
const TTL_MS = 12 * 60 * 60 * 1000;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? { accounts: {}, tokens: {}, resets: {} }; } catch { return { accounts: {}, tokens: {}, resets: {} }; } };
const save = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage unavailable */ } };
const read = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const wait = async () => { await new Promise((r) => setTimeout(r, read('no.dev.auth') === 'slow' ? 2500 : 250)); if (read('no.dev.auth') === 'error') throw new AuthError('unavailable', 'development auth: simulated outage'); };
const rand = (n = 24) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); };
async function digest(salt, password) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const normEmail = (e) => String(e ?? '').trim().toLowerCase();
const publicCustomer = (a) => ({ id: a.id, name: a.name, email: a.email, phone: a.phone ?? '', locale: a.locale ?? 'ar', image: null, supervisorId: a.supervisorId ?? null, attribution: a.attribution ?? (a.supervisorId ? { supervisorId: a.supervisorId, source: 'link', at: a.createdAt } : null), acceptance: a.acceptance ?? null, createdAt: a.createdAt, dev: true });

/** The seeded development customer: signed in with one click, no password, so the populated account can be reviewed. */
export const DEV_CUSTOMER = { id: 'cus-dev-demo', name: 'Demo Customer', email: 'demo@dev.invalid', phone: '', locale: 'ar', supervisorId: 'ahmed-mohamed', createdAt: '2026-06-01T09:00:00.000Z' };

function issue(db, account) {
  const token = `dev.${rand()}`; const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  db.tokens[token] = { customerId: account.id, expiresAt }; save(db);
  return { token, expiresAt, customer: publicCustomer(account) };
}
const byId = (db, id) => Object.values(db.accounts).find((a) => a.id === id) ?? null;

export const DEV_AUTH = registerAuthProvider({
  id: 'dev-auth', dev: true,
  labelAr: 'مصادقة تطويرية', labelEn: 'Development authentication',

  async signIn({ email, password }) {
    await wait();
    const db = load(); const a = db.accounts[normEmail(email)];
    if (!a || !password || (await digest(a.salt, password)) !== a.hash) throw new AuthError('invalid', 'invalid credentials');
    return issue(db, a);
  },
  async signUp({ name, email, phone = '', password, locale = 'ar', supervisorId = null, acceptance = null }) {
    await wait();
    const db = load(); const key = normEmail(email);
    if (db.accounts[key]) throw new AuthError('exists', 'account exists');
    if (!password || password.length < 8) throw new AuthError('weak', 'password too short');
    const salt = rand(8);
    db.accounts[key] = { id: `cus-${rand(6)}`, name: String(name).trim(), email: key, phone: String(phone).trim(), locale, supervisorId, attribution: supervisorId ? { supervisorId, source: 'link', at: new Date().toISOString() } : null, acceptance: acceptance ? { ...acceptance, at: new Date().toISOString() } : null, salt, hash: await digest(salt, password), createdAt: new Date().toISOString() };
    return issue(db, db.accounts[key]);
  },
  /** Development shortcut: the seeded customer, no password. Not part of the contract a real provider implements. */
  async devSignIn() {
    await wait();
    const db = load(); const key = DEV_CUSTOMER.email;
    db.accounts[key] ??= { ...DEV_CUSTOMER, salt: rand(8), hash: 'none' };
    return issue(db, db.accounts[key]);
  },
  async signOut(token) { const db = load(); delete db.tokens[token]; save(db); },
  async verify(token) {
    const db = load(); const t = db.tokens[token];
    if (!t || Date.parse(t.expiresAt) < Date.now()) { if (t) { delete db.tokens[token]; save(db); } return null; }
    const a = byId(db, t.customerId); if (!a) return null;
    return { customerId: a.id, expiresAt: t.expiresAt, customer: publicCustomer(a) };
  },
  async requestReset(email) {
    await wait();
    const db = load(); const a = db.accounts[normEmail(email)];
    // The answer never reveals whether the address exists. In development the
    // link that an e-mail would carry is returned so the screen can show it.
    if (!a) return { ok: true };
    const token = `reset.${rand(12)}`; db.resets[token] = { email: a.email, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() }; save(db);
    return { ok: true, devLink: `account/reset-password/?token=${token}` };
  },
  async resetPassword({ token, password }) {
    await wait();
    const db = load(); const r = db.resets[token];
    if (!r || Date.parse(r.expiresAt) < Date.now()) throw new AuthError('invalidToken', 'reset link invalid or expired');
    if (!password || password.length < 8) throw new AuthError('weak', 'password too short');
    const a = db.accounts[r.email]; a.salt = rand(8); a.hash = await digest(a.salt, password); delete db.resets[token];
    Object.keys(db.tokens).forEach((k) => { if (db.tokens[k].customerId === a.id) delete db.tokens[k]; });   // every session ends
    save(db); return { ok: true };
  },
  async changePassword(token, { current, next }) {
    await wait();
    const db = load(); const t = db.tokens[token]; const a = t && byId(db, t.customerId);
    if (!a) throw new AuthError('unauthenticated');
    if (a.hash !== 'none' && (await digest(a.salt, current)) !== a.hash) throw new AuthError('invalid', 'current password wrong');
    if (!next || next.length < 8) throw new AuthError('weak', 'password too short');
    a.salt = rand(8); a.hash = await digest(a.salt, next); save(db); return { ok: true };
  },
  /** Profile fields the identity provider owns (name, phone, locale) — the customer adapter delegates here. */
  async updateAccount(token, patch) {
    const db = load(); const t = db.tokens[token]; const a = t && byId(db, t.customerId);
    if (!a) throw new AuthError('unauthenticated');
    if (patch.name != null) a.name = String(patch.name).trim();
    if (patch.phone != null) a.phone = String(patch.phone).trim();
    if (patch.locale != null) a.locale = patch.locale;
    if (patch.supervisorId && !a.supervisorId) { a.supervisorId = patch.supervisorId; a.attribution = { supervisorId: patch.supervisorId, source: 'booking', at: new Date().toISOString() }; }   // set once, never edited by the customer
    save(db); return publicCustomer(a);
  },
});
