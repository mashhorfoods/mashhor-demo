/* ============================================================================
   OPS / ADAPTERS / DEV DATA — the development data stand-in for the
   operations portal. ⚠ Development only, this browser only. A small, fixed,
   clearly-labelled dataset (dev: true on every record) mirroring exactly the
   shapes the real backend answers, so every screen can be reviewed before a
   backend exists — never presented as real bookings, tasks or revenue.
   Mirrors the same booking lifecycle the backend's business_config seeds
   (a technical example, not a business decision made here).

   QA switches (sessionStorage): no.dev.ops = 'error' | 'slow' | 'empty'
   ========================================================================= */
import { registerOpsDataAdapter, RULE_STATUSES } from '../data.js';

const read = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const wait = async () => { await new Promise((r) => setTimeout(r, read('no.dev.ops') === 'slow' ? 2000 : 200)); if (read('no.dev.ops') === 'error') { const e = new Error('dev outage'); e.code = 'unavailable'; throw e; } };
const isEmpty = () => read('no.dev.ops') === 'empty';
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString();

const LIFECYCLE = {
  initial: 'submitted',
  transitions: {
    submitted: ['pending_review', 'cancelled'], pending_review: ['awaiting_payment', 'cancelled', 'failed'],
    awaiting_payment: ['payment_received', 'cancelled', 'failed'], payment_received: ['processing', 'refunded'],
    processing: ['supplier_pending', 'confirmed', 'failed'], supplier_pending: ['confirmed', 'failed', 'cancelled'],
    confirmed: ['ticketed', 'service_in_progress', 'cancelled', 'refunded'], ticketed: ['service_in_progress', 'completed', 'cancelled', 'refunded'],
    service_in_progress: ['completed', 'cancelled'], completed: [], cancelled: [], failed: ['pending_review', 'cancelled'], refunded: [],
  },
  status: 'technical_example_pending_business_confirmation',
};
const PRIORITY_LEVELS = { levels: ['low', 'normal', 'high', 'urgent'], status: 'default_pending_confirmation' };
const PAYMENT_GATED = new Set(['payment_received', 'processing', 'confirmed', 'ticketed', 'service_in_progress', 'completed']);

const SERVICE_IDS = ['flights', 'hotels', 'visa', 'packages', 'umrah', 'transport', 'groups', 'medical', 'study', 'work', 'issue', 'change', 'cancel'];
const SERVICES = SERVICE_IDS.map((id) => ({ id, active: true, bookingEnabled: true, workflowType: null, supplierType: null, operationalRequirements: null, createdAt: iso(60), updatedAt: iso(60) }));
const WORKFLOWS = {
  flights: [['search', 'البحث', 'Search'], ['select', 'الاختيار', 'Selection'], ['passengers', 'بيانات المسافرين', 'Passenger data'], ['payment', 'الدفع', 'Payment'], ['ticketing', 'إصدار التذكرة', 'Ticketing'], ['confirmation', 'التأكيد', 'Confirmation']],
  visa: [['application', 'الطلب', 'Application'], ['documents', 'المستندات', 'Documents'], ['review', 'المراجعة', 'Review'], ['submission', 'التقديم', 'Submission'], ['processing', 'المعالجة', 'Processing'], ['decision', 'القرار', 'Decision']],
  hotels: [['search', 'البحث', 'Search'], ['select', 'الاختيار', 'Selection'], ['payment', 'الدفع', 'Payment'], ['supplier_confirmation', 'تأكيد المزود', 'Supplier confirmation'], ['customer_confirmation', 'تأكيد العميل', 'Customer confirmation']],
  medical: [['request', 'الطلب', 'Request'], ['information', 'المعلومات', 'Information'], ['review', 'المراجعة', 'Review'], ['provider_coordination', 'التنسيق مع المزود', 'Provider coordination'], ['confirmation', 'التأكيد', 'Confirmation']],
};
const workflowSteps = (id) => (WORKFLOWS[id] ?? []).map(([key, ar, en], i) => ({ order: i, key, labelAr: ar, labelEn: en }));

