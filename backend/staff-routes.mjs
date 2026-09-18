// ============================================================================
// BACKEND / STAFF ROUTES — Stage 15, §25/§27. /staff/auth/* mirrors the shape
// of /auth/* and /supervisor/auth/*; /operations/*, /services/*,
// /bookings/:id/*, /documents/:id/review, /notifications/templates|history
// are the Stage 15 API surface, every one of them requiring a live staff
// session AND the specific permission the action needs (§25: "do not expose
// permissions the backend does not actually enforce" — every permission
// named below is checked here, not just displayed in a UI).
// ============================================================================
import { json, empty, fail, HttpError, readJson, str, isEmail, setStaffSessionCookies, clearStaffSessionCookies } from './http.mjs';
import {
  publicStaff, staffById, verifyStaffPassword, changeStaffPassword, createStaffSession, endStaffSession,
  createStaffReset, consumeStaffReset, requirePermission, hasPermission,
  opsBookingList, opsBookingDetail, transitionBooking, assignBookingOperator,
  createTask, listTasks, taskById, assignTask, updateTaskStatus, taskPriorityLevels,
  createEscalation, listEscalations, updateEscalationStatus,
  listServices, serviceById, updateService, serviceWorkflow, setServiceWorkflow, serviceDocumentRequirements, addServiceDocumentRequirement, allDocumentRequirements,
  reviewDocument, listSuppliers, createSupplier, assignSupplierToBooking, updateBookingSupplier,
  addBookingNote, bookingNotes, listTemplates, upsertTemplate, notificationHistory, auditEvents, lifecycleConfig,
  listCustomers, customerDetailForStaff, listPayments, listDocumentsAdmin,
  listStaff, createStaffAccount, setStaffActive, setStaffPermissions,
  reportBookings, reportOperations, reportSuppliers, reportDocuments, reportNotifications, overview, adminSearch,
} from './staff.mjs';
import {
  listSupervisors, createSupervisor, updateSupervisor, supervisorDetailForStaff,
  adminLeads, adminAttributionEvents, reassignAttribution,
} from './supervisor.mjs';
import { normEmail } from './identity.mjs';
import { enqueue } from './mailer.mjs';
import { listBusinessRules, businessRuleById, businessRuleHistory, updateBusinessRule, activateBusinessRule, disableBusinessRule, pendingDecisions, businessRuleMatrix } from './business-rules.mjs';

const sessionAnswer = (res, s) => { const sess = createStaffSession(s.id); setStaffSessionCookies(res, sess.id, sess.csrf, sess.maxAge); return { staff: publicStaff(s), expiresAt: sess.expiresAt }; };
const page = (url) => Math.max(1, Number(url.searchParams.get('page')) || 1);
const pageSize = (url, d = 20) => Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || d));
const actorOf = (ctx) => ({ id: ctx.staff.id, role: ctx.staff.role });

/* ---- /staff/auth --------------------------------------------------------- */
export const staffAuth = {
  async signIn(req, res, ctx) { const b = await readJson(req); const s = verifyStaffPassword({ email: b.email, password: b.password, ip: ctx.ip }); return json(res, 200, sessionAnswer(res, s)); },
  session(req, res, ctx) { if (!ctx.staffSession) return fail(res, 401, 'unauthenticated'); return json(res, 200, { staff: publicStaff(ctx.staff), expiresAt: new Date(ctx.staffSession.expires_at).toISOString() }); },
  refresh(req, res, ctx) { if (!ctx.staffSession) return fail(res, 401, 'unauthenticated'); endStaffSession(ctx.staffSession.id); return json(res, 200, sessionAnswer(res, ctx.staff)); },
  signOut(req, res, ctx) { endStaffSession(ctx.staffSid); clearStaffSessionCookies(res); return empty(res); },
  async resetRequest(req, res) {
    const b = await readJson(req); const email = normEmail(b.email);
    if (isEmail(email)) { const r = createStaffReset(email); if (r) enqueue({ customerId: null, template: 'staff-password-reset', payload: { token: r.token, staffId: r.staff.id } }); }
    return json(res, 202, {});
  },
  async reset(req, res) { const b = await readJson(req); consumeStaffReset(str(b.token, 80), b.password); return empty(res); },
  async change(req, res, ctx) { if (!ctx.staffSession) return fail(res, 401, 'unauthenticated'); const b = await readJson(req); changeStaffPassword(ctx.staff.id, b.current, b.next); return empty(res); },
};

