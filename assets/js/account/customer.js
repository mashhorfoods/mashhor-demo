/* ============================================================================
   ACCOUNT / CUSTOMER — the customer-data facade the screens call. Stage 12

   Every method takes the current session token from auth.js and hands it to
   the registered adapter; the adapter resolves the token to ONE customer and
   answers only from that customer's records. Screens never pass a customer id.

   Shapes (all Ar/En text carries both languages; dates ISO):
     customer     { id, name, email, phone, locale, image, supervisorId, createdAt }
     trip         { id, customerId, titleAr/En, destination{code,cityAr/En,countryAr/En}, startDate, endDate,
                    services[], status: upcoming|current|completed|cancelled, bookingIds[], travellers, supervisorId }
     booking      { id, customerId, tripId, service, status, paymentStatus: paid|unpaid|refunded, amount, currency,
                    supervisorId, ticketed, createdAt, detail{…} }
     document     { id, bookingId, tripId, type: eticket|confirmation|visa|receipt|customer, status: available|pending,
                    issuedAt, title?, size?, contentType?, kind: 'issued'|'customer' } — a customer-uploaded one is kind 'customer'
     payment      { id, bookingId, at, amount, currency, status: paid|refunded|failed|pending, reference, methodAr/En }
                  payments() answers a page: { items, page, pageSize, total, nextPage }
     notification { id, kind: booking|payment|trip|document|visa|support, at, read, titleAr/En, textAr/En, href }
     traveller    { id, firstName, lastName, dob, gender, nationality, passport, passportExpiry }
   ========================================================================= */

import { currentToken, sessionLost, AuthError } from './auth.js';
import { track } from '../core/diagnostics.js';

let adapter = null;
export function registerCustomerAdapter(a) { adapter = a; return a; }
export const customerAdapter = () => adapter;

/**
 * Every call: the session marker must exist, the adapter answers for the
 * customer the backend recognises. A 401 anywhere means the session is gone
 * (revoked, expired) — the marker is dropped and the screens send the customer
 * to sign in; every other failure keeps its customer-safe code.
 */
const call = async (method, ...args) => {
  const token = currentToken();
  if (!token) throw new AuthError('unauthenticated');
  if (!adapter) throw new Error('no customer adapter registered');
  try { return await adapter[method](token, ...args); }
  catch (error) {
    if (error?.code === 'unauthenticated') { sessionLost('rejected'); throw new AuthError('unauthenticated'); }
    if (!(error instanceof AuthError)) track(`${method}.failure`, { code: error?.code ?? 'error' });
    throw error;
  }
};

export const customer = {
  profile: () => call('profile'),
  updateProfile: (patch) => call('updateProfile', patch),
  trips: () => call('trips'),
  trip: (id) => call('trip', id),
  bookings: () => call('bookings'),
  booking: (id) => call('booking', id),
  documents: () => call('documents'),
  uploadDocument: (spec) => call('uploadDocument', spec),          // { file, title, type }
  documentUrl: (id) => call('documentUrl', id),                    // → { url, expiresAt } — temporary, never a permanent link
  deleteDocument: (id) => call('deleteDocument', id),
  payments: (page = { page: 1 }) => call('payments', page),        // → { items, page, pageSize, total, nextPage }
  recordAcceptance: (acceptance) => call('recordAcceptance', acceptance),
  notifications: () => call('notifications'),
  markRead: (ids = null) => call('markRead', ids),
  travellers: () => call('travellers'),
  saveTraveller: (t) => call('saveTraveller', t),
  deleteTraveller: (id) => call('deleteTraveller', id),
  claimBooking: (journey) => call('claimBooking', journey),
};

/* ---- Derived views shared by the screens ---------------------------------- */
export const TRIP_ORDER = { current: 0, upcoming: 1, completed: 2, cancelled: 3 };
/** The trip a customer is on or about to take: current first, then the nearest upcoming. */
export function nextTrip(trips) {
  return [...trips].filter((t) => t.status === 'current' || t.status === 'upcoming').sort((a, b) => (TRIP_ORDER[a.status] - TRIP_ORDER[b.status]) || String(a.startDate).localeCompare(String(b.startDate)))[0] ?? null;
}
export const latestBooking = (bookings) => [...bookings].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] ?? null;
export const unreadCount = (notifications) => notifications.filter((n) => !n.read).length;
