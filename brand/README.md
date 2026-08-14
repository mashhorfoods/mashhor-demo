# AOUN ALDARB — عون الدرب · Brand & Design System

The single source of truth for the Aun Aldarb website visual language. Every
future page section inherits from here — do not redefine tokens or fork styles
inside a section.

## Files
| File | Stage | Purpose |
|---|---|---|
| `aun-aldrb-logo.svg` / `-white.svg` | 01 | Logo (blue + white on dark). Source of truth — never redraw. |
| `aun-aldrb-logo.png` / `-white.png` | 01 | Raster fallbacks (transparent). |
| `tokens.css` | 01 | Foundation color + type tokens. |
| `BRAND-IDENTITY.md` | 01 | Written brand foundation (17 items). |
| `index.html` | 01 | Visual brand book. |
| **`system.css`** | 02 | **Production design system — link this on every page.** Full token set + component library + states, RTL-first, accessible, performance-first. |
| `design-system.html` | 02 | Living style guide documenting the system (system only — no page sections). |

## Usage
```html
<html lang="ar" dir="rtl">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Cairo:wght@400;600;700&display=swap">
<link rel="stylesheet" href="/brand/system.css">
```
`system.css` includes the Stage 01 color/type values verbatim; keep the two in sync.

## Rules (carry into every later stage)
- Do not redefine the brand identity or global tokens.
- Do not create a parallel design system; reuse components before creating.
- Body text in navy/ink (≥4.5:1); brand blue for large text & UI only.
- RTL-first via logical properties; mobile is not a compressed desktop.
- No unsupported claims, invented stats, social accounts, or legal info.
