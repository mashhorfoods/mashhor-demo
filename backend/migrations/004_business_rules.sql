-- Stage 15A — formalizes the `business_config` table (Stage 13/15) into a versioned Business Rules Register with
-- the exact schema the brief specifies (rule_id/category/name/description/current_value/allowed_values/status/
-- source/effective_from/effective_to/updated_by/updated_at/notes). This is additive only: every existing row's
-- VALUE and PENDING status is preserved byte-for-byte (§21 — no destructive change to existing configuration);
-- only descriptive register columns are added and backfilled. `key` already serves as the register's rule_id.
ALTER TABLE business_config ADD COLUMN category TEXT NOT NULL DEFAULT 'general';
ALTER TABLE business_config ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE business_config ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE business_config ADD COLUMN allowed_values_json TEXT;
ALTER TABLE business_config ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE business_config ADD COLUMN source TEXT NOT NULL DEFAULT '';
ALTER TABLE business_config ADD COLUMN effective_from TEXT;
ALTER TABLE business_config ADD COLUMN effective_to TEXT;
ALTER TABLE business_config ADD COLUMN updated_by TEXT;
ALTER TABLE business_config ADD COLUMN notes TEXT;

-- A superseded version is archived here BEFORE the live row is overwritten, so no historical business decision is
-- ever lost (§17/§21) — the same "current row + history table" shape already used elsewhere in this schema
-- (e.g. booking_status_history next to bookings.ops_status).
CREATE TABLE IF NOT EXISTS business_config_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, rule_id TEXT NOT NULL, category TEXT NOT NULL, name TEXT NOT NULL,
  description TEXT NOT NULL, value_json TEXT NOT NULL, allowed_values_json TEXT, status TEXT NOT NULL, source TEXT NOT NULL,
  effective_from TEXT, effective_to TEXT NOT NULL, updated_by TEXT, notes TEXT, superseded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS business_config_history_rule ON business_config_history(rule_id, superseded_at);

-- Backfill register metadata onto the six rows Stage 10/13/15 already seeded (attribution_model, commission_model
-- from 002_supervisors.sql; task_priority_levels, refund_policy, cancellation_policy, sla_config, booking_lifecycle
-- from 003_operations.sql) — VALUE and pending nature untouched; DRAFT is used (not PENDING) for the rows that are
-- a working TECHNICAL default already in effect rather than an outright unanswered question with no value at all,
-- matching each row's own existing note.
UPDATE business_config SET category = 'commission', name = 'Supervisor commission model',
  description = 'How (and whether) a supervisor earns commission on a booking: type, calculation basis, trigger, cancellation/refund treatment.',
  status = 'PENDING', source = 'Stage 13 brief S18 — no percentage, fixed amount or rule supplied', effective_from = updated_at
  WHERE key = 'commission_model';
UPDATE business_config SET category = 'task_priority', name = 'Task priority levels',
  description = 'The priority vocabulary and ordering used by the operations task queue and its SLA/escalation relationship.',
  status = 'DRAFT', source = 'Stage 15 brief — a working technical default, not a confirmed business severity scale', effective_from = updated_at
  WHERE key = 'task_priority_levels';
UPDATE business_config SET category = 'refund', name = 'Refund policy',
  description = 'Refund eligibility, approval authority, method and audit requirements.',
  status = 'PENDING', source = 'Stage 15 brief S26/S39 — no refund policy supplied', effective_from = updated_at
  WHERE key = 'refund_policy';
UPDATE business_config SET category = 'cancellation', name = 'Cancellation policy',
  description = 'Cancellation eligibility, timing, fees and notice periods by service/booking state.',
  status = 'PENDING', source = 'Stage 15 brief S26/S39 — no cancellation policy supplied', effective_from = updated_at
  WHERE key = 'cancellation_policy';
