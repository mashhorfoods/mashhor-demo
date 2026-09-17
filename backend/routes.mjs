// ============================================================================
// BACKEND / ROUTES — the contract in docs/INTEGRATION.md §3, one handler per
// row. Every /me route reads the customer from the session; nothing in a
// URL, body or header can name another customer.
// ============================================================================
import { config } from './config.mjs';
import { q, now } from './db.mjs';
import { json, empty, fail, HttpError, hex, readJson, readBody, parseMultipart, str, isEmail, setSessionCookies, clearSessionCookies } from './http.mjs';
import { publicCustomer, customerById, createIdentity, verifyPassword, changePassword, createSession, endSession, endAllSessions, createReset, consumeReset, validAttribution, normEmail } from './identity.mjs';
import { validateUpload, storage, signedUrl, verifySignature } from './storage.mjs';
import { enqueue } from './mailer.mjs';
import { legalDocument } from './legal.mjs';
import { info, warn } from './logger.mjs';

/* ---- row → contract shape ---------------------------------------------- */
const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const nTrip = (r) => ({ id: r.id, customerId: r.customer_id, titleAr: r.title_ar, titleEn: r.title_en, destination: J(r.destination_json, null), startDate: r.start_date, endDate: r.end_date, services: J(r.services_json, []), status: r.status, bookingIds: q.all('SELECT id FROM bookings WHERE trip_id = ? AND customer_id = ?', r.id, r.customer_id).map((b) => b.id), travellers: r.travellers, supervisorId: r.supervisor_id, createdAt: r.created_at });
const nBooking = (r) => ({ id: r.id, customerId: r.customer_id, tripId: r.trip_id, service: r.service, status: r.status, paymentStatus: r.payment_status, amount: r.amount, currency: r.currency, supervisorId: r.supervisor_id, ticketed: !!r.ticketed, createdAt: r.created_at, detail: J(r.detail_json, {}) });
const nDoc = (r) => ({ id: r.id, bookingId: r.booking_id, tripId: r.trip_id, type: r.type, kind: r.kind, status: r.revoked_at ? 'pending' : r.status, title: r.title, size: r.size, contentType: r.content_type, deletable: !!r.deletable, issuedAt: r.issued_at });
const nPay = (r) => ({ id: r.id, bookingId: r.booking_id, at: r.at, amount: r.amount, currency: r.currency, status: r.status, reference: r.reference, methodAr: r.method_ar, methodEn: r.method_en });
const nNtf = (r) => ({ id: r.id, kind: r.kind, at: r.at, read: !!r.read, titleAr: r.title_ar, titleEn: r.title_en, textAr: r.text_ar, textEn: r.text_en, href: r.href, bookingId: r.booking_id });
const nTrv = (r) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, dob: r.dob, gender: r.gender, nationality: r.nationality, passport: r.passport, passportExpiry: r.passport_expiry });
const sessionAnswer = (res, c) => { const s = createSession(c.id); setSessionCookies(res, s.id, s.csrf, s.maxAge); return { customer: publicCustomer(c), expiresAt: s.expiresAt }; };
const cleanAcceptance = (a) => (a && typeof a === 'object' ? { terms: a.terms ? { version: str(a.terms.version, 40), effectiveAt: str(a.terms.effectiveAt, 20) } : null, privacy: a.privacy ? { version: str(a.privacy.version, 40), effectiveAt: str(a.privacy.effectiveAt, 20) } : null, locale: a.locale === 'en' ? 'en' : 'ar' } : null);

