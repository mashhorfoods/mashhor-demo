/* ============================================================================
   OPS / ADAPTERS / NOT CONNECTED — what a production build registers when no
   backend is configured. Every call fails with 'notConfigured'. A production
   build never falls back to development data for the operations portal
   either.
   ========================================================================= */
import { registerOpsAuthProvider, OpsAuthError } from '../auth.js';
import { registerOpsDataAdapter } from '../data.js';
import { ApiError } from '../../core/api.js';

const authFail = async () => { throw new OpsAuthError('notConfigured'); };
const dataFail = async () => { throw new ApiError('notConfigured'); };
const AUTH_METHODS = ['signIn', 'verify', 'refresh', 'requestReset', 'resetPassword', 'changePassword'];
const DATA_METHODS = ['meta', 'bookings', 'booking', 'transitionBooking', 'assignBooking', 'bookingNotes', 'addBookingNote', 'assignSupplierToBooking', 'updateBookingSupplier', 'tasks', 'task', 'createTask', 'assignTask', 'updateTaskStatus', 'escalations', 'createEscalation', 'updateEscalationStatus', 'reviewDocument', 'documentRequirements', 'services', 'service', 'updateService', 'serviceWorkflow', 'setServiceWorkflow', 'serviceDocumentRequirements', 'addServiceDocumentRequirement', 'suppliers', 'createSupplier', 'templates', 'upsertTemplate', 'notificationHistory', 'audit',
  'overview', 'search', 'customers', 'customer', 'reassignCustomer', 'supervisorsAdmin', 'supervisorAdmin', 'createSupervisorAdmin', 'updateSupervisorAdmin', 'leads', 'attributionEvents', 'payments', 'documentsAdmin', 'reportBookings', 'reportOperations', 'reportSuppliers', 'reportDocuments', 'reportNotifications', 'staffList', 'createStaff', 'setStaffActive', 'setStaffPermissions',
  'rules', 'rule', 'ruleHistory', 'updateRule', 'activateRule', 'disableRule', 'pendingDecisions', 'ruleMatrix'];

export const NOT_CONNECTED_OPS_AUTH = registerOpsAuthProvider({ id: 'not-connected', dev: false, provider: 'none', configSource: 'AUTH_PROVIDER / API_BASE_URL', signOut: async () => {}, ...Object.fromEntries(AUTH_METHODS.map((m) => [m, authFail])) });
export const NOT_CONNECTED_OPS_DATA = registerOpsDataAdapter({ id: 'not-connected', dev: false, provider: 'none', configSource: 'API_BASE_URL', capabilities: [], ...Object.fromEntries(DATA_METHODS.map((m) => [m, dataFail])) });
