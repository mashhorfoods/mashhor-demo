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

## Stage 11 — the final CTA

Built on the invitation panel that already carries this stage's approved copy,
because P4 folded the standalone `#cta` into `#contact` and that instruction is
newer than the stage plan. See the structural note below.

**One boundary, one opened corner.** Three corners hold the system's largest
radius (34px) and the fourth opens into `clamp(3.5rem,10vw,8rem)` -- 128px at
1440. It is the block-end inline-end corner, which in this RTL document is the
corner the eye leaves through and the corner the route runs out of on its way
to the contact card. One curve, not several competing ones. Below 768px it
collapses to a single uniform radius, as the brief asks.

**The route moved.** It used to sit at `inset:0`, centred behind the Arabic.
It now occupies a band at the block end, below the actions -- measured at seven
widths, the route's top edge is always at or below the actions' bottom edge. It
was also redrawn: the old sweep had a large vertical amplitude and read as a
decorative wave, which §05 rules out. It is now a long shallow run descending
toward the opened corner.

**The trail.** A short dashed run with a waypoint dot carries the eye from the
panel to the details, and `.contact__lead` moved up to meet it, so the join is
a continuation rather than a section gap.

**The two actions are back, with honest destinations.** P4 removed them because
the primary linked to the section it already sat in and the tertiary pointed
back up to Services at the point of conversion. The primary now goes to
`#contact-actions` -- the card that actually performs the contact -- and the
secondary to `#services`. No third action.

**Measure.** The body was capped at `46ch`, which let 63 real Arabic characters
onto a line. It is now a rem cap holding 55 characters per line on desktop.

**Structural note, unresolved by design.** Stage 11 frames this as the section
*before* Contact, and closes with "NEXT: STAGE 12 — CONTACT". But Contact was
built at Stage 10 and P4 merged the CTA into it at the user's explicit request.
The stage plan predates both. The work here upgrades the panel in place rather
than splitting it back out, because undoing an explicit instruction is worse
than following a plan that has drifted. Splitting it into its own section again
is a small change if that is what is wanted -- the panel is self-contained.

**Verified** at 1440/1280/1024/768/430/390/375, 150 assertions: the opened
corner and its mobile collapse, the route sitting below the actions and inside
the panel, the trail bridging panel to details, exactly two actions with
verbatim copy and correct destinations, primary solid and secondary quiet,
contrast (primary 8.53, secondary 8.53, body 4.9), 44px touch targets, the
approved Arabic unchanged character for character, the h2 still the section
heading, route and icons aria-hidden, reading measure, stacked full-width
actions on mobile, no clipping and no horizontal overflow.

## Stage 12 — Contact

The section already carried all of this stage's approved content. What changed
is where it sits.

**MESSAGE -> ACTION -> DETAILS -> CLOSING.** The three information items used to
live *inside* the contact card, which made one card carry the phone, both
actions, and all the supporting detail. They are now their own light row below
the card -- no surface, no shadow, one hairline between them on mobile -- in the
brief's order: website, location, availability. The lead moved out of a
full-width paragraph into a message column beside the card, at the inline start
so the reading order is message then action. The closing line, which used to
fill the second grid column, is now the section's last word before the footer.

**The availability icon was wrong.** That item's value is "على مدار 24 ساعة
طوال أيام الأسبوع" and it carried a phone icon after the icon rollout. It is a
clock now.

**Ragged action buttons.** The card's two actions wrapped on available width
alone: at 1024 they broke with one at 279px and the other at 175px. They now
carry `flex:1 1 15rem`, so they either share a row at equal width or take a row
each -- never ragged. The column block resets flex-basis to auto, because a
basis on a column flex item is a height, which is the bug that inflated the
services CTA bridge to 444px on a phone.

**One deviation.** §12 labels the third item "التوفر". The site's approved label
is "خدمة العملاء" and §02 forbids rewriting approved content, so the existing
label stands. Say the word if the brief's label should win.

**Verified** at seven widths, 286 assertions: the four-part hierarchy, the
details out of the card, all three labels and values verbatim, the clock, the
card actions' copy and destinations, exactly two actions, WhatsApp solid and
call quiet but not disabled, contrast, 44px targets, the number as a `tel:` link
rendering LTR at 25-38px, the website link opening with noopener, the route's
destination node, one h2, no form and no map embed, every icon from the global
family, no clipping, no horizontal overflow.

## The company-profile gateway

A compact bounded link at the end of the About introduction, before the trust
strip, inside the text column: label at the inline start, the family's arrow at
the inline end, thin sky border, white surface, brand-blue text, the global
control radius, no shadow. It moves the arrow 4px on hover and nothing else.
352x56 on desktop -- about two thirds of its column, so it cannot be mistaken
for the page's conversion action -- and full width below 768px. Opens in a new
tab with `noopener noreferrer`; nothing is embedded.

Verified at seven widths, 105 assertions: a real `<a>`, the approved wording and
nothing else, the destination, new-tab safety, position after the introduction
and before the trust strip, the decorative arrow from the global family, no
shadow, the 18px control radius, a 1px border, a 56px touch target, compact on
desktop and full width on mobile, no iframe, no overflow.

## Stage 14 — global visual polish

Six systems changes, each one a number the audit said was wrong. No new
decoration was added: the brief offers route fragments and overlaps as options
(§15/§16) and then rules against piling them on (§18, §48), so the impact here
comes from space, depth and measure instead.

**§04 — tablets were getting mobile spacing.** `--section-py` was
`clamp(3.5rem,7vw,7.5rem)`, whose 7vw middle does not clear its own 56px floor
until roughly 800px wide. Measured: 101px at 1440 (target 110-150), **56px at
768** (target 80-120), 56px at 390 (target 64-96) -- the whole tablet range
pinned to the mobile floor. A rem+vw middle starts above the floor immediately.
Now 120 / 86 / 68.

**§05/§21 — the measure was in `ch` again.** `--measure:64ch` is sized on the
Latin zero, which runs about 1.4x wider than an average Arabic advance, so the
page was running up to **77 characters** to the line against a 45-70 target.
Now `42rem`, plus two local caps where a column went full width. Desktop reads
30-56, tablet 31-61, mobile 23-41.

**§10/§12/§31 — the service cards had no elevation at all.** They separated
from the ground with a border and nothing else. They take the card step now and
the featured entry takes one step above it -- the only card on the page that
does -- so depth carries what a darker line was carrying.

**§11/§32 — one shadow language, four named levels.** The scale was retuned to
large blur, low opacity, short offset (nothing above 8%, nothing casting
further than it blurs), and the levels are named by role rather than size:
`--elev-surface`, `--elev-card`, `--elev-card-hover`, `--elev-featured`. A
component picks its depth from what it is.

**§46 — depth is a desktop-scale effect.** Below 768px each elevation step
drops back one, because the same shadow at phone size reads as grime around
every edge.

**§20/§44 — the service grid.** 24px on desktop read as a catalogue packed
tight and 16px on a phone let cards very nearly touch. Now 34.5 / 24 / 24.

**§22 — one heading rhythm.** Services put 20px between its h2 and its lead
where About gives 58 and Why-Us 70. It is 32px now, on a clamp.

**What was deliberately not done.** No new route fragments, no overlaps, no
extra graphics, no background re-alternation. §08's rhythm (white, mist,
navy) already exists and re-cutting it would be churn, not polish. §48 is
explicit: whitespace over decoration, contrast over shadow, composition over
components.

## Hero — the composition from the mockup

Rebuilt as one stage with two parts, matching the supplied reference. No copy
changed; every string was already on the page.

**Desktop.** The photograph takes the inline-end track and reaches the viewport
edge; the white panel takes the inline-start track, reaches its own edge, and
comes back over the photograph by `clamp(-5rem,-4vw,-2rem)` -- 58px at 1440.
Both are stretched to the same height by the grid, so their top and bottom
edges line up exactly (measured 80..685 for both at 1440). The panel's
inline-start padding is `max(--container-pad, calc(50vw - --container-wide/2))`,
which keeps its text on the same vertical line as every other section's
container edge however wide the viewport gets.

**A wrong turn worth recording.** The first attempt bled both parts outward with
`calc(50% - 50vw)` margins. The stage already spans the viewport, so those
margins pushed the panel 360px past the right edge and took its text with it.
Removing them entirely was the fix -- each grid track already reaches its own
edge.

**Stale rules were the real obstacle.** The old floating-image hero left eight
`.hero__media` / `.hero__media-frame` declarations behind, including
`align-self:end`, three `max-width` caps and two `aspect-ratio`s on a wrapper
element that no longer exists. They were quietly overriding the new composition
-- the photograph measured 60px tall until they came out.

**Mobile leads with the content, not the photograph.** A banner above the panel
costs about 200px and pushed the primary action off a 375x667 screen (measured:
CTA ending at 864 against a 667 fold). Keeping that action in the first screen
is a Stage 03 requirement the harness still enforces, so the photograph sits
below the panel and reaches up under it instead.

