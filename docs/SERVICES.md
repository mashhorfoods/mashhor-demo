# Services — Stage 10.5
## نمبرون للسفر و السياحة · Number One Travel & Tourism

Built on the 10.1 foundation, the 10.2 header, the 10.3 footer and the 10.4
hero composition. Nothing here redefines a token or a component.

```
services/index.html               the route: /services/
assets/js/data/services.js        THE service registry: 13 services, 4 categories,
                                  3 kinds, the Help Me Choose options
assets/js/components/services.js  hero · category nav · kind legend · groups ·
                                  help options · mountServices()
assets/css/15-services.css        .c-catnav .c-kinds .c-service-card--rich .c-help
```

```js
import { mountServices } from './assets/js/foundation.js';
const services = mountServices();      // finds [data-services="…"] mount points
services.filter('tickets');            // what the category chips do
services.regions.core.error();         // any group: loading() empty() error() content()
```

## One registry, every surface

`SERVICE_REGISTRY` is now the only place a service is defined (thirteen since
10.6 added group trips). These read it:

| Surface | Reads |
| --- | --- |
| Services page | all 13, grouped by `category` |
| Service detail pages | one generated route per record (10.6) |
| Homepage grid | all 13; `featured` six first, the rest behind "show all" |
| Header mega menu | four columns = the four categories; `title` + `short` |
| Footer services column | derived from the mega menu |
| 404 chips, style guide, supervisor card | `SERVICES` = the featured six |
| Booking entry "other services" select | the records with `option` |

A record carries: `id`, `category`, `kind`, `icon`, `href` (the Stage 10.6
detail route), `vertical` and `option` (where the booking entry opens),
`status`, `featured`, `title` / `short` / `desc` in both languages, `image`
(`src: null` renders the neutral slot) and an optional CTA label override.

## The page, top to bottom

| | Section | Built from |
| --- | --- | --- |
| A | Hero, one primary CTA "ابدأ رحلتك" | `.c-hero` (10.4) + `servicesHero` |
| B | Category navigation, sticky from tablet up | `categoryNav` — chips with `aria-pressed` |
| — | "What happens next" legend | `kindLegend` — the three kinds, badge + one line |
| C–F | Four groups × three cards | `serviceGroupHead` + `serviceCard(record, { media, kind, entry })` |
| G | Help me choose, five options | `helpOptions` — links to a service entry, or a button that moves in-page |
| H | Human support | `supportPanels` (10.4), channels only when verified |
| I | Global footer | `mountFooter` |

## Decisions worth knowing

**Three kinds, told apart by icon + word, never colour.** Every card carries
its kind badge — search & book, on request, ticket management — and the legend
under the category nav says what each one means for the customer. The CTA label
follows the kind: "ابحث واحجز", "اطلب الخدمة", "ابدأ الطلب".

**Every CTA works today.** A service's CTA opens the homepage booking entry on
the right vertical (`serviceEntry()` builds `?vertical=…&service=…#booking`,
and `index.html` honours it). The card title and "service details" link go to
the service's detail page (Stage 10.6, [`SERVICE-DETAILS.md`](SERVICE-DETAILS.md)).

**`<base href="../">`.** The page lives one level down, so `<base>` points
every relative URL — assets, the sprite, the module import and `route()` — at
the site root, whatever that root is. The one cost: `href="#…"` would resolve
to the homepage, so the skip link and the in-page Help option move by script.
(The 404 page had the same `<base>` and no skip link; it has one now.)

**The category nav is sticky on measured offsets.** The header changes height
with its scroll state, so `observeStickyOffsets()` writes `--sticky-offset`
and `--catnav-height` from the real elements, and the groups and cards carry
matching `scroll-margin` so a filtered group or a focused card never lands
under the bars.

**Filtering hides groups, it does not rebuild them.** A chip sets `hidden` on
the other three sections and scrolls to the chosen one; "الكل" restores all.
Each group is a `stateRegion` with loading, empty (with a "show all" action),
error and content.

**Reused, not duplicated.** The hero composition, the service card (extended
with options rather than forked), the support panels, the state machinery,
the chip, badge and card primitives. New: the category nav, the kind legend
and the help-option tile.

**Fixed along the way.** The search widget wires its tabs synchronously, so a
tab can be selected in the same tick it is created (the deep link needed
that). A card's second control now paints above the stretched title link.

## Acceptance

Verified in-browser at 390 / 834 / 1440 in both directions — **146/146**
services checks — alongside 169/169 homepage, 96/96 site, 17/17 header
interaction, 42/42 header responsive, 62/62 footer, and the language audit at
**0 untranslated** on every page (home, services, 404, style guide).

| | |
| --- | --- |
| 13 services (the approved 12 + group trips from 10.6), 4 groups, structured data | ✅ one registry, read by seven surfaces |
| Hero with one primary CTA · category nav · help me choose · human support | ✅ |
| Existing header, footer, tokens, components reused | ✅ no new tokens, no forked card |
| Arabic · English · RTL · LTR | ✅ audit 0; title, description and every label switch |
| 390 / 834 / 1440, no horizontal overflow, chip row scrolls on phones | ✅ |
| Keyboard, focus rings, targets ≥ 44px, ordered headings, decorative hidden | ✅ |
| Loading / empty / error / success on every group | ✅ |
| No placeholder contacts, no invented data | ✅ enforced by data shape |
| Console clean, no broken assets, header and footer unchanged | ✅ |

### Still needed from the business

Service photography (`image.src` per record) · the detail pages (Stage 10.6)
· the numbers that switch the contact channels on.
