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

import { recordDevLead } from '../../core/leads.js';

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
    const reference = devReference('RQ');
    // A request is a lead. With a backend it becomes one when the booking is claimed (status 'received'); in
    // development this mirrors it into the browser's dev lead store (a no-op anywhere else). Phase 6
    const lead = Object.values(order.travellers ?? {})[0];
    recordDevLead({ supervisor: order.attribution?.supervisor ?? null, name: [lead?.firstName, lead?.lastName].filter(Boolean).join(' '),
      contact: [order.contact?.email, order.contact?.phone].filter(Boolean).join(' · '), source: 'request', serviceInterest: order.context.service, bookingId: reference });
    return { reference, status: 'received', ticketed: false, service: order.context.service };
  },
};

/** A development reference: obviously not a supplier's PNR. */
export function devReference(prefix = 'NO') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-DEV-${s}`;
}
