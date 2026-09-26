/* ============================================================================
   CORE / PORTAL SESSION — the one session machinery behind all three portals:
   the customer account (account/auth.js), the supervisor portal
   (supervisor/auth.js) and the operations portal (ops/auth.js).

   Each portal calls createPortalSession() once with its OWN storage key,
   provider registry and entity name, so the three sessions stay completely
   separate: a different localStorage marker, a different provider, and on
   the backend a different session cookie. Nothing is shared between them
   except this code.

   What the client keeps is one opaque marker ({ token, expiresAt, provider });
   the provider is asked on every page load (restore), never a role stored on
   the client.

   Provider contract (every method async; errors carry a `code`):
     signIn(credentials)                  → { token, expiresAt, [entity] }
     signOut(token)
     verify(token)                        → { [entity]Id, expiresAt, [entity] } | null
     refresh(token)                       → same shape, when the provider supports it
     requestReset(email) / resetPassword({ token, password }) / changePassword(token, { current, next })
   ========================================================================= */
import { ENV } from '../data/env.js';
import { track } from './diagnostics.js';
import { get, post } from './api.js';

/** An auth error class named for its portal (`error.name`, `instanceof`), with a customer-safe `code`. */
export const defineAuthError = (name) => ({
  [name]: class extends Error { constructor(code, message = code) { super(message); this.name = name; this.code = code; } },
})[name];

/**
 * @param {object} o
 * @param {string}   o.storageKey  localStorage key of the session marker ('no.session', 'no.ops.session', …)
 * @param {string}   o.entity      'customer' | 'supervisor' | 'staff' — the signed-in status and the result's key
 * @param {string}   o.trackPrefix diagnostics event prefix ('' for the customer, 'ops.', 'supervisor.')
 * @param {function} [o.onGuest]   called whenever the session becomes guest/expired/unavailable (the header)
 * @param {function} [o.onEntity]  (entity, id) called whenever a session is established (the header)
 */
export function createPortalSession({ storageKey, entity, trackPrefix = '', onGuest = () => {}, onEntity = () => {} }) {
  const providers = new Map();
  const register = (p) => { providers.set(p.id, p); return p; };
  const provider = () => [...providers.values()][0] ?? null;

  const read = () => { try { return JSON.parse(localStorage.getItem(storageKey) ?? 'null'); } catch { return null; } };
  const write = (s) => { try { if (s) localStorage.setItem(storageKey, JSON.stringify(s)); else localStorage.removeItem(storageKey); } catch { /* storage unavailable */ } };
  const token = () => read()?.token ?? null;
  const answer = (status, value = null, extra = {}) => ({ status, [entity]: value, ...extra });

  let restored = null;
  /** The session is gone (a 401 from any call, or an expiry): drop the marker. */
  function lost(reason = 'expired') {
    if (read()) track(`${trackPrefix}session.expired`, { reason });
    write(null); onGuest(); restored = Promise.resolve(answer('expired'));
  }

  /** Resolves { status: 'guest' | entity | 'expired' | 'unavailable', [entity], code }, once per page unless forced. */
  function restore({ force = false } = {}) {
    if (restored && !force) return restored;
    restored = (async () => {
      const stored = read(); const p = provider();
      if (!stored?.token || !p) { onGuest(); return answer('guest'); }
      if (stored.expiresAt && Date.parse(stored.expiresAt) < Date.now()) { lost('expired'); return answer('expired'); }
      let v = null;
      try { v = await p.verify(stored.token); } catch (error) {
        // Unreachable is not the same as signed out: keep the marker, report the outage.
        const code = error?.code ?? 'unavailable';
        if (code === 'unauthenticated') { lost('rejected'); return answer('expired'); }
        onGuest(); track(`${trackPrefix}auth.unavailable`, { code }); return answer('unavailable', null, { code });
      }
      if (!v) { lost('rejected'); return answer('expired'); }
      // Refresh a session that is about to lapse, when the provider supports it.
      const refreshMs = (ENV.authPublicConfig?.sessionRefreshMinutes ?? 10) * 60 * 1000;
      if (p.refresh && v.expiresAt && Date.parse(v.expiresAt) - Date.now() < refreshMs) {
        try { const r = await p.refresh(stored.token); if (r) { v = { ...v, ...r }; write({ ...stored, expiresAt: r.expiresAt ?? stored.expiresAt }); } } catch { /* the current session still stands */ }
      }
      onEntity(v[entity], v[`${entity}Id`]);
      return answer(entity, v[entity]);
    })();
    return restored;
  }

  /** Adopt a session the provider issued (sign in, sign up, the development shortcut). */
  function adopt(issued) {
    const value = issued[entity];
    write({ token: issued.token, expiresAt: issued.expiresAt, provider: provider()?.id });
    onEntity(value, value.id);
    restored = Promise.resolve(answer(entity, value));
    return value;
  }

  /** Run a provider call that issues a session (`signIn`, `signUp`) and adopt it; failures are tracked. */
  async function attempt(method, args, detail = {}) {
    try { return adopt(await provider()[method](args)); }
    catch (error) { track(`${trackPrefix}auth.failure`, { code: error?.code ?? 'error', ...detail }); throw error; }
  }

  async function signOut() {
    const current = token();
    try { if (current) await provider()?.signOut(current); } catch { /* the marker is dropped regardless; the server session lapses on its own */ }
    write(null); onGuest();
    restored = Promise.resolve(answer('guest'));
  }

  return {
    register, provider, token, lost, restore, adopt, attempt, signOut,
    requestReset: (email) => provider().requestReset(email),
    resetPassword: (args) => provider().resetPassword(args),
    changePassword: (args) => provider().changePassword(token(), args),
  };
}

