# Code Quality & Maintainability Review — 2026-09-20

Scope: entire repository (frontend `assets/js`/`assets/css`, `backend/`,
`tests/`, `tools/`, docs, config). Read-only review — no code was changed as
part of this document. Follows on from `docs/CODE-QUALITY-REVIEW-2026-09-18.md`
and its `909985b` follow-up commit, which already consolidated several
`ops/ui` helpers and fixed a first round of dead exports/queries; this review
covers the two days of feature work since (destination detail pages,
full-screen hero + transparent header, visual-quality pass, fixed hero image
scroll effect) plus areas the 09-18 review didn't reach (`supervisor/`,
`account/`, most of `backend/`).

**Overall assessment: this codebase is unusually clean for its size** (135
frontend JS files, 19 backend files, ~50k+ lines). No exported UI component
is fully dead, no CSS class is orphaned, route↔screen wiring is 1:1
everywhere, and there is no scratch/debug cruft checked into the repo. The
real debt is concentrated in three places: **two backend security/DoS gaps**,
**one genuinely dangerous stale tool** (`npm run images`), and **duplicate
logic that a prior consolidation pass reached in `ops/ui` but never extended
to `supervisor/`, `account/`, or the four detail-page components.**

---

## Do these first (small, safe, real problems)

### 1. `npm run images` will silently wipe the real photography map
**File:** `tools/fetch-images.mjs`, `tools/images.manifest.json`, `package.json`'s `"images"` script.

Written for the old Wikimedia-placeholder era. The real images have been
business-supplied `.webp` files since commit `86814e6`, and `CREDITS.md` says
so explicitly. But the script still parses a `<!-- data: ... -->` JSON blob
from `CREDITS.md` that no longer exists (falls back to `{}`), still looks for
`.jpg` files that don't exist, and **unconditionally overwrites
`assets/js/data/images.js` with the result** — an empty `IMAGES` map — with no
confirmation prompt. Running `npm run images` today breaks every photo on the
site.

- **Impact:** total image-map loss, silent, one command away.
- **Risk of fixing:** none — the tool is provably disconnected from the current pipeline.
- **Fix:** delete `tools/fetch-images.mjs` + `tools/images.manifest.json` + the `"images"` script, or add `if (!present.length) { throw new Error('refusing to write an empty image map'); }` and update it to read/write `.webp`.

### 2. `/diagnostics`, `/files/:id`, `/legal/*` bypass rate limiting
**File:** `backend/server.mjs:76-88`.

These three routes are matched *before* the `rateLimit()` call. `/health`
being exempt is normal; the other three aren't justified anywhere. `/diagnostics`
is the bad one: an unauthenticated POST that does an `INSERT` + a `DELETE ...
WHERE id < (SELECT MAX(id)...) - 5000` on every call — unthrottled. Cheap DB
resource-exhaustion vector.

- **Fix:** move the `/files`, `/legal`, `/diagnostics` matches below the rate-limit call, or give `/diagnostics` its own tight limit class.
- **Risk:** low — doesn't change documented behavior for any of the three.

### 3. i18n/a11y audits never visit the 11 destination detail pages
**File:** `tests/run.mjs:61`, `tools/a11y-audit.mjs:23-25`.

Both hardcode `['services', 'offers', 'supervisor']` when building the page
list for `npm test`'s i18n/a11y audits. `destinations/<slug>/` was added
later (commit `e207898`) and both loops were never updated — so untranslated
strings or contrast regressions on those 11 live, linked pages will never
surface in CI.

- **Fix:** add `'destinations'` to both loops. Mechanical, low risk.

### 4. Two dead one-liners in `header.js` / `12-header.css`
- `header.js:29` — `export { setSession, getSession } from './session.js';` has zero importers (everyone imports directly from `session.js`). Delete the line.
- `12-header.css:429` — `.c-gh[data-variant="booking"] .c-gh__secure { display: none; }` restates the base rule's value with no effect. Delete the line.

