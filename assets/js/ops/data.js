/* ============================================================================
   OPS / DATA — Stage 15. The facade the operations screens call. Every
   method takes the current staff session token from auth.js and hands it to
   the registered adapter; the adapter (backed by the staff's session cookie)
   answers only what the backend's permission check allows — a screen calling
   a method its staff member lacks permission for gets a 'forbidden' ApiError
   from the backend, not a client-side guess.

   Shapes:
     staff        { id, email, name, role: 'admin'|'ops', permissions[], active, createdAt, updatedAt }
     bookingRow   { id, customerId, service, status, paymentStatus, amount, currency, supervisorId,
                    opsStatus, assignedOperator, createdAt, missingDocuments }
     bookingDetail bookingRow + { allowedTransitions[], history[], documents[], supplier, notesCustomer[],
                    notesInternal[], tasks[] }
     task         { id, type, bookingId, customerId, supervisorId, assignedTo, status, priority, dueAt,
                    notes, createdBy, createdAt, updatedAt, completedAt }
     escalation   { id, bookingId, taskId, reason, severity, assignedTeam, assignedOperator, status,
                    createdBy, createdAt, updatedAt, resolvedAt }
     service      { id, active, bookingEnabled, workflowType, supplierType, operationalRequirements, createdAt, updatedAt }
     workflowStep { order, key, labelAr, labelEn }
     documentRequirement { id, docType, required, customerUpload }
     supplier     { id, name, type, services[], status, integrationStatus, supportedOperations[], contact, createdAt, updatedAt }
     bookingSupplier { id, bookingId, supplierId, supplierReference, ticketNumber, status, notes, createdAt, updatedAt }
     note         { id, bookingId, type: 'customer'|'internal', body, authorId, authorRole, createdAt }
     template     { id, event, channel, subjectAr, subjectEn, bodyAr, bodyEn, variables[], active, version, createdAt, updatedAt }
     auditEvent   { id, actorId, actorRole, action, entityType, entityId, metadata, at }
     A paged list answers { items, page, pageSize, total, nextPage }.
   ========================================================================= */
import { currentOpsToken, opsSessionLost, OpsAuthError } from './auth.js';
import { track } from '../core/diagnostics.js';

let adapter = null;
export function registerOpsDataAdapter(a) { adapter = a; return a; }
export const opsDataAdapter = () => adapter;

const call = async (method, ...args) => {
  const token = currentOpsToken();
  if (!token) throw new OpsAuthError('unauthenticated');
  if (!adapter) throw new Error('no ops data adapter registered');
  try { return await adapter[method](token, ...args); }
  catch (error) {
    if (error?.code === 'unauthenticated') { opsSessionLost('rejected'); throw new OpsAuthError('unauthenticated'); }
    if (!(error instanceof OpsAuthError)) track(`ops.${method}.failure`, { code: error?.code ?? 'error' });
    throw error;
  }
};

export const TASK_STATUSES = ['open', 'in_progress', 'waiting', 'completed', 'cancelled'];
export const ESCALATION_STATUSES = ['open', 'investigating', 'waiting', 'resolved', 'closed'];
export const BOOKING_SUPPLIER_STATUSES = ['not_required', 'pending', 'submitted', 'processing', 'confirmed', 'rejected', 'failed', 'cancelled'];

