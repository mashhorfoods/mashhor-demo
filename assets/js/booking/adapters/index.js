/* ============================================================================
   BOOKING / ADAPTERS — the supplier boundary. Stage 11

   The UI never talks to a supplier. It builds a SearchRequest from the
   booking context, hands it to the adapter registered for the service, and
   draws whatever normalised offers come back. Swapping a supplier means
   registering another adapter here — nothing above this line changes.

   Adapter contract (every method async; every method may throw):

     id           'dev-flights' | 'amadeus' | …
     dev          true → the UI labels every result as development data
     services     ['flights'] — which SEARCH_VERTICALS ids it serves
     mode         'search'  the customer picks from offers and pays
                  'request' no live inventory: the customer leaves a request
     search(request)        → { offers: Offer[], meta: { searchId, expiresAt, currency } }
     offer(searchId, id)    → Offer                (the details page)
     quote(searchId, id)    → { price, changed, previous }   (re-price before payment)
     book(order)            → { reference, status, ticketed, message }
     extras(searchId, id)   → Extra[]

   Normalised OFFER — what every supplier is mapped onto:
     id, provider, service, tripType,
     legs: [{ from, to, departAt, arriveAt, durationMinutes, stops: [{ code, cityAr, cityEn, waitMinutes }],
              segments: [{ carrier: {code,nameAr,nameEn}, flightNumber, from, to, departAt, arriveAt, durationMinutes, aircraft|null }] }]
     carrier, baggage: { cabinKg, checkedKg, checkedPieces },
     fare: { family, refundable, changeable, changeFee, cancelFee, labelAr, labelEn, rulesAr[], rulesEn[] },
     price: { currency, perTraveller: { adult, child, infant }, taxes, fees, total },   (total for the party)
     availability: { seatsLeft },
     included: [{ ar, en }], extras: Extra[]
   ========================================================================= */

import { isProduction } from '../../data/env.js';

const registry = new Map();

export function registerAdapter(adapter) {
  for (const service of adapter.services) registry.set(service, adapter);
  return adapter;
}

/** The adapter for a service, or a request-only stand-in when none is registered. */
export function adapterFor(service) {
  return registry.get(service) ?? REQUEST_ADAPTER;
}

/**
 * Services without a live supplier are still bookable as REQUESTS: the
 * customer describes the trip, leaves traveller and contact details, and a
 * specialist comes back with options and a price. No inventory is shown,
 * nothing is charged. Stage 11 ships this stand-in for hotels, packages,
 * visas, Umrah, medical travel, transport and other services.
 */
export const REQUEST_ADAPTER = {
  id: 'request', dev: false, mode: 'request', services: [],
  async search() { return { offers: [], meta: { searchId: null, expiresAt: null, currency: null } }; },
  async offer() { return null; },
  async quote() { return { price: null, changed: false, previous: null }; },
  async extras() { return []; },
  async book(order) {
    await new Promise((r) => setTimeout(r, 400));
    return { reference: bookingReference('RQ'), status: 'received', ticketed: false, service: order.context.service };
  },
};

/** A local booking reference — never a supplier's PNR. Outside production it carries `-DEV-` so development
    bookings are obvious at a glance; a production reference is the same prefix plus eight random characters. */
export function bookingReference(prefix = 'NO') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const prod = isProduction();
  let s = '';
  for (let i = 0; i < (prod ? 8 : 6); i++) s += chars[Math.floor(Math.random() * chars.length)];
  return prod ? `${prefix}-${s}` : `${prefix}-DEV-${s}`;
}
