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