const BOOKINGS = [
  { id: 'dev-bk-1', customerId: 'dev-cus-1', service: 'flights', status: 'confirmed', paymentStatus: 'paid', amount: 900, currency: 'USD', supervisorId: 'supervisor-1', opsStatus: 'submitted', assignedOperator: 'staff-dev-demo', createdAt: iso(3), missingDocuments: 1, dev: true },
  { id: 'dev-bk-2', customerId: 'dev-cus-2', service: 'visa', status: 'pending', paymentStatus: 'unpaid', amount: 0, currency: 'USD', supervisorId: null, opsStatus: 'pending_review', assignedOperator: null, createdAt: iso(1), missingDocuments: 0, dev: true },
];
const DOCS = [{ id: 'dev-doc-1', bookingId: 'dev-bk-1', type: 'eticket', status: 'available', reviewStatus: 'pending', reviewerId: null, reviewedAt: null, rejectionReason: null, title: null, createdAt: iso(3) }];
const SUPPLIER = { id: 'dev-bksup-1', bookingId: 'dev-bk-1', supplierId: 'dev-sup-1', supplierReference: null, ticketNumber: null, status: 'pending', notes: null, createdAt: iso(3), updatedAt: iso(3) };
let notesCustomer = [{ id: 'dev-note-c1', bookingId: 'dev-bk-1', type: 'customer', body: 'Development customer-facing note.', authorId: 'staff-dev-demo', authorRole: 'admin', createdAt: iso(2) }];
let notesInternal = [{ id: 'dev-note-i1', bookingId: 'dev-bk-1', type: 'internal', body: 'Development internal note — never shown to the customer.', authorId: 'staff-dev-demo', authorRole: 'admin', createdAt: iso(2) }];
let history = [{ bookingId: 'dev-bk-1', previousStatus: null, newStatus: 'submitted', actor: 'staff-dev-demo', actorRole: 'admin', reason: null, metadata: {}, at: iso(3) }];
let tasks = [
  { id: 'dev-task-1', type: 'document_review', bookingId: 'dev-bk-1', customerId: 'dev-cus-1', supervisorId: 'supervisor-1', assignedTo: 'staff-dev-demo', status: 'open', priority: 'normal', dueAt: null, notes: 'Development task.', createdBy: 'staff-dev-demo', createdAt: iso(2), updatedAt: iso(2), completedAt: null },
  { id: 'dev-task-2', type: 'payment_follow_up', bookingId: 'dev-bk-2', customerId: 'dev-cus-2', supervisorId: null, assignedTo: null, status: 'open', priority: 'high', dueAt: null, notes: '', createdBy: 'staff-dev-demo', createdAt: iso(1), updatedAt: iso(1), completedAt: null },
];
let escalations = [{ id: 'dev-esc-1', bookingId: 'dev-bk-2', taskId: 'dev-task-2', reason: 'Development escalation reason.', severity: 'high', assignedTeam: 'operations', assignedOperator: 'staff-dev-demo', status: 'open', createdBy: 'staff-dev-demo', createdAt: iso(1), updatedAt: iso(1), resolvedAt: null }];
let suppliers = [{ id: 'dev-sup-1', name: 'Development Flight Supplier', type: 'flight', services: ['flights'], status: 'active', integrationStatus: 'not_connected', supportedOperations: ['reserve', 'ticket'], contact: {}, createdAt: iso(60), updatedAt: iso(60) }];
let templates = [{ id: 'dev-tmpl-1', event: 'booking.confirmed', channel: 'email', subjectAr: 'تم تأكيد حجزك', subjectEn: 'Your booking is confirmed', bodyAr: 'مرحباً {{name}}', bodyEn: 'Hello {{name}}', variables: ['name'], active: true, version: 1, createdAt: iso(30), updatedAt: iso(30) }];
let auditLog = [{ id: 1, actorId: 'staff-dev-demo', actorRole: 'admin', action: 'booking.status.change', entityType: 'booking', entityId: 'dev-bk-1', metadata: { from: null, to: 'submitted' }, at: iso(3) }];

// ---- Stage 14: the Admin Dashboard's own development stand-in data — same rule as everything above, a small
// fixed dataset, dev: true, never presented as real customers/supervisors/payments/staff.
let customers = [
  { id: 'dev-cus-1', name: 'Development Customer One', email: 'dev-cus-1@example.test', phone: '', locale: 'ar', image: null, supervisorId: 'supervisor-1', attribution: { supervisorId: 'supervisor-1', source: 'link', at: iso(30) }, acceptance: null, createdAt: iso(30), bookingsCount: 1, dev: true },
  { id: 'dev-cus-2', name: 'Development Customer Two', email: 'dev-cus-2@example.test', phone: '', locale: 'ar', image: null, supervisorId: null, attribution: null, acceptance: null, createdAt: iso(10), bookingsCount: 1, dev: true },
];
let supervisorsAdmin = [
  { id: 'supervisor-1', slug: 'supervisor-1', status: 'active', nameAr: 'منسق تطوير واحد', nameEn: 'Development Coordinator One', titleAr: null, titleEn: null, bioAr: null, bioEn: null, image: null, languages: ['ar', 'en'], specialties: [], services: [], phone: '', whatsapp: null, email: 'dev-sup-1@example.test', city: 'Khartoum', internalId: null, notificationPrefs: {}, createdAt: iso(90), updatedAt: iso(30), customersCount: 1, dev: true },
  { id: 'supervisor-2', slug: 'supervisor-2', status: 'active', nameAr: 'منسق تطوير اثنان', nameEn: 'Development Coordinator Two', titleAr: null, titleEn: null, bioAr: null, bioEn: null, image: null, languages: ['ar'], specialties: [], services: [], phone: '', whatsapp: null, email: 'dev-sup-2@example.test', city: 'Khartoum', internalId: null, notificationPrefs: {}, createdAt: iso(90), updatedAt: iso(30), customersCount: 0, dev: true },
];
let devLeads = [{ id: 'dev-lead-1', customerId: null, name: 'Development Lead', contact: 'lead@example.test', source: 'link', serviceInterest: 'flights', status: 'new', convertedBookingId: null, createdAt: iso(5), updatedAt: iso(5) }];
let devAttributionEvents = [{ customerId: 'dev-cus-1', supervisorId: 'supervisor-1', previousSupervisorId: null, source: 'link', actor: 'customer', at: iso(30) }];
let devPayments = [
  { id: 'dev-pay-1', customerId: 'dev-cus-1', bookingId: 'dev-bk-1', at: iso(3), amount: 900, currency: 'USD', status: 'paid', reference: 'DEVTX-0001', methodAr: 'مزوّد دفع تطوير', methodEn: 'Development payment provider', customerName: 'Development Customer One' },
  { id: 'dev-pay-2', customerId: 'dev-cus-2', bookingId: 'dev-bk-2', at: iso(1), amount: 0, currency: 'USD', status: 'failed', reference: 'DEVTX-0002', methodAr: 'مزوّد دفع تطوير', methodEn: 'Development payment provider', customerName: 'Development Customer Two' },
];
let devDocumentsAdmin = [
  { id: 'dev-doc-1', customerId: 'dev-cus-1', bookingId: 'dev-bk-1', tripId: null, type: 'eticket', kind: 'issued', status: 'available', reviewStatus: 'pending', reviewerId: null, reviewedAt: null, rejectionReason: null, title: null, createdAt: iso(3) },
];
let staffAccounts = [
  { id: 'staff-dev-demo', email: 'admin@example.test', name: 'Development Admin', role: 'admin', permissions: ['booking.view', 'booking.manage', 'booking.status.change', 'booking.assign', 'task.view', 'task.manage', 'document.review', 'supplier.view', 'supplier.manage', 'notification.send', 'notification.manage', 'service.manage', 'workflow.manage', 'report.view', 'audit.view', 'customer.view', 'supervisor.view', 'supervisor.manage', 'payment.view', 'document.view', 'attribution.view', 'staff.manage', 'rules.view', 'rules.manage', 'content.manage'], active: true, createdAt: iso(120), updatedAt: iso(120) },
];

