// ============================================================================
// BACKEND / SUPERVISOR ROUTES — Stage 13, §25. /supervisor/auth/* and
// /supervisor/me/* mirror the shape of /auth/* and /me/* (docs/INTEGRATION.md
// §3) but read a DIFFERENT session (supervisor_sessions, cookie
// no_supervisor_session) so a customer session can never reach these routes
// and a supervisor session can never reach /me/*. Reassigning a customer's
// attribution is an admin-dashboard action (staff-routes.mjs), not a route here.
// ============================================================================
import { q, now, markRead } from './db.mjs';
import { json, fail, readJson, str, pageParams } from './http.mjs';
import { authRoutes } from './credentials.mjs';
import {
  supervisors, privateSupervisor, supervisorById,
  supervisorCustomers, supervisorCustomer, supervisorBookings, supervisorBooking, supervisorLeads, updateLeadStatus,
  supervisorRevenue, supervisorPerformance, supervisorCommissions, nSupervisorNotification,
} from './supervisor.mjs';
import { enqueue } from './mailer.mjs';
import { info } from './logger.mjs';

const period = (url) => { const p = url.searchParams.get('period'); const days = { today: 1, week: 7, month: 30 }[p]; return days ? new Date(Date.now() - days * 864e5).toISOString() : null; };
const page = (url) => pageParams(url, { max: 50 }).page;
const pageSize = (url, d = 20) => pageParams(url, { def: d, max: 50 }).pageSize;

/* ---- /supervisor/auth --------------------------------------------------- */
// No sign-up: supervisor accounts are provisioned by the business (Admin Dashboard, §4/§40), never self-registered.
export const supervisorAuth = authRoutes(supervisors, {
  key: 'supervisor', view: privateSupervisor,
  onResetRequest: (r) => enqueue({ recipient: r.account.email, template: 'supervisor-password-reset', payload: { token: r.token, locale: 'ar', supervisorId: r.account.id } }),
  onReset: () => info('supervisor.auth.reset', { ok: true }),
}).routes;

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
  async notificationsRead(req, res, ctx) { const b = await readJson(req); const sid = ctx.supervisor.id; markRead('supervisor_notifications', 'supervisor_id', sid, b); return json(res, 200, { notifications: q.all('SELECT * FROM supervisor_notifications WHERE supervisor_id = ? ORDER BY at DESC', sid).map(nSupervisorNotification) }); },
};
