// ============================================================================
// CONTRACT TEST SERVER — a stand-in backend that implements the customer API
// contract (docs/INTEGRATION.md §Contract) so the production adapters can be
// verified in a real browser before a backend exists. Stage 12.1
//
// It behaves the way the real backend must: HttpOnly cookie sessions, a
// readable CSRF cookie echoed in X-CSRF-Token, every /me route scoped to the
// session's customer (another customer's id is a 404), signed temporary file
// URLs that expire, neutral password-reset answers, and no field the browser
// should not see. Test-only controls live under /__test/ and never exist on
// a real backend. Data is in memory; nothing here is a fixture of real
// business content — the legal "documents" are labelled test fixtures.
//
//   node tests/contract-server.mjs            (prints its origin)
//   import { startContractServer } from './contract-server.mjs'
// ============================================================================
import { createServer } from 'node:http';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SECRET = randomBytes(32);
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const hex = (n = 12) => randomBytes(n).toString('hex');
const now = () => Date.now();
const iso = (ms) => new Date(ms).toISOString();
const dayOffset = (d, h = 9) => { const x = new Date(); x.setUTCHours(h, 0, 0, 0); x.setUTCDate(x.getUTCDate() + d); return x; };
const dateOnly = (d) => dayOffset(d).toISOString().slice(0, 10);
const hash = (password, salt) => scryptSync(password, salt, 32).toString('hex');
const sign = (s) => createHmac('sha256', SECRET).update(s).digest('hex');

