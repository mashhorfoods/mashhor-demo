# Homepage — Stage 10.4
## نمبرون للسفر و السياحة · Number One Travel & Tourism

Built on [`FOUNDATION.md`](FOUNDATION.md) (10.1), [`NAVIGATION.md`](NAVIGATION.md)
(10.2) and [`FOOTER.md`](FOOTER.md) (10.3). Nothing here redefines a token, a
component or the header/footer; the homepage is a composition of what exists,
plus the section-level compositions listed below.

```
index.html                       the page: section shells + mount points
assets/js/data/home.js           every record the page renders (bilingual)
assets/js/components/home.js     section builders + mountHome()
assets/css/14-home.css           .c-hero .c-value .c-choose .c-dest .c-offer
                                 .c-journey .c-support .c-cta-band
```

```js
import { mountHome } from './assets/js/foundation.js';
const home = mountHome();            // finds [data-home="…"] mount points
home.regions.offers.error();         // any region: loading() empty() error() content()
home.scrollToSearch();               // what "Start booking" and the header search do
```

## The page, top to bottom

| # | Section | Built from | Data |
| --- | --- | --- | --- |
| 01 | Hero + booking entry | `heroCopy` `heroMedia` `heroSearch` → `searchWidget` | `HOME_HERO`, `SEARCH_VERTICALS` |
| 02 | Services | `servicesGrid` → `serviceCard` | `HOME_SERVICES` = the 10.5 registry (12, six `featured`) |
| 03 | Why Number One | `valueList` | `HOME_VALUES` |
| 04 | Help me choose | `chooseModule` | `HOME_PRIORITIES` |
| 05 | Destinations | `destinationGrid` → `destinationCard` | `HOME_DESTINATIONS` = registry records flagged `home` (10.7) |
| 06 | Offers & packages | `offerGrid` → `offerCard` | `HOME_OFFERS` = the first three registry records (10.8) |
| 07 | How we help | `journeySteps` | `HOME_JOURNEY` |
| 08 | Human support | `supportPanels` | `HOME_SUPPORT` + `liveChannels()` |
| 09 | Final CTA | markup, `data-home-action="book"` | — |
| 10 | Global footer | `mountFooter({ cta: false })` | 10.3 |

## Decisions worth knowing

**The search is the entry to Stage 11, not an engine.** Submitting builds a
query string from the fields (`vertical`, `tripType`, `from`, `to`, dates,
`pax`, `cabin`, plus `sort` from Help Me Choose) and navigates to `search/`.
Nothing on the homepage fetches results. Until Stage 11 builds that route it
lands on the branded 404 like every other unbuilt page. Required fields are
validated in the page's own language before anything navigates; the browser's
unlocalised bubble is never shown.

**Eight categories, one component.** The four verticals the brief adds (Umrah,
medical, transport, other services) are objects in `SEARCH_VERTICALS`, rendered
by the same `searchWidget`. They are *requests* rather than searches, so they
declare `submit: 'search.request'` and the button reads "Request a quote". The
trip type (return / one way / multi-city) is a new `segmented` field type — a
real radio group presented as one bar — and cabin moved out of "more options"
for the homepage's flight-first priority.

**Help Me Choose carries, it does not compute.** The chips set one `sort`
value (`price`, `stops`, `duration`, `family`, `value`); the search sends it on.
Ranking is the booking engine's job.

**Nothing invented, by shape.** `HOME_OFFERS` records ship with `price: null`
and `validUntil: null`; `offerCard` renders a price or a validity row only when
the value exists. Destination descriptors say what people go there *for* (the
services we sell), never "most popular". The hero image slot is `src: null`
and renders the neutral placeholder at the reserved ratio — drop the approved
photograph into `HOME_HERO.media.src`.

**No placeholder contact information.** Stage 10.2's `wa.me/` and
`tel:+249…` placeholders are gone: `SUPPORT_CHANNELS` carry `href: null` and
every surface (header panels, drawer, footer, the homepage support block)
renders only `liveChannels()`. The support block points at the help centre
until the numbers are set.

**Red is rationed.** Three primary actions exist on the page — the header's
Book Now, the search submit, and the final CTA — each in its own region. The
footer's own CTA is switched off with `mountFooter({ cta: false })` because it
would sit directly under the final CTA. Card CTAs are text links; Help Me
Choose uses the brand-outline button.

**Every dynamic region owns five states.** Services, destinations, offers and
support are `stateRegion`s: they paint a skeleton first, then content, and can
be switched to empty or error from `no.home.regions.<name>`. Empty and error
states always carry a next action.

**The hero grid uses `minmax(0, …)` tracks on purpose.** The search widget's
tab strip is a scroll container whose min-content is the sum of its eight tabs;
an `auto` track would grow to it and push the whole hero past a phone's edge.

**Fixed along the way.** `initTabs` is now idempotent and accepts the tab group
itself as its root, so a search widget rebuilt after a language change keeps
working tabs (it did not before). `setButtonState` writes `aria-busy="true"`
rather than a bare attribute, which assistive technology did not read as busy.

## Acceptance

Verified in-browser at 390 / 834 / 1440 in both directions — **169/169**
homepage checks — alongside 96/96 site, 17/17 header-interaction, 42/42
header-responsive, 62/62 footer, and the language audit at **0 untranslated**
on every page.

| | |
| --- | --- |
| Hero + booking entry, flights first, 8 categories | ✅ trip type, from/to, dates, travellers, cabin, search |
| Services (12), progressive disclosure | ✅ six featured, "show all" reveals the rest |
| Why Number One · Help Me Choose · Destinations · Offers | ✅ data-driven, no invented figures |
| How We Help (4 steps) · Human support · Final CTA | ✅ |
| Existing header, footer, design system reused | ✅ no new tokens, no parallel system |
| Arabic · English · RTL · LTR | ✅ audit 0 untranslated; title and description switch |
| 390 / 834 / 1440 | ✅ no horizontal overflow, search within the first phone screen |
| Accessibility | ✅ one h1, ordered headings, labelled regions, focus rings, targets ≥ 44px, decorative graphics hidden |
| Dynamic states | ✅ loading / empty / error / success on every region |
| No invented business information · no placeholder contacts | ✅ enforced by data shape |
| No console errors · no broken assets | ✅ |
| Language audit · browser suites | ✅ |

### Still needed from the business

The hero photograph and destination/offer imagery · real offers (price,
validity, inclusions) · phone and WhatsApp numbers · the pages the menus and
cards link to (Stage 11 onward).
