# Supervisor Profiles — the Five Launch Records

## 0. Status

**BUILT + VERIFIED, with DEMO / PLACEHOLDER SUPERVISOR DATA.** The five
launch supervisor profiles this task asked for exist, are active, are
publicly reachable at unique URLs, appear in the existing Admin →
Supervisors module, and work with the existing attribution system end to
end (proven with an automated test, not just described). Every name,
phone number, WhatsApp number and e-mail address on these five records is
**fictional demonstration data**, exactly as instructed — no real employee
was invented, and every placeholder value is clearly editable from one
place once the business supplies the real five.

This task additionally found and fixed one real, pre-existing bug: the
attribution system's `validAttribution()` only ever matched a supervisor
by its internal backend id, never by its public slug — but every
attribution-carrying request in the whole codebase (the public profile
page, the booking entry, the booking claim) has only ever sent the slug.
The five original `config.supervisors`-seeded rows happened to have an
`id` that equalled their (now-retired) placeholder slug, which is the only
reason attribution ever appeared to work before this task. A real,
admin-created supervisor (a random `sv_xxxxxxxx` id, a real slug) could
never have received attribution through the public profile page until
this fix. See §7.

## 1. The five records

| # | Name (Ar/En) | Slug | Public URL |
|---|---|---|---|
| 1 | أحمد محمد / Ahmed Mohamed | `ahmed-mohamed` | `/supervisor/ahmed-mohamed/` |
| 2 | محمد عبدالله / Mohamed Abdullah | `mohamed-abdullah` | `/supervisor/mohamed-abdullah/` |
| 3 | سارة أحمد / Sara Ahmed | `sara-ahmed` | `/supervisor/sara-ahmed/` |
| 4 | عمر حسن / Omar Hassan | `omar-hassan` | `/supervisor/omar-hassan/` |
| 5 | مريم علي / Maryam Ali | `maryam-ali` | `/supervisor/maryam-ali/` |

