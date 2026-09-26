# Code Quality & Maintainability Review — 2026-09-25

**Scope:** the whole repository. That covers the public site (`assets/`, the
public pages), the customer booking and account flows, the supervisor and
operations portals, `backend/`, `tests/`, `tools/`, `docs/`, the root
configuration, and the new `templates/food-supplier/`. It follows the reviews
of 09-18, 09-20 and 09-21.

**Method:** four parallel audits, one per area. Every claim that something is
unused was checked with a search across the whole repository (excluding
`node_modules/` and `.git/`). The search included `tests/` and `tools/`, and
looked for indirect use: dynamic `import()`, class names and string keys built
from template literals, adapter registration, and mount functions called from
inline page scripts. Where a claim could not be proven, it says **probably**.
The top-priority items were checked again by hand before this document was
written. Items marked ✔ were confirmed that way.

**Only the template changed in this pass.** Everything outside
`templates/food-supplier/` is unchanged; this document records findings and a
plan. The template was cleaned in the same change that added its Arabic
version (see §9).

## Overall assessment

The structure is still sound:
- Every module is reachable, and every portal route has a page and a nav entry.
- No abandoned directories.
- One HTTP/CSRF wrapper on the front end, and `ar`/`en` string tables match
  1:1 (1,826 keys each).
- The only dependency (`playwright`) is used.

The debt falls into four groups:

1. **Real bugs and security gaps (§1).** Several are still hidden, either
   because no test covers the path or because demo data hasn't reached it
   yet. Fix these before any cleanup.
2. **Logic copied into three portals (§3).** This is where most removable code
   lives, and it is where most of the bugs came from. Lists copied by hand
   have drifted apart (permissions, CSRF cookie names, page lists).
3. **Leftovers from today's genericization (§5).** Orphaned airline images,
   price filter values still in SDG, a header height derived from the deleted
   logo, stale docs, and PDFs whose metadata still carries the old brand.
4. **Payload (§6).** Every public page loads the ops and supervisor adapters
   (about 65 KB) and the full string table for both languages.

Estimated removable code: about **1,000–1,300 lines** of duplicated or dead
code across the front end, backend and tests, plus about 1.8 MB of
superseded binaries (PDFs and images). None of it is needed for the site to
work.

---

## 1. Fix first — bugs and security (small, and they matter)

> **Phase 1 status (2026-09-25, later the same day): fixed** — 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 1.9, 1.10,
> 1.11 and 1.12, each with a test that fails without the fix (1.1 was confirmed that way: with the old
> `core/api.js`, the new supervisor write test gets a 403). 1.6 is Phase 3 and 1.13 needs a product decision.
> Notes on what changed beyond the table's "Action" column:
> - 1.1: `sessionFamily(path)` in `backend/http.mjs` and `csrfFamily(path)` in `assets/js/core/api.js` map
>   each route to its session the same way; `same()` now compares byte lengths, so a non-ASCII value can no
>   longer make `timingSafeEqual` throw.
> - 1.2: the Dockerfile sets `BACKEND_ENV=production`; `NODE_ENV=production` without `BACKEND_ENV` is
>   refused; staging requires `BACKEND_ALLOWED_ORIGINS`; `backend/.env.example` now names the code's real
>   default database path.
> - 1.3: besides adding `content.manage`, a save keeps any permission the screen doesn't list, failed
>   saves show an error, and `tests/ops-portal.mjs` asserts the UI list equals the backend's.
> - 1.12: a scan of every literal `t('…')` key and every `data-i18n*` attribute found no other missing key.

