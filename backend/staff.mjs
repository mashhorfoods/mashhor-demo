// ============================================================================
// BACKEND / STAFF — Stage 15. Admin and Operations Staff share ONE credential
// store and ONE session (a THIRD role, separate from customers and
// supervisors: its own cookie `no_ops_session`, its own CSRF token, its own
// `staff_sessions` table — never interchangeable with the other two, exactly
// the pattern Stage 13 used for supervisors). What separates "admin" from
// "ops" is role + permissions, checked on every route, never a client flag.
//
// This module also holds the booking operational lifecycle (a state machine
// SEPARATE from the customer-facing `bookings.status` — the booking engine
// is not touched), tasks, escalations, the service operational catalogue,
// supplier operations, booking notes, notification templates and the
// actor-based audit trail. Nothing here decides a business rule the brief
// reserves for the business (§38): where a rule is not confirmed, the
// function says so in its shape (`status: 'pending_...'`) rather than acting
// on a guess.
// ============================================================================
import { config } from './config.mjs';
import { q, now } from './db.mjs';
import { hex, HttpError, str } from './http.mjs';
import { hash, same, checkPassword, normEmail } from './identity.mjs';
import { warn } from './logger.mjs';

const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

/* ---- permissions ---------------------------------------------------------- */
// The full permission vocabulary the backend actually enforces (§25) — a permission not in this list is never granted
// and never checked, so the UI can never offer a control the server would not honour anyway.
export const PERMISSIONS = [
  'booking.view', 'booking.manage', 'booking.status.change', 'booking.assign',
  'task.view', 'task.manage', 'document.review', 'supplier.view', 'supplier.manage',
  'notification.send', 'notification.manage', 'service.manage', 'workflow.manage', 'report.view', 'audit.view',
];
/** role 'admin' holds every permission implicitly; role 'ops' holds exactly what permissions_json lists. */
export function hasPermission(staffMember, permission) {
  if (!staffMember?.active) return false;
  if (staffMember.role === 'admin') return true;
  return J(staffMember.permissions_json, []).includes(permission);
}
export function requirePermission(staffMember, permission) { if (!hasPermission(staffMember, permission)) throw new HttpError(403, 'forbidden'); }

/* ---- rows -> contract shapes ----------------------------------------------- */
export function publicStaff(s) {
  if (!s) return null;
  return { id: s.id, email: s.email, name: s.name, role: s.role, permissions: s.role === 'admin' ? [...PERMISSIONS] : J(s.permissions_json, []), active: !!s.active, createdAt: s.created_at, updatedAt: s.updated_at };
}
export const staffById = (id) => q.get('SELECT * FROM staff WHERE id = ?', id);
export const staffByEmail = (email) => q.get('SELECT * FROM staff WHERE email = ?', normEmail(email));

/* ---- credentials (same algorithm as identity.mjs; a third, separate store) ------ */
function attempts(key) { const row = q.get('SELECT * FROM login_attempts WHERE key = ?', key); const t = Date.now(); if (!row || t - row.window_start > config.lockout.windowMs) return 0; return row.count; }
function recordFailure(key) { const t = Date.now(); const row = q.get('SELECT * FROM login_attempts WHERE key = ?', key); if (!row || t - row.window_start > config.lockout.windowMs) q.run('INSERT OR REPLACE INTO login_attempts (key, count, window_start) VALUES (?, 1, ?)', key, t); else q.run('UPDATE login_attempts SET count = count + 1 WHERE key = ?', key); }
const clearFailures = (key) => q.run('DELETE FROM login_attempts WHERE key = ?', key);

