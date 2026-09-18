# Code Quality & Maintainability Review — 2026-09-18

Scope: the entire repository as it stands after Stage 16 — `backend/`,
`assets/js/{ops,core,booking,account,supervisor,components,data}/`,
`admin/*` + non-admin HTML, `tests/`, `tools/`, `package.json`, `docs/`.

## Methodology

Four parallel audits (backend; admin/ops frontend; core/booking/account
frontend; tests/tools/docs), each required to grep every candidate's exact
symbol name **repo-wide** — not just its own assigned area — before calling
it dead, duplicated, or unused. This was learned the hard way earlier in
this project: an agent once flagged `RESERVED_SUPERVISOR_SLUGS` as dead when
it was actually consumed by `tests/links.mjs` and `tools/build-routes.mjs`.
A false positive (deleting something live) is worse than a miss.

The highest-impact/highest-risk claims below were independently
re-verified after the four audits returned (fresh greps against the actual
files, reproduced inline where relevant) — this is not a blind merge of
four separate reports.

This is an **analysis-only** deliverable. Nothing has been changed. Ranked
"aggressive but safe" per your request, with risk called out per item so
you can decide what to greenlight.

---

## 1. Dead code (unused functions/files/routes/variables/imports/exports)

### 1.1 — ~35 unused imports, zero-risk (backend + frontend)
Confirmed: each name appears exactly once in its file (the import line
itself).

- `backend/staff-routes.mjs:10,12` — `HttpError`, `staffById` (independently re-verified: neither appears again in the file)
- `backend/supervisor-routes.mjs:15,17` — `setSupervisorPassword`, `LEAD_STATUSES`
- `backend/routes.mjs:14` — `warn`
- `assets/js/booking/ui/results.js:12,13,16,21` — `qs`, `qsa`, `scrollTo as scrollIntoView`, `getLocale`, `summariseTravellers`, `startSearch`, `setResults` (7 in one file — `startSearch`/`setResults` are a leftover from before `runSearch()` in `booking/search.js` absorbed that persistence itself; **no duplicate-persistence bug**, just stale imports)
- `assets/js/booking/ui/{details,result-card,confirmation,review,payment,shared,travellers}.js` — one or two dead imports each (`route`, `totalTravellers`, `getLocale`, `stepUrl`, `pick`, `qs`)
- `assets/js/account/ui/{settings,auth-screens,trips,dashboard}.js` — all four import `isAr` from `./shell.js` and never call it (only `account/ui/travellers.js` actually uses it)
- `assets/js/components/{offers,destinations,supervisor,booking,service-detail,home}.js` — one or two dead imports each
- `assets/js/data/navigation.js:84` — `offersIn` imported but `MENU_OFFERS` never calls it (its sibling menus `MENU_SERVICES`/`MENU_DESTINATIONS` do call their equivalents — looks like a copy-paste that was later simplified without trimming the import)

**Impact:** no runtime effect (bundler would tree-shake these anyway), but
real reading/lint noise across ~20 files. **Risk:** none — confirmed zero
other references per file, and the full Playwright suite exercises every
page these live in, so `npm test` catches any grep miss. **Plan:** delete
each dead binding; run `npm test`.

### 1.2 — 10 dead `opsData` facade methods, built end-to-end but never called
`assets/js/ops/data.js` — `meta`, `bookingNotes`, `task` (singular),
`documentRequirements`, `setServiceWorkflow`, `addServiceDocumentRequirement`,
`overview`, `search`, `activateRule`, `disableRule`. Each has a full
implementation in **both** `api-ops-data.js` and `dev-ops-data.js`, plus an
entry in `not-connected.js`'s `DATA_METHODS`, yet zero callers anywhere
(including `tests/ops-portal.mjs`).

**Split by real risk:**
- **Truly orphaned, safe to delete:** `meta`, `bookingNotes` (superseded by fields already on `booking()`), `task` (no task-detail screen exists, only the list), `documentRequirements` (superseded by the per-service variant), `activateRule`/`disableRule` (superseded by the generic `updateRule(id, {status})` the UI actually uses).
- **Backend-ready, UI never built — a scoping gap, not a mistake:** `search` (a full admin global-search contract, dev adapter even filters 6 entity types, zero UI anywhere), `overview` (a purpose-built dashboard summary — see §6.3 below), `setServiceWorkflow`/`addServiceDocumentRequirement` (write endpoints exist; the Services detail screen renders workflow/doc-requirements **read-only**). **Do not delete these four without a product decision** — they're either an intentionally-scoped-out feature or a straight gap depending on intent nobody here can resolve.