| # | Issue | Where | Impact | Risk of fix | Action |
|---|---|---|---|---|---|
| 1.1 ✔ | **The staff and supervisor portals can't make changes against the real backend.** The backend sets `no_ops_csrf` and `no_supervisor_csrf`, but `core/api.js` only ever reads `no_csrf`. On top of that, `server.mjs` checks the header against the *first* live session (customer before supervisor before staff), and compares it with `!==` (not timing-safe). | `assets/js/core/api.js:30`, `backend/http.mjs:26,30`, `backend/server.mjs:120-122` | Every staff and supervisor POST/PATCH (status changes, notes, lead updates, sign-out) would get a 403. The real-backend test suites only sign in and do GETs, so nothing catches it. | Low | The front end should read the cookie for the portal it runs in. The backend should pick the session by route family and compare with `same()`. Add a real-backend browser test that makes a change. |
| 1.2 ✔ | **The production Docker image runs in development mode.** The Dockerfile sets `NODE_ENV=production`, which nothing reads. `BACKEND_ENV` defaults to `development`. | `backend/Dockerfile:5`, `backend/config.mjs:15` | An unconfigured container echoes any origin for credentialed CORS, uses a signing secret that changes every run, and uses the dev payment provider, which marks bookings paid without charging. | None | Set `BACKEND_ENV=production` in the Dockerfile, or refuse to start when `NODE_ENV=production` and `BACKEND_ENV` is unset. Also require allowed origins in staging. |
| 1.3 ✔ | **The Staff screen removes `content.manage` on every save.** The UI's permission list has 24 entries and the backend's has 25. Saving sends only the ticked boxes, and there is no box for this one. A failed save is also swallowed (`catch {}`). | `assets/js/ops/ui/staff.js:12,45-47` vs `backend/staff.mjs:30-40` | Editing any staff member silently takes away their access to the content system. | None | Add the key. Better: have `GET /operations/meta` serve the list so it can't drift again. Show an error when a save fails. |
| 1.4 ✔ | **The ops and supervisor sign-in pages always ignore `?next=`.** The links pass a path that starts with `/`, but `safeNext` only accepts `admin/…` or `supervisor/…`. | `assets/js/ops/ui/auth-screens.js:21`, `supervisor/ui/auth-screens.js:22` | After a session expires, staff always land on the dashboard instead of the page they were on, including content preview links. | Low (keep the open-redirect guard) | Reuse the prefix-aware `safeNext` from `account/auth.js:108-115`. |
| 1.5 ✔ | **Staff and supervisor password-reset emails are never delivered.** `enqueue()` is called with no recipient and no `staffId`, so the mailer marks the message failed with `noRecipient`. | `backend/staff-routes.mjs:46`, `backend/supervisor-routes.mjs:38` | Staff and supervisors can't reset their own passwords. | Low | Pass `staffId: r.staff.id` and `recipient: r.supervisor.email`, as the staff invite already does (`staff.mjs:466`). |
| 1.6 | **The payment webhook isn't atomic.** The idempotency row is written *before* processing, and the paid branch runs 4 separate writes. | `backend/payments.mjs:90-126` | If anything throws partway through, the event is stuck as `received`, and the retry is dropped as a duplicate. The booking is then never marked paid. | Medium | Wrap the writes in `q.tx`, and treat an event still marked `received` as safe to reprocess. The same problem exists in `business-rules.mjs:58-70` and `staff.mjs:155-161`. |
| 1.7 | **The "operational requirements" field is thrown away.** The UI sends it, but `updateService` never writes it. | `assets/js/ops/ui/services.js:69-73`, `backend/staff.mjs:273-281` | Staff edits vanish without an error. | None | Save it, or remove the field. |
| 1.8 | **Email templates are HTML-escaped twice, then sent as plain text.** | `backend/staff.mjs:357-359`, `backend/mailer.mjs:41-44,192` | Recipients see `&amp;` and `&lt;`. | Low (update `tests/backend.mjs:983`) | For plain text, strip tags and don't encode entities. |
| 1.9 ✔ | **The offers price filter still uses SDG amounts.** The labels say "Up to 500 USD", but the values are `0-500000`, `500000-1500000` and `1500000-`. | `assets/js/components/offers.js:84-86` | Hidden today (no offer has a price). As soon as one does, the filter matches the wrong offers. | Low (update `tests/offers.mjs:115,214`) | Values `0-500`, `500-1500`, `1500-`, with the labels moved into i18n. |
| 1.10 | **The offers month filter is off by one month east of UTC.** It uses `toISOString()` on a local date. | `assets/js/components/offers.js:101` | Hidden today. In the target time zones (UTC+2 to +4), picking "October" filters September. | None | Build the value from `getFullYear()` and `getMonth()`. |
| 1.11 | **The search page's meta description uses the wrong string key** (`page.booking.description`). | `search/index.html:10` | The page gets the wrong description, and `page.search.description` is the only unused string key. | None | One-line fix. |
| 1.12 | **Two string keys don't exist, so the raw key is shown:** `nav.home` (the `??` fallback never runs, because `t()` returns the key rather than null) and `acct.field.email`. | `supervisor/ui/shell.js:51`, `ops/ui/settings.js` | The UI literally shows "nav.home". | None | Use existing keys. |
| 1.13 | **The payment step shows the development payment in every environment.** `DEV_PAYMENT` is registered with no environment check, unlike every other dev adapter. | `assets/js/booking/payment.js:16`, `booking/adapters/index.js:58-60` | Production shows "Development payment mode", and booking references contain `-DEV-`. | Needs a product decision | At least hide it when `isProduction()`. Decide what the production client-side payment step looks like. |

