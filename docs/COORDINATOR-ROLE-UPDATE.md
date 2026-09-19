# Coordinator Business-Role Update — Final Report

Update/correction task: the five existing public "supervisor" profiles are
**Number One Travel Coordinators** (منسقو رحلات) — customer-facing support
staff who help customers choose, book and follow up on their trips — not
platform administrators, independent agents, or supervisors with their own
dashboard. This was a customer-facing wording and presentation correction,
not a rebuild.

## 1. What was found in the previous implementation

- The five profiles, their public directory, and the booking-attribution
  mechanism already existed and worked correctly (built in the preceding
  Supervisor Profiles task — see `docs/SUPERVISOR-PROFILES.md`).
- Every customer-facing surface (public profile page, `/supervisors/`
  directory, booking summary/review, account page, SEO metadata) used the
  generic word "supervisor"/"مشرف", which reads as an internal role, not a
  customer-facing coordinator.
- No customer-facing surface exposed a Supervisor Dashboard, a login
  requirement, commission information, or any administrative
  functionality — the internal Supervisor Portal (Stage 13: login,
  dashboard, customer/booking management) is a separate, gated,
  staff-only system reachable only after authentication, with no public
  link into it from any of the five profiles, the directory, or the
  homepage. Nothing needed to be removed there.
- The homepage did not yet have a section introducing the five
  coordinators; they were reachable only via the `/supervisors/`
  directory (itself only reachable via direct link at the time).

## 2. What was UPDATED

- **Wording** — "مشرف"/"Supervisor" → "منسق"/"Coordinator" throughout
  every customer-facing surface: the public profile hero (brand line,
  fallback name, "verified" badge, CTA, section headers, empty/inactive/
  error states), the `/supervisors/` directory (hero, list heading, empty
  and final-CTA states), the booking summary and review screens, the
  account page's "your supervisor" section, and the homepage/`/supervisors/`
  SEO title and description. (`assets/js/core/strings/ar.js` /`en.js`,
  `assets/js/data/supervisors.js`, `tools/build-routes.mjs`.)
- **Default role title** on every profile changed from "مشرف سفر"/"Travel
  Supervisor" to "منسق رحلات"/"Travel Coordinator".
- **New homepage section** ("منسقو رحلتك" / "Your travel coordinators")
  between "How we help" and "Human support", showing the five active
  coordinators via the existing `supervisorCard()` component — the exact
  same card the `/supervisors/` directory already draws — with a link to
  the full directory. No new component, no new route.
- Left untouched, deliberately: the internal Supervisor Portal's own
  strings (`svp.*`, `page.supervisor.*`) and the admin Operations screens
  (`ops.supervisors.*`, `page.ops.*`) — those are staff/admin-facing
  tooling, not the five public coordinator identities, and are out of
  this correction's scope.

## 3. What was PRESERVED

- The two-store architecture (frontend `SUPERVISOR_REGISTRY` for public
  content, backend `supervisors` table for attribution/portal/admin) —
  unchanged, not merged, not duplicated.
- Every route: `/supervisor/<slug>/`, `/supervisors/`, the Supervisor
  Portal's own private routes.
- The attribution mechanism end to end (slug → real backend id → stored
  on the customer/booking) — no second mechanism introduced.
- The booking engine, customer account, admin dashboard, business rules
  register, and every other previously-verified system — untouched.
- All pre-existing automated tests (updated only where they asserted the
  literal old wording; the mechanics they verify are unchanged).

## 4. The five coordinator profile URLs

| Name (Ar/En) | Slug | Public URL |
|---|---|---|
| أحمد محمد / Ahmed Mohamed | `ahmed-mohamed` | `/supervisor/ahmed-mohamed/` |
| محمد عبدالله / Mohamed Abdullah | `mohamed-abdullah` | `/supervisor/mohamed-abdullah/` |
| سارة أحمد / Sara Ahmed | `sara-ahmed` | `/supervisor/sara-ahmed/` |
| عمر حسن / Omar Hassan | `omar-hassan` | `/supervisor/omar-hassan/` |
| مريم علي / Maryam Ali | `maryam-ali` | `/supervisor/maryam-ali/` |

Also public: the directory at `/supervisors/`, listing all five.

## 5. Coordinator attribution — PASS

Unchanged mechanism, re-verified after the wording change:
`tests/supervisor.mjs`'s attribution hand-off block confirms a customer
clicking through from a coordinator's profile carries that coordinator's
identity into `/book/`, through the booking context, into the review
summary, and persists across the session — all under the new wording
(`tests/backend.mjs` independently confirms the backend-side resolution
by slug). No duplicate attribution mechanism was introduced.

## 6. No Supervisor Dashboard / login required — PASS

Confirmed by direct inspection: none of the five public profile pages,
the `/supervisors/` directory, or the homepage's new coordinator section
link to, mention, or require the Supervisor Portal's sign-in page. The
portal remains a separate, staff-only, authenticated system; a customer
never needs to reach it to use a coordinator's profile or attribution.

## 7. Extensibility — PASS

The registry (`assets/js/data/supervisors.js`) and the admin edit screen
(`assets/js/ops/ui/supervisors.js`) both already support any number of
active coordinators — the homepage section and the directory both render
`SUPERVISOR_REGISTRY.filter(s => s.status === 'active')`, so adding a
sixth coordinator, deactivating one, or editing any field (name, photo,
phone, WhatsApp, email, bio, city, languages, specialties, title, slug)
requires no new page template, route, or component.

## 8. Test results

Full regression, one end-to-end run, all green:

```
final 96/96 · ghx 16/16 · ghm 42/42 · gfx 62/62 · home 170/170 ·
services 146/146 · detail 470/470 · destinations 165/165 · offers 170/170 ·
booking 236/236 · supervisor 216/216 · journey 512/512 · account 782/782 ·
integration 518/518 · backend 337/337 · supervisor-portal 505/505 ·
ops-portal 902/902 · rm 27/27 · links 0 problems ·
i18n 0 untranslated strings · a11y 0 unique findings
```

## 9. Remaining gaps (unchanged from the prior task)

Every name, phone, WhatsApp number and e-mail on the five records
remains fictional demo data, exactly as instructed. Real photographs are
still abstract SVG placeholders. The commission/rights business rule is
still `pending_business_configuration`. See `docs/SUPERVISOR-PROFILES.md`
§10 and the replacement procedure in its §2.
