/* ============================================================================
   ACCOUNT / ADAPTERS / API CUSTOMER — the production customer-data adapter.

   Every method is one request under /me: the backend reads its session
   cookie, resolves the customer, and answers only from that customer's
   records — a URL id from someone else's account is a 404 to the backend
   and "not found" here. Responses are normalised to the shapes customer.js
   documents; provider or database fields never reach a screen.

   Status: IMPLEMENTED against the contract, NOT CONNECTED until a backend
   exists at API_BASE_URL (see installed.js).
   ========================================================================= */

import { registerCustomerAdapter } from '../customer.js';
import { get, post, patch, del, upload, ApiError } from '../../core/api.js';
import { ENV } from '../../data/env.js';

const notFoundNull = async (p) => { try { return await p; } catch (e) { if (e?.code === 'notFound') return null; throw e; } };
const list = (data, key) => (Array.isArray(data) ? data : data?.[key] ?? data?.items ?? []);

const nCustomer = (c) => ({ id: c.id, name: c.name ?? '', email: c.email ?? '', phone: c.phone ?? '', locale: c.locale ?? 'ar', image: c.image ?? null, supervisorId: c.supervisorId ?? c.attribution?.supervisorId ?? null, attribution: c.attribution ?? null, acceptance: c.acceptance ?? null, createdAt: c.createdAt ?? null });
const nTrip = (t) => ({ id: t.id, customerId: t.customerId, titleAr: t.titleAr ?? t.title ?? '', titleEn: t.titleEn ?? t.title ?? '', destination: t.destination ?? { code: '', cityAr: '', cityEn: '', countryAr: '', countryEn: '' }, startDate: t.startDate ?? null, endDate: t.endDate ?? null, services: t.services ?? [], status: t.status ?? 'upcoming', bookingIds: t.bookingIds ?? [], travellers: t.travellers ?? null, supervisorId: t.supervisorId ?? null, createdAt: t.createdAt ?? null, needsPayment: !!t.needsPayment });
const nBooking = (b) => ({ id: b.id, customerId: b.customerId, tripId: b.tripId ?? null, service: b.service, status: b.status ?? 'pending', paymentStatus: b.paymentStatus ?? 'unpaid', amount: Number(b.amount ?? 0), currency: b.currency ?? 'USD', supervisorId: b.supervisorId ?? null, ticketed: !!b.ticketed, createdAt: b.createdAt ?? null, detail: b.detail ?? {} });
const nDocument = (d) => ({ id: d.id, bookingId: d.bookingId ?? null, tripId: d.tripId ?? null, type: d.type ?? 'customer', kind: d.kind ?? (d.type === 'customer' ? 'customer' : 'issued'), status: d.status ?? 'available', issuedAt: d.issuedAt ?? d.createdAt ?? null, title: d.title ?? null, size: d.size ?? null, contentType: d.contentType ?? null, deletable: !!d.deletable });
const nPayment = (p) => ({ id: p.id, bookingId: p.bookingId ?? null, at: p.at ?? p.createdAt ?? null, amount: Number(p.amount ?? 0), currency: p.currency ?? '', status: p.status ?? 'pending', reference: p.reference ?? '', methodAr: p.methodAr ?? p.method ?? '', methodEn: p.methodEn ?? p.method ?? '' });
const nNotification = (n) => ({ id: n.id, kind: n.kind ?? 'booking', at: n.at ?? n.createdAt ?? null, read: !!n.read, titleAr: n.titleAr ?? n.title ?? '', titleEn: n.titleEn ?? n.title ?? '', textAr: n.textAr ?? n.text ?? '', textEn: n.textEn ?? n.text ?? '', href: n.href ?? null, bookingId: n.bookingId ?? null });
const nTraveller = (t) => ({ id: t.id, firstName: t.firstName ?? '', lastName: t.lastName ?? '', dob: t.dob ?? '', gender: t.gender ?? '', nationality: t.nationality ?? '', passport: t.passport ?? '', passportExpiry: t.passportExpiry ?? '' });
const nPage = (data, page) => ({ items: list(data, 'items').map(nPayment), page: data?.page ?? page.page ?? 1, pageSize: data?.pageSize ?? page.pageSize ?? ENV.paymentApi?.pageSize ?? 20, total: data?.total ?? null, nextPage: data?.nextPage ?? null });

