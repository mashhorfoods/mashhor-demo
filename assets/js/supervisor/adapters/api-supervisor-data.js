/* ============================================================================
   SUPERVISOR / ADAPTERS / API DATA — the production data adapter for the
   supervisor portal. Every method is one request under /supervisor/me: the
   backend reads its own session cookie (never the customer's), resolves the
   supervisor, and answers only from records currently attributed to them —
   a foreign customer, booking or lead id is a 404 here exactly as it is on
   /me for a customer.

   Status: IMPLEMENTED against the contract, NOT CONNECTED until a backend
   exists at API_BASE_URL (see adapters/installed.js).
   ========================================================================= */
import { registerSupervisorDataAdapter } from '../data.js';
import { get, patch, post } from '../../core/api.js';

const list = (data, key) => (Array.isArray(data) ? data : data?.[key] ?? data?.items ?? []);
const nPage = (data, mapItem, page) => ({ items: list(data, 'items').map(mapItem), page: data?.page ?? page.page ?? 1, pageSize: data?.pageSize ?? page.pageSize ?? 20, total: data?.total ?? null, nextPage: data?.nextPage ?? null });
const nCustomerRow = (c) => ({ id: c.id, name: c.name ?? '', email: c.email ?? '', phone: c.phone ?? '', locale: c.locale ?? 'ar', attributionAt: c.attributionAt ?? null, createdAt: c.createdAt ?? null, bookingsCount: c.bookingsCount ?? 0, lastActivityAt: c.lastActivityAt ?? null });
const nBookingRow = (b) => ({ id: b.id, customerId: b.customerId, customerName: b.customerName ?? '', service: b.service, status: b.status ?? 'pending', paymentStatus: b.paymentStatus ?? 'unpaid', amount: Number(b.amount ?? 0), currency: b.currency ?? 'USD', createdAt: b.createdAt ?? null, tripId: b.tripId ?? null });
const nLead = (l) => ({ id: l.id, customerId: l.customerId ?? null, name: l.name ?? '', contact: l.contact ?? '', source: l.source ?? '', serviceInterest: l.serviceInterest ?? null, status: l.status ?? 'new', convertedBookingId: l.convertedBookingId ?? null, createdAt: l.createdAt ?? null, updatedAt: l.updatedAt ?? null });
const nCommission = (c) => ({ id: c.id, bookingId: c.bookingId, amount: c.amount ?? null, currency: c.currency ?? null, status: c.status ?? 'pending_configuration', period: c.period ?? null, createdAt: c.createdAt ?? null });
const nNotification = (n) => ({ id: n.id, kind: n.kind ?? 'booking', at: n.at ?? null, read: !!n.read, titleAr: n.titleAr ?? '', titleEn: n.titleEn ?? '', textAr: n.textAr ?? '', textEn: n.textEn ?? '', href: n.href ?? null, bookingId: n.bookingId ?? null });
const q = (params = {}) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v != null && v !== '') p.set(k, String(v)); const s = p.toString(); return s ? `?${s}` : ''; };

export const API_SUPERVISOR_DATA = registerSupervisorDataAdapter({
  id: 'api-supervisor-data', dev: false, provider: 'customer backend API', configSource: 'API_BASE_URL',
  capabilities: ['profile', 'customers', 'bookings', 'leads', 'leads.update', 'revenue', 'performance', 'commissions', 'notifications'],
  async profile() { const d = await get('/supervisor/me'); return d.supervisor; },
  async updateProfile(_t, p) { const d = await patch('/supervisor/me', p); return d.supervisor; },
  async customers(_t, params = {}) { const d = await get(`/supervisor/me/customers${q(params)}`); return nPage(d, nCustomerRow, params); },
  async customer(_t, id) { try { const d = await get(`/supervisor/me/customers/${encodeURIComponent(id)}`); return d.customer; } catch (e) { if (e?.code === 'notFound') return null; throw e; } },
  async bookings(_t, params = {}) { const d = await get(`/supervisor/me/bookings${q(params)}`); return nPage(d, nBookingRow, params); },
  async booking(_t, id) { try { const d = await get(`/supervisor/me/bookings/${encodeURIComponent(id)}`); return d.booking; } catch (e) { if (e?.code === 'notFound') return null; throw e; } },
  async leads(_t, params = {}) { const d = await get(`/supervisor/me/leads${q(params)}`); return nPage(d, nLead, params); },
  async updateLeadStatus(_t, id, status) { const d = await patch(`/supervisor/me/leads/${encodeURIComponent(id)}`, { status }); return nLead(d.lead); },
  async revenue(_t, { period: p } = {}) { return get(`/supervisor/me/revenue${q({ period: p })}`); },
  async performance(_t, { period: p } = {}) { return get(`/supervisor/me/performance${q({ period: p })}`); },
  async commissions(_t, params = {}) { const d = await get(`/supervisor/me/commissions${q(params)}`); return { ...nPage(d, nCommission, params), model: d.model ?? { model: null, status: 'pending_business_configuration' } }; },
  async notifications() { const d = await get('/supervisor/me/notifications'); return list(d, 'notifications').map(nNotification); },
  async markRead(_t, ids = null) { const d = await post('/supervisor/me/notifications/read', ids ? { ids } : { all: true }); return list(d, 'notifications').map(nNotification); },
});
