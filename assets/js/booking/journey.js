/* ============================================================================
   BOOKING / JOURNEY — one persisted state for the whole booking. Stage 11

   The booking context of Stage 10.9 stays what it is (core/booking.js);
   the journey wraps it with everything the steps add — the search, the
   selection, travellers, contact, extras, the quoted price, payment and the
   booking — in ONE sessionStorage record, so a refresh, a back button or a
   failed payment never loses a keystroke. Each step declares what it needs;
   `guard()` tells the page whether to draw or to show the recovery state.
   ========================================================================= */

import './adapters/installed.js';
import { saveContext, loadAttribution } from '../core/booking.js';
import { route } from '../data/config.js';

const KEY = 'no.journey';
export const SEARCH_TTL_MS = 20 * 60 * 1000;

export const STEPS = [
  { id: 'search',       path: 'search/',               label: 'bk.step.search' },
  { id: 'details',      path: 'booking/details/',      label: 'bk.step.details' },
  { id: 'travellers',   path: 'booking/travellers/',   label: 'bk.step.travellers' },
  { id: 'extras',       path: 'booking/extras/',       label: 'bk.step.extras' },
  { id: 'review',       path: 'booking/review/',       label: 'bk.step.review' },
  { id: 'payment',      path: 'booking/payment/',      label: 'bk.step.payment' },
  { id: 'confirmation', path: 'booking/confirmation/', label: 'bk.step.confirmation' },
];
export const stepUrl = (id) => route(STEPS.find((s) => s.id === id)?.path ?? 'book/');

const blank = () => ({ version: 1, context: null, search: null, selection: null, travellers: null, contact: null, extras: [], quote: null, payment: null, booking: null, updatedAt: null });

export function loadJourney() {
  try { const raw = sessionStorage.getItem(KEY); return raw ? { ...blank(), ...JSON.parse(raw) } : blank(); } catch { return blank(); }
}
export function saveJourney(j) {
  j.updatedAt = new Date().toISOString();
  try { sessionStorage.setItem(KEY, JSON.stringify(j)); } catch { /* storage unavailable */ }
  return j;
}
export const update = (patch) => saveJourney({ ...loadJourney(), ...patch });

/** A new search invalidates everything downstream of it. */
export function startSearch(context, request) {
  saveContext(context);
  return saveJourney({ ...blank(), context, search: { request, results: null, meta: null, at: Date.now() } });
}
export const setResults = (offers, meta) => { const j = loadJourney(); j.search = { ...j.search, results: offers, meta, at: Date.now() }; return saveJourney(j); };
export const searchExpired = (j = loadJourney()) => !!j.search?.at && (Date.now() - j.search.at > SEARCH_TTL_MS);
export const selectOffer = (offer) => update({ selection: { offer, searchId: loadJourney().search?.meta?.searchId ?? null, at: Date.now() }, travellers: null, contact: null, extras: [], quote: null, payment: null, booking: null });
export const setTravellers = (travellers, contact) => update({ travellers, contact, draft: null });
export const setExtras = (extras) => update({ extras });
export const setQuote = (quote) => update({ quote });
export const setPayment = (payment) => update({ payment });
export const setBooking = (booking) => update({ booking });

/** The attribution that must survive the whole journey: from the context first, else the session. */
export const attributionOf = (j = loadJourney()) => j.context?.attribution?.supervisor ? j.context.attribution : (loadAttribution() ? { supervisor: loadAttribution().supervisor, source: loadAttribution().source } : null);

/**
 * What a step needs before it can draw. Returns null when the page may
 * proceed, else { reason, back } for the recovery state.
 */
export function guard(step, j = loadJourney()) {
  const need = (cond, reason, back) => (cond ? null : { reason, back });
  // A booking already made is final: every earlier step points at the confirmation, never at a second charge.
  if (j.booking && step !== 'confirmation') return { reason: 'booked', back: 'confirmation' };
  switch (step) {
    case 'search':       return need(!!j.context, 'noContext', 'book');
    case 'details':      return need(!!j.context, 'noContext', 'book') ?? need(!!j.search?.results, 'noSearch', 'search') ?? need(!searchExpired(j), 'expired', 'search');
    case 'travellers':   return need(!!j.context, 'noContext', 'book') ?? need(!!j.selection || j.context?.mode === 'request', 'noSelection', 'search');
    case 'extras':       return guard('travellers', j) ?? need(!!j.travellers, 'noTravellers', 'travellers');
    case 'review':       return guard('travellers', j) ?? need(!!j.travellers, 'noTravellers', 'travellers');
    case 'payment':      return guard('review', j) ?? need(!!j.quote || j.context?.mode === 'request', 'noQuote', 'review');
    case 'confirmation': return need(!!j.booking, 'noBooking', 'search');
    default: return null;
  }
}