export function verifyStaffPassword({ email, password, ip }) {
  const e = normEmail(email); const keys = [`st:e:${e}`, `st:ip:${ip}`];
  if (keys.some((k) => attempts(k) >= config.lockout.attempts)) { warn('staff.auth.lockout', { ip }); throw new HttpError(429, 'rateLimited', { retryAfter: Math.ceil(config.lockout.windowMs / 1000) }); }
  const s = staffByEmail(e);
  const ok = !!s && s.active && s.password_hash && typeof password === 'string' && same(hash(password, s.password_salt), s.password_hash);
  if (!ok) { keys.forEach(recordFailure); throw new HttpError(401, 'invalid'); }
  keys.forEach(clearFailures); return s;
}
export function setStaffPassword(staffId, password) { checkPassword(password); const salt = hex(8); q.run('UPDATE staff SET password_salt = ?, password_hash = ?, updated_at = ? WHERE id = ?', salt, hash(password, salt), now(), staffId); }
export function changeStaffPassword(staffId, current, next) {
  const s = staffById(staffId); if (!s) throw new HttpError(401, 'unauthenticated');
  if (!s.password_hash || !same(hash(String(current ?? ''), s.password_salt), s.password_hash)) throw new HttpError(422, 'invalid');
  setStaffPassword(s.id, next);
}

/* ---- sessions -------------------------------------------------------------- */
export function createStaffSession(staffId) {
  const id = hex(24); const csrf = hex(16); const t = now(); const exp = Date.now() + config.sessionTtlMs;
  q.run('INSERT INTO staff_sessions (id, staff_id, csrf, created_at, expires_at, last_seen_at) VALUES (?,?,?,?,?,?)', id, staffId, csrf, t, exp, t);
  return { id, csrf, expiresAt: new Date(exp).toISOString(), maxAge: Math.floor(config.sessionTtlMs / 1000) };
}
export function liveStaffSession(sid) {
  if (!sid) return null; const s = q.get('SELECT * FROM staff_sessions WHERE id = ?', sid); if (!s) return null;
  if (s.expires_at <= Date.now()) { q.run('DELETE FROM staff_sessions WHERE id = ?', sid); return null; }
  q.run('UPDATE staff_sessions SET last_seen_at = ? WHERE id = ?', now(), sid); return s;
}
export const endStaffSession = (sid) => { if (sid) q.run('DELETE FROM staff_sessions WHERE id = ?', sid); };
export const endAllStaffSessions = (staffId) => q.run('DELETE FROM staff_sessions WHERE staff_id = ?', staffId);
export const sweepStaffSessions = () => q.run('DELETE FROM staff_sessions WHERE expires_at <= ?', Date.now());

export function createStaffReset(email) {
  const s = staffByEmail(email); if (!s || !s.active) return null;
  const token = `strs_${hex(16)}`; q.run('INSERT INTO staff_reset_tokens (token, staff_id, expires_at, created_at) VALUES (?,?,?,?)', token, s.id, Date.now() + config.resetTtlMs, now());
  return { token, staff: s };
}
export function consumeStaffReset(token, password) {
  const r = token ? q.get('SELECT * FROM staff_reset_tokens WHERE token = ?', token) : null;
  if (!r || r.expires_at <= Date.now()) { if (r) q.run('DELETE FROM staff_reset_tokens WHERE token = ?', token); throw new HttpError(410, 'invalidToken'); }
  setStaffPassword(r.staff_id, password); q.run('DELETE FROM staff_reset_tokens WHERE token = ?', token); endAllStaffSessions(r.staff_id);
  return r.staff_id;
}

/* ---- audit: server-controlled, every operational action lands here (§24, §26) -------------------------------- */
export function audit(actor, action, entityType, entityId, metadata = {}) {
  q.run('INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, metadata_json, at) VALUES (?,?,?,?,?,?,?)',
    actor.id, actor.role, action, entityType, entityId ?? null, JSON.stringify(metadata ?? {}), now());
}
export function auditEvents({ entityType = '', entityId = '', page = 1, pageSize = 50 } = {}) {
  const where = []; const params = [];
  if (entityType) { where.push('entity_type = ?'); params.push(entityType); }
  if (entityId) { where.push('entity_id = ?'); params.push(entityId); }
  const all = q.all(`SELECT * FROM audit_events ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY at DESC`, ...params);
  const size = Math.min(100, Math.max(1, pageSize)); const p = Math.max(1, page); const slice = all.slice((p - 1) * size, p * size);
  return { items: slice.map(nAudit), page: p, pageSize: size, total: all.length, nextPage: p * size < all.length ? p + 1 : null };
}
const nAudit = (r) => ({ id: r.id, actorId: r.actor_id, actorRole: r.actor_role, action: r.action, entityType: r.entity_type, entityId: r.entity_id, metadata: J(r.metadata_json, {}), at: r.at });