/* ---- /operations/* --------------------------------------------------------- */
export const operations = {
  meta(req, res, ctx) { return json(res, 200, { permissions: publicStaff(ctx.staff).permissions, priorityLevels: taskPriorityLevels(), lifecycle: lifecycleConfig() }); },

  bookings(req, res, ctx, url) { requirePermission(ctx.staff, 'booking.view'); return json(res, 200, opsBookingList({ status: str(url.searchParams.get('status') ?? '', 30), service: str(url.searchParams.get('service') ?? '', 20), assignedTo: str(url.searchParams.get('assignedTo') ?? '', 40), page: page(url), pageSize: pageSize(url) })); },
  booking(req, res, ctx, id) { requirePermission(ctx.staff, 'booking.view'); const b = opsBookingDetail(id); if (!b) return fail(res, 404, 'notFound'); return json(res, 200, { booking: b }); },
  async bookingStatus(req, res, ctx, id) {
    requirePermission(ctx.staff, 'booking.status.change'); const b = await readJson(req);
    const result = transitionBooking(id, str(b.status, 40), actorOf(ctx), str(b.reason ?? '', 300) || null, b.metadata ?? {});
    return json(res, 200, { transition: result, booking: opsBookingDetail(id) });
  },
  async bookingAssign(req, res, ctx, id) { requirePermission(ctx.staff, 'booking.assign'); const b = await readJson(req); const result = assignBookingOperator(id, b.staffId || null, actorOf(ctx)); return json(res, 200, result); },
  async bookingNoteAdd(req, res, ctx, id) {
    const b = await readJson(req); const type = b.type === 'customer' ? 'customer' : 'internal';
    requirePermission(ctx.staff, 'booking.manage');
    const note = addBookingNote(id, type, b.body, actorOf(ctx));
    return json(res, 201, { note });
  },
  bookingNotes(req, res, ctx, id, url) { requirePermission(ctx.staff, 'booking.view'); const type = url.searchParams.get('type') === 'customer' ? 'customer' : 'internal'; return json(res, 200, { notes: bookingNotes(id, type) }); },
  async bookingSupplierAssign(req, res, ctx, id) { requirePermission(ctx.staff, 'supplier.manage'); const b = await readJson(req); return json(res, 201, { bookingSupplier: assignSupplierToBooking(id, str(b.supplierId, 40), actorOf(ctx)) }); },

  tasks(req, res, ctx, url) { requirePermission(ctx.staff, 'task.view'); return json(res, 200, listTasks({ status: str(url.searchParams.get('status') ?? '', 20), assignedTo: str(url.searchParams.get('assignedTo') ?? '', 40), bookingId: str(url.searchParams.get('bookingId') ?? '', 40), page: page(url), pageSize: pageSize(url) })); },
  async taskCreate(req, res, ctx) { requirePermission(ctx.staff, 'task.manage'); const b = await readJson(req); return json(res, 201, { task: createTask(b, actorOf(ctx)) }); },
  task(req, res, ctx, id) { requirePermission(ctx.staff, 'task.view'); const t = taskById(id); if (!t) return fail(res, 404, 'notFound'); return json(res, 200, { task: t }); },
  async taskAssign(req, res, ctx, id) { requirePermission(ctx.staff, 'task.manage'); const b = await readJson(req); return json(res, 200, { task: assignTask(id, b.assignedTo || null, actorOf(ctx)) }); },
  async taskStatus(req, res, ctx, id) { requirePermission(ctx.staff, 'task.manage'); const b = await readJson(req); return json(res, 200, { task: updateTaskStatus(id, str(b.status, 20), actorOf(ctx)) }); },

  escalations(req, res, ctx, url) { requirePermission(ctx.staff, 'task.view'); return json(res, 200, listEscalations({ status: str(url.searchParams.get('status') ?? '', 20), page: page(url), pageSize: pageSize(url) })); },
  async escalationCreate(req, res, ctx) { requirePermission(ctx.staff, 'task.manage'); const b = await readJson(req); return json(res, 201, { escalation: createEscalation(b, actorOf(ctx)) }); },
  async escalationStatus(req, res, ctx, id) { requirePermission(ctx.staff, 'task.manage'); const b = await readJson(req); return json(res, 200, { escalation: updateEscalationStatus(id, str(b.status, 20), actorOf(ctx)) }); },

  async documentReviewSubmit(req, res, ctx, id) { requirePermission(ctx.staff, 'document.review'); const b = await readJson(req); return json(res, 200, { document: reviewDocument(id, { status: str(b.status, 20), reason: b.reason }, actorOf(ctx)) }); },
  documentRequirements(req, res, ctx) { requirePermission(ctx.staff, 'service.manage'); return json(res, 200, { requirements: allDocumentRequirements() }); },

  suppliers(req, res, ctx) { requirePermission(ctx.staff, 'supplier.view'); return json(res, 200, { suppliers: listSuppliers() }); },
  async supplierCreate(req, res, ctx) { requirePermission(ctx.staff, 'supplier.manage'); const b = await readJson(req); return json(res, 201, { supplier: createSupplier(b, actorOf(ctx)) }); },
  async bookingSupplierUpdate(req, res, ctx, id) { requirePermission(ctx.staff, 'supplier.manage'); const b = await readJson(req); return json(res, 200, { bookingSupplier: updateBookingSupplier(id, b, actorOf(ctx)) }); },

  templates(req, res, ctx) { requirePermission(ctx.staff, 'notification.manage'); return json(res, 200, { templates: listTemplates() }); },
  async templateUpsert(req, res, ctx) { requirePermission(ctx.staff, 'notification.manage'); const b = await readJson(req); return json(res, 200, { template: upsertTemplate(b, actorOf(ctx)) }); },
  notificationHistory(req, res, ctx, url) { requirePermission(ctx.staff, 'notification.send'); return json(res, 200, notificationHistory({ customerId: str(url.searchParams.get('customerId') ?? '', 40), bookingId: str(url.searchParams.get('bookingId') ?? '', 40), page: page(url), pageSize: pageSize(url) })); },

  audit(req, res, ctx, url) { requirePermission(ctx.staff, 'audit.view'); return json(res, 200, auditEvents({ entityType: str(url.searchParams.get('entityType') ?? '', 40), entityId: str(url.searchParams.get('entityId') ?? '', 40), page: page(url), pageSize: pageSize(url) })); },
};

