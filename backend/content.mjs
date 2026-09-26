// ============================================================================
// BACKEND / CONTENT — Command Center CMS. Destinations and Offers as real,
// admin-manageable entities — genuinely absent before Phase 2A: both were pure
// hardcoded frontend registries (assets/js/data/destinations.js, offers.js)
// with no backend representation at all. Field shapes mirror those registries'
// own documented contracts so a later phase can feed the public pages from
// here without a reshape; that wiring does not happen here — the public site
// stays on its static registries (Phase 2 scope decision: static site + a
// staff-only preview route, not a live backend-driven public page).
//
// Phase 2B-i adds the draft → published → archived lifecycle on top of
// Phase 2A's plain `active` boolean (removed by migration 009 — publish_status
// is now the only lifecycle field). Editing an already-published item never
// silently touches its publish state: publishedAt only moves when a caller
// explicitly requests the 'published' transition, so a live page keeps
// showing its current content — flagged elsewhere as "unpublished changes" —
// until someone deliberately republishes it (Phase 2 scope decision).
// ============================================================================
import { hex, HttpError, str, strArr, isSlug, imageJson } from './http.mjs';
import { q, now, J, pageQuery, whereClause } from './db.mjs';
import { audit } from './staff.mjs';

// Region/purpose/category/service ids are sanitised (http.mjs strArr), not checked against a closed vocabulary:
// those lists live in the frontend registries.
const ids = (v) => strArr(v, 12, 40);
const isValidSlug = (slug) => isSlug(slug, 60);

/* ---- draft/publish state machine, shared by both entities below ---- */
const PUBLISH_TRANSITIONS = { draft: ['published', 'archived'], published: ['draft', 'archived'], archived: ['draft'] };
/** Resolves the next publish_status/published_at pair for a patch, or throws 422 for an illegal transition. A
    request that doesn't ask for a transition (publishStatus omitted, or equal to the current one) is a no-op here
    — the caller's own content patch still applies, publish state just doesn't move. `hasContent` gates the one
    real rule: nothing goes live with no name/title in either language. */
function resolvePublishStatus(row, patch, hasContent, t) {
  if (patch.publishStatus === undefined || patch.publishStatus === row.publish_status) return { publishStatus: row.publish_status, publishedAt: row.published_at };
  if (!PUBLISH_TRANSITIONS[row.publish_status]?.includes(patch.publishStatus)) throw new HttpError(422, 'invalid');
  if (patch.publishStatus === 'published' && !hasContent) throw new HttpError(422, 'invalid');
  // published_at marks the most recent time this item WENT live — it is set once on the transition into
  // 'published' and otherwise left as-is (never cleared on unpublish/archive), so "last published" stays visible.
  return { publishStatus: patch.publishStatus, publishedAt: patch.publishStatus === 'published' ? t : row.published_at };
}
const publishAuditAction = (kind, from, to) => (from === to ? `${kind}.update` : { published: `${kind}.publish`, draft: `${kind}.unpublish`, archived: `${kind}.archive` }[to] ?? `${kind}.update`);

/* ============================================================================
   DESTINATIONS
   ========================================================================= */
