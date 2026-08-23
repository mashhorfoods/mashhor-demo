# عون الدرب للنقل المتخصص — UX stage work

## Contents

| Path | What it is |
| --- | --- |
| `index.html` | **The current build.** Baseline + Stage 02. This is the deliverable. |
| `stage-01-ux-architecture.html` | **Stage 01 — Global UX Architecture.** The structural foundation every later stage builds on. |
| `verify-header.js` | Stage 02 regression harness (Playwright). |
| `verify-hero.js` | Stage 03 regression harness (Playwright). |

Harnesses: `npm i -D playwright`, then `CHROMIUM_PATH=<chrome> node aun-aldrb/verify-<x>.js`.
| `baseline/index.html` | The website as it was before Stage 02, unmodified. |

## Stage 01 scope

Architecture only. The brand identity, the design tokens, and the approved
Arabic copy are unchanged, and no section has been visually redesigned.

Stage 01 establishes:

- the canonical nine-stop section spine and the question each stop answers
- journey routing for the four visitor types, including the mobile short-circuit
- two-tier navigation and the "you are here" contract
- the CTA hierarchy and its four legitimate placement moments
- a trust ledger assigning every claim exactly one home
- responsive transformation rules, the component register, the accessibility
  contract, and the motion/performance budget
- ten ranked findings against the current build, each with evidence and a fix

## Stage 02 — global header + navigation

Scope: the global header, the primary navigation, and the mobile drawer. No
section body was redesigned; the only markup added outside the header is a
`data-nav-parent` attribute on four sections, read by the navigation.

Resolved from Stage 01: **P1** (mobile header had no action), **P2** (page was
blank without JavaScript), **P5** (active state blanked across four sections),
**P8** (drawer active state was colour-only).

Also fixed, found during implementation:

- the global prose rule `li+li{margin-block-start:8px}` was landing on the
  header navigation, pushing every item after the first down 8px so the active
  item read 4px higher than its neighbours — a layout shift
- the desktop navigation swapped to the drawer at 767px, but the desktop row
  needs ~845px and only ~691px is available at 768px, so the nav and CTA
  collided across the whole tablet band. The swap moved to 1024px
- `.skip-link` was `position:absolute`, so once the page was scrolled it landed
  off-screen when focused

### Header responsive priority

| Tier | Composition |
| --- | --- |
| ≥1024px | brand → full navigation → text CTA |
| 768–1023px | brand → text CTA → menu |
| ≤767px | brand → icon CTA → menu |

The icon CTA is the same action and the same destination as the text CTA; it
drops only the visible label, which it keeps via `aria-label`.

### Header scroll states

`--header-h` (80px desktop / 64px mobile) is reserved by `.site-main` and never
changes, so the document height is identical in both states. The header itself
is fixed and transitions to `--header-h-sm` (68/56px). Nothing reflows.

## Stage 03 — hero / first impression

Scope: `#home` only. Seven levels in one order at every breakpoint — eyebrow,
headline, supporting statement, audience cues, actions, media, trust strip. The
source order already matched, so the mobile reading order and the entrance
sequence both fall out of the DOM with no reordering.

**The type scale was broken site-wide.** Every `clamp()` in the design tokens
was written `1.55rem+2.9vw` with no whitespace around the `+`. CSS math requires
it; without it the declaration is invalid, `font-size` falls back to inherit,
and **every heading on the site rendered at 17px** — the body size. `h1`, `h2`
and `h3` all measured 17px in Chromium. Seven occurrences were repaired. No
value changed, only whitespace, so the scale now produces exactly what it always
specified: h1 68px, h2 38px, h3 24px at 1440px.

This is the one Stage 03 change with effects outside the hero. Other sections
are not redesigned — they now render at their intended heading sizes instead of
at body size.

Also resolved: **P10** (the hardcoded golds `#8a6a12` / `#b08a2e` left with the
eyebrow, which is now a brand-tone pill), and **P3** is improved — the mobile
hero drops from roughly 1,550px to 1,108px, about 28%, mainly by turning the
audience cues into compact rows below 768px.

The hero also hit the same inherited `li+li{margin-block-start:8px}` prose rule
that the header hit in Stage 02: the audience cues are `<li>`, so cards 2 and 3
sat 8px below card 1 inside the grid.

The hero was reserving `--header-h` a second time on top of the reservation
`.site-main` already makes, costing about 80px above the eyebrow.

### Deviations from the reference mockup, and why

- **Copy follows `index.html`, not the mockup.** The mockup carries wording that
  is not in the source (e.g. `طاقم مؤهل ومدرب` for the trust item, and different
  audience descriptions). The brief forbids new copy and the instruction was to
  stick to the file, so every string is the source string.
- **Trust strip 4 → 3 items**, matching the mockup and §13. The dropped item,
  `أمان في كل رحلة`, is the one Why Us 01 already tells in full.
- **RTL flow kept as-is**: content at inline-start (right), media at inline-end
  (left). The mockup appears to place the photo on the right, but its mobile
  panel is unambiguously right-aligned RTL, and §04 says to maintain the
  existing RTL logic. Mirroring is a one-line change if wanted.
- **No route waypoint pin.** §14 says not to add decorative road graphics, and
  the position it would occupy is behind the trust card anyway.

## Handoff

Stage 04 covers About / من نحن. Open from Stage 01: **P4** (`#cta` duplicates
`#contact`), **P6** (primary blue is 4.35:1 as text on the page ground), **P7**
(trust claims still told twice — the hero strip no longer duplicates Why Us 01),
**P9** (hero LCP image is still third-party and has no `srcset`; §23 said to
preserve the existing loading strategy, so it was left alone).

Known and deliberately left alone: the `li+li` rule also adds 8px to the footer
link lists. The footer is outside these stages' scope.