/* ---- booking operational lifecycle: backend-authoritative state machine (§03/§04) ------------------------------ */
export const lifecycleConfig = () => J(q.get("SELECT value_json FROM business_config WHERE key = 'booking_lifecycle'")?.value_json, { initial: 'submitted', transitions: {}, status: 'pending_business_configuration' });
const nBookingRow = (r) => ({ id: r.id, customerId: r.customer_id, service: r.service, status: r.status, paymentStatus: r.payment_status, amount: r.amount, currency: r.currency, supervisorId: r.supervisor_id, opsStatus: r.ops_status, assignedOperator: r.assigned_operator, createdAt: r.created_at });

/** Every current valid next state from `from`, per the configured lifecycle — what the UI is allowed to offer. */
export function allowedTransitions(fromStatus) {
  const cfg = lifecycleConfig(); const from = fromStatus ?? cfg.initial;
  return cfg.transitions[from] ?? [];
}
/**
 * Move a booking's OPERATIONAL status. Rejects a transition the configured lifecycle does not list (422); rejects
 * moving into a state that requires payment (processing/confirmed/ticketed/service_in_progress/completed) unless
 * `payment_status = 'paid'` — the payment provider remains authoritative, this never marks a payment itself (§17).
 * Every attempt — accepted or not — is NOT logged (only accepted transitions are, to keep the trail meaningful);
 * a rejected attempt still throws, so the caller's own audit/logging can record the refusal if it chooses to.
 */
const PAYMENT_GATED = new Set(['payment_received', 'processing', 'confirmed', 'ticketed', 'service_in_progress', 'completed']);
export function transitionBooking(bookingId, newStatus, actor, reason = null, metadata = {}) {
  const b = q.get('SELECT * FROM bookings WHERE id = ?', bookingId); if (!b) throw new HttpError(404, 'notFound');
  const cfg = lifecycleConfig(); const current = b.ops_status ?? cfg.initial;
  const allowed = cfg.transitions[current] ?? [];
  if (!allowed.includes(newStatus)) throw new HttpError(422, 'invalid', { from: current, to: newStatus });
  if (PAYMENT_GATED.has(newStatus) && b.payment_status !== 'paid') throw new HttpError(409, 'conflict', { reason: 'paymentNotConfirmed' });
  const t = now();
  // bookings (Stage 12.2 schema) has no updated_at column — only ops_status changes here.
  q.run('UPDATE bookings SET ops_status = ? WHERE id = ?', newStatus, bookingId);
  q.run('INSERT INTO booking_status_history (booking_id, previous_status, new_status, actor, actor_role, reason, metadata_json, at) VALUES (?,?,?,?,?,?,?,?)',
    bookingId, current, newStatus, actor.id, actor.role, reason, JSON.stringify(metadata ?? {}), t);
  audit(actor, 'booking.status.change', 'booking', bookingId, { from: current, to: newStatus, reason });
  return { bookingId, previousStatus: current, newStatus, at: t };
}
export function bookingStatusHistory(bookingId) {
  return q.all('SELECT * FROM booking_status_history WHERE booking_id = ? ORDER BY at', bookingId)
    .map((r) => ({ previousStatus: r.previous_status, newStatus: r.new_status, actor: r.actor, actorRole: r.actor_role, reason: r.reason, metadata: J(r.metadata_json, {}), at: r.at }));
}
export function assignBookingOperator(bookingId, staffId, actor) {
  const b = q.get('SELECT * FROM bookings WHERE id = ?', bookingId); if (!b) throw new HttpError(404, 'notFound');
  if (staffId && !staffById(staffId)) throw new HttpError(422, 'invalid');
  q.run('UPDATE bookings SET assigned_operator = ? WHERE id = ?', staffId ?? null, bookingId);
  audit(actor, 'booking.assign', 'booking', bookingId, { assignedOperator: staffId ?? null });
  return { bookingId, assignedOperator: staffId ?? null };
}
export function opsBookingList({ status = '', service = '', assignedTo = '', page = 1, pageSize = 20 } = {}) {
  const where = []; const params = [];
  if (status) { where.push('ops_status = ?'); params.push(status); }
  if (service) { where.push('service = ?'); params.push(service); }
  if (assignedTo) { where.push('assigned_operator = ?'); params.push(assignedTo); }
  const all = q.all(`SELECT * FROM bookings ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`, ...params);
  const size = Math.min(100, Math.max(1, pageSize)); const p = Math.max(1, page); const slice = all.slice((p - 1) * size, p * size);
  return { items: slice.map((r) => ({ ...nBookingRow(r), missingDocuments: q.get("SELECT COUNT(*) AS n FROM documents WHERE booking_id = ? AND review_status != 'approved'", r.id).n })), page: p, pageSize: size, total: all.length, nextPage: p * size < all.length ? p + 1 : null };
}
export function opsBookingDetail(bookingId) {
  const b = q.get('SELECT * FROM bookings WHERE id = ?', bookingId); if (!b) return null;
  const supplier = q.get('SELECT * FROM booking_suppliers WHERE booking_id = ? ORDER BY created_at DESC LIMIT 1', bookingId);
  return {
    ...nBookingRow(b), allowedTransitions: allowedTransitions(b.ops_status),
    history: bookingStatusHistory(bookingId),
    documents: q.all('SELECT * FROM documents WHERE booking_id = ?', bookingId).map(nDocReview),
    supplier: supplier ? nBookingSupplier(supplier) : null,
    notesCustomer: q.all("SELECT * FROM booking_notes WHERE booking_id = ? AND type = 'customer' ORDER BY created_at DESC", bookingId).map(nNote),
    notesInternal: q.all("SELECT * FROM booking_notes WHERE booking_id = ? AND type = 'internal' ORDER BY created_at DESC", bookingId).map(nNote),
    tasks: q.all('SELECT * FROM operation_tasks WHERE booking_id = ? ORDER BY created_at DESC', bookingId).map(nTask),
  };
}

