/* ============================================================================
   BOOKING / SEARCH — context → request → adapter → results. Stage 11
   ========================================================================= */

import { adapterFor } from './adapters/index.js';
import { resolveLocation } from './locations.js';
import { startSearch, setResults } from './journey.js';

/**
 * Translate the booking context into a supplier-neutral request. Places are
 * resolved to codes here — from the code the field selected, else from the
 * text the customer typed. An unresolved place is reported, not guessed.
 * @returns {{ request, errors: [{ field, key }] }}
 */
export function toSearchRequest(ctx) {
  const errors = [];
  const resolve = (code, text, field) => {
    const loc = (code && resolveLocation(code)) || resolveLocation(text);
    if (!loc) errors.push({ field, key: 'bk.err.unknownPlace', text });
    return loc?.code ?? null;
  };
  let legs = [];
  if (ctx.tripType === 'multi') {
    legs = (ctx.legs ?? []).map((l, i) => ({ from: resolve(l.fromCode, l.from, `legFrom:${i}`), to: resolve(l.toCode, l.to, `legTo:${i}`), date: l.date }));
  } else {
    const from = resolve(ctx.originCode, ctx.origin, 'from'); const to = resolve(ctx.destinationCode, ctx.destination, 'to');
    legs = [{ from, to, date: ctx.dates.depart }];
    if (ctx.tripType === 'return' && ctx.dates.return) legs.push({ from: to, to: from, date: ctx.dates.return });
  }
  const request = {
    service: ctx.service, tripType: ctx.tripType, legs, cabin: ctx.cabin || 'economy',
    travellers: { adults: ctx.travellers?.adults ?? 1, children: ctx.travellers?.children ?? 0, infants: ctx.travellers?.infants ?? 0 },
    options: ctx.options ?? {}, locale: ctx.locale,
  };
  request.key = JSON.stringify([request.service, request.tripType, legs, request.cabin, request.travellers]);
  return { request, errors };
}

/** Run (or re-run) the search for a context; the journey stores the results. */
export async function runSearch(ctx) {
  const adapter = adapterFor(ctx.service);
  const { request, errors } = toSearchRequest(ctx);
  ctx.mode = adapter.mode;
  startSearch(ctx, request);
  if (adapter.mode === 'request') { setResults([], { searchId: null, expiresAt: null, currency: null, mode: 'request' }); return { offers: [], meta: { mode: 'request' }, adapter, errors: [] }; }
  if (errors.length) return { offers: null, meta: null, adapter, errors };
  const { offers, meta } = await adapter.search(request);
  setResults(offers, { ...meta, mode: 'search', dev: adapter.dev });
  return { offers, meta, adapter, errors: [] };
}
