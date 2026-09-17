/* ============================================================================
   SUPERVISOR / ADAPTERS / INSTALLED — what this build registers for the
   supervisor portal, decided by the SAME public runtime configuration as the
   customer account (data/env.js): the portal is a different area of the same
   backend, not a separate service to configure. Stage 13

   Registry (also exported as SUPERVISOR_INSTALLED for the docs page and tests):
     name                  environment   status                    capabilities
     api-supervisor-auth   staging/prod  implemented, NOT CONNECTED sign-in, session, refresh, reset, change password
     api-supervisor-data   staging/prod  implemented, NOT CONNECTED profile, customers, bookings, leads, revenue,
                                                                     performance, commissions, notifications
     dev-supervisor-*      development   development only           everything above, this browser only, one demo account
     not-connected         production    fails safely                none

   CONNECTED is reported only from ENV.verified (see account/adapters/installed.js and tools/deploy.mjs) — code
   existing here never counts as connected on its own.
   ========================================================================= */
import { ENV, isProduction } from '../../data/env.js';

const wantsApi = ENV.authProvider === 'session-api' && !!ENV.apiBaseUrl;
export const SUPERVISOR_INSTALLED = [];
const verified = (name) => !!ENV.verified && ENV.verified.backend === ENV.apiBaseUrl && ENV.verified.adapters?.includes(name);
const status = (name, pending) => (verified(name) ? `CONNECTED — verified ${ENV.verified.at} against ${ENV.verified.backend}` : pending);

if (wantsApi) {
  await import('./api-supervisor-auth.js');
  await import('./api-supervisor-data.js');
  SUPERVISOR_INSTALLED.push(
    { name: 'api-supervisor-auth', provider: 'backend supervisor session endpoints', environment: ENV.environment, status: status('api-supervisor-auth', 'implemented — NOT CONNECTED (no verified deployment at API_BASE_URL yet)'), configSource: 'API_BASE_URL, AUTH_PUBLIC_CONFIG', capabilities: ['signIn', 'session', 'refresh', 'resetRequest', 'reset', 'changePassword'] },
    { name: 'api-supervisor-data', provider: 'customer backend API', environment: ENV.environment, status: status('api-supervisor-data', 'implemented — NOT CONNECTED (no verified deployment at API_BASE_URL yet)'), configSource: 'API_BASE_URL', capabilities: ['profile', 'customers', 'bookings', 'leads', 'leads.update', 'revenue', 'performance', 'commissions', 'notifications'] },
  );
} else if (!isProduction()) {
  await import('./dev-supervisor-auth.js');
  await import('./dev-supervisor-data.js');
  SUPERVISOR_INSTALLED.push(
    { name: 'dev-supervisor-auth', provider: 'in-browser development stand-in', environment: ENV.environment, status: 'development only', configSource: 'none', capabilities: ['signIn', 'devSignIn', 'session', 'resetRequest', 'reset', 'changePassword'] },
    { name: 'dev-supervisor-data', provider: 'in-browser development stand-in', environment: ENV.environment, status: 'development only', configSource: 'none', capabilities: ['profile', 'customers', 'bookings', 'leads', 'leads.update', 'revenue', 'performance', 'commissions', 'notifications'] },
  );
} else {
  await import('./not-connected.js');
  SUPERVISOR_INSTALLED.push({ name: 'not-connected', provider: 'none', environment: ENV.environment, status: 'production without a backend: every call fails safely', configSource: 'AUTH_PROVIDER, API_BASE_URL', capabilities: [] });
}
if (typeof window !== 'undefined') window.no = { ...(window.no ?? {}), supervisorInstalled: SUPERVISOR_INSTALLED };