export function startContractServer({ allowOrigin = null, port = 0, urlTtlMs = 5 * 60 * 1000 } = {}) {
  const state = { accounts: new Map(), sessions: new Map(), resets: new Map(), csrf: new Map(), customers: new Map(), files: new Map(), faults: [], legal: { supplied: false, version: 'fixture-1' }, urlTtlMs, events: [], requests: [], flightSearches: new Map() };
  const reset = () => { state.accounts.clear(); state.sessions.clear(); state.resets.clear(); state.customers.clear(); state.files.clear(); state.faults = []; state.legal = { supplied: false, version: 'fixture-1' }; state.urlTtlMs = urlTtlMs; state.events = []; state.requests = []; state.flightSearches.clear(); seed(); };

  const emptyData = () => ({ trips: [], bookings: [], travellers: [], documents: [], payments: [], notifications: [] });
  function createCustomer({ name, email, phone = '', locale = 'ar', password, attribution = null, acceptance = null }) {
    const id = `cus_${hex(6)}`; const salt = hex(8);
    state.accounts.set(email.toLowerCase(), { id, email: email.toLowerCase(), salt, hash: hash(password, salt) });
    state.customers.set(id, { profile: { id, name, email: email.toLowerCase(), phone, locale, image: null, attribution: attribution ? { ...attribution, at: iso(now()) } : null, acceptance: acceptance ? { ...acceptance, at: iso(now()) } : null, createdAt: iso(now()) }, data: emptyData() });
    return id;
  }
  function seed() {
    // Customer A: populated. Customer B: one trip of her own. Both fixtures.
    const a = createCustomer({ name: 'Alpha Fixture', email: 'alpha@fixture.test', password: 'password123', attribution: { supervisorId: 'supervisor-1', source: 'link' } });
    const b = createCustomer({ name: 'Beta Fixture', email: 'beta@fixture.test', password: 'password123' });
    const A = state.customers.get(a).data; const B = state.customers.get(b).data;
    A.trips.push({ id: 'trip_A1', customerId: a, titleAr: 'رحلة تجريبية إلى جدة', titleEn: 'Fixture trip to Jeddah', destination: { code: 'JED', cityAr: 'جدة', cityEn: 'Jeddah', countryAr: 'السعودية', countryEn: 'Saudi Arabia' }, startDate: dateOnly(20), endDate: dateOnly(27), services: ['flights', 'hotels'], status: 'upcoming', bookingIds: ['BK_A1', 'BK_A2'], travellers: 2, supervisorId: 'supervisor-1', createdAt: iso(now() - 864e5 * 10) });
    A.bookings.push({ id: 'BK_A1', customerId: a, tripId: 'trip_A1', service: 'flights', status: 'confirmed', paymentStatus: 'paid', amount: 900, currency: 'USD', supervisorId: 'supervisor-1', ticketed: true, createdAt: iso(now() - 864e5 * 10), detail: { route: 'KRT → JED → KRT', dates: [dateOnly(20), dateOnly(27)], carrierAr: 'ناقل تجريبي', carrierEn: 'Fixture Air', flights: 'FX 1 · FX 2', travellers: 2, cabinAr: 'الاقتصادية', cabinEn: 'Economy' } });
    A.bookings.push({ id: 'BK_A2', customerId: a, tripId: 'trip_A1', service: 'hotels', status: 'pending', paymentStatus: 'unpaid', amount: 0, currency: 'USD', supervisorId: 'supervisor-1', createdAt: iso(now() - 864e5 * 9), detail: { nights: 7, rooms: 1, checkin: dateOnly(20), checkout: dateOnly(27) } });
    A.documents.push({ id: 'doc_A1', bookingId: 'BK_A1', tripId: 'trip_A1', type: 'eticket', kind: 'issued', status: 'available', issuedAt: iso(now() - 864e5 * 9), contentType: 'application/pdf', size: 2048, deletable: false });
    A.documents.push({ id: 'doc_A2', bookingId: 'BK_A1', tripId: 'trip_A1', type: 'receipt', kind: 'issued', status: 'available', issuedAt: iso(now() - 864e5 * 10), contentType: 'application/pdf', size: 1024, deletable: false });
    state.files.set('doc_A1', { customerId: a, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4\n% fixture e-ticket (not a real document)\n') });
    state.files.set('doc_A2', { customerId: a, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4\n% fixture receipt (not a real document)\n') });
    for (let i = 0; i < 25; i++) A.payments.push({ id: `pay_A${i}`, bookingId: 'BK_A1', at: iso(now() - 864e5 * (i + 1)), amount: i === 3 ? -50 : 100 + i, currency: 'USD', status: i === 3 ? 'refunded' : i === 5 ? 'failed' : 'paid', reference: `FXTX-${String(i).padStart(4, '0')}`, methodAr: 'مزوّد دفع تجريبي', methodEn: 'Fixture payment provider' });
    A.notifications.push({ id: 'ntf_A1', kind: 'document', at: iso(now() - 36e5), read: false, titleAr: 'تذكرتك جاهزة (تجريبي)', titleEn: 'Your ticket is ready (fixture)', textAr: 'مستند تجريبي.', textEn: 'A fixture document.', href: 'account/documents/', bookingId: 'BK_A1' });
    A.notifications.push({ id: 'ntf_A2', kind: 'support', at: iso(now() - 72e5), read: true, titleAr: 'رد من الدعم (تجريبي)', titleEn: 'Support reply (fixture)', textAr: 'نص تجريبي.', textEn: 'Fixture text.', href: 'account/support/' });
    A.travellers.push({ id: 'trv_A1', firstName: 'Alpha', lastName: 'Traveller', dob: '1990-01-01', gender: 'M', nationality: 'SD', passport: 'A0000001', passportExpiry: dateOnly(800) });
    B.trips.push({ id: 'trip_B1', customerId: b, titleAr: 'رحلة بيتا', titleEn: 'Beta trip', destination: { code: 'DXB', cityAr: 'دبي', cityEn: 'Dubai', countryAr: 'الإمارات', countryEn: 'UAE' }, startDate: dateOnly(5), endDate: dateOnly(9), services: ['flights'], status: 'upcoming', bookingIds: ['BK_B1'], travellers: 1, createdAt: iso(now() - 864e5) });
    B.bookings.push({ id: 'BK_B1', customerId: b, tripId: 'trip_B1', service: 'flights', status: 'confirmed', paymentStatus: 'paid', amount: 300, currency: 'USD', ticketed: false, createdAt: iso(now() - 864e5), detail: { route: 'KRT → DXB', dates: [dateOnly(5)], travellers: 1 } });
    B.documents.push({ id: 'doc_B1', bookingId: 'BK_B1', tripId: 'trip_B1', type: 'confirmation', kind: 'issued', status: 'available', issuedAt: iso(now() - 864e5), contentType: 'application/pdf', size: 512, deletable: false });
    state.files.set('doc_B1', { customerId: b, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4\n% fixture confirmation (Beta)\n') });
  }
  seed();

  const json = (res, status, body, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }); res.end(body == null ? '' : JSON.stringify(body)); };
  const fail = (res, status, code, extra = {}) => json(res, status, { error: { code } }, extra);
  const cookies = (req) => Object.fromEntries((req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  const setSessionCookies = (res, sid, csrf) => { res.setHeader('Set-Cookie', [`no_session=${sid}; Path=/; HttpOnly; SameSite=Lax`, `no_csrf=${csrf}; Path=/; SameSite=Lax`]); };
  const clearSessionCookies = (res) => { res.setHeader('Set-Cookie', ['no_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0', 'no_csrf=; Path=/; SameSite=Lax; Max-Age=0']); };
  const publicProfile = (c) => { const p = c.profile; return { id: p.id, name: p.name, email: p.email, phone: p.phone, locale: p.locale, image: p.image, supervisorId: p.attribution?.supervisorId ?? null, attribution: p.attribution, acceptance: p.acceptance, createdAt: p.createdAt }; };
  const issue = (res, customerId, ttl = SESSION_TTL_MS) => { const sid = hex(16); const csrf = hex(16); state.sessions.set(sid, { customerId, expiresAt: now() + ttl, csrf }); setSessionCookies(res, sid, csrf); return { customer: publicProfile(state.customers.get(customerId)), expiresAt: iso(now() + ttl) }; };
  const readBody = (req) => new Promise((resolve) => { const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); });
  const parseMultipart = (buf, contentType) => {
    const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/); const b = `--${boundary[1] ?? boundary[2]}`; const parts = {}; const s = buf.toString('latin1');
    for (const chunk of s.split(b).slice(1, -1)) {
      const idx = chunk.indexOf('\r\n\r\n'); const head = chunk.slice(0, idx); const body = chunk.slice(idx + 4, chunk.length - 2);
      const name = head.match(/name="([^"]+)"/)?.[1]; const filename = head.match(/filename="([^"]*)"/)?.[1]; const type = head.match(/Content-Type:\s*([^\r\n]+)/i)?.[1];
      parts[name] = filename != null ? { filename, contentType: type ?? 'application/octet-stream', body: Buffer.from(body, 'latin1') } : Buffer.from(body, 'latin1').toString('utf8');
    }
    return parts;
  };
  const signedUrl = (origin, docId, ttlMs) => { const exp = now() + ttlMs; const sig = sign(`${docId}:${exp}`); return { url: `${origin}/files/${docId}?exp=${exp}&sig=${sig}`, expiresAt: iso(exp) }; };

  // ---- Stage 16C: a minimal flight-supplier stand-in, the same reason this whole file exists for the
  // customer API — so assets/js/booking/adapters/api-flights.js can be verified end to end in a real browser
  // too, not just its dev-only sibling. Deterministic, one fictional carrier, clearly not real inventory. ----
  const FLIGHT_CARRIER = { code: 'CT', nameAr: 'ناقل العقد (تجريبي)', nameEn: 'Contract Carrier (fixture)' };
  const flightPlace = (code) => ({ code, cityAr: code, cityEn: code, airportAr: code, airportEn: code });
  const makeFlightOffer = (request, n) => {
    const legs = (request.legs ?? []).map((l, i) => {
      const depart = dayOffset(10 + i, 8 + n); const arrive = new Date(depart.getTime() + 150 * 60000);
      const seg = { carrier: FLIGHT_CARRIER, flightNumber: `CT ${100 + n}`, from: flightPlace(l.from), to: flightPlace(l.to), departAt: depart.toISOString().slice(0, 19), arriveAt: arrive.toISOString().slice(0, 19), durationMinutes: 150, aircraft: null };
      return { from: flightPlace(l.from), to: flightPlace(l.to), departAt: seg.departAt, arriveAt: seg.arriveAt, durationMinutes: 150, stops: [], segments: [seg] };
    });
    const { adults = 1, children = 0, infants = 0 } = request.travellers ?? {};
    const perAdult = 250 + n * 20; const perChild = Math.round(perAdult * 0.75); const perInfant = Math.round(perAdult * 0.1);
    const base = perAdult * adults + perChild * children + perInfant * infants; const taxes = Math.round(base * 0.14); const fees = 12 * (adults + children + infants);
    return { id: `CT-${hex(3)}${n}`, provider: { id: 'contract', dev: true }, service: 'flights', tripType: request.tripType, carrier: FLIGHT_CARRIER, legs,
      baggage: { cabinKg: 7, checkedKg: 23, checkedPieces: 1 },
      fare: { family: 'standard', refundable: true, changeable: true, changeFee: 40, cancelFee: 120, labelAr: 'قياسية (تجريبي)', labelEn: 'Standard (fixture)', rulesAr: [], rulesEn: [] },
      price: { currency: 'USD', perTraveller: { adult: perAdult, child: perChild, infant: perInfant }, base, taxes, fees, total: base + taxes + fees },
      availability: { seatsLeft: 9 }, included: [], extras: [] };
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'); const path = url.pathname; const origin = `http://${req.headers.host}`;
    state.requests.push({ method: req.method, path });
    // CORS: the site's origin only, with credentials.
    const reqOrigin = req.headers.origin;
    if (reqOrigin && (!allowOrigin || reqOrigin === allowOrigin)) { res.setHeader('Access-Control-Allow-Origin', reqOrigin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-CSRF-Token'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS'); res.setHeader('Access-Control-Expose-Headers', 'Retry-After'); }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // ---- test controls (never on a real backend) ----
    if (path.startsWith('/__test/')) {
      const body = req.method === 'POST' ? JSON.parse((await readBody(req)).toString() || '{}') : {};
      if (path === '/__test/reset') { reset(); return json(res, 200, { ok: true }); }
      if (path === '/__test/fault') { state.faults.push({ status: body.status, times: body.times ?? 1, match: body.path ?? null, retryAfter: body.retryAfter ?? null }); return json(res, 200, { ok: true }); }
      if (path === '/__test/legal') { state.legal = { supplied: !!body.supplied, version: body.version ?? 'fixture-1' }; return json(res, 200, { ok: true }); }
      if (path === '/__test/url-ttl') { state.urlTtlMs = body.ttlMs; return json(res, 200, { ok: true }); }
      if (path === '/__test/revoke') { for (const [sid, s] of state.sessions) if (!body.customerId || s.customerId === body.customerId) state.sessions.delete(sid); return json(res, 200, { ok: true }); }
      if (path === '/__test/shorten-session') { for (const s of state.sessions.values()) s.expiresAt = now() + (body.ms ?? 60000); return json(res, 200, { ok: true }); }
      if (path === '/__test/state') return json(res, 200, { events: state.events, requests: state.requests.slice(-200), customers: [...state.customers.values()].map((c) => c.profile), sessions: state.sessions.size, resets: [...state.resets.entries()].map(([t, r]) => ({ token: t, email: r.email })) });
      return fail(res, 404, 'notFound');
    }
    // ---- fault injection ----
    const fi = state.faults.findIndex((f) => f.times > 0 && (!f.match || path.includes(f.match)));
    if (fi >= 0) {
      const f = state.faults[fi]; f.times -= 1; if (f.times <= 0) state.faults.splice(fi, 1);
      if (f.status === 'timeout') { await new Promise((r) => setTimeout(r, 15000)); res.writeHead(504); res.end(); return; }
      if (f.status === 'network') { req.socket.destroy(); return; }
      return fail(res, Number(f.status), { 500: 'unavailable', 503: 'unavailable', 429: 'rateLimited', 403: 'forbidden', 404: 'notFound', 401: 'unauthenticated' }[f.status] ?? 'failed', f.status === 429 ? { 'Retry-After': String(f.retryAfter ?? 5) } : {});
    }
    // ---- signed files: no session, the signature and expiry are the authority ----
    if (path.startsWith('/files/')) {
      const id = path.slice(7); const exp = Number(url.searchParams.get('exp')); const sig = url.searchParams.get('sig') ?? '';
      const good = sign(`${id}:${exp}`); const ok = sig.length === good.length && timingSafeEqual(Buffer.from(sig), Buffer.from(good));
      if (!ok || !state.files.has(id)) return fail(res, 403, 'forbidden');
      if (exp < now()) return fail(res, 410, 'expired');
      const f = state.files.get(id); res.writeHead(200, { 'Content-Type': f.contentType, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline' }); res.end(f.body); return;
    }
    if (path === '/diagnostics' && req.method === 'POST') { try { const e = JSON.parse((await readBody(req)).toString()); state.events.push(e); } catch { /* ignore */ } res.writeHead(204); res.end(); return; }
    if (path.startsWith('/legal/')) {
      const kind = path.slice(7);
      if (!['terms', 'privacy'].includes(kind) || !state.legal.supplied) return fail(res, 404, 'notFound');
      const locale = url.searchParams.get('locale') ?? 'ar';
      return json(res, 200, { version: state.legal.version, effectiveAt: '2026-01-01', title: locale === 'ar' ? (kind === 'terms' ? 'شروط الاستخدام (نموذج اختبار)' : 'سياسة الخصوصية (نموذج اختبار)') : (kind === 'terms' ? 'Terms of Service (test fixture)' : 'Privacy Policy (test fixture)'), html: `<h2>${locale === 'ar' ? 'نموذج اختبار' : 'Test fixture'}</h2><p>${locale === 'ar' ? 'هذا نص نموذج اختبار وليس وثيقة قانونية.' : 'This is a test fixture, not a legal document.'}</p><script>window.__xss=1</script><a href="javascript:alert(1)">x</a><ul><li>${locale === 'ar' ? 'بند' : 'item'}</li></ul>` });
    }

    const body = ['POST', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : null;
    const parse = () => { try { return JSON.parse(body.toString() || '{}'); } catch { return {}; } };
    const ck = cookies(req); const session = ck.no_session ? state.sessions.get(ck.no_session) : null;
    const live = session && session.expiresAt > now() ? session : null;
    if (session && !live) state.sessions.delete(ck.no_session);
    // CSRF on every state change: the readable cookie must be echoed in the header.
    if (['POST', 'PATCH', 'DELETE'].includes(req.method) && live) { const h = req.headers['x-csrf-token']; if (!h || h !== live.csrf) return fail(res, 403, 'forbidden'); }

    // ---- Stage 16C: /flights/* — public, no session (mirrors backend/flights.mjs's own route placement) ----
    if (path === '/flights/search' && req.method === 'POST') {
      const b = parse();
      const offers = Array.from({ length: 3 }, (_, n) => makeFlightOffer(b, n));
      const searchId = `S-${hex(6)}`; state.flightSearches.set(searchId, { request: b, offers, expiresAt: now() + 20 * 60000 });
      return json(res, 200, { offers, meta: { searchId, expiresAt: now() + 20 * 60000, currency: 'USD' } });
    }
    const offerMatch = path.match(/^\/flights\/offers\/([^/]+)\/([^/]+)$/);
    if (offerMatch && req.method === 'GET') {
      const s = state.flightSearches.get(decodeURIComponent(offerMatch[1])); const offer = s?.offers.find((o) => o.id === decodeURIComponent(offerMatch[2]));
      if (!offer) return fail(res, 404, 'notFound');
      return json(res, 200, { offer });
    }
    if (path === '/flights/quote' && req.method === 'POST') {
      const b = parse(); const s = state.flightSearches.get(b.searchId); const offer = s?.offers.find((o) => o.id === b.offerId);
      if (!offer) return json(res, 200, { price: null, changed: false, previous: null, unavailable: true });
      return json(res, 200, { price: offer.price, changed: false, previous: null, unavailable: false });
    }

    // ---- auth ----
    if (path === '/auth/sign-up' && req.method === 'POST') {
      const b = parse(); const email = String(b.email ?? '').toLowerCase();
      if (!b.name || !email || !b.password) return fail(res, 422, 'invalid');
      if (String(b.password).length < 8) return fail(res, 422, 'weak');
      if (state.accounts.has(email)) return fail(res, 409, 'exists');
      const id = createCustomer({ name: b.name, email, phone: b.phone ?? '', locale: b.locale ?? 'ar', password: b.password, attribution: b.attribution ?? null, acceptance: b.acceptance ?? null });
      return json(res, 201, issue(res, id));
    }
    if (path === '/auth/sign-in' && req.method === 'POST') {
      const b = parse(); const acc = state.accounts.get(String(b.email ?? '').toLowerCase());
      if (!acc || !b.password || hash(String(b.password), acc.salt) !== acc.hash) return fail(res, 401, 'invalid');   // one answer for both cases
      return json(res, 200, issue(res, acc.id));
    }
    if (path === '/auth/session' && req.method === 'GET') { if (!live) return fail(res, 401, 'unauthenticated'); return json(res, 200, { customer: publicProfile(state.customers.get(live.customerId)), expiresAt: iso(live.expiresAt) }); }
    if (path === '/auth/refresh' && req.method === 'POST') { if (!live) return fail(res, 401, 'unauthenticated'); state.sessions.delete(ck.no_session); return json(res, 200, issue(res, live.customerId)); }
    if (path === '/auth/sign-out' && req.method === 'POST') { if (ck.no_session) state.sessions.delete(ck.no_session); clearSessionCookies(res); res.writeHead(204); res.end(); return; }
    if (path === '/auth/password/reset-request' && req.method === 'POST') { const b = parse(); const acc = state.accounts.get(String(b.email ?? '').toLowerCase()); if (acc) { const tok = `rs_${hex(12)}`; state.resets.set(tok, { email: acc.email, expiresAt: now() + RESET_TTL_MS }); } return json(res, 202, {}); }
    if (path === '/auth/password/reset' && req.method === 'POST') { const b = parse(); const r = state.resets.get(b.token); if (!r || r.expiresAt < now()) return fail(res, 410, 'invalidToken'); if (String(b.password ?? '').length < 8) return fail(res, 422, 'weak'); const acc = state.accounts.get(r.email); acc.salt = hex(8); acc.hash = hash(b.password, acc.salt); state.resets.delete(b.token); for (const [sid, s] of state.sessions) if (s.customerId === acc.id) state.sessions.delete(sid); res.writeHead(204); res.end(); return; }
    if (path === '/auth/password/change' && req.method === 'POST') { if (!live) return fail(res, 401, 'unauthenticated'); const b = parse(); const acc = [...state.accounts.values()].find((a) => a.id === live.customerId); if (hash(String(b.current ?? ''), acc.salt) !== acc.hash) return fail(res, 422, 'invalid'); if (String(b.next ?? '').length < 8) return fail(res, 422, 'weak'); acc.salt = hex(8); acc.hash = hash(b.next, acc.salt); res.writeHead(204); res.end(); return; }

    // ---- everything under /me is the session's customer, nobody else's ----
    if (!path.startsWith('/me')) return fail(res, 404, 'notFound');
    if (!live) return fail(res, 401, 'unauthenticated');
    const me = state.customers.get(live.customerId); const D = me.data;
    const withRefs = (b) => ({ ...b });
    if (path === '/me' && req.method === 'GET') return json(res, 200, { customer: publicProfile(me) });
    if (path === '/me' && req.method === 'PATCH') { const b = parse(); if (b.name != null) me.profile.name = String(b.name).slice(0, 120); if (b.phone != null) me.profile.phone = String(b.phone).slice(0, 30); if (b.locale != null && ['ar', 'en'].includes(b.locale)) me.profile.locale = b.locale; return json(res, 200, { customer: publicProfile(me) }); }
    if (path === '/me/trips' && req.method === 'GET') return json(res, 200, { trips: D.trips });
    let m;
    if ((m = path.match(/^\/me\/trips\/([^/]+)$/)) && req.method === 'GET') { const t = D.trips.find((x) => x.id === decodeURIComponent(m[1])); if (!t) return fail(res, 404, 'notFound'); return json(res, 200, { trip: t, bookings: D.bookings.filter((b) => b.tripId === t.id).map(withRefs), documents: D.documents.filter((d) => d.tripId === t.id), payments: D.payments.filter((p) => D.bookings.some((b) => b.tripId === t.id && b.id === p.bookingId)) }); }
    if (path === '/me/bookings' && req.method === 'GET') return json(res, 200, { bookings: D.bookings.map(withRefs) });
    if ((m = path.match(/^\/me\/bookings\/([^/]+)$/)) && req.method === 'GET') { const b = D.bookings.find((x) => x.id === decodeURIComponent(m[1])); if (!b) return fail(res, 404, 'notFound'); return json(res, 200, { booking: b, trip: D.trips.find((t) => t.id === b.tripId) ?? null, documents: D.documents.filter((d) => d.bookingId === b.id), payments: D.payments.filter((p) => p.bookingId === b.id) }); }
    if (path === '/me/bookings/claim' && req.method === 'POST') {
      const b = parse(); if (!b.reference) return fail(res, 422, 'invalid');
      const existing = D.bookings.find((x) => x.id === b.reference); if (existing) return json(res, 200, { booking: existing });
      const tripId = `trip_${hex(4)}`; const dest = b.offer?.legs?.[0]?.to ?? null; const supervisorId = b.attribution?.supervisor ?? null;
      D.trips.push({ id: tripId, customerId: me.profile.id, titleAr: dest?.cityAr ?? b.context?.destination ?? 'رحلة', titleEn: dest?.cityEn ?? b.context?.destination ?? 'Trip', destination: dest ? { code: dest.code, cityAr: dest.cityAr, cityEn: dest.cityEn, countryAr: dest.countryAr ?? '', countryEn: dest.countryEn ?? '' } : { code: '', cityAr: '', cityEn: '', countryAr: '', countryEn: '' }, startDate: b.offer?.legs?.[0]?.departAt?.slice(0, 10) ?? b.context?.dates?.depart ?? null, endDate: b.offer?.legs?.at(-1)?.arriveAt?.slice(0, 10) ?? b.context?.dates?.return ?? null, services: [b.context?.service ?? 'flights'], status: 'upcoming', bookingIds: [b.reference], travellers: (b.context?.travellers?.adults ?? 1) + (b.context?.travellers?.children ?? 0) + (b.context?.travellers?.infants ?? 0), supervisorId, createdAt: iso(now()) });
      // Stage 16C: the offer's own revalidated price is the authoritative amount, same as the real backend —
      // never a client-submitted total. Stage 16B: payment status is never read from the client either.
      const booking = { id: b.reference, customerId: me.profile.id, tripId, service: b.context?.service ?? 'flights', status: 'confirmed', paymentStatus: 'unpaid', amount: b.offer?.price?.total ?? 0, currency: b.offer?.price?.currency ?? 'USD', supervisorId, ticketed: false, createdAt: iso(now()), detail: { route: b.offer ? b.offer.legs.map((l) => `${l.from.code} → ${l.to.code}`).join(' · ') : '', travellers: 1 } };
      D.bookings.push(booking);
      if (supervisorId && !me.profile.attribution) me.profile.attribution = { supervisorId, source: 'booking', at: iso(now()) };   // backend-owned attribution, set once
      return json(res, 201, { booking });
    }
    // ---- Stage 16B/16C: a minimal, always-succeeding payment intent + supplier booking, the same reason the
    // /flights/* stand-in above exists — so the production adapter's full journey (payment-intent call, then
    // reading back the real ticketed/flightBooking state) can be verified here, not just against dev adapters. ----
    const intentMatch = path.match(/^\/me\/bookings\/([^/]+)\/payment-intent$/);
    if (intentMatch && req.method === 'POST') {
      const bkg = D.bookings.find((x) => x.id === decodeURIComponent(intentMatch[1])); if (!bkg) return fail(res, 404, 'notFound');
      if (bkg.paymentStatus === 'paid') return fail(res, 409, 'conflict');
      bkg.paymentStatus = 'paid'; bkg.ticketed = true;
      const payment = { id: `pay_${hex(4)}`, bookingId: bkg.id, at: iso(now()), amount: bkg.amount, currency: bkg.currency, status: 'paid', reference: `CTPAY-${hex(3)}`, methodAr: 'دفع تجريبي (نموذج العقد)', methodEn: 'Contract test payment', verifiedAt: iso(now()), failureCode: null };
      D.payments.push(payment);
      return json(res, 201, { payment, client: { dev: true }, ticketed: true, flightBooking: { status: 'confirmed', reference: `CTPNR-${hex(3)}`, failureReason: null, updatedAt: iso(now()) } });
    }
    if (path === '/me/travellers' && req.method === 'GET') return json(res, 200, { travellers: D.travellers });
    if (path === '/me/travellers' && req.method === 'POST') { const b = parse(); const t = { id: `trv_${hex(4)}`, firstName: b.firstName, lastName: b.lastName, dob: b.dob, gender: b.gender, nationality: b.nationality, passport: b.passport, passportExpiry: b.passportExpiry }; D.travellers.push(t); return json(res, 201, { traveller: t }); }
    if ((m = path.match(/^\/me\/travellers\/([^/]+)$/)) && req.method === 'PATCH') { const t = D.travellers.find((x) => x.id === decodeURIComponent(m[1])); if (!t) return fail(res, 404, 'notFound'); Object.assign(t, parse()); return json(res, 200, { traveller: t }); }
    if ((m = path.match(/^\/me\/travellers\/([^/]+)$/)) && req.method === 'DELETE') { const i = D.travellers.findIndex((x) => x.id === decodeURIComponent(m[1])); if (i < 0) return fail(res, 404, 'notFound'); D.travellers.splice(i, 1); res.writeHead(204); res.end(); return; }
    if (path === '/me/documents' && req.method === 'GET') return json(res, 200, { documents: D.documents.map((d) => ({ ...d, booking: D.bookings.find((b) => b.id === d.bookingId) ?? null, trip: D.trips.find((t) => t.id === d.tripId) ?? null })) });
    if (path === '/me/documents' && req.method === 'POST') {
      const ct = req.headers['content-type'] ?? ''; if (!ct.startsWith('multipart/form-data')) return fail(res, 415, 'unsupported');
      const parts = parseMultipart(body, ct); const f = parts.file; if (!f) return fail(res, 422, 'invalid');
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(f.contentType)) return fail(res, 415, 'unsupported');
      if (f.body.length > 5 * 1024 * 1024) return fail(res, 413, 'tooLarge');
      const id = `doc_${hex(5)}`; const doc = { id, bookingId: null, tripId: null, type: 'customer', kind: 'customer', status: 'available', issuedAt: iso(now()), title: String(parts.title ?? f.filename).slice(0, 120), size: f.body.length, contentType: f.contentType, deletable: true };
      D.documents.push(doc); state.files.set(id, { customerId: me.profile.id, contentType: f.contentType, body: f.body }); return json(res, 201, { document: doc });
    }
    if ((m = path.match(/^\/me\/documents\/([^/]+)\/url$/)) && req.method === 'GET') { const d = D.documents.find((x) => x.id === decodeURIComponent(m[1])); if (!d || d.status !== 'available') return fail(res, 404, 'notFound'); return json(res, 200, signedUrl(origin, d.id, state.urlTtlMs)); }
    if ((m = path.match(/^\/me\/documents\/([^/]+)$/)) && req.method === 'DELETE') { const d = D.documents.find((x) => x.id === decodeURIComponent(m[1])); if (!d) return fail(res, 404, 'notFound'); if (!d.deletable) return fail(res, 403, 'forbidden'); D.documents = D.documents.filter((x) => x.id !== d.id); state.files.delete(d.id); res.writeHead(204); res.end(); return; }
    if (path === '/me/payments' && req.method === 'GET') { const page = Math.max(1, Number(url.searchParams.get('page')) || 1); const size = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 20)); const all = [...D.payments].sort((a, b) => b.at.localeCompare(a.at)); const items = all.slice((page - 1) * size, page * size).map((p) => ({ ...p, booking: D.bookings.find((b) => b.id === p.bookingId) ?? null })); return json(res, 200, { items, page, pageSize: size, total: all.length, nextPage: page * size < all.length ? page + 1 : null }); }
    if (path === '/me/notifications' && req.method === 'GET') return json(res, 200, { notifications: [...D.notifications].sort((a, b) => b.at.localeCompare(a.at)) });
    if (path === '/me/notifications/read' && req.method === 'POST') { const b = parse(); D.notifications.forEach((n) => { if (b.all || (b.ids ?? []).includes(n.id)) n.read = true; }); return json(res, 200, { notifications: D.notifications }); }
    if (path === '/me/legal/acceptance' && req.method === 'POST') { me.profile.acceptance = { ...parse(), at: iso(now()) }; res.writeHead(204); res.end(); return; }
    return fail(res, 404, 'notFound');
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}`, state, reset, close: () => new Promise((r) => server.close(r)) })));
}

if (process.argv[1] && process.argv[1].endsWith('contract-server.mjs')) { const { origin } = await startContractServer({ port: Number(process.env.PORT) || 8930 }); console.log(`contract server at ${origin}`); }