function nDestination(d) {
  if (!d) return null;
  const hasUnpublishedChanges = d.publish_status === 'published' && !!d.published_at && d.updated_at > d.published_at;
  return {
    id: d.id, slug: d.slug, region: d.region ?? null, featured: !!d.featured, home: !!d.home, order: d.order_index ?? null,
    publishStatus: d.publish_status, publishedAt: d.published_at ?? null, hasUnpublishedChanges,
    nameAr: d.name_ar ?? null, nameEn: d.name_en ?? null, countryAr: d.country_ar ?? null, countryEn: d.country_en ?? null,
    descAr: d.desc_ar ?? null, descEn: d.desc_en ?? null,
    purposes: J(d.purposes_json, []), services: J(d.services_json, []), image: J(d.image_json, null),
    createdAt: d.created_at, updatedAt: d.updated_at,
  };
}
export const destinationById = (id) => nDestination(q.get('SELECT * FROM destinations WHERE id = ? OR slug = ?', id, id));
export function listDestinations({ search = '', region = '', publishStatus = '', page = 1, pageSize = 20 } = {}) {
  const like = search ? `%${str(search, 120)}%` : '';
  const { sql, params } = whereClause([
    ['(name_ar LIKE ? OR name_en LIKE ? OR slug LIKE ?)', like && [like, like, like]],
    ['region = ?', region], ['publish_status = ?', publishStatus],
  ]);
  const { slice, ...meta } = pageQuery(`destinations ${sql}`, 'order_index IS NULL, order_index, created_at DESC', params, page, pageSize, 100);
  return { items: slice.map(nDestination), ...meta };
}
export function createDestination({ slug, nameAr, nameEn }, actor) {
  if (!isValidSlug(slug)) throw new HttpError(422, 'invalid');
  if (!nameAr && !nameEn) throw new HttpError(422, 'invalid');
  if (q.get('SELECT id FROM destinations WHERE slug = ?', slug)) throw new HttpError(409, 'exists');
  const id = `dst_${hex(8)}`; const t = now();
  q.run('INSERT INTO destinations (id, slug, name_ar, name_en, publish_status, purposes_json, services_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    id, slug, str(nameAr, 120) || null, str(nameEn, 120) || null, 'draft', '[]', '[]', t, t);
  audit(actor, 'destination.create', 'destination', id, { slug });
  return destinationById(id);
}
export function updateDestination(id, patch, actor) {
  const row = q.get('SELECT * FROM destinations WHERE id = ?', id); if (!row) throw new HttpError(404, 'notFound');
  if (patch.slug !== undefined && patch.slug !== row.slug) {
    if (!isValidSlug(patch.slug)) throw new HttpError(422, 'invalid');
    if (q.get('SELECT id FROM destinations WHERE slug = ? AND id != ?', patch.slug, id)) throw new HttpError(409, 'exists');
  }
  const t = now();
  const v = (k, cur, n = 120) => (patch[k] !== undefined ? str(patch[k], n) || null : cur);
  const nameAr = v('nameAr', row.name_ar); const nameEn = v('nameEn', row.name_en);
  const { publishStatus, publishedAt } = resolvePublishStatus(row, patch, !!(nameAr || nameEn), t);
  const featured = patch.featured !== undefined ? (patch.featured ? 1 : 0) : row.featured;
  const home = patch.home !== undefined ? (patch.home ? 1 : 0) : row.home;
  const orderIndex = patch.order !== undefined ? (Number.isFinite(patch.order) ? Math.trunc(patch.order) : null) : row.order_index;
  const purposesJson = patch.purposes !== undefined ? JSON.stringify(ids(patch.purposes)) : row.purposes_json;
  const servicesJson = patch.services !== undefined ? JSON.stringify(ids(patch.services)) : row.services_json;
  const image = patch.image !== undefined ? imageJson(patch.image) : row.image_json;
  q.run(`UPDATE destinations SET slug = ?, region = ?, name_ar = ?, name_en = ?, country_ar = ?, country_en = ?, desc_ar = ?, desc_en = ?,
         purposes_json = ?, services_json = ?, image_json = ?, featured = ?, home = ?, publish_status = ?, published_at = ?, order_index = ?, updated_at = ? WHERE id = ?`,
    v('slug', row.slug, 60), v('region', row.region, 30), nameAr, nameEn,
    v('countryAr', row.country_ar), v('countryEn', row.country_en), v('descAr', row.desc_ar, 300), v('descEn', row.desc_en, 300),
    purposesJson, servicesJson, image, featured, home, publishStatus, publishedAt, orderIndex, t, id);
  audit(actor, publishAuditAction('destination', row.publish_status, publishStatus), 'destination', id, {});
  return destinationById(id);
}

/* ============================================================================
   OFFERS & PACKAGES
   ========================================================================= */
function nOffer(o) {
  if (!o) return null;
  const hasUnpublishedChanges = o.publish_status === 'published' && !!o.published_at && o.updated_at > o.published_at;
  return {
    id: o.id, slug: o.slug, category: o.category ?? null, categories: J(o.categories_json, []), destinationId: o.destination_id ?? null,
    featured: !!o.featured, placeholder: !!o.placeholder, status: o.status, bookingMode: o.booking_mode,
    publishStatus: o.publish_status, publishedAt: o.published_at ?? null, hasUnpublishedChanges,
    titleAr: o.title_ar ?? null, titleEn: o.title_en ?? null, shortAr: o.short_ar ?? null, shortEn: o.short_en ?? null, descAr: o.desc_ar ?? null, descEn: o.desc_en ?? null,
    duration: { nights: o.duration_nights ?? null },
    price: o.price_amount != null ? { amount: o.price_amount, currency: o.price_currency, type: o.price_type, basisAr: o.price_basis_ar, basisEn: o.price_basis_en } : null,
    services: J(o.services_json, []), image: J(o.image_json, null), detail: J(o.detail_json, {}),
    createdAt: o.created_at, updatedAt: o.updated_at,
  };
}
export const OFFER_STATUSES = ['available', 'request', 'soon', 'ended'];
export const offerById = (id) => nOffer(q.get('SELECT * FROM offers WHERE id = ? OR slug = ?', id, id));
export function listOffers({ search = '', category = '', destinationId = '', publishStatus = '', page = 1, pageSize = 20 } = {}) {
  const like = search ? `%${str(search, 120)}%` : '';
  const { sql, params } = whereClause([
    ['(title_ar LIKE ? OR title_en LIKE ? OR slug LIKE ?)', like && [like, like, like]],
    ['category = ?', category], ['destination_id = ?', destinationId], ['publish_status = ?', publishStatus],
  ]);
  const { slice, ...meta } = pageQuery(`offers ${sql}`, 'created_at DESC', params, page, pageSize, 100);
  return { items: slice.map(nOffer), ...meta };
}
export function createOffer({ slug, titleAr, titleEn }, actor) {
  if (!isValidSlug(slug)) throw new HttpError(422, 'invalid');
  if (!titleAr && !titleEn) throw new HttpError(422, 'invalid');
  if (q.get('SELECT id FROM offers WHERE slug = ?', slug)) throw new HttpError(409, 'exists');
  const id = `off_${hex(8)}`; const t = now();
  q.run(`INSERT INTO offers (id, slug, title_ar, title_en, status, booking_mode, publish_status, placeholder, categories_json, services_json, detail_json, created_at, updated_at)
         VALUES (?,?,?,?,'request','request',?,1,?,?,?,?,?)`,
    id, slug, str(titleAr, 120) || null, str(titleEn, 120) || null, 'draft', '[]', '[]', '{}', t, t);
  audit(actor, 'offer.create', 'offer', id, { slug });
  return offerById(id);
}
export function updateOffer(id, patch, actor) {
  const row = q.get('SELECT * FROM offers WHERE id = ?', id); if (!row) throw new HttpError(404, 'notFound');
  if (patch.slug !== undefined && patch.slug !== row.slug) {
    if (!isValidSlug(patch.slug)) throw new HttpError(422, 'invalid');
    if (q.get('SELECT id FROM offers WHERE slug = ? AND id != ?', patch.slug, id)) throw new HttpError(409, 'exists');
  }
  if (patch.destinationId !== undefined && patch.destinationId && !q.get('SELECT id FROM destinations WHERE id = ?', patch.destinationId)) throw new HttpError(422, 'invalid');
  if (patch.status !== undefined && !OFFER_STATUSES.includes(patch.status)) throw new HttpError(422, 'invalid');
  const t = now();
  const v = (k, cur, n = 120) => (patch[k] !== undefined ? str(patch[k], n) || null : cur);
  const titleAr = v('titleAr', row.title_ar); const titleEn = v('titleEn', row.title_en);
  const { publishStatus, publishedAt } = resolvePublishStatus(row, patch, !!(titleAr || titleEn), t);
  const featured = patch.featured !== undefined ? (patch.featured ? 1 : 0) : row.featured;
  const placeholder = patch.placeholder !== undefined ? (patch.placeholder ? 1 : 0) : row.placeholder;
  const categoriesJson = patch.categories !== undefined ? JSON.stringify(ids(patch.categories)) : row.categories_json;
  const servicesJson = patch.services !== undefined ? JSON.stringify(ids(patch.services)) : row.services_json;
  const image = patch.image !== undefined ? imageJson(patch.image) : row.image_json;
  const nights = patch.duration?.nights !== undefined ? (Number.isFinite(patch.duration.nights) ? Math.trunc(patch.duration.nights) : null) : row.duration_nights;
  const price = patch.price !== undefined ? patch.price : undefined;
  const priceAmount = price !== undefined ? (price && Number.isFinite(price.amount) ? price.amount : null) : row.price_amount;
  const priceCurrency = price !== undefined ? (price ? str(price.currency, 10) || null : null) : row.price_currency;
  const priceType = price !== undefined ? (price ? str(price.type, 10) || null : null) : row.price_type;
  const priceBasisAr = price !== undefined ? (price ? str(price.basisAr, 120) || null : null) : row.price_basis_ar;
  const priceBasisEn = price !== undefined ? (price ? str(price.basisEn, 120) || null : null) : row.price_basis_en;
  // detail_json is the raw-JSON-edited catch-all for inclusions/exclusions/itinerary/important/terms/faq/travelPeriod
  // (§ note atop this file) — must be a plain object (never silently coerced from something malformed), never
  // shape-checked field by field beyond that.
  let detailJson = row.detail_json;
  if (patch.detail !== undefined) {
    if (patch.detail === null || typeof patch.detail !== 'object' || Array.isArray(patch.detail)) throw new HttpError(422, 'invalid');
    try { detailJson = JSON.stringify(patch.detail); } catch { throw new HttpError(422, 'invalid'); }
  }
  q.run(`UPDATE offers SET slug = ?, category = ?, categories_json = ?, destination_id = ?, title_ar = ?, title_en = ?, short_ar = ?, short_en = ?, desc_ar = ?, desc_en = ?,
         duration_nights = ?, price_amount = ?, price_currency = ?, price_type = ?, price_basis_ar = ?, price_basis_en = ?, status = ?, booking_mode = ?,
         featured = ?, placeholder = ?, services_json = ?, image_json = ?, detail_json = ?, publish_status = ?, published_at = ?, updated_at = ? WHERE id = ?`,
    v('slug', row.slug, 60), v('category', row.category, 30), categoriesJson, patch.destinationId !== undefined ? (patch.destinationId || null) : row.destination_id,
    titleAr, titleEn, v('shortAr', row.short_ar, 200), v('shortEn', row.short_en, 200), v('descAr', row.desc_ar, 600), v('descEn', row.desc_en, 600),
    nights, priceAmount, priceCurrency, priceType, priceBasisAr, priceBasisEn,
    v('status', row.status, 10), v('bookingMode', row.booking_mode, 10),
    featured, placeholder, servicesJson, image, detailJson, publishStatus, publishedAt, t, id);
  audit(actor, publishAuditAction('offer', row.publish_status, publishStatus), 'offer', id, {});
  return offerById(id);
}
