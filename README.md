# Travel & Tourism — Website Foundation
## السفر والسياحة

A bilingual (Arabic RTL / English) travel-agency site with its booking engine,
customer account, supervisor portal, operations and admin portal (Stage 14,
`admin/`), and a Node backend. Everything is built and verified locally —
`npm test` runs every browser suite plus the language and accessibility
audits. **Not deployed, and no external provider (payments, flight supplier,
e-mail) is connected**: [`docs/PRODUCTION-INTEGRATION.md`](docs/PRODUCTION-INTEGRATION.md)
lists exactly what each one still needs.

### Foundation and public site

| | |
| --- | --- |
| [`docs/FOUNDATION.md`](docs/FOUNDATION.md) | Stage 10.1 — tokens, components, i18n, accessibility rules every page follows |
| [`docs/STAGES.md`](docs/STAGES.md) | Stages 10.2–12 — header, footer, homepage, services, destinations, offers, booking entry, supervisor profile; §11 booking engine, §12 customer account |
| [`docs/STAGE-10-QA.md`](docs/STAGE-10-QA.md) | Stage 10.12 final QA |
| [`docs/SUPERVISOR-PROFILES.md`](docs/SUPERVISOR-PROFILES.md) | The five public coordinator profiles (demo data) |
| [`docs/COORDINATOR-ROLE-UPDATE.md`](docs/COORDINATOR-ROLE-UPDATE.md) | "Supervisors" are customer-facing Travel Coordinators — the role correction |
| `styleguide.html` | Living style guide — every token, component and state, in RTL and LTR |
| [`assets/brand/README.md`](assets/brand/README.md) | Brand assets (logo-free) and the colour rules |
| [`assets/images/CREDITS.md`](assets/images/CREDITS.md) | Photography; `assets/js/data/images.js` maps each slot to its file |

### Portals, backend and integration

| | |
| --- | --- |
| [`docs/SUPERVISOR-SYSTEM.md`](docs/SUPERVISOR-SYSTEM.md) | Stage 13 — supervisor accounts, portal, server-side attribution; `tests/supervisor-portal.mjs` |
| [`docs/ADMIN-OPERATIONS-DASHBOARD.md`](docs/ADMIN-OPERATIONS-DASHBOARD.md) | Stage 14 — the admin dashboard (`admin/`) |
| [`docs/STAGE-15-OPERATIONS-CONTROL.md`](docs/STAGE-15-OPERATIONS-CONTROL.md) | Stage 15 — booking lifecycle, tasks, escalations, documents, suppliers, notifications, audit; `tests/ops-portal.mjs` |
| [`docs/BUSINESS-RULES.md`](docs/BUSINESS-RULES.md), [`docs/STAGE-15B-VERIFICATION.md`](docs/STAGE-15B-VERIFICATION.md) | Stage 15A/15B — the business rules register and its verification |
| [`backend/README.md`](backend/README.md) | The backend (Node 22, SQLite, no dependencies); `npm run test:backend`, `npm run deploy` (gated) |
| [`docs/INTEGRATION.md`](docs/INTEGRATION.md) | Stage 12.1 — backend contract, environment variables (`.env.example`, `tools/write-env.mjs`) |
| [`docs/PRODUCTION-INTEGRATION.md`](docs/PRODUCTION-INTEGRATION.md) | Stage 16 overview — what is connected (nothing yet) and what each provider needs |
| [`docs/STAGE-16A-INFRASTRUCTURE.md`](docs/STAGE-16A-INFRASTRUCTURE.md) · [`16B`](docs/STAGE-16B-PAYMENT-INTEGRATION.md) · [`16C`](docs/STAGE-16C-FLIGHT-SUPPLIER-INTEGRATION.md) · [`16D`](docs/STAGE-16D-NOTIFICATIONS-LEGAL-STAFF.md) | Hosting, payments, flight supplier, notifications/legal/staff provisioning |

### Code quality and history

| | |
| --- | --- |
| [`docs/CODE-QUALITY-REVIEW-2026-09-25.md`](docs/CODE-QUALITY-REVIEW-2026-09-25.md) | Latest whole-repository review and its phased cleanup plan (earlier reviews: [09-18](docs/CODE-QUALITY-REVIEW-2026-09-18.md), [09-20](docs/CODE-QUALITY-REVIEW-2026-09-20.md), [09-21](docs/CODE-QUALITY-REVIEW-2026-09-21.md)) |
| [`docs/CLEANUP.md`](docs/CLEANUP.md) | The first code-quality cleanup — what was removed, merged and split |
| [`docs/EGYPT-LAUNCH-POSITIONING.md`](docs/EGYPT-LAUNCH-POSITIONING.md) | Superseded; historical record of the Sudan/Egypt positioning later genericized |

### Separate template

| | |
| --- | --- |
| [`templates/food-supplier/`](templates/food-supplier/README.md) | A single-page demo for a rice/foodstuff supplier in English and Arabic (RTL, `ar/`): no logo, no country, USD prices, placeholder contacts; images from `tools/build-food-supplier-images.mjs`; `tests/food-supplier.mjs` |

The dated PDF status reports (09-16 to 09-18) were removed on 2026-09-25: they
predated the logo removal and the country genericization. They remain in git
history (`git show 1bd3171:docs/<name>.pdf`).

## Run it

No build step. It must be served over **`http://`, not `file://`** — the icon
sprite is fetched at runtime. `npm ci` once (Playwright, for the tests), then:

```bash
npm run serve    # the site at http://localhost:8919/mashhor-demo/, as GitHub Pages serves it
npm test         # every browser suite, then the language and accessibility audits (~40 min)
npm run audit    # only the two audits
```

Before a page ships, it must be fully translated in both locales
(`docs/FOUNDATION.md` §5): `npm run audit` must end with
`TOTAL untranslated strings: 0` and `0 unique findings`. The list of pages the
link check and both audits visit lives in one place, `tests/pages.mjs`.

## Use it in a page

Stylesheets are plain `<link>` tags, one per file in `assets/css/`, written into
each page by `node tools/css-links.mjs` from the list in
`tools/lib/stylesheets.mjs`: put `<!-- stylesheets -->` in a new page's `<head>` and
run it (`npm test` fails if a page is out of date). The
staff-portal sheets go only to pages whose script loads `assets/js/ops/ui/` or
`assets/js/supervisor/ui/`. Strings for the two portals and the styleguide are
separate slices (`assets/js/core/strings/{ar,en}-*.js`) that the area's entry
module registers with `registerStrings()`, so public pages never download them.

```html
<html lang="ar" dir="rtl">
<!-- stylesheets -->
<script type="module">
  import { boot } from './assets/js/foundation.js';
  boot({ sprite: 'assets/icons/sprite.svg' });
</script>
```

## Brand

The site ships with no logo: the name is plain text, and the colours and
their contrast rules are documented in [`assets/brand/README.md`](assets/brand/README.md).
