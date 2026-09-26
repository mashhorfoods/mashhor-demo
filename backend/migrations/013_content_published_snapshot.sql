-- Phase 6 (review 2026-09-25 §7) — the public destinations/offers pages now read the CMS (GET /content/*,
-- backend/content.mjs). The lifecycle already promises that editing a PUBLISHED record doesn't change what visitors
-- see until someone republishes ("unpublished changes"), so the published version needs its own copy: a snapshot of
-- the row taken at each publish. NULL for a row published before this migration — the public read then uses the
-- row's current content until the next publish.

ALTER TABLE destinations ADD COLUMN published_json TEXT;
ALTER TABLE offers ADD COLUMN published_json TEXT;
