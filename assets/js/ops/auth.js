/* ============================================================================
   OPS / AUTH — Stage 15. Admin and Operations Staff share this one portal and
   this one session marker, completely separate from the customer
   (assets/js/account/auth.js) and supervisor (assets/js/supervisor/auth.js)
   sessions: a different localStorage key, a different provider registry, and
   on the backend a third session cookie (no_ops_session). What separates an
   "admin" screen from an "ops" screen is the `permissions` array the backend
   returns on sign-in/verify — the UI reads it, the backend enforces it; the
   UI is never the authority (§22/§25).

   There is no sign-up here: staff accounts are provisioned by the business.

   Provider contract (every method async; errors are OpsAuthError):
     signIn({ email, password })  → { token, expiresAt, staff }
     signOut(token)
     verify(token)                → { staffId, expiresAt, staff } | null
     refresh(token)
     requestReset(email) / resetPassword({ token, password }) / changePassword(token, { current, next })
   ========================================================================= */
import { createPortalSession, defineAuthError } from '../core/portal-session.js';

export const OpsAuthError = defineAuthError('OpsAuthError');

const session = createPortalSession({ storageKey: 'no.ops.session', entity: 'staff', trackPrefix: 'ops.' });
export const registerOpsAuthProvider = session.register;
export const opsAuthProvider = session.provider;
export const currentOpsToken = session.token;
export const opsSessionLost = session.lost;
/** Resolves { status: 'guest' | 'staff' | 'expired' | 'unavailable', staff, code }. */
export const restoreOpsSession = session.restore;
export const adoptOpsSession = session.adopt;
export const opsSignIn = (credentials) => session.attempt('signIn', credentials);
export const opsSignOut = session.signOut;
export const requestOpsReset = session.requestReset;
export const resetOpsPassword = session.resetPassword;
export const changeOpsPassword = session.changePassword;

/** Permission helper the UI uses to decide what to show — never the authority; the backend checks again on every call. */
export function hasOpsPermission(staff, permission) { return !!staff && (staff.role === 'admin' || (staff.permissions ?? []).includes(permission)); }
