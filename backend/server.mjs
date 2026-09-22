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
import { auth, me, file, legal, diagnostics, paymentsWebhook, flights } from './routes.mjs';
import { registerDevPaymentProvider } from './payments.mjs';
import { registerDevFlightProvider } from './flights.mjs';
import { registerSmtpProvider, deliverOutbox } from './mailer.mjs';
import { liveSupervisorSession, supervisorById, sweepSupervisorSessions, endAllSupervisorSessions } from './supervisor.mjs';
import { supervisorAuth, supervisorMe, admin } from './supervisor-routes.mjs';
import { liveStaffSession, staffById, sweepStaffSessions, endAllStaffSessions, publicStaff } from './staff.mjs';
import { staffAuth, operations, services as opsServices, dashboard } from './staff-routes.mjs';
import { info, warn, error } from './logger.mjs';
import { fixtureLegal } from './fixtures.mjs';

const VERSION = '16.4';

// Stage 16B/16C/16D: the only provider ever registered is whatever config.paymentProvider/config.flightProvider/
// config.mailer names — config.mjs already refuses an unconfigured value, so none of them can silently become
// the production fallback (§27: Email = CONNECTED only when this line actually runs for it).
if (config.paymentProvider === 'dev') registerDevPaymentProvider(config.paymentDevSecret);
if (config.flightProvider === 'dev') registerDevFlightProvider();
if (config.mailer === 'smtp') registerSmtpProvider(config.smtp);

