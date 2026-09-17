-- Stage 13 — the supervisor system. Extends the Stage 12.2 `supervisors` table (id, active) with the public-profile and
-- credential fields a future Admin Dashboard will edit, and adds the tables the supervisor portal reads. No business data
-- is inserted here — every new column is nullable or empty until the business (Stage 14 admin) supplies it.
ALTER TABLE supervisors ADD COLUMN slug TEXT;
ALTER TABLE supervisors ADD COLUMN internal_id TEXT;
ALTER TABLE supervisors ADD COLUMN name_ar TEXT;
ALTER TABLE supervisors ADD COLUMN name_en TEXT;
ALTER TABLE supervisors ADD COLUMN title_ar TEXT;
ALTER TABLE supervisors ADD COLUMN title_en TEXT;
ALTER TABLE supervisors ADD COLUMN bio_ar TEXT;
ALTER TABLE supervisors ADD COLUMN bio_en TEXT;
ALTER TABLE supervisors ADD COLUMN image_json TEXT;
ALTER TABLE supervisors ADD COLUMN languages_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE supervisors ADD COLUMN specialties_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE supervisors ADD COLUMN services_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE supervisors ADD COLUMN phone TEXT;
ALTER TABLE supervisors ADD COLUMN whatsapp TEXT;
ALTER TABLE supervisors ADD COLUMN email TEXT;
ALTER TABLE supervisors ADD COLUMN city TEXT;
ALTER TABLE supervisors ADD COLUMN password_salt TEXT;
ALTER TABLE supervisors ADD COLUMN password_hash TEXT;
ALTER TABLE supervisors ADD COLUMN notification_prefs_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE supervisors ADD COLUMN created_at TEXT;
ALTER TABLE supervisors ADD COLUMN updated_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS supervisors_slug ON supervisors(slug);
CREATE UNIQUE INDEX IF NOT EXISTS supervisors_email ON supervisors(email);

-- Supervisor sessions are a SEPARATE table and cookie pair from customer sessions (backend/http.mjs): a customer session
-- can never be read as a supervisor session and vice versa. That separation IS the role boundary for these two roles.
CREATE TABLE IF NOT EXISTS supervisor_sessions (id TEXT PRIMARY KEY, supervisor_id TEXT NOT NULL REFERENCES supervisors(id) ON DELETE CASCADE, csrf TEXT NOT NULL, created_at TEXT NOT NULL, expires_at INTEGER NOT NULL, last_seen_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS supervisor_sessions_supervisor ON supervisor_sessions(supervisor_id);
CREATE TABLE IF NOT EXISTS supervisor_reset_tokens (token TEXT PRIMARY KEY, supervisor_id TEXT NOT NULL REFERENCES supervisors(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL);

-- Leads: prospects a supervisor is working, before (or without) a customer account. §15
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY, supervisor_id TEXT NOT NULL REFERENCES supervisors(id) ON DELETE CASCADE, customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', service_interest TEXT,
  status TEXT NOT NULL DEFAULT 'new', converted_booking_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_supervisor ON leads(supervisor_id, created_at);

-- Attribution audit trail: every time a customer's supervisor is set or reassigned, server-side only. §26
CREATE TABLE IF NOT EXISTS attribution_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  supervisor_id TEXT, previous_supervisor_id TEXT, source TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS attribution_events_customer ON attribution_events(customer_id, at);

-- Supervisor rights / commission — architecture only. A row exists once a booking is billable; its amount and status stay
-- 'pending_configuration' until the business config names a model (business_config, key 'commission_model'). §18
CREATE TABLE IF NOT EXISTS commissions (
  id TEXT PRIMARY KEY, supervisor_id TEXT NOT NULL REFERENCES supervisors(id) ON DELETE CASCADE, booking_id TEXT NOT NULL,
  amount REAL, currency TEXT, status TEXT NOT NULL DEFAULT 'pending_configuration', period TEXT, rule_version TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS commissions_supervisor ON commissions(supervisor_id, created_at);

-- Notifications isolated from the customer's (§20): a different table, never mixed in one query.
CREATE TABLE IF NOT EXISTS supervisor_notifications (
  id TEXT PRIMARY KEY, supervisor_id TEXT NOT NULL REFERENCES supervisors(id) ON DELETE CASCADE, kind TEXT NOT NULL, at TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0,
  title_ar TEXT, title_en TEXT, text_ar TEXT, text_en TEXT, href TEXT, booking_id TEXT
);
CREATE INDEX IF NOT EXISTS supervisor_notifications_supervisor ON supervisor_notifications(supervisor_id, at);

-- Business rules that are explicitly NOT decided yet (§9, §18, §39): one JSON row per key, read by identity.mjs /
-- routes.mjs, defaulting to the safest "preserve existing behaviour, do not invent" choice until the business confirms.
CREATE TABLE IF NOT EXISTS business_config (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
INSERT OR IGNORE INTO business_config (key, value_json, updated_at) VALUES
  ('attribution_model', '{"rule":"first","status":"pending_business_confirmation","note":"first attribution wins and is never silently overwritten — the behaviour already in place since Stage 10; the business has not yet confirmed this as final policy"}', datetime('now')),
  ('commission_model', '{"model":null,"status":"pending_business_configuration","note":"no percentage, fixed amount or service-specific rule has been supplied; commissions are recorded with status pending_configuration and amount null until one is"}', datetime('now'));