**The road belongs to the photograph now.** It moved inside `.hero__media`, so
it can only ever draw over the image, and it was restyled from sky (#D9E4F3,
invisible on a photo) to navy with a white dashed centre line.

**Then the crop came out.** The stretched box with `object-fit:cover` was
cutting the subject out of the frame at every width -- the whole point of this
photograph is the person and the ramp, and cover was throwing both away. The
photograph now shows whole: its own proportions decide its height, it fills its
column's width, and it carries no frame at all -- no border, no surface, no
shadow, no radius. It centres against the panel rather than stretching to it.
The `.hero__media` box only survives to clip the road that runs across it.

The hero harness now encodes that directly: object-fit is neither `cover` nor
`none` (nothing may crop it), the image is not letterboxed inside its box, and
the box has zero border width, no shadow, a transparent background and zero
radius (nothing may frame it).

**No intrinsic dimensions on the image.** It is an absolutely-filled bleed layer
-- `position:absolute; inset:0; object-fit:cover` -- so its own dimensions cannot
enter the layout, and they cannot be read from this environment either. The hero
harness assertion moved from "width/height are 1200x1200" to "the LCP hint is
preserved and the photograph fills its frame", which is what actually matters
once the frame drives the crop.

## Why-Us — sticky split, scroll-driven

The section changed shape, not content. All six chapters, their titles and
descriptions, the label, the title, the tagline and the photograph are the
same strings they were.

**The anchor holds, the story scrolls.** `.why__intro` became `.why__anchor`:
label, title, tagline, one line of orientation, and a six-node progress path.
Nothing else. That restraint is load-bearing -- a sticky element taller than
its viewport scrolls away instead of sticking, which is *the* failure mode of
this layout, so the anchor carries a `max-block-size` of the viewport minus the
header and is verified to fit. The photograph moved out of it and now opens the
scrolling story column.

**Chapter rhythm.** Above 1024 each chapter takes `clamp(15rem,34vh,20rem)` of
scroll with its content centred in that space, so the section reads pause /
discover / read / move rather than six stacked paragraphs. Below 1024 that is
dropped entirely -- at phone width it would be six screens of mostly nothing.

**The progress path** is the route language reduced to nodes on a dashed run.
It reports position; it is not a scrollbar and not a control. It mirrors
whichever chapter the existing IntersectionObserver has marked current by
*reading the DOM* rather than keeping its own counter, so it cannot drift out
of step. Below 1024 it is hidden: each chapter already carries its own number
on the same route, and a second copy would be noise.

**No scroll-jacking.** Nothing intercepts wheel, touch or key events. The only
JavaScript is the observer that was already there, plus a function that mirrors
its result onto six dots.

**Accessibility.** The progress path is `aria-hidden` -- every label it could
carry is in the story beside it. Under reduced motion the observer returns
early, so nothing is emphasised and nothing is dimmed: all six chapters render
at full strength. Inactive chapters were never dimmed with opacity in the first
place; emphasis moves through the node, the numeral and the title colour, so
text contrast never drops.

**The photograph is shown whole here too.** It had `aspect-ratio:3/4` with
`object-fit:cover`, which cropped it. Same treatment as the hero now: its own
proportions, no crop. The rule that stretched it to meet the journey's last
line went with the layout that needed it.

## Services — pinned showcase

A different mechanic from Why-Us, deliberately. There a sidebar anchor holds
still and text scrolls past it. Here the whole stage pins and the service *on*
it transforms, driven by an empty track that supplies the scroll distance.

**Stage and track share one grid cell.** The track's height defines the scroll,
the stage sticks inside it. No negative margins, no measured offsets, nothing
to drift out of sync when type or spacing changes.

**The grid is the base state, not a fallback bolted on.** Without script, below
1024px, or under reduced motion, the track collapses to `display:none` and the
seven slides lay out exactly as the grid always did. The pinned behaviour is
gated on `.js` + `min-width:1024` + `prefers-reduced-motion:no-preference` in
CSS, and on the same conditions in script.

**One service on stage at a time.** The step whose centre is nearest the
viewport's centre wins, so a step shorter than the observer band can never leave
two services active -- the failure Why-Us hit and this avoids by construction.

**Two accessibility details that are not decoration.** Inactive slides keep
`opacity:0` rather than `visibility:hidden`, so all seven headings and
descriptions stay in the accessibility tree and a screen reader can browse the
whole catalogue rather than only whatever happens to be on stage. What that
breaks is the tab order -- a transparent link is still tabbable -- so each
slide's single link takes `tabindex="-1"` while it is off stage, verified across
a full scroll sweep. And focus moving into a slide brings that slide on stage,
so keyboard use stays coherent when focus arrives from anywhere but the tab key.

**Crossing the breakpoint hands the section back.** A `matchMedia` listener
clears every active class and every `tabindex` when the viewport drops below
1024, because in the grid all seven must be visible and reachable again.

**No scroll-jacking.** No wheel, touch or key handler exists in this section.

**One bug the behaviour harness could not see.** The stage slide sets
`grid-template-columns`, but the base card is `display:flex` -- and
grid-template-columns does nothing to a flex container. Every behavioural
assertion passed (81/81: active states, progress tracking, tab order, both
fallbacks) while the stage rendered as a stacked card with a full-width image.
It took a screenshot to catch. The harness now asserts the composition too:
the slide computes to `grid` with two tracks, image and information sit side by
side rather than stacked, the image carries the greater width, and the CTA does
not span its column.

## How We Work — progressive journey

The third distinct interaction, and deliberately unlike the other two. Why-Us
pins a sidebar and scrolls text past it; Services pins a stage and transforms
what is on it; here nothing pins at all -- a route draws itself as you scroll
and the chapters light up in turn.

**From horizontal to vertical.** The section was three nodes across a curved
arc. It is one vertical axis now, with the chapters alternating around it above
1024 and stacked at the reading edge below. The alternation is what stops three
equal steps reading as a card row; the axis is what makes them read as one
route. Every node sits exactly on the line -- verified, not eyeballed: node
centres and path centre agree to within 2px at all seven widths.

**The route is three elements, not an SVG path.** A dashed track for the whole
run, a fill for the distance covered, and a head riding the join. The fill is a
`scaleY` transform rather than a height, so progress runs on the compositor and
no frame triggers layout. An SVG `stroke-dashoffset` would have been the
obvious choice and is worse here: it cannot guarantee the nodes land on the
line when chapter heights differ, which they do.

**Progress is a pure function of scroll position** -- where the viewport's
middle sits inside the journey -- not an accumulator. Scrolling fast, slow, or
backwards all land on the same value, so a fling cannot desynchronise it. Reads
are batched into one rAF per scroll burst, and the only measurement kept is the
path's height, read on resize rather than per frame. The listener is passive
and only reads: scrolling itself is untouched.

**Three states, and two of them stay fully readable.** Done, current, upcoming.
Emphasis moves through the node and the title colour -- never through the
opacity of the Arabic, so no chapter is ever dimmed. Verified at every scroll
position: exactly one current chapter, and the completed count always equals
its index.

**Under reduced motion none of the script runs.** CSS draws the route in full,
the travelling head is removed, the node scale is dropped, and all three
chapters render at full strength. Without script at all, the same.

**How-We-Work left the shared emphasis observer**, which only knows one state.
Values still uses it.

**Two bugs the first run caught.**

- The route ran 6px beside the nodes on every phone width. The node shrinks
  from 72px to 60px under 480, and the route's offset was a hard-coded 35px
  derived from the larger one. Patching the number would have fixed the symptom;
  instead the marker's diameter is now a single token, `--hww-node`, and the
  grid column and the route offset are both derived from it. A future
  breakpoint that resizes the node cannot desynchronise them. Verified: node
  centre and path centre agree exactly.
- The alternation used `nth-child(even)`, but the route span is the journey's
  first child, so it was counted and chapter 01 was handed the wrong side of the
  axis. `nth-of-type` counts only the chapters.

---

## Fix — the Services section felt frozen

Reported as "the website freezes when I reach the services section". It was not
a hang: no long frame anywhere in a full scroll sweep, worst 24ms. Three
separate defects in the pinned showcase, all mine, combined into something that
reads as a stopped page.

**The pinned run was five screens long.** Seven steps at `min-block-size:
clamp(22rem,70vh,32rem)` is ~4137px of scrolling at 1440, over which the
composition barely changes. The section measured 4237px at 1440 and 4506px at
390. Steps are now `clamp(13rem,40vh,19rem)` and the showcase is 2128px — a
deliberate pin rather than a wall.

**The stage could be genuinely blank.** Throttling the CPU 6x and counting how
many slides had opacity above 0.05 at each scroll position gave, at 1440,
`0,0,0,0,1,1,1,2,0,0,1,1,1,2,0,1,...` — eight positions with nothing on the
stage at all. Two causes: before the first observer callback no slide was
active, and the observer band can be empty between steps. Now the first slide
carries `is-active` in the markup, so it is correct before any script runs;
`pick()` clamps to whichever end of the track it is past when the band is
empty; and `sync()` falls back to the first slide. Blanks at 1440 fell 8 to 1,
and to 0 once the crossfade settles.

