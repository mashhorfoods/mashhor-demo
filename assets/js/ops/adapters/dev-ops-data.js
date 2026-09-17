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
import { registerOpsDataAdapter } from '../data.js';

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

const paged = (all, { page = 1, pageSize = 20 } = {}) => { const size = Math.min(100, Math.max(1, pageSize)); const p = Math.max(1, page); const slice = all.slice((p - 1) * size, p * size); return { items: slice, page: p, pageSize: size, total: all.length, nextPage: p * size < all.length ? p + 1 : null }; };
const bookingById = (id) => BOOKINGS.find((b) => b.id === id);

export const DEV_OPS_DATA = registerOpsDataAdapter({
  id: 'dev-ops-data', dev: true, provider: 'in-browser development stand-in', configSource: 'none',
  capabilities: ['bookings.operations', 'tasks', 'escalations', 'documents.review', 'services', 'workflow', 'suppliers', 'notifications.templates', 'notifications.history', 'audit'],
  async meta() { await wait(); return { permissions: ['booking.view', 'booking.manage', 'booking.status.change', 'booking.assign', 'task.view', 'task.manage', 'document.review', 'supplier.view', 'supplier.manage', 'notification.send', 'notification.manage', 'service.manage', 'workflow.manage', 'report.view', 'audit.view'], priorityLevels: PRIORITY_LEVELS, lifecycle: LIFECYCLE }; },
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
  async bookingNotes(_t, id, type) { await wait(); return (type === 'customer' ? notesCustomer : notesInternal).filter((n) => n.bookingId === id); },
  async addBookingNote(_t, id, type, body) { await wait(); const note = { id: `dev-note-${Date.now()}`, bookingId: id, type, body, authorId: 'staff-dev-demo', authorRole: 'admin', createdAt: new Date().toISOString() }; if (type === 'customer') notesCustomer = [note, ...notesCustomer]; else notesInternal = [note, ...notesInternal]; return note; },
  async assignSupplierToBooking(_t, id, supplierId) { await wait(); return { id: `dev-bksup-${Date.now()}`, bookingId: id, supplierId, supplierReference: null, ticketNumber: null, status: 'pending', notes: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; },
  async updateBookingSupplier(_t, id, patch) { await wait(); Object.assign(SUPPLIER, patch, { updatedAt: new Date().toISOString() }); return { ...SUPPLIER }; },

  async tasks(_t, params = {}) { await wait(); if (isEmpty()) return paged([], params); let items = tasks; if (params.status) items = items.filter((t) => t.status === params.status); if (params.assignedTo) items = items.filter((t) => t.assignedTo === params.assignedTo); return paged(items, params); },
  async task(_t, id) { await wait(); return tasks.find((t) => t.id === id) ?? null; },
  async createTask(_t, task) { await wait(); const t = { id: `dev-task-${Date.now()}`, type: task.type ?? 'general', bookingId: task.bookingId ?? null, customerId: task.customerId ?? null, supervisorId: task.supervisorId ?? null, assignedTo: task.assignedTo ?? null, status: 'open', priority: PRIORITY_LEVELS.levels.includes(task.priority) ? task.priority : 'normal', dueAt: task.dueAt ?? null, notes: task.notes ?? '', createdBy: 'staff-dev-demo', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null }; tasks = [t, ...tasks]; return t; },
  async assignTask(_t, id, staffId) { await wait(); const t = tasks.find((x) => x.id === id); if (!t) return null; t.assignedTo = staffId ?? null; t.updatedAt = new Date().toISOString(); return { ...t }; },
  async updateTaskStatus(_t, id, status) { await wait(); const t = tasks.find((x) => x.id === id); if (!t) return null; t.status = status; t.completedAt = status === 'completed' ? new Date().toISOString() : null; t.updatedAt = new Date().toISOString(); return { ...t }; },

  async escalations(_t, params = {}) { await wait(); if (isEmpty()) return paged([], params); return paged(params.status ? escalations.filter((e) => e.status === params.status) : escalations, params); },
  async createEscalation(_t, escalation) { await wait(); const e = { id: `dev-esc-${Date.now()}`, bookingId: escalation.bookingId ?? null, taskId: escalation.taskId ?? null, reason: escalation.reason, severity: escalation.severity ?? 'normal', assignedTeam: escalation.assignedTeam ?? null, assignedOperator: escalation.assignedOperator ?? null, status: 'open', createdBy: 'staff-dev-demo', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), resolvedAt: null }; escalations = [e, ...escalations]; return e; },
  async updateEscalationStatus(_t, id, status) { await wait(); const e = escalations.find((x) => x.id === id); if (!e) return null; e.status = status; e.resolvedAt = ['resolved', 'closed'].includes(status) ? new Date().toISOString() : null; e.updatedAt = new Date().toISOString(); return { ...e }; },

  async reviewDocument(_t, id, status, reason) { await wait(); const d = DOCS.find((x) => x.id === id); if (!d) return null; d.reviewStatus = status; d.reviewerId = 'staff-dev-demo'; d.reviewedAt = new Date().toISOString(); d.rejectionReason = status === 'rejected' ? reason : null; return { ...d }; },
  async documentRequirements() { await wait(); return []; },

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
});