/* ---- Adapter helpers the staff portals share ------------------------------ */
const AUTH_METHODS = ['signIn', 'verify', 'refresh', 'requestReset', 'resetPassword', 'changePassword'];

/** The auth provider a production build registers when no backend is configured: every call is 'notConfigured'. */
export function notConnectedAuth(ErrorClass, methods = AUTH_METHODS) {
  const fail = async () => { throw new ErrorClass('notConfigured'); };
  return { id: 'not-connected', dev: false, signOut: async () => {}, ...Object.fromEntries(methods.map((m) => [m, fail])) };
}

/**
 * The production identity adapter for a staff portal: `${base}/sign-in`, `/session`, `/refresh`, … The backend sets
 * an HttpOnly session cookie on sign-in and reads it on every call; the browser keeps only a marker so restore()
 * knows to ask.
 */
export function apiAuthProvider({ id, base, entity, ErrorClass }) {
  const MARKER = 'cookie';
  const toAuthError = (error) => {
    const code = error?.code ?? 'unavailable';
    const map = { unauthenticated: 'invalid', invalid: 'invalid', invalidToken: 'invalidToken', expired: 'invalidToken', notFound: 'invalidToken', rateLimited: 'rateLimited', timeout: 'unavailable', network: 'unavailable', notConfigured: 'notConfigured' };
    return new ErrorClass(map[code] ?? 'unavailable', error?.message);
  };
  const guarded = (fn) => async (...args) => { try { return await fn(...args); } catch (e) { throw toAuthError(e); } };
  const verified = (data) => (data?.[entity] ? { [`${entity}Id`]: data[entity].id, expiresAt: data.expiresAt ?? null, [entity]: { ...data[entity] } } : null);
  return {
    id, dev: false,
    signIn: guarded(async ({ email, password }) => { const data = await post(`${base}/sign-in`, { email, password }); return { token: MARKER, expiresAt: data.expiresAt ?? null, [entity]: { ...data[entity] } }; }),
    async signOut() { try { await post(`${base}/sign-out`, {}); } catch { /* the cookie lapses server-side regardless */ } },
    async verify() {
      try { return verified(await get(`${base}/session`)); }
      catch (e) { if (e?.code === 'unauthenticated') return null; throw e; }
    },
    async refresh() { return verified(await post(`${base}/refresh`, {})); },
    requestReset: guarded(async (email) => { await post(`${base}/password/reset-request`, { email }); return { ok: true }; }),
    resetPassword: guarded(async ({ token, password }) => { await post(`${base}/password/reset`, { token, password }); return { ok: true }; }),
    changePassword: guarded(async (_marker, { current, next }) => { await post(`${base}/password/change`, { current, next }); return { ok: true }; }),
    public: ENV.authPublicConfig,
  };
}
