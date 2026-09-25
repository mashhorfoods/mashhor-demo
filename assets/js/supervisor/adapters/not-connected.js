/* ============================================================================
   SUPERVISOR / ADAPTERS / NOT CONNECTED — what a production build registers
   when no backend is configured. Every call fails with 'notConfigured',
   which the portal shows as "this service is not connected yet". A
   production build never falls back to development data for supervisors
   either.
   ========================================================================= */
import { registerSupervisorAuthProvider, SupervisorAuthError } from '../auth.js';
import { registerSupervisorDataAdapter } from '../data.js';
import { ApiError } from '../../core/api.js';

const authFail = async () => { throw new SupervisorAuthError('notConfigured'); };
const dataFail = async () => { throw new ApiError('notConfigured'); };
const AUTH_METHODS = ['signIn', 'verify', 'refresh', 'requestReset', 'resetPassword', 'changePassword'];
const DATA_METHODS = ['profile', 'updateProfile', 'customers', 'customer', 'bookings', 'booking', 'leads', 'updateLeadStatus', 'revenue', 'performance', 'commissions', 'notifications', 'markRead'];

export const NOT_CONNECTED_SUPERVISOR_AUTH = registerSupervisorAuthProvider({ id: 'not-connected', dev: false, signOut: async () => {}, ...Object.fromEntries(AUTH_METHODS.map((m) => [m, authFail])) });
export const NOT_CONNECTED_SUPERVISOR_DATA = registerSupervisorDataAdapter({ id: 'not-connected', dev: false, ...Object.fromEntries(DATA_METHODS.map((m) => [m, dataFail])) });
