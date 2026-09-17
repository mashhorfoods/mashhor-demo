-- Number One customer backend — initial schema. Applied by migrate.mjs (schema_migrations tracks versions).
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', locale TEXT NOT NULL DEFAULT 'ar', image TEXT,
  password_salt TEXT NOT NULL, password_hash TEXT NOT NULL,
  attribution_supervisor TEXT, attribution_source TEXT, attribution_at TEXT,
  acceptance_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, csrf TEXT NOT NULL, created_at TEXT NOT NULL, expires_at INTEGER NOT NULL, last_seen_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_customer ON sessions(customer_id);
CREATE TABLE IF NOT EXISTS reset_tokens (token TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, window_start INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS supervisors (id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, title_ar TEXT, title_en TEXT, destination_json TEXT, start_date TEXT, end_date TEXT, services_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'upcoming', travellers INTEGER, supervisor_id TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS trips_customer ON trips(customer_id);
CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL, service TEXT NOT NULL, status TEXT NOT NULL, payment_status TEXT NOT NULL DEFAULT 'unpaid', amount REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD', supervisor_id TEXT, ticketed INTEGER NOT NULL DEFAULT 0, detail_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS bookings_customer ON bookings(customer_id);
CREATE TABLE IF NOT EXISTS travellers (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, first_name TEXT, last_name TEXT, dob TEXT, gender TEXT, nationality TEXT, passport TEXT, passport_expiry TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS travellers_customer ON travellers(customer_id);
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, booking_id TEXT, trip_id TEXT, type TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'issued', status TEXT NOT NULL DEFAULT 'available', title TEXT, size INTEGER, content_type TEXT, storage_key TEXT, deletable INTEGER NOT NULL DEFAULT 0, issued_at TEXT, created_at TEXT NOT NULL, revoked_at TEXT);
CREATE INDEX IF NOT EXISTS documents_customer ON documents(customer_id);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, booking_id TEXT, at TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', method_ar TEXT NOT NULL DEFAULT '', method_en TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS payments_customer ON payments(customer_id, at);
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, kind TEXT NOT NULL, at TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, title_ar TEXT, title_en TEXT, text_ar TEXT, text_en TEXT, href TEXT, booking_id TEXT);
CREATE INDEX IF NOT EXISTS notifications_customer ON notifications(customer_id, at);
CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, customer_id TEXT, channel TEXT NOT NULL, template TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', created_at TEXT NOT NULL, sent_at TEXT);
CREATE TABLE IF NOT EXISTS diagnostics (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, event TEXT NOT NULL, payload_json TEXT NOT NULL);
