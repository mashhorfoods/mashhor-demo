# عون الدرب للنقل المتخصص — UX stage work

## Contents

| Path | What it is |
| --- | --- |
| `index.html` | **The current build.** Baseline + Stage 02. This is the deliverable. |
| `stage-01-ux-architecture.html` | **Stage 01 — Global UX Architecture.** The structural foundation every later stage builds on. |
| `verify-header.js` | Stage 02 regression harness (Playwright). `npm i -D playwright && node aun-aldrb/verify-header.js` |
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

## Handoff

Stage 03 covers the hero / first impression. Open from Stage 01: **P3** (mobile
hero runs ~1,550px), **P4** (`#cta` duplicates `#contact`), **P6** (primary blue
is 4.35:1 as text on the page ground), **P7** (trust claims told three times),
**P9** (hero LCP image), **P10** (off-system gold).

Known and deliberately left alone: the same `li+li` rule also adds 8px to the
footer link lists. The footer is outside Stage 02's scope.
