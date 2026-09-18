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
export const INSTALLED = [];

if (wantsApi) {
  await import('./api-flights.js');
  INSTALLED.push({ name: 'api-flights', provider: 'flight supplier backend API', environment: ENV.environment, status: 'implemented — NOT CONNECTED (no real supplier registered in backend/flights.mjs yet)', configSource: 'API_BASE_URL', capabilities: ['search', 'offer', 'quote', 'extras', 'book'] });
} else if (!isProduction()) {
  await import('./dev-flights.js');   // fictional carriers, clearly labelled — never real inventory
  INSTALLED.push({ name: 'dev-flights', provider: 'in-browser development stand-in', environment: ENV.environment, status: 'development only', configSource: 'none', capabilities: ['search', 'offer', 'quote', 'extras', 'book'] });
} else {
  INSTALLED.push({ name: 'request-only', provider: 'none', environment: ENV.environment, status: 'production without a configured backend: flights fall back to request-only (no live inventory, never fabricated)', configSource: 'API_BASE_URL', capabilities: [] });
}
if (typeof window !== 'undefined') window.no = { ...(window.no ?? {}), flightsInstalled: INSTALLED };
