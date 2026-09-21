/* ============================================================================
   OPS / ADAPTERS / API DATA — the production data adapter for the operations
   portal. Every method is one request to the Stage 15 backend contract
   (/bookings, /operations/*, /services/*, /documents/*, /notifications/*);
   the backend checks the session's permission on every call — this adapter
   never decides what a staff member may do, only shapes the request/response.

   Status: IMPLEMENTED against the contract, NOT CONNECTED until a backend
   exists at API_BASE_URL (see adapters/installed.js).
   ========================================================================= */
import { registerOpsDataAdapter } from '../data.js';
import { get, post, patch } from '../../core/api.js';

const list = (data, key) => (Array.isArray(data) ? data : data?.[key] ?? data?.items ?? []);
const q = (params = {}) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v != null && v !== '') p.set(k, String(v)); const s = p.toString(); return s ? `?${s}` : ''; };

export const API_OPS_DATA = registerOpsDataAdapter({
  id: 'api-ops-data', dev: false, provider: 'customer backend API', configSource: 'API_BASE_URL',
  capabilities: ['bookings.operations', 'tasks', 'escalations', 'documents.review', 'services', 'workflow', 'suppliers', 'notifications.templates', 'notifications.history', 'audit', 'admin.dashboard', 'content'],
  async bookings(_t, params = {}) { return get(`/bookings${q(params)}`); },
  async booking(_t, id) { const d = await get(`/bookings/${encodeURIComponent(id)}`); return d.booking; },
  async transitionBooking(_t, id, status, reason) { const d = await post(`/bookings/${encodeURIComponent(id)}/status`, { status, reason }); return d.booking; },
  async assignBooking(_t, id, staffId) { return post(`/bookings/${encodeURIComponent(id)}/assign`, { staffId }); },
  async addBookingNote(_t, id, type, body) { const d = await post(`/bookings/${encodeURIComponent(id)}/notes`, { type, body }); return d.note; },
  async assignSupplierToBooking(_t, id, supplierId) { const d = await post(`/bookings/${encodeURIComponent(id)}/supplier`, { supplierId }); return d.bookingSupplier; },
  async updateBookingSupplier(_t, id, patchBody) { const d = await post(`/operations/booking-suppliers/${encodeURIComponent(id)}`, patchBody); return d.bookingSupplier; },

  async tasks(_t, params = {}) { return get(`/operations/tasks${q(params)}`); },
  async createTask(_t, task) { const d = await post('/operations/tasks', task); return d.task; },
  async assignTask(_t, id, staffId) { const d = await post(`/operations/tasks/${encodeURIComponent(id)}/assign`, { assignedTo: staffId }); return d.task; },
  async updateTaskStatus(_t, id, status) { const d = await post(`/operations/tasks/${encodeURIComponent(id)}/status`, { status }); return d.task; },

  async escalations(_t, params = {}) { return get(`/operations/escalations${q(params)}`); },
  async createEscalation(_t, escalation) { const d = await post('/operations/escalations', escalation); return d.escalation; },
  async updateEscalationStatus(_t, id, status) { const d = await post(`/operations/escalations/${encodeURIComponent(id)}/status`, { status }); return d.escalation; },

  async reviewDocument(_t, id, status, reason) { const d = await post(`/documents/${encodeURIComponent(id)}/review`, { status, reason }); return d.document; },

  async services() { const d = await get('/services'); return list(d, 'services'); },
  async service(_t, id) { const d = await get(`/services/${encodeURIComponent(id)}`); return d.service; },
  async updateService(_t, id, patchBody) { const d = await patch(`/services/${encodeURIComponent(id)}`, patchBody); return d.service; },
  async serviceWorkflow(_t, id) { const d = await get(`/services/${encodeURIComponent(id)}/workflow`); return d.steps; },
  async setServiceWorkflow(_t, id, steps) { const d = await post(`/services/${encodeURIComponent(id)}/workflow`, { steps }); return d.steps; },
  async serviceDocumentRequirements(_t, id) { const d = await get(`/services/${encodeURIComponent(id)}/document-requirements`); return d.requirements; },
  async addServiceDocumentRequirement(_t, id, req) { const d = await post(`/services/${encodeURIComponent(id)}/document-requirements`, req); return d.requirements; },

  async suppliers() { const d = await get('/operations/suppliers'); return list(d, 'suppliers'); },
  async createSupplier(_t, supplier) { const d = await post('/operations/suppliers', supplier); return d.supplier; },

  async templates() { const d = await get('/notifications/templates'); return list(d, 'templates'); },
  async upsertTemplate(_t, template) { const d = await post('/notifications/templates', template); return d.template; },
  async notificationHistory(_t, params = {}) { return get(`/notifications/history${q(params)}`); },

  async audit(_t, params = {}) { return get(`/operations/audit${q(params)}`); },

  // ---- Stage 14: the Admin Dashboard, /admin/* ----
  async overview() { return get('/admin/overview'); },
  async search(_t, query) { return get(`/admin/search${q({ q: query })}`); },

  async customers(_t, params = {}) { return get(`/admin/customers${q(params)}`); },
  async customer(_t, id) { const d = await get(`/admin/customers/${encodeURIComponent(id)}`); return d.customer; },
  async reassignCustomer(_t, id, supervisorId) { return post(`/admin/customers/${encodeURIComponent(id)}/reassign`, { supervisorId }); },

  async supervisorsAdmin(_t, params = {}) { return get(`/admin/supervisors${q(params)}`); },
  async supervisorAdmin(_t, id) { const d = await get(`/admin/supervisors/${encodeURIComponent(id)}`); return d.supervisor; },
  async createSupervisorAdmin(_t, supervisor) { const d = await post('/admin/supervisors', supervisor); return d.supervisor; },
  async updateSupervisorAdmin(_t, id, patchBody) { const d = await patch(`/admin/supervisors/${encodeURIComponent(id)}`, patchBody); return d.supervisor; },

  async destinationsAdmin(_t, params = {}) { return get(`/admin/destinations${q(params)}`); },
  async destinationAdmin(_t, id) { const d = await get(`/admin/destinations/${encodeURIComponent(id)}`); return d.destination; },
  async createDestinationAdmin(_t, destination) { const d = await post('/admin/destinations', destination); return d.destination; },
  async updateDestinationAdmin(_t, id, patchBody) { const d = await patch(`/admin/destinations/${encodeURIComponent(id)}`, patchBody); return d.destination; },

  async offersAdmin(_t, params = {}) { return get(`/admin/offers${q(params)}`); },
  async offerAdmin(_t, id) { const d = await get(`/admin/offers/${encodeURIComponent(id)}`); return d.offer; },
  async createOfferAdmin(_t, offer) { const d = await post('/admin/offers', offer); return d.offer; },
  async updateOfferAdmin(_t, id, patchBody) { const d = await patch(`/admin/offers/${encodeURIComponent(id)}`, patchBody); return d.offer; },

  async leads(_t, params = {}) { return get(`/admin/leads${q(params)}`); },
  async attributionEvents(_t, params = {}) { return get(`/admin/attribution-events${q(params)}`); },

  async payments(_t, params = {}) { return get(`/admin/payments${q(params)}`); },
  async documentsAdmin(_t, params = {}) { return get(`/admin/documents${q(params)}`); },

  async reportBookings() { return get('/admin/reports/bookings'); },
  async reportOperations() { return get('/admin/reports/operations'); },
  async reportSuppliers() { return get('/admin/reports/suppliers'); },
  async reportDocuments() { return get('/admin/reports/documents'); },
  async reportNotifications() { return get('/admin/reports/notifications'); },

  async staffList() { const d = await get('/admin/staff'); return list(d, 'staff'); },
  async createStaff(_t, staff) { const d = await post('/admin/staff', staff); return d.staff; },
  async setStaffActive(_t, id, active) { const d = await post(`/admin/staff/${encodeURIComponent(id)}/active`, { active }); return d.staff; },
  async setStaffPermissions(_t, id, permissions) { const d = await post(`/admin/staff/${encodeURIComponent(id)}/permissions`, { permissions }); return d.staff; },

  async rules(_t, params = {}) { return get(`/admin/rules${q(params)}`); },
  async rule(_t, id) { const d = await get(`/admin/rules/${encodeURIComponent(id)}`); return d.rule; },
  async ruleHistory(_t, id) { const d = await get(`/admin/rules/${encodeURIComponent(id)}/history`); return d.items; },
  async updateRule(_t, id, patchBody) { const d = await patch(`/admin/rules/${encodeURIComponent(id)}`, patchBody); return d.rule; },
  async pendingDecisions() { return get('/admin/rules/pending'); },
  async ruleMatrix() { return get('/admin/rules/matrix'); },
});
