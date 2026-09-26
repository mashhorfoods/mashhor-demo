/* ============================================================================
   SUPERVISOR / ADAPTERS / NOT CONNECTED — what a production build registers
   when no backend is configured. Every call fails with 'notConfigured',
   which the portal shows as "this service is not connected yet". A
   production build never falls back to development data for supervisors
   either.
   ========================================================================= */
import { registerSupervisorAuthProvider, SupervisorAuthError } from '../auth.js';
import { registerSupervisorDataAdapter } from '../data.js';
import { notConnectedAuth } from '../../core/portal-session.js';
import { notConnectedData } from '../../core/adapter-helpers.js';

const DATA_METHODS = ['profile', 'updateProfile', 'customers', 'customer', 'bookings', 'booking', 'leads', 'updateLeadStatus', 'revenue', 'performance', 'commissions', 'notifications', 'markRead'];

export const NOT_CONNECTED_SUPERVISOR_AUTH = registerSupervisorAuthProvider(notConnectedAuth(SupervisorAuthError));
export const NOT_CONNECTED_SUPERVISOR_DATA = registerSupervisorDataAdapter(notConnectedData(DATA_METHODS));
