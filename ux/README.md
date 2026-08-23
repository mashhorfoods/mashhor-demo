# عون الدرب — UX stages

UX work layered on top of the brand identity in `brand/`. The site itself is the
repository's root `index.html`.

| Path | What it is |
| --- | --- |
| `../index.html` | The site. Stages 01–03 applied. |
| `stage-01-ux-architecture.html` | **Stage 01 — Global UX Architecture.** Section spine, journey routing, CTA law, trust ledger, and ten ranked findings. |
| `verify-header.js` | Stage 02 regression harness (Playwright). |
| `verify-hero.js` | Stage 03 regression harness (Playwright). |

Harnesses: `npm i -D playwright`, then `CHROMIUM_PATH=<chrome> node ux/verify-<x>.js`.
Together they run 66 checks over the header, navigation, drawer and hero.

## Stages applied

**Stage 01 — architecture.** Established the nine-stop section spine, the four
journey routes, a two-tier navigation model, the CTA hierarchy and its four
placement moments, and a trust ledger giving each claim one home. Produced ten
ranked findings against the build.

**Stage 02 — global header and navigation.** Primary CTA now renders at every
breakpoint (full label ≥768px, icon-only ≤767px with the label on `aria-label`).
Header is fixed and compacts 80→68px / 64→56px without shifting the document.
Navigation swaps to the drawer at 1024px, not 767px, where it used to collide
with the CTA across the whole tablet band. Secondary sections declare a
`data-nav-parent` so the active state and `aria-current` never blank. The reveal
system is gated on a `.js` class, so the page is no longer blank without
JavaScript.

**Stage 03 — hero.** Seven levels in one order at every breakpoint. Eyebrow is a
brand-tone pill (retiring the off-palette golds `#8a6a12` / `#b08a2e`), headline
splits across two existing brand tones, audience cues become compact rows below
768px, the trust strip drops from four items to three, and the media carries no
frame — the photograph is transparent at the top and sides, so it sits directly
on the page with the crop anchored to the bottom to trim the empty band. The
desktop hero fits inside a 900px viewport.

**Stage 04 — about.** Every child of the grid is now placed explicitly: the
lead statement was auto-placed into the last row, so on desktop it rendered
below both the body and the facts. The three approved paragraphs became stops
on the route (icon, paragraph, dashed connector — not cards), the four facts
became a single divided card (label only, no invented descriptions), and the
section label became the same pill the hero eyebrow uses. `#about` went from
2774px to 1093px at 1440.

**Stage 05 — why us.** The six reasons became stops on one route: number, node,
title, description, joined by a dashed connector, with dividers instead of six
cards. The number moved out of the heading row into its own column, the 24/7
marker became a small chip beside its title rather than being flung to the end
of the row, and the intro gained the section photograph. One primary action
(`تواصل معنا`) closes the journey, with the existing tertiary pointing forward
to Services. A current-stop emphasis marks position on desktop — colour only on
the node, number and title, so nothing reflows — and it is skipped entirely
under reduced motion.

**Stage 06 — services.** Every tile now carries the same anatomy — icon and
number sharing a head row, then title, then description — so the catalogue can
be compared at a glance. The navy bridge to Contact moved out of the grid and
became a full-width bar, so it no longer reads as another service. Service 01
stays the featured entry point but is marked by surface only, keeping the grid
uniform.

The About illustration was replaced with the supplied photograph.

## Typography parse bug — repo-wide

Every `clamp()` outside `brand/tokens.css` was written `1.55rem+2.9vw`, with no
whitespace around the `+`. CSS math requires it, so each of those declarations
was invalid, `font-size` fell back to `inherit`, and **every heading rendered at
body size (17px)**. Repaired in:

| File | Occurrences |
| --- | --- |
| `../index.html` | 7 |
| `brand/system.css` | 7 |
| `brand/index.html` | 6 |
| `brand/design-system.html` | 2 |
| `stage-01-ux-architecture.html` | 3 |

`brand/tokens.css` was already correct — it is the one file that kept the
spaces, and it is why the intended scale is known. No value was changed
anywhere, only whitespace.

## Known divergence, not acted on

`index.html` says its type tokens "mirror exactly" `brand/tokens.css`, but the
values differ — e.g. `--fs-display` is `1.4rem + 3.0vw` in tokens.css and
`1.55rem + 2.9vw` in the site. Re-aligning them would change the rendered
design, so it is left for a deliberate decision.

## Open findings from Stage 01

**P4** `#cta` duplicates `#contact` and sits directly above it · **P6** primary
blue is 4.35:1 as text on the page ground — this is why the About lead is navy
rather than the brighter blue the mockup shows · **P7** trust claims still told
twice · **P9** hero image is third-party with no `srcset`.

The `section-label` component (`01 —— name`) still runs in the four sections
after Services — How We Work, Vision, Values and Contact. Later stages should
carry the pill across, or the first four sections should go back.

**Services count.** The source carries SEVEN services; the Stage 06 brief and
its mockup both list six, omitting `07 التنقل للمناسبات الاجتماعية`. All seven
are kept — removing approved content is not a design decision — so the 3-column
grid runs 3/3/1. Say the word and 07 comes out.
