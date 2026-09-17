/* ============================================================================
   SUPERVISOR / ADAPTERS / API AUTH — the production identity adapter for the
   supervisor portal. Talks to the backend's /supervisor/auth/* endpoints
   (docs/SUPERVISOR-SYSTEM.md, docs/INTEGRATION.md). The backend sets an
   HttpOnly session cookie (no_supervisor_session, distinct from the
   customer's no_session) on sign-in and reads it on every call; the browser
   keeps only a marker so restoreSupervisorSession() knows to ask.

   Status: IMPLEMENTED against the contract, NOT CONNECTED until a backend
   exists at API_BASE_URL (see adapters/installed.js).
   ========================================================================= */
import { registerSupervisorAuthProvider, SupervisorAuthError } from '../auth.js';
import { get, post } from '../../core/api.js';
import { ENV } from '../../data/env.js';

const MARKER = 'cookie';
const toAuthError = (error) => {
  const code = error?.code ?? 'unavailable';
  const map = { unauthenticated: 'invalid', invalid: 'invalid', invalidToken: 'invalidToken', expired: 'invalidToken', notFound: 'invalidToken', rateLimited: 'rateLimited', timeout: 'unavailable', network: 'unavailable', notConfigured: 'notConfigured' };
  return new SupervisorAuthError(map[code] ?? 'unavailable', error?.message);
};
const supervisorOf = (data) => ({ ...data.supervisor });
const session = (data) => ({ token: MARKER, expiresAt: data.expiresAt ?? null, supervisor: supervisorOf(data) });

export const API_SUPERVISOR_AUTH = registerSupervisorAuthProvider({
  id: 'api-supervisor-auth', dev: false, provider: 'backend supervisor session endpoints', configSource: 'API_BASE_URL, AUTH_PUBLIC_CONFIG',
  async signIn({ email, password }) { try { return session(await post('/supervisor/auth/sign-in', { email, password })); } catch (e) { throw toAuthError(e); } },
  async signOut() { try { await post('/supervisor/auth/sign-out', {}); } catch { /* the cookie lapses server-side regardless */ } },
  async verify() {
    try { const data = await get('/supervisor/auth/session'); return data?.supervisor ? { supervisorId: data.supervisor.id, expiresAt: data.expiresAt ?? null, supervisor: supervisorOf(data) } : null; }
    catch (e) { if (e?.code === 'unauthenticated') return null; throw e; }
  },
  async refresh() { const data = await post('/supervisor/auth/refresh', {}); return data?.supervisor ? { supervisorId: data.supervisor.id, expiresAt: data.expiresAt ?? null, supervisor: supervisorOf(data) } : null; },
  async requestReset(email) { try { await post('/supervisor/auth/password/reset-request', { email }); return { ok: true }; } catch (e) { throw toAuthError(e); } },
  async resetPassword({ token, password }) { try { await post('/supervisor/auth/password/reset', { token, password }); return { ok: true }; } catch (e) { throw toAuthError(e); } },
  async changePassword(_marker, { current, next }) { try { await post('/supervisor/auth/password/change', { current, next }); return { ok: true }; } catch (e) { throw toAuthError(e); } },
  public: ENV.authPublicConfig,
});