**The crossfade was 420ms.** At `--dur-slow` the stage spends a visible beat
mid-dissolve. Now `--dur-normal`, 260ms.

Nine assertions added to `verify-services.js` guard all three: the showcase
must stay under ~3.4k of pinned scroll, and across nineteen parked positions at
1440/1280/1024 the settled stage must never be blank while on screen and never
show two services at once. 102/102 pass.

Three `file://` prefixes had been stripped from the harness's `goto` calls at
some point and it could not run at all; restored.

---

## Stage M01 — mobile global UX architecture

Mobile was rethought, not shrunk. Nothing in the identity moved: the logo, the
palette, both typefaces, the icon family, the Arabic copy, the section order
and the route language are untouched. What changed is what a phone needs.

Audited first, at 320 / 360 / 375 / 390 / 412 / 430 / 768 plus landscape
844x390, before a line was written. `ux/verify-mobile.js` — 98 assertions —
holds every finding below.

**Already correct, and now guarded.** No horizontal page scrolling at any
width, at any scroll position. Container gutter 20px. Body type 17px at 1.75
leading. Form controls at 17px, above the 16px floor that stops iOS zooming
the page on focus. The header compacts 64 to 56 on scroll. Reduced motion and
no-script both render the whole page. Document height is stable through a full
scroll sweep at every mobile width — 0px of shift.

**Twelve targets under 44px, all in the footer.** Two navigation lists at 38px
and three contact links at 38px, with the site link at 18px. Height now comes
from the target itself and the list gap drops 12px to 4px, because a 44px row
does not need a gap to be separable. Footer height is unchanged; the count is
zero at every width.

**Arabic headings were set at display leading.** `--lh-tight` is 1.16, which is
right for a line that runs once. On a phone every h2 carrying a real sentence
wraps, and at 1.16 the descender of ج and the dots under ي meet the next
line's ascenders. Fixed at the token — `:root{--lh-tight:1.3}` below 768 —
because each section title sets `line-height:var(--lh-tight)` through its own
class, and a selector-by-selector fix would have missed the next one added.
Nothing above 767 moves.

**Safe-area insets were declared but never consumed.** `viewport-fit=cover`
has been in the meta since Stage 01, so in landscape on a notched phone the
20px gutter was all that stood between Arabic text and the notch. The gutter,
the drawer and the footer now take whichever is larger, their own value or the
inset. In RTL inline-start is the right edge, so the right inset comes first.

**Taps were held for a double-tap.** `touch-action:manipulation` under a coarse
pointer drops the ~300ms the browser otherwise waits to see whether a tap is
the start of a double-tap-to-zoom. It is the largest perceived-latency change
on the page and it costs one declaration. The tap highlight becomes brand blue
at 14% rather than the platform's grey-black wash.

**The services section was 4506px at 390** — five and a third screens of
photographed cards. The photographs stay: all seven were supplied for these
cards and each shows its own service, so hiding six of them on a phone would
undo that. The height came out of everything around them instead — the media
band moves 4:3 to 3:2, a photographic ratio rather than a crop; the icon chip
steps down with it; the internal gaps tighten one step. 4506 to 4160. A phone
is not the place to make seven photographed services short, and a swipe
carousel would have been the wrong answer for an audience that includes people
with limited hand mobility: it trades a scroll everyone can do for a gesture
some cannot.

**The drawer was 600px of blank white.** Measured at 390 the panel is 780px
tall and its five items plus the CTA use 180px of it. The two direct-contact
actions the footer already carries move into that space — the same two links
with the same two labels, no new wording. On a phone, someone opening the menu
is more likely to want to call than to read another section. The last item also
loses its rule, which was drawing a line into the void.
*To revert: delete `.mobile-nav__direct` from the markup and its block from
STAGE M01·6.*

**The hero's primary action fell below the fold on short screens.** At 360x640
it finished 9px inside — not a margin; one notification banner and it is gone.
At 320x568 it was 87px under. The rule that matters is height, not width, so
the fix is a height query: below 700px of viewport the hero tightens by one
spacing step in five places, and below 360 wide by one more. Nothing is
removed — eyebrow, title, lead and all three audience cues stay, they simply
stop being spaced for a tall screen. 320x568 now finishes 9px inside the fold,
360x640 with 94px to spare.

### One defect found and not fixed

`verify-header.js` fails one assertion: the document grows 60px on first scroll
at 1024 and above. It is not a regression — it reproduces identically on the
commit before this stage. The cause is `03.webp` in «ما يميزنا»: above 1023 the
photograph is shown whole, so `.why__media img` has no `aspect-ratio` and the
image carries no `width`/`height`, and its box is zero until the bitmap
decodes. Below 1024 the same image has `aspect-ratio:4/3` reserved, which is
why every mobile width measures 0px of shift.

The fix is one line, and it needs one number this environment cannot read:
`i.ibb.co` is blocked by the network policy (403 at the agent proxy), so the
intrinsic dimensions of `03.webp` and `h001.webp` are unknown here. Guessing a
ratio would either crop a photograph that is meant to be shown whole or
distort it. With the two pixel sizes, both images take `width`/`height`
attributes and the shift goes to zero at every tier.

### Deliberately not changed

Section grounds alternate white / #F6F8FB / #EEF3FA and no two neighbours share
one, but the steps are only 1.06-1.12 in relative luminance — soft on a phone
in daylight. Raising them means changing brand values, and the eyebrow plus
68px of section padding already marks each boundary, so they stand.

The blanket `@media(max-width:479px){.btn{width:100%}}` stands too: measured at
390 every call to action is already full width, and the service card's action
was widened on purpose in an earlier stage so it can be tapped without aiming.

---

## Stage M02 — the mobile hero

Composed for a narrow screen rather than folded down from the desktop one.
Identity untouched: same logo, same blues, same two faces, same icon family,
every word of the Arabic, and the same two-column desktop split above 1024.
What changed is the order things arrive in, the space between them, and how
the photograph reserves its place. 75 assertions in `verify-mobile.js`.

**The photograph was not in the first screen.** Measured before: at 375x667 it
began at 626 and ended at 715, entirely below a 667 fold; at 360x640 it started
at 649. The first screen showed a label, a headline, a lead, three audience
cards and two buttons — everything except the picture that explains what the
company does. The three cards were taking 180-235px of it, standing between
the lead and the action.

Re-ordered to §06's priority — headline, primary action, photograph, then the
supporting cues — the photograph now ends at 606 of 640, 615 of 667, 711 of
844. Nothing was removed: all three cues keep their icon, their title and their
sentence, they just sit below the picture now.

**The order is visual only.** `order` on a flex column, with the DOM left
exactly as it was, so the reading order for a screen reader and the tab order
are both unchanged. That is only safe because nothing that moved is focusable —
the audience cues are spans in list items, not links — and there is an
assertion that keeps it that way: every focusable element in the hero must
still run down the screen.

**The mobile panel was a rectangle drawn around nothing.** Measured
`rgb(255,255,255)` on a `rgb(255,255,255)` ground, with a 1px #E4E9F0 border
and a shadow at 5% — a white card on white. `display:contents` on the panel and
its content wrapper hands their children straight to the stage, which both
removes the card and gives every element one ordering context. The desktop
panel, which rides over the photograph and genuinely needs its surface, is
untouched.

**The photograph now reserves its box.** `block-size:clamp(12.5rem,34vh,18.75rem)`
with `object-fit:contain`. Two things follow. Nothing below it moves when the
bitmap lands, so the last unresolved shift from M01 is closed at mobile — and
it mattered more here than anywhere, because the photograph is now inside the
first screen. And contain cannot crop: §14 asks that the driver, the passenger,
the wheelchair and the ramp survive the mobile crop, and the only way to
guarantee that against a ratio this file does not declare is not to crop at
all. The image is a cut-out with transparent margins, so the space contain
leaves is transparent — air, not letterbox bars.

**Two full-width buttons were competing by shape.** Same height, same width,
different fill. The primary keeps the full content width at the large size; the
secondary drops to the standard 48px control and to its own width, centred.
At 768 neither is full width — stretched across a tablet the primary measured
1350px, which reads as a banner — so both sit on one row, primary on the
reading edge. That row is also the first step toward the desktop composition,
which is what §27 asks for.

**Press feedback.** The primary already darkened and dropped its shadow, but on
a touch screen there is no hover to precede that. A 1.5% scale, in and out, no
overshoot. Transform only, so it cannot cost a frame.

**Entrance.** Label, headline, lead, action — reading order, 90ms apart, the
last starting at 270ms. The delay is on the fade only; nothing is ever made
unclickable, so the primary action is live from first paint. Under
prefers-reduced-motion every delay clears and the hero arrives at once.