/* ---- /auth ------------------------------------------------------------ */
export const auth = {
  async signUp(req, res, ctx) {
    const b = await readJson(req);
    const name = str(b.name, 120); const email = normEmail(b.email); const phone = str(b.phone, 30); const locale = b.locale === 'en' ? 'en' : 'ar';
    if (!name || !isEmail(email)) throw new HttpError(422, 'invalid');
    const c = createIdentity({ name, email, phone, locale, password: b.password, attribution: b.attribution, acceptance: cleanAcceptance(b.acceptance) });
    enqueue({ customerId: c.id, template: 'welcome', payload: { locale } });
    info('auth.signup', { attributed: !!c.attribution_supervisor });
    return json(res, 201, sessionAnswer(res, c));
  },
  async signIn(req, res, ctx) { const b = await readJson(req); const c = verifyPassword({ email: b.email, password: b.password, ip: ctx.ip }); return json(res, 200, sessionAnswer(res, c)); },
  session(req, res, ctx) { if (!ctx.session) return fail(res, 401, 'unauthenticated'); return json(res, 200, { customer: publicCustomer(ctx.customer), expiresAt: new Date(ctx.session.expires_at).toISOString() }); },
  refresh(req, res, ctx) { if (!ctx.session) return fail(res, 401, 'unauthenticated'); endSession(ctx.session.id); return json(res, 200, sessionAnswer(res, ctx.customer)); },
  signOut(req, res, ctx) { endSession(ctx.sid); clearSessionCookies(res); return empty(res); },
  async resetRequest(req, res) {
    const b = await readJson(req); const email = normEmail(b.email);
    if (isEmail(email)) { const r = createReset(email); if (r) enqueue({ customerId: r.customer.id, template: 'password-reset', payload: { token: r.token, locale: r.customer.locale } }); }
    return json(res, 202, {});   // never reveals whether the address exists
  },
  async reset(req, res) { const b = await readJson(req); const cid = consumeReset(str(b.token, 80), b.password); info('auth.reset', { ok: true }); enqueue({ customerId: cid, template: 'password-changed', payload: {} }); return empty(res); },
  async change(req, res, ctx) { if (!ctx.session) return fail(res, 401, 'unauthenticated'); const b = await readJson(req); changePassword(ctx.customer.id, b.current, b.next); return empty(res); },
};

