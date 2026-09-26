-- Code-quality review 2026-09-25 §7: two columns nothing ever wrote. `customers.image` (001) — no route or form
-- sets a customer profile image; `supervisors.internal_id` (002) — no admin screen or seed ever filled it. Neither
-- is indexed or referenced by a view or trigger, so both drop cleanly. Their API fields (customer `image`,
-- supervisor `internalId`) were always null and are no longer returned.
ALTER TABLE customers DROP COLUMN image;
ALTER TABLE supervisors DROP COLUMN internal_id;