## 2. Dead code (verified unused; safe to delete)

> **Phase 2 status (2026-09-25): done.** Every row below except the backend routes (Phase 3) — each claim
> re-verified with a repo-wide search at the commit it was deleted from. Decisions and findings along the way:
> - **Missing assertions added:** supervisor B's booking list must not contain supervisor A's booking;
>   keyboard focus must reach the search form's submit button. Both pass.
> - **Adapter metadata:** the ops, supervisor and flights registries and their `window.no.*Installed`
>   globals are gone, as are `provider`/`configSource`/`capabilities` on every adapter object. The
>   account registry (`window.no.installed`) stays: `tests/integration.mjs` reads it. It keeps
>   `provider`/`configSource`/`status` for people inspecting a build, minus the stale `capabilities`.
> - **Design tokens:** only `--color-border-brand` and `--ease-in` were removed. The other eleven are steps
>   of documented scales (the red ramp, spacing, shadows, the four durations, the z-order ladder,
>   section and container sizes) and stay, per the rule in the table.
> - **Also removed as a result:** imports that only the deleted code used (`loadContext`,
>   `totalDuration`, `totalStops`, `getLocale` in two files), and the dev adapter's `acceptance`
>   branch that only `recordAcceptance` reached.
> - **§5 items done in the same pass:** `links.mjs` regex (it immediately found a real dead link,
>   `help/faq/`, now listed by its exact path as a planned route), README rewritten (accurate banner,
>   all 21 docs linked, Brand section points at `assets/brand/README.md`), the brand README's
>   re-branding claim corrected, `backend/README.md`, `CLEANUP.md`, `images.js`, `FOUNDATION.md`,
>   `STAGE-10-QA.md`, `COORDINATOR-ROLE-UPDATE.md`, `STAGE-16B-PAYMENT-INTEGRATION.md` and the audit tool
>   headers updated.
> - **PDFs:** the five dated reports were deleted, not archived. `docs/` is served by GitHub Pages, so
>   an archive folder would keep publishing the old brand. They remain in git history.
> - **Still open from §5** (not Phase 2): the header height from `--logo-size`, the Sudan/Egypt option
>   lists, deriving the brand name from one setting, the legacy admin route.