### 5. `PAYMENT_STATUSES` (`backend/payments.mjs:27`) is exported and never used anywhere, internally or externally. Delete it (or move to a comment if it's meant as documentation).

### 6. Two backend write pairs aren't transactional despite comments promising it
- `backend/business-rules.mjs` `applyRuleChange` (lines 53-73): history INSERT then config UPDATE, two separate `q.run()` calls, despite the module's own comment promising "never a silent, unversioned overwrite."
- `backend/staff.mjs` `transitionBooking` (144-160): booking UPDATE then status-history INSERT, same issue.

Both should be `q.tx()`-wrapped like their siblings (`routes.mjs` `claim()`, `staff.mjs` `setServiceWorkflow`) already are. Low risk, mechanical.

### 7. `notificationHistory` still full-scans the unfiltered case, and ignores its own index
**File:** `backend/staff.mjs:376-385`.

The customer-filtered branch was fixed to use SQL in an earlier pass, but the
default "show everything" admin view still does `SELECT * FROM outbox ORDER
BY created_at DESC` with no `WHERE`/`LIMIT`, and the `bookingId` filter
parses JSON per-row in JS even though migration `007` already added an
indexed `booking_id` column that `mailer.mjs` populates on every insert.
Same class of bug the commit history shows was already fixed once elsewhere
— not generalized here.

- **Fix:** filter on `booking_id`/`customer_id` in SQL via the existing `whereClause()` helper; drop the JS `.filter()`.

---

## Structural cleanup (real duplication, worth doing as a project)

### 8. Four detail-page "mount" implementations should be one shared factory
**Files:** `service-detail.js`, `offers.js`, `destination-detail.js`, `supervisor.js` (each ~250-260 lines, ~30-40 lines of near-identical boilerplate).

Each independently defines: a `mount(name)` slot lookup, a `sections` array,
`stateRegion(...)` with loading/empty[/error], a `show(name, content)`
toggle helper, a `paint(record)` that walks sections, and an
`api = {region, current, render, reload}`. Each also has a structurally
identical `ctaBand(record)`. They genuinely differ in real ways (offers/
destinations call `trackHero()`, offers calls `initAccordions()` on show,
supervisor has an extra error state) — a shared `createDetailMount({attr,
sections, load, sectionBuilders, onPaint})` factory with hooks for those
differences would remove ~120-160 duplicated lines.

- **Risk:** medium — needs real parameterization, not a blind merge. Do this as its own focused pass with the existing `detail.mjs`/`offers.mjs`/`destinations.mjs`/`supervisor.mjs` test suites re-run after.

### 9. The same "expand/collapse" toggle is hand-rolled 4× (JS) and copy-pasted 4× (CSS)
**Files:** `ui.js`'s `initAccordions()` is the real, reusable implementation. `footer.js:79-82`, `drawer.js:53-56`, `search.js:219-224` each reimplement the identical 3-line `aria-expanded`/`data-collapsed` toggle instead of using it. The matching CSS "grid-rows collapse" triple is copy-pasted identically in `07-components.css`, `12-header.css`, and `13-footer.css`.

- **Fix:** extract a `toggleCollapse(trigger, panel)` JS helper and a shared `.c-collapse-panel` CSS primitive; point the three bespoke sites at it.
- **Risk:** low-medium (markup/class changes in 3 call sites — re-verify focus/ARIA in each after).

### 10. The `ops/ui` helper consolidation from the 09-18 review never reached `supervisor/ui` or `account/ui`
The 09-18 review consolidated `actionForm()`/`debouncedRun()`/`statusFilterSelect()`/`emptyNote()`/`busyButton()` into `ops/ui/shell.js` for 11 ops screens, but its own scope table never swept the other two portals for the same pattern. Concretely, today:

