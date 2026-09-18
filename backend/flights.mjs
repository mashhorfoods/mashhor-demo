// ============================================================================
// BACKEND / FLIGHTS — Stage 16C. The flight-supplier boundary, server side.
//
//   Customer → Number One Backend → Flight Supplier Adapter → Supplier API
//
// Mirrors backend/payments.mjs's provider registry exactly (and, through it,
// the frontend's own booking-supplier adapter pattern in
// assets/js/booking/adapters/index.js): the booking domain never talks to a
// supplier directly, only through the registry below, and the browser never
// holds a supplier credential — every search, quote and booking call is a
// request to THIS backend, which alone talks to the supplier.
//
// The normalised Offer shape below is deliberately identical, field for
// field, to assets/js/booking/adapters/index.js's documented contract — so
// the existing UI (results, details, review, extras, confirmation) needs no
// change at all to read a real supplier's data instead of the in-browser
// development generator it replaces.
// ============================================================================
import { randomBytes, createHash } from 'node:crypto';
import { q, now } from './db.mjs';
import { HttpError } from './http.mjs';
import { info, warn } from './logger.mjs';
import { audit } from './staff.mjs';
import { enqueue } from './mailer.mjs';

const SYSTEM_ACTOR = { id: 'system', role: 'system' };
const hex = (n = 6) => randomBytes(n).toString('hex');
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

/* ---- provider registry — one adapter per supplier id, never referenced by name outside this file ---- */
const registry = new Map();
/** Provider contract, every method may throw HttpError:
      id, dev            'dev' | a real supplier's id ('amadeus', 'sabre', 'duffel', …); dev charges/books nothing real
      search(request)     → { offers: Offer[], meta: { currency } }         — request is ALREADY validated (validateSearchRequest)
      quote(offer)         → { price, changed, previous, unavailable }       — revalidate ONE offer right now
      book({ offer, travellers, contact, idempotencyKey }) → { providerBookingId, status, ticketed, pnr, itineraryAr, itineraryEn, messageAr, messageEn }
    Offer shape (must match assets/js/booking/adapters/index.js exactly):
      id, provider: {id, dev}, service: 'flights', tripType, carrier, legs[], baggage, fare, price, availability, included[], extras[] */
export function registerFlightProvider(p) { registry.set(p.id, p); return p; }
export function flightProviderFor(id) { return registry.get(id) ?? null; }

const CABINS = ['economy', 'premium', 'business', 'first'];
const TRIP_TYPES = ['return', 'oneway', 'multi'];
const CODE_RE = /^[A-Z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---- §5/§6: server-side input validation — never forwards an unvalidated browser parameter to a supplier ---- */
export function validateSearchRequest(body) {
  const tripType = TRIP_TYPES.includes(body?.tripType) ? body.tripType : null;
  if (!tripType) throw new HttpError(422, 'invalid', { field: 'tripType' });
  const cabin = CABINS.includes(body?.cabin) ? body.cabin : 'economy';
  const rawLegs = Array.isArray(body?.legs) ? body.legs : [];
  const legCount = tripType === 'multi' ? [2, 3, 4] : [1];
  const wantLegs = tripType === 'return' ? 2 : 1;
  const legs = (tripType === 'multi' ? rawLegs : rawLegs.slice(0, wantLegs)).map((l) => {
    const from = String(l?.from ?? '').toUpperCase(); const to = String(l?.to ?? '').toUpperCase(); const date = String(l?.date ?? '');
    if (!CODE_RE.test(from) || !CODE_RE.test(to) || from === to) throw new HttpError(422, 'invalid', { field: 'airport' });
    if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date)) || date < todayIso()) throw new HttpError(422, 'invalid', { field: 'date' });
    return { from, to, date };
  });
  if (tripType === 'multi' ? !legCount.includes(legs.length) : legs.length !== wantLegs) throw new HttpError(422, 'invalid', { field: 'legs' });
  if (tripType === 'multi') for (let i = 1; i < legs.length; i++) if (legs[i].date < legs[i - 1].date) throw new HttpError(422, 'invalid', { field: 'legOrder' });
  const adults = Number.isInteger(body?.travellers?.adults) ? body.travellers.adults : 0;
  const children = Number.isInteger(body?.travellers?.children) ? body.travellers.children : 0;
  const infants = Number.isInteger(body?.travellers?.infants) ? body.travellers.infants : 0;
  if (adults < 1 || children < 0 || infants < 0) throw new HttpError(422, 'invalid', { field: 'travellers' });
  if (infants > adults) throw new HttpError(422, 'invalid', { field: 'infants' });
  if (adults + children + infants > 9) throw new HttpError(422, 'invalid', { field: 'travellers' });
  // QA switch, honoured only by the dev provider (never forwarded to a real supplier's own request builder,
  // which reads only the named fields above) — mirrors the sessionStorage switches the in-browser dev adapter
  // used to expose, now that search runs server-side.
  const devTest = typeof body?.devTest === 'string' ? body.devTest.slice(0, 20) : null;
  return { service: 'flights', tripType, legs, cabin, travellers: { adults, children, infants }, devTest };
}
function todayIso() { return new Date().toISOString().slice(0, 10); }