/* ---- /services/* ------------------------------------------------------------ */
export const services = {
  list(req, res, ctx) { return json(res, 200, { services: listServices() }); },
  one(req, res, ctx, id) { const s = serviceById(id); if (!s) return fail(res, 404, 'notFound'); return json(res, 200, { service: s }); },
  async update(req, res, ctx, id) { requirePermission(ctx.staff, 'service.manage'); const b = await readJson(req); return json(res, 200, { service: updateService(id, b, actorOf(ctx)) }); },
  workflow(req, res, ctx, id) { return json(res, 200, { steps: serviceWorkflow(id) }); },
  async workflowUpdate(req, res, ctx, id) { requirePermission(ctx.staff, 'workflow.manage'); const b = await readJson(req); return json(res, 200, { steps: setServiceWorkflow(id, Array.isArray(b.steps) ? b.steps : [], actorOf(ctx)) }); },
  documentRequirements(req, res, ctx, id) { return json(res, 200, { requirements: serviceDocumentRequirements(id) }); },
  async documentRequirementAdd(req, res, ctx, id) { requirePermission(ctx.staff, 'service.manage'); const b = await readJson(req); return json(res, 201, { requirements: addServiceDocumentRequirement(id, b, actorOf(ctx)) }); },
};

/* ---- /admin/* — Stage 14, the management/oversight layer ABOVE the Stage 15 operational domain (§29/§30). Every
   handler checks its own permission here — the frontend nav only hides what a role cannot use, it never gates it. */
