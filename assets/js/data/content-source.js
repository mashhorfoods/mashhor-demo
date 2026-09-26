/* ============================================================================
   DATA / CONTENT SOURCE — where the public destinations and offers pages get
   their records. Phase 6 (review 2026-09-25 §7)

   Not connected (no backend configured — the same test the adapter registry
   uses, account/adapters/installed.js): the static registries
   (data/destinations.js, data/offers.js), exactly as before.

   Connected (AUTH_PROVIDER=session-api + API_BASE_URL): the PUBLISHED records
   of the Command Center CMS, from the backend's public GET /content/<kind>
   (backend/content.mjs publicDestinations/publicOffers), already in the
   registries' shapes. The CMS is then authoritative: a record staff have
   unpublished or archived is not listed, and a detail page whose slug isn't
   published shows the not-found state even when a static shell exists for it.

   Fallbacks — the site never breaks because the backend does:
     - the backend can't be reached (network error, timeout, non-2xx, bad
       body) → the static registry (source 'fallback'); a detail page then
       renders its static record when one exists.
     - the CMS has never published a record of that kind (`managed: false`)
       → the static registry (source 'static'), so a fresh deployment is not
       blanked by an empty CMS.

   Each kind is fetched at most once per page load. The source actually used
   is written to <html data-content-destinations|offers="static|cms|fallback">
   for QA and the tests.

   The static route shells (tools/build-routes.mjs) exist only for registry
   slugs, so a CMS record whose slug has no shell links its card to the record's
   booking entry instead of a detail page that would 404.
   ========================================================================= */

import { ENV } from './env.js';
import { DESTINATION_REGISTRY, destinationEntry } from './destinations.js';
import { OFFER_REGISTRY, OFFER_STATUSES, offerEntry } from './offers.js';

export const CONTENT_TIMEOUT_MS = 4000;
export const contentConnected = () => ENV.authProvider === 'session-api' && !!ENV.apiBaseUrl;

const STATIC = { destinations: DESTINATION_REGISTRY, offers: OFFER_REGISTRY };
const SHELLS = { destinations: new Set(DESTINATION_REGISTRY.map((d) => d.slug)), offers: new Set(OFFER_REGISTRY.map((o) => o.slug)) };
const ENTRY = { destinations: destinationEntry, offers: offerEntry };
const pending = new Map();

const mark = (kind, source) => { if (typeof document !== 'undefined') document.documentElement.dataset[`content${kind[0].toUpperCase()}${kind.slice(1)}`] = source; };
const withShell = (kind, item) => (SHELLS[kind].has(item.slug) ? item : { ...item, href: ENTRY[kind](item) });

async function fetchPublished(kind) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTENT_TIMEOUT_MS);
  try {
    // Public and identical for every visitor: no cookies, and the backend's own Cache-Control applies.
    const res = await fetch(`${ENV.apiBaseUrl}/content/${kind}`, { credentials: 'omit', headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) return null;
    const body = await res.json();
    return body && typeof body.managed === 'boolean' && Array.isArray(body.items) ? body : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

/** `{ items, source }` for 'destinations' | 'offers'. Never rejects. */
export function contentList(kind) {
  if (!STATIC[kind]) throw new Error(`unknown content kind: ${kind}`);
  if (!pending.has(kind)) {
    pending.set(kind, (async () => {
      let out;
      if (!contentConnected()) out = { items: STATIC[kind], source: 'static' };
      else {
        const body = await fetchPublished(kind);
        if (!body) { console.warn(`[no] ${kind}: content service unreachable, showing the built-in list`); out = { items: STATIC[kind], source: 'fallback' }; }
        else if (!body.managed) out = { items: STATIC[kind], source: 'static' };
        else out = { items: body.items.map((item) => withShell(kind, item)), source: 'cms' };
      }
      mark(kind, out.source);
      return out;
    })());
  }
  return pending.get(kind);
}

export const loadDestinations = async () => (await contentList('destinations')).items;
export const loadOffers = async () => (await contentList('offers')).items;

/** One destination by id or slug, with the offers that point at it — or null when the current source doesn't list it. */
export async function loadDestination(slug) {
  const [dests, offers] = await Promise.all([loadDestinations(), loadOffers()]);
  const record = dests.find((d) => d.id === slug || d.slug === slug);
  return record ? { ...record, offers: offers.filter((o) => o.destination === record.id) } : null;
}

/** One offer by id or slug, with its destination record, status record and the related offers — or null. */
export async function loadOffer(slug) {
  const [offers, dests] = await Promise.all([loadOffers(), loadDestinations()]);
  const offer = offers.find((o) => o.id === slug || o.slug === slug);
  if (!offer) return null;
  return {
    ...offer,
    destinationRecord: offer.destinationRecord ?? dests.find((d) => d.id === offer.destination || d.slug === offer.destination) ?? null,
    statusRecord: OFFER_STATUSES[offer.status] ?? OFFER_STATUSES.request,
    related: offers.filter((o) => o.id !== offer.id).slice(0, 3),
  };
}

/** Test/QA only: forget what this page load fetched. */
export const resetContentSource = () => pending.clear();
