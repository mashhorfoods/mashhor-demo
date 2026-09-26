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
import { createPortalSession, defineAuthError } from '../core/portal-session.js';

export const AuthError = defineAuthError('AuthError');

// The header's session is derived from the provider's answer: guest on every lost/unavailable session.
const session = createPortalSession({
  storageKey: 'no.session', entity: 'customer',
  onGuest: () => setSession({ authenticated: false, name: '', role: 'guest', customerId: null }),
  onEntity: (customer, customerId) => setSession({ authenticated: true, name: customer.name, role: 'customer', customerId }),
});
export const registerAuthProvider = session.register;
export const authProvider = session.provider;
/** The opaque token the data adapters present; null when signed out. */
export const currentToken = session.token;
/** The session is gone (a 401 from any call, or an expiry): drop the marker, tell the header. */
export const sessionLost = session.lost;
/**
 * Re-establish the customer session, once per page. What the client holds is a
 * marker, not an authority: the provider is asked every time. With the
 * session-api provider that is the backend reading its own HttpOnly cookie.
 * Resolves { status: 'guest' | 'customer' | 'expired' | 'unavailable', customer, code }.
 */
export const restoreSession = session.restore;
/** Adopt a session the provider issued (sign in, sign up, the development shortcut). */
export const adoptSession = session.adopt;
export const signIn = (credentials) => session.attempt('signIn', credentials, { flow: 'signIn' });
export const signUp = (details) => session.attempt('signUp', details, { flow: 'signUp' });
export const signOut = session.signOut;
export const requestReset = session.requestReset;
export const resetPassword = session.resetPassword;
export const changePassword = session.changePassword;
export const isAuthenticated = () => getSession().authenticated;

/* ---- Booking continuity: where to go back to after signing in --------------
   `next` is accepted only as a path inside this site: no scheme, no host, no
   protocol-relative form, no traversal. Anything else falls back to the
   account home. `area` (e.g. 'admin/', 'supervisor/') further limits it to
   one portal; both a route ('admin/tasks/') and a full path
   ('/mashhor-demo/admin/tasks/?x=1', what the portals' `here()` passes) are
   accepted. */
export function safeNext(value, area = '') {
  if (!value || typeof value !== 'string') return null;
  if (/^[a-z]+:|^\/\/|\\|\.\./i.test(value)) return null;
  let path = value.startsWith('/') ? value : route(value);
  if (!path.startsWith(BASE + area)) return null;
  if (!/^[\w\-./?=&%+:]*$/.test(path)) return null;
  return path;
}
export const nextFrom = (params = new URLSearchParams(location.search)) => safeNext(params.get('next'));
/** The sign-in URL that returns to `next` (a route or full path) afterwards. */
export const signInHref = (next = null) => route('account/sign-in/') + (next ? `?next=${encodeURIComponent(next.startsWith('/') ? next : route(next))}` : '');
export const signUpHref = (next = null) => route('account/sign-up/') + (next ? `?next=${encodeURIComponent(next.startsWith('/') ? next : route(next))}` : '');