**Plan:** delete the 6 truly-orphaned methods from `data.js` + both adapters
+ `not-connected.js`. For the other 4, either build the missing UI or
explicitly mark them `// not yet wired — see CODE-QUALITY-REVIEW` so the
next person doesn't assume they're reachable.

### 1.3 — Unused exports, `backend/supervisor.mjs` and `assets/js/ops/ui/shell.js`
- `backend/supervisor.mjs:26` `publicSupervisor` — only self-used inside `privateSupervisor`; its own comment says it's prepared for a **future public directory**. Recommend dropping the `export` keyword (reversible), not deleting the function — the comment reads as a deliberate seam.
- `backend/supervisor-routes.mjs:41` — unused local `const sid = consumeSupervisorReset(...)`. Compare `routes.mjs`'s customer equivalent, which uses the returned id to `enqueue()` a "password changed" notification — supervisors get none. Worth a one-line flag to product (not this audit's call to fix behavior), but the dead binding itself is safe to drop.
- `assets/js/ops/ui/shell.js` — `isAr` (line 19) is fully dead (zero callers anywhere, confirmed by repo-wide grep — every other `isAr` hit is an unrelated same-named local in a different file). `slot`, `guardState`, `errorState`, `forbiddenNote`, `opsNav` are all used only inside `shell.js` itself — not dead, just needlessly `export`ed.

**Plan:** delete `isAr`; drop `export` from the other five and from `publicSupervisor`; delete the unused `sid` binding.

### 1.4 — 5 dead i18n key pairs (outside `ops.*`, which audited 100% clean)
`ar.js`/`en.js` — `acct.date` (superseded by `acct.dates`), `acct.booking`
(superseded by the namespaced `acct.booking.*` family), `bk.summary.tripType`
(a stray key in the wrong namespace — the parallel `book.summary.tripType`
*is* used, by a different UI surface), `home.offers.cta` and
`home.offers.validUntil` (superseded by `offers.cta.*`). Key parity between
ar/en is otherwise exact: 1489/1489 non-ops keys match, 375/375 ops keys
match (both audits independently confirmed full parity — a genuinely clean
result worth noting, not just an absence of findings).

**Plan:** delete the 5 key pairs from both files; re-run
`tools/i18n-audit.mjs` + full `npm test` afterward (string removal is easy
to get subtly wrong reasoning about dynamic-template call sites by hand).

### 1.5 — Dead re-export line
`assets/js/components/header.js:32` — `export { logo, languageButton, bookNowButton } from './brand.js'` is picked up by `foundation.js`'s barrel re-export but nothing imports those three names through either file; every real consumer imports directly from `brand.js`. The sibling line 33 (`setSession`/`getSession`) **is** used — only line 32 is dead.

### 1.6 — Deferred-decision exports, one stage further stale
Flagged once already by the 758ce53 cleanup as "left for a product decision,"
still zero callers a full stage later: `booking/ui/shared.js:110 offerTitle`,
`booking/rank.js:75 priorityReason`, `booking/journey.js:40 resetJourney`.
Not new debt, but worth forcing the decision now rather than letting it age
again — see §5.

---

## 2. Duplicate logic to consolidate

This is the single biggest category by line count across the whole review.

