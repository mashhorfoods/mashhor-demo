/* ============================================================================
   BOOKING / ADAPTERS / DEV FLIGHTS — a development supplier. Stage 11

   THIS IS NOT INVENTORY. It generates plausible, deterministic flight
   offers from the search request so the journey can be built, tested and
   demonstrated before a real supplier is connected. Carriers are fictional
   ("Dev Air", "Sample Airways", "Example Sky"), prices are development
   figures in USD, and every offer carries `provider.dev = true`, which the
   UI turns into a visible "development data" notice on every screen.

   Determinism: the same request always yields the same offers (seeded from
   route + dates), so browser suites can assert on them. Two QA switches in
   sessionStorage steer the failure paths:
     no.dev.search = 'error' | 'empty' | 'slow'
     no.dev.quote  = 'changed' | 'unavailable'
   ========================================================================= */

import { registerAdapter, devReference } from './index.js';
import { locationByCode } from '../locations.js';

const CARRIERS = [
  { code: 'DV', nameAr: 'ديف إير (تجريبي)', nameEn: 'Dev Air (development)' },
  { code: 'SA', nameAr: 'سامبل إيرويز (تجريبي)', nameEn: 'Sample Airways (development)' },
  { code: 'EX', nameAr: 'إكزامبل سكاي (تجريبي)', nameEn: 'Example Sky (development)' },
];
const HUBS = ['DOH', 'DXB', 'CAI', 'IST', 'ADD'];

const FARES = {
  saver:    { family: 'saver', refundable: false, changeable: true, changeFee: 80, cancelFee: null, checkedKg: 23, checkedPieces: 1, cabinKg: 7,
              labelAr: 'موفّرة — تعديل برسوم، غير قابلة للاسترداد', labelEn: 'Saver — change for a fee, non-refundable',
              rulesAr: ['التعديل قبل المغادرة برسوم 80 دولاراً لكل مسافر', 'غير قابلة للاسترداد بعد الإصدار', 'حقيبة مسجّلة واحدة 23 كغ + حقيبة يد 7 كغ'],
              rulesEn: ['Changes before departure for USD 80 per traveller', 'Non-refundable once issued', 'One checked bag 23 kg + one cabin bag 7 kg'] },
  standard: { family: 'standard', refundable: true, changeable: true, changeFee: 40, cancelFee: 120, checkedKg: 30, checkedPieces: 1, cabinKg: 7,
              labelAr: 'قياسية — تعديل برسوم مخفّضة، استرداد برسوم', labelEn: 'Standard — reduced change fee, refundable with a fee',
              rulesAr: ['التعديل برسوم 40 دولاراً لكل مسافر', 'الإلغاء والاسترداد برسوم 120 دولاراً لكل مسافر', 'حقيبة مسجّلة 30 كغ + حقيبة يد 7 كغ'],
              rulesEn: ['Changes for USD 40 per traveller', 'Cancellation refunded less USD 120 per traveller', 'One checked bag 30 kg + one cabin bag 7 kg'] },
  flex:     { family: 'flex', refundable: true, changeable: true, changeFee: 0, cancelFee: 0, checkedKg: 30, checkedPieces: 2, cabinKg: 10,
              labelAr: 'مرنة — تعديل واسترداد بلا رسوم', labelEn: 'Flex — free changes and refunds',
              rulesAr: ['تعديل مجاني قبل المغادرة', 'استرداد كامل عند الإلغاء قبل المغادرة', 'حقيبتان مسجّلتان 30 كغ + حقيبة يد 10 كغ'],
              rulesEn: ['Free changes before departure', 'Full refund if cancelled before departure', 'Two checked bags 30 kg + one cabin bag 10 kg'] },
};
const CABIN_FACTOR = { economy: 1, premium: 1.6, business: 2.8, first: 4.2 };

