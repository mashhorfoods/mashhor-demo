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
     document     { id, bookingId, tripId, type: eticket|confirmation|visa|receipt, status: available|pending, issuedAt }
     payment      { id, bookingId, at, amount, currency, status: paid|refunded|failed|pending, reference, methodAr/En }
     notification { id, kind: booking|payment|trip|document|visa|support, at, read, titleAr/En, textAr/En, href }
     traveller    { id, firstName, lastName, dob, gender, nationality, passport, passportExpiry }
   ========================================================================= */

import { currentToken, AuthError } from './auth.js';

let adapter = null;
export function registerCustomerAdapter(a) { adapter = a; return a; }
export const customerAdapter = () => adapter;

const call = (method, ...args) => {
  const token = currentToken();
  if (!token) return Promise.reject(new AuthError('unauthenticated'));
  if (!adapter) return Promise.reject(new Error('no customer adapter registered'));
  return adapter[method](token, ...args);
};

export const customer = {
  profile: () => call('profile'),
  updateProfile: (patch) => call('updateProfile', patch),
  trips: () => call('trips'),
  trip: (id) => call('trip', id),
  bookings: () => call('bookings'),
  booking: (id) => call('booking', id),
  documents: () => call('documents'),
  payments: () => call('payments'),
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
