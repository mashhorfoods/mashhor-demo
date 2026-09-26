/* ============================================================================
   SUPERVISOR / ADAPTERS / DEV DATA — the development data stand-in for the
   supervisor portal. ⚠ Development only, this browser only. A small, fixed,
   clearly-labelled dataset (dev: true on every record) so every screen can
   be reviewed before a backend exists — never presented as real customers,
   bookings or revenue. Names are plain identifiers (not Arabic prose), the
   same convention account/adapters/dev-customer.js uses ("Demo Customer"),
   so the English-locale screens stay fully English exactly as a real
   backend's data would (names are data, never translated).

   Mutable state (lead status, notification read flags, the editable
   profile) lives in localStorage, not a module-level variable: each page is
   a full navigation, a fresh module instance, so anything held only in
   memory would silently reset on the very next page load.

   QA switches (sessionStorage): no.dev.supervisor = 'error' | 'slow' | 'empty';
   no.dev.supervisor.bulk = N adds N generated customers, bookings and leads,
   so a list runs past one page (the pager's Load more).
   ========================================================================= */
import { registerSupervisorDataAdapter } from '../data.js';
import { DEV_SUPERVISOR_AUTH } from './dev-supervisor-auth.js';
import { paged as pageSlice } from '../../core/adapter-helpers.js';

const read = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const wait = async () => { await new Promise((r) => setTimeout(r, read('no.dev.supervisor') === 'slow' ? 2000 : 200)); if (read('no.dev.supervisor') === 'error') { const e = new Error('dev outage'); e.code = 'unavailable'; throw e; } };
const isEmpty = () => read('no.dev.supervisor') === 'empty';
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString();

const CUSTOMERS = [
  { id: 'dev-cus-1', name: 'Demo Customer One', email: 'demo1@dev.invalid', phone: '', locale: 'ar', attributionAt: iso(20), createdAt: iso(20), bookingsCount: 2, lastActivityAt: iso(3), dev: true },
  { id: 'dev-cus-2', name: 'Demo Customer Two', email: 'demo2@dev.invalid', phone: '', locale: 'ar', attributionAt: iso(6), createdAt: iso(6), bookingsCount: 1, lastActivityAt: iso(1), dev: true },
];
const BOOKINGS = [
  { id: 'dev-bk-1', customerId: 'dev-cus-1', customerName: 'Demo Customer One', service: 'flights', status: 'confirmed', paymentStatus: 'paid', amount: 900, currency: 'USD', createdAt: iso(3), tripId: 'dev-trip-1', dev: true },
  { id: 'dev-bk-2', customerId: 'dev-cus-1', customerName: 'Demo Customer One', service: 'hotels', status: 'pending', paymentStatus: 'unpaid', amount: 0, currency: 'USD', createdAt: iso(2), tripId: 'dev-trip-1', dev: true },
  { id: 'dev-bk-3', customerId: 'dev-cus-2', customerName: 'Demo Customer Two', service: 'visa', status: 'cancelled', paymentStatus: 'refunded', amount: -120, currency: 'USD', createdAt: iso(1), tripId: null, dev: true },
];
const LEADS = [
  { id: 'dev-lead-1', customerId: null, name: 'Demo Lead One', contact: 'lead@dev.invalid', source: 'link', serviceInterest: 'packages', status: 'new', convertedBookingId: null, createdAt: iso(4), updatedAt: iso(4), dev: true },
  { id: 'dev-lead-2', customerId: 'dev-cus-2', name: 'Demo Customer Two', contact: 'demo2@dev.invalid', source: 'booking', serviceInterest: 'visa', status: 'converted', convertedBookingId: 'dev-bk-3', createdAt: iso(8), updatedAt: iso(1), dev: true },
];
const NOTIFICATIONS = [
  { id: 'dev-ntf-1', kind: 'booking', at: iso(1), read: false, titleAr: 'حجز جديد (تطوير)', titleEn: 'New booking (development)', textAr: 'حجز تجريبي جديد.', textEn: 'A new development booking.', href: null, bookingId: 'dev-bk-1', dev: true },
  { id: 'dev-ntf-2', kind: 'lead', at: iso(4), read: true, titleAr: 'عميل محتمل جديد (تطوير)', titleEn: 'New lead (development)', textAr: 'عميل محتمل تجريبي.', textEn: 'A development lead.', href: null, bookingId: null, dev: true },
];

