# Number One Travel & Tourism — Website Foundation
## نمبرون للسفر و السياحة · Stage 10.1

The master visual, UX and frontend foundation. Every later website stage
inherits it.

| | |
| --- | --- |
| **Full documentation** | [`docs/FOUNDATION.md`](docs/FOUNDATION.md) — Stage 10.1 foundation |
| **Header & navigation** | [`docs/NAVIGATION.md`](docs/NAVIGATION.md) — Stage 10.2 |
| **Footer** | [`docs/FOOTER.md`](docs/FOOTER.md) — Stage 10.3 |
| **Homepage build** | [`docs/HOMEPAGE.md`](docs/HOMEPAGE.md) — Stage 10.4 |
| **Services** | [`docs/SERVICES.md`](docs/SERVICES.md) — Stage 10.5 · `services/` |
| **Service details** | [`docs/SERVICE-DETAILS.md`](docs/SERVICE-DETAILS.md) — Stage 10.6 · `services/<slug>/` |
| **Living style guide** | `styleguide.html` — every token, component and state, in RTL and LTR |
| **Homepage** | `index.html` — the production homepage (Stage 10.4) |
| **Brand assets** | [`assets/brand/README.md`](assets/brand/README.md) |
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