// ---- Command Center CMS Phase 2A: Destinations & Offers admin CRUD stand-in. One seeded row each, active, so the
// list screens aren't empty; every other field starts null/empty rather than a plausible-looking placeholder.
let devDestinations = [
  { id: 'dev-dst-1', slug: 'dev-destination', region: 'middleEast', nameAr: 'وجهة تطوير', nameEn: 'Development Destination', countryAr: null, countryEn: null, descAr: null, descEn: null, purposes: [], services: [], image: null, featured: false, home: false, publishStatus: 'published', publishedAt: iso(30), hasUnpublishedChanges: false, order: null, createdAt: iso(30), updatedAt: iso(30) },
];
let devOffers = [
  { id: 'dev-off-1', slug: 'dev-offer', category: null, categories: [], destinationId: 'dev-dst-1', titleAr: 'عرض تطوير', titleEn: 'Development Offer', shortAr: null, shortEn: null, descAr: null, descEn: null, duration: { nights: null }, price: null, status: 'request', bookingMode: 'request', featured: false, placeholder: true, services: [], image: null, detail: {}, publishStatus: 'draft', publishedAt: null, hasUnpublishedChanges: false, createdAt: iso(30), updatedAt: iso(30) },
];
const CONTENT_TRANSITIONS = { draft: ['published', 'archived'], published: ['draft', 'archived'], archived: ['draft'] };
/** Mirrors backend/content.mjs's resolvePublishStatus closely enough for the dev stand-in: a same-state or
    omitted publishStatus is a no-op; an illegal transition or a publish with no name/title throws 'invalid'. */
function applyPublishTransition(row, patch, hasContent, t) {
  if (patch.publishStatus === undefined || patch.publishStatus === row.publishStatus) return;
  if (!CONTENT_TRANSITIONS[row.publishStatus]?.includes(patch.publishStatus)) { const e = new Error('invalid transition'); e.code = 'invalid'; throw e; }
  if (patch.publishStatus === 'published' && !hasContent) { const e = new Error('nothing to publish'); e.code = 'invalid'; throw e; }
  row.publishStatus = patch.publishStatus;
  if (patch.publishStatus === 'published') row.publishedAt = t;
}