**No scroll indicator was added.** At 375x667 the photograph ends at 615 and
the first audience card is already peeking at the fold. That is the cue §21
describes, and it costs nothing.

### Two deviations, both flagged

**§16/§17 asked for a radius and a soft shadow on the hero image; it stays
frameless.** The instruction "keep image frame invisible… don't crop the image"
was given twice, about this exact photograph, and the image is a cut-out with
transparent margins — a radius would clip corners that are already transparent,
and a shadow would trace the *box*, printing a rectangle around a floating
subject. That is the frame that was rejected. Separation comes from the space
above it and the tinted cue cards below instead.
*To apply the brief literally: add
`.hero__media img{border-radius:var(--radius-lg);box-shadow:var(--elev-card)}`
inside the M02·4 block.*

**§28 asked for responsive image sizing; there is one source.** Generating
width variants needs the file, and `i.ibb.co` is blocked here (403 at the
proxy). The reserved box at least tells the browser the display size up front.
Supplying two or three widths would let this become a `srcset`.

---

## Terminology standard — «ذوي الاحتياجات الخاصة»

Project-wide replacement of the retired disability term and its variants.
`verify-terminology.js` holds the rule: 44 assertions, run it before any
content change ships. **This log deliberately does not quote the retired
strings** — the harness scans every file in the repository, including this
one, and a design note is exactly the kind of place a forbidden term gets
copied back out of. The harness itself is the canonical list.

**Fourteen occurrences across four files.** Nine in `index.html` — the meta
description, the Open Graph description, the Twitter description, the hero
audience card, the About lead, a «ما يميزنا» chapter, the Services intro, one
`alt` attribute and one service description — plus three in `brand/index.html`,
one in `brand/design-system.html` and one in the Stage 01 UX note that quoted
the card label.

**Grammatical case was preserved, not flattened.** The genitive form takes
«وذوي الاحتياجات الخاصة»; the standalone hero label, which is nominative, takes
«ذوو الاحتياجات الخاصة»; and the indefinite form in the brand photography note
takes «ذوو احتياجات خاصة». A single literal find-and-replace would have made
three of the fourteen grammatically wrong.

**Two sentences needed rewriting, not replacing.** The new term contains the
word «احتياجات», and in two places that collided with wording already there:

- The «ما يميزنا» staff line ended «…**واحتياجاتهم الخاصة** أثناء عملية النقل»,
  which after the swap read «…وذوي الاحتياجات الخاصة واحتياجاتهم الخاصة…» — the
  same phrase twice, three words apart. The approved term already carries
  "their special needs", so the trailing clause is now a repetition of itself
  and is dropped.
- «خدمات النقل المتخصص **لتلبية احتياجات** كبار السن وذوي الاحتياجات الخاصة»
  repeated «احتياجات» four words apart. The sentence closes with «الذين
  يحتاجون إلى وسائل نقل مجهزة ومساعدة خاصة», which already states the need, so
  the preposition alone carries it.

Both keep the original meaning and add no new content. The brand book's list of
photography practices to avoid named the condition rather than the people; it
now reads «تصوير ذوي الاحتياجات الخاصة من زاوية الشفقة», which forbids the same
practice in the approved terms.

**The term is 21 characters where the one it replaced was 11, and one layout
could not absorb it.** The hero's audience cues are a three-up grid sized for a
short label. Measured after the swap: the middle card's title ran to 3 lines at
1024 and 2 at 1440 while its neighbours stayed at 1, so the three descriptions
started at 401 / 445 / 401 — a stagger in a row that has to scan as a row.

Corrected in the container, never in the term. From 1024 to 1279 the panel is
half the viewport and each cue gets about 98px of text width, which is not
enough for the term at any line count that looks deliberate; the cues take the
row treatment the phone tier already uses — icon beside label, three stacked
rows across the full panel — and come out 30px shorter than the grid was. From
1280 the grid has room, so instead the label reserves two lines on all three
cards, the same idiom the service cards use for the same reason. Every
description is back on one baseline at 1280 / 1360 / 1440 / 1600 / 1920.

Nothing else needed a correction: at 320 / 360 / 375 / 390 / 430 / 768 / 1024 /
1280 / 1440 no element carrying the term overflows its box and no width gains a
horizontal scroll.

**The rule is enforced, not just applied.** `verify-terminology.js` scans every
HTML, MD, JS, JSON, CSS and SVG file in the project for the forbidden strings,
then loads the rendered page and walks every text node plus `alt`,
`aria-label`, `title`, `placeholder`, `value` and `content` — because a source
grep cannot prove what actually reaches a reader. It also asserts the approved
term is present in the page, in `alt` and in all three meta descriptions, that
it overflows nothing, and that the hero cue row stays aligned.

---

## Stage M03 — «من نحن» on mobile

An editorial introduction to the company rather than the desktop block folded
down. Identity untouched: the label, the heading, the dashed route under it,
the icon nodes joining the three paragraphs, the photograph, and every word of
the approved Arabic including the approved terminology in the lead. What
changed is the order, the crop, the weight of the fact row, and the space
between them. 79 assertions added to `verify-mobile.js`.

**The photograph was losing 40% of itself.** The source declares 1200x1500 — a
4:5 portrait — and the mobile frame was asking for 4:3 with `object-fit:cover`.
That shows a 1200x900 band of a 1500-tall picture: 20% cut off the top and 20%
off the bottom, because `object-position` defaults to the centre. The scene is
a specialist helping a passenger at a vehicle ramp — a vertical composition,
heads at the top and ramp at the bottom, exactly where the crop was cutting.
The frame takes the source's own ratio now, so nothing is removed at any width,
and it is the same crop the approved desktop composition already showed. There
is an assertion that reads the ratio off the image's own `width`/`height`
attributes and requires the frame to match, so a future ratio change cannot
quietly reintroduce a crop.

**Key information now comes before the doorway.** The profile CTA sat above the
fact row, so the invitation to read more arrived before the reasons to want to.
The facts move ahead of it — and the source order moves with them, so a screen
reader gets the same sequence. Desktop's explicit grid rows were swapped to
match rather than left as they were: the two tiers disagreeing about order is
the WCAG 1.3.2 problem in miniature, and there was no reason to keep it.

**The facts stopped being a dashboard.** Four labels drawn from the approved
copy — no new claim, no number — wrapped in a white surface with a border, a
shadow and internal dividers: a card grid sitting directly under three
paragraphs that are deliberately *not* cards. Below 1024 the chrome is gone and
the section ground shows through; one rule above the block separates it from
the reading, and the hairlines between cells are all the structure four short
labels need. Same four items, same icons, same words, one weight quieter. The
desktop card is untouched, and asserted to stay that way.

**The lead was set at heading size.** `--fs-h3` is 20px, and 20px in a 320px
column puts 23 Arabic characters on a line and runs the approved sentence to
seven of them — short ragged lines that read as a second heading rather than an
introduction. One step down to `--fs-body-lg` below 768 gives about 26 to the
line at the same 1.6 leading. The copy is untouched; only its size is. It stays
navy, stays semibold, and stays the heaviest text in the section after the
heading.

**The doorway says where it goes.** It already opened in a new tab with
`rel="noopener noreferrer"`; nothing said so. It now carries an external-link
mark instead of the internal back-arrow — mirrored for RTL, so the page sits at
the reading edge and the arrow leaves through the corner it opens — and a
visually-hidden «(يفتح في صفحة جديدة)» for screen readers.

**Two bugs the new assertions caught, one of them old.**

- `.js [data-reveal]` is (0,2,0) and sets the whole `transition` shorthand, so
  it had been overriding `.about__profile`'s own (0,1,0) rule ever since the
  reveal was introduced. The CTA's hover was switching instantly rather than
  easing — invisible as a bug, because the colours still changed. Matching the
  weight restores it and keeps the entrance identical.
- The press state uses `scale`, not `transform`. The reveal already owns
  `transform` for its 16px lift and one property cannot hold two durations;
  `scale` is a separate animatable property that composites the same way, so
  the two cannot collide.

**And one in the harness itself.** The rule-walker used
`if (rule.cssRules) recurse`, which was written before CSS nesting gave every
`CSSStyleRule` a `cssRules` list of its own — so it recursed into every leaf
and never read a single declaration. It reported "no `:active` state" against a
stylesheet that had three. Fixed to take declarations wherever they are and
recurse only into groups that hold rules.

### One thing left alone, deliberately

The About section is the only one on the site whose label pill and heading
carry the same words — «من نحن» twice, one above the other. Every other section
pairs a distinct label with a distinct title («لماذا عون الدرب» over «ما
يميزنا», and so on). It is a duplicated line at the top of the section's first
screen, but the label is part of a system all seven sections share, and the
alternative is either inventing a title or dropping an approved element from
one section only. Both are content decisions, not layout ones.
*To hide the pill here alone: `#about .about__label{display:none}`.*

---

## Stage M04 — «ما يميزنا» on mobile

