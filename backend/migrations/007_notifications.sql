-- Stage 16D: durable notification outbox. Event → Durable Outbox → Delivery Attempt → Provider → Result.
-- Existing rows (all status='queued', no delivery attempted — BACKEND_MAILER has only ever been 'none') get
-- honest defaults: attempts=0, no idempotency key, nothing to migrate.
ALTER TABLE outbox ADD COLUMN idempotency_key TEXT;
ALTER TABLE outbox ADD COLUMN event_type TEXT;
ALTER TABLE outbox ADD COLUMN booking_id TEXT;
ALTER TABLE outbox ADD COLUMN staff_id TEXT;
ALTER TABLE outbox ADD COLUMN recipient TEXT;
ALTER TABLE outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outbox ADD COLUMN next_attempt_at INTEGER;
ALTER TABLE outbox ADD COLUMN provider_message_id TEXT;
ALTER TABLE outbox ADD COLUMN failure_category TEXT;
ALTER TABLE outbox ADD COLUMN updated_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS outbox_idempotency_key ON outbox(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS outbox_status_next_attempt ON outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS outbox_booking ON outbox(booking_id);