/* ---- /me ---------------------------------------------------------------- */
export const me = {
  profile(req, res, ctx) { return json(res, 200, { customer: publicCustomer(ctx.customer) }); },
  async patch(req, res, ctx) {
    const b = await readJson(req); const c = ctx.customer;
    const name = b.name != null ? str(b.name, 120) : c.name; const phone = b.phone != null ? str(b.phone, 30) : c.phone; const locale = b.locale != null ? (b.locale === 'en' ? 'en' : 'ar') : c.locale;
    if (!name) throw new HttpError(422, 'invalid');
    q.run('UPDATE customers SET name = ?, phone = ?, locale = ?, updated_at = ? WHERE id = ?', name, phone, locale, now(), c.id);   // attribution and e-mail are never patched
    return json(res, 200, { customer: publicCustomer(customerById(c.id)) });
  },
  trips(req, res, ctx) { return json(res, 200, { trips: q.all('SELECT * FROM trips WHERE customer_id = ? ORDER BY start_date', ctx.customer.id).map(nTrip) }); },
  trip(req, res, ctx, id) {
    const t = q.get('SELECT * FROM trips WHERE id = ? AND customer_id = ?', id, ctx.customer.id); if (!t) return fail(res, 404, 'notFound');
    const bookings = q.all('SELECT * FROM bookings WHERE trip_id = ? AND customer_id = ?', t.id, ctx.customer.id);
    return json(res, 200, { trip: nTrip(t), bookings: bookings.map(nBooking), documents: q.all('SELECT * FROM documents WHERE trip_id = ? AND customer_id = ?', t.id, ctx.customer.id).map(nDoc), payments: bookings.length ? q.all(`SELECT * FROM payments WHERE customer_id = ? AND booking_id IN (${bookings.map(() => '?').join(',')}) ORDER BY at DESC`, ctx.customer.id, ...bookings.map((b) => b.id)).map(nPay) : [] });
  },
  bookings(req, res, ctx) { return json(res, 200, { bookings: q.all('SELECT * FROM bookings WHERE customer_id = ? ORDER BY created_at DESC', ctx.customer.id).map(nBooking) }); },
  booking(req, res, ctx, id) {
    const b = q.get('SELECT * FROM bookings WHERE id = ? AND customer_id = ?', id, ctx.customer.id); if (!b) return fail(res, 404, 'notFound');
    const trip = b.trip_id ? q.get('SELECT * FROM trips WHERE id = ? AND customer_id = ?', b.trip_id, ctx.customer.id) : null;
    return json(res, 200, { booking: nBooking(b), trip: trip ? nTrip(trip) : null, documents: q.all('SELECT * FROM documents WHERE booking_id = ? AND customer_id = ?', b.id, ctx.customer.id).map(nDoc), payments: q.all('SELECT * FROM payments WHERE booking_id = ? AND customer_id = ? ORDER BY at DESC', b.id, ctx.customer.id).map(nPay) });
  },
  async claim(req, res, ctx) {
    const b = await readJson(req); const ref = str(b.reference, 40); if (!ref) throw new HttpError(422, 'invalid');
    const cid = ctx.customer.id; const existing = q.get('SELECT * FROM bookings WHERE id = ? AND customer_id = ?', ref, cid); if (existing) return json(res, 200, { booking: nBooking(existing) });
    if (q.get('SELECT id FROM bookings WHERE id = ?', ref)) throw new HttpError(409, 'conflict');   // someone else's reference
    const ctxB = b.context ?? {}; const offer = b.offer ?? null; const dest = offer?.legs?.[0]?.to ?? null; const t = now();
    const attribution = validAttribution({ supervisorId: b.attribution?.supervisor ?? b.attribution?.supervisorId, source: 'booking' });
    const tripId = `trip_${hex(6)}`; const travellers = (ctxB.travellers?.adults ?? 1) + (ctxB.travellers?.children ?? 0) + (ctxB.travellers?.infants ?? 0);
    const paid = b.payment?.status === 'paid';
    const booking = q.tx(() => {
      q.run('INSERT INTO trips (id, customer_id, title_ar, title_en, destination_json, start_date, end_date, services_json, status, travellers, supervisor_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        tripId, cid, str(dest?.cityAr ?? ctxB.destination ?? 'رحلة', 80), str(dest?.cityEn ?? ctxB.destination ?? 'Trip', 80), JSON.stringify(dest ? { code: str(dest.code, 4), cityAr: str(dest.cityAr, 80), cityEn: str(dest.cityEn, 80), countryAr: str(dest.countryAr ?? '', 80), countryEn: str(dest.countryEn ?? '', 80) } : { code: '', cityAr: '', cityEn: '', countryAr: '', countryEn: '' }),
        str(offer?.legs?.[0]?.departAt?.slice(0, 10) ?? ctxB.dates?.depart ?? ctxB.dates?.checkin ?? '', 10) || null, str(offer?.legs?.at?.(-1)?.arriveAt?.slice(0, 10) ?? ctxB.dates?.return ?? ctxB.dates?.checkout ?? '', 10) || null, JSON.stringify([str(ctxB.service ?? 'flights', 20)]), 'upcoming', travellers, attribution?.supervisorId ?? null, t);
      const detail = offer ? { route: (offer.legs ?? []).map((l) => `${str(l.from?.code, 4)} → ${str(l.to?.code, 4)}`).join(' · '), dates: (offer.legs ?? []).map((l) => str(l.departAt?.slice(0, 10), 10)), carrierAr: str(offer.carrier?.nameAr, 80), carrierEn: str(offer.carrier?.nameEn, 80), flights: (offer.legs ?? []).map((l) => (l.segments ?? []).map((s) => str(s.flightNumber, 10)).join(', ')).join(' / '), travellers } : { travellers };
      q.run('INSERT INTO bookings (id, customer_id, trip_id, service, status, payment_status, amount, currency, supervisor_id, ticketed, detail_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', ref, cid, tripId, str(ctxB.service ?? 'flights', 20), b.status === 'received' ? 'pending' : 'confirmed', paid ? 'paid' : 'unpaid', Number(b.total) || 0, str(b.currency ?? 'USD', 3) || 'USD', attribution?.supervisorId ?? null, 0, JSON.stringify(detail), t);
      if (paid) { q.run('INSERT INTO payments (id, customer_id, booking_id, at, amount, currency, status, reference, method_ar, method_en) VALUES (?,?,?,?,?,?,?,?,?,?)', `pay_${hex(6)}`, cid, ref, t, Number(b.total) || 0, str(b.currency ?? 'USD', 3) || 'USD', 'paid', str(b.payment?.transactionId ?? '', 60), 'مزوّد دفع تجريبي', 'Development payment provider'); q.run('INSERT INTO documents (id, customer_id, booking_id, trip_id, type, kind, status, size, content_type, deletable, issued_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', `doc_${hex(6)}`, cid, ref, tripId, 'receipt', 'issued', 'pending', null, null, 0, null, t); }
      q.run('INSERT INTO notifications (id, customer_id, kind, at, read, title_ar, title_en, text_ar, text_en, href, booking_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)', `ntf_${hex(6)}`, cid, 'booking', t, 0, b.status === 'received' ? 'استلمنا طلبك' : 'تم تأكيد حجزك', b.status === 'received' ? 'Request received' : 'Booking confirmed', `المرجع ${ref}.`, `Reference ${ref}.`, `account/bookings/?id=${ref}`, ref);
      if (attribution && !ctx.customer.attribution_supervisor) q.run('UPDATE customers SET attribution_supervisor = ?, attribution_source = ?, attribution_at = ?, updated_at = ? WHERE id = ?', attribution.supervisorId, 'booking', attribution.at, t, cid);
      return q.get('SELECT * FROM bookings WHERE id = ?', ref);
    });
    info('booking.claimed', { service: booking.service, attributed: !!attribution });
    return json(res, 201, { booking: nBooking(booking) });
  },
  travellers(req, res, ctx) { return json(res, 200, { travellers: q.all('SELECT * FROM travellers WHERE customer_id = ? ORDER BY created_at', ctx.customer.id).map(nTrv) }); },
  async travellerCreate(req, res, ctx) { const b = await readJson(req); const id = `trv_${hex(6)}`; const t = now(); q.run('INSERT INTO travellers (id, customer_id, first_name, last_name, dob, gender, nationality, passport, passport_expiry, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', id, ctx.customer.id, str(b.firstName, 40), str(b.lastName, 40), str(b.dob, 10), str(b.gender, 1), str(b.nationality, 2), str(b.passport, 20), str(b.passportExpiry, 10), t, t); return json(res, 201, { traveller: nTrv(q.get('SELECT * FROM travellers WHERE id = ?', id)) }); },
  async travellerPatch(req, res, ctx, id) { const r = q.get('SELECT * FROM travellers WHERE id = ? AND customer_id = ?', id, ctx.customer.id); if (!r) return fail(res, 404, 'notFound'); const b = await readJson(req); const v = (k, cur, n) => (b[k] != null ? str(b[k], n) : cur); q.run('UPDATE travellers SET first_name = ?, last_name = ?, dob = ?, gender = ?, nationality = ?, passport = ?, passport_expiry = ?, updated_at = ? WHERE id = ?', v('firstName', r.first_name, 40), v('lastName', r.last_name, 40), v('dob', r.dob, 10), v('gender', r.gender, 1), v('nationality', r.nationality, 2), v('passport', r.passport, 20), v('passportExpiry', r.passport_expiry, 10), now(), id); return json(res, 200, { traveller: nTrv(q.get('SELECT * FROM travellers WHERE id = ?', id)) }); },
  travellerDelete(req, res, ctx, id) { const r = q.run('DELETE FROM travellers WHERE id = ? AND customer_id = ?', id, ctx.customer.id); if (!r.changes) return fail(res, 404, 'notFound'); return empty(res); },
  documents(req, res, ctx) {
    const cid = ctx.customer.id;
    const bookingOf = (id) => { const b = id && q.get('SELECT * FROM bookings WHERE id = ? AND customer_id = ?', id, cid); return b ? nBooking(b) : null; };
    const tripOf = (id) => { const t = id && q.get('SELECT * FROM trips WHERE id = ? AND customer_id = ?', id, cid); return t ? nTrip(t) : null; };
    return json(res, 200, { documents: q.all('SELECT * FROM documents WHERE customer_id = ? ORDER BY created_at DESC', cid).map((d) => ({ ...nDoc(d), booking: bookingOf(d.booking_id), trip: tripOf(d.trip_id) })) });
  },
  async documentUpload(req, res, ctx) {
    const ct = req.headers['content-type'] ?? ''; if (!ct.startsWith('multipart/form-data')) throw new HttpError(415, 'unsupported');
    const buf = await readBody(req, config.upload.maxBytes + 64 * 1024); const parts = parseMultipart(buf, ct);
    const { type, size, safeName } = validateUpload(parts.file);
    const key = storage.put(parts.file.body, type); const id = `doc_${hex(8)}`; const t = now();
    q.run('INSERT INTO documents (id, customer_id, booking_id, trip_id, type, kind, status, title, size, content_type, storage_key, deletable, issued_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, ctx.customer.id, null, null, 'customer', 'customer', 'available', str(parts.title, 120) || safeName, size, type, key, 1, t, t);
    info('document.uploaded', { type, size });
    return json(res, 201, { document: nDoc(q.get('SELECT * FROM documents WHERE id = ?', id)) });
  },
  documentUrl(req, res, ctx, id, origin) { const d = q.get('SELECT * FROM documents WHERE id = ? AND customer_id = ?', id, ctx.customer.id); if (!d || d.status !== 'available' || d.revoked_at || !d.storage_key) return fail(res, 404, 'notFound'); return json(res, 200, signedUrl(origin, d.id, ctx.urlTtlMs)); },
  documentDelete(req, res, ctx, id) { const d = q.get('SELECT * FROM documents WHERE id = ? AND customer_id = ?', id, ctx.customer.id); if (!d) return fail(res, 404, 'notFound'); if (!d.deletable) return fail(res, 403, 'forbidden'); q.run('DELETE FROM documents WHERE id = ?', d.id); storage.remove(d.storage_key); return empty(res); },
  payments(req, res, ctx, url) {
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1); const size = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 20)); const cid = ctx.customer.id;
    const total = q.get('SELECT COUNT(*) AS n FROM payments WHERE customer_id = ?', cid).n;
    const items = q.all('SELECT * FROM payments WHERE customer_id = ? ORDER BY at DESC LIMIT ? OFFSET ?', cid, size, (page - 1) * size).map((p) => ({ ...nPay(p), booking: p.booking_id ? (() => { const b = q.get('SELECT * FROM bookings WHERE id = ? AND customer_id = ?', p.booking_id, cid); return b ? nBooking(b) : null; })() : null }));
    return json(res, 200, { items, page, pageSize: size, total, nextPage: page * size < total ? page + 1 : null });
  },
  notifications(req, res, ctx) { return json(res, 200, { notifications: q.all('SELECT * FROM notifications WHERE customer_id = ? ORDER BY at DESC', ctx.customer.id).map(nNtf) }); },
  async notificationsRead(req, res, ctx) { const b = await readJson(req); const cid = ctx.customer.id; if (b.all) q.run('UPDATE notifications SET read = 1 WHERE customer_id = ?', cid); else for (const id of (Array.isArray(b.ids) ? b.ids : []).slice(0, 200)) q.run('UPDATE notifications SET read = 1 WHERE id = ? AND customer_id = ?', String(id), cid); return json(res, 200, { notifications: q.all('SELECT * FROM notifications WHERE customer_id = ? ORDER BY at DESC', cid).map(nNtf) }); },
  async acceptance(req, res, ctx) { const b = cleanAcceptance(await readJson(req)); if (!b) throw new HttpError(422, 'invalid'); q.run('UPDATE customers SET acceptance_json = ?, updated_at = ? WHERE id = ?', JSON.stringify({ ...b, at: now() }), now(), ctx.customer.id); return empty(res); },
};

