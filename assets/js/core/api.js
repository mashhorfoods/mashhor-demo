/* ============================================================================
   API CLIENT — how the browser talks to the customer backend. Stage 12.1

   One function, one contract:
     request(path, { method, body, form, signal, timeoutMs })
   - credentials: 'include' — the session is an HttpOnly cookie the backend
     sets; the browser never sees or stores a credential.
   - CSRF: the backend's double-submit cookie is echoed in X-CSRF-Token on
     every non-GET request. Each session has its own cookie — `no_csrf`
     (customer), `no_supervisor_csrf`, `no_ops_csrf` (staff) — and the one
     echoed is the one for the route's session (csrfFamily, the same mapping
     as backend/http.mjs sessionFamily).
   - Errors are ApiError with a customer-safe `code`; response bodies, stack
     traces and internals never reach a screen. The backend may supply its
     own code in { error: { code } } (e.g. 'exists', 'invalid', 'weak').
   - A timeout aborts the request; a lost network is 'network'.

   Codes: unauthenticated (401) · forbidden (403) · notFound (404) · conflict (409)
   · tooLarge (413) · unsupported (415) · invalid (422) · rateLimited (429)
   · unavailable (5xx) · timeout · network · notConfigured
   ========================================================================= */

import { ENV } from '../data/env.js';
import { track } from './diagnostics.js';

export class ApiError extends Error {
  constructor(code, { status = 0, retryAfter = null, message = code } = {}) { super(message); this.name = 'ApiError'; this.code = code; this.status = status; this.retryAfter = retryAfter; }
}
const CODES = { 400: 'invalid', 401: 'unauthenticated', 403: 'forbidden', 404: 'notFound', 409: 'conflict', 410: 'expired', 413: 'tooLarge', 415: 'unsupported', 422: 'invalid', 429: 'rateLimited' };
const SAFE_BODY_CODES = new Set(['invalid', 'exists', 'weak', 'invalidToken', 'notFound', 'expired', 'unsupported', 'tooLarge', 'conflict']);

export const apiBase = () => ENV.apiBaseUrl || null;
const CSRF_COOKIE = { customer: 'no_csrf', supervisor: 'no_supervisor_csrf', staff: 'no_ops_csrf' };
const STAFF_ROUTE = /^\/(staff|services|operations|bookings|documents|notifications|admin)(\/|$)/;
export const csrfFamily = (path) => (path.startsWith('/supervisor/') ? 'supervisor' : STAFF_ROUTE.test(path) ? 'staff' : 'customer');
const cookie = (name) => (typeof document === 'undefined' ? null : (document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? null));
export const csrfToken = (path = '/') => cookie(CSRF_COOKIE[csrfFamily(path.split('?')[0])]);

export async function request(path, { method = 'GET', body = null, form = null, signal = null, timeoutMs = 12000, headers = {} } = {}) {
  const base = apiBase();
  if (!base) throw new ApiError('notConfigured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  signal?.addEventListener('abort', () => controller.abort('aborted'), { once: true });
  const h = { Accept: 'application/json', ...headers };
  if (body != null) h['Content-Type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD') { const csrf = csrfToken(path); if (csrf) h['X-CSRF-Token'] = csrf; }
  let res;
  try {
    res = await fetch(`${base}${path}`, { method, headers: h, body: form ?? (body != null ? JSON.stringify(body) : null), credentials: 'include', signal: controller.signal, cache: 'no-store' });
  } catch (error) {
    clearTimeout(timer);
    const code = controller.signal.aborted && controller.signal.reason === 'timeout' ? 'timeout' : controller.signal.aborted ? 'aborted' : 'network';
    if (code !== 'aborted') track('api.failure', { code, path: path.replace(/[A-Za-z0-9_-]{12,}/g, ':id'), method });
    throw new ApiError(code);
  }
  clearTimeout(timer);
  if (res.ok) { if (res.status === 204) return null; const ct = res.headers.get('content-type') ?? ''; return ct.includes('json') ? res.json() : null; }
  let code = CODES[res.status] ?? (res.status >= 500 ? 'unavailable' : 'failed');
  try { const data = await res.json(); const c = data?.error?.code; if (typeof c === 'string' && SAFE_BODY_CODES.has(c)) code = c; } catch { /* no body */ }
  const retryAfter = Number(res.headers.get('retry-after')) || null;
  if (res.status !== 401 && res.status !== 404) track('api.failure', { code, status: res.status, path: path.replace(/[A-Za-z0-9_-]{12,}/g, ':id'), method });
  throw new ApiError(code, { status: res.status, retryAfter });
}
export const get = (path, opts) => request(path, { ...opts, method: 'GET' });
export const post = (path, body, opts) => request(path, { ...opts, method: 'POST', body });
export const patch = (path, body, opts) => request(path, { ...opts, method: 'PATCH', body });
export const del = (path, opts) => request(path, { ...opts, method: 'DELETE' });
export const upload = (path, form, opts) => request(path, { ...opts, method: 'POST', form, timeoutMs: 60000 });