| # | Pattern | Copies | Where | Fix |
|---|---|---|---|---|
| 2.1 | `WHERE`/params filter-builder | 11 | `staff.mjs` (7×), `supervisor.mjs` (3×), `business-rules.mjs` (1×) | one `whereClause(pairs)` helper in `db.mjs`, next to the existing `paginate()` |
| 2.2 | Batch `IN (...)` placeholder builder | 10 | `routes.mjs` (4×), `staff.mjs` (3×), `supervisor.mjs` (3×) | `placeholders(ids)` helper in `db.mjs`; also closes a footgun (missing the `if (ids.length)` guard breaks SQLite) |
| 2.3 | `nDocumentAdmin` reimplements `nDocReview`'s fields from scratch | 2 | `backend/staff.mjs:297` vs `433` (independently re-verified — `nDocumentAdmin` is a strict superset) | `nDocumentAdmin = (r) => ({ ...nDocReview(r), customerId, tripId, kind })` |
| 2.4 | `page`/`pageSize` query-param clamp | 3 | `staff-routes.mjs`, `supervisor-routes.mjs`, inlined in `routes.mjs` | one `pageParams(url, {def,max})` in `http.mjs`; keep the different max values (100 vs 50) as a parameter — `me.payments`'s SQL `LIMIT/OFFSET` (vs. in-memory `paginate()`) is a deliberate perf choice, dedupe only the parsing |
| 2.5 | `since`-clause builder, 3× inside one function | 3 | `supervisor.mjs:212-227` `supervisorPerformance()` | local `withSince(col)` closure |
| 2.6 | Submit-button-with-spinner form boilerplate | ~11 | `customers.js`, `supervisors.js`, `staff.js`, `services.js`, `suppliers.js`, `tasks.js`, `escalations.js`, `notifications.js`, `business-rules.js`, `settings.js` | `bookings.js` already built the generalized version (`actionForm()`, reused 4× in that one file) — promote it to `shell.js` and reuse everywhere else instead of hand-rolling a slightly-inconsistent copy each time (e.g. `staff.js`'s copy has no inline error display; `bookings.js`'s does) |
| 2.7 | Debounced search-filter wiring | 2 | `customers.js`, `supervisors.js` | `debouncedRun(input, run, ms=300)` in `shell.js` |
| 2.8 | Status-filter `<select>` builder | 4 | `payments.js`, `documents.js`, `tasks.js`, `escalations.js` | `statusFilterSelect(statuses, prefix, onChange)` in `shell.js`; also fold the accidental cross-screen i18n coupling below into this fix |
| 2.9 | Empty-state note markup | ~11 | `bookings.js` (4×), `customers.js` (4×), `supervisors.js` (2×), `business-rules.js` (1×) | `emptyNote(key)` helper in `shell.js` |
| 2.10 | `RULE_STATUSES` re-declared instead of imported | 1 | `assets/js/ops/adapters/dev-ops-data.js:239` hand-copies the exact array `data.js:137` already exports (and `business-rules.js` already imports correctly) | swap for the import — closes a silent-drift risk on the validation logic |
| 2.11 | `req`/`reqAs` HTTP test helper | 5 | `tests/backend.mjs` lines 54, 174, 272, 403, 540 | one `makeReq(API, {csrfCookie})` factory; note the line-540 variant already dropped `raw`/`text` support the others have — a live example of the drift this creates |
| 2.12 | Playwright `ctx()` context helper, byte-for-byte identical | 4 | `account.mjs`, `journey.mjs`, `ops-portal.mjs`, `supervisor-portal.mjs` (a 5th, `integration.mjs`, is a near-identical variant with one extra param) | `makeCtx(browser, errs)` in `tests/env.mjs`, already imported by every suite |
| 2.13 | Ephemeral-backend-spawn boilerplate | 3-4 | `run-backend.mjs`, `ops-portal.mjs`, `supervisor-portal.mjs` (`backend.mjs`'s variant intentionally uses different rate limits to test lockout — keep that parameterized, don't force it into the same shape) | `startEphemeralBackend({prefix, portBase, portSpread, rate})` helper |

