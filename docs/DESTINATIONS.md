# Destinations — Stage 10.7
## نمبرون للسفر و السياحة · Number One Travel & Tourism

Built on the 10.1 foundation, the 10.2 header, the 10.3 footer, the 10.4
hero / choose / CTA compositions, the 10.5 chip nav and help tiles, and the
service registry. Nothing here redefines a token or a component.

```
destinations/index.html              the route: /destinations/
assets/js/data/destinations.js       THE destination registry: 11 records, 6 regions,
                                     6 travel purposes, searchDestinations()
assets/js/components/destinations.js hero · search · decks · region nav · featured ·
                                     purpose tiles · help band · mountDestinations()
assets/css/17-destinations.css       rich card bits · featured block · inline region nav
```

```js
import { mountDestinations } from './assets/js/foundation.js';
const destinations = mountDestinations();   // finds [data-destinations="…"] mount points
destinations.search({ q: 'دبي', region: '', purpose: '' });   // what the form does
destinations.filterRegion('asia');                             // what the chips do
destinations.regions.featured.error();                         // loading() empty() error() content()
```

## One registry, every surface

`DESTINATION_REGISTRY` is now the only place a destination is defined:

| Surface | Reads |
| --- | --- |
| Destinations page | all 11: deck (six first), by region, featured, search |
| Homepage destination grid | records flagged `home` |
| Header destinations menu | columns = the regions that contain something |
| Booking entry | `?to=<slug>` prefills the flight search in the traveller's language |
| Destination search | region and purpose selects are built from the registry |

A record carries: `id`, `slug`, `region`, `name` / `country` / `desc` in
both languages, `purposes`, `services` (registry ids, shown as chips),
`image` (`src: null` renders the neutral slot), `featured`, `home`, `status`.
There is no field for "popular", "best" or a price, so no surface can show
one; the menu's old "most popular" column is gone for the same reason.

## The page, top to bottom

| | Section | Built from |
| --- | --- | --- |
| 1 | Hero: eyebrow, H1, lead, "استكشف الوجهات" (primary) + "ساعدني في الاختيار" | `.c-hero` (10.4) |
| 2 | Search: destination, region, purpose, dates; results region below | `searchWidget` on the `destinations` vertical |
| 3 | Destinations deck: six first, "show all" | `destinationCard(record, { country, services, entry })` |
| 4 | By region: six structural chips with counts; grid of the chosen region | `regionNav` → `.c-catnav--inline` |
| 5 | Featured: one large lead + up to two supporting | `featuredBlock` → `.c-featured` |
| 6 | Travel purpose: six tiles that run a purpose search | `purposeTiles` → `.c-help__option` (10.5) |
| 7 | Help me choose band → the services page's help section | `helpBand` → `.c-choose` |
| 8 | Final CTA: "ابدأ الحجز" → booking entry; "تحدث مع خبير" | `.c-cta-band` |
| — | Global footer, its own CTA off | `mountFooter({ cta: false })` |

## Decisions worth knowing

**The search is the shared widget on its own vertical.** `SEARCH_VERTICALS`
gained a `destinations` entry with `standalone: true` (so the booking entry
never shows it), `filters: true` (no "(optional)" on every label — nothing is
required) and `submitVariant: 'secondary-brand'` (the page's red belongs to
the hero and the final CTA). Its selects read the registry. Submitting runs
`searchDestinations()` over the registry today; the same signature fits an
API later. Results paint into their own state region: loading, results with
a count, empty with "search again" and "talk to an expert", error.

**Every card CTA works today.** "استكشف" opens the homepage booking entry on
flights with the destination prefilled in the traveller's language
(`?vertical=flights&to=<slug>`); the name links to `destinations/<slug>/`,
the detail route a later stage builds, which lands on the branded 404 until
then.

**Regions are structural.** All six exist in data so an admin can file a
destination anywhere; the chips show every region with its count and open on
the first one that contains something. An empty region shows the empty state
with a way forward, never a blank grid.

**Featured degrades by count.** One record renders the lead alone; two, a
lead and one supporting; three or more, a lead and two. The heading says it
is the team's pick, not a ranking.

**Purpose tiles run a search.** Picking "علاج" syncs the purpose select and
paints the matching destinations, with the service that starts that journey
named on the tile. Arriving with `?purpose=…` does the same.

**Help Me Choose is an entry point, not logic.** The band links to the
services page's help section; the decision flow comes later, as the brief
asks.

**Site-wide fix along the way.** Any `main > section[id]` now carries a
scroll margin for the sticky header, so an in-page move on any page lands
below the header rather than under it.

## Acceptance

Verified in-browser — **165/165** destinations checks at 390 / 834 / 1440 in
both directions, alongside 470/470 service-detail, 146/146 services, 169/169
homepage, 96/96 site, 17/17 header interaction, 42/42 header responsive,
62/62 footer, and the language audit at **0 untranslated** across all 18
pages.

| | |
| --- | --- |
| Page, search UI, reusable cards, region nav, featured, purposes, help entry, final CTA | ✅ |
| Arabic · English · RTL · LTR; selects and chips translate | ✅ |
| 390 / 834 / 1440, no horizontal overflow, one ratio on every card image | ✅ |
| Loading / empty / error / success on search, deck, region, featured | ✅ |
| No invented destinations, prices, offers, reviews or rankings; no placeholder contacts | ✅ by data shape |
| Keyboard, focus rings, skip link, labelled media, decorative hidden, targets ≥ 44px | ✅ |
| Header (menu derived, no "most popular"), footer intact | ✅ |

### Still needed from the business

Destination photography (one image per record) · confirmation of which
purposes and services apply to each destination (launch content today) ·
the numbers that switch the contact channels on.
