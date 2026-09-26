-- Indexes for the WHERE clauses the list and scoped read models run on every request (code-quality review
-- 2026-09-25 §6). Additive only: no table or column changes.
CREATE INDEX IF NOT EXISTS customers_attribution_supervisor ON customers(attribution_supervisor, created_at);
CREATE INDEX IF NOT EXISTS bookings_supervisor ON bookings(supervisor_id, created_at);
CREATE INDEX IF NOT EXISTS bookings_trip ON bookings(trip_id);
CREATE INDEX IF NOT EXISTS bookings_ops_status ON bookings(ops_status, created_at);
CREATE INDEX IF NOT EXISTS bookings_assigned_operator ON bookings(assigned_operator);
CREATE INDEX IF NOT EXISTS documents_booking ON documents(booking_id);
CREATE INDEX IF NOT EXISTS payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS outbox_customer ON outbox(customer_id, created_at);
CREATE INDEX IF NOT EXISTS attribution_events_supervisor ON attribution_events(supervisor_id, at);

-- Messages queued before mailer.enqueue() started filling outbox.booking_id carry the booking only in their payload.
-- Copy it into the (already indexed) column once, so notification history filters on the column alone.
UPDATE outbox SET booking_id = json_extract(payload_json, '$.bookingId')
  WHERE booking_id IS NULL AND json_valid(payload_json) AND json_type(payload_json, '$.bookingId') = 'text';
