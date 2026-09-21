# Code Quality & Maintainability Review — 2026-09-21

Scope: entire repository (frontend `assets/js`/`assets/css`, `backend/`,
`tests/`, `tools/`, docs, config). Read-only review — no code was changed as
part of this document. Follows on from `docs/CODE-QUALITY-REVIEW-2026-09-18.md`
and `docs/CODE-QUALITY-REVIEW-2026-09-20.md` (the latter's items 1-3 were
fixed and pushed as `7b52cc9`; items 4+ were deliberately left for a future
pass). This review covers the day of feature work since (the hero
image/focal-point/text-safe-area system, and the new homepage "journey
band" bridging Services and Team) via five parallel scoped audits (marketing
frontend + CSS, customer booking/account flows, supervisor + ops portals,
backend, tests/tools/docs), each independently verifying every finding with
repo-wide greps rather than trusting a scoped search.

**Overall assessment: still unusually clean for its size**, and the
09-20 review's structural read holds: no exported UI component is fully
dead, route↔screen wiring is 1:1, no scratch/debug cruft. The debt that
remains is concentrated in the same shape it was two reviews ago —
**duplication that earlier consolidation passes reached in one portal but
never extended to its siblings** — plus a few new findings this pass
turned up for the first time: **one real security inconsistency**, **one
functional dashboard bug**, and **two more docs going stale** (including the
same top-level `README.md` banner flagged in the 09-20 review and still not
fixed).

---

## Do these first (small, safe, real problems)

### 1. Non-constant-time comparison on the admin bearer token
**File:** `backend/supervisor-routes.mjs:79-80` (`admin.reassign`).

```js
const given = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
if (given.length !== config.adminToken.length || given !== config.adminToken) { ... }
```

Every other secret comparison in this backend (`storage.mjs verifySignature`,
`identity.mjs same()`, `payments.mjs verifySignature`) uses
`timingSafeEqual` specifically to avoid timing side-channels. This one —
gating a real privileged action (reassigning a customer's supervisor
attribution) — is the one exception, using plain `!==`.

- **Impact:** low likelihood in practice (needs network-timing precision
  against one low-traffic endpoint) but it's a real, cheap-to-fix
  inconsistency in an otherwise timing-safe codebase.
- **Risk:** none — swap-in fix, no behavior change for legitimate callers.
- **Fix:** `timingSafeEqual(Buffer.from(given), Buffer.from(config.adminToken))`
  with the length check first, matching the pattern already used everywhere
  else in this file's siblings.

### 2. Ops dashboard undercounts open tasks/escalations past 5 items
**File:** `assets/js/ops/ui/dashboard.js:40-41`, vs. the unused
`opsData.overview()` at `assets/js/ops/data.js:92`.

The dashboard's "Today" metric cards are built from three separate list
calls (`opsData.tasks`, `opsData.escalations`, `opsData.bookings`), each
capped at `pageSize: 5` — so the moment a staff member has more than 5 open
tasks or escalations, the dashboard's own count badges under-report. A
`GET /admin/overview` backend route already exists, is fully implemented in
both adapters (`api-ops-data.js`, `dev-ops-data.js`), and returns correct
aggregate counts (`customers`, `newCustomers7d`, `bookingsUnpaid`,
`documentsPending`, `suppliersNotConnected`, etc.) in one request — it's
simply never called from `data.js`'s facade (see item 12 below).

- **Impact:** a genuine, currently-shipping UI bug once any ops queue grows
  past 5 items — not hypothetical.
- **Risk:** low — swapping the count source doesn't change the list/table
  views below the cards, only the summary numbers.
- **Fix:** call `opsData.overview()` for the metric cards; keep the
  paginated list calls for the queue tables underneath.

### 3. Payment/refund amount formatting is inconsistent across 3 screens, and the shared helper that would fix it is unused
**Files:** `assets/js/account/ui/payments.js:19`,
`assets/js/account/ui/bookings.js:50`, `assets/js/account/ui/trips.js:74`,
vs. `assets/js/account/ui/shell.js:139` (`export const amount = ...`).

