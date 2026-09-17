/* ============================================================================
   SUPERVISOR / AUTH — Stage 13. The supervisor portal's own authentication,
   completely separate from the customer session (assets/js/account/auth.js):
   a different localStorage marker, a different provider registry, and (on
   the backend) a different session cookie. A customer being signed in has
   no bearing on a supervisor session and vice versa.

   There is no sign-up here: supervisor accounts are provisioned by the
   business (a future Admin Dashboard, Stage 14), never self-registered.

   Provider contract (every method async; errors are SupervisorAuthError):
     signIn({ email, password })  → { token, expiresAt, supervisor }
     signOut(token)
     verify(token)                → { supervisorId, expiresAt, supervisor } | null
     refresh(token)                → same shape, when the provider supports it
     requestReset(email)          → { ok }
     resetPassword({ token, password }) → { ok }
     changePassword(token, { current, next }) → { ok }
   ========================================================================= */
import { ENV } from '../data/env.js';
import { track } from '../core/diagnostics.js';

export class SupervisorAuthError extends Error {
  constructor(code, message = code) { super(message); this.name = 'SupervisorAuthError'; this.code = code; }
}

const providers = new Map();
export function registerSupervisorAuthProvider(p) { providers.set(p.id, p); return p; }
export function supervisorAuthProvider() { return [...providers.values()][0] ?? null; }

const KEY = 'no.supervisor.session';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } };
const write = (s) => { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ } };
export const currentSupervisorToken = () => read()?.token ?? null;

export function supervisorSessionLost(reason = 'expired') {
  if (read()) track('supervisor.session.expired', { reason });
  write(null); restored = Promise.resolve({ status: 'expired', supervisor: null });
}

let restored = null;
/** Resolves { status: 'guest' | 'supervisor' | 'expired' | 'unavailable', supervisor, code }. */
export function restoreSupervisorSession({ force = false } = {}) {
  if (restored && !force) return restored;
  restored = (async () => {
    const stored = read(); const provider = supervisorAuthProvider();
    if (!stored?.token || !provider) return { status: 'guest', supervisor: null };
    if (stored.expiresAt && Date.parse(stored.expiresAt) < Date.now()) { supervisorSessionLost('expired'); return { status: 'expired', supervisor: null }; }
    let v = null;
    try { v = await provider.verify(stored.token); } catch (error) {
      const code = error?.code ?? 'unavailable';
      if (code === 'unauthenticated') { supervisorSessionLost('rejected'); return { status: 'expired', supervisor: null }; }
      track('supervisor.auth.unavailable', { code }); return { status: 'unavailable', supervisor: null, code };
    }
    if (!v) { supervisorSessionLost('rejected'); return { status: 'expired', supervisor: null }; }
    const refreshMs = (ENV.authPublicConfig?.sessionRefreshMinutes ?? 10) * 60 * 1000;
    if (provider.refresh && v.expiresAt && Date.parse(v.expiresAt) - Date.now() < refreshMs) {
      try { const r = await provider.refresh(stored.token); if (r) { v = { ...v, ...r }; write({ ...stored, expiresAt: r.expiresAt ?? stored.expiresAt }); } } catch { /* the current session still stands */ }
    }
    return { status: 'supervisor', supervisor: v.supervisor };
  })();
  return restored;
}

export const adoptSupervisorSession = ({ token, expiresAt, supervisor }) => {
  write({ token, expiresAt, provider: supervisorAuthProvider()?.id });
  restored = Promise.resolve({ status: 'supervisor', supervisor });
  return supervisor;
};

export async function supervisorSignIn(credentials) {
  try { return adoptSupervisorSession(await supervisorAuthProvider().signIn(credentials)); }
  catch (error) { track('supervisor.auth.failure', { code: error?.code ?? 'error' }); throw error; }
}
export async function supervisorSignOut() {
  const token = currentSupervisorToken();
  try { if (token) await supervisorAuthProvider()?.signOut(token); } catch { /* the marker is dropped regardless */ }
  write(null); restored = Promise.resolve({ status: 'guest', supervisor: null });
}
export const requestSupervisorReset = (email) => supervisorAuthProvider().requestReset(email);
export const resetSupervisorPassword = (args) => supervisorAuthProvider().resetPassword(args);
export const changeSupervisorPassword = (args) => supervisorAuthProvider().changePassword(currentSupervisorToken(), args);
