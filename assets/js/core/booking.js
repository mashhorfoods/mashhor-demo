/* ============================================================================
   CORE / BOOKING — the booking context. Stage 10.9

   Everything a customer types into a booking entry (the homepage widget or
   the /book/ page) becomes ONE plain object, the booking context, before
   anything else happens. Stage 11 consumes that object; nothing here calls
   an API.

     buildContext(vertical, formData, extras)  → context
     validate(vertical, context)               → [{ field, message, index? }]
     saveContext / loadContext                 → sessionStorage, survives the hop
     contextToParams / continueUrl             → the Stage 11 route with the
                                                 context as a query string
     entryUrl(params)                          → the /book/ route with a
                                                 service and prefills
     applyEntryParams(widget, params)          → open a widget on what the
                                                 URL asks for
   ========================================================================= */

import { t, pick, getLocale } from './i18n.js';
import { route } from '../data/config.js';
import { destinationById } from '../data/destinations.js';
import { isActiveSupervisor } from '../data/supervisors.js';

export const CONTEXT_VERSION = 1;
const STORAGE_KEY = 'no.booking.context';
const ATTRIBUTION_KEY = 'no.attribution';
export const MAX_TRAVELLERS = 9;
export const MAX_LEGS = 4;

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const str = (v) => (v == null ? '' : String(v).trim());

/**
 * One flat, serialisable object. Keys are stable — the booking engine will
 * read them — and every field a vertical does not use stays empty rather
 * than absent, so consumers never test for existence.
 */
export function buildContext(vertical, formData, extras = {}) {
  const get = (k) => str(formData.get?.(k));
  const all = (k) => (formData.getAll?.(k) ?? []).map(str);
  const tripType = get('tripType') || (vertical === 'flights' ? 'return' : '');
  // Every leg row the form holds, empty ones included, so validation can
  // point at the row the customer left blank.
  const legs = tripType === 'multi'
    ? all('legFrom').map((from, i) => ({ from, to: all('legTo')[i] ?? '', date: all('legDate')[i] ?? '' }))
    : [];
  return {
    version: CONTEXT_VERSION,
    service: vertical,
    tripType,
    origin: get('from'),
    destination: get('to') || get('destination'),
    legs,
    dates: { depart: get('depart'), return: tripType === 'oneway' ? '' : get('return'), checkin: get('checkin'), checkout: get('checkout') },
    travellers: { adults: num(get('adults'), 1), children: num(get('children')), infants: num(get('infants')) },
    rooms: num(get('rooms'), 0),
    cabin: get('cabin'),
    options: {
      direct: formData.get?.('direct') != null,
      sort: str(extras.sort), offer: str(extras.offer),
      nights: get('nights'), country: get('country'), nationality: get('nationality'),
      service: get('service'), notes: get('notes'),
    },
    // Who brought the customer here (Stage 10.10): the supervisor slug from
    // the current URL, else the one remembered for this session. Later
    // stages read `attribution.supervisor`; nothing is calculated here.
    attribution: { supervisor: str(extras.supervisor) || loadAttribution()?.supervisor || '', source: str(extras.source) || (extras.supervisor ? 'link' : (loadAttribution() ? 'session' : '')) },
    locale: getLocale(),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Customer-facing rules only — nothing about availability. Returns an empty
 * array when the context can continue. `field` names the control to mark;
 * `index` targets a multi-city leg.
 */
export function validate(vertical, ctx) {
  const errors = [];
  const push = (field, key, index) => errors.push({ field, message: t(key), ...(index != null ? { index } : {}) });
  const { travellers: tr } = ctx;

  if (vertical === 'flights') {
    if (ctx.tripType === 'multi') {
      if (ctx.legs.length < 2) push('legFrom', 'book.err.legs', 0);
      ctx.legs.forEach((leg, i) => {
        if (!leg.from) push('legFrom', 'book.err.origin', i);
        if (!leg.to) push('legTo', 'book.err.destination', i);
        if (!leg.date) push('legDate', 'book.err.depart', i);
        if (i > 0 && leg.date && ctx.legs[i - 1].date && leg.date < ctx.legs[i - 1].date) push('legDate', 'book.err.legOrder', i);
      });
    } else {
      if (!ctx.origin) push('from', 'book.err.origin');
      if (!ctx.destination) push('to', 'book.err.destination');
      if (ctx.origin && ctx.destination && ctx.origin.toLowerCase() === ctx.destination.toLowerCase()) push('to', 'book.err.same');
      if (!ctx.dates.depart) push('depart', 'book.err.depart');
      if (ctx.tripType === 'return') {
        if (!ctx.dates.return) push('return', 'book.err.return');
        else if (ctx.dates.depart && ctx.dates.return < ctx.dates.depart) push('return', 'book.err.returnBefore');
      }
    }
  }
  if (vertical === 'hotels') {
    if (!ctx.destination) push('destination', 'book.err.destination');
    if (!ctx.dates.checkin) push('checkin', 'book.err.checkin');
    if (!ctx.dates.checkout) push('checkout', 'book.err.checkout');
    else if (ctx.dates.checkin && ctx.dates.checkout <= ctx.dates.checkin) push('checkout', 'book.err.checkoutBefore');
  }
  if (vertical === 'transport') {
    if (!ctx.origin) push('from', 'book.err.origin');
    if (!ctx.destination) push('to', 'book.err.destination');
    if (!ctx.dates.depart) push('depart', 'book.err.depart');
  }
  // Travellers — every vertical that carries them. Family rules are plain:
  // at least one adult, an infant per adult at most, nine seats in total.
  if (['flights', 'hotels', 'packages', 'umrah', 'medical', 'transport'].includes(vertical)) {
    if (tr.adults < 1) push('pax', 'book.err.adults');
    if (tr.infants > tr.adults) push('pax', 'book.err.infants');
    if (tr.adults + tr.children + tr.infants > MAX_TRAVELLERS) push('pax', 'book.err.max');
  }
  return errors;
}

/* ---- Persistence: the context survives the hop to the next step ---------- */
export function saveContext(ctx) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx)); return true; } catch { return false; }
}
export function loadContext() {
  try { const raw = sessionStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function clearContext() { try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ } }

/* ---- Attribution: which supervisor the customer came through ------------ */
/** Remember a supervisor for this session; only an active registry slug is kept. */
export function saveAttribution(slug, source = 'link') {
  if (!isActiveSupervisor(slug)) return null;
  const record = { supervisor: slug, source, at: new Date().toISOString() };
  try { sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(record)); } catch { /* storage unavailable */ }
  return record;
}
export function loadAttribution() {
  try {
    const raw = sessionStorage.getItem(ATTRIBUTION_KEY);
    const record = raw ? JSON.parse(raw) : null;
    return record && isActiveSupervisor(record.supervisor) ? record : null;
  } catch { return null; }
}
export function clearAttribution() { try { sessionStorage.removeItem(ATTRIBUTION_KEY); } catch { /* storage unavailable */ } }
/** `?supervisor=<slug>` on any door stores the attribution; otherwise the session's. */
export function attributionFrom(params) {
  const slug = params?.get?.('supervisor');
  return (slug && saveAttribution(slug, 'link')) || loadAttribution();
}

