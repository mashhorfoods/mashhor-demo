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
  capabilities: ['bookings.operations', 'tasks', 'escalations', 'documents.review', 'services', 'workflow', 'suppliers', 'notifications.templates', 'notifications.history', 'audit'],
  async meta() { return get('/operations/meta'); },
  async bookings(_t, params = {}) { return get(`/bookings${q(params)}`); },
  async booking(_t, id) { const d = await get(`/bookings/${encodeURIComponent(id)}`); return d.booking; },
  async transitionBooking(_t, id, status, reason) { const d = await post(`/bookings/${encodeURIComponent(id)}/status`, { status, reason }); return d.booking; },
  async assignBooking(_t, id, staffId) { return post(`/bookings/${encodeURIComponent(id)}/assign`, { staffId }); },
  async bookingNotes(_t, id, type) { const d = await get(`/bookings/${encodeURIComponent(id)}/notes${q({ type })}`); return list(d, 'notes'); },
  async addBookingNote(_t, id, type, body) { const d = await post(`/bookings/${encodeURIComponent(id)}/notes`, { type, body }); return d.note; },
  async assignSupplierToBooking(_t, id, supplierId) { const d = await post(`/bookings/${encodeURIComponent(id)}/supplier`, { supplierId }); return d.bookingSupplier; },
  async updateBookingSupplier(_t, id, patchBody) { const d = await post(`/operations/booking-suppliers/${encodeURIComponent(id)}`, patchBody); return d.bookingSupplier; },

  async tasks(_t, params = {}) { return get(`/operations/tasks${q(params)}`); },
  async task(_t, id) { const d = await get(`/operations/tasks/${encodeURIComponent(id)}`); return d.task; },
  async createTask(_t, task) { const d = await post('/operations/tasks', task); return d.task; },
  async assignTask(_t, id, staffId) { const d = await post(`/operations/tasks/${encodeURIComponent(id)}/assign`, { assignedTo: staffId }); return d.task; },
  async updateTaskStatus(_t, id, status) { const d = await post(`/operations/tasks/${encodeURIComponent(id)}/status`, { status }); return d.task; },

  async escalations(_t, params = {}) { return get(`/operations/escalations${q(params)}`); },
  async createEscalation(_t, escalation) { const d = await post('/operations/escalations', escalation); return d.escalation; },
  async updateEscalationStatus(_t, id, status) { const d = await post(`/operations/escalations/${encodeURIComponent(id)}/status`, { status }); return d.escalation; },

  async reviewDocument(_t, id, status, reason) { const d = await post(`/documents/${encodeURIComponent(id)}/review`, { status, reason }); return d.document; },
  async documentRequirements() { const d = await get('/documents/requirements'); return d.requirements; },

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
});