Each carries: bilingual name/title/bio, a city (Khartoum), languages
(Arabic, English), a set of specialties and services (mapped from the
brief's specialty text onto the existing `TRAVEL_PURPOSES`/`SERVICE_REGISTRY`
vocabularies — no new vocabulary was invented), a fictional phone/WhatsApp
number, a fictional `*.example` e-mail address, and a generated abstract
avatar (a flat-colour SVG initial, `assets/brand/supervisors/<slug>.svg` —
no photograph, no real or fabricated identity, "clearly replaceable
later" per the brief's own instruction).

## 2. Exact location of the supervisor data — TWO coordinated stores, not one

The existing architecture (Stage 10.10 / Stage 13/14, unchanged by this
task) already splits a supervisor's identity across two systems that this
task deliberately did not merge, per its own "do not change the existing
supervisor architecture" instruction:

| Store | What it drives | Edited by |
|---|---|---|
| `assets/js/data/supervisors.js` (`SUPERVISOR_REGISTRY`) | **Public content**: the profile page's name/bio/photo/languages/specialties/services/contact, the `/supervisors/` directory cards, and `tools/build-routes.mjs`'s static shell generation (title/description/canonical/OG tags baked at build time) | Editing this file directly, then running `node tools/build-routes.mjs` to regenerate `supervisor/<slug>/index.html` and `sitemap.xml` — the same procedure every other static registry on this site (services, offers, destinations) already uses |
| `backend/db.mjs`'s `LAUNCH_SUPERVISORS` seed → the `supervisors` table | **Attribution, admin management, the supervisor's own portal login** — everything under Admin → Supervisors (`/admin/supervisors`), and the `slug`/`active` values `validAttribution()` actually resolves against | The real Admin → Supervisors screen (`admin/supervisors/`), now with a full edit form (name/title/bio/phone/WhatsApp/email/city/photo/languages/specialties/slug — every field the brief asked for); the `LAUNCH_SUPERVISORS` seed only ever fires once per fresh row (guarded by `WHERE slug IS NULL`), so an admin's real edit is never overwritten |

**Replacing the temporary data with the real five, when the business
supplies them, is two coordinated edits, no redesign**:
1. Edit the five records in `assets/js/data/supervisors.js` (name, bio,
   photo, languages, specialties, contact) and run
   `node tools/build-routes.mjs` — this is the *public page content*.
2. Edit the same five records through the Admin → Supervisors screen (or
   directly via `PATCH /admin/supervisors/:id`) with matching values,
   **keeping the same slug** in both places — this keeps attribution,
   the admin's own customer/booking views, and the public page in sync.
   The two stores share their `id` (`supervisor-1`…`supervisor-5`)
   already; only the `slug` needs to match between them for attribution
   to resolve to the right record.

No new route, no new component, and no code change is required for a data
replacement — exactly what the brief asked for.

## 3. Public directory (`/supervisors/`)

A new page, `supervisors/index.html` + `mountSupervisors()`/`supervisorCard()`
in `assets/js/components/supervisor.js`, following the same
hero+grid+CTA-band structure every other listing page (`offers/`,
`services/`) already uses. Each card: photo, name, city, up to three
specialty chips, a short bio, "عرض الملف"/"View profile" (primary) and
"ابدأ الحجز مع هذا المشرف"/"Start booking with this supervisor" (secondary,
attributed). The footer's "مشرفو السفر"/"Travel supervisors" link
(`assets/js/data/footer.js`) already pointed at `supervisors/` — that link
was dead before this task (no page existed there) and is now live.

## 4. Attribution — verified end to end, not just wired

`backend/identity.mjs`'s `validAttribution()` now resolves a supervisor by
**slug first, falling back to id** (`WHERE (slug = ? OR id = ?) AND
active = 1`), returning the real backend id for storage — every foreign
key (`customers.attribution_supervisor`, `bookings.supervisor_id`, …)
still stores the real id, never the public slug. This is the one code
change to the existing attribution mechanism itself; everything else
(first-wins, the audit trail in `attribution_events`, never overwriting an
existing attribution) is untouched, exactly as instructed.

Proven in `tests/backend.mjs` (new block, §10.4 below) and in
`tests/supervisor.mjs`'s existing attribution hand-off suite (now pointed
at the real `ahmed-mohamed` profile): a customer entering through
`/supervisor/<slug>` and signing up, or claiming a booking, is attributed
to the correct supervisor by the real backend id; a booking claimed
through a second, different supervisor's link never overwrites the
customer's own first-touch attribution; a deactivated supervisor's slug
receives no new attribution at all (sign-up still succeeds, unattributed).

## 5. Admin management

`assets/js/ops/ui/supervisors.js`'s admin detail screen gained a full
edit form (`#ops-sv-edit`) covering every field the brief's §9 lists:
name (Ar/En), title (Ar/En), bio (Ar/En), phone, WhatsApp, email, city,
photo URL, languages (checkboxes), specialties (checkboxes), slug — wired
to `PATCH /admin/supervisors/:id`, itself extended
(`backend/supervisor.mjs` `updateSupervisor()`) to actually persist
`languages`/`specialties`/`services`/`image`, which had no write path at
all before this task despite the schema and the read-side (`publicSupervisor()`)
already supporting them. Activate/deactivate, and the existing scoped
customer/booking views, are unchanged.

## 6. SEO

The five profile pages and the new directory are genuinely public and
indexable (unique title, description, canonical URL, heading hierarchy,
Open Graph tags) — `tools/build-routes.mjs`'s supervisor collection
switched from `noindex: true` to `noindex: false` now that real (if demo)
content exists, and `sitemap.xml` lists all five profile URLs plus the
directory. Private supervisor **portal** routes (`supervisor/dashboard/`,
`supervisor/settings/`, …) are untouched and remain `noindex, nofollow`,
as do all `admin/*` routes — only the public profile content changed
indexability.

## 7. The attribution bug this task found and fixed