- **`account/ui`'s field-error marking** is implemented 3× (`auth-screens.js`'s exported `setError`, plus independent reimplementations in `travellers.js` and `documents.js`) when the shared helper already exists one import away. **Do this one first** — it's a straight `import` swap, no new code needed.
- **The submit-button-with-spinner form pattern** — exactly what `actionForm()` already solves in `ops/ui` — is hand-rolled 4× more: twice in `account/ui/settings.js`, once each in `account/ui/travellers.js` and `account/ui/documents.js`, and twice again in `supervisor/ui/settings.js`, which has no shared helper at all. A `submitWithStatus()` helper (factoring out just the loading/success/error choreography, leaving field validation to the caller) in `account/ui/shell.js` and `supervisor/ui/shell.js` would remove ~40 duplicated lines across 5 files.
- **Slot/mount helpers** (`slot`/`put`, keyed by a `data-*` attribute) are reimplemented near-verbatim 4× across `booking/ui/shared.js`, `supervisor/ui/shell.js`, `ops/ui/shell.js`, `account/ui/shell.js`. A parameterized `makeSlotHelpers(attr)` in `core/dom.js` would unify all four.
- **`isAr = () => getLocale() === 'ar'`** is duplicated identically 3× (`booking/ui/shared.js`, `account/ui/shell.js`, `supervisor/ui/shell.js`) — move once into `core/i18n.js`.

### 11. Adapter-layer helpers duplicated across the three portals' `api-*-data.js`/dev adapters
- `list()` (response-normalizer) — byte-identical in `api-ops-data.js`, `api-supervisor-data.js`, `api-customer.js`. Move to `core/api.js`.
- `q()` (querystring builder) — identical in ops/supervisor adapters; `account`'s `api-customer.js` hand-builds its own less-general version instead. Move to `core/api.js`, fix account to use it.
- `paged()` (dev-adapter pagination) — near-identical in ops/supervisor dev adapters (differ only by intentional page-size cap, 100 vs 50 — keep as a parameter); account's dev adapter reimplements pagination inline a third way.
- The `not-connected.js` "fail every method" factory is duplicated 3× with the same shape.

All four are low-risk, mechanical dedups worth doing together.

### 12. Two missing indexes and a reintroduced N+1
**File:** `backend/migrations/001_init.sql`.

`bookings` has no index on `supervisor_id`, `ops_status`, or
`assigned_operator` despite these being the primary filters of the
supervisor-portal list/revenue/performance queries and the ops booking list.
`documents` has no index on `booking_id` despite being filtered/joined on it
in three places. (Later tables like `leads`/`commissions` did get a
`supervisor_id` index when added — `bookings`/`documents` predate that
practice and were never retrofitted.)

Separately, `supervisorSlug()` and `publicCustomer()` — the row-mapper
helpers used by `me.trips`, `me.bookings`, `me.documents`, `me.payments`, and
admin's `listCustomers` — each run one query *per row* even though the
booking/trip lookups around them were already batched in an earlier cleanup
pass. Same batching technique just needs extending to these two helpers.

- **Fix (indexes):** one additive migration — `CREATE INDEX bookings_supervisor ON bookings(supervisor_id, created_at)`, `bookings_ops_status ON bookings(ops_status)`, `documents_booking ON documents(booking_id)`. Very low risk.
- **Fix (N+1):** batch supervisor-slug lookups into a `Map` built once per request, same pattern already used nearby for bookings/trips.

### 13. Pagination is JS-side everywhere except one endpoint
**File:** `backend/db.mjs`'s `paginate()` helper takes an already-fully-materialized array and slices it — and every list function in `staff.mjs`/`supervisor.mjs` builds that array with no `LIMIT`/`OFFSET`, pulling the entire filtered table into memory before slicing. `routes.mjs`'s `me.payments` is the one place that does real `LIMIT ? OFFSET ?` + `COUNT(*)` — use it as the template.

