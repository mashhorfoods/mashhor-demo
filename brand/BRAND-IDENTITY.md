# عون الدرب · AOUN ALDARB — Brand Identity Foundation
### STAGE 01 · أساس الهوية الرقمية

**Company:** شركة عون الدرب للنقل المتخصص — AOUN ALDARB, Specialized Transportation
**Tagline:** نُعين ونُعاون
**Domain:** aunaldrb.com · **Location:** الرياض، حي السليمانية، 12233 · **Phone/WhatsApp:** +966 53 554 4352

> **Scope of this stage.** This document establishes the *identity* only. It does **not** design the Hero, About, Services or any website section, and does **not** create components or page layouts. Stage 02 converts this foundation into the website design system.
>
> **Assets in this folder:** `aun-aldrb-logo.svg` (primary, vector), `aun-aldrb-logo-white.svg` (dark backgrounds), matching `.png` versions, `tokens.css` (foundation tokens), and `index.html` (visual brand book).

Core principle: **DIGNITY, NOT PITY — كرامة لا شفقة.** Communicate care without emotional manipulation.

The brand must feel: **PROFESSIONAL × HUMAN × SAFE × CALM × TRUSTWORTHY.**

Avoid the visual language of: generic taxis · ambulance/emergency · hospitals/medical · luxury transport · childcare · cheap transport · cold corporate tech.

---

## 01 — Brand Personality — شخصية العلامة
Calm · Human · Professional · Reliable · Accessible · Respectful · Modern.

- **هادئة (Calm):** generous white space, even visual rhythm → safety.
- **إنسانية (Human):** the person is the centre of every visual decision — not the tool or the vehicle.
- **موثوقة (Reliable):** consistency and precision build trust at every touchpoint.
- **محترمة (Respectful):** show independence, never weakness ("dignity, not pity").
- **احترافية (Professional):** clear institutional voice without heaviness or cold formality.
- **مُيسِّرة (Accessible):** accessibility is part of the identity, not a later add-on.

Confidence without aggression · care without sentimentality · technology without coldness · professionalism without corporate heaviness.

---

## 02 — Logo Usage Principles — اللوجو ومبادئ استخدامه
The existing logo is the **single source of truth.**

**The mark:** a road with a dashed centre-line that curves gently into a wheelchair/movement form — the union of *route/journey* and *accessible transport*. This "road/route" element is the brand's visual DNA.

**Do not:** redraw · change proportions/geometry · alter the recognizable form · add effects · add gradients · create unnecessary variations.

**Rules**
- **Primary:** blue logo on light backgrounds. **White monochrome** version on dark backgrounds / footer (contrast only).
- **Clear space:** keep empty space around the logo ≥ the height of the "ع" glyph; no element intrudes.
- **Minimum size:** horizontal lockup ≥ **160px** wide so the road detail stays legible.
- Always use the original vector (SVG). Preserve proportions when scaling.
- The route element **may later inspire** routes, curves, connectors, dividers, section markers — but must stay subtle, intentional, functional, and **never become a repetitive decorative pattern.**

---

## 03 — Primary Color — اللون الأساسي
One color drawn directly from the logo governs the whole system. Do not invent an unrelated palette. Do not overuse the brand color — **white space is part of the identity.**

| Token | HEX | RGB | Usage | Contrast on white |
|---|---|---|---|---|
| **AUN Blue** (Primary) | `#4975BA` | 73,117,186 | Buttons, links, large headings, primary UI | 4.63:1 — AA (large text & UI) |
| **AUN Navy** (Deep) | `#2C4C82` | 44,76,130 | Heading text on light, dark surfaces, footer | 8.53:1 — AAA |
| **AUN Blue Bright** | `#5C86C6` | 92,134,198 | Hover / decorative only (non-text) | 3.7:1 — non-text |

