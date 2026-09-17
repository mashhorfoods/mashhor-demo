/* ============================================================================
   OPS / ADAPTERS / DEV AUTH — the development authentication stand-in for the
   operations portal. ⚠ Development only, this browser only. There is no
   sign-up (staff accounts are provisioned by the business): one seeded demo
   Admin account, exactly like the customer and supervisor dev stand-ins.

   QA switches (sessionStorage): no.dev.ops = 'error' | 'slow'
   ========================================================================= */
import { registerOpsAuthProvider, OpsAuthError } from '../auth.js';

const read = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const wait = async () => { await new Promise((r) => setTimeout(r, read('no.dev.ops') === 'slow' ? 2500 : 250)); if (read('no.dev.ops') === 'error') throw new OpsAuthError('unavailable', 'development ops auth: simulated outage'); };
const TTL_MS = 12 * 60 * 60 * 1000;
const rand = (n = 24) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); };

/** The seeded demo staff member — role 'admin' so every screen in dev/QA is reachable without a permission wall. */
export const DEV_STAFF = {
  id: 'staff-dev-demo', email: 'demo-ops@dev.invalid', name: 'Demo Admin (development)', role: 'admin',
  permissions: ['booking.view', 'booking.manage', 'booking.status.change', 'booking.assign', 'task.view', 'task.manage', 'document.review', 'supplier.view', 'supplier.manage', 'notification.send', 'notification.manage', 'service.manage', 'workflow.manage', 'report.view', 'audit.view'],
  active: true, createdAt: '2026-06-01T09:00:00.000Z', updatedAt: '2026-06-01T09:00:00.000Z', dev: true,
};

const KEY = 'no.dev.ops.auth';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? { tokens: {} }; } catch { return { tokens: {} }; } };
const save = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage unavailable */ } };
function issue(db) { const token = `dev.${rand()}`; const expiresAt = new Date(Date.now() + TTL_MS).toISOString(); db.tokens[token] = expiresAt; save(db); return { token, expiresAt, staff: { ...DEV_STAFF } }; }

export const DEV_OPS_AUTH = registerOpsAuthProvider({
  id: 'dev-ops-auth', dev: true,
  labelAr: 'مصادقة تطويرية للعمليات', labelEn: 'Development operations authentication',
  async signIn({ email, password }) {
    await wait();
    if (String(email ?? '').trim().toLowerCase() !== DEV_STAFF.email || !password) throw new OpsAuthError('invalid', 'invalid credentials');
    return issue(load());
  },
  /** One-click demo sign-in, like the customer and supervisor dev adapters. */
  async devSignIn() { await wait(); return issue(load()); },
  async signOut(token) { const db = load(); delete db.tokens[token]; save(db); },
  async verify(token) { await wait(); const db = load(); const expiresAt = db.tokens[token]; if (!expiresAt || Date.parse(expiresAt) < Date.now()) return null; return { staffId: DEV_STAFF.id, expiresAt, staff: { ...DEV_STAFF } }; },
  async requestReset() { await wait(); return { ok: true }; },
  async resetPassword() { await wait(); return { ok: true }; },
  async changePassword() { await wait(); return { ok: true }; },
});
