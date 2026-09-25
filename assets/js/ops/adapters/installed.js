/* ============================================================================
   OPS / ADAPTERS / INSTALLED — what this build registers for the operations
   portal, decided by the SAME public runtime configuration as the customer
   account and the supervisor portal (data/env.js): all three areas are the
   same backend, not separate services to configure. Stage 15

   Whether the backend is actually CONNECTED is reported once, by the account
   registry (account/adapters/installed.js, from ENV.verified) — code existing
   here never counts as connected on its own.
   ========================================================================= */
import { ENV, isProduction } from '../../data/env.js';

const wantsApi = ENV.authProvider === 'session-api' && !!ENV.apiBaseUrl;

if (wantsApi) {
  await import('./api-ops-auth.js');
  await import('./api-ops-data.js');
} else if (!isProduction()) {
  await import('./dev-ops-auth.js');
  await import('./dev-ops-data.js');
} else {
  await import('./not-connected.js');
}
