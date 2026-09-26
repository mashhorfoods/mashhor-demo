-- Phase 6 — leads and commissions are written by real customer actions, not only by fixtures.
--
-- LEADS: a lead is created by a request-mode booking (POST /me/bookings/claim with status 'received') and by the public
-- contact form (POST /contact). It goes to the customer's attributed supervisor when there is one, otherwise it stays
-- unassigned (supervisor_id NULL) and only operations sees it. SQLite cannot drop a NOT NULL constraint in place, so the
-- table is rebuilt; nothing references leads, so the rebuild is safe with foreign keys on. Two columns are added:
-- booking_id (the request booking the lead came from; unique, so a claim retried never makes a second lead) and
-- message (what the visitor wrote on the contact form).
CREATE TABLE leads_new (
  id TEXT PRIMARY KEY, supervisor_id TEXT REFERENCES supervisors(id) ON DELETE SET NULL, customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', service_interest TEXT,
  status TEXT NOT NULL DEFAULT 'new', converted_booking_id TEXT, booking_id TEXT, message TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
INSERT INTO leads_new (id, supervisor_id, customer_id, name, contact, source, service_interest, status, converted_booking_id, created_at, updated_at)
  SELECT id, supervisor_id, customer_id, name, contact, source, service_interest, status, converted_booking_id, created_at, updated_at FROM leads;
DROP TABLE leads;
ALTER TABLE leads_new RENAME TO leads;
CREATE INDEX IF NOT EXISTS leads_supervisor ON leads(supervisor_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS leads_booking ON leads(booking_id) WHERE booking_id IS NOT NULL;

-- COMMISSIONS: one row per paid booking attributed to a supervisor (backend/commissions.mjs, called from the payment
-- webhook — the only path that marks a booking paid). The unique index makes a replayed payment event harmless.
-- `rate` records the rate the amount was computed at, so a later rate change never rewrites an earned commission.
-- Status: 'earned' when written; 'reversed' (with reversed_at) when the booking is later cancelled or refunded.
ALTER TABLE commissions ADD COLUMN rate REAL;
ALTER TABLE commissions ADD COLUMN reversed_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS commissions_booking ON commissions(booking_id);

-- The commission rate lives in the Business Rules Register's existing commission_model row (no second key). Until now
-- it held model null; it now carries a working default of 5% of the paid booking amount. The rule stays DRAFT — a
-- technical default in effect, not a confirmed business decision — and the previous value is archived first, as every
-- register change is (business-rules.mjs applyRuleChange). Admins change the rate from the Business Rules screen.
INSERT INTO business_config_history (rule_id, category, name, description, value_json, allowed_values_json, status, source, effective_from, effective_to, updated_by, notes, superseded_at)
  SELECT key, category, name, description, value_json, allowed_values_json, status, source, effective_from, datetime('now'), updated_by, notes, datetime('now')
  FROM business_config WHERE key = 'commission_model';
UPDATE business_config SET
  value_json = '{"model":"percentage","rate":0.05,"basis":"booking_amount","trigger":"booking_paid","onCancellation":"reversed","status":"technical_default_pending_business_confirmation","note":"a working default: 5% of the paid booking amount, earned when the payment is verified, reversed if the booking is later cancelled or refunded; the business has not confirmed the rate"}',
  status = 'DRAFT', source = 'Phase 6 — technical default so commissions are recorded; rate not yet confirmed by the business',
  effective_from = datetime('now'), effective_to = NULL, updated_by = 'migration:012', updated_at = datetime('now')
  WHERE key = 'commission_model';