/* ---- /files, /legal, /diagnostics ---------------------------------------- */
export function file(req, res, id, url) {
  const exp = Number(url.searchParams.get('exp')); const sig = url.searchParams.get('sig');
  if (!verifySignature(id, exp, sig)) return fail(res, 403, 'forbidden');
  if (exp < Date.now()) return fail(res, 410, 'expired');
  const d = q.get('SELECT * FROM documents WHERE id = ?', id); if (!d || d.status !== 'available' || d.revoked_at) return fail(res, 404, 'notFound');   // revoked or deleted: the link is dead
  const body = storage.get(d.storage_key); if (!body) return fail(res, 404, 'notFound');
  res.writeHead(200, { 'Content-Type': d.content_type, 'Content-Length': body.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline', 'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors ${config.allowedOrigins.length ? config.allowedOrigins.join(' ') : '*'}` }); res.end(body);
}
export function legal(req, res, kind, url, override) {
  const locale = url.searchParams.get('locale') === 'en' ? 'en' : 'ar';
  const doc = override ? override(kind, locale) : legalDocument(kind, locale);
  if (!doc) return fail(res, 404, 'notFound');
  return json(res, 200, doc, { 'Cache-Control': 'public, max-age=300' });
}
export async function diagnostics(req, res) {
  const buf = await readBody(req, 8 * 1024); let e = null; try { e = JSON.parse(buf.toString()); } catch { /* ignored */ }
  if (e && typeof e.event === 'string') { const safe = {}; for (const [k, v] of Object.entries(e)) if (!/pass|token|secret|cookie|card|email|phone|name|passport/i.test(k) && (typeof v === 'string' ? v.length <= 120 : typeof v === 'number' || typeof v === 'boolean')) safe[k] = v; q.run('INSERT INTO diagnostics (at, event, payload_json) VALUES (?,?,?)', now(), e.event.slice(0, 60), JSON.stringify(safe)); q.run('DELETE FROM diagnostics WHERE id < (SELECT MAX(id) FROM diagnostics) - 5000'); }
  return empty(res);
}