UPDATE business_config SET category = 'sla', name = 'SLA targets',
  description = 'Target duration, warning and escalation thresholds by service/task type/priority.',
  status = 'PENDING', source = 'Stage 15 brief S26/S39 — no SLA durations supplied', effective_from = updated_at
  WHERE key = 'sla_config';
UPDATE business_config SET category = 'booking_lifecycle', name = 'Booking lifecycle graph',
  description = 'The full internal operations-status state graph: every status, its allowed transitions, and who may perform them.',
  status = 'DRAFT', source = 'Stage 15 brief''s own worked example — technical, not yet confirmed as final business policy', effective_from = updated_at
  WHERE key = 'booking_lifecycle';
-- attribution_model was already seeded in 002_supervisors.sql ("first-touch wins, never overwritten... the business
-- has not yet confirmed this as final policy") — backfilled here like the six rows above, its VALUE and pending
-- nature untouched; DRAFT because, like the lifecycle graph, a technical default is genuinely in effect already.
UPDATE business_config SET category = 'attribution', name = 'Supervisor attribution model',
  description = 'Which attribution rule is in effect: first-touch, last-touch, manual or hybrid; reassignment authority; history preservation.',
  status = 'DRAFT', source = 'Stage 10/13 implementation (backend/supervisor.mjs assignAttribution) — a technical default in effect since Stage 10, not yet confirmed as final business policy', effective_from = updated_at
  WHERE key = 'attribution_model';

-- New register rows for the areas Stage 15's own status report named PENDING but never got a business_config row:
-- payment gates (the MECHANISM is active/enforced; which exact statuses gate is the open policy question),
-- real staff provisioning, and the Admin Dashboard's own delivered scope (Stage 14).
INSERT OR IGNORE INTO business_config (key, value_json, category, name, description, status, source, effective_from, updated_at) VALUES
  ('payment_gates',
   '{"gatedStatuses":["payment_received","processing","confirmed","ticketed","service_in_progress","completed"],"requiresPaidBeforeGate":true,"onFailure":"remains at the pre-gate status; staff must retry or cancel","onCancellation":"booking moved to cancelled, gate never crossed","onTimeout":"not implemented - no automatic timeout exists yet","status":"technical_example_pending_business_confirmation","note":"the gate MECHANISM (PAYMENT_GATED in staff.mjs) is active and enforced server-side; WHICH exact statuses require payment first is the Stage 15 worked example, not a confirmed policy"}',
   'payment', 'Payment gates', 'Which operational statuses require a paid booking before the transition is allowed, and what happens on failure/cancellation/timeout.',
   'DRAFT', 'Stage 15 brief''s own worked example (PAYMENT_GATED) — mechanism active, exact gate list unconfirmed', datetime('now'), datetime('now')),
  ('staff_provisioning',
   '{"method":"admin-created account, no password set by the admin; new hire sets their own via the existing reset-token flow","realHiring":false,"status":"pending_business_configuration","note":"the PROVISIONING MECHANISM (Stage 14 createStaffAccount) is implemented and active; no real staff have been hired/provisioned through it - every current staff row is a labelled fixture"}',
   'staff', 'Real staff provisioning', 'Whether real (non-fixture) staff accounts have been provisioned, and through what process.',
   'PENDING', 'Stage 14 — provisioning mechanism built, no real hiring has occurred', datetime('now'), datetime('now')),
  ('admin_dashboard_scope',
   '{"modules":["overview","customers","supervisors","leads_attribution","bookings","operations","services","suppliers","payments","documents","notifications","reports","audit","staff_permissions","settings","business_rules"],"status":"active","note":"the Admin Dashboard''s final delivered scope (Stage 14 + this stage''s Business Rules module) - not an ERP, accounting or unrelated CRM system, per the Stage 14 brief''s own scope statement"}',
   'admin', 'Admin Dashboard scope', 'The final agreed module scope of the Admin Dashboard.',
   'ACTIVE', 'Stage 14 delivered scope, extended by this stage', datetime('now'), datetime('now'));