export const dashboard = {
  overview(req, res, ctx) { requirePermission(ctx.staff, 'customer.view'); return json(res, 200, overview()); },
  search(req, res, ctx, url) {
    const q = str(url.searchParams.get('q') ?? '', 80); if (!q) return json(res, 200, {});
    const categories = [];
    if (hasPermission(ctx.staff, 'customer.view')) categories.push('customer');
    if (hasPermission(ctx.staff, 'booking.view')) categories.push('booking');
    if (hasPermission(ctx.staff, 'supervisor.view')) categories.push('supervisor');
    if (hasPermission(ctx.staff, 'supplier.view')) categories.push('supplier');
    if (hasPermission(ctx.staff, 'task.view')) categories.push('task', 'escalation');
    return json(res, 200, adminSearch(q, categories));
  },

  customers(req, res, ctx, url) { requirePermission(ctx.staff, 'customer.view'); return json(res, 200, listCustomers({ search: str(url.searchParams.get('search') ?? '', 120), page: page(url), pageSize: pageSize(url) })); },
  customer(req, res, ctx, id) { requirePermission(ctx.staff, 'customer.view'); const c = customerDetailForStaff(id); if (!c) return fail(res, 404, 'notFound'); return json(res, 200, { customer: c }); },
  async customerReassign(req, res, ctx, id) { requirePermission(ctx.staff, 'attribution.view'); requirePermission(ctx.staff, 'supervisor.manage'); const b = await readJson(req); return json(res, 200, reassignAttribution(id, b.supervisorId || null, ctx.staff.id)); },

  supervisors(req, res, ctx, url) { requirePermission(ctx.staff, 'supervisor.view'); return json(res, 200, listSupervisors({ search: str(url.searchParams.get('search') ?? '', 120), page: page(url), pageSize: pageSize(url) })); },
  supervisor(req, res, ctx, id) { requirePermission(ctx.staff, 'supervisor.view'); const s = supervisorDetailForStaff(id); if (!s) return fail(res, 404, 'notFound'); return json(res, 200, { supervisor: s }); },
  async supervisorCreate(req, res, ctx) { requirePermission(ctx.staff, 'supervisor.manage'); const b = await readJson(req); return json(res, 201, { supervisor: createSupervisor(b, actorOf(ctx)) }); },
  async supervisorUpdate(req, res, ctx, id) { requirePermission(ctx.staff, 'supervisor.manage'); const b = await readJson(req); return json(res, 200, { supervisor: updateSupervisor(id, b, actorOf(ctx)) }); },

  leads(req, res, ctx, url) { requirePermission(ctx.staff, 'attribution.view'); return json(res, 200, adminLeads({ supervisorId: str(url.searchParams.get('supervisorId') ?? '', 40), status: str(url.searchParams.get('status') ?? '', 20), page: page(url), pageSize: pageSize(url) })); },
  attributionEvents(req, res, ctx, url) { requirePermission(ctx.staff, 'attribution.view'); return json(res, 200, adminAttributionEvents({ supervisorId: str(url.searchParams.get('supervisorId') ?? '', 40), customerId: str(url.searchParams.get('customerId') ?? '', 40), page: page(url), pageSize: pageSize(url) })); },

  payments(req, res, ctx, url) { requirePermission(ctx.staff, 'payment.view'); return json(res, 200, listPayments({ customerId: str(url.searchParams.get('customerId') ?? '', 40), bookingId: str(url.searchParams.get('bookingId') ?? '', 40), status: str(url.searchParams.get('status') ?? '', 20), page: page(url), pageSize: pageSize(url) })); },
  documents(req, res, ctx, url) { requirePermission(ctx.staff, 'document.view'); return json(res, 200, listDocumentsAdmin({ customerId: str(url.searchParams.get('customerId') ?? '', 40), bookingId: str(url.searchParams.get('bookingId') ?? '', 40), reviewStatus: str(url.searchParams.get('reviewStatus') ?? '', 20), page: page(url), pageSize: pageSize(url) })); },

  reportBookings(req, res, ctx) { requirePermission(ctx.staff, 'report.view'); return json(res, 200, reportBookings()); },
  reportOperations(req, res, ctx) { requirePermission(ctx.staff, 'report.view'); return json(res, 200, reportOperations()); },
  reportSuppliers(req, res, ctx) { requirePermission(ctx.staff, 'report.view'); return json(res, 200, reportSuppliers()); },
  reportDocuments(req, res, ctx) { requirePermission(ctx.staff, 'report.view'); return json(res, 200, reportDocuments()); },
  reportNotifications(req, res, ctx) { requirePermission(ctx.staff, 'report.view'); return json(res, 200, reportNotifications()); },

  staffList(req, res, ctx) { requirePermission(ctx.staff, 'staff.manage'); return json(res, 200, { staff: listStaff() }); },
  async staffCreate(req, res, ctx) { requirePermission(ctx.staff, 'staff.manage'); const b = await readJson(req); return json(res, 201, { staff: createStaffAccount(b, actorOf(ctx)) }); },
  async staffActive(req, res, ctx, id) { requirePermission(ctx.staff, 'staff.manage'); const b = await readJson(req); return json(res, 200, { staff: setStaffActive(id, !!b.active, actorOf(ctx)) }); },
  async staffPermissions(req, res, ctx, id) { requirePermission(ctx.staff, 'staff.manage'); const b = await readJson(req); return json(res, 200, { staff: setStaffPermissions(id, Array.isArray(b.permissions) ? b.permissions : [], actorOf(ctx)) }); },

  rules(req, res, ctx, url) { requirePermission(ctx.staff, 'rules.view'); return json(res, 200, listBusinessRules({ category: str(url.searchParams.get('category') ?? '', 40), status: str(url.searchParams.get('status') ?? '', 20) })); },
  rule(req, res, ctx, id) { requirePermission(ctx.staff, 'rules.view'); const r = businessRuleById(id); if (!r) return fail(res, 404, 'notFound'); return json(res, 200, { rule: r }); },
  ruleHistory(req, res, ctx, id) { requirePermission(ctx.staff, 'rules.view'); return json(res, 200, { items: businessRuleHistory(id) }); },
  async ruleUpdate(req, res, ctx, id) { requirePermission(ctx.staff, 'rules.manage'); const b = await readJson(req); return json(res, 200, { rule: updateBusinessRule(id, { value: b.value, allowedValues: b.allowedValues, status: b.status, notes: b.notes }, actorOf(ctx)) }); },
  async ruleActivate(req, res, ctx, id) { requirePermission(ctx.staff, 'rules.manage'); return json(res, 200, { rule: activateBusinessRule(id, actorOf(ctx)) }); },
  async ruleDisable(req, res, ctx, id) { requirePermission(ctx.staff, 'rules.manage'); return json(res, 200, { rule: disableBusinessRule(id, actorOf(ctx)) }); },
  pendingDecisions(req, res, ctx) { requirePermission(ctx.staff, 'rules.view'); return json(res, 200, pendingDecisions()); },
  ruleMatrix(req, res, ctx) { requirePermission(ctx.staff, 'rules.view'); return json(res, 200, businessRuleMatrix()); },
};
