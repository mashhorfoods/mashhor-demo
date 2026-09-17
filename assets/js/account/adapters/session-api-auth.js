/* ============================================================================
   ACCOUNT / ADAPTERS / SESSION-API AUTH — the production identity adapter.

   Talks to the backend's session endpoints (docs/INTEGRATION.md §Contract).
   The backend fronts the hosted identity provider and owns the session: it
   sets an HttpOnly cookie on sign-in / sign-up, reads it on every call, and
   ends it on sign-out. The browser keeps only a marker ({ token: 'cookie' })
   so restoreSession() knows to ask; the marker grants nothing.

   Status: IMPLEMENTED against the contract, NOT CONNECTED until a backend
   exists at API_BASE_URL (see installed.js).
   ========================================================================= */

import { registerAuthProvider, AuthError } from '../auth.js';
import { get, post, patch } from '../../core/api.js';
import { ENV } from '../../data/env.js';

const MARKER = 'cookie';
const toAuthError = (error) => {
  const code = error?.code ?? 'unavailable';
  // Sign-in never learns whether the address exists: the backend answers 401 'invalid' for both.
  const map = { unauthenticated: 'invalid', invalid: 'invalid', conflict: 'exists', exists: 'exists', weak: 'weak', invalidToken: 'invalidToken', expired: 'invalidToken', notFound: 'invalidToken', rateLimited: 'rateLimited', timeout: 'unavailable', network: 'unavailable', notConfigured: 'notConfigured' };
  return new AuthError(map[code] ?? 'unavailable', error?.message);
};
const customerOf = (data) => ({ id: data.customer.id, name: data.customer.name ?? '', email: data.customer.email ?? '', phone: data.customer.phone ?? '', locale: data.customer.locale ?? 'ar', image: data.customer.image ?? null, supervisorId: data.customer.supervisorId ?? data.customer.attribution?.supervisorId ?? null, attribution: data.customer.attribution ?? null, acceptance: data.customer.acceptance ?? null, createdAt: data.customer.createdAt ?? null });
const session = (data) => ({ token: MARKER, expiresAt: data.expiresAt ?? null, customer: customerOf(data) });

export const SESSION_API_AUTH = registerAuthProvider({
  id: 'session-api', dev: false, provider: 'backend session endpoints', configSource: 'API_BASE_URL, AUTH_PUBLIC_CONFIG',
  labelAr: 'حساب نمبرون', labelEn: 'Number One account',
  async signIn({ email, password }) { try { return session(await post('/auth/sign-in', { email, password })); } catch (e) { throw toAuthError(e); } },
  async signUp({ name, email, phone = '', password, locale = 'ar', supervisorId = null, acceptance = null }) {
    try { return session(await post('/auth/sign-up', { name, email, phone, password, locale, attribution: supervisorId ? { supervisorId, source: 'link' } : null, acceptance })); } catch (e) { throw toAuthError(e); }
  },
  async signOut() { try { await post('/auth/sign-out', {}); } catch { /* the cookie lapses server-side regardless */ } },
  async verify() {
    try { const data = await get('/auth/session'); return data?.customer ? { customerId: data.customer.id, expiresAt: data.expiresAt ?? null, customer: customerOf(data) } : null; }
    catch (e) { if (e?.code === 'unauthenticated') return null; throw e; }
  },
  async refresh() { const data = await post('/auth/refresh', {}); return data?.customer ? { customerId: data.customer.id, expiresAt: data.expiresAt ?? null, customer: customerOf(data) } : null; },
  async requestReset(email) { try { await post('/auth/password/reset-request', { email }); return { ok: true }; } catch (e) { throw toAuthError(e); } },
  async resetPassword({ token, password }) { try { await post('/auth/password/reset', { token, password }); return { ok: true }; } catch (e) { throw toAuthError(e); } },
  async changePassword(_marker, { current, next }) { try { await post('/auth/password/change', { current, next }); return { ok: true }; } catch (e) { throw toAuthError(e); } },
  async updateAccount(_marker, changes) { const data = await patch('/me', changes); return customerOf({ customer: data.customer ?? data }); },
  public: ENV.authPublicConfig,
});
