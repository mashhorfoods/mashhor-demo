// BACKEND / FIXTURES — test data for the integration suite. Loaded ONLY through /__test/reset, which exists only when
// BACKEND_TEST_CONTROLS=1 (refused in production). Two customers so the customer boundary can be verified; every value is
// a labelled fixture, never business content.
import { q, now } from './db.mjs';
import { createIdentity } from './identity.mjs';
import { storage } from './storage.mjs';
import { config } from './config.mjs';
import { readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const iso = (ms) => new Date(ms).toISOString();
const day = (offset) => { const d = new Date(); d.setUTCHours(9, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d; };
const dateOnly = (offset) => day(offset).toISOString().slice(0, 10);

export function wipe() {
  for (const t of ['diagnostics', 'outbox', 'notifications', 'payments', 'documents', 'travellers', 'bookings', 'trips', 'login_attempts', 'reset_tokens', 'sessions', 'customers']) q.run(`DELETE FROM ${t}`);
  if (existsSync(config.storageDir)) for (const f of readdirSync(config.storageDir)) { try { unlinkSync(join(config.storageDir, f)); } catch { /* ignore */ } }
}

export function seed() {
  const t0 = Date.now();
  const a = createIdentity({ name: 'Alpha Fixture', email: 'alpha@fixture.test', phone: '', locale: 'ar', password: 'password123', attribution: { supervisorId: 'supervisor-1', source: 'link' }, acceptance: null });
  const b = createIdentity({ name: 'Beta Fixture', email: 'beta@fixture.test', phone: '', locale: 'ar', password: 'password123', attribution: null, acceptance: null });
  const trip = (id, cid, o) => q.run('INSERT INTO trips (id, customer_id, title_ar, title_en, destination_json, start_date, end_date, services_json, status, travellers, supervisor_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', id, cid, o.titleAr, o.titleEn, JSON.stringify(o.destination), o.startDate, o.endDate, JSON.stringify(o.services), o.status, o.travellers, o.supervisorId ?? null, iso(t0 - 864e5 * 10));
  const booking = (id, cid, o) => q.run('INSERT INTO bookings (id, customer_id, trip_id, service, status, payment_status, amount, currency, supervisor_id, ticketed, detail_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', id, cid, o.tripId, o.service, o.status, o.paymentStatus, o.amount, 'USD', o.supervisorId ?? null, o.ticketed ? 1 : 0, JSON.stringify(o.detail), o.createdAt);
  const doc = (id, cid, o, body) => { const key = storage.put(body, o.contentType); q.run('INSERT INTO documents (id, customer_id, booking_id, trip_id, type, kind, status, title, size, content_type, storage_key, deletable, issued_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, cid, o.bookingId, o.tripId, o.type, 'issued', 'available', null, body.length, o.contentType, key, 0, o.issuedAt, o.issuedAt); };
  const pdf = (label) => Buffer.from(`%PDF-1.4\n% fixture ${label} (not a real document)\n`);
  trip('trip_A1', a.id, { titleAr: 'رحلة تجريبية إلى جدة', titleEn: 'Fixture trip to Jeddah', destination: { code: 'JED', cityAr: 'جدة', cityEn: 'Jeddah', countryAr: 'السعودية', countryEn: 'Saudi Arabia' }, startDate: dateOnly(20), endDate: dateOnly(27), services: ['flights', 'hotels'], status: 'upcoming', travellers: 2, supervisorId: 'supervisor-1' });
  booking('BK_A1', a.id, { tripId: 'trip_A1', service: 'flights', status: 'confirmed', paymentStatus: 'paid', amount: 900, supervisorId: 'supervisor-1', ticketed: true, createdAt: iso(t0 - 864e5 * 10), detail: { route: 'KRT → JED → KRT', dates: [dateOnly(20), dateOnly(27)], carrierAr: 'ناقل تجريبي', carrierEn: 'Fixture Air', flights: 'FX 1 · FX 2', travellers: 2, cabinAr: 'الاقتصادية', cabinEn: 'Economy' } });
  booking('BK_A2', a.id, { tripId: 'trip_A1', service: 'hotels', status: 'pending', paymentStatus: 'unpaid', amount: 0, supervisorId: 'supervisor-1', createdAt: iso(t0 - 864e5 * 9), detail: { nights: 7, rooms: 1, checkin: dateOnly(20), checkout: dateOnly(27) } });
  doc('doc_A1', a.id, { bookingId: 'BK_A1', tripId: 'trip_A1', type: 'eticket', contentType: 'application/pdf', issuedAt: iso(t0 - 864e5 * 9) }, pdf('e-ticket'));
  doc('doc_A2', a.id, { bookingId: 'BK_A1', tripId: 'trip_A1', type: 'receipt', contentType: 'application/pdf', issuedAt: iso(t0 - 864e5 * 10) }, pdf('receipt'));
  for (let i = 0; i < 25; i++) q.run('INSERT INTO payments (id, customer_id, booking_id, at, amount, currency, status, reference, method_ar, method_en) VALUES (?,?,?,?,?,?,?,?,?,?)', `pay_A${i}`, a.id, 'BK_A1', iso(t0 - 864e5 * (i + 1)), i === 3 ? -50 : 100 + i, 'USD', i === 3 ? 'refunded' : i === 5 ? 'failed' : 'paid', `FXTX-${String(i).padStart(4, '0')}`, 'مزوّد دفع تجريبي', 'Fixture payment provider');
  q.run('INSERT INTO notifications (id, customer_id, kind, at, read, title_ar, title_en, text_ar, text_en, href, booking_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)', 'ntf_A1', a.id, 'document', iso(t0 - 36e5), 0, 'تذكرتك جاهزة (تجريبي)', 'Your ticket is ready (fixture)', 'مستند تجريبي.', 'A fixture document.', 'account/documents/', 'BK_A1');
  q.run('INSERT INTO notifications (id, customer_id, kind, at, read, title_ar, title_en, text_ar, text_en, href, booking_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)', 'ntf_A2', a.id, 'support', iso(t0 - 72e5), 1, 'رد من الدعم (تجريبي)', 'Support reply (fixture)', 'نص تجريبي.', 'Fixture text.', 'account/support/', null);
  q.run('INSERT INTO travellers (id, customer_id, first_name, last_name, dob, gender, nationality, passport, passport_expiry, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', 'trv_A1', a.id, 'Alpha', 'Traveller', '1990-01-01', 'M', 'SD', 'A0000001', dateOnly(800), now(), now());
  trip('trip_B1', b.id, { titleAr: 'رحلة بيتا', titleEn: 'Beta trip', destination: { code: 'DXB', cityAr: 'دبي', cityEn: 'Dubai', countryAr: 'الإمارات', countryEn: 'UAE' }, startDate: dateOnly(5), endDate: dateOnly(9), services: ['flights'], status: 'upcoming', travellers: 1 });
  booking('BK_B1', b.id, { tripId: 'trip_B1', service: 'flights', status: 'confirmed', paymentStatus: 'paid', amount: 300, ticketed: false, createdAt: iso(t0 - 864e5), detail: { route: 'KRT → DXB', dates: [dateOnly(5)], travellers: 1 } });
  doc('doc_B1', b.id, { bookingId: 'BK_B1', tripId: 'trip_B1', type: 'confirmation', contentType: 'application/pdf', issuedAt: iso(t0 - 864e5) }, pdf('confirmation (Beta)'));
}

/** Test-fixture legal documents: labelled as fixtures, served only while test controls are on and the toggle is set. */
export const fixtureLegal = (kind, locale, version) => ({
  version, effectiveAt: '2026-01-01',
  title: locale === 'ar' ? (kind === 'terms' ? 'شروط الاستخدام (نموذج اختبار)' : 'سياسة الخصوصية (نموذج اختبار)') : (kind === 'terms' ? 'Terms of Service (test fixture)' : 'Privacy Policy (test fixture)'),
  html: `<h2>${locale === 'ar' ? 'نموذج اختبار' : 'Test fixture'}</h2><p>${locale === 'ar' ? 'هذا نص نموذج اختبار وليس وثيقة قانونية.' : 'This is a test fixture, not a legal document.'}</p><script>window.__xss=1</script><a href="javascript:alert(1)">x</a><ul><li>${locale === 'ar' ? 'بند' : 'item'}</li></ul>`,
});
