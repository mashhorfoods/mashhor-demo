/* ============================================================================
   OPS / AUTH — Stage 15. Admin and Operations Staff share this one portal and
   this one session marker, completely separate from the customer
   (assets/js/account/auth.js) and supervisor (assets/js/supervisor/auth.js)
   sessions: a different localStorage key, a different provider registry, and
   on the backend a third session cookie (no_ops_session). What separates an
   "admin" screen from an "ops" screen is the `permissions` array the backend
   returns on sign-in/verify — the UI reads it, the backend enforces it; the
   UI is never the authority (§22/§25).

   There is no sign-up here: staff accounts are provisioned by the business.

   Provider contract (every method async; errors are OpsAuthError):
     signIn({ email, password })  → { token, expiresAt, staff }
     signOut(token)
     verify(token)                → { staffId, expiresAt, staff } | null
     refresh(token)
     requestReset(email) / resetPassword({ token, password }) / changePassword(token, { current, next })
   ========================================================================= */
import { ENV } from '../data/env.js';
import { track } from '../core/diagnostics.js';

export class OpsAuthError extends Error {
  constructor(code, message = code) { super(message); this.name = 'OpsAuthError'; this.code = code; }
}

const providers = new Map();
export function registerOpsAuthProvider(p) { providers.set(p.id, p); return p; }
export function opsAuthProvider() { return [...providers.values()][0] ?? null; }

const KEY = 'no.ops.session';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } };
const write = (s) => { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ } };
export const currentOpsToken = () => read()?.token ?? null;

export function opsSessionLost(reason = 'expired') {
  if (read()) track('ops.session.expired', { reason });
  write(null); restored = Promise.resolve({ status: 'expired', staff: null });
}

let restored = null;
/** Resolves { status: 'guest' | 'staff' | 'expired' | 'unavailable', staff, code }. */
export function restoreOpsSession({ force = false } = {}) {
  if (restored && !force) return restored;
  restored = (async () => {
    const stored = read(); const provider = opsAuthProvider();
    if (!stored?.token || !provider) return { status: 'guest', staff: null };
    if (stored.expiresAt && Date.parse(stored.expiresAt) < Date.now()) { opsSessionLost('expired'); return { status: 'expired', staff: null }; }
    let v = null;
    try { v = await provider.verify(stored.token); } catch (error) {
      const code = error?.code ?? 'unavailable';
      if (code === 'unauthenticated') { opsSessionLost('rejected'); return { status: 'expired', staff: null }; }
      track('ops.auth.unavailable', { code }); return { status: 'unavailable', staff: null, code };
    }
    if (!v) { opsSessionLost('rejected'); return { status: 'expired', staff: null }; }
    const refreshMs = (ENV.authPublicConfig?.sessionRefreshMinutes ?? 10) * 60 * 1000;
    if (provider.refresh && v.expiresAt && Date.parse(v.expiresAt) - Date.now() < refreshMs) {
      try { const r = await provider.refresh(stored.token); if (r) { v = { ...v, ...r }; write({ ...stored, expiresAt: r.expiresAt ?? stored.expiresAt }); } } catch { /* the current session still stands */ }
    }
    return { status: 'staff', staff: v.staff };
  })();
  return restored;
}

export const adoptOpsSession = ({ token, expiresAt, staff }) => {
  write({ token, expiresAt, provider: opsAuthProvider()?.id });
  restored = Promise.resolve({ status: 'staff', staff });
  return staff;
};

export async function opsSignIn(credentials) {
  try { return adoptOpsSession(await opsAuthProvider().signIn(credentials)); }
  catch (error) { track('ops.auth.failure', { code: error?.code ?? 'error' }); throw error; }
}
export async function opsSignOut() {
  const token = currentOpsToken();
  try { if (token) await opsAuthProvider()?.signOut(token); } catch { /* the marker is dropped regardless */ }
  write(null); restored = Promise.resolve({ status: 'guest', staff: null });
}
export const requestOpsReset = (email) => opsAuthProvider().requestReset(email);
export const resetOpsPassword = (args) => opsAuthProvider().resetPassword(args);
export const changeOpsPassword = (args) => opsAuthProvider().changePassword(currentOpsToken(), args);

/** Permission helper the UI uses to decide what to show — never the authority; the backend checks again on every call. */
export function hasOpsPermission(staff, permission) { return !!staff && (staff.role === 'admin' || (staff.permissions ?? []).includes(permission)); }