- **Risk:** moderate effort (each call site needs a rewrite, and some do in-JS filtering that would need to move into SQL first), but the external contract (`{items, page, pageSize, total, nextPage}`) doesn't change. Start with `auditEvents` and `notificationHistory` — the largest, fastest-growing tables.

---

## Cosmetic (no dead logic — just wider `export` surface than needed)

Roughly 65 exported functions/constants across `assets/js/components/*`,
`assets/js/{ops,supervisor,account}/*`, and `assets/js/core|data|booking/*`
are only ever called from within their own defining file. None of these are
dead code — the logic runs — they're just exported when they don't need to
be, mostly because each detail-page/portal component follows the same
"export every section builder" template. `foundation.js`'s `export * from
'./components/X.js'` barrel makes them theoretically re-exported, but its
only consumer (`styleguide.js`) destructures a fixed, unrelated name list, so
none are reached that way either.

Two small, real dead exports were found in this category:
- `booking/ui/shared.js`'s `offerTitle` and `booking/rank.js`'s
  `priorityReason` — both fully superseded by inline logic now living in
  `result-card.js`/`details.js`. Zero references anywhere. Safe to delete
  (not just un-export).
- `assets/js/ops/adapters/installed.js` and `supervisor/adapters/installed.js`
  each build an `OPS_INSTALLED`/`SUPERVISOR_INSTALLED` metadata array and
  assign it to `window.no.opsInstalled`/`supervisorInstalled` — neither is
  ever read by any test or page (unlike `account`'s equivalent
  `window.no.installed`, which `tests/integration.mjs` genuinely asserts on).
  Either delete the dead metadata-building code, or add the matching
  assertions to `tests/ops-portal.mjs`/`tests/supervisor-portal.mjs`.

Not urgent — batch the `export`-keyword drops with the next real touch to
each file rather than a dedicated pass.

---

## Product-decision item (not a code defect — flagging for awareness)

### 14. The homepage's "help me choose" priority pick is silently dropped before reaching the real results screen
`data/home.js`'s `HOME_PRIORITIES` (5 items, includes a `'value'` option) and
`booking/rank.js`'s `PRIORITIES` (4 items, no `'value'`) are two separate
lists for what's conceptually one feature at two stages of the same journey.
The homepage widget's pick is stored into `ctx.options.sort`, echoed back
exactly once on a summary card, and then never read again — `booking/ui/results.js`
(the real Stage 11 results screen) always starts at `sort: 'recommended'`
regardless. `'value'` isn't even a valid sort key in `rank.js`'s scorer map.
This reads like Stage 10.4 homepage scaffolding that was never fully wired
into the Stage 11 results rebuild — worth a product decision (wire it
through, or document that the homepage pick is cosmetic-only) rather than a
mechanical fix.

### 15. `setStaffRole()` — fully built, permission-gated backend endpoint with no UI or adapter method calling it
Already flagged and deliberately deferred in the 09-18 review ("needs a
product decision, not a mechanical fix") — re-confirmed still true. Either
wire a "change role" action into `ops/ui/staff.js`, or keep documenting it as
intentionally deferred rather than carrying it as silent dead code.

### 16. Legacy bearer-token reassignment route logs a fake `'admin'` actor
`backend/supervisor-routes.mjs`'s `admin.reassign` passes the literal string
`'admin'` (not a real identity) to the audit log, because the legacy
bearer-token auth path carries no principal — unlike the Stage-14
session-based equivalent, which logs the real staff id. Not exploitable by
default (404 unless `BACKEND_ADMIN_TOKEN` is explicitly set), but if that env
var is ever set in production, every reassignment through it is
un-attributably audited. Recommend retiring the bearer-token path now that
the session-based one exists, or requiring a real operator identity.

---

## Documentation staleness (no code risk, but actively misleading)

- **`README.md`** still shows the "Stage 15 — PARTIALLY COMPLETE, no Stage 14 admin dashboard" banner and its doc table omits ~15 docs for work that's shipped since (Stage 14-16D, supervisor profiles, coordinator update, Egypt launch, the 09-18 review itself). Also still documents `tools/fetch-images.mjs` as the live photography pipeline — see item 1, that's actively dangerous advice. This was already flagged as a deferred item in the 09-18 review and hasn't been touched since; recommend fixing it together with the fetch-images.mjs removal.
- **`docs/SUPERVISOR-PROFILES.md` §10.2** and **`docs/COORDINATOR-ROLE-UPDATE.md` §9** both still describe the five coordinator avatars as "generated SVG placeholders" — superseded by real business photos in commit `d7f8f35`, which only updated one of the two references.
- **`docs/EGYPT-LAUNCH-POSITIONING.md`** describes a "Why Number One" section and a homepage "final CTA band" that were deleted in a later homepage reorganization commit.
- Four old status-report PDFs (`STATUS-REPORT-2026-09-16.pdf`, `PROJECT-REPORT-2026-09-16.pdf`, `STAGES-11-12-12.1-REPORT-2026-09-17.pdf`, `STAGE-15-STATUS-REPORT-2026-09-17.pdf`) are still un-archived, per the 09-18 review's own still-unactioned recommendation.

---

## Checked and confirmed clean (worth recording so these aren't re-investigated)

- **No orphaned test files** — every `tests/*.mjs` is either in `tests/run.mjs`'s `SUITES` array or a legitimate shared helper (`env.mjs`, `run.mjs`, `run-backend.mjs`, `contract-server.mjs`).
- **No unused tools/* scripts, no unused dependencies** (only devDependency is `playwright`, genuinely imported), **no scratch/temp files** anywhere in the repo.
- **No orphaned CSS classes** — every `.c-`/`.l-`/`.t-`/`.u-` selector traced to a real usage, including ones only constructed via template literals.
- **Route↔screen wiring is 1:1 everywhere** across `admin/`, `supervisor/`, `account/`, and the generated `destinations/`/`offers/`/`services/`/`supervisor/<slug>` shells — no dead screens, no orphaned components.
- **Dev adapters (booking/ops/supervisor/account) are correctly env-gated, not dead** — they're the default local-dev path per the committed `env.js`, and production explicitly refuses `*_PROVIDER=dev` at startup.
- **i18n key sets are perfectly parallel between `en.js`/`ar.js`** (1538 keys each, zero orphans either side); no dead keys found with confidence — this codebase leans heavily on dynamic key construction (`t(\`ops.leads.status.${l.status}\`)`) that makes naive dead-key detection produce 150-300 false positives. Don't trust a plain grep here without manually tracing each candidate.
- **`opsData.search`/`.overview`/`.setServiceWorkflow`/`.addServiceDocumentRequirement`** — already known, already deliberately kept per the 09-18 review ("backend-ready, no UI yet, needs a product decision").
- **Migrations show no superseded/redundant files** — each is additive, none duplicates an earlier schema.
- **Dev payment/flight providers and `/__test/*` routes are correctly gated** — `config.mjs` refuses them in production at startup.

---

## Suggested order of work

1. Delete/neuter `tools/fetch-images.mjs` (item 1) — highest severity, lowest effort.
2. Fix the rate-limit bypass (item 2) and add the two missing `q.tx()` wraps (item 6) — security/correctness, small diffs.
3. Add `'destinations'` to the two audit loops (item 3) and the three trivial dead-line deletions (items 4, 5).
4. Add the three missing indexes (item 12) — additive migration, no behavior change.
5. Fix `notificationHistory`'s unfiltered full-scan (item 7).
6. `account/ui`'s `setError` de-dup (item 10, first bullet) — pure `import` swap.
7. Everything else (items 8, 9, 10 remainder, 11, 13, cosmetic exports) as an ongoing cleanup pass, not urgent.
8. README + stale-docs pass (documentation section) — bundle with item 1 since it touches the same subject.
