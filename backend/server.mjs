// ============================================================================
// BACKEND / SERVER — the single origin the website talks to.
//
//   node --no-warnings=ExperimentalWarning server.mjs
//
// Order of every request: CORS (exact origins) → security headers → rate
// limit → session from the HttpOnly cookie → CSRF on state changes →
// route. Errors become { error: { code } } with the HTTP status; internals
// never leave the process. Test controls (/__test/*) exist only when
// BACKEND_TEST_CONTROLS=1, which production configuration refuses.
// ============================================================================
import { createServer } from 'node:http';
import { config, assertConfig } from './config.mjs';
import { migrate, q } from './db.mjs';
import { cors, json, empty, fail, HttpError, cookies, rateLimit, resetRateLimits, clientIp } from './http.mjs';
import { liveSession, customerById, sweepSessions, endAllSessions, publicCustomer } from './identity.mjs';
import { auth, me, file, legal, diagnostics } from './routes.mjs';
import { info, warn, error } from './logger.mjs';
import { fixtureLegal } from './fixtures.mjs';

const VERSION = '12.2';

export function createApp() {
  const test = config.testControls ? { faults: [], legal: null, urlTtlMs: null, requests: [] } : null;

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x'); const path = url.pathname; const origin = config.publicUrl || `http://${req.headers.host}`;
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    if (!path.startsWith('/files/')) res.setHeader('X-Frame-Options', 'DENY');   // files may be framed by the website only (frame-ancestors, set in routes.file)
    if (config.cookie.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (!cors(req, res)) { if (req.method === 'OPTIONS') return empty(res, 403); warn('cors.rejected', { origin: String(req.headers.origin).slice(0, 80) }); return fail(res, 403, 'forbidden'); }
    if (req.method === 'OPTIONS') return empty(res);
    if (test) test.requests.push({ method: req.method, path }); if (test && test.requests.length > 500) test.requests.shift();
    const ip = clientIp(req);

    // ---- test controls (never in production) ----
    if (path.startsWith('/__test/')) {
      if (!test) return fail(res, 404, 'notFound');
      const { readJson } = await import('./http.mjs'); const b = req.method === 'POST' ? await readJson(req) : {};
      const fx = await import('./fixtures.mjs');
      if (path === '/__test/reset') { fx.wipe(); fx.seed(); resetRateLimits(); test.faults = []; test.legal = null; test.urlTtlMs = null; test.requests = []; return json(res, 200, { ok: true }); }
      if (path === '/__test/fault') { test.faults.push({ status: b.status, times: b.times ?? 1, match: b.path ?? null, retryAfter: b.retryAfter ?? null }); return json(res, 200, { ok: true }); }
      if (path === '/__test/legal') { test.legal = b.supplied ? { version: b.version ?? 'fixture-1' } : null; return json(res, 200, { ok: true }); }
      if (path === '/__test/url-ttl') { test.urlTtlMs = b.ttlMs; return json(res, 200, { ok: true }); }
      if (path === '/__test/revoke') { if (b.customerId) endAllSessions(b.customerId); else q.run('DELETE FROM sessions'); return json(res, 200, { ok: true }); }
      if (path === '/__test/shorten-session') { q.run('UPDATE sessions SET expires_at = ?', Date.now() + (b.ms ?? 60000)); return json(res, 200, { ok: true }); }
      if (path === '/__test/state') return json(res, 200, { events: q.all('SELECT * FROM diagnostics ORDER BY id').map((r) => ({ ...JSON.parse(r.payload_json), event: r.event })), requests: test.requests.slice(-200), customers: q.all('SELECT * FROM customers').map(publicCustomer), sessions: q.get('SELECT COUNT(*) AS n FROM sessions').n, resets: q.all('SELECT r.token, c.email FROM reset_tokens r JOIN customers c ON c.id = r.customer_id'), outbox: q.all('SELECT channel, template, status FROM outbox') });
      return fail(res, 404, 'notFound');
    }
    if (test) {
      const fi = test.faults.findIndex((f) => f.times > 0 && (!f.match || path.includes(f.match)));
      if (fi >= 0) { const f = test.faults[fi]; f.times -= 1; if (f.times <= 0) test.faults.splice(fi, 1);
        if (f.status === 'timeout') { await new Promise((r) => setTimeout(r, 15000)); return empty(res, 504); }
        if (f.status === 'network') { req.socket.destroy(); return; }
        return fail(res, Number(f.status), { 500: 'unavailable', 503: 'unavailable', 429: 'rateLimited', 403: 'forbidden', 404: 'notFound', 401: 'unauthenticated' }[f.status] ?? 'failed', f.status === 429 ? { 'Retry-After': String(f.retryAfter ?? 5) } : {}); }
    }

    // ---- public routes ----
    if (path === '/health' && req.method === 'GET') return json(res, 200, { ok: true, environment: config.environment, version: VERSION, storage: config.storage, mailer: config.mailer, testControls: config.testControls });
    let m;
    if ((m = path.match(/^\/files\/([A-Za-z0-9_-]+)$/)) && req.method === 'GET') return file(req, res, m[1], url);
    if ((m = path.match(/^\/legal\/(terms|privacy)$/)) && req.method === 'GET') return legal(req, res, m[1], url, test?.legal ? (kind, locale) => fixtureLegal(kind, locale, test.legal.version) : null);
    if (path === '/diagnostics' && req.method === 'POST') return diagnostics(req, res);

    // ---- rate limits by class ----
    const cls = path.startsWith('/auth/') ? 'auth' : path === '/me/documents' && req.method === 'POST' ? 'upload' : 'api';
    const wait = rateLimit(`${cls}:${ip}`, config.rateLimits[cls]);
    if (wait) { warn('ratelimit.hit', { cls }); return fail(res, 429, 'rateLimited', { 'Retry-After': String(wait) }); }

    // ---- session + CSRF ----
    const ck = cookies(req); const session = liveSession(ck.no_session); const customer = session ? customerById(session.customer_id) : null;
    const ctx = { sid: ck.no_session ?? null, session: customer ? session : null, customer, ip, urlTtlMs: test?.urlTtlMs ?? undefined };
    if (['POST', 'PATCH', 'DELETE'].includes(req.method) && ctx.session) { const h = req.headers['x-csrf-token']; if (!h || h !== ctx.session.csrf) { warn('csrf.rejected', { path }); return fail(res, 403, 'forbidden'); } }

    // ---- /auth ----
    if (path === '/auth/sign-up' && req.method === 'POST') return auth.signUp(req, res, ctx);
    if (path === '/auth/sign-in' && req.method === 'POST') return auth.signIn(req, res, ctx);
    if (path === '/auth/session' && req.method === 'GET') return auth.session(req, res, ctx);
    if (path === '/auth/refresh' && req.method === 'POST') return auth.refresh(req, res, ctx);
    if (path === '/auth/sign-out' && req.method === 'POST') return auth.signOut(req, res, ctx);
    if (path === '/auth/password/reset-request' && req.method === 'POST') return auth.resetRequest(req, res, ctx);
    if (path === '/auth/password/reset' && req.method === 'POST') return auth.reset(req, res, ctx);
    if (path === '/auth/password/change' && req.method === 'POST') return auth.change(req, res, ctx);

    // ---- /me: the session's customer, nobody else ----
    if (!path.startsWith('/me')) return fail(res, 404, 'notFound');
    if (!ctx.session) return fail(res, 401, 'unauthenticated');
    if (path === '/me' && req.method === 'GET') return me.profile(req, res, ctx);
    if (path === '/me' && req.method === 'PATCH') return me.patch(req, res, ctx);
    if (path === '/me/trips' && req.method === 'GET') return me.trips(req, res, ctx);
    if ((m = path.match(/^\/me\/trips\/([^/]+)$/)) && req.method === 'GET') return me.trip(req, res, ctx, decodeURIComponent(m[1]));
    if (path === '/me/bookings' && req.method === 'GET') return me.bookings(req, res, ctx);
    if (path === '/me/bookings/claim' && req.method === 'POST') return me.claim(req, res, ctx);
    if ((m = path.match(/^\/me\/bookings\/([^/]+)$/)) && req.method === 'GET') return me.booking(req, res, ctx, decodeURIComponent(m[1]));
    if (path === '/me/travellers' && req.method === 'GET') return me.travellers(req, res, ctx);
    if (path === '/me/travellers' && req.method === 'POST') return me.travellerCreate(req, res, ctx);
    if ((m = path.match(/^\/me\/travellers\/([^/]+)$/)) && req.method === 'PATCH') return me.travellerPatch(req, res, ctx, decodeURIComponent(m[1]));
    if ((m = path.match(/^\/me\/travellers\/([^/]+)$/)) && req.method === 'DELETE') return me.travellerDelete(req, res, ctx, decodeURIComponent(m[1]));
    if (path === '/me/documents' && req.method === 'GET') return me.documents(req, res, ctx);
    if (path === '/me/documents' && req.method === 'POST') return me.documentUpload(req, res, ctx);
    if ((m = path.match(/^\/me\/documents\/([^/]+)\/url$/)) && req.method === 'GET') return me.documentUrl(req, res, ctx, decodeURIComponent(m[1]), origin);
    if ((m = path.match(/^\/me\/documents\/([^/]+)$/)) && req.method === 'DELETE') return me.documentDelete(req, res, ctx, decodeURIComponent(m[1]));
    if (path === '/me/payments' && req.method === 'GET') return me.payments(req, res, ctx, url);
    if (path === '/me/notifications' && req.method === 'GET') return me.notifications(req, res, ctx);
    if (path === '/me/notifications/read' && req.method === 'POST') return me.notificationsRead(req, res, ctx);
    if (path === '/me/legal/acceptance' && req.method === 'POST') return me.acceptance(req, res, ctx);
    return fail(res, 404, 'notFound');
  }

  const server = createServer(async (req, res) => {
    try { await handle(req, res); }
    catch (e) {
      if (e instanceof HttpError) { return fail(res, e.status, e.code, { ...(e.status === 429 && e.extra?.retryAfter ? { 'Retry-After': String(e.extra.retryAfter) } : {}), ...(e.status === 413 ? { Connection: 'close' } : {}) }); }
      error('request.failed', { path: req.url?.split('?')[0], method: req.method, kind: e?.name ?? 'Error' });
      if (!res.headersSent) fail(res, 500, 'unavailable'); else res.end();
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 15000;
  return server;
}

if (process.argv[1]?.endsWith('server.mjs')) {
  assertConfig(); migrate();
  const server = createApp();
  server.listen(config.port, config.host, () => info('server.listening', { host: config.host, port: config.port, environment: config.environment, testControls: config.testControls }));
  setInterval(() => sweepSessions(), 10 * 60 * 1000).unref();
  const stop = () => { info('server.stopping'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
