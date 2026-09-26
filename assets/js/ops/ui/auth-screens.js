/* ============================================================================
   OPS / UI / AUTH SCREENS — sign in, forgot / reset password, sign out. There
   is no sign-up: staff accounts (Admin and Operations Staff alike) are
   provisioned by the business. The screens are the shared staff-portal ones
   (core/portal-auth-screens.js) bound to this portal's own session, so no
   session or data crosses between the three portals. Stage 15
   ========================================================================= */
import { createPortalAuthScreens } from '../../core/portal-auth-screens.js';
import { opsAuthProvider, restoreOpsSession, adoptOpsSession, opsSignIn, opsSignOut, requestOpsReset, resetOpsPassword, OpsAuthError } from '../auth.js';
import { put, setHead, devNotice } from './shell.js';

export const { mountSignIn: mountOpsSignIn, mountForgot: mountOpsForgot, mountReset: mountOpsReset, mountSignOut: mountOpsSignOut } = createPortalAuthScreens({
  area: 'admin/', page: 'ops', i18n: 'ops', seed: 'op', entity: 'staff', ErrorClass: OpsAuthError,
  auth: { provider: opsAuthProvider, restore: restoreOpsSession, adopt: adoptOpsSession, signIn: opsSignIn, signOut: opsSignOut, requestReset: requestOpsReset, resetPassword: resetOpsPassword },
  shell: { put, setHead, devNotice },
});