`shell.js` already defines an `amount(n, currency)` helper that formats a
possibly-negative payment amount with a `(refunded)` suffix — and it has
zero importers anywhere. Meanwhile the three screens that display a
payment amount each hand-roll it differently: `payments.js` prefixes a
minus-sign glyph with no "refunded" text; `bookings.js`/`trips.js` instead
append a separate status badge (`· Refunded`/etc.) with no sign at all. A
customer can see the same payment shown two different ways depending on
which screen they're on.

- **Impact:** 3 files, small diff each; a real (if minor) UX inconsistency.
- **Risk:** low — pure display formatting, no data change.
- **Fix:** pick one presentation (the `shell.js` helper's "(refunded)"
  suffix, or the status-badge style — whichever matches current design
  intent) and use `amount()` from `shell.js` in all three screens.

---

## Structural cleanup (duplication a prior pass didn't reach)

The 09-20 review's headline finding was that an ops-portal consolidation
pass (shared `actionForm`, `debouncedRun`, `statusFilterSelect`,
`emptyNote` helpers in `ops/ui/shell.js`) never got extended to
`supervisor/` or `account/`. That's still true, and this pass found the
same shape one layer deeper — the *next* pattern after the ones already
fixed was left unconsolidated, in the same files, by the same gap:

### 4. Session-management logic duplicated ~80 lines across (at least) 2, more likely 3, portals
**Files:** `assets/js/ops/auth.js:23-85`, `assets/js/supervisor/auth.js:23-82`
(and per the ops/supervisor auditor, `assets/js/account/auth.js` looks like
a third near-identical copy, though that file itself was out of that
agent's scope to line-cite).

`XAuthError` class, provider registry, localStorage key read/write, session
restore with refresh-window logic, sign-in/out, password reset/change — the
same ~80-line shape three times, differing only in entity name and storage
key.

- **Impact:** ~160+ duplicated lines across the two confirmed files (more
  if account/auth.js is the same shape).
- **Risk:** low-to-moderate — the three portals deliberately use separate
  storage keys/cookies; any shared factory must keep those distinct, and
  callers of `restoreOpsSession`/`restoreSupervisorSession` in each
  `ui/shell.js` need to still get the same return shape back.
- **Fix:** extract `createPortalSession({ storageKey, ErrorClass, entityKey })`
  into a shared module; each portal's `auth.js` becomes a ~15-line wrapper
  (provider registry + factory call + any portal-specific extra like
  `hasOpsPermission`).

### 5. List+detail(`?id=`) screen boilerplate repeated across 7 ops/supervisor screens
**Files:** ops — `bookings.js`, `business-rules.js`, `customers.js`,
`services.js`, `supervisors.js` (all under `assets/js/ops/ui/`); supervisor —
`customers.js`, `bookings.js` (under `assets/js/supervisor/ui/`).

Every one repeats: `params.get('id')` branching to a detail mount, a
`notFoundBlock`/`notFoundState` on a miss, an identical "back to list" link,
and (in the 5 ops screens) an identical `refresh`/`preloaded` re-fetch
wrapper.

- **Impact:** ~80-100 lines of identical wiring across 7 files.
- **Risk:** low — pure refactor; each screen's own field/permission
  rendering stays screen-owned, only the list/detail wrapper moves.
- **Fix:** add `mountDetailScreen({ id, head, fetch, notFoundHref,
  notFoundLabel, renderView })` to `ops/ui/shell.js` (and an equivalent for
  supervisor's read-only case); screens supply only `fetch` and
  `renderView`.

### 6. Four `ctaBand()` builders duplicated across the marketing detail pages
**Files:** `assets/js/components/destination-detail.js:152-164`,
`assets/js/components/service-detail.js:210-222`,
`assets/js/components/supervisor.js:174-185`,
`assets/js/components/offers.js:371-383`.

Identical DOM shape (title/text stack + two-button actions row), differing
only in i18n keys and which `*Action(record)` helper supplies the hrefs.

- **Impact:** ~50 duplicated lines across 4 files.
- **Risk:** none — pure presentational builders, no state.
- **Fix:** one `ctaBand({ titleKey, textKey, primary, secondary })` in
  `components/ui.js` alongside `sectionHead`; each page passes its own copy.

### 7. `supportSection()` duplicated byte-for-byte in 3 files
**Files:** `assets/js/components/service-detail.js:199-208`,
`assets/js/components/destination-detail.js:141-150`,
`assets/js/components/offers.js:361-370`.

Identical function body, identical i18n keys, identical
`supportPanels(undefined, liveChannels())` call.

- **Impact:** 30 duplicated lines, 3 files.
- **Risk:** none.
- **Fix:** hoist to one shared export, delete the two extra copies.

### 8. Field-renderer / error-marking logic duplicated four ways
**Files:** `assets/js/account/ui/auth-screens.js:27-52` (the working,
already-reused original — `settings.js` imports it as-is) vs. independent
reimplementations in `assets/js/account/ui/travellers.js:15-31`,
`assets/js/booking/ui/travellers.js:19-29,65-72`, and an inline closure in
`assets/js/account/ui/documents.js:95`.

Four implementations of "render a labelled field with help/error slot" and
"toggle its error state," one of which is already proven reusable.

- **Impact:** ~60 lines across 3 files could shrink to imports.
- **Risk:** low but not zero — the variants differ subtly in how they
  compose `aria-describedby` (auth-screens.js appends to existing values,
  the others overwrite); diff each screen's exact aria wiring before
  consolidating, don't just copy the signature over.
- **Fix:** move a single parameterized `field()`/`setError()`/`applyErrors()`
  set into a shared module (extend to support `type: 'select'`, which two
  of the four variants need), have all four call sites import it.

### 9. Status-`<select>` "toast + revert-on-failure" idiom repeated 4 times, sibling pattern left unconsolidated
**Files:** `assets/js/ops/ui/tasks.js:17-22`,
`assets/js/ops/ui/escalations.js:19-21`,
`assets/js/supervisor/ui/leads.js:16-23`.

The same disable/try/toast/revert-on-failure shape the earlier cleanup pass
already promoted for buttons (`busyButton` in `ops/ui/shell.js`), but never
built the `<select>`-based twin for.

- **Impact:** small in isolation (~3 lines × 4 occurrences) but a direct,
  visible gap in an otherwise-consolidated shared shell.
- **Risk:** low.
- **Fix:** add a `statusUpdateSelect(current, statuses, prefix, onChange)`
  helper to `ops/ui/shell.js` mirroring `busyButton`'s contract.

### 10. The "detail page shell" mount pattern repeated 4x (lower priority — trickier extraction)
**Files:** `mountDestinationDetail`, `mountServiceDetail`,
`mountOfferDetail`, and `supervisor.js`'s section handling.

Each hand-rolls an identical `show(name, content)` closure (mount → find
body attr → toggle `hidden`) plus a `sections.forEach(reset)` loop. The
skeleton/region wiring genuinely differs per page and shouldn't be forced
together, but the `show()` closure itself is a pure, mechanical duplicate.

- **Impact:** ~60 lines of identical control flow across 4 files.
- **Risk:** low for the `show()` extraction specifically; not urgent enough
  to justify touching all 4 files on its own — bundle with the next time
  one of them is edited anyway.
- **Fix:** extract `sectionToggler(mount, bodyAttr)` into `ui.js`/`states.js`.

### 11. Three test files reimplement the shared Playwright-context helper — a regression of an already-fixed issue
**Files:** `tests/home.mjs:5-20` (today's file — the newest in the repo),
`tests/destinations.mjs:6-23`, `tests/offers.mjs:6-23`, vs.
`tests/env.mjs:18-28`'s `makeCtx`, which `account.mjs`, `journey.mjs`,
`ops-portal.mjs`, and `supervisor-portal.mjs` already use correctly.

The 09-18 review already flagged and fixed this exact duplication for four
other suites; these three reintroduced it afterward (two on 09-20, one —
`home.mjs` — today).

- **Impact:** ~15-20 duplicated lines × 3 files; any future change to
  `makeCtx`'s error-capture behavior silently won't reach these three.
- **Risk:** low — `makeCtx(w, h, locale)` returns the same `{c, p}` shape;
  the only real gap is these three switch locale *after* page load and add
  a `requestfailed` listener `makeCtx` lacks, both trivially preserved by
  calling `ctx()` with no locale arg and adding the extra pieces after.
- **Fix:** replace each local `open()` with `makeCtx(b, errs)` + the
  existing post-load locale switch.

---

## Backend query/architecture notes

### 12. Diagnostics endpoint re-implements the logger's sensitive-field scrubber, with drift
**Files:** `backend/routes.mjs:230-234` vs. `backend/logger.mjs:2-11`
(`scrub`).

The diagnostics endpoint's own allowlist regex is missing several keys the
shared `scrub()` already filters (`authorization`, `cvv`, `iban`, `address`,
`dob`, `birth`, `body`, `html`) — a client-supplied diagnostics payload with
a key like `address` or `dob` is stored verbatim (truncated to 120 chars)
where the rest of the codebase's convention would scrub it.

- **Impact:** minor data-hygiene gap; two independently-maintained
  "sensitive key" lists will keep drifting apart.
- **Risk:** low — swap to the shared function, adjust for diagnostics'
  extra length/type checks.
- **Fix:** call `scrub()` from `logger.mjs` instead of the local regex.

### 13. Inconsistent pagination — one SQL-paginated endpoint vs. everything else in-memory
**Files:** `backend/db.mjs:120-124` (`paginate()`, in-memory) vs.
`backend/routes.mjs:200-209` (`me.payments`, real SQL `LIMIT`/`OFFSET` —
the one exception).

Every other paginated list (`staff.mjs`, `supervisor.mjs`) loads the entire
filtered result set and slices it in JS. Worst case:
`notificationHistory` (`staff.mjs:377-379`) loads the **entire `outbox`
table** into memory when no `customerId` filter is given, just to return
page 1.

- **Impact:** fine at current scale; becomes a real cost as `audit_events`,
  `outbox`, `payments`, `bookings` grow — every list screen pays O(table
  size) per page request, not O(page size).
- **Risk:** low — the underlying queries are already parameterized; adding
  `LIMIT`/`OFFSET` is additive.
- **Fix:** push `LIMIT`/`OFFSET` into the SQL for tables likely to grow
  (`audit_events`, `outbox`, `payments`, `bookings`), or document the
  in-memory choice so it isn't "fixed" inconsistently later.

### 14. Minor N+1 missed by the earlier N+1 cleanup pass
**File:** `backend/routes.mjs:25`, used by `me.trips()` at `routes.mjs:104`.

`nTrip()` issues one extra `bookings` query per trip row — the exact
pattern already fixed elsewhere in this same file (see the "was an N+1 on
this list screen" comments at `routes.mjs:182-187`, `:204-206`,
`staff.mjs:176-179`, `supervisor.mjs:142-144,169-172`) — just missed here.

- **Impact:** low (a customer typically has few trips) but same bug class
  as everywhere else already fixed, worth the same batched-`IN(...)`
  treatment for consistency.
- **Risk:** low.
- **Fix:** batch the bookings lookup across all trip ids in one query.

### 15. Repeated auth guard in the `/services/*` route block (cosmetic)
**File:** `backend/server.mjs:168-174`.

Seven consecutive routes each repeat
`if (!ctx.staffSession) return fail(res, 401, 'unauthenticated');` inline,
where the `/admin/*` and `/operations|/bookings|/...` blocks immediately
below use the cleaner "guard once at the top of the `startsWith` block"
pattern.

- **Impact:** cosmetic only — correct everywhere, just copy-pasted.
- **Fix:** wrap the block in `if (path.startsWith('/services'))` and guard
  once.

---

## Dead code — safe, low-risk deletions

Each of these was verified with a repo-wide grep (not just the file's own
directory) before being listed — none of them are used anywhere else in the
codebase.

| # | What | Where | Notes |
|---|------|-------|-------|
| 16 | `offersIn` export | `assets/js/data/offers.js:130` | Its only caller (`data/navigation.js`) was already removed; the export itself was never deleted. |
| 17 | `nights` import | `assets/js/preview/cards.js:12` | Never called in the file. |
| 18 | `qs` import | `assets/js/components/newsletter.js:10` | Never used in `newsletterCard()`. |
| 19 | `compact` variable | `assets/js/components/footer.js:198` | Computed, never read; `full` is what actually drives the logic below it. |
| 20 | `.t-label`, `.t-brand` CSS classes | `assets/css/05-primitives.css:22,47` | Only two orphans out of ~693 classes checked; everything else that looked unreferenced turned out to be built via template-literal class names with a live call site. |
| 21 | `nFlightBooking` export keyword | `backend/flights.mjs:161-162` | Used only internally in the same file — drop `export`, keep the `const`. |
| 22 | `isAr` export | `assets/js/supervisor/ui/shell.js:17` | The identical helper in `booking/ui/shared.js` and `account/ui/shell.js` is genuinely used by siblings; this portal's copy has zero importers, even internally. |
| 23 | `resetJourney`, `priorityReason`, `offerTitle` | `assets/js/booking/journey.js:40`, `assets/js/booking/rank.js:75`, `assets/js/booking/ui/shared.js:110` | Flagged by both the 09-18 and (two of three of them) 09-20 reviews already, still present and still dead. |
| 24 | `DEV_AUTH.customerOf` | `assets/js/account/adapters/dev-auth.js:112` | Not part of the documented auth-provider contract, not in `not-connected.js`'s method list, zero callers. |

**Fix for all of the above:** delete. Before deleting #23 specifically,
note this is the *third* review to flag the same three names — worth just
doing it this time rather than re-flagging in a fourth review.

---

## Product-decision items (implemented, unused — decide keep-and-wire-up vs. delete)

These aren't simple dead-code deletions: the code is fully implemented end
to end (facade + both adapters, in some cases backend routes with their own
integration tests) but has no UI path calling it. Each is either a feature
that was scoped out after the plumbing was built, or a feature that's
missing its last mile of UI. Worth a product call before touching either
side.

### 25. Four ops data-facade + adapter methods never called by any screen
**File:** `assets/js/ops/data.js:76,78,92,93`
(`setServiceWorkflow`, `addServiceDocumentRequirement`, `overview`,
`search`), backed by full implementations in both
`ops/adapters/api-ops-data.js` and `ops/adapters/dev-ops-data.js`.

`overview` is the fix for item 2 above (dashboard undercount) — that one
should almost certainly be wired up, not deleted. `search` looks like it
was meant to back a global admin search box that was never built.
`setServiceWorkflow`/`addServiceDocumentRequirement` have no corresponding
edit UI in `services.js`, which only ever *reads* workflow steps/document
requirements.

- **Recommendation:** wire up `overview` (fixes item 2); for the other
  three, confirm with whoever owns the admin UI roadmap whether
  workflow-step editing, document-requirement editing, and global search
  were deferred or abandoned before deleting ~45 lines of otherwise-working
  code.

### 26. Two supervisor-portal facade methods never called
**File:** `assets/js/supervisor/data.js:43,53` (`profile`, `commissions`).

`profile()` looks genuinely redundant — `settings.js` already has the same
data from the session-restore object. `commissions()` has a real backing
shape (`commission { id, bookingId, amount, currency, status, period,
createdAt }` documented at `data.js:17`) and `revenue.js` only shows a
single status line, never an itemized list — this looks like a "commission
history" screen was planned but never built.

- **Recommendation:** delete `profile`; decide on `commissions` based on
  whether an itemized commission-history view on `revenue.js` is still
  wanted.

### 27. Legacy bearer-token admin route, superseded by a permission-checked replacement
**File:** `backend/server.mjs:137`, `backend/supervisor-routes.mjs:76-88`
(`POST /admin/attribution/reassign`).

Predates the Stage 14 admin dashboard; explicitly commented as kept "for
compatibility." The dashboard's actual reassign flow goes through
`POST /admin/customers/:id/reassign` (a properly permission-checked route,
confirmed as the one the frontend calls). Disabled by default
(`BACKEND_ADMIN_TOKEN` unset ⇒ 404), so low risk either way, but it's extra
attack surface (compounded by item 1) with, as far as this repo can tell,
no current caller.

- **Recommendation:** confirm no external tooling outside this repo still
  depends on the bearer-token route before retiring it; fix item 1 in the
  meantime regardless.

### 28. Backend routes with no frontend caller — built, tested, unreachable from any screen
**Files:** `POST /admin/rules/:id/activate` /
`POST /admin/rules/:id/disable` (`backend/staff-routes.mjs:154-155`),
`POST /admin/staff/:id/role` (`:148`), `GET /operations/meta` (`:54`),
`GET /documents/requirements` (`:84`, the cross-service aggregate, distinct
from the per-service endpoint that *is* used).

All four are exercised by `tests/backend.mjs` but have no corresponding
adapter method or UI screen in `assets/js/ops/**`. Not "dead code" in the
backend's own terms — genuinely working, tested capabilities — just
unreachable from the product today.

- **Recommendation:** flag to whoever owns the ops/admin frontend roadmap;
  business-rule activation/disable and staff role changes in particular
  sound like real gaps in the admin UI, not things to delete.

---

## Nav/permission consistency gap (ops portal)

### 29. `audit` nav entry has no client-side permission gate; `workflow.manage` permission gates nothing
**Files:** `assets/js/ops/ui/shell.js:40` (the `audit` `NAV` entry — the
only one of nine without a `permission:` field),
`assets/js/ops/ui/audit.js:1-2,16-27` (comment says "Gated on
audit.view," code never checks it), `assets/js/ops/ui/staff.js:12`
(`workflow.manage` is grantable but no screen anywhere calls
`can('workflow.manage')`, ties to item 25's missing workflow-edit UI).

Every other permission-gated nav entry filters correctly for staff lacking
the grant; "Audit trail" is shown to everyone regardless, contradicting its
own file's comment. The backend still enforces the real boundary (a 403 on
click), so this is a UX/consistency gap, not a security hole.

- **Impact:** small — one missing field.
- **Risk:** none.
- **Fix:** add `permission: 'audit.view'` to the nav entry; either remove
  `workflow.manage` from the grantable list or build the workflow-edit UI
  it's meant to gate (see item 25).

---

## Test suite structure (lower priority, informational)

### 30. `tests/backend.mjs` has grown to 1,132 lines / 341 assertions covering nearly every backend stage
One file now exercises config, CORS, auth, CSRF, documents, and every
backend stage from 13 through 16D. By far the largest file in `tests/`
(next largest, `integration.mjs`, is 348 lines).

- **Why it's this size on purpose:** it deliberately starts **one** backend
  process, with tightened rate-limit/lockout thresholds specific to this
  suite, and reuses it across all sections — the 09-18 review already
  noted this and said keep it that way rather than force it into the
  shared `startEphemeralBackend` shape, which uses different defaults.
- **If ever split:** group by boundaries that don't need a fresh backend
  per group (e.g. security/auth/CSRF/documents, supervisor+ops+admin
  stages, payments+flights+notifications integrations), each importing one
  shared parameterized backend-start helper — not one file per stage
  number, which would multiply backend startups.
- **Recommendation:** leave as-is unless it becomes a real review/CI pain
  point; not a correctness issue today.

### 31. Pervasive unexplained `waitForTimeout` magic numbers
Worst in `tests/supervisor.mjs` (23 occurrences), `tests/destinations.mjs`
(21), `tests/ghx.mjs` (20, a sequence of 350/300/250/250/200/250/200/300ms
waits on one dropdown with no explanation for why each differs). A
suite-wide convention, not a single-file bug — contributes to occasional
flakiness and cargo-culted "right" values.

- **Recommendation:** at minimum, one shared `TRANSITION_MS` constant in
  `tests/env.mjs` for the common "let a CSS transition finish" wait; true
  fixes should move to `waitForFunction`/auto-waiting locators case by
  case (not a safe blanket find/replace — needs verifying against real
  `transition-duration` values).

### 32. Unused `BASE` env var — 16 of 24 test files hardcode the path prefix separately instead
**File:** `tests/run.mjs:31` computes `BASE` for child suites; grepping
`process.env.BASE` across `tests/*.mjs` returns zero matches. Suites
instead independently concatenate the literal `/mashhor-demo/` prefix.

- **Impact:** a repo/Pages-path rename would require editing 16 files
  instead of the one `PREFIX` constant `run.mjs` already centralizes.
- **Risk:** none for the navigation-URL-building occurrences (`home.mjs`,
  `rm.mjs`, `links.mjs`, `destinations.mjs`, `offers.mjs`); don't conflate
  with the separate, legitimate use of the same literal in
  href/canonical-assertion strings elsewhere (`detail.mjs`, `booking.mjs`,
  `services.mjs`, etc.) — those are checking real output, not building a
  request URL, and shouldn't be collapsed into this fix.
- **Fix:** either delete the unused `BASE` computation, or have the five
  navigation-building suites read `process.env.BASE` (falling back to a
  local default when run standalone, the way `TEST_ORIGIN` already does).

---

## Documentation staleness

### 33. Three docs still instruct readers to run a deleted tool
**Files:** `docs/CLEANUP.md:37`, `docs/FOUNDATION.md:474-475`,
`docs/STAGE-10-QA.md:93-94`.

Commit `7b52cc9` deleted `tools/fetch-images.mjs` and
`tools/images.manifest.json` and updated `README.md`/`CREDITS.md` to
match, per its own commit message — but missed these three, which still
name the deleted tool/manifest as live instructions.

- **Fix:** strike the `fetch-images.mjs`/`images.manifest.json` mentions
  in all three, consistent with the already-updated files.

### 34. `backend/README.md` — stale stage banner and file list
**File:** `backend/README.md:1,48-50`.

Title still says "Stages 12.2–13"; the file list names 12 files where 19
exist today — missing `business-rules.mjs`, `flights.mjs`, `payments.mjs`,
`staff.mjs`, `staff-routes.mjs`, `supervisor.mjs`, `supervisor-routes.mjs`.
This is the first doc a new backend contributor reads; it currently hides
roughly two-thirds of the backend's actual surface area.

- **Fix:** update the file list and stage range, or point to the per-stage
  docs already in `docs/` instead of hand-maintaining a list that drifts.

### 35. Root `README.md` — stale "PARTIALLY COMPLETE" banner, now flagged for a third time
**File:** `README.md:2,8-25`.

Banner still reads "Stage 15 — PARTIALLY COMPLETE ... no Stage 14 admin
dashboard exists," and the doc table is missing ~10 docs that exist in
`docs/` today (admin operations, business rules, coordinator role, Egypt
launch positioning, production integration, both prior code-quality
reviews, and several Stage 16 sub-reports). **The 09-20 review already
flagged this exact gap**, noting it was *already* a deferred item from the
09-18 review at that point — it is unchanged one day and one commit
(`7b52cc9`, which touched `README.md` for an unrelated line) later.

- **Impact:** medium-high — this is the repository's front door, actively
  telling readers a system doesn't exist when `admin/` and its supporting
  docs are fully in the tree.
- **Fix:** regenerate the banner and doc table from the current `docs/`
  listing. Given this is now a repeat finding across three reviews, worth
  prioritizing over most of the other documentation items above.

### 36. `docs/CLEANUP.md` undercounts the test suite
**File:** `docs/CLEANUP.md:19` — says "thirteen browser suites (1,900
checks)"; `tests/run.mjs`'s `SUITES` array lists 19 today. Stage-10-era
figure never updated as Stages 11-16 added suites.

- **Fix:** update the count, or note the figure is as-of Stage 10 and point
  to `tests/run.mjs`'s `SUITES` array length for the current count.

### 37. Stale comment describing a not-yet-built detail page that has since been built
**File:** `assets/js/data/destinations.js:131-136`
(`destinationEntry()`'s doc comment).

Says the destination detail page "is a later stage" — it has since shipped
and is live. The function's behavior is still correct (it's deliberately
the flights-booking shortcut, not the detail-page link), only the comment
misleads a future reader.

- **Fix:** update the comment to note the detail page now exists and this
  helper is specifically the booking shortcut, not a link to it.

---

## Minor / cosmetic (skip unless touching these files anyway)

- **`notFoundState` reused across 4 different signatures.**
  `assets/js/components/states.js:160` (`{title, text, actions}`) vs.
  `assets/js/account/ui/shell.js:109` and
  `assets/js/supervisor/ui/shell.js:66` (both `(backHref, backLabel)`,
  identical to each other). The 09-18 review already flagged the ops
  portal's own third shape and recommended renaming it; not acted on, and
  the app has since grown a fourth copy (account's). No active collision
  today since each module imports its own — a live footgun for the next
  copy-paste. **Fix:** rename the two positional-arg shells to
  `notFoundBlock` for clarity, or add a one-line comment on the
  `components/states.js` version noting the name is reused elsewhere with
  a different signature.
- **`PERIODS` array duplicated once.** Identical in
  `assets/js/supervisor/ui/revenue.js:10` and
  `assets/js/supervisor/ui/performance.js:9` — one line, could move to
  `shell.js`.
- **`errorText` export in `ops/ui/shell.js:70` is only used internally**
  in the same file (unlike the supervisor shell's genuinely-external one)
  — misleading `export` keyword, harmless.
- **`breakdown()` computed twice in `assets/js/booking/ui/review.js:82-85`**
  to get two different totals from the same pure function — not a
  performance issue (no API call), just reads as accidental duplication;
  not worth a standalone fix.
- **Blank-line gaps in `assets/js/components/cards.js:66-71,198-200`**
  suggest code was deleted without cleaning up surrounding whitespace — no
  functional impact.
- **No prepared-statement caching in `backend/db.mjs`'s `q` helpers.**
  Every query re-`prepare()`s from scratch. Negligible at current traffic;
  flagged only because it's the one place a global, near-zero-risk perf
  win exists if this ever matters.

---

## Checked and confirmed clean

- **All 7 backend migrations** (`001`–`007`) — no superseded or dead
  migrations; every added column/table is read/written by current code.
- **`backend/data/**`** — the local `test.sqlite`(+wal/shm) and sample
  PDFs there are git-ignored, not committed; local scratch state only.
- **Unused UI components** — every exported page-level builder across
  `components/`, `booking/ui/`, `account/ui/`, `supervisor/ui/`,
  `ops/ui/` is mounted from at least one real HTML entry point (hand-authored
  or generated via `tools/build-routes.mjs`). None found orphaned.
- **Abandoned/disconnected files** — none found; every file in the audited
  scopes is imported and reachable from a real entry point.
- **CSS class sweep** — of ~693 selectors checked, only the two listed in
  item 20 were genuinely unreferenced; everything else that looked
  suspicious (`c-badge--error`, `c-icon--xs`, `c-toast--*`,
  `c-svp-metric--*`) turned out to be built via template-literal class
  names with a confirmed live call site.
- **Adapter registry pattern** (`export const X = register*(...)` in every
  `DEV_*`/`API_*` adapter file) — looks like "only 1 reference" under a
  naive grep, but the side effect (registering into the dev/production
  selection registry via import in `installed.js`) is exactly how this
  codebase's dual-adapter architecture works. Correctly wired, not dead.
- **`components/search.js`'s field-builder system** — looks elaborate but
  is genuinely data-driven and reused across 9 search verticals plus the
  destinations filter form; not over-engineering.
- **`tests/integration.mjs`'s own near-duplicate of `makeCtx`** — already
  identified and accepted as an intentional exception in the 09-18 review
  (needs an `origin` param, different timeout, a fault-injection-aware
  console filter); confirmed still justified, not new debt.
- **No commented-out code, `TODO`/`FIXME`/`XXX` markers, or genuinely
  unused imports** found anywhere in `assets/js/booking/**`,
  `assets/js/account/**`, `assets/js/ops/**`, or `assets/js/supervisor/**`.

---

## Suggested order of work

1. **Item 1** (timing-safe token comparison) — security, five-minute fix.
2. **Item 2** (`opsData.overview()` wiring) — fixes a real, currently-live
   dashboard bug, and resolves half of item 25 as a side effect.
3. **Item 3** (payment amount formatting) — small, visible inconsistency.
4. **Items 16-24** (the nine safe dead-code deletions) — batch these
   together, they're all independent one-line-to-few-line removals.
5. **Item 35** (root README banner) — third time flagged; do it this time.
6. **Items 4, 5, 6, 7, 8, 9** (the structural duplication) — pick one
   portal/pattern at a time; each is independent of the others.
7. **Items 12, 13, 14, 15** (backend query/architecture) — bundle with
   any future work that already touches those files, except item 13's
   `notificationHistory` case, which is worth doing proactively since it's
   the one genuinely bad-at-scale query found.
8. **Items 25-28** (product-decision items) — raise with whoever owns the
   admin/ops and supervisor roadmaps before touching either side; item 2
   already answers the `overview()` half of item 25.
9. **Item 29** (audit nav permission gate) — small, safe, do alongside
   item 25/28's admin-UI decisions.
10. **Items 11, 30-32** (test suite) — item 11 (the `makeCtx` regression)
    is worth fixing promptly since it's the exact same problem being
    reintroduced a third time; 30-32 are lower priority.
11. **Items 33-34, 36-37** (remaining doc staleness) — low urgency, batch
    whenever docs are next touched.
12. **Minor/cosmetic section** — opportunistic only, no dedicated pass
    needed.