// ---- Stage 15A: the Business Rules Register — mirrors exactly the PENDING/DRAFT/ACTIVE seed the real backend's
// migration 004_business_rules.sql carries, never a fabricated confirmed value.
let devRules = [
  { ruleId: 'commission_model', category: 'commission', name: 'Supervisor commission model', description: 'How (and whether) a supervisor earns commission on a booking.', currentValue: { model: null, status: 'pending_business_configuration', note: 'no percentage, fixed amount or service-specific rule has been supplied' }, allowedValues: null, status: 'PENDING', source: 'Stage 13 brief §18 — no rule supplied', effectiveFrom: iso(30), effectiveTo: null, updatedBy: null, updatedAt: iso(30), notes: null },
  { ruleId: 'task_priority_levels', category: 'task_priority', name: 'Task priority levels', description: 'The priority vocabulary and ordering used by the operations task queue.', currentValue: { levels: ['low', 'normal', 'high', 'urgent'], status: 'default_pending_confirmation', note: 'a working vocabulary, not confirmed as final' }, allowedValues: null, status: 'DRAFT', source: 'Stage 15 brief — a working technical default', effectiveFrom: iso(30), effectiveTo: null, updatedBy: null, updatedAt: iso(30), notes: null },
  { ruleId: 'refund_policy', category: 'refund', name: 'Refund policy', description: 'Refund eligibility, approval authority, method and audit requirements.', currentValue: { policy: null, status: 'pending_business_configuration', note: 'no refund policy has been supplied' }, allowedValues: null, status: 'PENDING', source: 'Stage 15 brief §26/§39', effectiveFrom: iso(30), effectiveTo: null, updatedBy: null, updatedAt: iso(30), notes: null },
  { ruleId: 'cancellation_policy', category: 'cancellation', name: 'Cancellation policy', description: 'Cancellation eligibility, timing, fees and notice periods.', currentValue: { policy: null, status: 'pending_business_configuration', note: 'no cancellation policy has been supplied' }, allowedValues: null, status: 'PENDING', source: 'Stage 15 brief §26/§39', effectiveFrom: iso(30), effectiveTo: null, updatedBy: null, updatedAt: iso(30), notes: null },
  { ruleId: 'sla_config', category: 'sla', name: 'SLA targets', description: 'Target duration, warning and escalation thresholds.', currentValue: { targets: null, status: 'pending_business_configuration', note: 'no SLA durations have been supplied' }, allowedValues: null, status: 'PENDING', source: 'Stage 15 brief §26/§39', effectiveFrom: iso(30), effectiveTo: null, updatedBy: null, updatedAt: iso(30), notes: null },
  { ruleId: 'booking_lifecycle', category: 'booking_lifecycle', name: 'Booking lifecycle graph', description: 'The full internal operations-status state graph.', currentValue: { ...LIFECYCLE }, allowedValues: null, status: 'DRAFT', source: 'Stage 15 brief’s own worked example', effectiveFrom: iso(30), effectiveTo: null, updatedBy: null, updatedAt: iso(30), notes: null },
  { ruleId: 'attribution_model', category: 'attribution', name: 'Supervisor attribution model', description: 'Which attribution rule is in effect: first-touch, last-touch, manual or hybrid.', currentValue: { model: 'first-touch', status: 'pending_business_confirmation', note: 'a technical default in effect since Stage 10, not yet confirmed' }, allowedValues: null, status: 'DRAFT', source: 'Stage 10/13 implementation', effectiveFrom: iso(30), effectiveTo: null, updatedBy: null, updatedAt: iso(30), notes: null },
  { ruleId: 'payment_gates', category: 'payment', name: 'Payment gates', description: 'Which operational statuses require a paid booking before the transition is allowed.', currentValue: { gatedStatuses: [...PAYMENT_GATED], requiresPaidBeforeGate: true, status: 'technical_example_pending_business_confirmation' }, allowedValues: null, status: 'DRAFT', source: 'Stage 15 brief’s own worked example (PAYMENT_GATED)', effectiveFrom: iso(30), effectiveTo: null, updatedBy: null, updatedAt: iso(30), notes: null },
  { ruleId: 'staff_provisioning', category: 'staff', name: 'Real staff provisioning', description: 'Whether real (non-fixture) staff accounts have been provisioned.', currentValue: { method: 'admin-created account, reset-token flow', realHiring: false, status: 'pending_business_configuration' }, allowedValues: null, status: 'PENDING', source: 'Stage 14 — provisioning mechanism built, no real hiring has occurred', effectiveFrom: iso(30), effectiveTo: null, updatedBy: null, updatedAt: iso(30), notes: null },
  { ruleId: 'admin_dashboard_scope', category: 'admin', name: 'Admin Dashboard scope', description: 'The final agreed module scope of the Admin Dashboard.', currentValue: { modules: ['overview', 'customers', 'supervisors', 'business_rules'], status: 'active' }, allowedValues: null, status: 'ACTIVE', source: 'Stage 14 delivered scope, extended by this stage', effectiveFrom: iso(30), effectiveTo: null, updatedBy: null, updatedAt: iso(30), notes: null },
];
let devRuleHistory = {};

const paged = (all, { page = 1, pageSize = 20 } = {}) => { const size = Math.min(100, Math.max(1, pageSize)); const p = Math.max(1, page); const slice = all.slice((p - 1) * size, p * size); return { items: slice, page: p, pageSize: size, total: all.length, nextPage: p * size < all.length ? p + 1 : null }; };
const bookingById = (id) => BOOKINGS.find((b) => b.id === id);