/* ---- server-side search/offer cache — a server-issued searchId is the one thing the browser carries forward;
   never sessionStorage, never trusted back as fact (every offer() / quote() / book() re-reads it here). A real
   supplier's own shopping-cart/offer token would replace this cache one-for-one. ---- */
const SEARCH_TTL_MS = 20 * 60 * 1000;
const searches = new Map();   // searchId → { request, offers, provider, expiresAt }
function sweepSearches() { const t = Date.now(); for (const [id, s] of searches) if (s.expiresAt < t) searches.delete(id); }

export async function searchFlights(rawRequest, providerId) {
  const provider = flightProviderFor(providerId); if (!provider) throw new HttpError(503, 'unavailable', { reason: 'noFlightProvider' });
  const request = validateSearchRequest(rawRequest);
  sweepSearches();
  const started = Date.now();
  let result;
  try { result = await provider.search(request); }
  catch (e) { warn('flight.search.providerError', { provider: providerId }); throw new HttpError(503, 'unavailable', { reason: 'supplierError' }); }
  const searchId = `S-${hex(8)}`; const expiresAt = Date.now() + SEARCH_TTL_MS;
  searches.set(searchId, { request, offers: result.offers, provider: providerId, expiresAt });
  info('flight.search', { provider: providerId, service: 'flights', tripType: request.tripType, results: result.offers.length, durationMs: Date.now() - started });
  return { offers: result.offers, meta: { searchId, expiresAt, currency: result.meta?.currency ?? null } };
}

export function getFlightOffer(searchId, offerId) {
  const s = searches.get(searchId); if (!s || s.expiresAt < Date.now()) return null;
  return s.offers.find((o) => o.id === offerId) ?? null;
}

export async function quoteFlightOffer(searchId, offerId, providerId) {
  const s = searches.get(searchId); if (!s || s.expiresAt < Date.now()) return { price: null, changed: false, previous: null, unavailable: true };
  const offer = s.offers.find((o) => o.id === offerId); if (!offer) return { price: null, changed: false, previous: null, unavailable: true };
  const provider = flightProviderFor(providerId ?? s.provider); if (!provider) return { price: null, changed: false, previous: null, unavailable: true };
  try { return await provider.quote(offer); }
  catch { warn('flight.quote.providerError', { provider: providerId }); return { price: null, changed: false, previous: null, unavailable: true }; }
}

/* ---- §12/§13/§14: Backend → Supplier → Create Reservation/Order. Runs ONLY after Stage 16B's own verified-
   webhook path marks the internal payment paid (see payments.mjs handleWebhookEvent) — Revalidate → Payment →
   Supplier Booking → Confirmation, the ordering this stage's own brief offers as its default. Idempotent on the
   internal booking id: flight_bookings.booking_id is UNIQUE, so a retry (a second payment-paid delivery cannot
   happen — payment_events is itself idempotent — but a manual ops retry after a supplier timeout can) finds the
   existing row and returns it rather than calling the supplier a second time. ---- */
