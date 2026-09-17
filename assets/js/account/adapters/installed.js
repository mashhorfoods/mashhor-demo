/* ============================================================================
   ACCOUNT / ADAPTERS / INSTALLED — what this build registers, decided by the
   public runtime configuration (data/env.js). Stage 12.1

   Registry (also exported as INSTALLED for the docs page and the tests):
     name            provider                          environment   status          config source                 capabilities
     session-api     backend session endpoints         staging/prod  implemented,    API_BASE_URL,                 sign-up/in/out, session, refresh,
                     (fronting the hosted identity)                  NOT CONNECTED   AUTH_PUBLIC_CONFIG            reset, change password
     api-customer    customer backend API              staging/prod  implemented,    API_BASE_URL                  profile, trips, bookings, travellers,
                                                                     NOT CONNECTED                                 documents (+upload, signed URL, delete),
                                                                                                                   payments (paged), notifications, claim, acceptance
     api-legal       backend or static legal files     any           implemented,    LEGAL_DOCUMENT_CONFIG         terms, privacy (version, date)
                                                                     NOT CONNECTED
     dev-auth /      in-browser stand-ins              development   development     none                          everything above, this browser only
     dev-customer                                      only
     not-connected   —                                 production    fails safely    —                             none: every call is "not connected"
                                                       without API

   "NOT CONNECTED" means: implemented and verified against the contract test
   server (tests/contract-server.mjs) and the real backend under backend/
   (npm run test:backend), waiting for a DEPLOYED backend. An adapter reads
   CONNECTED only when ENV.verified names it — and ENV.verified is written
   solely by tools/deploy.mjs, after tools/smoke.mjs and the real-backend
   acceptance run passed against that deployment (Stage 12.2). Code existing
   never counts as connected. A production build with AUTH_PROVIDER=dev is
   refused by tools/write-env.mjs; a production build without a backend
   registers the not-connected adapters — it never serves development data.
   ========================================================================= */

import { ENV, isProduction } from '../../data/env.js';

const wantsApi = ENV.authProvider === 'session-api' && !!ENV.apiBaseUrl;
export const INSTALLED = [];
// CONNECTED is a fact recorded by the deployment (ENV.verified), for this exact backend, never an assumption.
const verified = (name) => !!ENV.verified && ENV.verified.backend === ENV.apiBaseUrl && ENV.verified.adapters?.includes(name);
const status = (name, pending) => (verified(name) ? `CONNECTED — verified ${ENV.verified.at} against ${ENV.verified.backend}` : pending);

if (wantsApi) {
  await import('./session-api-auth.js');
  await import('./api-customer.js');
  INSTALLED.push(
    { name: 'session-api', provider: 'backend session endpoints (hosted identity behind the backend)', environment: ENV.environment, status: status('session-api', 'implemented — NOT CONNECTED (no verified deployment at API_BASE_URL yet)'), configSource: 'API_BASE_URL, AUTH_PUBLIC_CONFIG', capabilities: ['signUp', 'signIn', 'signOut', 'session', 'refresh', 'resetRequest', 'reset', 'changePassword'] },
    { name: 'api-customer', provider: 'customer backend API', environment: ENV.environment, status: status('api-customer', 'implemented — NOT CONNECTED (no verified deployment at API_BASE_URL yet)'), configSource: 'API_BASE_URL, DOCUMENT_SERVICE_CONFIG, PAYMENT_API_CONFIG, NOTIFICATION_CONFIG', capabilities: ['profile', 'trips', 'bookings', 'travellers', 'documents', 'documents.upload', 'documents.signedUrl', 'documents.delete', 'payments.paged', 'notifications', 'bookings.claim', 'legal.acceptance'] },
  );
} else if (!isProduction()) {
  await import('./dev-auth.js');
  await import('./dev-customer.js');
  INSTALLED.push(
    { name: 'dev-auth', provider: 'in-browser development stand-in', environment: ENV.environment, status: 'development only', configSource: 'none', capabilities: ['signUp', 'signIn', 'signOut', 'session', 'resetRequest', 'reset', 'changePassword', 'devSignIn'] },
    { name: 'dev-customer', provider: 'in-browser development stand-in', environment: ENV.environment, status: 'development only', configSource: 'none', capabilities: ['profile', 'trips', 'bookings', 'travellers', 'documents', 'documents.upload', 'documents.signedUrl', 'documents.delete', 'payments.paged', 'notifications', 'bookings.claim', 'legal.acceptance'] },
  );
} else {
  await import('./not-connected.js');
  INSTALLED.push({ name: 'not-connected', provider: 'none', environment: ENV.environment, status: 'production without a backend: every call fails safely', configSource: 'AUTH_PROVIDER, API_BASE_URL', capabilities: [] });
}

const legalReady = ENV.legal?.source === 'static' || (ENV.legal?.source === 'api' && !!ENV.apiBaseUrl);
if (legalReady) {
  await import('./api-legal.js');
  INSTALLED.push({ name: ENV.legal.source === 'static' ? 'static-legal' : 'api-legal', provider: ENV.legal.source === 'static' ? 'static files supplied by the business' : 'customer backend API', environment: ENV.environment, status: status('legal', 'implemented — NOT CONNECTED (documents not verified at the configured source)'), configSource: 'LEGAL_DOCUMENT_CONFIG', capabilities: ['terms', 'privacy'] });
} else {
  INSTALLED.push({ name: 'legal', provider: 'none', environment: ENV.environment, status: 'NOT CONNECTED — Terms of Service and Privacy Policy not supplied', configSource: 'LEGAL_DOCUMENT_CONFIG', capabilities: [] });
}
if (typeof window !== 'undefined') window.no = { ...(window.no ?? {}), installed: INSTALLED };
