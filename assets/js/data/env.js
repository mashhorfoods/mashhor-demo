/* ============================================================================
   RUNTIME ENVIRONMENT — the only configuration the browser sees. Stage 12.1

   This committed file is the DEVELOPMENT default. A deployment overwrites it
   with `node tools/write-env.mjs`, which reads the process environment
   (see .env.example) and emits the same shape. Everything here is public by
   definition: it ships to every visitor. Private keys, service-role keys,
   signing secrets, database or storage credentials never belong here — the
   backend holds them and the browser talks to the backend only.

   Contract (each key maps to one environment variable):
     environment           NO_ENVIRONMENT       'development' | 'staging' | 'production'
     authProvider          AUTH_PROVIDER        'dev' | 'session-api'
     authPublicConfig      AUTH_PUBLIC_CONFIG   JSON, browser-safe only (e.g. { sessionRefreshMinutes })
     apiBaseUrl            API_BASE_URL         https origin + path of the customer backend, '' when none
     documentService       DOCUMENT_SERVICE_CONFIG  JSON { maxBytes, accept[] }
     paymentApi            PAYMENT_API_CONFIG   JSON { pageSize }
     notifications         NOTIFICATION_CONFIG  JSON { refreshOnFocus, refreshMinSeconds }
     legal                 LEGAL_DOCUMENT_CONFIG JSON { source: 'api' | 'static' | null, termsPath, privacyPath }
     diagnostics           DIAGNOSTICS_CONFIG   JSON { endpoint } — a same-backend path that accepts beacons, or null
     verified              INTEGRATIONS_VERIFIED  null, or { at, backend, adapters[] } — written ONLY by
                                                tools/deploy.mjs after the acceptance suites passed against
                                                the deployed backend (Stage 12.2); it is what lets the adapter
                                                registry say CONNECTED. Never hand-edited.
   ========================================================================= */

export const ENV = Object.freeze({
  environment: 'development',
  authProvider: 'dev',
  authPublicConfig: { sessionRefreshMinutes: 10 },
  apiBaseUrl: '',
  documentService: { maxBytes: 5 * 1024 * 1024, accept: ['application/pdf', 'image/jpeg', 'image/png'] },
  paymentApi: { pageSize: 20 },
  notifications: { refreshOnFocus: true, refreshMinSeconds: 30 },
  legal: { source: null, termsPath: null, privacyPath: null },
  diagnostics: { endpoint: null },
  verified: null,
});

export const isProduction = () => ENV.environment === 'production';
