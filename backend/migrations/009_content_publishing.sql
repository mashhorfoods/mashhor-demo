-- Command Center CMS, Phase 2B-i — draft/preview/publish for destinations & offers, replacing the 2A `active`
-- boolean. `publish_status` (not `status`) to avoid colliding with offers' own pre-existing `status` column
-- (booking availability: available/request/soon/ended — an unrelated concept). The two 2A rows are backfilled
-- from their current `active` flag so nothing already created regresses to draft.

ALTER TABLE destinations ADD COLUMN publish_status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE destinations ADD COLUMN published_at TEXT;
UPDATE destinations SET publish_status = 'published', published_at = updated_at WHERE active = 1;
ALTER TABLE destinations DROP COLUMN active;

ALTER TABLE offers ADD COLUMN publish_status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE offers ADD COLUMN published_at TEXT;
UPDATE offers SET publish_status = 'published', published_at = updated_at WHERE active = 1;
ALTER TABLE offers DROP COLUMN active;
