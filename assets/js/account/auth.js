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

let restored = null;
/**
 * Re-establish the customer session from the stored token, once per page.
 * Resolves { status: 'guest' | 'customer' | 'expired', customer }.
 */
export function restoreSession({ force = false } = {}) {
  if (restored && !force) return restored;
  restored = (async () => {
    const stored = read(); const provider = authProvider();
    if (!stored?.token || !provider) { setSession({ authenticated: false, name: '', role: 'guest', customerId: null }); return { status: 'guest', customer: null }; }
    if (stored.expiresAt && Date.parse(stored.expiresAt) < Date.now()) { write(null); setSession({ authenticated: false, name: '', role: 'guest', customerId: null }); return { status: 'expired', customer: null }; }
    let v = null;
    try { v = await provider.verify(stored.token); } catch { v = null; }
    if (!v) { write(null); setSession({ authenticated: false, name: '', role: 'guest', customerId: null }); return { status: 'expired', customer: null }; }
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

export async function signIn(credentials) { return adoptSession(await authProvider().signIn(credentials)); }
export async function signUp(details) { return adoptSession(await authProvider().signUp(details)); }
export async function signOut() {
  const token = currentToken();
  try { if (token) await authProvider()?.signOut(token); } catch { /* the token is dropped regardless */ }
  write(null);
  setSession({ authenticated: false, name: '', role: 'guest', customerId: null });
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
