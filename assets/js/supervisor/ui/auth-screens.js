/* ============================================================================
   SUPERVISOR / UI / AUTH SCREENS — sign in, forgot / reset password, sign
   out. There is no sign-up: supervisor accounts are provisioned by the
   business. The screens are the shared staff-portal ones
   (core/portal-auth-screens.js) bound to this portal's own session —
   presentation only, no session or customer data crosses between the systems.
   ========================================================================= */
import { createPortalAuthScreens } from '../../core/portal-auth-screens.js';
import { supervisorAuthProvider, restoreSupervisorSession, adoptSupervisorSession, supervisorSignIn, supervisorSignOut, requestSupervisorReset, resetSupervisorPassword, SupervisorAuthError } from '../auth.js';
import { put, setHead, devNotice } from './shell.js';

export const { mountSignIn: mountSupervisorSignIn, mountForgot: mountSupervisorForgot, mountReset: mountSupervisorReset, mountSignOut: mountSupervisorSignOut } = createPortalAuthScreens({
  area: 'supervisor/', page: 'supervisor', i18n: 'svp', seed: 'sv', entity: 'supervisor', ErrorClass: SupervisorAuthError,
  auth: { provider: supervisorAuthProvider, restore: restoreSupervisorSession, adopt: adoptSupervisorSession, signIn: supervisorSignIn, signOut: supervisorSignOut, requestReset: requestSupervisorReset, resetPassword: resetSupervisorPassword },
  shell: { put, setHead, devNotice },
});