| Item | Where | Evidence | Removal impact | Risk |
|---|---|---|---|---|
| ✔ Orphaned airline images `sudanair`, `egyptair`, `tarco`, `badr` | `assets/images/providers/` | No references; dropped from `data/providers.js` in `861461c` | −70 KB | None |
| Dead exports, flagged by the last **four** reviews: `resetJourney`, `priorityReason`, `offerTitle`, `offersIn`, plus `isAr` in the supervisor shell | `booking/journey.js:40`, `booking/rank.js:75`, `booking/ui/shared.js:110`, `data/offers.js:130`, `supervisor/ui/shell.js:17` | Each name appears only at its own definition | ~30 lines | None |
| Unused imports: `icon` in 2 files, `publishStatusBadge`, `nights`, `qs` | `ops/ui/notifications.js:6`, `ops/ui/suppliers.js:7`, `ops/ui/publishing.js:11`, `preview/cards.js:12`, `components/newsletter.js:10` | Each name appears only on its import line | 5 lines | None |
| Front-end data methods with no callers: `customer.profile()`, `customer.recordAcceptance()`, `DEV_AUTH.customerOf` | `account/customer.js:48,59` and their adapters; `account/adapters/dev-auth.js:112` | No callers, including tests | ~60 lines | None |
| Backend routes with no caller at all: `GET /documents/requirements` and `GET /operations/tasks/:id` | `backend/server.mjs:236,245`, `staff-routes.mjs:76,85`, `staff.mjs:227,298` | No front end, test or tool uses them | ~25 lines | Low (check that no external client uses them) |
| Dead backend constants and helpers: `PAYMENT_STATUSES`, `PUBLISH_STATUSES`, `J` in `payments.mjs`, the `describeIntent` hook no provider implements | `payments.mjs:27,29,63`, `content.mjs:34` | No references | ~15 lines | None |
| Dead CSS left after the CTA-band removal: `.l-section--inverse`, `.u-numeral-watermark`, `.c-cta-band .c-signature`, `.l-cluster--24`, `.t-label`, `.t-brand` | `04-layout.css:86-90,112`, `10-motion.css:40-49,92-93`, `14-home.css:426`, `05-primitives.css:22,47` | No HTML or JS emits them | ~35 lines | Also drop the selector from `tests/detail.mjs:68` and `destinations.mjs:70` (that check currently passes on nothing) |
| Dead locals in tests: `writeFileSync`, `otherSession`, `stA`, `bogusSup`, `visible`, `inView` | `tests/backend.mjs:9,137,157,163`, `integration.mjs:63`, `services.mjs:22` | Each is assigned once and never read | ~6 lines | None |
| **Not dead, but a missing assertion:** `bk2` and `reachedSubmit` are computed and never asserted | `tests/backend.mjs:220`, `tests/home.mjs:226` | — | — | Add the assertion; don't delete |
| Unused adapter metadata: `window.no.opsInstalled`, `supervisorInstalled`, `flightsInstalled`, and every adapter's `capabilities`, `configSource` and `provider` fields | `*/adapters/installed.js` | Nothing reads them, and `OPS_INSTALLED.capabilities` is already out of date | ~30 lines | **Probably** unused; tools outside the repo can't be ruled out |
| Unused design tokens (13), e.g. `--space-80`, `--z-modal`, `--ease-in` | `assets/css/01-tokens.css` | No `var()` uses | 13 lines | Keep them if they are meant as documented scale steps |

## 3. Duplicate logic to consolidate

> **Phase 4 status (2026-09-26): done.** Four parallel branches, merged and verified together:
> - **Test infrastructure:** one `staticServer`, `MIME`, `stagingEnv` and `launch()` in `tests/env.mjs`;
>   `tools/lib/browser.mjs` for the image builders and audits. One page list, `tests/pages.mjs`, used by
>   links, i18n and a11y. It surfaced one real finding (headings skipping h1→h3 on `help/`, fixed with a
>   visually hidden h2). `npm run serve` serves the site as the suites expect; `audit:a11y` is renamed `audit`.
> - **Portals:** `core/portal-session.js`, `core/portal-auth-screens.js`, `core/portal-ui.js`,
>   `core/portal-form.js` and `core/adapter-helpers.js` replace the per-portal copies (sessions, sign-in
>   screens, shell helpers, form fields, status selects, list/query/paging helpers); `unreadCount` and
>   `PERIODS` are defined once. Ops amounts go through `money()`. The customer `payments()` O(n²) is fixed.
> - **Backend:** `backend/credentials.mjs` `makeCredentialStore()` is the single credential stack for all
>   three roles (each keeps its own tables, cookies, lockout keys and reset prefix); one `sessionCookies()`
>   helper; one sweep interval. The small helpers (`J`, `hex`, `SYSTEM_ACTOR`, `strArr`/`isSlug`/`imageJson`,
>   the "confirmed" rule check, `markRead`) are each defined once, and `/services` has one guard.
> - **Public components:** one `supportSection()`, `channelList()`, `detailSections()`, and collapse
>   helpers `setExpanded`/`bindCollapse` with one shared CSS rule set. The header placeholder is sized from
>   the real bar (`--header-row`), not the deleted logo, which removes the 4px layout shift. As a result,
>   booking pages from 64em up render the bar at 73px instead of 69px.
> - **Deliberately kept separate:** the account shell's own guard/mount/amount (it adds support entry,
>   sign-up and "(refunded)"), `session-api-auth.js` (sign-up and the customer shape), and the supervisor
>   settings forms.
> - **Still open:** `--header-height: 72px` in `01-tokens.css` (scroll margins and sticky offsets) no
>   longer matches the real header (69px on phones, 73px on desktop).

