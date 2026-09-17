# Number One Travel & Tourism — Website Foundation
## نمبرون للسفر و السياحة · Stage 10 — COMPLETE / BUILT + VERIFIED (10.1–10.12) · Stage 11 — BUILT + VERIFIED · Stage 12 — BUILT + VERIFIED · Stage 12.1 — PARTIALLY COMPLETE · Stage 12.2 — PARTIALLY COMPLETE · Stage 13 — PARTIALLY COMPLETE (supervisor system implemented and verified locally; nothing external connected)

The master visual, UX and frontend foundation. Every later website stage
inherits it.

| | |
| --- | --- |
| **Full documentation** | [`docs/FOUNDATION.md`](docs/FOUNDATION.md) — Stage 10.1 foundation |
| **Stages 10.2 – 10.11** | [`docs/STAGES.md`](docs/STAGES.md) — header & navigation, footer, homepage, services, service details, destinations, offers, booking entry, supervisor profile, refinement |
| **Stage 13 — supervisor system** | [`docs/SUPERVISOR-SYSTEM.md`](docs/SUPERVISOR-SYSTEM.md) — supervisor accounts, portal (dashboard, customers, leads, bookings, revenue, performance, notifications, settings), server-side attribution with an audit trail, commission architecture, reassignment prepared for Stage 14; `tests/supervisor-portal.mjs` |
| **Stage 12.2 — real backend** | [`backend/`](backend/README.md) — the deployable customer backend (Node 22, SQLite, no dependencies): sessions, CSRF, CORS, boundary, private storage + signed URLs, payments, notifications, legal seam, rate limits; `npm run test:backend` runs the browser suite against it, `npm run deploy` is the gated deployment; **not deployed, nothing external connected** — [`docs/INTEGRATION.md`](docs/INTEGRATION.md) §13 lists the inputs |
| **Stage 12.1 — integrations** | [`docs/INTEGRATION.md`](docs/INTEGRATION.md) — backend contract, environment variables (`.env.example`, `tools/write-env.mjs`), production adapters verified against `tests/contract-server.mjs` and the real backend |
| **Stage 12 — customer account** | [`docs/STAGES.md` §12](docs/STAGES.md#12--customer-account) — sign in / sign up / recovery on a labelled development identity adapter, dashboard, trips, trip details, bookings, travellers, documents, payments, notifications, support, settings; `tests/account.mjs` |
| **Stage 11 — booking engine** | [`docs/STAGES.md` §11](docs/STAGES.md#11--booking-experience--booking-engine) — search → results → compare → details → travellers → extras → review → payment → confirmation on a clearly labelled development adapter; `tests/journey.mjs` |
| **Code-quality cleanup** | [`docs/CLEANUP.md`](docs/CLEANUP.md) — what was removed, merged and split; `npm test` |
| **Stage 10 final QA** | [`docs/STAGE-10-QA.md`](docs/STAGE-10-QA.md) — Stage 10.12 · **STAGE 10 — COMPLETE / BUILT + VERIFIED** |
| **Photography** | `tools/images.manifest.json` + `node tools/fetch-images.mjs` → `assets/images/`, `assets/images/CREDITS.md` |
| **Living style guide** | `styleguide.html` — every token, component and state, in RTL and LTR |
| **Homepage** | `index.html` — the production homepage (Stage 10.4) |
| **Brand assets** | [`assets/brand/README.md`](assets/brand/README.md) |
| **Stages 11–12.1 report (PDF)** | [`docs/STAGES-11-12-12.1-REPORT-2026-09-17.pdf`](docs/STAGES-11-12-12.1-REPORT-2026-09-17.pdf) — booking engine, customer account and production integrations: built, verified, findings, security, integration status, required inputs |
| **Programme report (PDF)** | [`docs/PROJECT-REPORT-2026-09-16.pdf`](docs/PROJECT-REPORT-2026-09-16.pdf) — the full Stage 10 report: scope, architecture, verification, cleanup, performance, remaining inputs, next stages |
| **Status report** | [`docs/STATUS-REPORT-2026-09-16.pdf`](docs/STATUS-REPORT-2026-09-16.pdf) — what is built, how it was verified, what is still needed |

## Run it

No build step. Any static server works, but it must be **`http://`, not
`file://`** — the icon sprite is fetched at runtime.

```bash
python3 -m http.server 8000     # then open http://localhost:8000/
```

Before a page ships, it must be fully translated in both locales
(`docs/FOUNDATION.md` §5). Prove it with the audit (needs Playwright):

```bash
BASE=http://localhost:8000/ node tools/i18n-audit.mjs   # must end with TOTAL untranslated strings: 0
```

## Use it in a page

```html
<html lang="ar" dir="rtl">
<link rel="stylesheet" href="assets/css/foundation.css">
<script type="module">
  import { boot } from './assets/js/foundation.js';
  boot({ sprite: 'assets/icons/sprite.svg' });
</script>
```

## Brand

The official logo is installed and the brand colours are sampled from it —
red `#FE0002`, ink `#01010B`. See [`assets/brand/README.md`](assets/brand/README.md)
for the asset set and the rules that go with it.

One thing to know: `#FE0002` measures 4.03:1 against white, and contrast is
symmetric — so it fails AA for normal text both as red text *and* under a white
button label. The interface therefore runs on `#E00000` (5.04:1) while the
identity red stays on the artwork and on elements that carry no text. One line
in `01-tokens.css` reverses that if the brand owner insists.

Remaining open items — a vector logo master, photography, an official reversed
lockup — are listed in `docs/FOUNDATION.md` § 14.