/* ---- Routes ------------------------------------------------------------- */
/** Flat query string; stable key names the booking engine reads. */
export function contextToParams(ctx) {
  const p = new URLSearchParams();
  const set = (k, v) => { if (v !== '' && v != null && v !== false && v !== 0) p.set(k, String(v)); };
  set('vertical', ctx.service); set('tripType', ctx.tripType);
  set('from', ctx.origin); set('to', ctx.destination);
  ctx.legs.forEach((l, i) => { set(`leg${i + 1}From`, l.from); set(`leg${i + 1}To`, l.to); set(`leg${i + 1}Date`, l.date); });
  set('depart', ctx.dates.depart); set('return', ctx.dates.return); set('checkin', ctx.dates.checkin); set('checkout', ctx.dates.checkout);
  set('adults', ctx.travellers.adults); set('children', ctx.travellers.children); set('infants', ctx.travellers.infants);
  set('rooms', ctx.rooms); set('cabin', ctx.cabin);
  if (ctx.options.direct) p.set('direct', '1');
  for (const k of ['sort', 'offer', 'nights', 'country', 'nationality', 'service', 'notes']) set(k, ctx.options[k]);
  set('supervisor', ctx.attribution?.supervisor);
  set('locale', ctx.locale);
  return p;
}
/** Where "continue" goes: the Stage 11 search/results route. */
export const continueUrl = (ctx) => `${route('search/')}?${contextToParams(ctx).toString()}`;
/** Where every "book / request" door on the site goes: the booking entry. */
export const entryUrl = (params) => `${route('book/')}?${params instanceof URLSearchParams ? params.toString() : new URLSearchParams(params).toString()}`;

/**
 * Open a search widget on what the URL asks for: ?vertical=… selects the
 * service, ?service=… preselects the "other services" option, ?to=<slug>
 * prefills the destination in the traveller's language. Returns what it
 * applied so the page can carry the rest (the offer id) onward.
 */
export function applyEntryParams(widget, params) {
  // Attribution is stored even when no vertical is asked for: a profile's
  // plain "start booking" link carries only the supervisor.
  const attribution = attributionFrom(params);
  const vertical = params.get('vertical');
  if (!vertical || !widget.no.select(vertical)) return attribution ? { vertical: null, offer: '', sort: '', supervisor: attribution.supervisor } : null;
  const form = widget.querySelector('.c-search__form:not([hidden])');
  const option = params.get('service');
  if (option) { const sel = form?.querySelector('select[name="service"]'); if (sel) sel.value = option; }
  const to = params.get('to');
  if (to) {
    const dest = destinationById(to);
    const input = form?.querySelector('input[name="to"], input[name="destination"]');
    if (dest && input) input.value = pick(dest, 'name');
  }
  return { vertical, offer: params.get('offer') ?? '', sort: params.get('sort') ?? '', supervisor: attribution?.supervisor ?? '' };
}

/* ---- Human summary of a context (the "review" card) ---------------------- */
export function summariseTravellers(tr) {
  const parts = [];
  if (tr.adults) parts.push(t('pax.count.adults', tr.adults));
  if (tr.children) parts.push(t('pax.count.children', tr.children));
  if (tr.infants) parts.push(t('pax.count.infants', tr.infants));
  return parts.join(' · ') || t('pax.summary', 0);
}