export async function createFlightBooking({ bookingId, customerId, searchId, offerId }, providerId) {
  const existing = q.get('SELECT * FROM flight_bookings WHERE booking_id = ?', bookingId);
  if (existing && existing.status !== 'failed') return nFlightBooking(existing);   // already booked (or in flight) — never a second supplier call

  const provider = flightProviderFor(providerId);
  if (!provider) { warn('flight.booking.noProvider', { bookingId, provider: providerId }); return recordFailure(bookingId, customerId, providerId, existing, 'noProvider'); }

  // final revalidation, right before the supplier order is placed — never books a stale/expired fare (§10, §26)
  const offer = getFlightOffer(searchId, offerId);
  if (!offer) { warn('flight.booking.staleOffer', { bookingId }); return recordFailure(bookingId, customerId, providerId, existing, 'staleOffer'); }
  let q1; try { q1 = await provider.quote(offer); } catch { return recordFailure(bookingId, customerId, providerId, existing, 'revalidationFailed'); }
  if (q1.unavailable) return recordFailure(bookingId, customerId, providerId, existing, 'unavailable');

  const booking = q.get('SELECT * FROM bookings WHERE id = ?', bookingId); if (!booking) return recordFailure(bookingId, customerId, providerId, existing, 'bookingNotFound');
  const travellers = Object.values(J(booking.detail_json, {})?.travellersDetail ?? {});
  let result;
  try { result = await provider.book({ offer, travellers, idempotencyKey: bookingId }); }
  catch (e) { warn('flight.booking.supplierRejected', { bookingId, provider: providerId }); return recordFailure(bookingId, customerId, providerId, existing, e?.reason ?? 'supplierRejected'); }

  const t = now();
  const row = { id: existing?.id ?? `fbk_${hex(6)}`, booking_id: bookingId, customer_id: customerId, provider: providerId, provider_booking_id: result.providerBookingId ?? null,
    status: result.status ?? 'confirmed', itinerary_json: JSON.stringify(result.itinerary ?? {}), passengers_json: JSON.stringify(result.passengers ?? travellers), fare_json: JSON.stringify(offer.price), failure_reason: null, created_at: existing?.created_at ?? t, updated_at: t };
  if (existing) q.run('UPDATE flight_bookings SET provider = ?, provider_booking_id = ?, status = ?, itinerary_json = ?, passengers_json = ?, fare_json = ?, failure_reason = NULL, updated_at = ? WHERE id = ?', row.provider, row.provider_booking_id, row.status, row.itinerary_json, row.passengers_json, row.fare_json, row.updated_at, row.id);
  else q.run('INSERT INTO flight_bookings (id, booking_id, customer_id, provider, provider_booking_id, status, itinerary_json, passengers_json, fare_json, failure_reason, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', row.id, row.booking_id, row.customer_id, row.provider, row.provider_booking_id, row.status, row.itinerary_json, row.passengers_json, row.fare_json, row.failure_reason, row.created_at, row.updated_at);
  if (result.ticketed) q.run('UPDATE bookings SET ticketed = 1 WHERE id = ?', bookingId);
  audit(SYSTEM_ACTOR, 'flightBooking.created', 'booking', bookingId, { provider: providerId, providerBookingId: row.provider_booking_id, status: row.status });
  info('flight.booking.created', { bookingId, provider: providerId, status: row.status });
  enqueue({ customerId, template: 'flight-booking-confirmed', payload: { bookingId, provider: providerId, pnr: result.pnr ?? null } });
  return nFlightBooking(q.get('SELECT * FROM flight_bookings WHERE id = ?', row.id));
}

