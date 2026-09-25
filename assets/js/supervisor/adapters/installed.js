/* ============================================================================
   SUPERVISOR / ADAPTERS / INSTALLED — what this build registers for the
   supervisor portal, decided by the SAME public runtime configuration as the
   customer account (data/env.js): the portal is a different area of the same
   backend, not a separate service to configure. Stage 13

   Which adapters load, by configuration:
     name                  environment   status                    capabilities
     api-supervisor-auth   staging/prod  implemented, NOT CONNECTED sign-in, session, refresh, reset, change password
     api-supervisor-data   staging/prod  implemented, NOT CONNECTED profile, customers, bookings, leads, revenue,
                                                                     performance, commissions, notifications
     dev-supervisor-*      development   development only           everything above, this browser only, one demo account
     not-connected         production    fails safely                none

   Whether the backend is actually CONNECTED is reported once, by the account registry
   (account/adapters/installed.js, from ENV.verified) — code existing here never counts as connected.
   ========================================================================= */
import { ENV, isProduction } from '../../data/env.js';

const wantsApi = ENV.authProvider === 'session-api' && !!ENV.apiBaseUrl;

if (wantsApi) {
  await import('./api-supervisor-auth.js');
  await import('./api-supervisor-data.js');
} else if (!isProduction()) {
  await import('./dev-supervisor-auth.js');
  await import('./dev-supervisor-data.js');
} else {
  await import('./not-connected.js');
}
