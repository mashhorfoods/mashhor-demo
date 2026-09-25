# Brand assets — Travel & Tourism

The live logo is a plain text wordmark (`.c-logo__text` in
`assets/js/components/brand.js`), not an image — see §02/§29 in
`assets/css/05-primitives.css`. This lets the demo's name be swapped for a
real client's later without touching any component. The name itself lives
in `assets/js/core/strings/{ar,en}.js` under the `brand.name` key.

| File | Use |
| --- | --- |
| `logo-original.jpg` | Historical master. No longer referenced anywhere. |
| `logo-lockup.png` / `logo-lockup-inverse.png` | Historical, unused — kept for reference only. |
| `favicon-32.png` | Browser tab. Still referenced. |
| `apple-touch-icon.png` | 180x180 home-screen icon. Still referenced. |
| `og-image.png` | 1200x630 social card. Still referenced. |

## Colour

Sampled from the original master and live in `assets/css/01-tokens.css`:

| | Sampled | Token |
| --- | --- | --- |
| Brand red | `#FE0002` | `--_red-600` → `--color-primary` |
| Wordmark ink | `#01010B` | `--_black` |

**The one thing to know about the red.** `#FE0002` measures 4.03:1 against
white. Contrast is symmetric, so that is the figure both for red text on white
and for a white label on a red fill — both fail WCAG AA for normal text. The
interface therefore uses `#E00000` (`--_red-700`, 5.04:1) for fills and for red
text, and `#FE0002` (`--color-brand-red`) stays on elements that carry no text.
The two read as the same red side by side.

## Rules

- The component sets size, spacing and an opt-in light/dark colour swap only.
  It never invents a mark or reintroduces an image.
- Nothing may sit closer to the wordmark than a quarter of its height.
- Supervisor pages use the same component. There is no second brand. (§29)

## Customising for a real client

Replace `brand.name` in both string files, and the favicon / apple-touch-icon
/ og-image files above, with the client's own. No component changes needed.
