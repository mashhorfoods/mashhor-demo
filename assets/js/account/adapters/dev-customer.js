/* ============================================================================
   ACCOUNT / ADAPTERS / DEV CUSTOMER — the development customer-data stand-in.

   ⚠ Development only. Trips, bookings, documents, payments and notifications
   for the seeded development customer are generated here and clearly
   labelled on every screen; a customer who signs up starts empty and gains
   records only from bookings made on this site. Everything is scoped by the
   session token → customer id resolved through the auth provider: a screen
   never names a customer, so one customer cannot address another's data.

   A production adapter talks to the backend with the same method names and
   returns the same shapes (see customer.js); it replaces this file in
   installed.js.

   QA switches (sessionStorage):  no.dev.account = 'error' | 'slow' | 'empty'
                                  no.dev.docurl  = 'expired'     (signed links come back already expired)
   ========================================================================= */

import { registerCustomerAdapter } from '../customer.js';
import { authProvider, AuthError } from '../auth.js';
import { DEV_CUSTOMER } from './dev-auth.js';
import { ENV } from '../../data/env.js';
import { ApiError } from '../../core/api.js';

const read = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const wait = async () => { await new Promise((r) => setTimeout(r, read('no.dev.account') === 'slow' ? 2500 : 200)); if (read('no.dev.account') === 'error') throw new Error('development customer data: simulated outage'); };
const key = (id) => `no.dev.customer.${id}`;
const load = (id) => { try { return JSON.parse(localStorage.getItem(key(id)) ?? 'null'); } catch { return null; } };
const save = (id, data) => { try { localStorage.setItem(key(id), JSON.stringify(data)); } catch { /* storage unavailable */ } };
const rand = (n = 6) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
const iso = (d) => d.toISOString();
const day = (offset, h = 9) => { const d = new Date(); d.setUTCHours(h, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d; };
const dateOnly = (offset) => day(offset).toISOString().slice(0, 10);

const empty = () => ({ version: 1, trips: [], bookings: [], travellers: [], documents: [], payments: [], notifications: [], files: {} });

/* ---- The seeded customer's sample records (fictional, labelled dev) ---- */
function seed(customerId) {
  const d = empty();
  const trip = (n, o) => ({ id: `trip-dev-${n}`, customerId, supervisorId: 'ahmed-mohamed', createdAt: iso(day(-60)), ...o });
  const booking = (n, o) => ({ id: `NO-DEV-${n}`, customerId, supervisorId: 'ahmed-mohamed', currency: 'USD', dev: true, ...o });
  d.trips = [
    trip('jed', { titleAr: 'رحلة العائلة إلى جدة', titleEn: 'Family trip to Jeddah', destination: { code: 'JED', cityAr: 'جدة', cityEn: 'Jeddah', countryAr: 'السعودية', countryEn: 'Saudi Arabia' }, startDate: dateOnly(21), endDate: dateOnly(28), services: ['flights', 'hotels', 'visa'], status: 'upcoming', bookingIds: ['NO-DEV-F1JED', 'NO-DEV-H1JED', 'NO-DEV-V1JED'], travellers: 4 }),
    trip('ist', { titleAr: 'إسطنبول', titleEn: 'Istanbul', destination: { code: 'IST', cityAr: 'إسطنبول', cityEn: 'Istanbul', countryAr: 'تركيا', countryEn: 'Türkiye' }, startDate: dateOnly(-40), endDate: dateOnly(-33), services: ['flights', 'hotels'], status: 'completed', bookingIds: ['NO-DEV-F2IST', 'NO-DEV-H2IST'], travellers: 2 }),
    trip('dxb', { titleAr: 'دبي', titleEn: 'Dubai', destination: { code: 'DXB', cityAr: 'دبي', cityEn: 'Dubai', countryAr: 'الإمارات', countryEn: 'UAE' }, startDate: dateOnly(-10), endDate: dateOnly(-6), services: ['flights'], status: 'cancelled', bookingIds: ['NO-DEV-F3DXB'], travellers: 1 }),
  ];
  d.bookings = [
    booking('F1JED', { tripId: 'trip-dev-jed', service: 'flights', status: 'confirmed', paymentStatus: 'paid', amount: 1003, ticketed: true, createdAt: iso(day(-30)), detail: { route: 'KRT → JED → KRT', dates: [dateOnly(21), dateOnly(28)], carrierAr: 'ديف إير (تجريبي)', carrierEn: 'Dev Air (development)', flights: 'DV 100 · DV 101', travellers: 4, cabinAr: 'الاقتصادية', cabinEn: 'Economy' } }),
    booking('H1JED', { tripId: 'trip-dev-jed', service: 'hotels', status: 'pending', paymentStatus: 'unpaid', amount: 0, createdAt: iso(day(-29)), detail: { nights: 7, rooms: 2, checkin: dateOnly(21), checkout: dateOnly(28), noteAr: 'طلب فندق قيد التسعير من مختص السفر والسياحة.', noteEn: 'Hotel request being priced by a Travel & Tourism specialist.' } }),
    booking('V1JED', { tripId: 'trip-dev-jed', service: 'visa', status: 'processing', paymentStatus: 'paid', amount: 320, createdAt: iso(day(-25)), detail: { travellers: 4, noteAr: 'الطلب لدى القنصلية.', noteEn: 'Application with the consulate.' } }),
    booking('F2IST', { tripId: 'trip-dev-ist', service: 'flights', status: 'completed', paymentStatus: 'paid', amount: 1180, ticketed: true, createdAt: iso(day(-70)), detail: { route: 'KRT → IST → KRT', dates: [dateOnly(-40), dateOnly(-33)], carrierAr: 'سامبل إيرويز (تجريبي)', carrierEn: 'Sample Airways (development)', flights: 'SA 210 · SA 211', travellers: 2, cabinAr: 'الاقتصادية', cabinEn: 'Economy' } }),
    booking('H2IST', { tripId: 'trip-dev-ist', service: 'hotels', status: 'completed', paymentStatus: 'paid', amount: 640, createdAt: iso(day(-66)), detail: { nights: 7, rooms: 1, checkin: dateOnly(-40), checkout: dateOnly(-33) } }),
    booking('F3DXB', { tripId: 'trip-dev-dxb', service: 'flights', status: 'cancelled', paymentStatus: 'refunded', amount: 410, createdAt: iso(day(-20)), detail: { route: 'KRT → DXB → KRT', dates: [dateOnly(-10), dateOnly(-6)], carrierAr: 'إكزامبل سكاي (تجريبي)', carrierEn: 'Example Sky (development)', flights: 'EX 120 · EX 121', travellers: 1, cabinAr: 'الاقتصادية', cabinEn: 'Economy' } }),
  ];
  // Only what the (development) booking system actually issued: a ticket for
  // ticketed flights, a receipt for every payment, a confirmation for confirmed bookings.
  const doc = (n, o) => ({ id: `doc-dev-${n}`, customerId, dev: true, ...o });
  d.documents = [
    doc('1', { bookingId: 'NO-DEV-F1JED', tripId: 'trip-dev-jed', type: 'eticket', status: 'available', issuedAt: iso(day(-29)) }),
    doc('2', { bookingId: 'NO-DEV-F1JED', tripId: 'trip-dev-jed', type: 'confirmation', status: 'available', issuedAt: iso(day(-30)) }),
    doc('3', { bookingId: 'NO-DEV-F1JED', tripId: 'trip-dev-jed', type: 'receipt', status: 'available', issuedAt: iso(day(-30)) }),
    doc('4', { bookingId: 'NO-DEV-V1JED', tripId: 'trip-dev-jed', type: 'visa', status: 'pending', issuedAt: null }),
    doc('5', { bookingId: 'NO-DEV-V1JED', tripId: 'trip-dev-jed', type: 'receipt', status: 'available', issuedAt: iso(day(-25)) }),
    doc('6', { bookingId: 'NO-DEV-F2IST', tripId: 'trip-dev-ist', type: 'eticket', status: 'available', issuedAt: iso(day(-69)) }),
    doc('7', { bookingId: 'NO-DEV-F2IST', tripId: 'trip-dev-ist', type: 'receipt', status: 'available', issuedAt: iso(day(-70)) }),
    doc('8', { bookingId: 'NO-DEV-H2IST', tripId: 'trip-dev-ist', type: 'receipt', status: 'available', issuedAt: iso(day(-66)) }),
  ];
  const pay = (n, o) => ({ id: `pay-dev-${n}`, customerId, currency: 'USD', methodAr: 'مزوّد دفع تجريبي', methodEn: 'Development payment provider', dev: true, ...o });
  d.payments = [
    pay('1', { bookingId: 'NO-DEV-F1JED', at: iso(day(-30)), amount: 1003, status: 'paid', reference: 'DEVTX-' + 'A1B2C3' }),
    pay('2', { bookingId: 'NO-DEV-V1JED', at: iso(day(-25)), amount: 320, status: 'paid', reference: 'DEVTX-' + 'D4E5F6' }),
    pay('3', { bookingId: 'NO-DEV-F2IST', at: iso(day(-70)), amount: 1180, status: 'paid', reference: 'DEVTX-' + 'G7H8J9' }),
    pay('4', { bookingId: 'NO-DEV-H2IST', at: iso(day(-66)), amount: 640, status: 'paid', reference: 'DEVTX-' + 'K2L3M4' }),
    pay('5', { bookingId: 'NO-DEV-F3DXB', at: iso(day(-20)), amount: 410, status: 'paid', reference: 'DEVTX-' + 'N5P6Q7' }),
    pay('6', { bookingId: 'NO-DEV-F3DXB', at: iso(day(-15)), amount: -410, status: 'refunded', reference: 'DEVTX-' + 'R8S9T2' }),
  ];
  const note = (n, o) => ({ id: `ntf-dev-${n}`, customerId, dev: true, ...o });
  d.notifications = [
    note('1', { kind: 'document', at: iso(day(-1, 14)), read: false, bookingId: 'NO-DEV-F1JED', titleAr: 'تذكرتك الإلكترونية جاهزة', titleEn: 'Your e-ticket is ready', textAr: 'صدرت تذكرة رحلة جدة NO-DEV-F1JED. تجدها في المستندات.', textEn: 'The ticket for Jeddah booking NO-DEV-F1JED was issued. Find it under documents.', href: 'account/documents/' }),
    note('2', { kind: 'visa', at: iso(day(-2, 11)), read: false, bookingId: 'NO-DEV-V1JED', titleAr: 'طلب التأشيرة قيد المعالجة', titleEn: 'Visa application in progress', textAr: 'أُحيل طلب التأشيرة إلى القنصلية. نخبرك عند صدور القرار.', textEn: 'The visa application went to the consulate. We tell you when there is a decision.', href: 'account/bookings/?id=NO-DEV-V1JED' }),
    note('3', { kind: 'booking', at: iso(day(-3, 16)), read: true, bookingId: 'NO-DEV-H1JED', titleAr: 'طلب الفندق مستلم', titleEn: 'Hotel request received', textAr: 'يعود إليك مختص السفر والسياحة بخيارات الفندق والسعر.', textEn: 'A Travel & Tourism specialist comes back with hotel options and a price.', href: 'account/bookings/?id=NO-DEV-H1JED' }),
    note('4', { kind: 'payment', at: iso(day(-15, 10)), read: true, bookingId: 'NO-DEV-F3DXB', titleAr: 'تم رد المبلغ', titleEn: 'Refund completed', textAr: 'رُدّ مبلغ حجز دبي الملغى إلى طريقة الدفع الأصلية.', textEn: 'The cancelled Dubai booking was refunded to the original payment method.', href: 'account/payments/' }),
    note('5', { kind: 'support', at: iso(day(-20, 9)), read: true, titleAr: 'رد من فريق الدعم', titleEn: 'Reply from support', textAr: 'أُلغي حجز دبي بناءً على طلبك وبدأت إجراءات الاسترداد.', textEn: 'The Dubai booking was cancelled at your request and the refund started.', href: 'account/support/' }),
  ];
  d.travellers = [
    { id: 'trv-dev-1', customerId, firstName: 'Demo', lastName: 'Customer', dob: '1988-04-12', gender: 'M', nationality: 'SD', passport: 'P0000001', passportExpiry: dateOnly(900), dev: true },
    { id: 'trv-dev-2', customerId, firstName: 'Sample', lastName: 'Customer', dob: '1990-09-03', gender: 'F', nationality: 'SD', passport: 'P0000002', passportExpiry: dateOnly(700), dev: true },
  ];
  return d;
}

/** Resolve the token to the customer it belongs to — the only door to any record. */
async function scope(token) {
  const v = token ? await authProvider().verify(token) : null;
  if (!v) throw new AuthError('unauthenticated');
  let data = load(v.customerId);
  if (!data) { data = v.customerId === DEV_CUSTOMER.id && read('no.dev.account') !== 'empty' ? seed(v.customerId) : empty(); save(v.customerId, data); }
  if (read('no.dev.account') === 'empty') data = empty();
  return { customer: v.customer, id: v.customerId, data, commit: () => save(v.customerId, data) };
}
const clone = (x) => JSON.parse(JSON.stringify(x));

export const DEV_CUSTOMER_ADAPTER = registerCustomerAdapter({
  id: 'dev-customer', dev: true,
  async profile(token) { await wait(); return (await scope(token)).customer; },
  async updateProfile(token, patch) { await wait(); await scope(token); return authProvider().updateAccount(token, patch); },

  async trips(token) { await wait(); return clone((await scope(token)).data.trips); },
  async trip(token, id) { await wait(); const { data } = await scope(token); const t = data.trips.find((x) => x.id === id); return t ? clone({ ...t, bookings: data.bookings.filter((b) => b.tripId === t.id), documents: data.documents.filter((d) => d.tripId === t.id), payments: data.payments.filter((p) => data.bookings.some((b) => b.tripId === t.id && b.id === p.bookingId)) }) : null; },
  async bookings(token) { await wait(); return clone((await scope(token)).data.bookings); },
  async booking(token, id) { await wait(); const { data } = await scope(token); const b = data.bookings.find((x) => x.id === id); return b ? clone({ ...b, trip: data.trips.find((t) => t.id === b.tripId) ?? null, documents: data.documents.filter((d) => d.bookingId === b.id), payments: data.payments.filter((p) => p.bookingId === b.id) }) : null; },
  async documents(token) { await wait(); const { data } = await scope(token); return clone(data.documents.map((d) => ({ kind: 'issued', ...d, booking: data.bookings.find((b) => b.id === d.bookingId) ?? null, trip: data.trips.find((t) => t.id === d.tripId) ?? null }))); },
  async payments(token, page = { page: 1 }) {
    await wait(); const { data } = await scope(token);
    const size = page.pageSize ?? ENV.paymentApi?.pageSize ?? 20; const n = Math.max(1, page.page ?? 1);
    const all = [...data.payments].sort((a, b) => String(b.at).localeCompare(String(a.at))).map((p) => ({ ...p, booking: data.bookings.find((b) => b.id === p.bookingId) ?? null }));
    const items = all.slice((n - 1) * size, n * size);
    return clone({ items, page: n, pageSize: size, total: all.length, nextPage: n * size < all.length ? n + 1 : null });
  },
  /* Documents a customer uploads live in this browser (development). The "signed URL" is a data: URL with an expiry the viewer honours. */
  async uploadDocument(token, { file, title, type = 'customer' }) {
    await wait(); const s = await scope(token);
    const limit = Math.min(ENV.documentService?.maxBytes ?? Infinity, 1024 * 1024); const accept = ENV.documentService?.accept ?? [];
    if (!file) throw new ApiError('invalid'); if (file.size > limit) throw new ApiError('tooLarge'); if (accept.length && !accept.includes(file.type)) throw new ApiError('unsupported');
    const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new ApiError('failed')); r.readAsDataURL(file); });
    const doc = { id: `doc-${rand()}`, customerId: s.id, bookingId: null, tripId: null, type, kind: 'customer', status: 'available', issuedAt: new Date().toISOString(), title: String(title || file.name).slice(0, 120), size: file.size, contentType: file.type, deletable: true, dev: true };
    s.data.documents.push(doc); s.data.files = { ...(s.data.files ?? {}), [doc.id]: dataUrl }; s.commit();
    return clone(doc);
  },
  async documentUrl(token, id) {
    await wait(); const { data } = await scope(token);
    const doc = data.documents.find((d) => d.id === id); if (!doc || doc.status !== 'available') throw new ApiError('notFound');
    const expired = read('no.dev.docurl') === 'expired';
    const expiresAt = new Date(Date.now() + (expired ? -1000 : 5 * 60 * 1000)).toISOString();
    // Issued documents are rendered from booking data (the viewer builds them); uploads come back as the stored file.
    return { url: data.files?.[id] ?? null, expiresAt, rendered: !data.files?.[id] };
  },
  async deleteDocument(token, id) {
    await wait(); const s = await scope(token);
    const doc = s.data.documents.find((d) => d.id === id); if (!doc) throw new ApiError('notFound'); if (!doc.deletable) throw new ApiError('forbidden');
    s.data.documents = s.data.documents.filter((d) => d.id !== id); if (s.data.files) delete s.data.files[id]; s.commit(); return true;
  },
  async recordAcceptance(token, acceptance) { await wait(); await scope(token); await authProvider().updateAccount(token, { acceptance }); return true; },
  async notifications(token) { await wait(); return clone((await scope(token)).data.notifications.sort((a, b) => b.at.localeCompare(a.at))); },
  async markRead(token, ids = null) { await wait(); const s = await scope(token); s.data.notifications.forEach((n) => { if (!ids || ids.includes(n.id)) n.read = true; }); s.commit(); return clone(s.data.notifications); },
  async travellers(token) { await wait(); return clone((await scope(token)).data.travellers); },
  async saveTraveller(token, traveller) {
    await wait(); const s = await scope(token);
    const rec = { ...traveller, customerId: s.id, id: traveller.id || `trv-${rand()}` };
    const i = s.data.travellers.findIndex((x) => x.id === rec.id);
    if (i >= 0) s.data.travellers[i] = rec; else s.data.travellers.push(rec);
    s.commit(); return clone(rec);
  },
  async deleteTraveller(token, id) { await wait(); const s = await scope(token); s.data.travellers = s.data.travellers.filter((x) => x.id !== id); s.commit(); return true; },

  /** Attach a booking made on this site (the Stage 11 journey record) to the customer, creating its trip. */
  async claimBooking(token, journey) {
    await wait(); const s = await scope(token);
    const b = journey?.booking; const ctx = journey?.context; if (!b?.reference || !ctx) return null;
    if (s.data.bookings.some((x) => x.id === b.reference)) return clone(s.data.bookings.find((x) => x.id === b.reference));
    const offer = journey.selection?.offer ?? null; const supervisorId = journey.context?.attribution?.supervisor ?? null;
    const dest = offer?.legs?.[0]?.to ?? null;
    const start = offer?.legs?.[0]?.departAt?.slice(0, 10) ?? ctx.dates?.depart ?? ctx.dates?.checkin ?? null;
    const end = offer?.legs?.at(-1)?.arriveAt?.slice(0, 10) ?? ctx.dates?.return ?? ctx.dates?.checkout ?? start;
    const tripId = `trip-${rand()}`;
    const travellers = (ctx.travellers?.adults ?? 1) + (ctx.travellers?.children ?? 0) + (ctx.travellers?.infants ?? 0);
    s.data.trips.push({ id: tripId, customerId: s.id, supervisorId, createdAt: b.at ?? new Date().toISOString(), status: 'upcoming',
      titleAr: dest ? dest.cityAr : (ctx.destination || 'رحلة'), titleEn: dest ? dest.cityEn : (ctx.destination || 'Trip'),
      destination: dest ? { code: dest.code, cityAr: dest.cityAr, cityEn: dest.cityEn, countryAr: dest.countryAr ?? '', countryEn: dest.countryEn ?? '' } : { code: '', cityAr: ctx.destination || '', cityEn: ctx.destination || '', countryAr: '', countryEn: '' },
      startDate: start, endDate: end, services: [ctx.service], bookingIds: [b.reference], travellers });
    const paid = b.payment === 'paid';
    s.data.bookings.push({ id: b.reference, customerId: s.id, tripId, service: ctx.service, status: b.status === 'received' ? 'pending' : b.status, paymentStatus: paid ? 'paid' : 'unpaid', amount: b.total ?? 0, currency: b.currency ?? 'USD', supervisorId, ticketed: !!b.ticketed, createdAt: b.at ?? new Date().toISOString(), dev: true,
      detail: offer ? { route: offer.legs.map((l) => `${l.from.code} → ${l.to.code}`).join(' · '), dates: offer.legs.map((l) => l.departAt.slice(0, 10)), carrierAr: offer.carrier.nameAr, carrierEn: offer.carrier.nameEn, flights: offer.legs.map((l) => l.segments.map((sg) => sg.flightNumber).join(', ')).join(' / '), travellers } : { travellers, noteAr: 'طلب قيد المتابعة من مختص السفر والسياحة.', noteEn: 'Request being handled by a Travel & Tourism specialist.' } });
    if (paid) { s.data.payments.push({ id: `pay-${rand()}`, customerId: s.id, bookingId: b.reference, at: b.at ?? new Date().toISOString(), amount: b.total ?? 0, currency: b.currency ?? 'USD', status: 'paid', reference: journey.payment?.transactionId ?? '', methodAr: 'مزوّد دفع تجريبي', methodEn: 'Development payment provider', dev: true });
      s.data.documents.push({ id: `doc-${rand()}`, customerId: s.id, bookingId: b.reference, tripId, type: 'receipt', status: 'available', issuedAt: b.at ?? new Date().toISOString(), dev: true }); }
    if (b.status === 'confirmed') s.data.documents.push({ id: `doc-${rand()}`, customerId: s.id, bookingId: b.reference, tripId, type: 'confirmation', status: 'available', issuedAt: b.at ?? new Date().toISOString(), dev: true });
    s.data.notifications.unshift({ id: `ntf-${rand()}`, customerId: s.id, kind: 'booking', at: new Date().toISOString(), read: false, bookingId: b.reference, titleAr: b.status === 'received' ? 'استلمنا طلبك' : 'تم تأكيد حجزك', titleEn: b.status === 'received' ? 'Request received' : 'Booking confirmed', textAr: `المرجع ${b.reference}.`, textEn: `Reference ${b.reference}.`, href: `account/bookings/?id=${b.reference}`, dev: true });
    if (supervisorId) await authProvider().updateAccount(token, { supervisorId });
    s.commit(); return clone(s.data.bookings.at(-1));
  },
  /** This adapter has no real backend behind it at all (AUTH_PROVIDER=dev) — the whole "customer" is a local
      sandbox, so there is no client-trusted-payment vulnerability to close here the way api-customer.js's real
      backend has one. Kept only so calling code has a consistent method to call in every environment. */
  async createPaymentIntent(token, bookingId, method) {
    await wait(); const s = await scope(token); const b = s.data.bookings.find((x) => x.id === bookingId); if (!b) return null;
    if (method !== 'dev-failure') { b.paymentStatus = 'paid'; s.data.payments.push({ id: `pay-${rand()}`, customerId: s.id, bookingId, at: new Date().toISOString(), amount: b.amount, currency: b.currency, status: 'paid', reference: '', methodAr: 'مزوّد دفع تجريبي', methodEn: 'Development payment provider', dev: true }); }
    s.commit(); return { payment: { id: `pay-${rand()}`, bookingId, status: b.paymentStatus === 'paid' ? 'paid' : 'failed' }, client: { dev: true } };
  },
});