The desktop tells this story with a sticky anchor beside a scrolling column. A
phone has no beside, so the same idea is told down the page: one route, six
chapters on it, the one you are reading lit and the ones behind you filled in.
Identity untouched — same label, heading, tagline, six approved chapters with
their numbers, icons, titles and sentences, the photograph, and both closing
actions. Nothing added, nothing cut. 66 assertions in `verify-mobile.js`.

**The photograph was being stretched, on every phone.** `.why__media img` had
`aspect-ratio:4/3`, and through the global reset it had `height:auto` with no
`object-fit` — so the default `fill` squashed the bitmap into a box of the
wrong shape. Measured with a 3:2 stand-in: a 350x263 box against a source ratio
of 1.5, an 11% horizontal squash. A circle in the source rendered as an
ellipse, which is what a face and a vehicle were doing too. That is worse than
a bad crop — a crop loses the edges, this deforms the middle.

The box is a real height now with `object-fit:contain`, which can neither crop
nor stretch whatever the source's true ratio turns out to be. Same reasoning as
the hero, and for the same reason: this file does not declare this image's
dimensions and the host is unreachable from here. The frame keeps its mist
surface so the space `contain` leaves reads as the frame rather than a gap, and
it takes the card step of the depth system — which is also the "subtle shadow,
clean surface" the brief asks for. Reserving the height means nothing below the
photograph moves when it loads, so the section's layout shift is gone at mobile.

**Five hairlines were cutting the story into six blocks.** A rule sat between
every pair of chapters. The brief rules them out and asks for whitespace and
the progress line instead, which the section already had underneath. The rules
are gone and the air between chapters roughly doubles.

**The route now reports position.** One line spanning the whole list cannot
know where the last node is: it ended 30px from the list's bottom edge while
the last node's centre is much further up, so a dashed line hung **93 to 139px
below chapter 06 at every width** — measured, at 360 / 390 / 430 / 768 / 1024 /
1440. It is now one segment per gap, each drawn from a node's bottom to the
next node's top, so it cannot overshoot at either end however tall a chapter
runs. Segments are also what make the progress ladder possible: a segment
behind you is solid brand blue, a segment ahead is the dashed route. No new
element and no second indicator competing with the story — the line that was
already threading the chapters now carries the progress.

**And it was running 12px beside the nodes from 768 up.** The offset was typed
as 59px against a real node centre of 72px. The number column, the node and the
gutter between them are one set of tokens now, and the route derives its
position from them — the same fix, and the same lesson, as the journey
section's `--hww-node`. This one corrected desktop and tablet as well as
mobile; there is an assertion at every width that the route and the first
node's centre agree to within a pixel.

**Three chapter states.** Reading: the node takes a ring and a filled ground,
the number goes navy and bold, the title goes navy. Behind you: the node's
border turns brand blue and its segment fills. Ahead: the sky border it always
had — quiet, but at full contrast and fully legible, because nothing here is
communicated by opacity. All three are added by script; without it, and under
reduced motion where the script does not run, all six chapters render at full
strength and the route stays dashed throughout.

Swept at 31 scroll positions across three phone sizes: never two chapters lit,
never a gap once the story starts, never a step backwards, the filled route
always matching the chapter reached, and the story always reaching chapter 06.

### Deliberately not done

**No tonal shift between chapters.** The brief allows a very light background
change per chapter within the existing palette. Six alternating tints down one
section reads as stripes, not as a story, and the chapters are already
distinguished by the number, the node, the route state and the whitespace.

**No separate progress widget.** The brief sketches a small vertical indicator
beside the story. The section already had that geometry — a number column, a
node column and a route behind them — so the indicator is that route rather
than a second one drawn next to it.

**The desktop route still overshoots its last node by about 137px.** The
per-segment fix depends on the node sitting at the top of its chapter, which is
true below 1024 and not above it: desktop chapters are tall blocks with their
content centred, so a segment cannot know where the next node's centre falls.
Correcting it properly needs either a measured value from script or a change to
the desktop chapter rhythm, and neither belongs in a mobile stage.

### Still open, and now one line away

`verify-header.js` has failed the same assertion since Stage M01: the document
grows 59px on first scroll at 1024 and above, because `03.webp` is shown at
natural proportions on desktop with no reserved box. Two stages ago this needed
the image's pixel dimensions. It no longer does — M04 just proved the
ratio-agnostic fix works, in this very section: a reserved height plus
`object-fit:contain` inside the mist frame. Applying it above 1024 as well
would close the last layout shift on the site. The cost is a band of mist above
and below the photograph on desktop whenever its ratio does not match the
reserved box, which is a visible change to an approved composition — so it is
offered rather than taken.
*One line, inside the M04·1 block, with the media query widened:*
`.why__media img{block-size:clamp(11rem,30vh,15rem);object-fit:contain}`

---

## Stage M05 — «خدماتنا» on mobile

Desktop pins one service on a stage while the track beside it scrolls. A phone
gets the catalogue instead: seven cards, each leading with its photograph, and
the one you have reached carrying the elevation. Identity untouched — the same
seven approved services in the same order, same numerals, same outline icons,
same photographs, same titles and sentences, same «تواصل معنا» on every card.
84 assertions in `verify-mobile-sections.js`.

**The cards were touching.** `.services__grid` still carries the gap, the
two-up rule and the three-up rule — but that class left the markup when the
pinned showcase replaced it, so none of it had applied since. Measured at 360,
390 and 430: the gap between all six pairs of cards was **0px**. Seven
photographed services stacked edge to edge with only their 1px borders between
them. They now sit `clamp(1.5rem,5vw,2.25rem)` apart, which is the single
biggest change in this stage and the one that makes it read as a catalogue.

**The photograph leads the card.** The order was icon and numeral, then title,
then photograph. A catalogue card is recognised by its picture first, so the
photograph moves to the top and bleeds to the card's own edges, where the
card's radius clips it. `order` does it, so the markup — and with it the
reading order and the tab order — is untouched, and the one focusable thing in
the card, its action, is still last in both. There is an assertion for exactly
that.

**The service you have reached.** Its border moves to sky, it takes the hover
step of the elevation scale, and its icon chip fills and grows 6%. The cards
around it keep the card step at full opacity and full contrast — quieter, never
dimmed, never blurred, nothing hidden. Three channels carry the state, so none
of it depends on opacity, and the card itself never scales, so no neighbour
moves while it is being read. Both of those are asserted across a 35-position
sweep at three phone sizes, along with: never two lit, no gap once it starts,
never backwards, and always reaching the seventh service.

This is deliberately not the mechanic «ما يميزنا» uses. That section lights a
rail running between its chapters; this one lifts the card surface. Same idea —
you are here — told with different means.

**The card assembles.** Photograph, chip, title, sentence, action, 60ms apart,
the last starting at 240ms. It rides the card's own reveal, so without script
every card renders complete and the global reduced-motion rule clears all five
delays.

### Deliberately not done

**No progress counter.** The brief allows one where it improves orientation and
warns against adding it automatically. Every card already carries its own
numeral, 01 through 07, in a chip on the reading edge — a separate "03 / 07"
would be the same information twice, and «ما يميزنا» already owns the
node-ladder idiom.

**The seven photographs keep `object-fit:cover` at one ratio.** The brief asks
for a consistent ratio across the cards and, separately, that a mobile crop
never remove the subject. Those pull against each other when the sources'
dimensions are unknown, and `i.ibb.co` is unreachable from here. Consistency
won, because seven differently-letterboxed cards would break the catalogue
scan that is the whole point of the section. `object-position` stays centred,
which is the safest default for a photograph of a person beside a vehicle.
Adding `width`/`height` to the seven `<img>` tags would let this be verified
rather than assumed.

### The harness was split

`verify-mobile.js` passed ten minutes a run once M04 landed, which is long
enough to stop running it. It is now two files: `verify-mobile.js` keeps the
global architecture and the hero (M01, M02), and `verify-mobile-sections.js`
holds the sections (M03, M04, M05). Same assertions, roughly half the wall
clock each, and either can be run alone while working on one stage.

### Two assertions this stage got wrong first

Worth recording because both would have been easy to "fix" in the wrong place.

- A full-width service action is a phone decision. The first version asserted
  it at every width and failed at 768, where the card is 646px wide and a
  button spanning it is exactly the oversized CTA the brief rules out. The
  assertion was too strict, not the CSS.
- "No card is ever dimmed to say another is active" caught the site's own
  entrance reveal instead: cards below the fold sit at opacity 0 until they
  arrive, and the sweep was reading them 110ms after a 420ms fade began. The
  test now waits for the entrance to settle and only considers cards that have
  finished arriving. The property being tested is real; the first two ways of
  asking for it were not.

---

## Stage M06 — «كيف نعمل» on mobile

The section already had the right idea: one route, three stages on it, a fill
that follows the reader, three node states, no scroll hijacking, and a
reduced-motion path that is simply drawn. Most of this stage was checking that,
finding out where it was quietly wrong, and giving the three steps room to be a
journey. 79 assertions in `verify-mobile-sections.js`.