// no.dev.supervisor.bulk: N generated rows after the fixed ones (a new module per page load, so this runs once).
const BULK = Math.min(500, Math.max(0, Number(read('no.dev.supervisor.bulk')) || 0));
const BULK_LEADS = [];
for (let i = 1; i <= BULK; i++) {
  CUSTOMERS.push({ id: `dev-cus-bulk-${i}`, name: `Demo Customer ${i + 2}`, email: `bulk${i}@dev.invalid`, phone: '', locale: 'ar', attributionAt: iso(30), createdAt: iso(30), bookingsCount: 1, lastActivityAt: iso(10), dev: true });
  BOOKINGS.push({ id: `dev-bk-bulk-${i}`, customerId: `dev-cus-bulk-${i}`, customerName: `Demo Customer ${i + 2}`, service: 'hotels', status: 'pending', paymentStatus: 'unpaid', amount: 0, currency: 'USD', createdAt: iso(10), tripId: null, dev: true });
  BULK_LEADS.push({ id: `dev-lead-bulk-${i}`, customerId: null, name: `Demo Lead ${i + 2}`, contact: `lead${i}@dev.invalid`, source: 'link', serviceInterest: 'hotels', status: 'new', convertedBookingId: null, createdAt: iso(10), updatedAt: iso(10), dev: true });
}

const KEY = 'no.dev.supervisor.data';
const loadState = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? { leads: LEADS, notifications: NOTIFICATIONS }; } catch { return { leads: LEADS, notifications: NOTIFICATIONS }; } };
const saveState = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } };

const paged = (all, params) => pageSlice(all, params, 50);

export const DEV_SUPERVISOR_DATA = registerSupervisorDataAdapter({
  id: 'dev-supervisor-data', dev: true,
  async profile() { await wait(); return DEV_SUPERVISOR_AUTH._current(); },
  async updateProfile(_t, patch) { await wait(); return DEV_SUPERVISOR_AUTH._update(patch); },
  async customers(_t, params = {}) { await wait(); if (isEmpty()) return paged([], params); const search = (params.search ?? '').toLowerCase(); return paged(search ? CUSTOMERS.filter((c) => c.name.toLowerCase().includes(search) || c.email.includes(search)) : CUSTOMERS, params); },
  async customer(_t, id) { await wait(); const c = CUSTOMERS.find((x) => x.id === id); if (!c) return null; return { ...c, attribution: { supervisorId: 'supervisor-1', source: 'link', at: c.attributionAt }, bookings: BOOKINGS.filter((b) => b.customerId === id), trips: [], attributionHistory: [{ supervisorId: 'supervisor-1', previousSupervisorId: null, source: 'link', actor: 'customer', at: c.attributionAt }] }; },
  async bookings(_t, params = {}) { await wait(); if (isEmpty()) return paged([], params); let items = BOOKINGS; if (params.status) items = items.filter((b) => b.status === params.status); if (params.service) items = items.filter((b) => b.service === params.service); return paged(items, params); },
  async booking(_t, id) { await wait(); const b = BOOKINGS.find((x) => x.id === id); return b ? { ...b, detail: { dev: true } } : null; },
  async leads(_t, params = {}) { await wait(); if (isEmpty()) return paged([], params); const all = [...loadState().leads, ...BULK_LEADS]; return paged(params.status ? all.filter((l) => l.status === params.status) : all, params); },
  async updateLeadStatus(_t, id, status) {
    await wait(); const state = loadState(); const l = state.leads.find((x) => x.id === id); if (!l) return null;
    l.status = status; l.updatedAt = new Date().toISOString(); saveState(state); return { ...l };
  },
  async revenue() { await wait(); if (isEmpty()) return { currency: 'USD', gross: 0, completed: 0, pending: 0, cancelled: 0, bookingsCount: 0, commission: { model: null, status: 'pending_business_configuration' } }; return { currency: 'USD', gross: 780, completed: 900, pending: 0, cancelled: -120, bookingsCount: BOOKINGS.length, commission: { model: null, status: 'pending_business_configuration' } }; },
  async performance() { await wait(); if (isEmpty()) return { customers: 0, leads: 0, leadsConverted: 0, conversionRate: null, bookings: 0, bookingsConfirmed: 0, bookingsCancelled: 0 }; const leads = loadState().leads; return { customers: CUSTOMERS.length, leads: leads.length, leadsConverted: leads.filter((l) => l.status === 'converted').length, conversionRate: leads.filter((l) => l.status === 'converted').length / leads.length, bookings: BOOKINGS.length, bookingsConfirmed: BOOKINGS.filter((b) => b.status === 'confirmed').length, bookingsCancelled: BOOKINGS.filter((b) => b.status === 'cancelled').length }; },
  async commissions(_t, params = {}) { await wait(); return { ...paged([], params), model: { model: null, status: 'pending_business_configuration' } }; },
  async notifications() { await wait(); if (isEmpty()) return []; return loadState().notifications.map((n) => ({ ...n })); },
  async markRead(_t, ids = null) {
    await wait(); const state = loadState();
    state.notifications = state.notifications.map((n) => (ids ? (ids.includes(n.id) ? { ...n, read: true } : n) : { ...n, read: true }));
    saveState(state); return state.notifications.map((n) => ({ ...n }));
  },
});
