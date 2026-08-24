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

**Stage 07 — how we work.** One journey in three chapters: a centred header,
three nodes on a single axis joined by a dashed run, and a quiet decorative
route behind them. The number rides each node's edge so a stage reads as one
marker. Horizontal at 1024+, vertical below — earlier than the old 768 switch,
so three columns never get cramped. No CTA in the section (§11/§19).

**Stage 08 — vision & mission.** One composition rather than two cards: the
panels centre their icon, number, kicker and statement, and a single dashed run
joins direction to purpose. Vision leads by border and text weight only — same
surface, same shape, same size. Side by side above 1200, stacked below.

**Stage 09 — values.** A number-led editorial list, not a card grid: the
anchor holds the context on columns 1-4 and the six values run as one column
on 5-12, separated by hairlines. The numeral orients and stays a step below the
value name. No icons — the brief is explicit that the section is number-led.

**Stage 10 — contact.** The practical destination, not a second CTA. The
actions card leads on the reading edge with the number as a live `tel:` link
above WhatsApp and call; the three information rows sit beneath it as one
divided list; the closing statement and the route close the page on the far
side. No form, no chat widget, no invented channel.

**All ten sections are now upgraded.** The `section-label` component is gone
from the page — every section leads with the shared pill.

## Curve system + P4

**P4 resolved.** The standalone `#cta` section is folded into `#contact` as its
opening invitation — a curved navy panel with the route behind it, then the
practical contact card. It asked the same question `#contact` answered two
hundred pixels below, and put a navy band between two light ones. Its two
buttons are gone: the primary linked to the section it already sat in, and the
tertiary pointed back up to Services at the point of conversion. The page is
eight sections now, one conversion moment.

**Curve system.** One hierarchy, four steps, used everywhere:
`--radius-sm 12px` controls · `--radius-md 18px` cards · `--radius-lg 26px`
media and panels · `--radius-xl 34px` featured CTA containers. Both featured
containers — the contact invitation and the services bridge — share the same
radius, which is the point of §29/§30. `--radius-pill` stays for chips and
circles only.

**Service cards.** Fixed reading order: icon, title, image, description,
action. The description is the only flexible band, so the action sits at the
same height on every card in a row whatever the copy length. Hover is a border
firm, a 1.02 image scale inside its own clip, and a 3px arrow drift — the card
geometry never moves, and all of it is dropped under reduced motion.

**The image band is not yet populated** — see below.

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

## Service card images

The seven per-service photographs are in. Each card now emits a
`<figure class="service__media">` between its title and description, keeping the
§09 reading order icon → title → image → description → CTA. No CSS was needed for
the band itself — it was already styled, clipped and hover-wired.

Two notes on how they are written:

- **No `width`/`height` attributes.** The real pixel dimensions of these files
  cannot be read from this environment (`i.ibb.co` is blocked by the network
  policy), and a guessed intrinsic size is worse than none. `.service__media img`
  already carries `aspect-ratio:4/3`, which reserves the box and prevents layout
  shift on its own. If the true dimensions are ever known, adding them is safe.
- **Alt text describes the service scene**, matching the pattern used for the
  hero, About and Why-Us images. Nobody here has seen these seven files, so each
  alt should be checked against the actual photograph before launch.

`.service__title` now reserves two lines (`min-height:2.8em`) from 600px up,
where the grid goes multi-column. Titles run one or two lines depending on
width, and without the reserve the image bands in a row started on different
lines — measured at 1440/1280/1024/768, now aligned at all four. Below 600px the
grid is one column, so nothing is reserved and one-line titles stay tight.

## Open findings from Stage 01

**P4** `#cta` duplicates `#contact` and sits directly above it · **P6** primary
blue is 4.35:1 as text on the page ground — this is why the About lead is navy
rather than the brighter blue the mockup shows · **P7** trust claims still told
twice · **P9** hero image is third-party with no `srcset`.

The `section-label` component is fully retired — no section still uses it. Later stages should
carry the pill across, or the first four sections should go back.

**Item counts.** Two sections carry more content than their briefs list, and in
both cases everything is kept — removing approved content is not a design
decision to make unasked:

- Services: SEVEN in the source, six in the Stage 06 brief and mockup. Missing
  from both: `07 التنقل للمناسبات الاجتماعية`. The 3-column grid runs 3/3/1.
- Values: SIX in the source, five in the Stage 09 brief and mockup. Missing
  from both: `06 التميّز`.

Say the word and either comes out.

## Icon system

Every icon on the site is one family now. 54 icons, one 24x24 grid, outline
only, round caps and joins, drawn with no presentation attributes of their own
-- weight and geometry live in a single `.ico` rule, so the family cannot drift
apart again the way it had.

**What it replaced.** The audit found three stroke weights (1.5, 1.6, 1.7) and
eight display sizes (18, 20, 22, 26, 28, 30, 32) across nine sections. Icons
from visibly different construction logics sat next to each other. That is the
"do not mix libraries" problem stated as measurements.

**The stroke.** `.ico` sets `stroke-width:2` on the 24 grid and every shape
carries `vector-effect:non-scaling-stroke`, which holds the *rendered* stroke at
2 CSS px whatever the display size. Without it, a 32px icon at stroke 2 renders
a 2.67px line and a 20px icon renders 1.67px -- the same declaration producing
three different weights. This is what makes one stroke language literally true
rather than approximately true.

**The size scale.** Four steps, and nothing off them: 20px small UI (button and
link icons), 24px small UI upper (utility, contact rows, trust cues), 28px
standard feature (journey nodes, about facts, audience cues), 32px feature
(service cards, how-we-work and vision/mission nodes). Verified at seven widths:
every icon lands on one of those four.

**What is deliberately not an icon.** Six drawings stay outside the family --
the hero road, the how-we-work route, the two vision/mission links, and the two
contact routes. They are the brand's journey language, which the brief protects.
The one route mark that is displayed inside an icon container (the services
bridge) keeps its geometry but takes the family's stroke, so it stops looking
like a stray weight.

**Three deviations from the brief, all for semantic accuracy:**

- §13 asks for a *supporting hand* for "المساعدة عند الحاجة". Drawn and
  rendered, an open palm reads as "stop", not "help" -- a real semantic defect
  visible at 32px. It is now two figures with the taller one reaching across,
  which is what assistance actually looks like.
- §12 asks for "daily mobility / recurring transport". A directional arrow above
  the van read as "forward", and pointed against the RTL reading direction. It
  is now a van with a clock badge: scheduled, recurring.
- §16 refers to values icons. The values section has never had icons -- Stage 09
  ruled them out and the brief for that stage forbade them. Nothing to replace.

**Quality control** (§29) runs as a harness: 3,738 assertions across seven
widths check that every icon carries the family class, computes to a 2px stroke
with round caps and joins, has no fill on itself or any child, sits on the 24
grid, keeps geometry plus half a stroke inside that grid (no clipping), is
square, lands on the size scale, and holds 1-8 components.
