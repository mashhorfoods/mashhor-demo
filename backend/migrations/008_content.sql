-- Command Center CMS, Phase 2A — Destinations and Offers become real, admin-manageable
-- entities, mirroring the field shapes their existing frontend registries already define
-- (assets/js/data/destinations.js, offers.js) so a later phase can feed those pages from
-- here without a reshape. No draft/publish state yet — `active` is this phase's only
-- lifecycle, the same convention `services` already uses. Offers' richer nested content
-- (inclusions, exclusions, itinerary, terms, FAQ, travel period) is one `detail_json` blob
-- for now, edited as raw JSON in the admin form — the same "no dedicated UI yet" pattern
-- Stage 15B's Business Rules raw-value editor already established in this codebase.

CREATE TABLE IF NOT EXISTS destinations (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL, region TEXT,
  name_ar TEXT, name_en TEXT, country_ar TEXT, country_en TEXT, desc_ar TEXT, desc_en TEXT,
  purposes_json TEXT NOT NULL DEFAULT '[]', services_json TEXT NOT NULL DEFAULT '[]', image_json TEXT,
  featured INTEGER NOT NULL DEFAULT 0, home INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS destinations_slug ON destinations(slug);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL, category TEXT, categories_json TEXT NOT NULL DEFAULT '[]',
  destination_id TEXT REFERENCES destinations(id) ON DELETE SET NULL,
  title_ar TEXT, title_en TEXT, short_ar TEXT, short_en TEXT, desc_ar TEXT, desc_en TEXT,
  duration_nights INTEGER, price_amount REAL, price_currency TEXT, price_type TEXT, price_basis_ar TEXT, price_basis_en TEXT,
  status TEXT NOT NULL DEFAULT 'request', booking_mode TEXT NOT NULL DEFAULT 'request',
  featured INTEGER NOT NULL DEFAULT 0, placeholder INTEGER NOT NULL DEFAULT 1,
  services_json TEXT NOT NULL DEFAULT '[]', image_json TEXT, detail_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS offers_slug ON offers(slug);
CREATE INDEX IF NOT EXISTS offers_destination ON offers(destination_id);