| Duplication | Copies | Lines saved | Risk | Plan |
|---|---|---|---|---|
| **Portal session and sign-in screens.** `ops/auth.js` and `supervisor/auth.js` differ only in names; the two `auth-screens.js` differ only in path prefix; same for `api-*-auth.js` and `not-connected.js`. | 3 portals | ~350 | Medium: storage keys, cookie names and return shapes must stay distinct | `createPortalSession({key, ErrorClass, entity})` and `createPortalAuthScreens({prefix, auth})`. This fixes 1.1 and 1.4 structurally. |
| **Portal shells.** `block`, `rows`, `pageTitle`, `metricCard`, `dataTable`, `loadRegion`, `guardState`, `errorState`, the not-found helper, and 3 money formatters (ops prints raw `${n} ${c}`). | 3 shells | ~250 | Low–medium: keep the `data-*` hooks the tests use | `core/portal-ui.js` parameterised by an i18n prefix; money formatting through `core/format.js`. |
| **Backend credential stack.** Verify, set and change password; create, live, end and sweep session; create and consume reset; `sessionAnswer`; cookie pairs; sweep intervals. | 3 roles | ~150 | Medium: keep the role boundary (tables, cookies, lockout keys); `tests/backend.mjs` covers isolation | `makeCredentialStore({...})`. |
| **Small backend helpers.** `J` ×8; random hex ×4 (already exported from `http.mjs`); `escapeHtml` ×2; `SYSTEM_ACTOR` ×2; `supervisorSlug` ×2 (the "circular import" comment is wrong); `strArr`, `isValidSlug`, `imageJson` ×2; the "confirmed" status logic ×3; a mark-read loop running up to 200 UPDATEs, ×2. | 2–8 each | ~60 | Low | Move them to `db.mjs` and `http.mjs`. |
| **Small front-end adapter helpers.** `list()` ×3, `q()` ×2, `paged()` ×2, `nPage` ×2. | 2–3 each | ~40 | Low | Move them to `core/api.js`. |
| **Test infrastructure.** 5 hand-written static servers, 4 MIME maps that disagree (none serve `.webp`), 3 copies of `envModule`/`STAGING`, and the `chromium.launch(...)` boilerplate in 22 files. | — | ~80 | Low | `staticServer({root, prefix, env})`, `MIME` and `launch()` in `tests/env.mjs`, plus a `tools/lib/browser.mjs` the image builders share. |
| **The public page list is written out 4 times and has drifted.** | `tests/run.mjs`, `tests/links.mjs`, `tools/a11y-audit.mjs`, `tools/i18n-audit.mjs` | ~30 | Low; expect **new findings** on pages that were never audited (i18n skips `help/` and `supervisors/`; links skips destination details, `supervisors/` and legal) | One `tests/pages.mjs`. |
| **Support section and channel list.** `supportSection()` ×3; the channel list ×2 | `destination-detail.js`, `service-detail.js`, `offers.js`; `help.js`, `supervisor.js` | ~60 | None | One component. |
| **Detail-page mount boilerplate** ×4, **collapse toggle** ×3 (JS and CSS), **form field and error rendering** ×4, **status select that reverts on failure** ×3 | various | ~120 | Low (watch how each builds `aria-describedby`) | Shared helpers. |
| Same data defined twice: `unreadCount`, `PERIODS`, and `dateTime` (without the `'—'` fallback in one shell) | account/supervisor | ~15 | None | Fold these in during the shell consolidation. |

## 4. Overly complex implementations