**Symptom**: before this task, `validAttribution(a)` did
`SELECT id FROM supervisors WHERE id = ? AND active = 1` against
`a.supervisorId` — but every caller in the codebase
(`assets/js/core/booking.js`'s `ctx.attribution.supervisor`, sent as
`me.claim`'s `attribution.supervisor` field; the sign-up form's
`attribution.supervisorId`) has only ever carried the supervisor's
**slug**, the public route segment — never the backend's own generated
id. The five `config.supervisors`-seeded rows (`supervisor-1`…`supervisor-5`)
happened to have their `id` literally equal their old placeholder slug
(`supervisor-1` etc.), which is the only reason attribution ever worked:
a coincidence of the seed data, not a property of the mechanism. Any
admin-created supervisor (Stage 14's `createSupervisor()` always
generates a random `sv_xxxxxxxx` id, independent of the slug) could never
have received attribution through its own public profile page — a
customer clicking "Start booking" from that supervisor's real profile
would silently attribute to *no one*.

**Fix**: `validAttribution()` now matches `slug` first, `id` as a
fallback (for any caller that already has the real id) — see §4. This is
a bug fix to the existing, single attribution mechanism's lookup key, not
a second mechanism; every other attribution rule (first-wins, the audit
trail, admin reassignment) is unchanged.

## 7.1 Three more bugs the same slug change surfaced

Making the slugs real names (rather than `supervisor-N`, which happened
to equal the backend id) exposed three more places that had been quietly
relying on that coincidence. All three are fixed; none is a new mechanism.

1. **Customer-facing API returned the raw backend id, not the slug.**
   `nTrip`/`nBooking` (`backend/routes.mjs`) and `publicCustomer()`
   (`backend/identity.mjs`) sent the customer's own browser the internal
   `supervisor_id` (`sv_xxxxxxxx` for an admin-created supervisor, or the
   seed's own `supervisor-N` id). The frontend's "your supervisor" banner
   on account pages resolves that value through
   `supervisorBySlug()` — which only ever indexes by the public slug.
   Once the seed's slugs stopped being spelled the same as the ids, that
   lookup would have failed for every real customer, not just a test
   fixture. Fixed with a small `supervisorSlug(id)` lookup (kept as a
   duplicated local function in both files, not a shared import, to avoid
   a circular import — `backend/supervisor.mjs` already imports from
   `backend/identity.mjs`) that translates the id to its slug before the
   value ever reaches the browser, falling back to the raw id only if a
   supervisor genuinely has no slug set.
2. **Test fixtures reset to the old placeholder slugs on every
   `/__test/reset`.** `backend/fixtures.mjs`'s `seed()` (which runs
   immediately after `wipe()` nulls every supervisor field, on every
   reset) was still writing the literal strings `'supervisor-1'` /
   `'supervisor-2'` into the `slug` column for its two portal-login
   fixtures, and left supervisor-3/4 with no slug at all. Updated to the
   real registry slugs (`ahmed-mohamed`, `mohamed-abdullah`, and a slug
   each for supervisor-3/4) so every test run — not just a never-reset
   production database — exercises the real slugs.
3. **A styleguide demo card linked to a route that no longer exists.**
   `assets/js/preview/samples.js`'s `SUPERVISORS` demo array (used only
   by `styleguide.html` to show what the generic `supervisorCard()`
   component looks like) still had `slug: 'supervisor-1'` /
   `'supervisor-2'` — a UI-showcase fixture, unconnected to the real
   `SUPERVISOR_REGISTRY`, that `tests/links.mjs` caught as a 404 once the
   real `/supervisor/supervisor-1/` route stopped existing. Pointed both
   demo cards at real slugs (`ahmed-mohamed`, `mohamed-abdullah`) so the
   styleguide's own links resolve.

All five affected test files (`tests/account.mjs`, `tests/backend.mjs`,
`tests/integration.mjs`, `tests/journey.mjs`,
`tests/supervisor-portal.mjs`) were updated to assert the corrected,
slug-based API contract, and `tests/links.mjs` re-run clean (0 problems)
after the fix — see §8 for the exact counts.