**Three steps were sharing half a screen.** Measured at 390, the whole journey
was 372px — all three stages visible at once inside an 844px viewport, so the
route filled in a fraction of a scroll and there was nothing to progress
through. Each stage now has a floor of `clamp(9rem,26vh,13rem)`, taking the
journey to 624px. It is a floor and not padding: a stage whose sentence runs
long simply grows past it, and nothing here exists to make the animation
longer — it exists so a step can be read before the next one arrives.

**The route ran past its own last node.** `inset-block:calc(node/2)` at both
ends is right at the top, where the node sits at its stage's top edge, and
wrong at the bottom, where the last stage's title and sentence run on past it.
Measured: the dashed line hung **43px below node 03 at 390 and 100px at 1440**.
Script measures both ends from the nodes themselves now, once and on resize,
and the CSS values are the fallback. Every width reports the track beginning
and ending on a node centre to within a pixel — including desktop, which had
been overshooting since the section was built.

**And the measurement had to avoid the reveal.** The first version measured
with `getBoundingClientRect`, which includes the entrance reveal's
`translateY(16px)` — so on first paint the track sat 16px below both nodes and
stayed there until something forced a resize. `offsetTop` accumulated up the
node → marker → stage → journey chain is layout, which no transform can reach.

**The progress span was still typed in.** `r.height - 72` and `r.top + 36` are
the desktop node's size and half of it. On a phone the node is 60, so progress
started six pixels late and finished six early. Both numbers come from the same
measurement as the track now. This is the third time this section's geometry
has been corrected by deriving it instead of typing it; there is nothing left
in it that knows a node's size by heart.

**The journey now finishes.** When the route fills, `is-complete` goes on the
journey and the last node takes a quiet filled ground. It reads as arrived
rather than as having stopped on whichever step was lit last.

### A regression the old harness caught

The first version of that completion state *removed* `is-current` when the
route filled — "finished, so nothing is current any more". `verify-how-we-work`
failed three assertions immediately: at 375, 390 and 430 the third step went
straight from upcoming to finished without ever lighting, because its centre
only reaches the middle of the screen after its node has already passed. The
brief ties completion to the final step *becoming active*, so the two are not
alternatives: `is-complete` is added alongside `is-current`, not instead of it.
A new assertion now requires every stage to get its own active moment.

### A site-wide defect this stage turned up

Chasing why one stage was rendering at `opacity:0`, the entrance reveal turned
out to lose content after any jump. An IntersectionObserver only reports a
*change*, and a jump — an anchor link, a restored scroll position, a hard fling
— can carry a block from below the viewport to clean above it without ever
landing on an intersecting frame. Measured: **one jump to `#values` left 42 of
the 47 blocks above the viewport still invisible**, so scrolling back up made
the page assemble itself a screen at a time instead of simply being there.
Every navigation link in the header, the drawer and the footer is such a jump.

A pass over what is still pending fixes it: anything the reader has already
gone past is marked seen. It costs one array walk per scroll burst while
anything is pending and unhooks itself when the list empties. A large top
`rootMargin` was tried first and got it down to 2 — and the two it missed were
the blocks at the very top of the page, because "large enough" means a number
big enough for this page. Four assertions in `verify-mobile.js` cover it: three
jump targets leave nothing invisible behind them, and the ordinary downward
contract is unchanged, with all 64 below-fold blocks still arriving on their own.

**Without script the route is now absent rather than wrong.** Nothing measures
its two ends, and the CSS fallback can only be right at the top — measured, it
ran 148px past node 03. The route is decorative and `aria-hidden`; every step
carries its own number, node, title and sentence, so the journey is complete
without it. A line that stops in the wrong place is worse than no line.

### Deliberately not done

**No staggered reveal inside a step.** The brief allows node → icon → title →
description to arrive in sequence. «خدماتنا» just took that idiom for its
cards, and this section's distinctive mechanic is the route itself; giving both
the same assembling entrance would blur exactly the difference the brief asks
for. There is now an assertion that the three sections keep their own
mechanisms: «ما يميزنا» its per-gap connectors, «خدماتنا» its card state with
no rail at all, «كيف نعمل» one continuous track with a fill and a travelling
head and no per-gap connectors.

**No CTA.** The section has never had one, and the brief says not to add one
for decoration.

---

## Stage M07 — the CTA system

One family, three levels, a few named variants, and the geometry of all of them
from one place. Nothing here changes a label, a colour or a destination; it
removes the drift that had crept in section by section, and fixes what
measuring every action at once turned up. `verify-cta.js` — 44 assertions at
390, 768 and 1440 — is the consistency audit as a test.

### Two contrast failures that predate this stage

**Outlined buttons had a 1.5:1 boundary.** An outlined button is identified by
its outline, and `--border-strong` measures 1.5:1 against the page — well under
the 3:1 WCAG 1.4.11 asks of a control's boundary. At a glance the button *was*
its label and nothing else. The boundary takes the brand blue: 4.63:1 on white
and 4.15:1 on the mist of the featured service card. It is also the colour the
border already moved to on hover, so the resting state now keeps the promise
the hover made, and hover keeps its tinted surface so the two stay distinct.
The company-profile doorway was worse at 1.21:1 and takes the same treatment.

**Secondary labels were below AA on two of the three grounds they sit on.**
`--color-primary` at the button's 16px semibold is not "large text" by any
definition WCAG uses, so it needs 4.5:1. Measured: 4.63 on pure white, **4.35
on the page ground and 4.15 on the featured card's mist** — and secondary
buttons appear on all three. The label takes the navy (7.65:1 at worst); the
boundary keeps the brand blue, so the control is still identified in the
brand's own colour and only the text darkens. Navy is what every heading on the
site is already set in.

Worst label contrast anywhere on the site is now 4.63 — the primary's white on
brand blue — and every boundary clears 3:1.

### Two states that would have failed the first time they were used

**Disabled was `opacity:.45` and nothing else.** That drops the primary's
white-on-blue to roughly 2:1 — a control you cannot read telling you it is a
control you cannot use, which is exactly what §25 warns against. Unavailable is
now said with a surface and an ink: slate on mist, 4.7:1, opacity untouched.

**The busy spinner was invisible on every variant except the primary.** The
loading state blanks `color` to hide the label, which also blanks
`currentColor` — so the spinner had been hard-coded white and rendered white on
white on every secondary. Each variant now names its ink once, in `--btn-ink`,
and the label and the spinner read the same token. The state also answers to
`aria-busy="true"` as well as the class, keeps the accessible name, and drops
pointer events so a second tap cannot fire the same action twice.

Nothing on the site uses either state today — there are no forms — which is
precisely why both were broken. They are asserted now, so they will be right
the first time something needs them.

### The drift

**The company-profile doorway had its own geometry**: the large control height
with the default type size, 20px of side padding where every other button has
24 or 32, and — measured across tiers — a card shadow below 1024 and none above
it, so one component was two components depending on the screen. It keeps what
makes it a doorway (label at the reading edge, mark at the far one, its own
width cap) and takes everything else from the button system. The shadow goes at
every width: §33 puts elevation on primary actions, and a company profile is an
editorial continuation. That reverses the elevation I added in M03·4, which was
right that the component should stand off the ground and wrong about how.

**The menu trigger answered a tap with nothing** — no surface change, no
scale — and it is the first control anyone touches on a phone.

**The website address in the contact card was under two floors at once**: brand
blue at 15px is 4.35:1, and it was 18px tall on desktop, under the 24px pointer
minimum. Navy, and the target floor now applies at every width.

**Two press mechanisms became one.** The buttons used `transform`, the doorway
used `scale` — the second added in M03 only because the first collided with the
entrance reveal's own transform. Everything presses with `scale` now: a
separate animatable property that composites the same way and cannot collide
with anything, anywhere. It applies to a mouse as well as a thumb, because a
click that answers is feedback, not a touch affordance.

### The same collision, walked into twice

`verify-cta.js` failed on its first run with seven service CTAs reporting no
press transition. M05's card-assembly rule sets the whole `transition`
shorthand on every direct child of the card — and the card's action is one of
them — so the stagger was overriding the button's own transition and those
seven answered a tap by snapping rather than easing. It is the same
specificity collision M03 found on the profile doorway, reintroduced in M05
without noticing. Naming `scale` in the stagger's property list keeps both.

That is what the audit was for: the bug was invisible by eye, in a section that
had passed 84 of its own assertions.

### Three assertions this stage got wrong first

- A control is identified by its surface *or* its boundary. The first version
  preferred the surface when one existed, and failed the doorway — a white
  card on a near-white ground, identified perfectly well by its blue outline.
- The size ladder is what the system *specifies*. Checking the rendered height
  failed a service CTA at 47.6px, which is a 48px control landing a fraction
  short inside its grid row.
- `rgba(0, 0, 0, 0)` is not black. Measuring a transparent button's contrast
  against its own `background-color` compared the navy spinner to black and
  called it invisible.

