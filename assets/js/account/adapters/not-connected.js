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
const DATA_METHODS = ['updateProfile', 'trips', 'trip', 'bookings', 'booking', 'documents', 'uploadDocument', 'documentUrl', 'deleteDocument', 'payments', 'notifications', 'markRead', 'travellers', 'saveTraveller', 'deleteTraveller', 'claimBooking', 'createPaymentIntent'];

export const NOT_CONNECTED_AUTH = registerAuthProvider({ id: 'not-connected', dev: false, signOut: async () => {}, ...Object.fromEntries(AUTH_METHODS.map((m) => [m, authFail])) });
export const NOT_CONNECTED_CUSTOMER = registerCustomerAdapter({ id: 'not-connected', dev: false, ...Object.fromEntries(DATA_METHODS.map((m) => [m, dataFail])) });
export const NOT_CONNECTED_LEGAL = registerLegalAdapter({ id: 'not-connected', dev: false, async document() { return { supplied: false }; } });