> **Phase 3 status (2026-09-25): done.** What changed:
> - **1.6, webhook atomicity:** every database write for a payment event runs in one `q.tx`, and the event
>   is marked processed only on commit. A row still at `received` is reprocessed on the provider's retry;
>   only processed or rejected events count as duplicates. `payment_events.payment_id` is now written. The
>   async flight-supplier call runs after the commit. The same treatment is applied to
>   `business-rules.mjs` (history row plus update) and `transitionBooking` (status, history, audit,
>   notification). `q.tx` now nests through savepoints.
> - **Pagination in SQL:** a new `pageQuery()` in `db.mjs` counts and slices in SQL, and all 17 list
>   read models use it (`paginate()` is gone). Notification history filters on the indexed
>   `outbox.booking_id`: `mailer.enqueue()` now fills it from the payload, and migration 010 backfilled
>   older rows.
> - **Indexes:** migration `010_indexes.sql` adds every index listed in §6.
> - **N+1 fixes:** `slugLookup()` in `identity.mjs` replaces the two duplicated `supervisorSlug` helpers.
>   It costs one query per distinct supervisor per response, not per row. Trip lists get their booking
>   ids in one query.
> - **Sessions:** only the route family's session is resolved (at most 1 session lookup per request,
>   down from 3), and `last_seen_at` is written at most once a minute.
> - **Supervisor revenue and performance** are summed in SQL. Revenue is grouped per currency
>   (`byCurrency`); the flat totals are null when currencies mix, never a mixed sum. The revenue screen,
>   the dashboard and the admin supervisor detail render per currency.
> - **Removed:** `GET /documents/requirements`, `GET /operations/tasks/:id`, and the legacy
>   `/admin/attribution/reassign` route together with `BACKEND_ADMIN_TOKEN` (now refused if set, so a
>   deployment learns it is gone). Its tests moved to the admin dashboard route.
> - **`migrate()` branches:** the always-true checks were removed.
> - **Not in Phase 3, still open:** the O(n²) `payments()` in `api-customer.js` (front end, Phase 4).

- **Lists are paginated in memory** (`backend/db.mjs:120-124`). The worst case
  is notification history, which reads the *whole* `outbox` table and
  `JSON.parse`s every row to filter by booking, even though an indexed
  `booking_id` column exists. Move filters, LIMIT/OFFSET and COUNT into SQL,
  starting with `notificationHistory` and `auditEvents`.
- **Supervisor revenue and performance totals** load every row and add them up
  in JS. `SUM` and `COUNT(CASE…)` would do. Revenue also adds amounts in
  different currencies together and labels the total with the first row's
  currency, which is a **correctness issue**.
- **`api-customer.js:47` `payments()`** is O(n²): it looks up each item again
  to recover data it already had.
- **Stage-era branches in `migrate()`** (`db.mjs:66-71,91`) test for columns
  and tables that earlier migrations in the same run always create.
- **Per-request session resolution** (`server.mjs:116-118`) runs up to 3
  session SELECTs, 3 `last_seen_at` UPDATEs and 3 user lookups on every
  request. Resolve only the session for the route family, which also fixes
  1.1, and throttle `last_seen_at` updates.

## 5. Legacy and stale content

