// ============================================================================
// BACKEND / SUPERVISOR ROUTES — Stage 13, §25. /supervisor/auth/* and
// /supervisor/me/* mirror the shape of /auth/* and /me/* (docs/INTEGRATION.md
// §3) but read a DIFFERENT session (supervisor_sessions, cookie
// no_supervisor_session) so a customer session can never reach these routes
// and a supervisor session can never reach /me/*. `admin.reassign` is the
// one entry point prepared for the future Admin Dashboard (§27, §40); it is
// gated by a bearer token (BACKEND_ADMIN_TOKEN) that is unset by default,
// so the endpoint 404s until an operator explicitly configures it.
// ============================================================================
import { config } from './config.mjs';
import { q, now } from './db.mjs';
import { json, empty, fail, HttpError, readJson, str, isEmail, setSupervisorSessionCookies, clearSupervisorSessionCookies } from './http.mjs';
import {
  privateSupervisor, publicSupervisor, supervisorById, verifySupervisorPassword, changeSupervisorPassword, setSupervisorPassword,
  createSupervisorSession, endSupervisorSession, createSupervisorReset, consumeSupervisorReset,
  supervisorCustomers, supervisorCustomer, supervisorBookings, supervisorBooking, supervisorLeads, updateLeadStatus, LEAD_STATUSES,
  supervisorRevenue, supervisorPerformance, supervisorCommissions, nSupervisorNotification, reassignAttribution, activeSupervisor,
} from './supervisor.mjs';
import { enqueue } from './mailer.mjs';
import { normEmail } from './identity.mjs';
import { info, warn } from './logger.mjs';

const sessionAnswer = (res, s) => { const sess = createSupervisorSession(s.id); setSupervisorSessionCookies(res, sess.id, sess.csrf, sess.maxAge); return { supervisor: privateSupervisor(s), expiresAt: sess.expiresAt }; };
const period = (url) => { const p = url.searchParams.get('period'); const days = { today: 1, week: 7, month: 30 }[p]; return days ? new Date(Date.now() - days * 864e5).toISOString() : null; };
const page = (url) => Math.max(1, Number(url.searchParams.get('page')) || 1);
const pageSize = (url, d = 20) => Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || d));

/* ---- /supervisor/auth --------------------------------------------------- */
export const supervisorAuth = {
  // No sign-up: supervisor accounts are provisioned by the business (future Admin Dashboard, §4/§40), never self-registered.
  async signIn(req, res, ctx) { const b = await readJson(req); const s = verifySupervisorPassword({ email: b.email, password: b.password, ip: ctx.ip }); return json(res, 200, sessionAnswer(res, s)); },
  session(req, res, ctx) { if (!ctx.supervisorSession) return fail(res, 401, 'unauthenticated'); return json(res, 200, { supervisor: privateSupervisor(ctx.supervisor), expiresAt: new Date(ctx.supervisorSession.expires_at).toISOString() }); },
  refresh(req, res, ctx) { if (!ctx.supervisorSession) return fail(res, 401, 'unauthenticated'); endSupervisorSession(ctx.supervisorSession.id); return json(res, 200, sessionAnswer(res, ctx.supervisor)); },
  signOut(req, res, ctx) { endSupervisorSession(ctx.supervisorSid); clearSupervisorSessionCookies(res); return empty(res); },
  async resetRequest(req, res) {
    const b = await readJson(req); const email = normEmail(b.email);
    if (isEmail(email)) { const r = createSupervisorReset(email); if (r) enqueue({ customerId: null, template: 'supervisor-password-reset', payload: { token: r.token, locale: 'ar', supervisorId: r.supervisor.id } }); }
    return json(res, 202, {});   // never reveals whether the address exists — same neutral answer as the customer flow
  },
  async reset(req, res) { const b = await readJson(req); const sid = consumeSupervisorReset(str(b.token, 80), b.password); info('supervisor.auth.reset', { ok: true }); return empty(res); },
  async change(req, res, ctx) { if (!ctx.supervisorSession) return fail(res, 401, 'unauthenticated'); const b = await readJson(req); changeSupervisorPassword(ctx.supervisor.id, b.current, b.next); return empty(res); },
};