function recordFailure(bookingId, customerId, providerId, existing, reason) {
  const t = now();
  if (existing) q.run('UPDATE flight_bookings SET status = ?, failure_reason = ?, updated_at = ? WHERE id = ?', 'failed', reason, t, existing.id);
  else q.run('INSERT INTO flight_bookings (id, booking_id, customer_id, provider, provider_booking_id, status, itinerary_json, passengers_json, fare_json, failure_reason, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    `fbk_${hex(6)}`, bookingId, customerId, providerId ?? 'none', null, 'failed', '{}', '[]', '{}', reason, t, t);
  audit(SYSTEM_ACTOR, 'flightBooking.failed', 'booking', bookingId, { provider: providerId, reason });
  warn('flight.booking.failed', { bookingId, provider: providerId, reason });
  enqueue({ customerId, template: 'flight-booking-failed', payload: { bookingId, reason } });
  // a failed supplier booking is never reported to the customer as a confirmed ticket (§15, §26) — the internal
  // booking's own payment_status stays exactly what Stage 16B's webhook already set; ticketed stays false.
  return nFlightBooking(q.get('SELECT * FROM flight_bookings WHERE booking_id = ?', bookingId));
}

const nFlightBooking = (r) => (r ? { id: r.id, bookingId: r.booking_id, provider: r.provider, providerBookingId: r.provider_booking_id, status: r.status, itinerary: J(r.itinerary_json, {}), failureReason: r.failure_reason, createdAt: r.created_at, updatedAt: r.updated_at } : null);
export { nFlightBooking };

/* ---- the development supplier: fictional carriers, deterministic, clearly labelled, refused in production
   (backend/config.mjs) — the exact same generator assets/js/booking/adapters/dev-flights.js used to run
   in-browser, now behind the real backend boundary this stage exists to create. ---- */
const CARRIERS = [
  { code: 'DV', nameAr: 'ديف إير (تجريبي)', nameEn: 'Dev Air (development)' },
  { code: 'SA', nameAr: 'سامبل إيرويز (تجريبي)', nameEn: 'Sample Airways (development)' },
  { code: 'EX', nameAr: 'إكزامبل سكاي (تجريبي)', nameEn: 'Example Sky (development)' },
];
const HUBS = ['DOH', 'DXB', 'CAI', 'IST', 'ADD'];
const PLACES = {
  KRT: ['الخرطوم', 'Khartoum'], PZU: ['بورتسودان', 'Port Sudan'], JED: ['جدة', 'Jeddah'], MED: ['المدينة المنورة', 'Madinah'], RUH: ['الرياض', 'Riyadh'],
  DXB: ['دبي', 'Dubai'], AUH: ['أبوظبي', 'Abu Dhabi'], DOH: ['الدوحة', 'Doha'], AMM: ['عمّان', 'Amman'], CAI: ['القاهرة', 'Cairo'],
  IST: ['إسطنبول', 'Istanbul'], SAW: ['إسطنبول', 'Istanbul'], NBO: ['نيروبي', 'Nairobi'], ADD: ['أديس أبابا', 'Addis Ababa'],
  LHR: ['لندن', 'London'], KUL: ['كوالالمبور', 'Kuala Lumpur'], DEL: ['دلهي', 'Delhi'],
};
const FARES = {
  saver: { family: 'saver', refundable: false, changeable: true, changeFee: 80, cancelFee: null, checkedKg: 23, checkedPieces: 1, cabinKg: 7, labelAr: 'موفّرة — تعديل برسوم، غير قابلة للاسترداد', labelEn: 'Saver — change for a fee, non-refundable', rulesAr: ['التعديل قبل المغادرة برسوم 80 دولاراً لكل مسافر', 'غير قابلة للاسترداد بعد الإصدار'], rulesEn: ['Changes before departure for USD 80 per traveller', 'Non-refundable once issued'] },
  standard: { family: 'standard', refundable: true, changeable: true, changeFee: 40, cancelFee: 120, checkedKg: 30, checkedPieces: 1, cabinKg: 7, labelAr: 'قياسية — تعديل برسوم مخفّضة، استرداد برسوم', labelEn: 'Standard — reduced change fee, refundable with a fee', rulesAr: ['التعديل برسوم 40 دولاراً لكل مسافر', 'الإلغاء والاسترداد برسوم 120 دولاراً لكل مسافر'], rulesEn: ['Changes for USD 40 per traveller', 'Cancellation refunded less USD 120 per traveller'] },
  flex: { family: 'flex', refundable: true, changeable: true, changeFee: 0, cancelFee: 0, checkedKg: 30, checkedPieces: 2, cabinKg: 10, labelAr: 'مرنة — تعديل واسترداد بلا رسوم', labelEn: 'Flex — free changes and refunds', rulesAr: ['تعديل مجاني قبل المغادرة', 'استرداد كامل عند الإلغاء قبل المغادرة'], rulesEn: ['Free changes before departure', 'Full refund if cancelled before departure'] },
};
const CABIN_FACTOR = { economy: 1, premium: 1.6, business: 2.8, first: 4.2 };

const hashSeed = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const pad = (n) => String(n).padStart(2, '0');
const at = (date, minutes) => { const d = new Date(`${date}T00:00:00`); d.setMinutes(d.getMinutes() + minutes); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`; };
const place = (code) => { const p = PLACES[code]; return p ? { code, cityAr: p[0], cityEn: p[1], airportAr: p[0], airportEn: p[1] } : { code, cityAr: code, cityEn: code, airportAr: code, airportEn: code }; };
const baseMinutes = (from, to) => 90 + (hashSeed(`${[from, to].sort().join('')}`) % 420);

function makeLeg(r, from, to, date, stops, carrier, n) {
  const direct = baseMinutes(from, to);
  const departMin = 5 * 60 + Math.floor(r() * 17) * 60 + Math.floor(r() * 4) * 15;
  const segments = [];
  if (stops === 0) {
    segments.push({ carrier, flightNumber: `${carrier.code} ${100 + n}`, from: place(from), to: place(to), departAt: at(date, departMin), arriveAt: at(date, departMin + direct), durationMinutes: direct, aircraft: null });
  } else {
    const hub = HUBS.find((h) => h !== from && h !== to) ?? 'DOH';
    const a = Math.round(direct * 0.55) + 30; const wait = 75 + Math.floor(r() * 5) * 30; const b = Math.round(direct * 0.6) + 20;
    segments.push({ carrier, flightNumber: `${carrier.code} ${200 + n}`, from: place(from), to: place(hub), departAt: at(date, departMin), arriveAt: at(date, departMin + a), durationMinutes: a, aircraft: null });
    segments.push({ carrier, flightNumber: `${carrier.code} ${300 + n}`, from: place(hub), to: place(to), departAt: at(date, departMin + a + wait), arriveAt: at(date, departMin + a + wait + b), durationMinutes: b, aircraft: null });
  }
  const first = segments[0]; const last = segments[segments.length - 1];
  const total = segments.reduce((s, x) => s + x.durationMinutes, 0) + (stops ? (new Date(segments[1].departAt) - new Date(segments[0].arriveAt)) / 60000 : 0);
  return { from: place(from), to: place(to), departAt: first.departAt, arriveAt: last.arriveAt, durationMinutes: Math.round(total),
           stops: segments.slice(0, -1).map((s, i) => ({ ...s.to, waitMinutes: Math.round((new Date(segments[i + 1].departAt) - new Date(s.arriveAt)) / 60000) })), segments };
}

function makeOffer(request, n, r) {
  const carrier = CARRIERS[n % CARRIERS.length];
  const stops = n % 3 === 1 ? 1 : (n === 8 ? 2 : 0);
  const fare = FARES[['saver', 'standard', 'flex'][n % 3]];
  const legs = request.legs.map((leg, i) => makeLeg(r, leg.from, leg.to, leg.date, stops, carrier, n * 10 + i));
  const cabin = CABIN_FACTOR[request.cabin] ?? 1;
  const perAdult = Math.round((180 + legs.reduce((s, l) => s + l.durationMinutes, 0) * 0.55 + (fare.family === 'flex' ? 160 : fare.family === 'standard' ? 70 : 0) - stops * 45 + r() * 60) * cabin);
  const perChild = Math.round(perAdult * 0.75); const perInfant = Math.round(perAdult * 0.1);
  const { adults, children, infants } = request.travellers;
  const base = perAdult * adults + perChild * children + perInfant * infants;
  const taxes = Math.round(base * 0.14); const fees = 12 * (adults + children + infants);
  return {
    id: `DF-${hashSeed(`${JSON.stringify(request)}-${n}`).toString(36).toUpperCase().slice(0, 6)}`,
    _devTest: request.devTest ?? null,
    provider: { id: 'dev', dev: true }, service: 'flights', tripType: request.tripType, carrier, legs,
    baggage: { cabinKg: fare.cabinKg, checkedKg: fare.checkedKg, checkedPieces: fare.checkedPieces },
    fare: { family: fare.family, refundable: fare.refundable, changeable: fare.changeable, changeFee: fare.changeFee, cancelFee: fare.cancelFee, labelAr: fare.labelAr, labelEn: fare.labelEn, rulesAr: fare.rulesAr, rulesEn: fare.rulesEn },
    price: { currency: 'USD', perTraveller: { adult: perAdult, child: perChild, infant: perInfant }, base, taxes, fees, total: base + taxes + fees },
    availability: { seatsLeft: 2 + Math.floor(r() * 8) },
    included: [{ ar: 'وجبة على متن الرحلة', en: 'Meal on board' }, { ar: `حقيبة يد ${fare.cabinKg} كغ`, en: `Cabin bag ${fare.cabinKg} kg` }],
    extras: [
      { id: 'bag', labelAr: 'حقيبة مسجّلة إضافية 23 كغ', labelEn: 'Extra checked bag 23 kg', price: 45, currency: 'USD', perTraveller: true, max: 2 },
      { id: 'seat', labelAr: 'اختيار المقعد', labelEn: 'Seat selection', price: 15, currency: 'USD', perTraveller: true, max: 1 },
    ],
  };
}

/** Test-only failure switches, mirroring the frontend dev adapter's sessionStorage switches — here they read
    from the search request itself (`options.devTest`), since the backend has no browser session to read. */
export function registerDevFlightProvider() {
  return registerFlightProvider({
    id: 'dev', dev: true,
    async search(request) {
      const sw = request.devTest;
      if (sw === 'slow') await new Promise((r) => setTimeout(r, 1200));
      if (sw === 'error') throw new Error('development supplier: simulated outage');
      const key = JSON.stringify(request); const r = rng(hashSeed(key));
      const offers = sw === 'empty' ? [] : Array.from({ length: 9 }, (_, n) => makeOffer(request, n, r));
      return { offers, meta: { currency: 'USD' } };
    },
    async quote(offer) {
      if (offer._devTest === 'unavailable') return { price: null, changed: false, previous: null, unavailable: true };
      if (offer._devTest === 'changed') { const price = { ...offer.price, taxes: offer.price.taxes + 18, total: offer.price.total + 18 }; return { price, changed: true, previous: offer.price }; }
      return { price: offer.price, changed: false, previous: null };
    },
    async book({ offer, idempotencyKey }) {
      if (offer._devTest === 'book-fail') { const e = new Error('development supplier: booking rejected'); e.reason = 'supplierRejected'; throw e; }
      const pnr = createHash('sha1').update(idempotencyKey).digest('hex').slice(0, 6).toUpperCase();
      return { providerBookingId: `DEVPNR-${pnr}`, status: 'confirmed', ticketed: false, pnr,
        itinerary: { legs: offer.legs, fare: offer.fare }, passengers: [],
        messageAr: 'تم تأكيد الحجز مع المزوّد التجريبي. تُصدر التذكرة بعد تأكيد المزوّد الحقيقي.',
        messageEn: 'Booking confirmed with the development supplier. The ticket is issued once a real supplier confirms.' };
    },
  });
}
