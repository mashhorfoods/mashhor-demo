# Number One Travel & Tourism — Website Foundation
## نمبرون للسفر و السياحة · Stage 10.1

The master visual, UX and frontend foundation. Every later website stage
inherits it.

| | |
| --- | --- |
| **Full documentation** | [`docs/FOUNDATION.md`](docs/FOUNDATION.md) |
| **Living style guide** | `styleguide.html` — every token, component and state, in RTL and LTR |
| **Entry point** | `index.html` — the system running, not a designed homepage |
| **Brand assets** | [`assets/brand/README.md`](assets/brand/README.md) |

## Run it

No build step. Any static server works, but it must be **`http://`, not
`file://`** — the icon sprite is fetched at runtime.

```bash
python3 -m http.server 8000     # then open http://localhost:8000/numberone/
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

## Two things need sign-off

1. **The logo** — `assets/brand/mark.svg` is a documented placeholder. Drop the
   official export in its place; nothing else changes.
2. **The brand HEX values** — `assets/css/01-tokens.css` opens with a block
   marked `BRAND SLOT`. Replace those five values and the whole interface
   re-colours.

Both, plus the remaining open items (photography, production domain, raster
exports), are listed in `docs/FOUNDATION.md` § 14.
