-- Stage 15 — the operations control layer. Extends the Stage 12.2/13 backend with a staff role (Admin + Operations
-- Staff share one portal, distinguished by role/permissions — not a duplicate account system), a backend-authoritative
-- booking lifecycle SEPARATE from the customer-facing `bookings.status` (STATUSES in assets/js/data/config.js is
-- untouched — the booking engine is not replaced), tasks, escalations, a service operational catalogue, supplier
-- operations, internal/customer notes, notification templates, and a real actor-based audit trail (backend/fixtures.mjs
-- 'diagnostics' is scrubbed telemetry, not this). No business rule is decided here; business_config rows are added
-- PENDING where the brief explicitly forbids inventing one.

-- ---- staff (Admin + Operations Staff): a THIRD credential/session store, separate from customers and supervisors ----
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'ops',
  permissions_json TEXT NOT NULL DEFAULT '[]', password_salt TEXT, password_hash TEXT,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS staff_sessions (id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE, csrf TEXT NOT NULL, created_at TEXT NOT NULL, expires_at INTEGER NOT NULL, last_seen_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS staff_sessions_staff ON staff_sessions(staff_id);
CREATE TABLE IF NOT EXISTS staff_reset_tokens (token TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL);

-- ---- booking operational lifecycle: a SEPARATE field from bookings.status (customer-facing, untouched) ----
ALTER TABLE bookings ADD COLUMN ops_status TEXT;
ALTER TABLE bookings ADD COLUMN assigned_operator TEXT REFERENCES staff(id);
CREATE TABLE IF NOT EXISTS booking_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, booking_id TEXT NOT NULL, previous_status TEXT, new_status TEXT NOT NULL,
  actor TEXT NOT NULL, actor_role TEXT NOT NULL, reason TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS booking_status_history_booking ON booking_status_history(booking_id, at);

-- ---- operations tasks ----
CREATE TABLE IF NOT EXISTS operation_tasks (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, booking_id TEXT, customer_id TEXT, supervisor_id TEXT,
  assigned_to TEXT REFERENCES staff(id), status TEXT NOT NULL DEFAULT 'open', priority TEXT NOT NULL DEFAULT 'normal',
  due_at TEXT, notes TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
);
CREATE INDEX IF NOT EXISTS operation_tasks_assigned ON operation_tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS operation_tasks_booking ON operation_tasks(booking_id);

-- ---- escalations ----
CREATE TABLE IF NOT EXISTS escalations (
  id TEXT PRIMARY KEY, booking_id TEXT, task_id TEXT, reason TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'normal',
  assigned_team TEXT, assigned_operator TEXT REFERENCES staff(id), status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS escalations_status ON escalations(status, created_at);

-- ---- service operational catalogue (extends assets/js/data/services.js's ids; that registry stays the UI source for
-- name/description text — this table adds the OPERATIONAL config an admin will manage without a code deploy) ----
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 1, booking_enabled INTEGER NOT NULL DEFAULT 1,
  workflow_type TEXT, supplier_type TEXT, operational_requirements TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS service_workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT, service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL, step_key TEXT NOT NULL, label_ar TEXT NOT NULL, label_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS service_workflows_service ON service_workflows(service_id, step_order);
CREATE TABLE IF NOT EXISTS service_document_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL, required INTEGER NOT NULL DEFAULT 1, customer_upload INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS service_document_requirements_service ON service_document_requirements(service_id);

-- ---- documents review: EXTENDS the existing `documents` table (Stage 12.2) rather than a new entity ----
ALTER TABLE documents ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE documents ADD COLUMN reviewer_id TEXT REFERENCES staff(id);
ALTER TABLE documents ADD COLUMN reviewed_at TEXT;
ALTER TABLE documents ADD COLUMN rejection_reason TEXT;

-- ---- suppliers / providers ----
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, services_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active', integration_status TEXT NOT NULL DEFAULT 'not_connected',
  supported_operations_json TEXT NOT NULL DEFAULT '[]', contact_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS booking_suppliers (
  id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  supplier_reference TEXT, ticket_number TEXT, status TEXT NOT NULL DEFAULT 'not_required', notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS booking_suppliers_booking ON booking_suppliers(booking_id);

-- ---- booking notes: customer-facing vs internal, strictly separate ----
CREATE TABLE IF NOT EXISTS booking_notes (
  id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('customer','internal')),
  body TEXT NOT NULL, author_id TEXT NOT NULL, author_role TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS booking_notes_booking ON booking_notes(booking_id, created_at);

-- ---- notification templates (delivery/history reuse the existing `outbox` table — Stage 12.2, not duplicated) ----
CREATE TABLE IF NOT EXISTS notification_templates (
  id TEXT PRIMARY KEY, event TEXT NOT NULL, channel TEXT NOT NULL, subject_ar TEXT, subject_en TEXT,
  body_ar TEXT NOT NULL DEFAULT '', body_en TEXT NOT NULL DEFAULT '', variables_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_event_channel ON notification_templates(event, channel);

-- ---- audit trail: a real actor-based log (separate from the scrubbed technical `diagnostics` table) ----
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL, actor_role TEXT NOT NULL, action TEXT NOT NULL,
  entity_type TEXT NOT NULL, entity_id TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_events_entity ON audit_events(entity_type, entity_id, at);
CREATE INDEX IF NOT EXISTS audit_events_at ON audit_events(at);

-- ---- business rules explicitly NOT decided (§38/§39): configurable, marked pending, never invented ----
INSERT OR IGNORE INTO business_config (key, value_json, updated_at) VALUES
  ('task_priority_levels', '{"levels":["low","normal","high","urgent"],"status":"default_pending_confirmation","note":"a working vocabulary so the UI has something to offer; the business has not confirmed these are final or ordered this way"}', datetime('now')),
  ('refund_policy', '{"policy":null,"status":"pending_business_configuration","note":"no refund policy has been supplied; payment_status=refunded is only ever set by the payment provider, never inferred here"}', datetime('now')),
  ('cancellation_policy', '{"policy":null,"status":"pending_business_configuration","note":"no cancellation policy (fees, notice periods) has been supplied"}', datetime('now')),
  ('sla_config', '{"targets":null,"status":"pending_business_configuration","note":"no SLA durations have been supplied; escalations and overdue tasks have no time-based rule until one is"}', datetime('now')),
  ('booking_lifecycle', '{"initial":"submitted","transitions":{"submitted":["pending_review","cancelled"],"pending_review":["awaiting_payment","cancelled","failed"],"awaiting_payment":["payment_received","cancelled","failed"],"payment_received":["processing","refunded"],"processing":["supplier_pending","confirmed","failed"],"supplier_pending":["confirmed","failed","cancelled"],"confirmed":["ticketed","service_in_progress","cancelled","refunded"],"ticketed":["service_in_progress","completed","cancelled","refunded"],"service_in_progress":["completed","cancelled"],"completed":[],"cancelled":[],"failed":["pending_review","cancelled"],"refunded":[]},"status":"technical_example_pending_business_confirmation","note":"the example lifecycle from the Stage 15 brief itself; the business has not confirmed these are the final states or transitions"}', datetime('now'));