export function createApp() {
  const test = config.testControls ? { faults: [], legal: null, urlTtlMs: null, requests: [] } : null;

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x'); const path = url.pathname; const origin = config.publicUrl || `http://${req.headers.host}`;
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (!path.startsWith('/files/')) {
      // /files/:id sets its own inline-friendly CSP (routes.mjs); every other response here is API JSON, so
      // it never needs style/script sources — a locked-down default-src is strictly tighter than that route's.
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      res.setHeader('X-Frame-Options', 'DENY');
    }
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
      if (path === '/__test/revoke') { if (b.customerId) endAllSessions(b.customerId); else if (b.supervisorId) endAllSupervisorSessions(b.supervisorId); else if (b.staffId) endAllStaffSessions(b.staffId); else { q.run('DELETE FROM sessions'); q.run('DELETE FROM supervisor_sessions'); q.run('DELETE FROM staff_sessions'); } return json(res, 200, { ok: true }); }
      if (path === '/__test/shorten-session') { q.run('UPDATE sessions SET expires_at = ?', Date.now() + (b.ms ?? 60000)); return json(res, 200, { ok: true }); }
      // Stage 16D: delivery runs on its own 15s interval in production; tests trigger it on demand instead of
      // waiting — the SAME deliverOutbox() the interval calls, nothing test-only about the delivery logic itself.
      if (path === '/__test/deliver-outbox') { if (b.force) q.run("UPDATE outbox SET next_attempt_at = NULL WHERE status = 'retrying'"); return json(res, 200, await deliverOutbox({ limit: b.limit ?? 20 })); }
      if (path === '/__test/enqueue') { const { enqueue } = await import('./mailer.mjs'); return json(res, 200, enqueue({ customerId: b.customerId ?? null, recipient: b.recipient ?? null, template: b.template ?? 'test', payload: b.payload ?? {}, idempotencyKey: b.idempotencyKey ?? null })); }
      if (path === '/__test/state') return json(res, 200, { events: q.all('SELECT * FROM diagnostics ORDER BY id').map((r) => ({ ...JSON.parse(r.payload_json), event: r.event })), requests: test.requests.slice(-200), customers: q.all('SELECT * FROM customers').map(publicCustomer), sessions: q.get('SELECT COUNT(*) AS n FROM sessions').n, resets: q.all('SELECT r.token, c.email FROM reset_tokens r JOIN customers c ON c.id = r.customer_id'), outbox: q.all('SELECT * FROM outbox ORDER BY created_at'), staff: q.all('SELECT * FROM staff').map(publicStaff), auditCount: q.get('SELECT COUNT(*) AS n FROM audit_events').n });
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
    // /health only: cheap, and needs to stay available for frequent uptime checks even under load — every other
    // route (including the public ones just below) goes through the rate-limit gate first. /files, /legal and
    // /diagnostics used to be matched here, ahead of the gate, which let an unauthenticated caller drive unlimited
    // DB writes through /diagnostics (an INSERT + a range DELETE on every call) at no cost to themselves.
    if (path === '/health' && req.method === 'GET') return json(res, 200, { ok: true, environment: config.environment, version: VERSION, storage: config.storage, mailer: config.mailer, paymentProvider: config.paymentProvider, flightProvider: config.flightProvider, testControls: config.testControls });
    let m;

    // ---- rate limits by class ----
    const cls = path.startsWith('/auth/') || path.startsWith('/supervisor/auth/') || path.startsWith('/staff/auth/') ? 'auth'
      : path === '/me/documents' && req.method === 'POST' ? 'upload'
      : path === '/diagnostics' && req.method === 'POST' ? 'diagnostics'
      : 'api';
    const wait = rateLimit(`${cls}:${ip}`, config.rateLimits[cls]);
    if (wait) { warn('ratelimit.hit', { cls }); return fail(res, 429, 'rateLimited', { 'Retry-After': String(wait) }); }

    // Shared with auth.signUp below (§13's backend-enforced acceptance) so both agree on whether legal is configured.
    const legalOverride = test?.legal ? (kind, locale) => fixtureLegal(kind, locale, test.legal.version) : null;
    if ((m = path.match(/^\/files\/([A-Za-z0-9_-]+)$/)) && req.method === 'GET') return file(req, res, m[1], url);
    if ((m = path.match(/^\/legal\/(terms|privacy)$/)) && req.method === 'GET') return legal(req, res, m[1], url, legalOverride);
    if (path === '/diagnostics' && req.method === 'POST') return diagnostics(req, res);

    // ---- Stage 16B: /payments/webhook/:provider — a real external provider's own server calling us, never a
    // browser; authenticated by its signature over the raw body (backend/payments.mjs), not by a cookie session. ----
    if ((m = path.match(/^\/payments\/webhook\/([^/]+)$/)) && req.method === 'POST') return paymentsWebhook(req, res, decodeURIComponent(m[1]));

    // ---- Stage 16C: /flights/* — public, no session (search happens before sign-in); server-validated
    // (backend/flights.mjs), never trusting a browser parameter straight through to the supplier. ----
    if (path === '/flights/search' && req.method === 'POST') return flights.search(req, res);
    if ((m = path.match(/^\/flights\/offers\/([^/]+)\/([^/]+)$/)) && req.method === 'GET') return flights.offer(req, res, decodeURIComponent(m[1]), decodeURIComponent(m[2]));
    if (path === '/flights/quote' && req.method === 'POST') return flights.quote(req, res);

    // ---- session + CSRF: customer and supervisor sessions are read from DIFFERENT cookies into DIFFERENT ctx fields —
    // a route handler for one role never even receives the other's session object, so there is no field to confuse. ----
    const ck = cookies(req); const session = liveSession(ck.no_session); const customer = session ? customerById(session.customer_id) : null;
    const supervisorSession = liveSupervisorSession(ck.no_supervisor_session); const supervisor = supervisorSession ? supervisorById(supervisorSession.supervisor_id) : null;
    const staffSession = liveStaffSession(ck.no_ops_session); const staffMember = staffSession ? staffById(staffSession.staff_id) : null;
    const ctx = { sid: ck.no_session ?? null, session: customer ? session : null, customer, supervisorSid: ck.no_supervisor_session ?? null, supervisorSession: supervisor ? supervisorSession : null, supervisor, staffSid: ck.no_ops_session ?? null, staffSession: staffMember ? staffSession : null, staff: staffMember, ip, urlTtlMs: test?.urlTtlMs ?? undefined };
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
      const live = ctx.session ?? ctx.supervisorSession ?? ctx.staffSession;
      if (live) { const h = req.headers['x-csrf-token']; if (!h || h !== live.csrf) { warn('csrf.rejected', { path }); return fail(res, 403, 'forbidden'); } }
    }

    // ---- /auth ----
    if (path === '/auth/sign-up' && req.method === 'POST') return auth.signUp(req, res, ctx, legalOverride);
    if (path === '/auth/sign-in' && req.method === 'POST') return auth.signIn(req, res, ctx);
    if (path === '/auth/session' && req.method === 'GET') return auth.session(req, res, ctx);
    if (path === '/auth/refresh' && req.method === 'POST') return auth.refresh(req, res, ctx);
    if (path === '/auth/sign-out' && req.method === 'POST') return auth.signOut(req, res, ctx);
    if (path === '/auth/password/reset-request' && req.method === 'POST') return auth.resetRequest(req, res, ctx);
    if (path === '/auth/password/reset' && req.method === 'POST') return auth.reset(req, res, ctx);
    if (path === '/auth/password/change' && req.method === 'POST') return auth.change(req, res, ctx);

    // ---- /supervisor/auth, /supervisor/me: a DIFFERENT session from /me — the customer session above is never accepted here ----
    if (path === '/supervisor/auth/sign-in' && req.method === 'POST') return supervisorAuth.signIn(req, res, ctx);
    if (path === '/supervisor/auth/session' && req.method === 'GET') return supervisorAuth.session(req, res, ctx);
    if (path === '/supervisor/auth/refresh' && req.method === 'POST') return supervisorAuth.refresh(req, res, ctx);
    if (path === '/supervisor/auth/sign-out' && req.method === 'POST') return supervisorAuth.signOut(req, res, ctx);
    if (path === '/supervisor/auth/password/reset-request' && req.method === 'POST') return supervisorAuth.resetRequest(req, res, ctx);
    if (path === '/supervisor/auth/password/reset' && req.method === 'POST') return supervisorAuth.reset(req, res, ctx);
    if (path === '/supervisor/auth/password/change' && req.method === 'POST') return supervisorAuth.change(req, res, ctx);
    if (path === '/admin/attribution/reassign' && req.method === 'POST') return admin.reassign(req, res, ctx);
    if (path.startsWith('/supervisor/me')) {
      if (!ctx.supervisorSession) return fail(res, 401, 'unauthenticated');
      if (path === '/supervisor/me' && req.method === 'GET') return supervisorMe.profile(req, res, ctx);
      if (path === '/supervisor/me' && req.method === 'PATCH') return supervisorMe.patch(req, res, ctx);
      if (path === '/supervisor/me/customers' && req.method === 'GET') return supervisorMe.customers(req, res, ctx, url);
      if ((m = path.match(/^\/supervisor\/me\/customers\/([^/]+)$/)) && req.method === 'GET') return supervisorMe.customer(req, res, ctx, decodeURIComponent(m[1]));
      if (path === '/supervisor/me/bookings' && req.method === 'GET') return supervisorMe.bookings(req, res, ctx, url);
      if ((m = path.match(/^\/supervisor\/me\/bookings\/([^/]+)$/)) && req.method === 'GET') return supervisorMe.booking(req, res, ctx, decodeURIComponent(m[1]));
      if (path === '/supervisor/me/leads' && req.method === 'GET') return supervisorMe.leads(req, res, ctx, url);
      if ((m = path.match(/^\/supervisor\/me\/leads\/([^/]+)$/)) && req.method === 'PATCH') return supervisorMe.leadPatch(req, res, ctx, decodeURIComponent(m[1]));
      if (path === '/supervisor/me/revenue' && req.method === 'GET') return supervisorMe.revenue(req, res, ctx, url);
      if (path === '/supervisor/me/performance' && req.method === 'GET') return supervisorMe.performance(req, res, ctx, url);
      if (path === '/supervisor/me/commissions' && req.method === 'GET') return supervisorMe.commissions(req, res, ctx, url);
      if (path === '/supervisor/me/notifications' && req.method === 'GET') return supervisorMe.notifications(req, res, ctx);
      if (path === '/supervisor/me/notifications/read' && req.method === 'POST') return supervisorMe.notificationsRead(req, res, ctx);
      return fail(res, 404, 'notFound');
    }

    // ---- /staff/auth: a THIRD session, never accepted by /me or /supervisor/me and vice versa ----
    if (path === '/staff/auth/sign-in' && req.method === 'POST') return staffAuth.signIn(req, res, ctx);
    if (path === '/staff/auth/session' && req.method === 'GET') return staffAuth.session(req, res, ctx);
    if (path === '/staff/auth/refresh' && req.method === 'POST') return staffAuth.refresh(req, res, ctx);
    if (path === '/staff/auth/sign-out' && req.method === 'POST') return staffAuth.signOut(req, res, ctx);
    if (path === '/staff/auth/password/reset-request' && req.method === 'POST') return staffAuth.resetRequest(req, res, ctx);
    if (path === '/staff/auth/password/reset' && req.method === 'POST') return staffAuth.reset(req, res, ctx);
    if (path === '/staff/auth/password/change' && req.method === 'POST') return staffAuth.change(req, res, ctx);

    // ---- Stage 15: /services, /operations, /bookings/:id/*, /documents/:id/review, /documents/requirements,
    // /notifications/templates|history — every one requires a live STAFF session; the specific permission each
    // action needs is checked inside staff-routes.mjs (backend/staff.mjs requirePermission), never here alone. ----
    if (path === '/services' && req.method === 'GET') { if (!ctx.staffSession) return fail(res, 401, 'unauthenticated'); return opsServices.list(req, res, ctx); }
    if ((m = path.match(/^\/services\/([^/]+)$/)) && req.method === 'GET') { if (!ctx.staffSession) return fail(res, 401, 'unauthenticated'); return opsServices.one(req, res, ctx, decodeURIComponent(m[1])); }
    if ((m = path.match(/^\/services\/([^/]+)$/)) && req.method === 'PATCH') { if (!ctx.staffSession) return fail(res, 401, 'unauthenticated'); return opsServices.update(req, res, ctx, decodeURIComponent(m[1])); }
    if ((m = path.match(/^\/services\/([^/]+)\/workflow$/)) && req.method === 'GET') { if (!ctx.staffSession) return fail(res, 401, 'unauthenticated'); return opsServices.workflow(req, res, ctx, decodeURIComponent(m[1])); }
    if ((m = path.match(/^\/services\/([^/]+)\/workflow$/)) && req.method === 'POST') { if (!ctx.staffSession) return fail(res, 401, 'unauthenticated'); return opsServices.workflowUpdate(req, res, ctx, decodeURIComponent(m[1])); }
    if ((m = path.match(/^\/services\/([^/]+)\/document-requirements$/)) && req.method === 'GET') { if (!ctx.staffSession) return fail(res, 401, 'unauthenticated'); return opsServices.documentRequirements(req, res, ctx, decodeURIComponent(m[1])); }
    if ((m = path.match(/^\/services\/([^/]+)\/document-requirements$/)) && req.method === 'POST') { if (!ctx.staffSession) return fail(res, 401, 'unauthenticated'); return opsServices.documentRequirementAdd(req, res, ctx, decodeURIComponent(m[1])); }

    // ---- Stage 14: /admin/* — the management/oversight layer ABOVE the Stage 15 operational domain. A live staff
    // session is required for all of these; the specific permission each action needs is checked inside
    // staff-routes.mjs's `dashboard` object (backend/staff.mjs requirePermission), never here alone. This is
    // distinct from the pre-existing bearer-token '/admin/attribution/reassign' route matched above, which stays
    // untouched at its exact path for compatibility. ----
    if (path.startsWith('/admin/')) {
      if (!ctx.staffSession) return fail(res, 401, 'unauthenticated');
      if (path === '/admin/overview' && req.method === 'GET') return dashboard.overview(req, res, ctx);
      if (path === '/admin/search' && req.method === 'GET') return dashboard.search(req, res, ctx, url);
      if (path === '/admin/customers' && req.method === 'GET') return dashboard.customers(req, res, ctx, url);
      if ((m = path.match(/^\/admin\/customers\/([^/]+)$/)) && req.method === 'GET') return dashboard.customer(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/admin\/customers\/([^/]+)\/reassign$/)) && req.method === 'POST') return dashboard.customerReassign(req, res, ctx, decodeURIComponent(m[1]));
      if (path === '/admin/supervisors' && req.method === 'GET') return dashboard.supervisors(req, res, ctx, url);
      if (path === '/admin/supervisors' && req.method === 'POST') return dashboard.supervisorCreate(req, res, ctx);
      if ((m = path.match(/^\/admin\/supervisors\/([^/]+)$/)) && req.method === 'GET') return dashboard.supervisor(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/admin\/supervisors\/([^/]+)$/)) && req.method === 'PATCH') return dashboard.supervisorUpdate(req, res, ctx, decodeURIComponent(m[1]));
      if (path === '/admin/destinations' && req.method === 'GET') return dashboard.destinations(req, res, ctx, url);
      if (path === '/admin/destinations' && req.method === 'POST') return dashboard.destinationCreate(req, res, ctx);
      if ((m = path.match(/^\/admin\/destinations\/([^/]+)$/)) && req.method === 'GET') return dashboard.destination(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/admin\/destinations\/([^/]+)$/)) && req.method === 'PATCH') return dashboard.destinationUpdate(req, res, ctx, decodeURIComponent(m[1]));
      if (path === '/admin/offers' && req.method === 'GET') return dashboard.offers(req, res, ctx, url);
      if (path === '/admin/offers' && req.method === 'POST') return dashboard.offerCreate(req, res, ctx);
      if ((m = path.match(/^\/admin\/offers\/([^/]+)$/)) && req.method === 'GET') return dashboard.offer(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/admin\/offers\/([^/]+)$/)) && req.method === 'PATCH') return dashboard.offerUpdate(req, res, ctx, decodeURIComponent(m[1]));
      if (path === '/admin/leads' && req.method === 'GET') return dashboard.leads(req, res, ctx, url);
      if (path === '/admin/attribution-events' && req.method === 'GET') return dashboard.attributionEvents(req, res, ctx, url);
      if (path === '/admin/payments' && req.method === 'GET') return dashboard.payments(req, res, ctx, url);
      if (path === '/admin/documents' && req.method === 'GET') return dashboard.documents(req, res, ctx, url);
      if (path === '/admin/reports/bookings' && req.method === 'GET') return dashboard.reportBookings(req, res, ctx);
      if (path === '/admin/reports/operations' && req.method === 'GET') return dashboard.reportOperations(req, res, ctx);
      if (path === '/admin/reports/suppliers' && req.method === 'GET') return dashboard.reportSuppliers(req, res, ctx);
      if (path === '/admin/reports/documents' && req.method === 'GET') return dashboard.reportDocuments(req, res, ctx);
      if (path === '/admin/reports/notifications' && req.method === 'GET') return dashboard.reportNotifications(req, res, ctx);
      if (path === '/admin/staff' && req.method === 'GET') return dashboard.staffList(req, res, ctx);
      if (path === '/admin/staff' && req.method === 'POST') return dashboard.staffCreate(req, res, ctx);
      if ((m = path.match(/^\/admin\/staff\/([^/]+)\/active$/)) && req.method === 'POST') return dashboard.staffActive(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/admin\/staff\/([^/]+)\/permissions$/)) && req.method === 'POST') return dashboard.staffPermissions(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/admin\/staff\/([^/]+)\/role$/)) && req.method === 'POST') return dashboard.staffRole(req, res, ctx, decodeURIComponent(m[1]));
      if (path === '/admin/rules' && req.method === 'GET') return dashboard.rules(req, res, ctx, url);
      if (path === '/admin/rules/pending' && req.method === 'GET') return dashboard.pendingDecisions(req, res, ctx);
      if (path === '/admin/rules/matrix' && req.method === 'GET') return dashboard.ruleMatrix(req, res, ctx);
      if ((m = path.match(/^\/admin\/rules\/([^/]+)$/)) && req.method === 'GET') return dashboard.rule(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/admin\/rules\/([^/]+)$/)) && req.method === 'PATCH') return dashboard.ruleUpdate(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/admin\/rules\/([^/]+)\/history$/)) && req.method === 'GET') return dashboard.ruleHistory(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/admin\/rules\/([^/]+)\/activate$/)) && req.method === 'POST') return dashboard.ruleActivate(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/admin\/rules\/([^/]+)\/disable$/)) && req.method === 'POST') return dashboard.ruleDisable(req, res, ctx, decodeURIComponent(m[1]));
      return fail(res, 404, 'notFound');
    }

    if (path.startsWith('/operations/') || path === '/bookings' || path.startsWith('/bookings/') || path.startsWith('/documents/') || path.startsWith('/notifications/')) {
      if (!ctx.staffSession) return fail(res, 401, 'unauthenticated');
      if (path === '/operations/meta' && req.method === 'GET') return operations.meta(req, res, ctx);
      if (path === '/operations/tasks' && req.method === 'GET') return operations.tasks(req, res, ctx, url);
      if (path === '/operations/tasks' && req.method === 'POST') return operations.taskCreate(req, res, ctx);
      if ((m = path.match(/^\/operations\/tasks\/([^/]+)$/)) && req.method === 'GET') return operations.task(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/operations\/tasks\/([^/]+)\/assign$/)) && req.method === 'POST') return operations.taskAssign(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/operations\/tasks\/([^/]+)\/status$/)) && req.method === 'POST') return operations.taskStatus(req, res, ctx, decodeURIComponent(m[1]));
      if (path === '/operations/escalations' && req.method === 'GET') return operations.escalations(req, res, ctx, url);
      if (path === '/operations/escalations' && req.method === 'POST') return operations.escalationCreate(req, res, ctx);
      if ((m = path.match(/^\/operations\/escalations\/([^/]+)\/status$/)) && req.method === 'POST') return operations.escalationStatus(req, res, ctx, decodeURIComponent(m[1]));
      if (path === '/operations/suppliers' && req.method === 'GET') return operations.suppliers(req, res, ctx);
      if (path === '/operations/suppliers' && req.method === 'POST') return operations.supplierCreate(req, res, ctx);
      if (path === '/operations/audit' && req.method === 'GET') return operations.audit(req, res, ctx, url);
      if (path === '/documents/requirements' && req.method === 'GET') return operations.documentRequirements(req, res, ctx);
      if ((m = path.match(/^\/documents\/([^/]+)\/review$/)) && req.method === 'POST') return operations.documentReviewSubmit(req, res, ctx, decodeURIComponent(m[1]));
      if (path === '/notifications/templates' && req.method === 'GET') return operations.templates(req, res, ctx);
      if (path === '/notifications/templates' && req.method === 'POST') return operations.templateUpsert(req, res, ctx);
      if (path === '/notifications/history' && req.method === 'GET') return operations.notificationHistory(req, res, ctx, url);
      if (path === '/bookings' && req.method === 'GET') return operations.bookings(req, res, ctx, url);
      if ((m = path.match(/^\/bookings\/([^/]+)$/)) && req.method === 'GET') return operations.booking(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/bookings\/([^/]+)\/status$/)) && req.method === 'POST') return operations.bookingStatus(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/bookings\/([^/]+)\/assign$/)) && req.method === 'POST') return operations.bookingAssign(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/bookings\/([^/]+)\/notes$/)) && req.method === 'GET') return operations.bookingNotes(req, res, ctx, decodeURIComponent(m[1]), url);
      if ((m = path.match(/^\/bookings\/([^/]+)\/notes$/)) && req.method === 'POST') return operations.bookingNoteAdd(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/bookings\/([^/]+)\/supplier$/)) && req.method === 'POST') return operations.bookingSupplierAssign(req, res, ctx, decodeURIComponent(m[1]));
      if ((m = path.match(/^\/operations\/booking-suppliers\/([^/]+)$/)) && req.method === 'POST') return operations.bookingSupplierUpdate(req, res, ctx, decodeURIComponent(m[1]));
      return fail(res, 404, 'notFound');
    }

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
    if ((m = path.match(/^\/me\/bookings\/([^/]+)\/payment-intent$/)) && req.method === 'POST') return me.paymentIntent(req, res, ctx, decodeURIComponent(m[1]));
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
  setInterval(() => sweepSupervisorSessions(), 10 * 60 * 1000).unref();
  setInterval(() => sweepStaffSessions(), 10 * 60 * 1000).unref();
  // Stage 16D §4/§9: delivery runs on its own schedule, never inside the request that queued a message — a
  // provider outage here can never lose an event (it just stays 'queued'/'retrying') or affect the booking/
  // payment/document operation that triggered it. No-ops immediately when config.mailer === 'none'.
  setInterval(() => { deliverOutbox().catch((e) => error('mailer.deliverOutbox.failed', { kind: e?.name ?? 'Error' })); }, 15000).unref();
  const stop = () => { info('server.stopping'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
