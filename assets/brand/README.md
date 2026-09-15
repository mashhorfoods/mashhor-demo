# Brand assets — Number One Travel & Tourism

## What is in this folder

| File | Purpose |
| --- | --- |
| `mark.svg` | The numeral mark. Used by `.c-logo`, the header, the footer and every supervisor page. |
| `favicon.svg` | Browser tab. Same mark, tighter optical margins for small sizes. |

## The logo is a SLOT, not a design

Stage 10.1 explicitly forbids redesigning the logo or inventing a visual
identity (§02, §34). The official Number One artwork was not present in this
repository when the foundation was built, so `mark.svg` is a **stand-in**: it
carries the correct idea — the numeral `1` — at the correct colour, and nothing
more.

**To install the real asset:** replace `mark.svg` with the official export.
Nothing else needs to change. Every consumer references this one file.

Requirements for the replacement:

- SVG, with a `viewBox` and no fixed `width`/`height`.
- Optically balanced inside its own box; `.c-logo` controls the size, the file
  should not carry its own padding.
- Colour baked in, not tokenised. A brand mark must not re-colour with a theme.
- If the official lockup includes the wordmark, supply **two** files — a mark
  and a full lockup — and point `.c-logo` at the lockup. The wordmark is
  currently set as live text (see below), which is the lower-cost option.

## Wordmark

The header and footer render the wordmark as **live text**, not an image:

```html
<span class="c-logo__word">Number One</span>
<span class="c-logo__sub">Travel &amp; Tourism</span>
```

This is deliberate:

- it stays crisp at any pixel density and costs no extra request (§30);
- it switches between `نمبرون للسفر و السياحة` and `Number One Travel &
  Tourism` with the language, which a raster lockup cannot do (§06);
- it is readable by search engines and screen readers (§23, §31).

If the approved identity requires a specific wordmark drawing, replace the text
with a second SVG and keep an `aria-label` on it.

## Still missing (blocked on assets that do not exist in this repo)

- `apple-touch-icon.png` (180×180) — needs a raster export of the final mark.
- `og-image.png` (1200×630) — needs the final mark plus an approved photograph.
- Any brand photography. See `docs/FOUNDATION.md` § Photography for the brief
  the images must meet.

## Colour

The mark uses `#C8102E`. That value is a **placeholder pending sign-off** and is
mirrored in `assets/css/01-tokens.css` inside the block marked `BRAND SLOT`.
If the approved brand red differs, change it in **both** places — the token file
drives the interface, this file drives the mark.
