/* ============================================================================
   SUPERVISOR / DATA — Stage 13. The facade the portal screens call. Every
   method takes the current supervisor session token from auth.js and hands
   it to the registered adapter; the adapter resolves the token to ONE
   supervisor and answers only from records attributed to that supervisor.
   Screens never pass a supervisor id.

   Shapes:
     supervisor   { id, slug, status, nameAr/En, titleAr/En, bioAr/En, image, languages[], specialties[], services[],
                    phone, whatsapp, email, city, notificationPrefs, createdAt, updatedAt }
     customerRow  { id, name, email, phone, locale, attributionAt, createdAt, bookingsCount, lastActivityAt }
     customer     customerRow + { attribution{supervisorId,source,at}, bookings[], trips[], attributionHistory[] }
     bookingRow   { id, customerId, customerName, service, status, paymentStatus, amount, currency, createdAt, tripId }
     lead         { id, customerId, name, contact, source, serviceInterest, status, convertedBookingId, createdAt, updatedAt }
     revenue      { currency, gross, completed, pending, cancelled, bookingsCount, commission{model,status} }
     performance  { customers, leads, leadsConverted, conversionRate, bookings, bookingsConfirmed, bookingsCancelled }
     commission   { id, bookingId, amount, currency, status ('earned'|'reversed'), rate, period, createdAt, reversedAt } — commissions().items
     notification { id, kind, at, read, titleAr/En, textAr/En, href, bookingId }
     A paged list answers { items, page, pageSize, total, nextPage }.
   ========================================================================= */
import { currentSupervisorToken, supervisorSessionLost, SupervisorAuthError } from './auth.js';
import { track } from '../core/diagnostics.js';

let adapter = null;
export function registerSupervisorDataAdapter(a) { adapter = a; return a; }
export const supervisorDataAdapter = () => adapter;

const call = async (method, ...args) => {
  const token = currentSupervisorToken();
  if (!token) throw new SupervisorAuthError('unauthenticated');
  if (!adapter) throw new Error('no supervisor data adapter registered');
  try { return await adapter[method](token, ...args); }
  catch (error) {
    if (error?.code === 'unauthenticated') { supervisorSessionLost('rejected'); throw new SupervisorAuthError('unauthenticated'); }
    if (!(error instanceof SupervisorAuthError)) track(`supervisor.${method}.failure`, { code: error?.code ?? 'error' });
    throw error;
  }
};

export const LEAD_STATUSES = ['new', 'contacted', 'in_progress', 'converted', 'closed'];

export const supervisorData = {
  profile: () => call('profile'),
  updateProfile: (patch) => call('updateProfile', patch),
  customers: (params = { page: 1 }) => call('customers', params),          // { search, page, pageSize }
  customer: (id) => call('customer', id),
  bookings: (params = { page: 1 }) => call('bookings', params),            // { status, service, page, pageSize }
  booking: (id) => call('booking', id),
  leads: (params = { page: 1 }) => call('leads', params),                  // { status, page, pageSize }
  updateLeadStatus: (id, status) => call('updateLeadStatus', id, status),
  revenue: (params = {}) => call('revenue', params),                      // { period: 'today'|'week'|'month'|null }
  performance: (params = {}) => call('performance', params),
  commissions: (params = { page: 1 }) => call('commissions', params),
  notifications: () => call('notifications'),
  markRead: (ids = null) => call('markRead', ids),
};