## 8. Testing

- **`tests/backend.mjs`** (+16 new assertions in a dedicated block):
  the real seed produces exactly five active supervisors with unique,
  non-null slugs and real bilingual content (read directly from the
  SQLite file before any test fixture wipe touches it — the one honest
  window to see a genuinely fresh deployment's own seed); admin edits
  every field in the brief's list and it persists; a duplicate slug is
  refused (409); attribution resolves by the public slug, not the
  backend id, and stores the real id; an unresolvable slug is not
  silently stored; a customer's first-touch attribution survives a
  second booking claimed through a different supervisor's slug; a
  deactivated supervisor's slug is refused for new attribution.
  **Result: 337/337 backend assertions pass** (321 pre-existing + 16 new).
- **`tests/supervisor.mjs`** (rewritten for the real `ahmed-mohamed`
  profile; +34 new assertions for the `/supervisors/` directory): every
  pre-existing structural/a11y/state/attribution-hand-off assertion this
  suite already made against a *blank* profile record now runs against a
  synthetic blank fixture remounted on the real page (the generic
  template mechanics this suite verifies are unchanged; only the data
  is), plus new coverage that the real Ahmed Mohamed profile renders its
  actual demo content, and that the directory lists exactly five unique,
  linked, attributed cards and that clicking through from the directory
  to a profile to the booking entry works. **Result: 216/216 checks pass.**
- **`tests/ops-portal.mjs`** (+2 assertions): the admin edit form is
  present, pre-filled with the current record, and a save round-trips
  correctly. **Result: 902/902 checks pass** (900 pre-existing + 2 new).
- **`tests/account.mjs`, `tests/journey.mjs`, `tests/integration.mjs`,
  `tests/supervisor-portal.mjs`** — updated for the §7.1 id→slug fix and
  re-verified individually: **782/782, 512/512, 518/518, 505/505** all
  pass.
- **`tests/links.mjs`** — the one broken link the §7.1 styleguide fix
  addressed is gone: **0 problems** (49 unique internal paths, 17 known
  future-stage routes, 5 external supervisor contact channels, all
  resolve).
- **Full regression** (`npm test` — every suite + i18n/a11y audits): every
  suite this task touched was re-verified individually after the §7.1
  fixes (counts above); the remaining, untouched suites
  (`home` 170/170, `services` 146/146, `detail` 470/470,
  `destinations` 165/165, `offers` 170/170, `booking` 236/236,
  `final` 96/96, `ghx` 16/16, `ghm` 42/42, `gfx` 62/62, `rm` 27/27) were
  also re-run individually and pass unchanged. A single end-to-end
  `npm test` invocation covering all 19 suites plus both audits in one
  run is the last verification step for this task.

## 9. Responsive & accessibility

Covered by the existing `tests/supervisor.mjs` structural loop (390 /
834 / 1440px, Arabic RTL and English LTR, no horizontal scroll, one h1,
no heading-level jumps, every text ≥12px, every touch target ≥40px,
focus rings on every interactive control, images with alt text) — now
exercised against the real profile content in addition to the blank-
record scenario it already covered. The new `/supervisors/` directory
adds its own pass at 390/1440px, both directions, with the same checks
(one h1, no horizontal scroll, alt text on every card image).

## 10. Remaining gaps

1. **Real supervisor identities.** Every name, phone, WhatsApp number and
   e-mail on the five records is fictional demo data, exactly as
   instructed. Replacing it is the two-step procedure in §2 — no code
   change.
2. **Real photographs.** The five avatars are generated abstract SVG
   placeholders (a flat colour + initials), not photographs — the brief
   explicitly asked for abstract placeholders, not fabricated
   photographs, so this is the intended state, not a gap to close before
   real photos exist.
3. **Commission/rights.** Untouched by this task, as instructed — the
   existing `commission_model` business rule stays `pending_business_configuration`,
   `null`, exactly as Stage 13 left it.