/* ---- /supervisor/me ------------------------------------------------------ */
export const supervisorMe = {
  profile(req, res, ctx) { return json(res, 200, { supervisor: privateSupervisor(ctx.supervisor) }); },
  // Only the fields the business allows a supervisor to change themselves (§21): never slug, id, status, credentials, or
  // anything commission/permission related — those stay admin-only, prepared but unreachable from this route.
  async patch(req, res, ctx) {
    const b = await readJson(req); const s = ctx.supervisor;
    const bioAr = b.bioAr != null ? str(b.bioAr, 600) : s.bio_ar; const bioEn = b.bioEn != null ? str(b.bioEn, 600) : s.bio_en;
    const phone = b.phone != null ? str(b.phone, 30) : s.phone; const whatsapp = b.whatsapp != null ? str(b.whatsapp, 30) : s.whatsapp;
    const city = b.city != null ? str(b.city, 60) : s.city;
    const languages = Array.isArray(b.languages) ? JSON.stringify(b.languages.filter((v) => typeof v === 'string').slice(0, 8)) : s.languages_json;
    const specialties = Array.isArray(b.specialties) ? JSON.stringify(b.specialties.filter((v) => typeof v === 'string').slice(0, 12)) : s.specialties_json;
    const prefs = b.notificationPrefs && typeof b.notificationPrefs === 'object' ? JSON.stringify(b.notificationPrefs) : s.notification_prefs_json;
    q.run('UPDATE supervisors SET bio_ar = ?, bio_en = ?, phone = ?, whatsapp = ?, city = ?, languages_json = ?, specialties_json = ?, notification_prefs_json = ?, updated_at = ? WHERE id = ?',
      bioAr, bioEn, phone, whatsapp, city, languages, specialties, prefs, now(), s.id);
    return json(res, 200, { supervisor: privateSupervisor(supervisorById(s.id)) });
  },
  customers(req, res, ctx, url) { return json(res, 200, supervisorCustomers(ctx.supervisor.id, { search: str(url.searchParams.get('search') ?? '', 80), page: page(url), pageSize: pageSize(url) })); },
  customer(req, res, ctx, id) { const c = supervisorCustomer(ctx.supervisor.id, id); if (!c) return fail(res, 404, 'notFound'); return json(res, 200, { customer: c }); },
  bookings(req, res, ctx, url) { return json(res, 200, supervisorBookings(ctx.supervisor.id, { status: str(url.searchParams.get('status') ?? '', 20), service: str(url.searchParams.get('service') ?? '', 20), page: page(url), pageSize: pageSize(url) })); },
  booking(req, res, ctx, id) { const b = supervisorBooking(ctx.supervisor.id, id); if (!b) return fail(res, 404, 'notFound'); return json(res, 200, { booking: b }); },
  leads(req, res, ctx, url) { return json(res, 200, supervisorLeads(ctx.supervisor.id, { status: str(url.searchParams.get('status') ?? '', 20), page: page(url), pageSize: pageSize(url) })); },
  async leadPatch(req, res, ctx, id) { const b = await readJson(req); const l = updateLeadStatus(ctx.supervisor.id, id, str(b.status, 20)); if (!l) return fail(res, 404, 'notFound'); return json(res, 200, { lead: l }); },
  revenue(req, res, ctx, url) { return json(res, 200, supervisorRevenue(ctx.supervisor.id, { since: period(url) })); },
  performance(req, res, ctx, url) { return json(res, 200, supervisorPerformance(ctx.supervisor.id, { since: period(url) })); },
  commissions(req, res, ctx, url) { return json(res, 200, supervisorCommissions(ctx.supervisor.id, { page: page(url), pageSize: pageSize(url) })); },
  notifications(req, res, ctx) { return json(res, 200, { notifications: q.all('SELECT * FROM supervisor_notifications WHERE supervisor_id = ? ORDER BY at DESC', ctx.supervisor.id).map(nSupervisorNotification) }); },
  async notificationsRead(req, res, ctx) { const b = await readJson(req); const sid = ctx.supervisor.id; if (b.all) q.run('UPDATE supervisor_notifications SET read = 1 WHERE supervisor_id = ?', sid); else for (const id of (Array.isArray(b.ids) ? b.ids : []).slice(0, 200)) q.run('UPDATE supervisor_notifications SET read = 1 WHERE id = ? AND supervisor_id = ?', String(id), sid); return json(res, 200, { notifications: q.all('SELECT * FROM supervisor_notifications WHERE supervisor_id = ? ORDER BY at DESC', sid).map(nSupervisorNotification) }); },
};

/* ---- /admin — prepared for Stage 14, disabled unless BACKEND_ADMIN_TOKEN is set (§27, §40) ------------------------- */
export const admin = {
  async reassign(req, res, ctx) {
    if (!config.adminToken) return fail(res, 404, 'notFound');   // not configured: the endpoint does not exist as far as any caller can tell
    const given = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (given.length !== config.adminToken.length || given !== config.adminToken) { warn('admin.auth.rejected', {}); return fail(res, 403, 'forbidden'); }
    const b = await readJson(req); const customerId = str(b.customerId, 40); const supervisorId = str(b.supervisorId, 40) || null;
    if (!customerId) throw new HttpError(422, 'invalid');
    if (supervisorId && !activeSupervisor(supervisorId)) throw new HttpError(422, 'invalid');
    const result = reassignAttribution(customerId, supervisorId, 'admin');
    info('admin.attribution.reassigned', {});
    return json(res, 200, { attribution: result });
  },
};

/** The public-safe row for the (future) directory endpoint used only by tests today; the live public profile still reads assets/js/data/supervisors.js (§5/§6 — no redesign). */
export const supervisorPublicLookup = (slug) => { const s = q.get('SELECT * FROM supervisors WHERE slug = ? AND active = 1', slug); return s ? publicSupervisor(s) : null; };
export const LEAD_STATUS_LIST = LEAD_STATUSES;