**Minor/lower-priority, noted but not worth a standalone change yet:**
inline status-update-with-revert-on-failure in `tasks.js`/`escalations.js`
(2×); the customer/supervisor `notificationsRead` handler pair (structurally
identical, but the underlying table separation is **explicitly documented**
architecture per migration `002_supervisors.sql` — only the code pattern is
duplicated, don't merge the tables).

**Aggregate impact:** roughly 250-300 duplicated lines across backend +
frontend + tests, and — more importantly than the line count — at least
three confirmed instances where the duplication has already **drifted**
(the `text`-field gap in `tests/backend.mjs`'s `reqAs3`, the missing
`rules.*` entries described in §8.1, the re-declared `RULE_STATUSES`). Each
copy is a chance for the next edit to only touch one of N places.

---

## 3. Unused UI components

**None found.** Every one of the 18 `ops/ui/*.js` screen files is referenced
by exactly one `admin/*/index.html`, and every `admin/*` directory has a
matching nav entry in `shell.js` (checked both directions). Every non-admin
page-level component is reachable the same way. The closest thing to this
category is the *inverse* pattern in §1.2 — backend write-capability with no
UI ever built for it (service-workflow editing, admin global search) —
which is a gap, not an unused component.

---

## 4. Overly complex implementations to simplify

Genuine complexity findings were sparse — this codebase's dominant debt
shape is *duplication*, not *over-engineering*. Two minor items:

- `assets/js/ops/ui/bookings.js` has three different "loading button" idioms in one file: its own `actionForm()` helper (used 4×) plus a third, hand-rolled `onclick`/`disabled`-toggle pattern for the document approve/reject buttons with no spinner at all. Low priority — fold into `actionForm` (or a `busyButton` variant) if that block is touched again.
- Two differently-shaped functions share the name `notFoundState` — `components/states.js` (`{title,text,actions}`) and `ops/ui/shell.js` (`(backHref, backLabel)`). No active collision today (`shell.js` doesn't import the other one), but it's a footgun for the next person adding an ops screen who reaches for the wrong import. Cheap to defuse: rename `shell.js`'s to `notFoundBlock`.

---

## 5. Legacy code no longer needed

- **§1.6 above** — `offerTitle`, `priorityReason`, `resetJourney`: deferred once, still zero callers a stage later. Recommend forcing the decision now (use or delete) rather than deferring again by default.
- **4 superseded status-report PDFs** in `docs/`: `STATUS-REPORT-2026-09-16.pdf`, `PROJECT-REPORT-2026-09-16.pdf`, `STAGES-11-12-12.1-REPORT-2026-09-17.pdf`, `STAGE-15-STATUS-REPORT-2026-09-17.pdf`. The newest report (`FULL-PROJECT-REPORT-2026-09-18.pdf`, this session) explicitly consolidates all of their scope in its own commit message. **Not recommending deletion** — these are point-in-time stakeholder snapshots, and 3 of the 4 are still linked from `README.md`. **Recommend archiving instead**: move to `docs/archive/`, update the 3 README links, add a line noting the Sept-18 report supersedes them for current status. `STATUS-REPORT-2026-09-16.pdf` (narrowest scope, oldest) is the best candidate to archive first if you want to start conservative.
- **`README.md`'s doc table is stale**: it lists only the 3 pre-Stage-14 PDFs and omits `STAGE-15-STATUS-REPORT`, `FULL-PROJECT-REPORT-2026-09-18.pdf`, and every Stage 14/15/15A/15B/16 `.md` doc (`ADMIN-OPERATIONS-DASHBOARD.md`, `BUSINESS-RULES.md`, `PRODUCTION-INTEGRATION.md`, `STAGE-15B-VERIFICATION.md`). Pair this fix with the PDF archiving above.

---

## 6. Redundant database queries / API calls

### 6.1 — Every admin detail screen fetches the same entity twice on first paint
`assets/js/ops/ui/{customers,supervisors,bookings,services,business-rules}.js`
— each screen's outer `paint()` fetches the entity once to check
existence/not-found, then `view()` immediately refetches the *identical*
entity with no write in between. Confirmed by reading each file — no
mutation happens between the two `await opsData.X(id)` calls. This doubles
first-paint latency/API load on the 5 highest-traffic screens in the
dashboard.

**Fix:** pass the already-fetched value into the first `view()` call
instead of discarding it. Low risk — `view()` already re-fetches on every
subsequent `refresh()`, this only removes the redundant *first* call.

### 6.2 — `notificationHistory()` loads the entire `outbox` table into memory and filters in JS
`backend/staff.mjs:371-377` is the **only** list function in the file that
doesn't push its filters into SQL (compare §2.1's pattern, used everywhere
else). `customerId` trivially could be `WHERE customer_id = ?` — only the
`bookingId` filter genuinely needs JS (it's inside `payload_json`). As
`outbox` grows this becomes an unbounded full-table read on a page called
per booking/customer detail view.

**Fix:** `WHERE customer_id = ?` in SQL, keep the JS filter only for the
payload-embedded `bookingId`.

### 6.3 — Dashboard makes 3 round trips to compute counts a 4th, purpose-built endpoint already returns
`assets/js/ops/ui/dashboard.js` calls `opsData.tasks(...)`,
`opsData.escalations(...)`, and `opsData.bookings(...)` just to derive
`openTasks`/`openEscalations` counts — while the dead `opsData.overview()`
(§1.2) already returns a backend-computed summary with exactly those counts
plus more. This is the landing page every staff member sees on login.
**Not a pure win to "just call overview()"** — the dashboard also needs the
actual list *items* for its mini-lists, not just counts, so this is a
design decision (use `overview()` for counts + keep the list calls for
content, or accept the current 3-call shape) rather than a mechanical fix.

---

## 7. Files that appear abandoned or disconnected

**None found.** Every backend `.mjs` file is reachable from `server.mjs`'s
import graph or from `fixtures.mjs` (itself wired through `/__test/reset`).
Every frontend `.js` file in scope is referenced by basename from at least
one other file. All 19 `tests/*.mjs` suites are registered in
`tests/run.mjs`'s `SUITES` array (or, for `contract-server.mjs`, imported
as a shared helper). All 6 `tools/*.mjs` scripts are wired into either
`package.json` scripts or `tools/deploy.mjs`. Self-registering adapter
modules (`DEV_FLIGHTS`, `API_CUSTOMER`, `NOT_CONNECTED_*`, etc.) look dead
under a naive grep but are consumed via side-effect `import` in each
domain's `adapters/installed.js` — confirmed legitimate, flagging explicitly
so a future pass doesn't mistakenly "clean up" the pattern itself.

---

## 8. Opportunities to reduce technical debt

### 8.1 — Real functional bug, not just cleanup: Business Rules permissions can never be granted through the UI
`assets/js/ops/ui/staff.js:12`'s hand-maintained `OPS_PERMISSIONS` array (22
entries) **independently re-verified to be missing** `rules.view` and
`rules.manage` — the two Stage 15A permissions that gate the Business Rules
nav item (`shell.js:43`) and its `manage` actions. `dev-ops-data.js:81`
hand-appends both to the dev admin fixture separately, so the two lists have
already drifted once. Because `admin`-role staff bypass all permission
checks, this gap is invisible until someone actually tries to delegate
Business Rules access to a non-admin `ops`-role staffer through the Staff &
Permissions screen — at which point the checkboxes for those two
permissions simply don't exist to check.