### Left alone, deliberately

**The mobile menu's contact rows keep the 12px radius** of the menu, not the
18px of the button system. They are navigation rows inside a panel, and they
belong to the menu's shapes rather than to the CTA family.

**The hero's secondary is a `btn--lg` overridden to the default metrics.** It
looks like drift and is not: M02 stepped it down deliberately so two full-width
boxes of the same height would stop competing. The result is correct; only the
route to it is roundabout.

**Footer navigation keeps its square, quiet treatment.** Those are links in a
list, not actions, and the brand-blue tap highlight from M01 already gives them
touch feedback.

---

## Stage M08 — «تواصل معنا» on mobile

The section already held the right things: an invitation, a phone number large
enough to read at arm's length, WhatsApp and call beside it, and three quiet
rows of detail. What it did not have was an order that put the action first, a
hierarchy between four equally large buttons, or any answer to a thumb on the
two surfaces that are not buttons. 52 assertions in
`verify-mobile-sections.js`.

**The action came after a second paragraph.** The order was invitation → a
supporting lead → the phone number and its two actions. So the invitation's own
«تواصل معنا», which points at those actions, had a paragraph to scroll past
first. The card moves up directly under the invitation and the supporting
sentence follows it, as what it is: elaboration for anyone still reading.
`order` does it — the message block contains no focusable element, so the
reading order and the tab order are untouched, and there is an assertion that
keeps it that way.

**Four large buttons, no hierarchy.** Measured: every one of the four actions
in the section was 56px tall. Two are the invitation's — one scrolls to the
card below, one goes back to the catalogue — and two are the contact itself.
They cannot all be the most important thing on the screen. The invitation's
pair steps down to the standard control height; the card's pair keeps the large
one. Nothing moves and nothing is renamed; the section now says plainly which
two buttons are the point of it.

**The two surfaces that are not buttons.** The phone number is a 61px target
that answered a press with a colour change alone, and the website row was a
132px link inside a 350px row — most of the row looked tappable and was not.
Both behave like the rest of the CTA system now: the whole row is the target
(260px at 360, 327px at 430) and a press is felt. The first attempt set
`width:100%` on the link and changed nothing, because `.contact-info` is a flex
row whose text block was shrink-to-fit: the link was already filling a column
the width of its own text.

### The measurement that had been wrong all along

Chasing the invitation's outlined button turned up something worse than a
finding: **every contrast number this project has reported for a translucent
colour has been wrong.** The helper read the stated colour and ignored its
alpha. `rgba(255,255,255,.42)` on the navy panel is not white — it composites
to `rgb(133,151,182)` — and the boundary that had been reported as 8.53:1
actually measures **2.88:1**, just under the 3:1 WCAG 1.4.11 asks of a
control's boundary.

Every colour is composited over what is behind it now, down the whole ancestor
chain, before anything is compared. Re-run against the corrected maths, the
site had exactly one such failure: that border. At 48% it composites to
`rgb(139,157,186)` and measures 3.1, and the difference is not visible as a
change of weight.

`verify-cta.js` also names each measurement by its section now. The same
classes in the hero and in the contact invitation are two different
measurements — one on white, one on navy with its own overrides — and a
failure that does not say which is a failure you have to go looking for.

### What the brief asked for that does not exist here

There is **no form, no map and no social account** anywhere in this project —
verified, not assumed: zero `<form>`, `<input>`, `<textarea>`, `<select>` or
`<iframe>` in the section. So the brief's sections on form fields, labels,
focus, error and success states, the submit button, map presentation and social
links have nothing to act on. Building any of them would mean inventing contact
information, which the same brief forbids.

The CTA system's form-facing states are nonetheless ready and asserted, from
M07: a disabled treatment that does not rely on opacity, and a busy state that
keeps its accessible name and blocks a second tap. When a form does arrive it
will inherit both.

Two assertions guard the boundary: the section contains no invented fields or
frames, and every destination in it is one the site already had —
`tel:+966535544352`, `wa.me/966535544352`, `aunaldrb.com`, or an in-page anchor.

### One more scoping mistake

The phone number's press state went inside the mobile block, so at 1440 the
largest and most obviously tappable thing in the section answered a click with
nothing. M07 had already settled this: a `tel:` link is as clickable on a
desktop as on a handset, and a press is feedback rather than a touch
affordance. Caught by the new assertion on its first run, at the one width the
rule did not cover.

---

## Stage M09 — the footer

The footer already had the right sequence — brand, navigation, contact, legal —
and 44px rows for every link since M01. What it did not have was a hierarchy
between what those rows say, an answer to a press, or a tablet layout that did
not orphan a whole group. 40 assertions in `verify-mobile.js`.

**Four jobs, one voice.** Measured: the brand line, every navigation link,
every contact link and the street address all rendered at 17px/400. The address
is the only item in that list you cannot tap — it is supporting information,
not a destination — so it steps down to the small size and sits with the legal
line rather than with the links above it. The column titles (13px/600) and the
links (17px/400) already had their own levels; this gives the fourth one its
own, and there is an assertion that supporting text stays quieter than the
links it sits beside.

**The last screen of the site answered nothing.** Eleven links, every one a
44px row, and not one of them moved when pressed. The rest of the site has
answered a press since M07. Same property, same amount, same easing — `scale`,
1.5%, no overshoot — so the footer belongs to the same system as everything
above it.

**A group orphaned on its own row.** From 640 the grid went to three columns
for four groups, so «تواصل» — the phone number, WhatsApp and the website —
wrapped alone onto a second row with two empty columns beside it: a 330px block
under 330 + 165 + 165 at 768.

The first fix was two columns, which traded one imbalance for another. The
brand cell is a logo and a single line; pairing it with a five-item list left
roughly **450px of nothing** beneath it. The brand takes the full width now and
opens the footer, with the three lists in a row under it — which is what the
four columns above 1024 already do with more room. The tablet footer went from
807px to 640px, and an assertion requires every row to be full: either one
cell spanning the grid, or as many cells as there are columns.

**Four inline `style` attributes became classes.** The brand line, the address
and the two legal lines were carrying their colour inline, which is why they
could not have a type hierarchy — there was nowhere to put one. The brand
line's `max-width:42ch` went to rem with them: the `ch` unit is measured on the
Latin zero and runs about 1.4x wider than an average Arabic advance.

### What the brief asked for that does not exist here

There are **no social accounts, no footer CTA and no legal pages** anywhere in
this project — verified, not assumed. So the brief's sections on social links
and their interaction, the final CTA and its hierarchy, the company-profile
button in the footer, and legal link spacing have nothing to act on. Adding any
of them would be inventing content, which the same brief forbids.

Two assertions hold that line: the footer contains no social destination and no
`.btn`, and every link in it goes to an in-page anchor,
`tel:+966535544352`, `wa.me/966535544352` or `aunaldrb.com`.

### One thing worth your decision

The brief asks for the location to be clickable "when supported". The address
is currently plain text, and making it open a map would mean adding an external
destination that does not exist in the project today. That is a content
decision rather than a layout one, so it is left as it is.
*If you want it: the address becomes a link to a maps search for the existing
string, and it would take the same 44px row and press state as its neighbours.*

### One more assertion that was wrong first

The sequence check — brand, navigation, contact, legal — failed at 1440,
reading `logo>nav>contact>brand>address>legal`. Reading order is a
single-column idea: once the footer is a four-column row the groups sit side by
side and their tops say nothing, and the brand paragraph is lower than a column
title only because the logo above it is taller. Below 640 the order is the
layout; from 640 what has to hold is that the brand opens the grid and the
legal bar closes the footer.

## Stage M10 — the final polish

M01 to M09 each built one region. M10 is the first pass that asks a question
only answerable once they are all in place: does the mobile site read as **one
product**? So this stage started as measurement, not design. Two sweeps walked
every painted element on the page and tallied what it was actually using —
radius, shadow, border, transition duration, type scale, section grounds,
Arabic measure, touch targets, icons, images and contrast — and the finding
worth reporting first is that **most of the system held**.

- **Radius** — five values in use, all five on the documented ladder: 18px
  (×40), 50% (×22), 12px (×9), 26px (×6), 34px (×1). No drift.
- **Elevation** — three depths plus one focus ring. Nothing invented its own.
- **Motion** — 260ms, 420ms, 150ms and one deliberate 120ms. On the ladder.
- **Grounds** — every section alternates; no two neighbours share one.
- **Icons** — every glyph on the `.ico` system, at 20/24/28/32, stroking 2px.
- **Type** — every "rare" size/weight pair traced back to a deliberate role.
- **Measure** — 23 to 41 characters per Arabic line across 33 paragraphs.
- **Targets** — nothing interactive under 44px at 360, 375, 390 or 430.
- **Borders** — every real border a system width and a system colour.
- **Position** — only `.skip-link` and `.site-header` are fixed or sticky.