export const DEV_OPS_DATA = registerOpsDataAdapter({
  id: 'dev-ops-data', dev: true, provider: 'in-browser development stand-in', configSource: 'none',
  capabilities: ['bookings.operations', 'tasks', 'escalations', 'documents.review', 'services', 'workflow', 'suppliers', 'notifications.templates', 'notifications.history', 'audit', 'admin.dashboard', 'content'],
  async bookings() { await wait(); if (isEmpty()) return paged([]); return paged(BOOKINGS); },
  async booking(_t, id) {
    await wait(); const b = bookingById(id); if (!b) return null;
    const allowed = LIFECYCLE.transitions[b.opsStatus ?? LIFECYCLE.initial] ?? [];
    return { ...b, allowedTransitions: allowed, history: history.filter((h) => h.bookingId === id), documents: DOCS.filter((d) => d.bookingId === id), supplier: SUPPLIER.bookingId === id ? SUPPLIER : null, notesCustomer: notesCustomer.filter((n) => n.bookingId === id), notesInternal: notesInternal.filter((n) => n.bookingId === id), tasks: tasks.filter((t) => t.bookingId === id) };
  },
  async transitionBooking(_t, id, status, reason) {
    await wait(); const b = bookingById(id); if (!b) { const e = new Error('not found'); e.code = 'notFound'; throw e; }
    const allowed = LIFECYCLE.transitions[b.opsStatus ?? LIFECYCLE.initial] ?? [];
    if (!allowed.includes(status)) { const e = new Error('invalid transition'); e.code = 'invalid'; throw e; }
    if (PAYMENT_GATED.has(status) && b.paymentStatus !== 'paid') { const e = new Error('payment not confirmed'); e.code = 'conflict'; throw e; }
    history = [...history, { bookingId: id, previousStatus: b.opsStatus, newStatus: status, actor: 'staff-dev-demo', actorRole: 'admin', reason: reason ?? null, metadata: {}, at: new Date().toISOString() }];
    b.opsStatus = status;
    return this.booking(_t, id);
  },
  async assignBooking(_t, id, staffId) { await wait(); const b = bookingById(id); if (!b) { const e = new Error('not found'); e.code = 'notFound'; throw e; } b.assignedOperator = staffId ?? null; return { bookingId: id, assignedOperator: b.assignedOperator }; },
  async addBookingNote(_t, id, type, body) { await wait(); const note = { id: `dev-note-${Date.now()}`, bookingId: id, type, body, authorId: 'staff-dev-demo', authorRole: 'admin', createdAt: new Date().toISOString() }; if (type === 'customer') notesCustomer = [note, ...notesCustomer]; else notesInternal = [note, ...notesInternal]; return note; },
  async assignSupplierToBooking(_t, id, supplierId) { await wait(); return { id: `dev-bksup-${Date.now()}`, bookingId: id, supplierId, supplierReference: null, ticketNumber: null, status: 'pending', notes: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; },
  async updateBookingSupplier(_t, id, patch) { await wait(); Object.assign(SUPPLIER, patch, { updatedAt: new Date().toISOString() }); return { ...SUPPLIER }; },

  async tasks(_t, params = {}) { await wait(); if (isEmpty()) return paged([], params); let items = tasks; if (params.status) items = items.filter((t) => t.status === params.status); if (params.assignedTo) items = items.filter((t) => t.assignedTo === params.assignedTo); return paged(items, params); },
  async createTask(_t, task) { await wait(); const t = { id: `dev-task-${Date.now()}`, type: task.type ?? 'general', bookingId: task.bookingId ?? null, customerId: task.customerId ?? null, supervisorId: task.supervisorId ?? null, assignedTo: task.assignedTo ?? null, status: 'open', priority: PRIORITY_LEVELS.levels.includes(task.priority) ? task.priority : 'normal', dueAt: task.dueAt ?? null, notes: task.notes ?? '', createdBy: 'staff-dev-demo', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null }; tasks = [t, ...tasks]; return t; },
  async assignTask(_t, id, staffId) { await wait(); const t = tasks.find((x) => x.id === id); if (!t) return null; t.assignedTo = staffId ?? null; t.updatedAt = new Date().toISOString(); return { ...t }; },
  async updateTaskStatus(_t, id, status) { await wait(); const t = tasks.find((x) => x.id === id); if (!t) return null; t.status = status; t.completedAt = status === 'completed' ? new Date().toISOString() : null; t.updatedAt = new Date().toISOString(); return { ...t }; },

  async escalations(_t, params = {}) { await wait(); if (isEmpty()) return paged([], params); return paged(params.status ? escalations.filter((e) => e.status === params.status) : escalations, params); },
  async createEscalation(_t, escalation) { await wait(); const e = { id: `dev-esc-${Date.now()}`, bookingId: escalation.bookingId ?? null, taskId: escalation.taskId ?? null, reason: escalation.reason, severity: escalation.severity ?? 'normal', assignedTeam: escalation.assignedTeam ?? null, assignedOperator: escalation.assignedOperator ?? null, status: 'open', createdBy: 'staff-dev-demo', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), resolvedAt: null }; escalations = [e, ...escalations]; return e; },
  async updateEscalationStatus(_t, id, status) { await wait(); const e = escalations.find((x) => x.id === id); if (!e) return null; e.status = status; e.resolvedAt = ['resolved', 'closed'].includes(status) ? new Date().toISOString() : null; e.updatedAt = new Date().toISOString(); return { ...e }; },

  async reviewDocument(_t, id, status, reason) { await wait(); const d = DOCS.find((x) => x.id === id); if (!d) return null; d.reviewStatus = status; d.reviewerId = 'staff-dev-demo'; d.reviewedAt = new Date().toISOString(); d.rejectionReason = status === 'rejected' ? reason : null; return { ...d }; },
  async services() { await wait(); return SERVICES; },
  async service(_t, id) { await wait(); return SERVICES.find((s) => s.id === id) ?? null; },
  async updateService(_t, id, patch) { await wait(); const s = SERVICES.find((x) => x.id === id); if (!s) return null; Object.assign(s, patch, { updatedAt: new Date().toISOString() }); return { ...s }; },
  async serviceWorkflow(_t, id) { await wait(); return workflowSteps(id); },
  async setServiceWorkflow(_t, id, steps) { await wait(); WORKFLOWS[id] = steps.map((s) => [s.key, s.labelAr, s.labelEn]); return workflowSteps(id); },
  async serviceDocumentRequirements() { await wait(); return []; },
  async addServiceDocumentRequirement() { await wait(); return []; },

  async suppliers() { await wait(); return suppliers; },
  async createSupplier(_t, supplier) { await wait(); const s = { id: `dev-sup-${Date.now()}`, name: supplier.name, type: supplier.type, services: supplier.services ?? [], status: supplier.status ?? 'active', integrationStatus: 'not_connected', supportedOperations: supplier.supportedOperations ?? [], contact: supplier.contact ?? {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; suppliers = [s, ...suppliers]; return s; },

  async templates() { await wait(); return templates; },
  async upsertTemplate(_t, template) {
    await wait();
    const strip = (s) => String(s ?? '').replace(/<[^>]*>/g, '').slice(0, 4000);
    const existing = templates.find((t) => t.event === template.event && t.channel === template.channel);
    const clean = { ...template, bodyAr: strip(template.bodyAr), bodyEn: strip(template.bodyEn) };
    if (existing) { Object.assign(existing, clean, { version: existing.version + 1, updatedAt: new Date().toISOString() }); return { ...existing }; }
    const t = { id: `dev-tmpl-${Date.now()}`, ...clean, active: template.active !== false, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    templates = [t, ...templates]; return t;
  },
  async notificationHistory(_t, params = {}) { await wait(); return paged([{ id: 'dev-msg-1', channel: 'email', event: 'welcome', at: iso(2), status: 'queued', reference: 'dev-msg-1' }], params); },

  async audit(_t, params = {}) { await wait(); return paged(auditLog, params); },

  // ---- Stage 14: the Admin Dashboard ----
  async overview() {
    await wait();
    return {
      customers: customers.length, newCustomers7d: customers.filter((c) => Date.parse(c.createdAt) > Date.now() - 7 * 864e5).length,
      bookings: BOOKINGS.length, bookingsInProgress: BOOKINGS.filter((b) => !['completed', 'cancelled', 'failed', 'refunded'].includes(b.opsStatus)).length, bookingsUnpaid: BOOKINGS.filter((b) => b.paymentStatus === 'unpaid').length,
      tasksOpen: tasks.filter((x) => x.status === 'open').length, escalationsOpen: escalations.filter((x) => x.status === 'open').length,
      documentsPending: devDocumentsAdmin.filter((d) => d.reviewStatus === 'pending').length,
      suppliers: suppliers.length, suppliersNotConnected: suppliers.filter((s) => s.integrationStatus === 'not_connected').length,
      supervisors: supervisorsAdmin.filter((s) => s.status === 'active').length,
    };
  },
  async search(_t, query) {
    await wait(); const s = String(query ?? '').toLowerCase(); if (!s) return {};
    return {
      customers: customers.filter((c) => c.name.toLowerCase().includes(s) || c.id.includes(s)).slice(0, 5).map((c) => ({ id: c.id, name: c.name, email: c.email })),
      bookings: BOOKINGS.filter((b) => b.id.includes(s)).slice(0, 5).map((b) => ({ id: b.id, service: b.service, customerId: b.customerId })),
      supervisors: supervisorsAdmin.filter((sv) => (sv.nameEn ?? '').toLowerCase().includes(s) || sv.id.includes(s)).slice(0, 5).map((sv) => ({ id: sv.id, nameAr: sv.nameAr, nameEn: sv.nameEn })),
      suppliers: suppliers.filter((sp) => sp.name.toLowerCase().includes(s)).slice(0, 5).map((sp) => ({ id: sp.id, name: sp.name })),
      tasks: tasks.filter((tk) => tk.id.includes(s) || tk.type.includes(s)).slice(0, 5).map((tk) => ({ id: tk.id, type: tk.type, bookingId: tk.bookingId })),
      escalations: escalations.filter((e) => e.id.includes(s) || e.reason.includes(s)).slice(0, 5).map((e) => ({ id: e.id, reason: e.reason, bookingId: e.bookingId })),
    };
  },

  async customers(_t, params = {}) { await wait(); if (isEmpty()) return paged([], params); let items = customers; if (params.search) { const s = params.search.toLowerCase(); items = items.filter((c) => c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s)); } return paged(items, params); },
  async customer(_t, id) {
    await wait(); const c = customers.find((x) => x.id === id); if (!c) return null;
    return { ...c, bookings: BOOKINGS.filter((b) => b.customerId === id), documents: devDocumentsAdmin.filter((d) => d.customerId === id), payments: devPayments.filter((p) => p.customerId === id), notifications: [], attributionHistory: devAttributionEvents.filter((e) => e.customerId === id) };
  },
  async reassignCustomer(_t, id, supervisorId) {
    await wait(); const c = customers.find((x) => x.id === id); if (!c) { const e = new Error('not found'); e.code = 'notFound'; throw e; }
    const previous = c.supervisorId; c.supervisorId = supervisorId ?? null; c.attribution = supervisorId ? { supervisorId, source: 'reassigned', at: new Date().toISOString() } : null;
    devAttributionEvents = [...devAttributionEvents, { customerId: id, supervisorId: c.supervisorId, previousSupervisorId: previous, source: 'reassigned', actor: 'staff-dev-demo', at: new Date().toISOString() }];
    return { supervisorId: c.supervisorId, source: 'reassigned', at: new Date().toISOString(), previousSupervisorId: previous };
  },

  async supervisorsAdmin(_t, params = {}) { await wait(); if (isEmpty()) return paged([], params); let items = supervisorsAdmin; if (params.search) { const s = params.search.toLowerCase(); items = items.filter((sv) => (sv.nameEn ?? '').toLowerCase().includes(s) || (sv.slug ?? '').includes(s)); } return paged(items, params); },
  async supervisorAdmin(_t, id) {
    await wait(); const sv = supervisorsAdmin.find((x) => x.id === id); if (!sv) return null;
    return { ...sv, customers: customers.filter((c) => c.supervisorId === id), bookings: BOOKINGS.filter((b) => b.supervisorId === id), leads: devLeads, revenue: { currency: 'USD', gross: 0, completed: 0, pending: 0, cancelled: 0, bookingsCount: 0, commission: { model: null, status: 'pending_business_configuration' } }, performance: { customers: 0, leads: 0, leadsConverted: 0, conversionRate: null, bookings: 0, bookingsConfirmed: 0, bookingsCancelled: 0 }, commissions: [] };
  },
  async createSupervisorAdmin(_t, supervisor) {
    await wait(); const sv = { id: `dev-sv-${Date.now()}`, slug: supervisor.slug, status: 'active', nameAr: supervisor.nameAr ?? null, nameEn: supervisor.nameEn ?? null, titleAr: null, titleEn: null, bioAr: null, bioEn: null, image: null, languages: [], specialties: [], services: [], phone: supervisor.phone ?? null, whatsapp: null, email: supervisor.email ?? null, city: supervisor.city ?? null, internalId: null, notificationPrefs: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), customersCount: 0, dev: true };
    supervisorsAdmin = [sv, ...supervisorsAdmin]; return sv;
  },
  async updateSupervisorAdmin(_t, id, patchBody) {
    await wait(); const sv = supervisorsAdmin.find((x) => x.id === id); if (!sv) return null;
    Object.assign(sv, patchBody, { status: patchBody.active !== undefined ? (patchBody.active ? 'active' : 'inactive') : sv.status, updatedAt: new Date().toISOString() });
    return { ...sv };
  },

  async destinationsAdmin(_t, params = {}) { await wait(); let items = devDestinations; if (params.search) { const s = params.search.toLowerCase(); items = items.filter((d) => (d.nameEn ?? '').toLowerCase().includes(s) || d.slug.includes(s)); } if (params.region) items = items.filter((d) => d.region === params.region); if (params.publishStatus) items = items.filter((d) => d.publishStatus === params.publishStatus); return paged(items, params); },
  async destinationAdmin(_t, id) { await wait(); return devDestinations.find((d) => d.id === id || d.slug === id) ?? null; },
  async createDestinationAdmin(_t, destination) {
    await wait(); const d = { id: `dev-dst-${Date.now()}`, slug: destination.slug, region: null, nameAr: destination.nameAr ?? null, nameEn: destination.nameEn ?? null, countryAr: null, countryEn: null, descAr: null, descEn: null, purposes: [], services: [], image: null, featured: false, home: false, publishStatus: 'draft', publishedAt: null, hasUnpublishedChanges: false, order: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    devDestinations = [d, ...devDestinations]; return d;
  },
  async updateDestinationAdmin(_t, id, patchBody) {
    await wait(); const d = devDestinations.find((x) => x.id === id); if (!d) return null;
    const { publishStatus, ...contentPatch } = patchBody; const t = new Date().toISOString();
    Object.assign(d, contentPatch, { updatedAt: t });
    applyPublishTransition(d, { publishStatus }, !!(d.nameAr || d.nameEn), t);
    d.hasUnpublishedChanges = d.publishStatus === 'published' && !!d.publishedAt && d.updatedAt > d.publishedAt;
    return { ...d };
  },

  async offersAdmin(_t, params = {}) { await wait(); let items = devOffers; if (params.search) { const s = params.search.toLowerCase(); items = items.filter((o) => (o.titleEn ?? '').toLowerCase().includes(s) || o.slug.includes(s)); } if (params.destinationId) items = items.filter((o) => o.destinationId === params.destinationId); if (params.publishStatus) items = items.filter((o) => o.publishStatus === params.publishStatus); return paged(items, params); },
  async offerAdmin(_t, id) { await wait(); return devOffers.find((o) => o.id === id || o.slug === id) ?? null; },
  async createOfferAdmin(_t, offer) {
    await wait(); const o = { id: `dev-off-${Date.now()}`, slug: offer.slug, category: null, categories: [], destinationId: null, titleAr: offer.titleAr ?? null, titleEn: offer.titleEn ?? null, shortAr: null, shortEn: null, descAr: null, descEn: null, duration: { nights: null }, price: null, status: 'request', bookingMode: 'request', featured: false, placeholder: true, services: [], image: null, detail: {}, publishStatus: 'draft', publishedAt: null, hasUnpublishedChanges: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    devOffers = [o, ...devOffers]; return o;
  },
  async updateOfferAdmin(_t, id, patchBody) {
    await wait(); const o = devOffers.find((x) => x.id === id); if (!o) return null;
    const { publishStatus, ...contentPatch } = patchBody; const t = new Date().toISOString();
    Object.assign(o, contentPatch, { updatedAt: t });
    applyPublishTransition(o, { publishStatus }, !!(o.titleAr || o.titleEn), t);
    o.hasUnpublishedChanges = o.publishStatus === 'published' && !!o.publishedAt && o.updatedAt > o.publishedAt;
    return { ...o };
  },

  async leads(_t, params = {}) { await wait(); return paged(devLeads, params); },
  async attributionEvents(_t, params = {}) { await wait(); return paged(devAttributionEvents, params); },

  async payments(_t, params = {}) { await wait(); let items = devPayments; if (params.customerId) items = items.filter((p) => p.customerId === params.customerId); return paged(items, params); },
  async documentsAdmin(_t, params = {}) { await wait(); let items = devDocumentsAdmin; if (params.customerId) items = items.filter((d) => d.customerId === params.customerId); return paged(items, params); },

  async reportBookings() { await wait(); return { total: BOOKINGS.length, byOperationalStatus: [{ status: 'submitted', n: BOOKINGS.length }], byService: [{ service: 'flights', n: 1 }, { service: 'visa', n: 1 }], byPaymentStatus: [{ status: 'paid', n: 1 }, { status: 'unpaid', n: 1 }] }; },
  async reportOperations() { await wait(); return { tasksByStatus: [{ status: 'open', n: tasks.filter((x) => x.status === 'open').length }], tasksByPriority: [{ priority: 'normal', n: 1 }, { priority: 'high', n: 1 }], escalationsByStatus: [{ status: 'open', n: escalations.length }], escalationsBySeverity: [{ severity: 'high', n: 1 }] }; },
  async reportSuppliers() { await wait(); return { total: suppliers.length, byIntegrationStatus: [{ status: 'not_connected', n: suppliers.length }], bookingsBySupplier: [] }; },
  async reportDocuments() { await wait(); return { byReviewStatus: [{ status: 'pending', n: devDocumentsAdmin.length }], total: devDocumentsAdmin.length }; },
  async reportNotifications() { await wait(); return { byStatus: [{ status: 'queued', n: 1 }], byChannel: [{ channel: 'email', n: 1 }], total: 1 }; },

  async staffList() { await wait(); return staffAccounts; },
  async createStaff(_t, staff) { await wait(); const s = { id: `dev-staff-${Date.now()}`, email: staff.email, name: staff.name, role: staff.role ?? 'ops', permissions: staff.role === 'admin' ? [] : (staff.permissions ?? []), active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; staffAccounts = [s, ...staffAccounts]; return s; },
  async setStaffActive(_t, id, active) { await wait(); const s = staffAccounts.find((x) => x.id === id); if (!s) return null; s.active = !!active; s.updatedAt = new Date().toISOString(); return { ...s }; },
  async setStaffPermissions(_t, id, permissions) { await wait(); const s = staffAccounts.find((x) => x.id === id); if (!s) return null; if (s.role === 'admin') { const e = new Error('invalid'); e.code = 'invalid'; throw e; } s.permissions = permissions; s.updatedAt = new Date().toISOString(); return { ...s }; },

  async rules(_t, params = {}) { await wait(); let items = devRules; if (params.category) items = items.filter((r) => r.category === params.category); if (params.status) items = items.filter((r) => r.status === params.status); return { items }; },
  async rule(_t, id) { await wait(); return devRules.find((r) => r.ruleId === id) ?? null; },
  async ruleHistory(_t, id) { await wait(); return devRuleHistory[id] ?? []; },
  async updateRule(_t, id, patch) {
    await wait(); const r = devRules.find((x) => x.ruleId === id); if (!r) { const e = new Error('not found'); e.code = 'notFound'; throw e; }
    if (patch.status !== undefined && !RULE_STATUSES.includes(patch.status)) { const e = new Error('invalid'); e.code = 'invalid'; throw e; }
    devRuleHistory[id] = [{ ...r, supersededAt: new Date().toISOString(), effectiveTo: new Date().toISOString() }, ...(devRuleHistory[id] ?? [])];
    if (patch.value !== undefined) r.currentValue = patch.value;
    if (patch.allowedValues !== undefined) r.allowedValues = patch.allowedValues;
    if (patch.notes !== undefined) r.notes = patch.notes;
    if (patch.status !== undefined && patch.status !== r.status) { r.status = patch.status; r.effectiveFrom = new Date().toISOString(); }
    r.updatedBy = 'staff-dev-demo'; r.updatedAt = new Date().toISOString();
    return { ...r };
  },
  async pendingDecisions() {
    await wait();
    const rules = devRules.filter((r) => ['PENDING', 'DRAFT'].includes(r.status)).map((r) => ({ id: r.ruleId, category: r.category, name: r.name, status: r.status, reason: r.currentValue?.note ?? r.source, impact: 'business_rule' }));
    const configuredIds = new Set(Object.keys(WORKFLOWS));
    const unconfigured = SERVICES.filter((s) => !configuredIds.has(s.id)).map((s) => ({ id: `service:${s.id}`, category: 'service_workflow', name: `${s.id} workflow`, status: 'NOT_CONFIGURED', reason: 'no workflow steps configured for this service', impact: 'service' }));
    const notConnected = suppliers.filter((s) => s.integrationStatus !== 'connected').map((s) => ({ id: `supplier:${s.id}`, category: 'supplier_integration', name: s.name, status: 'NOT_CONNECTED', reason: 'no real integration has been verified for this supplier', impact: 'supplier' }));
    return { items: [...rules, ...unconfigured, ...notConnected] };
  },
  async ruleMatrix() {
    await wait();
    const rows = devRules.map((r) => ({ category: r.category, rule: r.name, status: r.status, configured: r.status === 'ACTIVE' || r.status === 'APPROVED', source: r.source, impact: r.currentValue?.note ?? '' }));
    const configuredIds = new Set(Object.keys(WORKFLOWS));
    const configuredCount = SERVICES.filter((s) => configuredIds.has(s.id)).length;
    rows.push({ category: 'service_workflows', rule: 'Service workflow coverage', status: configuredCount === SERVICES.length ? 'ACTIVE' : 'PARTIALLY_CONFIGURED', configured: configuredCount > 0, source: 'services / service_workflows tables', impact: `${configuredCount}/${SERVICES.length} services have a configured workflow` });
    const connected = suppliers.filter((s) => s.integrationStatus === 'connected').length;
    rows.push({ category: 'suppliers', rule: 'Supplier integration coverage', status: connected ? 'PARTIALLY_CONFIGURED' : 'NOT_CONNECTED', configured: connected > 0, source: 'suppliers table', impact: `${connected}/${suppliers.length} suppliers verified connected` });
    return { items: rows };
  },
});