| Item | Where | Action |
|---|---|---|
| The header height is still computed from the deleted logo (`--logo-size`). The placeholder is **probably** 4–12px taller than the real bar, which causes a layout shift. | `assets/css/12-header.css:12,93-94` | Base it on `--touch-target`; drop the logo comments. |
| **README.md contradicts the code.** The banner says "no Stage 14 admin dashboard exists" (flagged for the 4th time). The Brand section says "the official logo is installed". 14 docs aren't linked. | `README.md:2,55-68` | Rewrite the banner, point the Brand section at `assets/brand/README.md`, and regenerate the doc table. |
| The claim that re-branding means swapping `brand.name` is false. "Travel & Tourism" appears 148× in JS and 76× in page `<title>`/meta, and `LEGAL_NAME` duplicates it. | `assets/brand/README.md`, `data/footer.js:144`, `menus.js:200,204`, `data/home.js:28-36` | Interpolate `{brand}` inside `t()`, or at least correct the README. |
| Sudan/Egypt leftovers: visa nationality options (Sudan, Egypt, KSA only), the medical destination list with Egypt first, `+249` sample numbers, an "EGYPT" comment | `data/config.js:126-127,157`, `preview/samples.js:142,152`, `styleguide.html:311`, `index.html:77` | Make them neutral. (Keep `ar-EG` as the Intl locale: `ar-SA` switches to the Hijri calendar. Add a comment saying why.) |
| The `images.js` header points at a generator and manifest deleted in `7b52cc9` | `assets/js/data/images.js:1-12` | Rewrite the comment. |
| The legacy bearer-token admin route, which logs a fake `'admin'` actor | `backend/server.mjs:143`, `supervisor-routes.mjs:76-88` | Remove it once you've confirmed no external caller uses it. |
| `tests/links.mjs` treats pages that now exist as "planned routes", so a real 404 on `help/`, `supervisors/`, `destinations/<slug>/` or `legal/` **passes** | `tests/links.mjs:20` | Trim the regex. |
| **The dated PDF reports are superseded.** `FULL-PROJECT-REPORT-2026-09-18.pdf` metadata is titled with the **old client brand** ("Number One"), and all five predate the logo removal and country genericization (~1.7 MB). | `docs/*.pdf` | Delete them, or move them to `docs/archive/` and unlink them from README. |
| Stale docs and comments: `backend/README.md` (stage banner, 9 modules missing); `CLEANUP.md` ("thirteen suites", now 20); references to deleted `fetch-images.mjs`; tool headers ("Playwright is not a dependency"); `FOUNDATION.md` uses SDG as its currency example | several | Update in one docs pass. |
| **Correct an earlier review:** 09-21 #32 said the `BASE` environment variable was unused. It is read by both audit tools; deleting it would point them at `:8000` and break them. | — | Don't act on 09-21 #32. |

## 6. Redundant loading and API calls

- **Every public page loads the ops and supervisor adapter registries,**
  about 65 KB of dev data and auth modules, pulled in by top-level `await`
  (`assets/js/page.js:33,35`). No public component uses them. Import them from
  the portal shells instead. Risk: low to medium; re-run the two portal
  suites.
- **The full `ar` string table (132 KB) is loaded statically, and English
  visitors also get `en` (107 KB).** About 46% of the keys belong to the
  portals, the account area or sign-in, and 9 KB only to the styleguide.
  Split the tables by area. Risk: medium (`t()` silently returns the key), so
  gate it on the i18n audit.
- **`foundation.css` chains 26 `@import`s** (244 KB), about 45 KB of which is
  portal or booking CSS. The imports are discovered one round trip late.
  Have `build-routes.mjs` emit `<link>` tags, and scope the portal CSS to the
  portal pages. Keep the cascade layer order.
- **N+1 queries:** `nTrip` runs one bookings query per trip, and
  `supervisorSlug` runs one query per row. This affects `me.trips`,
  `me.bookings`, `me.documents`, `me.payments` and the admin customer list.
- **Missing indexes** for frequent WHERE clauses: `customers.attribution_supervisor`,
  `bookings.supervisor_id`, `ops_status` and `assigned_operator`,
  `documents.booking_id`, `payments.booking_id`, `outbox.customer_id` and
  `attribution_events.supervisor_id`. One additive migration (`010`). Very
  low risk.
- **Content publish counts are computed twice and capped at 100** (the
  dashboard and the Publishing Center). They undercount past 100. Add the
  counts to `/admin/overview`.
- The ops dashboard waits for the bookings list after the other 6 calls
  instead of in parallel with them. The supervisor notifications screen
  re-fetches the list that `markRead()` already returned. The services screen
  fetches two independent lists one after the other.

## 7. Disconnected features (need a product decision; don't delete)

- **The content system edits tables that no public page reads.** Public pages
  still read the static `data/destinations.js` and `data/offers.js`
  (deliberate since `6675e31`). "Publish" changes nothing visitors see.