Four things did not hold. All four are now fixed, and the whole sweep is
`ux/verify-polish.js` — 52 assertions across four widths, plus reduced motion
and no-JS. Run against the file as it stood before this stage it reports
44/52, failing on exactly these four.

**Three pieces of text below AA.** The sweep reads each text leaf against its
own composited ground, and three failed — all small type in a brand colour on
a light surface, all of them older than the mobile work:

| | measured | needs | fix |
|---|---|---|---|
| `.why__num` — the chapter numerals 01–06 | 3.03:1 | 4.5 | `--text-secondary` (5.85:1) |
| `.why__247` — the badge | 4.19:1 | 4.5 | `--color-secondary` (7.65:1) |
| `.contact__aside-tag` | 4.35:1 | 4.5 | `--color-secondary` |

The numerals are the clearest of the three: they were painted in
`--text-muted`, and that token's own comment in this file reads *"non-text /
placeholder only"*. They are text. The badge is the WCAG "large text" trap —
17px **bold** is not large; that threshold is 18.66px bold, so it needs the
full 4.5. No new colour enters the palette for any of them; all three move to
tokens that were already there, and none of them changes weight or size.

**One icon still hand-drawn.** The connector arrow between «رؤيتنا» and
«رسالتنا» carried its own `stroke-width`, `stroke-linecap` and `fill`
attributes instead of the class every other glyph on the site uses. It looked
identical, which is why it survived the icon stage — but it was outside the
system, so a change to the system would have left it behind. It is `.ico` now.

### Two bugs in my own measuring, worth writing down

Both would have made this stage report a clean page that was not one.

**The contrast helper was walking to the parent for the ground.** An element
with its own opaque background *is* its own ground; starting the walk one level
up measured white-on-blue as white-on-white and returned 1:1 — a number so
wrong it reads as a bug, but it silently passed every element that paints its
own surface. The white-on-navy CTA labels were among them.

**The border tally was not filtering by width.** `getComputedStyle` reports a
`border-color` on every element whether or not there is a border to colour, so
the first pass "found" dozens of borders that do not exist and buried the four
that do. A side is only a border if its style is not `none` **and** its width
is above zero.

### What the brief asked for that the measurements did not support

**§04 asks for varied section rhythm.** Every section carries an identical
67.5px of top and bottom padding on mobile, which looks like the flatness the
brief describes — but it is not. The transitions between sections are already
carried by the alternating grounds, and the sections differ in height by a
factor of six. Adding a second variable to a rhythm that already works would
be new visual language solving no observed problem, which §42 rules out.

**§25 asks for responsive image sources.** There is no `srcset` anywhere, and
there cannot be one without the image files at more than one width. What §25
is actually protecting against — content jumping while an image loads — does
not happen on mobile: every image box is reserved by CSS `aspect-ratio` before
the file arrives, and there is an assertion holding that.

### Still open, unchanged by this stage

`verify-header.js` still fails one assertion: **59px of document growth on
first scroll at 1024 and up**, because `03.webp` has no reserved box on
desktop. This does not need the image's dimensions — the ratio-agnostic fix
(a reserved height plus `object-fit:contain`) is proven in «ما يميزنا» — but
it puts a mist band into a desktop composition you approved from a screenshot,
and M10 is a mobile stage. It stays offered, not taken.

## Stage M11 — micro-interactions and feedback

Feedback is the one layer that cannot be audited by reading the stylesheet.
What an element does when you touch it is decided by the cascade, by media
queries, by inline styles written by script, and by whichever of several press
systems happens to win — none of which is visible in the source. So this stage
asked the browser instead: `CSS.forcePseudoState` over CDP, one element at a
time, `:active` and `:hover` forced *separately*, and every reading taken after
the transition had settled. 71 assertions in `ux/verify-interactions.js`,
across 360/375/390/412/430. Run against the file as it stood before this stage
it reports **19/71**.

### The one that mattered

**The primary CTA label was invisible.** Not low-contrast — invisible, at
exactly 1:1. `a:hover{color:var(--interactive-hover)}` was the only ungated
`:hover` in a file where every other one sits inside `@media(hover:hover)`. On
`.btn--primary`, whose own hover background is *that same token*, the label was
painted the identical value as the surface behind it. The harness reports it as
`home/btn hover 1 (needs 4.5)`; a screenshot of the button in that state is a
blue rectangle with nothing in it.

This was never mobile-only — it is what a desktop user saw whenever the pointer
was over the button they were about to click. On a phone it is worse, because
`:hover` sticks after a tap: touch the hero CTA, and the label stays gone.

Three more states failed the same check once it existed: the skip link at
1.25:1, the contact CTA at 2.88, the service CTA at 3.32.

### What the measurements found beyond that

**Two press systems, stacked.** M02 scaled `.btn` with `transform`; M07 later
scaled it again with the independent `scale` property. Both applied. A coarse
pointer compressed a button to `.985 × .985 = .970` — twice the intended depth
— *except* in services, where a reveal rule pins `transform:none` and happened
to cancel one of the two. The same button at two depths depending on which
section it was in. M02's rule is retired; `scale` survives, because it cannot
collide with a reveal transform the way `transform:scale()` did.

**Four stagger ladders, and the one that won was in JavaScript.** The CSS had
three (global 90/180/270/380, hero 0/90/180/270, services 0/60/120/180). The
script had a fourth, uncapped at 70ms a step, written as an **inline**
`transition-delay` — so it silently beat all three: the stylesheet said the
hero CTA arrived at 120ms; it actually arrived at 280. There is now one
`--stagger` token, one ladder, capped at four steps.

That inline delay was also never cleared. An inline `transition-delay` is not
scoped to the entrance — it stays on the element and rides into *every* later
transition, including its press. `.about__profile` is both a revealed element
and a control. The script clears it once the element has arrived.

**The press was slower than the movement.** `scale` answered in 150ms while the
surface under it — background, colour, border — took 260, and
`.about__profile`'s took 420 and had not finished after 420. The button moved,
then caught up with itself. Only the *pressed* state's duration changed, so the
return is still the base transition: quick in, smooth out. Every control now
answers in 150ms on one ease-out curve.

**Three controls answered a press with nothing at all** — the skip link, the
header logo and the website link in the contact card. Confirmed by asking the
engine which rules it had matched, not by reading the stylesheet.

**Two more gaps:** `.btn--on-inverse`, the primary action of the contact
invitation, had a `:hover` and no `:active` — it answered a mouse and not a
thumb. And the directional arrow in «تعرف على المزيد» nudged on hover only, so
on a phone the icon never moved.

**A hover that cost contrast.** `.btn--primary:hover` *lightened* the button,
to `--blue-bright`, under a white label: 3.70:1, below AA, in the state a
desktop user is in just before clicking. It darkens now, one step to the navy
already in the palette. Hover and press sit on the same ladder instead of
opposite sides of the rest colour: `#4975BA → #2C4C82 → #22406F`.

**And 25 ungated `:hover` rules.** All of them now follow the file's own
convention. One needed care: `.site-nav__link.is-active::after,
.site-nav__link.is-active:hover::after` mixes a *state* with a hover, and
gating the whole rule would have taken the active nav indicator away from every
touch device. Only the hover half is gated.

### The arrival budget

| | before | after |
|---|---|---|
| slowest element readable | 800ms | 420ms |
| hero CTA (§40 priority 1) | 700ms | 420ms |
| reveal duration | 420ms | 260ms |
| stagger step | 70/60/90ms | 40ms, one token |

### Two mistakes in my own measuring

**I read the computed style on the transition's first frame.** That reports
every value's *start*, not its end — so the first pass reported the press scale
as `1` everywhere, i.e. "no press movement on the entire site". There is no
such bug; there was a missing `await`. Every reading in the harness now settles
first.

**I checked label contrast on an element that renders no label.** The header
logo is an anchor around an `<img>`. It has a computed `color` and paints no
text, and the check failed it against a label that does not exist.

### The specificity trap, for the third time

`.js .service[data-reveal] > *` is (0,3,0) and sets the whole `transition`
shorthand, so it outranks `.btn:active` at (0,2,0). The services CTA was
pressing at 260ms on the entrance curve while every other control answered in
150 on the ease-out. This project has now hit the same trap in M03
(`.about__profile`), M05 (`.service__cta`) and here. The fix is always the
same: name the individual properties, never the shorthand.

### What the brief asked for that does not exist here

There are **no forms, no accordions, no dropdowns and no social icons** in this
project — verified, not assumed. So §16 (form inputs), §17 (validation), §18
(success), §21 (social icons), §22 (accordions) and §23 (dropdowns) have
nothing to act on. §19 (loading states) is the near-miss: `.btn.is-loading`
exists as a capability from M07, with the geometry preserved exactly as §19
asks, but there is no asynchronous action anywhere on the site to trigger it.
It stays ready and unused.

§30 asks not to add image zoom interactions. One already exists —
`.service__media img` scales 1.02 on hover — but it is hover-gated and so never
runs on a phone. Left alone: removing it is a desktop change, and this is a
mobile stage.
