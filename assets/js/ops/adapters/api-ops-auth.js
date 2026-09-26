/* ============================================================================
   OPS / ADAPTERS / API AUTH — the production identity adapter for the
   operations portal. Talks to the backend's /staff/auth/* endpoints
   (docs/STAGE-15-OPERATIONS-CONTROL.md). The backend sets an HttpOnly session
   cookie (no_ops_session, distinct from the customer's and the supervisor's)
   on sign-in and reads it on every call.

   Status: IMPLEMENTED against the contract, NOT CONNECTED until a backend
   exists at API_BASE_URL (see adapters/installed.js).
   ========================================================================= */
import { registerOpsAuthProvider, OpsAuthError } from '../auth.js';
import { apiAuthProvider } from '../../core/portal-session.js';

export const API_OPS_AUTH = registerOpsAuthProvider(apiAuthProvider({ id: 'api-ops-auth', base: '/staff/auth', entity: 'staff', ErrorClass: OpsAuthError }));
