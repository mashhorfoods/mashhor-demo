# Brand assets — Number One Travel & Tourism

The official logo is installed. This folder is the single source for it; every
surface in the site references these files and none of them redraw the mark.

| File | Use |
| --- | --- |
| `logo-original.jpg` | The supplied master. Reference only — nothing links to it. |
| `logo-lockup.png` | **Primary.** Trimmed, transparent. Header, body, light surfaces. |
| `logo-lockup-inverse.png` | Dark surfaces (the footer). See the note below. |
| `favicon-32.png` | Browser tab. |
| `apple-touch-icon.png` | 180x180 home-screen icon. |
| `og-image.png` | 1200x630 social card. |

## What was done to the supplied file, and why

The master arrived as a JPEG on a white background. Three derivations were made
from it, and nothing else:

1. **Trimmed and made transparent.** The artwork sat inside ~200px of white
   margin. White is mapped to transparent across a narrow 238-250 ramp, which
   keeps the letterforms smooth and leaves the light grey 3D shadow (~#E4E0E4)
   fully opaque. No colour was altered.

2. **A reversed version for dark surfaces** (`logo-lockup-inverse.png`). On the
   dark footer the near-black wordmark disappears entirely, so the ink knocks
   out to white and the light 3D shadow darkens. **The red is untouched.**
   This is DERIVED, not supplied — if the brand owner has an official reversed
   master, replace this file with it and nothing else changes.

3. **The numeral alone, for icons.** The numeral is kerned tightly into the "O"
   of ONE, so no rectangular crop isolates it; it is selected by colour instead
   and knocked out in white on a brand-red tile. Icons are necessarily a
   simplification — this is the only place the full lockup is not used.

## Colour

Sampled from the master and now live in `assets/css/01-tokens.css`:

| | Sampled | Token |
| --- | --- | --- |
| Brand red | `#FE0002` | `--_red-600` → `--color-primary` |
| Wordmark ink | `#01010B` | `--_black` |

**The one thing to know about the red.** `#FE0002` measures 4.03:1 against
white. Contrast is symmetric, so that is the figure both for red text on white
and for a white label on a red fill — both fail WCAG AA for normal text. The
interface therefore uses `#E00000` (`--_red-700`, 5.04:1) for fills and for red
text, and `#FE0002` (`--color-brand-red`) stays on the artwork and on elements
that carry no text. The two read as the same red side by side.

## Rules

- The component sets size and clear space only. It never recolours, rotates,
  crops or reconstructs the mark.
- Nothing may sit closer to the lockup than a quarter of its height.
- Supervisor pages use the same component. There is no second brand. (§29)

## Still outstanding

- A **vector** master (SVG/EPS/AI). Everything here is raster, derived from a
  JPEG, so it cannot scale indefinitely or print cleanly. The lockup is exported
  at 1099px wide, which covers every screen use including 2x, but a vector
  original should replace it when available.
- An **official reversed lockup**, to replace the derived one.
