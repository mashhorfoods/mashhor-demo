/* ============================================================================
   CORE / ADAPTER HELPERS — the small response- and request-shaping pieces the
   portal data adapters (account, supervisor, ops; api-* and dev-*) share.
   ========================================================================= */
import { ApiError } from './api.js';

/** The array in a list response: the response itself, `data[key]`, or `data.items`. */
export const list = (data, key) => (Array.isArray(data) ? data : data?.[key] ?? data?.items ?? []);

/** `?a=1&b=2` from the set (non-null, non-empty) params, or '' when there are none. */
export const queryString = (params = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') p.set(k, String(v));
  const s = p.toString(); return s ? `?${s}` : '';
};

/** A paged response normalised to { items, page, pageSize, total, nextPage }, each item through `mapItem`. */
export const pageOf = (data, mapItem, request = {}, defaultSize = 20) => ({
  items: list(data, 'items').map(mapItem),
  page: data?.page ?? request.page ?? 1, pageSize: data?.pageSize ?? request.pageSize ?? defaultSize,
  total: data?.total ?? null, nextPage: data?.nextPage ?? null,
});

/** A development adapter's page of an in-memory list, in the same shape (page size capped at `maxSize`). */
export const paged = (all, { page = 1, pageSize = 20 } = {}, maxSize = 100) => {
  const size = Math.min(maxSize, Math.max(1, pageSize)); const p = Math.max(1, page);
  return { items: all.slice((p - 1) * size, p * size), page: p, pageSize: size, total: all.length, nextPage: p * size < all.length ? p + 1 : null };
};

/** The data adapter a production build registers when no backend is configured: every call is 'notConfigured'. */
export function notConnectedData(methods) {
  const fail = async () => { throw new ApiError('notConfigured'); };
  return { id: 'not-connected', dev: false, ...Object.fromEntries(methods.map((m) => [m, fail])) };
}
