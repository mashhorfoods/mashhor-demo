/* ============================================================================
   ACCOUNT / ADAPTERS / NOT CONNECTED — what a production build registers when
   no backend is configured. Every call fails with 'notConfigured', which the
   screens show as "this service is not connected yet" with a support path.
   Production never falls back to development data.
   ========================================================================= */

import { registerAuthProvider, AuthError } from '../auth.js';
import { registerCustomerAdapter } from '../customer.js';
import { registerLegalAdapter } from '../legal.js';
import { ApiError } from '../../core/api.js';

const authFail = async () => { throw new AuthError('notConfigured'); };
const dataFail = async () => { throw new ApiError('notConfigured'); };
const AUTH_METHODS = ['verify', 'signIn', 'signUp', 'requestReset', 'resetPassword', 'changePassword', 'updateAccount', 'refresh'];
const DATA_METHODS = ['profile', 'updateProfile', 'trips', 'trip', 'bookings', 'booking', 'documents', 'uploadDocument', 'documentUrl', 'deleteDocument', 'payments', 'notifications', 'markRead', 'travellers', 'saveTraveller', 'deleteTraveller', 'claimBooking', 'recordAcceptance'];

export const NOT_CONNECTED_AUTH = registerAuthProvider({ id: 'not-connected', dev: false, provider: 'none', configSource: 'AUTH_PROVIDER / API_BASE_URL', signOut: async () => {}, ...Object.fromEntries(AUTH_METHODS.map((m) => [m, authFail])) });
export const NOT_CONNECTED_CUSTOMER = registerCustomerAdapter({ id: 'not-connected', dev: false, provider: 'none', configSource: 'API_BASE_URL', capabilities: [], ...Object.fromEntries(DATA_METHODS.map((m) => [m, dataFail])) });
export const NOT_CONNECTED_LEGAL = registerLegalAdapter({ id: 'not-connected', dev: false, provider: 'none', configSource: 'LEGAL_DOCUMENT_CONFIG', async document() { return { supplied: false }; } });
