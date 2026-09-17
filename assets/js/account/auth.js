/* ============================================================================
   ACCOUNT / AUTH — authentication providers and the customer session. Stage 12

   Provider contract (every method async; errors are AuthError with a `code`):
     id, dev                     'dev-auth' | 'cognito' | …; dev: true for the stand-in
     signIn({ email, password })         → { token, expiresAt, customer }
     signUp({ name, email, phone, password, locale, supervisorId }) → same
     signOut(token)
     verify(token)                        → { customerId, expiresAt, customer } | null
     requestReset(email)                  → { ok, devLink? }
     resetPassword({ token, password })   → { ok }
     changePassword(token, { current, next }) → { ok }

   The session the header reads (components/session.js) is DERIVED from the
   provider's answer on every page load — never from a role stored on the
   client. What the client keeps is one opaque token in localStorage; the
   provider decides what it is worth. A production provider replaces the
   development one in adapters/installed.js; no screen changes.
   ========================================================================= */

import { setSession, getSession } from '../components/session.js';
import { route, BASE } from '../data/config.js';
import { ENV } from '../data/env.js';
import { track } from '../core/diagnostics.js';

export class AuthError extends Error {
  constructor(code, message = code) { super(message); this.name = 'AuthError'; this.code = code; }
}

const providers = new Map();
export function registerAuthProvider(p) { providers.set(p.id, p); return p; }
export function authProvider() { return [...providers.values()][0] ?? null; }

const KEY = 'no.session';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } };
const write = (s) => { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ } };

/** The opaque token the data adapters present; null when signed out. */
export const currentToken = () => read()?.token ?? null;

const guest = () => setSession({ authenticated: false, name: '', role: 'guest', customerId: null });
/** The session is gone (a 401 from any call, or an expiry): drop the marker, tell the header. */
export function sessionLost(reason = 'expired') {
  if (read()) track('session.expired', { reason });
  write(null); guest(); restored = Promise.resolve({ status: 'expired', customer: null });
}

let restored = null;
/**
 * Re-establish the customer session, once per page. What the client holds is a
 * marker, not an authority: the provider is asked every time. With the
 * session-api provider that is the backend reading its own HttpOnly cookie.
 * Resolves { status: 'guest' | 'customer' | 'expired' | 'unavailable', customer, code }.
 */
export function restoreSession({ force = false } = {}) {
  if (restored && !force) return restored;
  restored = (async () => {
    const stored = read(); const provider = authProvider();
    if (!stored?.token || !provider) { guest(); return { status: 'guest', customer: null }; }
    if (stored.expiresAt && Date.parse(stored.expiresAt) < Date.now()) { sessionLost('expired'); return { status: 'expired', customer: null }; }
    let v = null;
    try { v = await provider.verify(stored.token); } catch (error) {
      // Unreachable is not the same as signed out: keep the marker, report the outage.
      const code = error?.code ?? 'unavailable';
      if (code === 'unauthenticated') { sessionLost('rejected'); return { status: 'expired', customer: null }; }
      guest(); track('auth.unavailable', { code }); return { status: 'unavailable', customer: null, code };
    }
    if (!v) { sessionLost('rejected'); return { status: 'expired', customer: null }; }
    // Refresh a session that is about to lapse, when the provider supports it.
    const refreshMs = (ENV.authPublicConfig?.sessionRefreshMinutes ?? 10) * 60 * 1000;
    if (provider.refresh && v.expiresAt && Date.parse(v.expiresAt) - Date.now() < refreshMs) {
      try { const r = await provider.refresh(stored.token); if (r) { v = { ...v, ...r }; write({ ...stored, expiresAt: r.expiresAt ?? stored.expiresAt }); } } catch { /* the current session still stands */ }
    }
    setSession({ authenticated: true, name: v.customer.name, role: 'customer', customerId: v.customerId });
    return { status: 'customer', customer: v.customer };
  })();
  return restored;
}

/** Adopt a session the provider issued (sign in, sign up, the development shortcut). */
export const adoptSession = ({ token, expiresAt, customer }) => {
  write({ token, expiresAt, provider: authProvider()?.id });
  setSession({ authenticated: true, name: customer.name, role: 'customer', customerId: customer.id });
  restored = Promise.resolve({ status: 'customer', customer });
  return customer;
};

export async function signIn(credentials) {
  try { return adoptSession(await authProvider().signIn(credentials)); }
  catch (error) { track('auth.failure', { code: error?.code ?? 'error', flow: 'signIn' }); throw error; }
}
export async function signUp(details) {
  try { return adoptSession(await authProvider().signUp(details)); }
  catch (error) { track('auth.failure', { code: error?.code ?? 'error', flow: 'signUp' }); throw error; }
}
export async function signOut() {
  const token = currentToken();
  try { if (token) await authProvider()?.signOut(token); } catch { /* the marker is dropped regardless; the server session lapses on its own */ }
  write(null); guest();
  restored = Promise.resolve({ status: 'guest', customer: null });
}
export const requestReset = (email) => authProvider().requestReset(email);
export const resetPassword = (args) => authProvider().resetPassword(args);
export const changePassword = (args) => authProvider().changePassword(currentToken(), args);
export const isAuthenticated = () => getSession().authenticated;

/* ---- Booking continuity: where to go back to after signing in --------------
   `next` is accepted only as a path inside this site: no scheme, no host, no
   protocol-relative form, no traversal. Anything else falls back to the
   account home. */
export function safeNext(value) {
  if (!value || typeof value !== 'string') return null;
  if (/^[a-z]+:|^\/\/|\\|\.\./i.test(value)) return null;
  let path = value.startsWith('/') ? value : route(value);
  if (!path.startsWith(BASE)) return null;
  if (!/^[\w\-./?=&%+:]*$/.test(path)) return null;
  return path;
}
export const nextFrom = (params = new URLSearchParams(location.search)) => safeNext(params.get('next'));
/** The sign-in URL that returns to `next` (a route or full path) afterwards. */
export const signInHref = (next = null) => route('account/sign-in/') + (next ? `?next=${encodeURIComponent(next.startsWith('/') ? next : route(next))}` : '');
export const signUpHref = (next = null) => route('account/sign-up/') + (next ? `?next=${encodeURIComponent(next.startsWith('/') ? next : route(next))}` : '');