// ---- deterministic randomness --------------------------------------------
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const pad = (n) => String(n).padStart(2, '0');
const at = (date, minutes) => { const d = new Date(`${date}T00:00:00`); d.setMinutes(d.getMinutes() + minutes); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`; };
const place = (code) => { const l = locationByCode(code); return l ? { code: l.code, cityAr: l.cityAr, cityEn: l.cityEn, airportAr: l.airportAr, airportEn: l.airportEn } : { code, cityAr: code, cityEn: code, airportAr: code, airportEn: code }; };

/** A rough great-circle-ish block time from two codes, seeded so a pair is stable. */
const baseMinutes = (from, to) => 90 + (hash(`${[from, to].sort().join('')}`) % 420);

function makeLeg(r, from, to, date, stops, carrier, n) {
  const direct = baseMinutes(from, to);
  const departMin = 5 * 60 + Math.floor(r() * 17) * 60 + Math.floor(r() * 4) * 15;   // 05:00 – 21:45
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
    id: `DF-${hash(`${request.key}-${n}`).toString(36).toUpperCase().slice(0, 6)}`,
    provider: { id: 'dev-flights', dev: true }, service: 'flights', tripType: request.tripType,
    carrier, legs,
    baggage: { cabinKg: fare.cabinKg, checkedKg: fare.checkedKg, checkedPieces: fare.checkedPieces },
    fare: { family: fare.family, refundable: fare.refundable, changeable: fare.changeable, changeFee: fare.changeFee, cancelFee: fare.cancelFee, labelAr: fare.labelAr, labelEn: fare.labelEn, rulesAr: fare.rulesAr, rulesEn: fare.rulesEn },
    price: { currency: 'USD', perTraveller: { adult: perAdult, child: perChild, infant: perInfant }, base, taxes, fees, total: base + taxes + fees },
    availability: { seatsLeft: 2 + Math.floor(r() * 8) },
    included: [{ ar: 'وجبة على متن الرحلة', en: 'Meal on board' }, { ar: `حقيبة يد ${fare.cabinKg} كغ`, en: `Cabin bag ${fare.cabinKg} kg` },
               { ar: `${fare.checkedPieces === 2 ? 'حقيبتان مسجّلتان' : 'حقيبة مسجّلة'} ${fare.checkedKg} كغ`, en: `${fare.checkedPieces} checked bag${fare.checkedPieces > 1 ? 's' : ''} ${fare.checkedKg} kg` }],
    extras: [
      { id: 'bag', labelAr: 'حقيبة مسجّلة إضافية 23 كغ', labelEn: 'Extra checked bag 23 kg', price: 45, currency: 'USD', perTraveller: true, max: 2 },
      { id: 'seat', labelAr: 'اختيار المقعد', labelEn: 'Seat selection', price: 15, currency: 'USD', perTraveller: true, max: 1 },
      fare.family === 'flex' ? null : { id: 'meal', labelAr: 'وجبة خاصة', labelEn: 'Special meal', price: 0, currency: 'USD', perTraveller: true, max: 1, included: fare.family === 'standard' },
    ].filter(Boolean),
  };
}

const cache = new Map();   // searchId → { request, offers }

/** The nine offers the development supplier returns for a request — deterministic per request, no delay (the style guide renders them). */
export const devOffers = (request) => { const r = rng(hash(request.key)); return Array.from({ length: 9 }, (_, n) => makeOffer(request, n, r)); };

export const DEV_FLIGHTS = registerAdapter({
  id: 'dev-flights', dev: true, mode: 'search', services: ['flights'],
  async search(request) {
    const sw = read('no.dev.search');
    await new Promise((r) => setTimeout(r, sw === 'slow' ? 2500 : 700));
    if (sw === 'error') throw new Error('development supplier: simulated outage');
    const key = request.key;
    const offers = sw === 'empty' ? [] : devOffers(request);
    const searchId = `S-${hash(key + Date.now()).toString(36)}`;
    cache.set(searchId, { request, offers });
    try { sessionStorage.setItem(`no.dev.search.${searchId}`, JSON.stringify({ request, offers })); } catch { /* storage unavailable */ }
    return { offers, meta: { searchId, expiresAt: Date.now() + 20 * 60 * 1000, currency: 'USD' } };
  },
  async offer(searchId, id) {
    const s = cache.get(searchId) ?? readSearch(searchId);
    return s?.offers.find((o) => o.id === id) ?? null;
  },
  async quote(searchId, id) {
    await new Promise((r) => setTimeout(r, 500));
    const offer = await this.offer(searchId, id);
    if (!offer) return { price: null, changed: false, previous: null, unavailable: true };
    const sw = read('no.dev.quote');
    if (sw === 'unavailable') return { price: null, changed: false, previous: null, unavailable: true };
    if (sw === 'changed') { const price = { ...offer.price, taxes: offer.price.taxes + 18, total: offer.price.total + 18 }; return { price, changed: true, previous: offer.price }; }
    return { price: offer.price, changed: false, previous: null };
  },
  async extras(searchId, id) { return (await this.offer(searchId, id))?.extras ?? []; },
  async book(order) {
    await new Promise((r) => setTimeout(r, 900));
    if (read('no.dev.book') === 'error') throw new Error('development supplier: booking could not be created');
    return { reference: devReference('NO'), status: 'confirmed', ticketed: false, service: 'flights',
             messageAr: 'تم تأكيد الحجز مع المزوّد التجريبي. تُصدر التذكرة بعد تأكيد المزوّد الحقيقي.', messageEn: 'Booking confirmed with the development supplier. The ticket is issued once a real supplier confirms.' };
  },
});

function read(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function readSearch(id) { try { const raw = sessionStorage.getItem(`no.dev.search.${id}`); const s = raw ? JSON.parse(raw) : null; if (s) cache.set(id, s); return s; } catch { return null; } }
