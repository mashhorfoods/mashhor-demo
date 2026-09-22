/* ============================================================================
   SUPERVISOR / ADAPTERS / DEV AUTH — the development authentication stand-in
   for the supervisor portal. ⚠ Development only, this browser only. There is
   no sign-up (supervisor accounts are provisioned by the business): this
   adapter offers ONE seeded demo account, exactly like account/adapters/
   dev-auth.js's DEV_CUSTOMER, so the portal's screens can be reviewed.

   State (issued tokens, the editable profile) is kept in localStorage, not a
   module-level variable: each page is a full navigation, a fresh module
   instance, so anything held only in memory would "expire" on the very next
   page load. account/adapters/dev-auth.js uses the same pattern.

   QA switches (sessionStorage): no.dev.supervisor = 'error' | 'slow'
   ========================================================================= */
import { registerSupervisorAuthProvider, SupervisorAuthError } from '../auth.js';

const read = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const wait = async () => { await new Promise((r) => setTimeout(r, read('no.dev.supervisor') === 'slow' ? 2500 : 250)); if (read('no.dev.supervisor') === 'error') throw new SupervisorAuthError('unavailable', 'development supervisor auth: simulated outage'); };
const TTL_MS = 12 * 60 * 60 * 1000;
const rand = (n = 24) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); };

/** The seeded demo supervisor — matches slug 'supervisor-1' so its public profile and portal line up in QA. */
export const DEV_SUPERVISOR = {
  id: 'supervisor-1', slug: 'supervisor-1', status: 'active',
  nameAr: 'منسق تجريبي (تطوير)', nameEn: 'Demo Coordinator (development)', titleAr: null, titleEn: null, bioAr: null, bioEn: null,
  image: null, languages: ['ar', 'en'], specialties: [], services: [],
  phone: '', whatsapp: '', email: 'demo-supervisor@dev.invalid', city: '',
  internalId: 'dev-demo', notificationPrefs: {}, createdAt: '2026-06-01T09:00:00.000Z', updatedAt: '2026-06-01T09:00:00.000Z', dev: true,
};

const KEY = 'no.dev.supervisor.auth';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? { profile: DEV_SUPERVISOR, tokens: {} }; } catch { return { profile: DEV_SUPERVISOR, tokens: {} }; } };
const save = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage unavailable */ } };

function issue(db) {
  const token = `dev.${rand()}`; const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  db.tokens[token] = expiresAt; save(db);
  return { token, expiresAt, supervisor: { ...db.profile } };
}

export const DEV_SUPERVISOR_AUTH = registerSupervisorAuthProvider({
  id: 'dev-supervisor-auth', dev: true,
  labelAr: 'مصادقة تطويرية للمنسق', labelEn: 'Development coordinator authentication',
  async signIn({ email, password }) {
    await wait();
    if (String(email ?? '').trim().toLowerCase() !== DEV_SUPERVISOR.email || !password) throw new SupervisorAuthError('invalid', 'invalid credentials');
    return issue(load());
  },
  /** One-click demo sign-in, like account's devSignIn — no password needed for QA. */
  async devSignIn() { await wait(); return issue(load()); },
  async signOut(token) { const db = load(); delete db.tokens[token]; save(db); },
  async verify(token) {
    await wait(); const db = load(); const expiresAt = db.tokens[token];
    if (!expiresAt || Date.parse(expiresAt) < Date.now()) return null;
    return { supervisorId: db.profile.id, expiresAt, supervisor: { ...db.profile } };
  },
  async requestReset() { await wait(); return { ok: true }; },
  async resetPassword() { await wait(); return { ok: true }; },
  async changePassword() { await wait(); return { ok: true }; },
  /** The current profile without issuing a new session — for the data adapter's profile() and updateProfile(). */
  _current() { return { ...load().profile }; },
  async _update(patch) { const db = load(); db.profile = { ...db.profile, ...patch, updatedAt: new Date().toISOString() }; save(db); return { ...db.profile }; },
});