*(The logo vector's exact fill is `#4A76BB`; `#4975BA` is the documented brand primary — a 1-point, imperceptible match.)*

## 04 — Secondary / Supporting Colors — الألوان الثانوية
Light tints of the same blue — no new hue is introduced.

| Token | HEX | Usage |
|---|---|---|
| **Sky** | `#D9E4F3` | Feature card backgrounds, chips, soft borders |
| **Mist** | `#EEF3FA` | Alternating section backgrounds, quiet areas |
| **Soft** | `#F6F8FB` | Overall page ground beneath white |

## 05 — Neutral Colors — الألوان المحايدة
Neutrals carry a slight blue bias — *chosen, not default* — to harmonize with the brand blue.

| Token | HEX | Usage | Contrast on white |
|---|---|---|---|
| **Ink** | `#1E2733` | Primary text & headings | 15.07:1 — AAA |
| **Slate** | `#5A6675` | Secondary / descriptive text | 5.85:1 — AA |
| **Gray** | `#8B95A3` | Placeholder / non-text only | 3.03:1 — non-text |
| **Divider** | `#E4E9F0` | Hairline borders / dividers | — |
| **White** | `#FFFFFF` | Base surface + brand white space | — |

---

## 06 — Typography System — نظام الطباعة
Approved pairing only. **Do not introduce additional typefaces.**

- **Primary — IBM Plex Sans Arabic** (stronger corporate/structural voice): main & section headings, key statements, navigation, labels, numbers, important interface elements.
- **Secondary — Cairo** (support): body copy, descriptions, supporting information, longer Arabic text.

## 07 — Type Hierarchy — التدرّج الطباعي
Works natively in Arabic RTL; readable across desktop, tablet, mobile.

| Level | Font | Weight | Size (fluid) |
|---|---|---|---|
| Display | Plex | 700 | 40–56px |
| H1 | Plex | 700 | 32–48px |
| H2 | Plex | 700 | 28–40px |
| H3 | Plex | 600 | 22–28px |
| H4 | Plex | 600 | 18–22px |
| Body Large | Cairo | 500 | 18–20px |
| Body | Cairo | 400 | 17px · line-height 1.75 |
| Small / Caption | Cairo | 400 | 15px |
| Navigation | Plex | 600 | 16px |
| Labels | Plex | 600 | uppercase + letter-spacing (Latin) |
| Numbers | Plex | 600 | tabular figures |

---

## 08 — Photography Direction — اتجاه التصوير
Preserve the meaning of the content; treat every person with dignity.

**Prioritize:** realistic transportation situations · elderly people · people with disabilities · wheelchair users · professional staff · equipped vehicles · genuine human assistance · comfortable transport environments. Tone: safety, respect, humanity, confidence, comfort, independence.

**Avoid:** obviously artificial stock · over-staged scenes · overly emotional expressions · disability shown through pity · hospital imagery unless directly relevant · generic transport stock · unrelated lifestyle photography.

## 09 — Image Treatment — معالجة الصور
Subtle and consistent — natural, never artificially "branded."

- Clean natural photography with controlled cropping.
- Soft brand-color (navy) overlays **only when needed** for text legibility over images.
- Rounded or structured containers where appropriate (16–24px).
- **No heavy filters.** Used as: hero · editorial · supporting · detail · full-width · cropped.

---

## 10 — Route / Graphic Language — لغة المسار الرسومية
Primary concept, inspired by the logo: **ROUTE · MOVEMENT · CONNECTION.**

A restrained system of curved routes, lines, connectors, circles/route points, section markers, and subtle directional elements — communicating movement, journey, guidance, connection, assistance. Minimal and editorial; **never competes** with content, photography, logo, or typography. The dashed centre-line of the logo road may be reused as a thin functional divider. **Constraint:** never a repetitive decorative pattern — subtle, intentional, functional.

## 11 — Shape Language — لغة الأشكال
Soft curves · controlled rounded geometry · clean rectangular structures · subtle circular route points · generous spacing.
Radius scale: `2px` · `10px` · `16px` · `24px` · pill · circle (route points).
**Avoid:** excessive rounded cards · random decorative shapes · heavy shadows · complex patterns · 3D · clutter.

## 12 — Iconography Direction — الأيقونات
**One system: minimal line iconography.** Consistent stroke weight (~1.6) · clean geometry · rounded terminals · simple silhouettes · high legibility · Arabic-friendly balance. Applications: services, equipment, values, contact, features.
**Never mix** filled, 3D, gradient, or differing icon styles. One icon language only.

---

## 13 — Composition Principles — مبادئ التكوين
Strong editorial hierarchy · generous white space · clear alignment · controlled asymmetry · large meaningful typography · strong photography · subtle route graphics.
**ONE PRIMARY MESSAGE PER VISUAL AREA.** Do not fill empty space unnecessarily — white space is part of the brand.

## 14 — RTL Principles — مبادئ RTL
Primary language is Arabic; design for a **native RTL experience**, not a mirrored Western LTR site.
Right-aligned typography · RTL navigation behavior · RTL content hierarchy · appropriate image/text relationships · directional movement that feels natural in RTL · proper Arabic spacing & line-height.

## 15 — Brand Do / Don't
**Do:** preserve the identity · logo as source of truth · build around existing brand colors · IBM Plex Sans Arabic + Cairo · meaningful photography · route-inspired graphics · generous white space · consistent iconography · prioritize accessibility · design RTL-first.

**Don't:** redesign the logo · introduce unrelated colors or new fonts · create a second/parallel identity · decorative elements without purpose · excessive gradients or shadows · generic healthcare aesthetics · pity-based imagery · overcrowd layouts · styles that can't be reused across the site.

## 16 — Responsive Identity Rules — الهوية المتجاوبة
A responsive system from the start. **Mobile is not a reduced desktop** — it remains a complete AOUN ALDARB experience.

| Element | Desktop | Tablet | Mobile |
|---|---|---|---|
| Typography | Full scale, large headings | Stepped down | Compact headings, body ≥16px |
| Spacing | Very generous | Medium | Compact but still breathing |
| Grid | 12 columns | 8 columns | 4 columns / single |
| Route graphics | Extended curves | Simplified | Thin divider only |
| Images | Full-width, editorial | Controlled crop | Portrait-optimized ratios |

## 17 — Accessibility Foundations — أسس الوصول
Accessibility is part of the identity — and central to a brand serving elderly people and people with disabilities.

- **Sufficient contrast:** body text in Navy/Ink (≥4.5:1); Blue reserved for large text & UI.
- **Never convey information by color alone** — pair with an icon or text.
- **Readable Arabic typography:** comfortable line-height; body never below 16px.
- **Text over images:** navy overlay guarantees legibility.
- **Touch targets ≥ 44px.**
- **Visible keyboard focus** on every interactive element.

---

### Stage 01 deliverables — checklist
1. Brand Personality ✓ · 2. Logo Usage ✓ · 3. Primary Color ✓ · 4. Secondary Colors ✓ · 5. Neutral Colors ✓ · 6. Typography System ✓ · 7. Type Hierarchy ✓ · 8. Photography Direction ✓ · 9. Image Treatment ✓ · 10. Route/Graphic Language ✓ · 11. Shape Language ✓ · 12. Iconography ✓ · 13. Composition ✓ · 14. RTL ✓ · 15. Do/Don't ✓ · 16. Responsive Identity ✓ · 17. Accessibility ✓

*Next: Stage 02 converts this foundation into the website design system. Continue using this Brand Identity in all later stages; do not redefine global styles or create a parallel system.*
