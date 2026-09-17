/* ============================================================================
   OPS / ADAPTERS / INSTALLED — what this build registers for the operations
   portal, decided by the SAME public runtime configuration as the customer
   account and the supervisor portal (data/env.js): all three areas are the
   same backend, not separate services to configure. Stage 15

   CONNECTED is reported only from ENV.verified (see account/adapters/
   installed.js and tools/deploy.mjs) — code existing here never counts as
   connected on its own.
   ========================================================================= */
import { ENV, isProduction } from '../../data/env.js';

const wantsApi = ENV.authProvider === 'session-api' && !!ENV.apiBaseUrl;
export const OPS_INSTALLED = [];
const verified = (name) => !!ENV.verified && ENV.verified.backend === ENV.apiBaseUrl && ENV.verified.adapters?.includes(name);
const status = (name, pending) => (verified(name) ? `CONNECTED — verified ${ENV.verified.at} against ${ENV.verified.backend}` : pending);

if (wantsApi) {
  await import('./api-ops-auth.js');
  await import('./api-ops-data.js');
  OPS_INSTALLED.push(
    { name: 'api-ops-auth', provider: 'backend staff session endpoints', environment: ENV.environment, status: status('api-ops-auth', 'implemented — NOT CONNECTED (no verified deployment at API_BASE_URL yet)'), configSource: 'API_BASE_URL, AUTH_PUBLIC_CONFIG', capabilities: ['signIn', 'session', 'refresh', 'resetRequest', 'reset', 'changePassword'] },
    { name: 'api-ops-data', provider: 'customer backend API', environment: ENV.environment, status: status('api-ops-data', 'implemented — NOT CONNECTED (no verified deployment at API_BASE_URL yet)'), configSource: 'API_BASE_URL', capabilities: ['bookings.operations', 'tasks', 'escalations', 'documents.review', 'services', 'workflow', 'suppliers', 'notifications.templates', 'notifications.history', 'audit'] },
  );
} else if (!isProduction()) {
  await import('./dev-ops-auth.js');
  await import('./dev-ops-data.js');
  OPS_INSTALLED.push(
    { name: 'dev-ops-auth', provider: 'in-browser development stand-in', environment: ENV.environment, status: 'development only', configSource: 'none', capabilities: ['signIn', 'devSignIn', 'session', 'resetRequest', 'reset', 'changePassword'] },
    { name: 'dev-ops-data', provider: 'in-browser development stand-in', environment: ENV.environment, status: 'development only', configSource: 'none', capabilities: ['bookings.operations', 'tasks', 'escalations', 'documents.review', 'services', 'workflow', 'suppliers', 'notifications.templates', 'notifications.history', 'audit'] },
  );
} else {
  await import('./not-connected.js');
  OPS_INSTALLED.push({ name: 'not-connected', provider: 'none', environment: ENV.environment, status: 'production without a backend: every call fails safely', configSource: 'AUTH_PROVIDER, API_BASE_URL', capabilities: [] });
}
if (typeof window !== 'undefined') window.no = { ...(window.no ?? {}), opsInstalled: OPS_INSTALLED };
