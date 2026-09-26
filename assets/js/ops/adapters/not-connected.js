/* ============================================================================
   OPS / ADAPTERS / NOT CONNECTED — what a production build registers when no
   backend is configured. Every call fails with 'notConfigured'. A production
   build never falls back to development data for the operations portal
   either.
   ========================================================================= */
import { registerOpsAuthProvider, OpsAuthError } from '../auth.js';
import { registerOpsDataAdapter } from '../data.js';
import { notConnectedAuth } from '../../core/portal-session.js';
import { notConnectedData } from '../../core/adapter-helpers.js';

const DATA_METHODS = ['bookings', 'booking', 'transitionBooking', 'assignBooking', 'addBookingNote', 'assignSupplierToBooking', 'updateBookingSupplier', 'tasks', 'createTask', 'assignTask', 'updateTaskStatus', 'escalations', 'createEscalation', 'updateEscalationStatus', 'reviewDocument', 'services', 'service', 'updateService', 'serviceWorkflow', 'setServiceWorkflow', 'serviceDocumentRequirements', 'addServiceDocumentRequirement', 'updateServiceDocumentRequirement', 'removeServiceDocumentRequirement', 'suppliers', 'createSupplier', 'templates', 'upsertTemplate', 'notificationHistory', 'audit',
  'overview', 'search', 'customers', 'customer', 'reassignCustomer', 'supervisorsAdmin', 'supervisorAdmin', 'createSupervisorAdmin', 'updateSupervisorAdmin', 'leads', 'attributionEvents', 'payments', 'documentsAdmin', 'reportBookings', 'reportOperations', 'reportSuppliers', 'reportDocuments', 'reportNotifications', 'staffList', 'createStaff', 'setStaffActive', 'setStaffPermissions',
  'rules', 'rule', 'ruleHistory', 'updateRule', 'pendingDecisions', 'ruleMatrix'];

export const NOT_CONNECTED_OPS_AUTH = registerOpsAuthProvider(notConnectedAuth(OpsAuthError));
export const NOT_CONNECTED_OPS_DATA = registerOpsDataAdapter(notConnectedData(DATA_METHODS));
