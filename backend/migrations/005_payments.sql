-- Stage 16B — real payment provider integration. The `payments` table (Stage 12.2) already exists; this migration
-- only adds what a server-authoritative payment-intent + verified-webhook flow needs. Nothing here changes the
-- meaning of `bookings.payment_status` (still the simple paid/unpaid gate Stage 15's PAYMENT_GATED mechanism reads)
-- — the new `status` column on `payments` carries the fuller provider-neutral lifecycle
-- (pending/processing/paid/failed/cancelled/refunded); `bookings.payment_status` flips to 'paid' only once a
-- payment row reaches 'paid', and only from the verified-webhook code path (backend/payments.mjs), never from a
-- client-supplied field.
ALTER TABLE payments ADD COLUMN provider TEXT NOT NULL DEFAULT 'dev';
ALTER TABLE payments ADD COLUMN provider_reference TEXT;
ALTER TABLE payments ADD COLUMN idempotency_key TEXT;
ALTER TABLE payments ADD COLUMN verified_at TEXT;
ALTER TABLE payments ADD COLUMN failure_code TEXT;
ALTER TABLE payments ADD COLUMN updated_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key ON payments(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_provider_reference ON payments(provider, provider_reference);

-- Durable webhook idempotency: a (provider, provider_event_id) pair is processed at most once. A provider may
-- redeliver the same event any number of times; every redelivery after the first is recognised here and ignored
-- before it can touch a payment or booking row a second time.
CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, provider_event_id TEXT NOT NULL, payment_id TEXT,
  event_type TEXT NOT NULL, received_at TEXT NOT NULL, processed_at TEXT, status TEXT NOT NULL DEFAULT 'received',
  reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_event ON payment_events(provider, provider_event_id);
CREATE INDEX IF NOT EXISTS payment_events_payment ON payment_events(payment_id, received_at);
