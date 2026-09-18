-- Stage 16C: real flight supplier integration. The internal booking a customer sees is unchanged;
-- these additions record what the flight-supplier boundary itself needs — which server-issued search
-- and offer the booking was claimed against, and the durable, idempotent record of the actual supplier
-- order once one is created. Nothing here is customer-facing on its own; backend/routes.mjs decides what
-- surfaces where.
ALTER TABLE bookings ADD COLUMN flight_search_id TEXT;
ALTER TABLE bookings ADD COLUMN flight_offer_id TEXT;

CREATE TABLE IF NOT EXISTS flight_bookings (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_booking_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  itinerary_json TEXT NOT NULL DEFAULT '{}',
  passengers_json TEXT NOT NULL DEFAULT '[]',
  fare_json TEXT NOT NULL DEFAULT '{}',
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS flight_bookings_provider_ref ON flight_bookings(provider, provider_booking_id);
