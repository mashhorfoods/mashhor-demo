/* ============================================================================
   BOOKING / ADAPTERS / INSTALLED — the supplier adapters this build ships,
   decided by the SAME public runtime configuration (data/env.js) the
   account adapters already read (assets/js/account/adapters/installed.js).
   Stage 11 / Stage 16C

   Importing an adapter module registers it for its service (see index.js).
   A service nothing is registered for falls through to REQUEST_ADAPTER —
   never a crash, never fabricated inventory: the customer leaves a request
   instead. That is the production-without-a-backend case here, so no
   bespoke "not connected" flights adapter is needed the way the account
   adapters need one — the fallback already exists in adapters/index.js.
   ========================================================================= */

import { ENV, isProduction } from '../../data/env.js';

const wantsApi = !!ENV.apiBaseUrl;

if (wantsApi) {
  await import('./api-flights.js');
} else if (!isProduction()) {
  await import('./dev-flights.js');   // fictional carriers, clearly labelled — never real inventory
}
