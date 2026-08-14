# عون الدرب · AOUN ALDARB — Image System & Performance
### STAGE 13 · نظام الصور والأداء

Single source of truth for imagery across the website. Every image consumes
the approved tokens and the `.media` component in `brand/system.css`.
**Reuse before creating. Optimize before replacing. Preserve meaning before decoration.**

---

## 0 — Current state (audit)

The site's visual layer is **vector-first by design** (Stages 04–12):

| Asset | Type | Where | Notes |
|---|---|---|---|
| `aun-aldrb-logo.svg` (21 KB) | SVG | header `<img>` | above-fold, `fetchpriority="high"`, `decoding="async"` |
| `aun-aldrb-logo-white.svg` (21 KB) | SVG | footer `<img>` | below-fold, `loading="lazy"`, `decoding="async"` |
| Hero / About scenes | inline SVG | `.hero__media` / `.about__media` | `role="img"` + `<title>`/`<desc>` |
| Icons · route graphics | inline SVG | all sections | decorative → `aria-hidden` (self or parent) |
| `*.png` logos | PNG | **not referenced** | Stage 01 brand deliverables only; not loaded by the page |

**Consequence:** near-zero image weight (~42 KB, both cacheable vector), no
raster to compress, no CLS (every frame reserves space), no oversized assets,
no missing alt, modern formats throughout. Core Web Vitals are already strong.
This document governs any **licensed photograph** added in future.

---

## 1 — Art direction (one coherent style)

**DIGNITY, NOT PITY.** People with disabilities, elderly passengers and
patients are shown *receiving professional, respectful, specialized service* —
never as helpless objects of sympathy.

- Realistic specialized-transport environments; modern equipped vehicles;
  accessibility equipment (ramp, lowered floor, wheelchair securing); trained
  staff assisting; safe boarding/exiting; comfortable, calm interactions.
- Tone: professional · calm · human · trustworthy · respectful · clean · contemporary.
- Consistent lighting (soft, natural), neutral-to-cool white balance that sits
  with the brand blue, restrained contrast, uncluttered backgrounds.
- **Avoid:** obvious stock, over-staging, pity/emotional manipulation,
  hospital/ambulance/emergency framing, generic-taxi or luxury-transport cues,
  anything implying services the company does not offer.

---

## 2 — Image roles & aspect ratios (`.media--*`)

| Role | Class | Desktop AR | Mobile AR | Use |
|---|---|---|---|---|
| Hero | `.media--hero` | 5 / 6 | 4 / 3 | first impression (`#home`) |
| Section feature | `.media--feature` | 4 / 5 | 4 / 3 | About-style section image |
| Service | `.media--service` | 4 / 3 | 4 / 3 | a specific service |
| Equipment | `.media--equipment` | 4 / 3 | 4 / 3 | vehicle / accessibility feature |
| Wide / supporting | `.media--wide` | 16 / 9 | 16 / 9 | rhythm, secondary |
| Square | `.media--square` | 1 / 1 | 1 / 1 | detail / human close-up |

Supporting images must never out-weigh a headline or CTA. Corner treatment is
always `--radius-image` (24px). No new frames, gradients, or shadows beyond the
`.media` component.

---

## 3 — Cropping & object-position

Use `object-fit: cover` (built into `.media > img`). Control the focal point per
image with the `--media-pos` custom property — do **not** fix bad composition
with aggressive crops:

```html
<figure class="media media--feature" style="--media-pos: 70% 40%;">
  <img src="…" alt="…">
</figure>
```

Preserve after any responsive crop: **faces, mobility equipment, and the
passenger–staff relationship.** If an image cannot hold its meaning on mobile,
supply a dedicated mobile crop via `<picture>` `media` queries rather than
compromising it.

---

## 4 — Formats, sizing & delivery

- **AVIF → WebP → JPEG** fallback for photographs; **SVG** for logos/vector;
  PNG only for genuine transparency needs.
- Cap intrinsic width at the real rendered size — hero ≤ ~1600px, section
  feature ≤ ~1000px, service/detail ≤ ~800px. Never ship a 4000px asset.
- Provide `srcset` + `sizes` so the browser picks close to the rendered box.
- Compress to the lowest size that preserves skin tones, vehicle detail,
  accessibility equipment, textures and brand colour — no visible artifacts.

---

## 5 — Loading, LCP & CLS

- **Above-the-fold hero photo:** `fetchpriority="high"`, **no** `loading="lazy"`,
  `decoding="async"`; consider a `<link rel="preload" as="image">` with matching
  `imagesrcset`. It is the LCP candidate — make it discoverable and small.
- **Everything below the fold:** `loading="lazy" decoding="async"`.
- Always set `width`/`height` **or** an `aspect-ratio` frame (the `.media--*`
  roles do this) so space is reserved → zero layout shift.
- Do not overuse priority hints — one `high` per page (the LCP image).

---

## 6 — Accessibility

- Meaningful image → concise, purposeful `alt` (describe *purpose + content*,
  e.g. `alt="أخصائي نقل يساعد راكبًا يستخدم كرسيًا متحركًا على منحدر مركبة مجهّزة"`).
  Never `"image" / "photo" / "hero"`; never repeat adjacent copy.
- Decorative image / brand graphic → `alt=""` (or `aria-hidden="true"` on inline SVG).
- Text over imagery → `.media--overlay` (soft navy gradient) for contrast; never
  rely on colour alone; verify legibility on desktop, tablet and mobile.

---

## 7 — Canonical `<picture>` pattern (copy-paste)

Drop this into any `.hero__media-frame` / `.about__media-frame` / `.media` slot
to replace a scene SVG with a licensed photograph — no other change needed:

```html
<figure class="media media--hero">
  <picture>
    <source type="image/avif"
            srcset="hero-800.avif 800w, hero-1200.avif 1200w, hero-1600.avif 1600w"
            sizes="(min-width:1024px) 48vw, 100vw">
    <source type="image/webp"
            srcset="hero-800.webp 800w, hero-1200.webp 1200w, hero-1600.webp 1600w"
            sizes="(min-width:1024px) 48vw, 100vw">
    <img src="hero-1200.jpg"
         srcset="hero-800.jpg 800w, hero-1200.jpg 1200w, hero-1600.jpg 1600w"
         sizes="(min-width:1024px) 48vw, 100vw"
         width="1200" height="1440"
         alt="مختصّ نقل مدرّب يساعد راكبًا يستخدم كرسيًا متحركًا عند مركبة مجهّزة بمنحدر صعود"
         fetchpriority="high" decoding="async">
  </picture>
</figure>
```

For a below-the-fold section image, drop `fetchpriority` and add
`loading="lazy"`. The scene SVGs remain the meaningful, zero-request default
until real photography is licensed.

---

## 8 — Consistency checklist

One photographic style · one lighting/temperature/contrast · one crop language ·
one corner treatment (24px) · one overlay (navy) · supporting images stay
secondary. The whole site must read as **one Aun Aldarb brand experience.**