/* ---- operations tasks (§06/§07) -------------------------------------------------------------------------------- */
const TASK_STATUSES = ['open', 'in_progress', 'waiting', 'completed', 'cancelled'];
export const taskPriorityLevels = () => J(q.get("SELECT value_json FROM business_config WHERE key = 'task_priority_levels'")?.value_json, { levels: ['normal'], status: 'pending_business_configuration' });
const nTask = (r) => ({ id: r.id, type: r.type, bookingId: r.booking_id, customerId: r.customer_id, supervisorId: r.supervisor_id, assignedTo: r.assigned_to, status: r.status, priority: r.priority, dueAt: r.due_at, notes: r.notes, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at });
export function createTask({ type, bookingId = null, customerId = null, supervisorId = null, assignedTo = null, priority = 'normal', dueAt = null, notes = '' }, actor) {
  const id = `task_${hex(8)}`; const t = now();
  const levels = taskPriorityLevels().levels; const pr = levels.includes(priority) ? priority : (levels[0] ?? 'normal');
  q.run('INSERT INTO operation_tasks (id, type, booking_id, customer_id, supervisor_id, assigned_to, status, priority, due_at, notes, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, str(type, 40), bookingId, customerId, supervisorId, assignedTo, 'open', pr, dueAt, str(notes, 2000), actor.id, t, t);
  audit(actor, 'task.create', 'task', id, { type, bookingId, assignedTo });
  return nTask(q.get('SELECT * FROM operation_tasks WHERE id = ?', id));
}
export function listTasks({ status = '', assignedTo = '', bookingId = '', page = 1, pageSize = 20 } = {}) {
  const where = []; const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (assignedTo) { where.push('assigned_to = ?'); params.push(assignedTo); }
  if (bookingId) { where.push('booking_id = ?'); params.push(bookingId); }
  const all = q.all(`SELECT * FROM operation_tasks ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`, ...params);
  const size = Math.min(100, Math.max(1, pageSize)); const p = Math.max(1, page); const slice = all.slice((p - 1) * size, p * size);
  return { items: slice.map(nTask), page: p, pageSize: size, total: all.length, nextPage: p * size < all.length ? p + 1 : null };
}
export function taskById(id) { const r = q.get('SELECT * FROM operation_tasks WHERE id = ?', id); return r ? nTask(r) : null; }
export function assignTask(id, assignedTo, actor) {
  const r = q.get('SELECT * FROM operation_tasks WHERE id = ?', id); if (!r) throw new HttpError(404, 'notFound');
  if (assignedTo && !staffById(assignedTo)) throw new HttpError(422, 'invalid');
  q.run('UPDATE operation_tasks SET assigned_to = ?, updated_at = ? WHERE id = ?', assignedTo ?? null, now(), id);
  audit(actor, assignedTo ? 'task.assign' : 'task.unassign', 'task', id, { assignedTo: assignedTo ?? null, previousAssignedTo: r.assigned_to });
  return nTask(q.get('SELECT * FROM operation_tasks WHERE id = ?', id));
}
export function updateTaskStatus(id, status, actor) {
  if (!TASK_STATUSES.includes(status)) throw new HttpError(422, 'invalid');
  const r = q.get('SELECT * FROM operation_tasks WHERE id = ?', id); if (!r) throw new HttpError(404, 'notFound');
  const t = now(); const completedAt = status === 'completed' ? t : (status === 'open' && r.status === 'completed' ? null : r.completed_at);
  q.run('UPDATE operation_tasks SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?', status, t, completedAt, id);
  audit(actor, `task.${status}`, 'task', id, { previousStatus: r.status });
  return nTask(q.get('SELECT * FROM operation_tasks WHERE id = ?', id));
}

/* ---- escalations (§21) ------------------------------------------------------------------------------------------ */
const ESCALATION_STATUSES = ['open', 'investigating', 'waiting', 'resolved', 'closed'];
const nEscalation = (r) => ({ id: r.id, bookingId: r.booking_id, taskId: r.task_id, reason: r.reason, severity: r.severity, assignedTeam: r.assigned_team, assignedOperator: r.assigned_operator, status: r.status, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at, resolvedAt: r.resolved_at });
export function createEscalation({ bookingId = null, taskId = null, reason, severity = 'normal', assignedTeam = null, assignedOperator = null }, actor) {
  const id = `esc_${hex(8)}`; const t = now();
  q.run('INSERT INTO escalations (id, booking_id, task_id, reason, severity, assigned_team, assigned_operator, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    id, bookingId, taskId, str(reason, 500), str(severity, 20) || 'normal', assignedTeam, assignedOperator, 'open', actor.id, t, t);
  audit(actor, 'escalation.create', 'escalation', id, { bookingId, taskId, severity });
  return nEscalation(q.get('SELECT * FROM escalations WHERE id = ?', id));
}
export function listEscalations({ status = '', page = 1, pageSize = 20 } = {}) {
  const where = []; const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  const all = q.all(`SELECT * FROM escalations ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`, ...params);
  const size = Math.min(100, Math.max(1, pageSize)); const p = Math.max(1, page); const slice = all.slice((p - 1) * size, p * size);
  return { items: slice.map(nEscalation), page: p, pageSize: size, total: all.length, nextPage: p * size < all.length ? p + 1 : null };
}
export function updateEscalationStatus(id, status, actor) {
  if (!ESCALATION_STATUSES.includes(status)) throw new HttpError(422, 'invalid');
  const r = q.get('SELECT * FROM escalations WHERE id = ?', id); if (!r) throw new HttpError(404, 'notFound');
  const t = now(); const resolvedAt = ['resolved', 'closed'].includes(status) ? t : null;
  q.run('UPDATE escalations SET status = ?, updated_at = ?, resolved_at = ? WHERE id = ?', status, t, resolvedAt, id);
  audit(actor, 'escalation.status', 'escalation', id, { previousStatus: r.status, status });
  return nEscalation(q.get('SELECT * FROM escalations WHERE id = ?', id));
}

/* ---- service operational catalogue (§08/§09/§10) ------------------------------------------------------------------ */
const nService = (r) => ({ id: r.id, active: !!r.active, bookingEnabled: !!r.booking_enabled, workflowType: r.workflow_type, supplierType: r.supplier_type, operationalRequirements: r.operational_requirements, createdAt: r.created_at, updatedAt: r.updated_at });
export const listServices = () => q.all('SELECT * FROM services ORDER BY id').map(nService);
export const serviceById = (id) => { const r = q.get('SELECT * FROM services WHERE id = ?', id); return r ? nService(r) : null; };
export function updateService(id, patch, actor) {
  const r = q.get('SELECT * FROM services WHERE id = ?', id); if (!r) throw new HttpError(404, 'notFound');
  const active = patch.active != null ? (patch.active ? 1 : 0) : r.active;
  const bookingEnabled = patch.bookingEnabled != null ? (patch.bookingEnabled ? 1 : 0) : r.booking_enabled;
  const workflowType = patch.workflowType !== undefined ? str(patch.workflowType, 40) || null : r.workflow_type;
  const supplierType = patch.supplierType !== undefined ? str(patch.supplierType, 40) || null : r.supplier_type;
  q.run('UPDATE services SET active = ?, booking_enabled = ?, workflow_type = ?, supplier_type = ?, updated_at = ? WHERE id = ?', active, bookingEnabled, workflowType, supplierType, now(), id);
  audit(actor, 'service.update', 'service', id, { patch });
  return serviceById(id);
}
export const serviceWorkflow = (serviceId) => q.all('SELECT * FROM service_workflows WHERE service_id = ? ORDER BY step_order', serviceId).map((r) => ({ order: r.step_order, key: r.step_key, labelAr: r.label_ar, labelEn: r.label_en }));
export function setServiceWorkflow(serviceId, steps, actor) {
  if (!serviceById(serviceId)) throw new HttpError(404, 'notFound');
  q.tx(() => { q.run('DELETE FROM service_workflows WHERE service_id = ?', serviceId); steps.forEach((s, i) => q.run('INSERT INTO service_workflows (service_id, step_order, step_key, label_ar, label_en) VALUES (?,?,?,?,?)', serviceId, i, str(s.key, 40), str(s.labelAr, 80), str(s.labelEn, 80))); });
  audit(actor, 'workflow.update', 'service', serviceId, { steps: steps.length });
  return serviceWorkflow(serviceId);
}
export const serviceDocumentRequirements = (serviceId) => q.all('SELECT * FROM service_document_requirements WHERE service_id = ?', serviceId).map((r) => ({ id: r.id, docType: r.doc_type, required: !!r.required, customerUpload: !!r.customer_upload }));
export function addServiceDocumentRequirement(serviceId, { docType, required = true, customerUpload = true }, actor) {
  if (!serviceById(serviceId)) throw new HttpError(404, 'notFound');
  const t = now();
  q.run('INSERT INTO service_document_requirements (service_id, doc_type, required, customer_upload, created_at, updated_at) VALUES (?,?,?,?,?,?)', serviceId, str(docType, 40), required ? 1 : 0, customerUpload ? 1 : 0, t, t);
  audit(actor, 'service.documentRequirement.add', 'service', serviceId, { docType });
  return serviceDocumentRequirements(serviceId);
}
export const allDocumentRequirements = () => { const services = listServices(); return services.map((s) => ({ serviceId: s.id, requirements: serviceDocumentRequirements(s.id) })).filter((s) => s.requirements.length); };

/* ---- document review (extends the existing `documents` table, §10) ---------------------------------------------- */
const nDocReview = (r) => ({ id: r.id, bookingId: r.booking_id, type: r.type, status: r.status, reviewStatus: r.review_status, reviewerId: r.reviewer_id ?? null, reviewedAt: r.reviewed_at ?? null, rejectionReason: r.rejection_reason ?? null, title: r.title, createdAt: r.created_at });
export function reviewDocument(id, { status, reason = null }, actor) {
  if (!['approved', 'rejected'].includes(status)) throw new HttpError(422, 'invalid');
  const r = q.get('SELECT * FROM documents WHERE id = ?', id); if (!r) throw new HttpError(404, 'notFound');
  q.run('UPDATE documents SET review_status = ?, reviewer_id = ?, reviewed_at = ?, rejection_reason = ? WHERE id = ?', status, actor.id, now(), status === 'rejected' ? str(reason, 300) : null, id);
  audit(actor, 'document.review', 'document', id, { status, reason });
  return nDocReview(q.get('SELECT * FROM documents WHERE id = ?', id));
}

/* ---- suppliers / providers (§11/§12) -------------------------------------------------------------------------- */
const nSupplier = (r) => ({ id: r.id, name: r.name, type: r.type, services: J(r.services_json, []), status: r.status, integrationStatus: r.integration_status, supportedOperations: J(r.supported_operations_json, []), contact: J(r.contact_json, {}), createdAt: r.created_at, updatedAt: r.updated_at });
export const listSuppliers = () => q.all('SELECT * FROM suppliers ORDER BY name').map(nSupplier);
export function createSupplier({ name, type, services = [], status = 'active', integrationStatus = 'not_connected', supportedOperations = [], contact = {} }, actor) {
  const id = `sup_${hex(8)}`; const t = now();
  q.run('INSERT INTO suppliers (id, name, type, services_json, status, integration_status, supported_operations_json, contact_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    id, str(name, 120), str(type, 40), JSON.stringify(services), str(status, 20) || 'active', str(integrationStatus, 20) || 'not_connected', JSON.stringify(supportedOperations), JSON.stringify(contact), t, t);
  audit(actor, 'supplier.create', 'supplier', id, { name, type });
  return nSupplier(q.get('SELECT * FROM suppliers WHERE id = ?', id));
}
const BOOKING_SUPPLIER_STATUSES = ['not_required', 'pending', 'submitted', 'processing', 'confirmed', 'rejected', 'failed', 'cancelled'];
const nBookingSupplier = (r) => ({ id: r.id, bookingId: r.booking_id, supplierId: r.supplier_id, supplierReference: r.supplier_reference, ticketNumber: r.ticket_number, status: r.status, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at });
export function assignSupplierToBooking(bookingId, supplierId, actor) {
  if (!q.get('SELECT id FROM bookings WHERE id = ?', bookingId)) throw new HttpError(404, 'notFound');
  if (!q.get('SELECT id FROM suppliers WHERE id = ?', supplierId)) throw new HttpError(422, 'invalid');
  const id = `bksup_${hex(8)}`; const t = now();
  q.run('INSERT INTO booking_suppliers (id, booking_id, supplier_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?)', id, bookingId, supplierId, 'pending', t, t);
  audit(actor, 'supplier.assign', 'booking', bookingId, { supplierId });
  return nBookingSupplier(q.get('SELECT * FROM booking_suppliers WHERE id = ?', id));
}
export function updateBookingSupplier(id, { status, supplierReference, ticketNumber, notes }, actor) {
  const r = q.get('SELECT * FROM booking_suppliers WHERE id = ?', id); if (!r) throw new HttpError(404, 'notFound');
  if (status && !BOOKING_SUPPLIER_STATUSES.includes(status)) throw new HttpError(422, 'invalid');
  q.run('UPDATE booking_suppliers SET status = ?, supplier_reference = ?, ticket_number = ?, notes = ?, updated_at = ? WHERE id = ?',
    status ?? r.status, supplierReference !== undefined ? str(supplierReference, 80) : r.supplier_reference, ticketNumber !== undefined ? str(ticketNumber, 40) : r.ticket_number, notes !== undefined ? str(notes, 1000) : r.notes, now(), id);
  audit(actor, 'supplier.update', 'booking', r.booking_id, { bookingSupplierId: id, status });
  return nBookingSupplier(q.get('SELECT * FROM booking_suppliers WHERE id = ?', id));
}

/* ---- booking notes (§13) ------------------------------------------------------------------------------------- */
const nNote = (r) => ({ id: r.id, bookingId: r.booking_id, type: r.type, body: r.body, authorId: r.author_id, authorRole: r.author_role, createdAt: r.created_at });
export function addBookingNote(bookingId, type, body, actor) {
  if (!['customer', 'internal'].includes(type)) throw new HttpError(422, 'invalid');
  if (!q.get('SELECT id FROM bookings WHERE id = ?', bookingId)) throw new HttpError(404, 'notFound');
  const clean = str(body, 4000); if (!clean) throw new HttpError(422, 'invalid');
  const id = `note_${hex(8)}`; const t = now();
  q.run('INSERT INTO booking_notes (id, booking_id, type, body, author_id, author_role, created_at) VALUES (?,?,?,?,?,?,?)', id, bookingId, type, clean, actor.id, actor.role, t);
  audit(actor, `note.${type}.add`, 'booking', bookingId, { noteId: id });
  return nNote(q.get('SELECT * FROM booking_notes WHERE id = ?', id));
}
export const bookingNotes = (bookingId, type) => q.all('SELECT * FROM booking_notes WHERE booking_id = ? AND type = ? ORDER BY created_at DESC', bookingId, type).map(nNote);

/* ---- notification templates (§15) — sanitised, never raw HTML/script execution --------------------------------- */
const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Strips tags entirely: a template body is plain text with {{variable}} placeholders, rendered later by the channel (e-mail HTML wrapper, SMS text) — never customer-supplied markup. */
const sanitizeTemplateBody = (s) => escapeHtml(String(s ?? '').replace(/<[^>]*>/g, '').slice(0, 4000));
const nTemplate = (r) => ({ id: r.id, event: r.event, channel: r.channel, subjectAr: r.subject_ar, subjectEn: r.subject_en, bodyAr: r.body_ar, bodyEn: r.body_en, variables: J(r.variables_json, []), active: !!r.active, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at });
export const listTemplates = () => q.all('SELECT * FROM notification_templates ORDER BY event, channel').map(nTemplate);
export const templateFor = (event, channel) => { const r = q.get('SELECT * FROM notification_templates WHERE event = ? AND channel = ? AND active = 1', event, channel); return r ? nTemplate(r) : null; };
export function upsertTemplate({ event, channel, subjectAr = null, subjectEn = null, bodyAr, bodyEn, variables = [], active = true }, actor) {
  const existing = q.get('SELECT * FROM notification_templates WHERE event = ? AND channel = ?', event, channel);
  const t = now(); const cleanAr = sanitizeTemplateBody(bodyAr); const cleanEn = sanitizeTemplateBody(bodyEn);
  if (existing) {
    q.run('UPDATE notification_templates SET subject_ar = ?, subject_en = ?, body_ar = ?, body_en = ?, variables_json = ?, active = ?, version = version + 1, updated_at = ? WHERE id = ?',
      subjectAr, subjectEn, cleanAr, cleanEn, JSON.stringify(variables), active ? 1 : 0, t, existing.id);
    audit(actor, 'notification.template.update', 'notification_template', existing.id, { event, channel });
    return nTemplate(q.get('SELECT * FROM notification_templates WHERE id = ?', existing.id));
  }
  const id = `tmpl_${hex(8)}`;
  q.run('INSERT INTO notification_templates (id, event, channel, subject_ar, subject_en, body_ar, body_en, variables_json, active, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)',
    id, str(event, 60), str(channel, 20), subjectAr, subjectEn, cleanAr, cleanEn, JSON.stringify(variables), active ? 1 : 0, t, t);
  audit(actor, 'notification.template.create', 'notification_template', id, { event, channel });
  return nTemplate(q.get('SELECT * FROM notification_templates WHERE id = ?', id));
}

/* ---- notification history — reads the EXISTING outbox table (Stage 12.2), never a duplicate (§16) --------------- */
export function notificationHistory({ customerId = '', bookingId = '', page = 1, pageSize = 20 } = {}) {
  let rows = q.all('SELECT * FROM outbox ORDER BY created_at DESC');
  if (customerId) rows = rows.filter((r) => r.customer_id === customerId);
  if (bookingId) rows = rows.filter((r) => { const p = J(r.payload_json, {}); return p.bookingId === bookingId; });
  const size = Math.min(100, Math.max(1, pageSize)); const p = Math.max(1, page); const slice = rows.slice((p - 1) * size, p * size);
  return { items: slice.map((r) => ({ id: r.id, channel: r.channel, event: r.template, at: r.created_at, status: r.status, reference: r.id })), page: p, pageSize: size, total: rows.length, nextPage: p * size < rows.length ? p + 1 : null };
}