export const opsData = {
  bookings: (params = { page: 1 }) => call('bookings', params),              // { status, service, assignedTo, page, pageSize }
  booking: (id) => call('booking', id),
  transitionBooking: (id, status, reason) => call('transitionBooking', id, status, reason),
  assignBooking: (id, staffId) => call('assignBooking', id, staffId),
  addBookingNote: (id, type, body) => call('addBookingNote', id, type, body),
  assignSupplierToBooking: (id, supplierId) => call('assignSupplierToBooking', id, supplierId),
  updateBookingSupplier: (id, patch) => call('updateBookingSupplier', id, patch),

  tasks: (params = { page: 1 }) => call('tasks', params),                    // { status, assignedTo, bookingId, page, pageSize }
  createTask: (task) => call('createTask', task),
  assignTask: (id, staffId) => call('assignTask', id, staffId),
  updateTaskStatus: (id, status) => call('updateTaskStatus', id, status),

  escalations: (params = { page: 1 }) => call('escalations', params),
  createEscalation: (escalation) => call('createEscalation', escalation),
  updateEscalationStatus: (id, status) => call('updateEscalationStatus', id, status),

  reviewDocument: (id, status, reason) => call('reviewDocument', id, status, reason),

  services: () => call('services'),
  service: (id) => call('service', id),
  updateService: (id, patch) => call('updateService', id, patch),
  serviceWorkflow: (id) => call('serviceWorkflow', id),
  setServiceWorkflow: (id, steps) => call('setServiceWorkflow', id, steps),
  serviceDocumentRequirements: (id) => call('serviceDocumentRequirements', id),
  addServiceDocumentRequirement: (id, req) => call('addServiceDocumentRequirement', id, req),        // { docType, required, customerUpload }
  updateServiceDocumentRequirement: (id, reqId, patch) => call('updateServiceDocumentRequirement', id, reqId, patch),
  removeServiceDocumentRequirement: (id, reqId) => call('removeServiceDocumentRequirement', id, reqId),

  suppliers: () => call('suppliers'),
  createSupplier: (supplier) => call('createSupplier', supplier),

  templates: () => call('templates'),
  upsertTemplate: (template) => call('upsertTemplate', template),
  notificationHistory: (params = { page: 1 }) => call('notificationHistory', params),

  audit: (params = { page: 1 }) => call('audit', params),

  // ---- Stage 14: the Admin Dashboard — the management/oversight layer ABOVE everything above. Every method here
  // is gated by its own backend permission (customer.view, supervisor.view/manage, payment.view, document.view,
  // attribution.view, report.view, staff.manage) exactly like the Stage 15 methods above §29/§30. ----
  overview: () => call('overview'),
  search: (query) => call('search', query),

  customers: (params = { page: 1 }) => call('customers', params),
  customer: (id) => call('customer', id),
  reassignCustomer: (id, supervisorId) => call('reassignCustomer', id, supervisorId),

  supervisorsAdmin: (params = { page: 1 }) => call('supervisorsAdmin', params),
  supervisorAdmin: (id) => call('supervisorAdmin', id),
  createSupervisorAdmin: (supervisor) => call('createSupervisorAdmin', supervisor),
  updateSupervisorAdmin: (id, patch) => call('updateSupervisorAdmin', id, patch),

  // Command Center CMS Phase 2A — Destinations & Offers admin CRUD (backend/content.mjs). Every method gated by
  // its own backend permission (content.manage for create/update; list/one are ungated, like services).
  destinationsAdmin: (params = { page: 1 }) => call('destinationsAdmin', params),
  destinationAdmin: (id) => call('destinationAdmin', id),
  createDestinationAdmin: (destination) => call('createDestinationAdmin', destination),
  updateDestinationAdmin: (id, patch) => call('updateDestinationAdmin', id, patch),

  offersAdmin: (params = { page: 1 }) => call('offersAdmin', params),
  offerAdmin: (id) => call('offerAdmin', id),
  createOfferAdmin: (offer) => call('createOfferAdmin', offer),
  updateOfferAdmin: (id, patch) => call('updateOfferAdmin', id, patch),

  leads: (params = { page: 1 }) => call('leads', params),
  attributionEvents: (params = { page: 1 }) => call('attributionEvents', params),

  payments: (params = { page: 1 }) => call('payments', params),
  documentsAdmin: (params = { page: 1 }) => call('documentsAdmin', params),

  reportBookings: () => call('reportBookings'),
  reportOperations: () => call('reportOperations'),
  reportSuppliers: () => call('reportSuppliers'),
  reportDocuments: () => call('reportDocuments'),
  reportNotifications: () => call('reportNotifications'),

  staffList: () => call('staffList'),
  createStaff: (staff) => call('createStaff', staff),
  setStaffActive: (id, active) => call('setStaffActive', id, active),
  setStaffPermissions: (id, permissions) => call('setStaffPermissions', id, permissions),

  // ---- Stage 15A: the Business Rules Register — every unresolved (or technical-default) business decision,
  // versioned and audited. rules.view/rules.manage are separate permissions (§18, §22). ----
  rules: (params = {}) => call('rules', params),
  rule: (id) => call('rule', id),
  ruleHistory: (id) => call('ruleHistory', id),
  updateRule: (id, patch) => call('updateRule', id, patch),
  pendingDecisions: () => call('pendingDecisions'),
  ruleMatrix: () => call('ruleMatrix'),
};

export const RULE_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'ACTIVE', 'DISABLED', 'SUPERSEDED'];