**Fix:** add `'rules.view', 'rules.manage'` to `OPS_PERMISSIONS` (2-line
fix); better, source the list from the dead `opsData.meta()` (§1.2) so it
can't drift from the backend's own `PERMISSIONS` array again — this is
exactly the kind of case that dead method was probably built for.

### 8.2 — `dashboard.js` vs `overview()` (see §6.3) — a design decision worth making now rather than carrying two shapes indefinitely.

### 8.3 — i18n key-naming coupling across unrelated screens
`payments.js` and `documents.js` both reuse `ops.tasks.filterAll` (a key
semantically owned by the Tasks screen) for their own "All" filter option,
while `escalations.js` correctly defines its own. Harmless today (the
string is generic), but renaming/removing the Tasks screen's label would
silently break two unrelated screens. Fold into the §2.8 fix: introduce one
generic `ops.filter.all` key.

### 8.4 — Supervisors get no "password changed" notification (see §1.3)
Worth a one-line flag to product/eng — not this audit's call to resolve,
since it's a behavior gap, not dead code, but it was found while auditing
the unused `sid` binding and would otherwise go unnoticed.

---

## Priority-ranked action list

**Do first (small, zero/low-risk, real value):**
1. Fix `OPS_PERMISSIONS` (§8.1) — the one item that's a live bug, not just cleanup.
2. Delete the ~35 dead imports (§1.1) + `isAr`/`sid`/dead exports (§1.3) + 5 dead i18n key pairs (§1.4) + dead re-export line (§1.5).
3. Fix the double-fetch on 5 admin detail screens (§6.1) and `notificationHistory()`'s full-table scan (§6.2).
4. Swap the re-declared `RULE_STATUSES` for an import (§2.10) — closes a live drift risk.

**Do next (mechanical extraction, moderate line-count win):**
5. `db.mjs` helpers for §2.1 (`whereClause`) and §2.2 (`placeholders`) — the two biggest duplication clusters.
6. Promote `bookings.js`'s `actionForm()` to `shell.js` and reuse it for §2.6's ~11 copies.
7. `tests/env.mjs` helpers for §2.11/§2.12/§2.13 — pure test-harness risk, safe to do anytime.
8. Smaller `shell.js` helpers: §2.7 (debounce), §2.8 (status-filter select), §2.9 (empty-note).

**Product decisions needed before touching (do not delete unilaterally):**
9. §1.2's 4 backend-ready/UI-never-built methods (`search`, `overview`, `setServiceWorkflow`, `addServiceDocumentRequirement`) — build the UI or explicitly mark as intentionally deferred.
10. §1.6's 3 deferred exports (`offerTitle`, `priorityReason`, `resetJourney`) — use or delete, don't defer a third time.
11. §5's PDF archiving + README doc-table update.
12. §6.3's dashboard/`overview()` shape.

Nothing in categories 3 or 7 needs action — both came back clean, which is
worth knowing on its own.
