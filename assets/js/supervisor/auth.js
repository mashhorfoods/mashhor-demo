/* ============================================================================
   SUPERVISOR / AUTH — Stage 13. The supervisor portal's own authentication,
   completely separate from the customer session (assets/js/account/auth.js):
   a different localStorage marker, a different provider registry, and (on
   the backend) a different session cookie. A customer being signed in has
   no bearing on a supervisor session and vice versa.

   There is no sign-up here: supervisor accounts are provisioned by the
   business (a future Admin Dashboard, Stage 14), never self-registered.

   Provider contract (every method async; errors are SupervisorAuthError):
     signIn({ email, password })  → { token, expiresAt, supervisor }
     signOut(token)
     verify(token)                → { supervisorId, expiresAt, supervisor } | null
     refresh(token)                → same shape, when the provider supports it
     requestReset(email)          → { ok }
     resetPassword({ token, password }) → { ok }
     changePassword(token, { current, next }) → { ok }
   ========================================================================= */
import { createPortalSession, defineAuthError } from '../core/portal-session.js';

export const SupervisorAuthError = defineAuthError('SupervisorAuthError');

const session = createPortalSession({ storageKey: 'no.supervisor.session', entity: 'supervisor', trackPrefix: 'supervisor.' });
export const registerSupervisorAuthProvider = session.register;
export const supervisorAuthProvider = session.provider;
export const currentSupervisorToken = session.token;
export const supervisorSessionLost = session.lost;
/** Resolves { status: 'guest' | 'supervisor' | 'expired' | 'unavailable', supervisor, code }. */
export const restoreSupervisorSession = session.restore;
export const adoptSupervisorSession = session.adopt;
export const supervisorSignIn = (credentials) => session.attempt('signIn', credentials);
export const supervisorSignOut = session.signOut;
export const requestSupervisorReset = session.requestReset;
export const resetSupervisorPassword = session.resetPassword;
export const changeSupervisorPassword = session.changePassword;