export const API_CUSTOMER = registerCustomerAdapter({
  id: 'api-customer', dev: false, provider: 'customer backend API', configSource: 'API_BASE_URL', capabilities: ['profile', 'trips', 'bookings', 'travellers', 'documents', 'documents.upload', 'documents.signedUrl', 'documents.delete', 'payments.paged', 'notifications', 'legal.acceptance', 'bookings.claim'],
  async profile() { const d = await get('/me'); return nCustomer(d.customer ?? d); },
  async updateProfile(_m, p) { const data = await patch('/me', { name: p.name, phone: p.phone, locale: p.locale }); return nCustomer(data.customer ?? data); },
  async trips() { return list(await get('/me/trips'), 'trips').map(nTrip); },
  async trip(_m, id) { const t = await notFoundNull(get(`/me/trips/${encodeURIComponent(id)}`)); return t ? { ...nTrip(t.trip ?? t), bookings: list(t.bookings ?? t.trip?.bookings, 'bookings').map(nBooking), documents: list(t.documents ?? [], 'documents').map(nDocument), payments: list(t.payments ?? [], 'payments').map(nPayment) } : null; },
  async bookings() { return list(await get('/me/bookings'), 'bookings').map(nBooking); },
  async booking(_m, id) { const b = await notFoundNull(get(`/me/bookings/${encodeURIComponent(id)}`)); return b ? { ...nBooking(b.booking ?? b), trip: b.trip ? nTrip(b.trip) : null, documents: list(b.documents ?? [], 'documents').map(nDocument), payments: list(b.payments ?? [], 'payments').map(nPayment) } : null; },
  async documents() { const data = await get('/me/documents'); return list(data, 'documents').map((d) => ({ ...nDocument(d), booking: d.booking ? nBooking(d.booking) : null, trip: d.trip ? nTrip(d.trip) : null })); },
  async uploadDocument(_m, { file, title, type = 'customer' }) {
    const limit = ENV.documentService?.maxBytes ?? Infinity; const accept = ENV.documentService?.accept ?? [];
    if (file.size > limit) throw new ApiError('tooLarge'); if (accept.length && !accept.includes(file.type)) throw new ApiError('unsupported');
    const form = new FormData(); form.append('file', file, file.name); form.append('title', title ?? file.name); form.append('type', type);
    const data = await upload('/me/documents', form); return nDocument(data.document ?? data);
  },
  async documentUrl(_m, id) { const data = await get(`/me/documents/${encodeURIComponent(id)}/url`); if (!/^https:\/\//.test(data?.url ?? '') && ENV.environment === 'production') throw new ApiError('invalid'); return { url: data.url, expiresAt: data.expiresAt ?? null }; },
  async deleteDocument(_m, id) { await del(`/me/documents/${encodeURIComponent(id)}`); return true; },
  async payments(_m, page = { page: 1 }) { const size = page.pageSize ?? ENV.paymentApi?.pageSize ?? 20; const data = await get(`/me/payments?page=${encodeURIComponent(page.page ?? 1)}&pageSize=${encodeURIComponent(size)}`); const out = nPage(data, { ...page, pageSize: size }); out.items = out.items.map((p) => ({ ...p, booking: list(data, 'items').find((x) => x.id === p.id)?.booking ? nBooking(list(data, 'items').find((x) => x.id === p.id).booking) : null })); return out; },
  async notifications() { return list(await get('/me/notifications'), 'notifications').map(nNotification); },
  async markRead(_m, ids = null) { const data = await post('/me/notifications/read', ids ? { ids } : { all: true }); return list(data, 'notifications').map(nNotification); },
  async travellers() { return list(await get('/me/travellers'), 'travellers').map(nTraveller); },
  async saveTraveller(_m, t) { const body = { firstName: t.firstName, lastName: t.lastName, dob: t.dob, gender: t.gender, nationality: t.nationality, passport: t.passport, passportExpiry: t.passportExpiry }; const data = t.id ? await patch(`/me/travellers/${encodeURIComponent(t.id)}`, body) : await post('/me/travellers', body); return nTraveller(data.traveller ?? data); },
  async deleteTraveller(_m, id) { await del(`/me/travellers/${encodeURIComponent(id)}`); return true; },
  async claimBooking(_m, journey) {
    const b = journey?.booking; if (!b?.reference) return null;
    const data = await post('/me/bookings/claim', { reference: b.reference, context: journey.context, offer: journey.selection?.offer ?? null, travellers: journey.travellers ?? null, contact: journey.contact ?? null, extras: journey.extras ?? [], payment: journey.payment ? { status: journey.payment.status, transactionId: journey.payment.transactionId ?? null } : null, attribution: journey.context?.attribution ?? null });
    return nBooking(data.booking ?? data);
  },
  async recordAcceptance(_m, acceptance) { await post('/me/legal/acceptance', acceptance); return true; },
});
