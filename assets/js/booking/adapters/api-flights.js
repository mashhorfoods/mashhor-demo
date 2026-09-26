/* ============================================================================
   BOOKING / ADAPTERS / API FLIGHTS — the production flight-supplier adapter.
   Stage 16C

   The browser never talks to a supplier or holds a supplier credential:
   search, offer detail and price revalidation are all requests to THIS
   backend (Frontend → Travel & Tourism Backend → Flight Supplier Adapter →
   Supplier API — backend/flights.mjs), which alone talks to the supplier.
   The searchId this adapter gets back is a server-issued cache key, not a
   claim of fact — every offer()/quote() call re-reads it on the backend,
   and the backend revalidates once more, server-side, right before a
   supplier order is ever created (see backend/flights.mjs createFlightBooking,
   triggered only after Stage 16B's verified payment webhook).

   `book()` stays a purely local step: it only picks the reference string
   the booking-to-be will claim under (backend/routes.mjs's `me.claim`
   accepts any client-chosen id, for every service, and never treated it as
   a supplier fact) — no supplier is contacted yet at this point, and the
   copy says so. The REAL supplier order happens later, after payment, and
   its result reaches the customer through GET /me/bookings/:id's own
   flightBooking field (see assets/js/booking/ui/confirmation.js).

   Status: IMPLEMENTED against the contract, NOT CONNECTED until a real
   supplier is registered in backend/flights.mjs (today only 'dev' exists,
   refused in production — see backend/config.mjs).
   ========================================================================= */

import { registerAdapter, bookingReference } from './index.js';
import { get, post } from '../../core/api.js';

export const API_FLIGHTS = registerAdapter({
  id: 'api-flights', dev: false, mode: 'search', services: ['flights'],
  async search(request) {
    const data = await post('/flights/search', { tripType: request.tripType, legs: request.legs, cabin: request.cabin, travellers: request.travellers });
    return { offers: data.offers ?? [], meta: data.meta ?? { searchId: null, expiresAt: null, currency: null } };
  },
  async offer(searchId, id) {
    if (!searchId || !id) return null;
    try { const data = await get(`/flights/offers/${encodeURIComponent(searchId)}/${encodeURIComponent(id)}`); return data.offer ?? null; }
    catch { return null; }
  },
  async quote(searchId, id) {
    const data = await post('/flights/quote', { searchId, offerId: id });
    return { price: data.price ?? null, changed: !!data.changed, previous: data.previous ?? null, unavailable: !!data.unavailable };
  },
  async extras(searchId, id) { return (await this.offer(searchId, id))?.extras ?? []; },
  async book(order) {
    // Not yet a supplier reservation — see this file's header. The real order is created server-side once
    // Stage 16B's verified payment lands; see confirmation.js reading GET /me/bookings/:id's flightBooking field.
    return { reference: bookingReference('NO'), status: 'confirmed', ticketed: false, service: 'flights',
      messageAr: 'تم استلام طلب حجزك. يُنشأ الحجز الفعلي مع المزوّد بعد إتمام الدفع.',
      messageEn: 'Your booking request was received. The actual supplier reservation is created once payment is complete.' };
  },
});