- **Features that exist in only one layer:** service workflow and
  document-requirement editing (adapter only, no screen; `workflow.manage`
  gates nothing); supervisor `profile` and `commissions` (adapter only);
  `leads` (only created by fixtures); `commissions` (never written). Also:
  `supervisors.internal_id`, `customers.image` and `payment_events.payment_id`
  are never written, and `outbox.event_type` is never read.
- **No pagination UI.** Every ops and supervisor list stops silently at 50
  rows (audit at 100). The adapters already return `total` and `nextPage`.
- The homepage "help me choose" priority is stored but never used by results
  ranking, and `rank.js` has no `value` sort.
- `preview/cards.js` holds Stage-10 prototypes of cards the live site has
  since re-implemented. The styleguide therefore documents cards the site
  doesn't use. Point the styleguide at the real components, then delete the
  prototypes and their styleguide-only CSS (`.c-status`, `.c-assist*`,
  `.c-recommend`, …).
- The test reset (`fixtures.mjs wipe()`) doesn't clear `destinations`,
  `offers`, `payment_events` or the business config history, so state leaks
  between test runs.

## 8. Cleanup plan

Run `npm test` before and after each phase. Each phase is independent and
can be its own PR.

| Phase | Contents | Size | Risk |
|---|---|---|---|
| **1 — Bugs** | §1.1–1.5 and 1.7–1.12. Add a real-backend test that makes a change as staff and as a supervisor. | ~1 day | Low |
| **2 — Safe deletions** | Everything in §2 except the backend routes, and add the two missing assertions. Also the orphaned images, the stale docs and README (§5), the `links.mjs` regex, and archiving the PDFs. | ~½ day | None–low |
| **3 — Backend correctness** | §1.6 transactions, the index migration, N+1 fixes, pagination in SQL, per-route-family session resolution, and removing the two routes with no callers and the legacy admin route. | ~2 days | Medium |
| **4 — Consolidation** | The shared test infrastructure and page list first (it makes the rest safer). Then the portal session and sign-in factories, `core/portal-ui.js`, the backend credential store and helper modules, and the public-component duplicates. | ~3–4 days | Medium |
| **5 — Payload** | Portal adapters out of `page.js`, string tables split by area, `<link>` tags instead of `@import`. | ~1–2 days | Medium |
| **6 — Product decisions** | §1.13 production payment step, §7 content system wiring, pagination UI, workflow editing, leads and commissions. | — | — |

**Before any deletion,** check three things:
1. The repo-wide search is still empty at the commit you're deleting from.
   Several of these items have survived four reviews while code changed
   around them.
2. Nothing outside the repo calls a backend route you remove (the legacy
   admin token route, the two routes with no callers).
3. After any change to i18n or CSS loading, the i18n and a11y audits still
   report zero findings.

## 9. Status of earlier reviews

- **Fixed since 09-21:**
  - the admin token comparison (#1)
  - the ops dashboard undercount (#2, now uses `overview()`)
  - payment amount formatting (#3)
  - the CTA band duplicates (#6)
  - shared `SENSITIVE` diagnostics (#12)
  - destinations audits (09-20 #3)
  - the rate-limit bypass (09-20 #2)
  - the double detail-page fetch (09-18 §6.1)
  - the orphaned opsData methods (09-18 §1.2)
- **Still open and folded into this document:**
  - from 09-21: #4, #7–#11, #13–#21, #24–#29, #33–#37
  - from 09-20: #4–#12, #14–#16
  - from 09-18: service workflow editing
- **Food-supplier template (fixed today, in the Arabic-version commit):**
  - the WhatsApp order and contact email were double-encoded (literal `%0A`)
  - the modal quantity listener never fired (`'.quantity-input'` had a
    leading dot)
  - scroll and resize shared one debounce timer
  - the staggered entrance delays were reset by the `animation` shorthand
  - removed an IntersectionObserver lazy loader that only duplicated native
    `loading="lazy"`, dead variables and listeners, ~245 lines of CSS that
    matched nothing (including 10 unused or duplicate `@keyframes`), and a
    byte-identical `about.jpg`

  **Left in the template:** some selectors are defined in several blocks
  (`.section-header` ×3, focus styles ×2). Merging them changes which rule
  wins, so it needs a visual pass. The search overlay is a stub that only
  `alert()`s.
