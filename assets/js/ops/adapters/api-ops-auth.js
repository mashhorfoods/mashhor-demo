/* ============================================================================
   OPS / ADAPTERS / API AUTH — the production identity adapter for the
   operations portal. Talks to the backend's /staff/auth/* endpoints
   (docs/STAGE-15-OPERATIONS-CONTROL.md). The backend sets an HttpOnly session
   cookie (no_ops_session, distinct from the customer's and the supervisor's)
   on sign-in and reads it on every call.

   Status: IMPLEMENTED against the contract, NOT CONNECTED until a backend
   exists at API_BASE_URL (see adapters/installed.js).
   ========================================================================= */
import { registerOpsAuthProvider, OpsAuthError } from '../auth.js';
import { get, post } from '../../core/api.js';
import { ENV } from '../../data/env.js';

const MARKER = 'cookie';
const toAuthError = (error) => {
  const code = error?.code ?? 'unavailable';
  const map = { unauthenticated: 'invalid', invalid: 'invalid', invalidToken: 'invalidToken', expired: 'invalidToken', notFound: 'invalidToken', rateLimited: 'rateLimited', timeout: 'unavailable', network: 'unavailable', notConfigured: 'notConfigured' };
  return new OpsAuthError(map[code] ?? 'unavailable', error?.message);
};
const staffOf = (data) => ({ ...data.staff });
const session = (data) => ({ token: MARKER, expiresAt: data.expiresAt ?? null, staff: staffOf(data) });

export const API_OPS_AUTH = registerOpsAuthProvider({
  id: 'api-ops-auth', dev: false,
  async signIn({ email, password }) { try { return session(await post('/staff/auth/sign-in', { email, password })); } catch (e) { throw toAuthError(e); } },
  async signOut() { try { await post('/staff/auth/sign-out', {}); } catch { /* the cookie lapses server-side regardless */ } },
  async verify() {
    try { const data = await get('/staff/auth/session'); return data?.staff ? { staffId: data.staff.id, expiresAt: data.expiresAt ?? null, staff: staffOf(data) } : null; }
    catch (e) { if (e?.code === 'unauthenticated') return null; throw e; }
  },
  async refresh() { const data = await post('/staff/auth/refresh', {}); return data?.staff ? { staffId: data.staff.id, expiresAt: data.expiresAt ?? null, staff: staffOf(data) } : null; },
  async requestReset(email) { try { await post('/staff/auth/password/reset-request', { email }); return { ok: true }; } catch (e) { throw toAuthError(e); } },
  async resetPassword({ token, password }) { try { await post('/staff/auth/password/reset', { token, password }); return { ok: true }; } catch (e) { throw toAuthError(e); } },
  async changePassword(_marker, { current, next }) { try { await post('/staff/auth/password/change', { current, next }); return { ok: true }; } catch (e) { throw toAuthError(e); } },
  public: ENV.authPublicConfig,
});
