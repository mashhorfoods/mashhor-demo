/* ============================================================================
   SUPERVISOR / ADAPTERS / API AUTH — the production identity adapter for the
   supervisor portal. Talks to the backend's /supervisor/auth/* endpoints
   (docs/SUPERVISOR-SYSTEM.md, docs/INTEGRATION.md). The backend sets an
   HttpOnly session cookie (no_supervisor_session, distinct from the
   customer's no_session) on sign-in and reads it on every call; the browser
   keeps only a marker so restoreSupervisorSession() knows to ask.

   Status: IMPLEMENTED against the contract, NOT CONNECTED until a backend
   exists at API_BASE_URL (see adapters/installed.js).
   ========================================================================= */
import { registerSupervisorAuthProvider, SupervisorAuthError } from '../auth.js';
import { apiAuthProvider } from '../../core/portal-session.js';

export const API_SUPERVISOR_AUTH = registerSupervisorAuthProvider(apiAuthProvider({ id: 'api-supervisor-auth', base: '/supervisor/auth', entity: 'supervisor', ErrorClass: SupervisorAuthError }));
