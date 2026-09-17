# Stage 10 build notes — 10.2 to 10.11
## نمبرون للسفر و السياحة · Number One Travel & Tourism

One document per stage used to live in this folder; they are merged here in
stage order, unchanged apart from the heading levels. The foundation is in
[`FOUNDATION.md`](FOUNDATION.md), the final gate in [`STAGE-10-QA.md`](STAGE-10-QA.md),
the cleanup in [`CLEANUP.md`](CLEANUP.md).

| Stage | Section |
| --- | --- |
| 10.2 | [Global header & navigation](#102--global-header--navigation) |
| 10.3 | [Global footer](#103--global-footer) |
| 10.4 | [Homepage](#104--homepage) |
| 10.5 | [Services](#105--services) |
| 10.6 | [Service details](#106--service-details) |
| 10.7 | [Destinations](#107--destinations) |
| 10.8 | [Offers & packages](#108--offers--packages) |
| 10.9 | [Booking entry](#109--booking-entry) |
| 10.10 | [Supervisor profile](#1010--supervisor-profile) |
| 10.11 | [Responsive & accessibility refinement](#1011--responsive--accessibility-refinement) |

---

## 10.2 — Global header & navigation
Inherits Stage 10.1 ([`FOUNDATION.md`](FOUNDATION.md)). Nothing here redefines a
token, a colour or a component from that layer.

### Where it lives

```
assets/js/data/navigation.js    the whole IA as data — nav, mega menus,
                                account menus, support channels, search scopes
assets/js/components/header.js  every component below
assets/css/12-header.css        the .c-gh layer
```

### Using it

```js
import { mountHeader } from './assets/js/foundation.js';

mountHeader({
  target: document.querySelector('.l-page'),
  current: 'home',              // marks the active primary item (§19)
  variant: 'default',           // or 'booking' (§32)
  onSearch: (q) => { … },
});
```

`globalHeader()` returns the element if you'd rather place it yourself;
`mountHeader()` also wires the scroll state.

### Components (§27)

| | |
| --- | --- |
| `globalHeader` | The assembly. Desktop bar, mobile bar, panels, drawer. |
| `logo` · `bookNowButton` · `languageButton` | Primitives reused by bar and drawer. |
| `menuPanel` | Renders any `MENUS` entry — mega or narrow. One implementation. |
| `accountPanel` | Guest and authenticated shapes; repaints on session change. |
| `searchPanel` | The focused search sheet. |
| `mobileDrawer` | Drawer, accordions, support channels. |
| `initHeaderScrollState` | Sentinel + IntersectionObserver. |
| `setSession` / `getSession` | The Stage 12 seam. |

**The services mega menu is derived (since 10.5).** Its four columns are the
four approved categories and its items are registry records from
`data/services.js`; nothing in `navigation.js` names a service any more.

**The destinations menu is derived too (since 10.7).** Its columns are the
regions that contain something and its items are `data/destinations.js`
records. The former "most popular" column is gone: the registry has no such
field, so the menu cannot claim it.

**The offers menu lists the data-driven categories (since 10.8)** from
`data/offers.js`; each item opens the listing filtered on that category.

### Decisions worth knowing

**Click, never hover (§22).** Menus open on click only. A cursor crossing the
bar cannot fire a panel. Escape closes and returns focus to the trigger;
ArrowDown opens and lands on the first item; tabbing out closes; opening one
menu closes any other.

**The mega panel is not inside its `<li>`.** It spans the container, so
`inset-inline: 0` inside the list item would resolve against the button's own
width and collapse the panel to a strip. Mega panels are siblings of the bar
inside `.c-gh__inner`; the narrow dropdowns stay anchored to their trigger.

**The scrim is layered below the bar.** It is a child of the header, so
`z-index: 1` covers the page while `.c-gh__inner` at `2` keeps the header
clickable. Appending a scrim after the bar without this makes the header
swallow its own clicks, including the one that would close the menu.

**Scroll state costs nothing (§26).** A 1px sentinel above the header, watched
by IntersectionObserver. No scroll handler runs on the main thread — this
component is on every page, so it must not be the thing that makes scrolling
janky. The bar goes 80px → 64px and the logo 56px → 44px; only padding and the
logo animate, so nothing jumps.

**Height is derived (§31).** `--header-shell` is logo + padding. Change the
logo size and the header follows.

**One red action (§11).** The bar holds exactly one `.c-btn--primary`. The
drawer's Book Now and the account panel's Sign in are inside closed overlays,
so they never compete. Verified by counting *visible* primary buttons.

**Language switch.** Tablet and up it sits in the bar; on a phone it moves into
the drawer, because §15 wants the phone header down to logo, search, account
and menu. Arabic and English are both first-class (§06 of 10.1), so it has to
be reachable from every page.

**No remote dependency (§33).** `navigation.js` is static and bundled. An API
outage cannot empty the navigation.

### Future stages (§28)

`setSession({ authenticated, name, role })` switches the account menu between
`ACCOUNT_GUEST` and `ACCOUNT_CUSTOMER`. Stage 12 calls it; the header does not
own a session.

Roles beyond `customer` deliberately add **nothing** here. Supervisor and admin
navigation are separate systems and must not be merged into this file. A
customer visiting a supervisor's public profile sees the Number One header
unchanged — the supervisor's identity belongs in the page content (§29).

`variant: 'booking'` drops the primary nav and the CTA and shows a secure-booking
note instead, while keeping logo, support and account. Verified: zero visible
nav links, zero visible CTAs, support and account still one click away (§32).

### Acceptance (§34)

Verified in-browser at 390 / 834 / 1440 in both directions:
**96/96** site checks · **42/42** responsive · **17/17** interaction.

| | |
| --- | --- |
| Logo used correctly, no redesign | ✅ the Stage 10.1 `.c-logo` component |
| Desktop / tablet / mobile headers | ✅ separate compositions, not a squeeze |
| Primary navigation, 5 items | ✅ services not exposed top-level (§04) |
| Services mega · Destinations · Offers · Support | ✅ one `menuPanel` renders all four |
| Global search trigger | ✅ focused sheet, autofocused, 5 scopes |
| Account entry, guest + authenticated | ✅ `setSession` switches it |
| Book Now CTA | ✅ exactly one visible red action |
| Sticky · scrolled · hover · active · focus | ✅ 80→64px, active carries weight + rule |
| Dropdown behaviour | ✅ click-open, Escape, outside click, one at a time |
| Mobile drawer + accordion | ✅ all collapsed on open (§17) |
| RTL / LTR | ✅ drawer mirrors edge; verified both |
| Keyboard · Escape · touch targets | ✅ every control ≥44px, every button labelled |
| No horizontal overflow | ✅ at all three widths, both directions |
| Stage 11/12 · supervisor · admin separation | ✅ see above |

#### Open

- Support channels carry `href: null` until the business supplies the numbers
  (Stage 10.4 removed the `wa.me/` and `tel:+249…` placeholders). The header
  renders only channels with an href — `liveChannels()` in `data/navigation.js`
  — so the help panel and drawer show none today and both the moment the
  values are set.
- Destination and offer routes point at pages later stages build; until then
  they land on the 404, which is branded and offers a way back.

---

## 10.3 — Global footer
Completes the global navigation begun in [`NAVIGATION.md`](NAVIGATION.md) and
inherits [`FOUNDATION.md`](FOUNDATION.md).

```
assets/js/data/footer.js        brand copy, columns, contact, social, legal, CTA
assets/js/components/footer.js  every component in §23
assets/css/13-footer.css        the .c-gf layer
```

```js
import { mountFooter } from './assets/js/foundation.js';
mountFooter({ target: document.querySelector('.l-page'), variant: 'marketing' });
```

### §27 is enforced by the code, not by discipline

Nothing invented reaches the page, because there is no code path that could put
it there:

| | Renders only when |
| --- | --- |
| A contact row | its `value` is set |
| A social link | its `url` is set |
| A legal link | its `exists` is `true` |

Today that means the footer ships with **no contact rows** (WhatsApp and Call
are `href: null` in `data/navigation.js` since Stage 10.4 — the placeholders are
gone), **no social links** and **no legal links**. That is the honest state of
the business information we have, and it is visible in the build rather than
papered over with plausible-looking fakes.

`mountFooter({ cta: false })` drops the footer's own call to action for a page
that carries its own final CTA directly above it (the homepage); the default is
on.

**To turn each on:** set the value in `data/footer.js`. Phone and WhatsApp live
in `data/navigation.js` (`SUPPORT_CHANNELS`) so the header and footer can never
drift apart — change them once.

No newsletter (§12): not added until the business asks, and it would need
consent handling when it is.

### Decisions worth knowing

**Accordions are semantics, not CSS.** Below 48em a column renders a real
`<button>` with a truthful `aria-expanded`. At and above it renders a **heading**
— not a button switched off with `pointer-events: none`. The first attempt did
exactly that and left three focusable buttons on every desktop page that a
keyboard user could reach and activate, toggling an `aria-expanded` that
described nothing over a panel CSS was forcing open. `mountFooter` re-renders
when the page crosses the breakpoint.

**Variants are built, not hidden.** `marketing`, `booking` and `app` differ in
what the component constructs. A hidden link wall still ships in the DOM and
still costs the accessibility tree (§25). The booking footer keeps the live
support channels, because §07 wants support visible and a customer mid-booking
should not have to leave the flow to find it.

**Services runs two abreast on desktop.** §05 lists eleven services and §15 asks
not to build a wall of links, so that column spans two tracks.

**The services list is derived from the header's own mega menu.** One source, so
the two navigation surfaces cannot disagree about what we sell.

**The year is read at render time** (§14), never written into markup.

**§19 route graphic** is a single 2px gradient rule at the top edge that fades in
from the start of the line. It carries no content and never sits under text.

### Acceptance (§28)

Verified in-browser at 390 / 834 / 1440 in both directions —
**62/62** footer checks, alongside 96/96 site, 42/42 header-responsive and
17/17 header-interaction.

| | |
| --- | --- |
| Logo · brand statement | ✅ reversed lockup on the dark surface |
| Services · Explore · Support columns | ✅ data-driven, services derived from the header |
| Contact · Social · Legal structure | ✅ implemented; renders only verified values |
| Primary CTA | ✅ exactly one, verified by counting visible primary buttons |
| Dynamic copyright year | ✅ |
| Desktop · tablet · mobile | ✅ 6-track grid → 2 columns → single column |
| Mobile accordions, collapsed by default | ✅ §17; panel clipped to 0 height |
| Mobile order | ✅ logo → statement → CTA → contact → accordions → legal (§16) |
| RTL / LTR | ✅ both verified, hover nudge mirrors |
| Accessibility · keyboard · focus | ✅ semantic `<footer>`, labelled `<nav>` landmarks, white focus ring on dark, every control ≥44px |
| No horizontal overflow | ✅ all widths, both directions |
| Component architecture · data-driven | ✅ §23 components, links configurable |
| No invented business information | ✅ structurally impossible |
| Booking · account · supervisor compatibility | ✅ three variants |

#### What the business still needs to supply

Phone number · WhatsApp number · email · office address · verified social
accounts · the five policy pages in §13. Each is one value away from appearing.

---

## 10.4 — Homepage
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

### The page, top to bottom

| # | Section | Built from | Data |
| --- | --- | --- | --- |
| 01 | Hero + booking entry (since 10.9 it validates and persists the same booking context as `book/`, see `docs/STAGES.md#109--booking-entry`) | `heroCopy` `heroMedia` `heroSearch` → `searchWidget` | `HOME_HERO`, `SEARCH_VERTICALS` |
| 02 | Services | `servicesGrid` → `serviceCard` | `HOME_SERVICES` = the 10.5 registry (12, six `featured`) |
| 03 | Why Number One | `valueList` | `HOME_VALUES` |
| 04 | Help me choose | `chooseModule` | `HOME_PRIORITIES` |
| 05 | Destinations | `destinationGrid` → `destinationCard` | `HOME_DESTINATIONS` = registry records flagged `home` (10.7) |
| 06 | Offers & packages | `offerGrid` → `offerCard` | `HOME_OFFERS` = the first three registry records (10.8) |
| 07 | How we help | `journeySteps` | `HOME_JOURNEY` |
| 08 | Human support | `supportPanels` | `HOME_SUPPORT` + `liveChannels()` |
| 09 | Final CTA | markup, `data-home-action="book"` | — |
| 10 | Global footer | `mountFooter({ cta: false })` | 10.3 |

### Decisions worth knowing

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

### Acceptance

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

#### Still needed from the business

The hero photograph and destination/offer imagery · real offers (price,
validity, inclusions) · phone and WhatsApp numbers · the pages the menus and
cards link to (Stage 11 onward).

---

## 10.5 — Services
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

### One registry, every surface

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

### The page, top to bottom

| | Section | Built from |
| --- | --- | --- |
| A | Hero, one primary CTA "ابدأ رحلتك" | `.c-hero` (10.4) + `servicesHero` |
| B | Category navigation, sticky from tablet up | `categoryNav` — chips with `aria-pressed` |
| — | "What happens next" legend | `kindLegend` — the three kinds, badge + one line |
| C–F | Four groups × three cards | `serviceGroupHead` + `serviceCard(record, { media, kind, entry })` |
| G | Help me choose, five options | `helpOptions` — links to a service entry, or a button that moves in-page |
| H | Human support | `supportPanels` (10.4), channels only when verified |
| I | Global footer | `mountFooter` |

### Decisions worth knowing

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

### Acceptance

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

#### Still needed from the business

Service photography (`image.src` per record) · the detail pages (Stage 10.6)
· the numbers that switch the contact channels on.

---

## 10.6 — Service details
One template, every service. Built on the 10.1 foundation, the 10.2 header,
the 10.3 footer, the 10.4 hero/journey/support/CTA compositions and the 10.5
registry. Nothing here redefines a token or a component.

```
services/<slug>/index.html            GENERATED route shells — one per service
tools/build-routes.mjs         writes the shells + sitemap from the registry
assets/js/data/service-details.js     page content per service (+ shared benefits)
assets/js/components/service-detail.js  the template: sections, CTA logic, states
assets/css/16-service-detail.css      overview points · feature card · requirements
```

```js
import { mountServiceDetail, getServiceDetail } from './assets/js/foundation.js';
const detail = mountServiceDetail({ slug: 'flights' });   // what every shell does
detail.render('umrah');       // any slug; unknown → "service does not exist" state
detail.region.error();        // hero region: loading() error() empty() content()
getServiceDetail('visa');     // registry identity + page content, merged
```

### Routes

`/services/<slug>/` for every registry record: flights, hotels, visa, packages,
umrah, transport, groups, medical, study, work, ticket-issue, ticket-change,
ticket-cancel. The slug is the last segment of the record's `href`, derived
once in `data/services.js`, so a route and its links cannot drift.

**Why generated shells.** The site has no build step and GitHub Pages serves
directories, so a real route is a real `index.html`. Every shell is identical
apart from the slug and its static `<title>`, description and canonical (so
search engines see them without script); the page is drawn at runtime by one
module. The shells are content, not code: after adding, renaming or retiring
a service run

```bash
node tools/build-routes.mjs
```

and commit the result. The same tool generates the offer routes (10.8); it
removes a directory a registry no longer names and refreshes each block in
`sitemap.xml`. Do not edit a shell by hand.

An unknown path (`/services/anything-else/`) is a real 404: GitHub Pages
serves the branded `404.html`, which resolves the site root through `<base>`
and offers the services.

### The page, top to bottom

| | Section | Rendered when | Built from |
| --- | --- | --- | --- |
| A | Breadcrumb: home › services › category › service | always | `breadcrumb` → `.c-breadcrumb` |
| B | Hero: category + kind badge, H1, short description, primary + secondary CTA, visual | always | `.c-hero` (10.4) |
| C | Overview: one paragraph + optional points | `description` | `.c-detail__lead` `.c-detail__points` |
| D | What we help with | `features[]` | `.c-feature` on `.c-card--flat` |
| E | Benefits | `benefits[]` | `.c-value` (10.4) |
| F | How it works, 3–5 numbered steps | `steps[]` | `journeySteps` (10.4), columns = steps |
| G | What we need from you | `requirements` | `.c-req` + `.c-note` |
| H | Related services, up to three | `related[]` or same category | `serviceCard` compact |
| I | Human support | always | `supportPanels` (10.4), verified channels only |
| J | CTA band, the same dominant action | always | `.c-cta-band` (10.4) |
| K | Global footer, its own CTA off | always | `mountFooter({ cta: false })` |

A section whose content is missing is `hidden`, not rendered empty (§4).

### Decisions worth knowing

**One dominant action, decided by data.** `primaryAction` on the detail
record is `book`, `request` or `expert`: "احجز الآن" and "ابدأ طلبك" open the
homepage booking entry on the service's vertical; "تحدث مع خبير" opens the
help centre. The secondary button is always the *other* door and never red.
The CTA band repeats the same action; the header's Book Now is global.

**Requirements are what *we* ask for, never official rules.** Items are
traveller data, trip data, a passport copy, a ticket number. Records with
`official: true` (visa, Umrah, medical, study, work) add the neutral note that
official requirements vary by destination and nationality and are explained
during the request. No visa, airline, medical or government rule is stated.

**Benefits are the brand's five, picked per service.** `SERVICE_BENEFITS`
holds trust, the right choice, simplicity, speed, human support; each record
picks three or four. No superlatives.

**States.** Skeleton → content on every page. Unknown slug → an empty state
with "our services" and "talk to an expert". A known service with no detail
entry → hero and CTA from the registry, a "details coming soon" note, related
services by category, everything else hidden. Load failure → the error state.

**Head follows the language.** `document.title`, the description and the
Open Graph pair are re-written on every render from the record, so the
English page is titled in English; the canonical stays one URL per service.

**Group trips are back.** The 10.5 brief's approved twelve did not include
them; the 10.6 brief lists them, so `groups` is a registry record again
(programmes, on request). Removing it is one record and one generator run.

### Acceptance

Verified in-browser — **470/470** service-detail checks: all 13 routes in both
languages at 1440, a sample at 390 and 834, CTA logic and destinations, the
five states, the invalid route, keyboard and focus, plus 146/146 services,
169/169 homepage, 96/96 site, 17/17 header interaction, 42/42 header
responsive, 62/62 footer, and the language audit at **0 untranslated** across
all 17 pages.

| | |
| --- | --- |
| Reusable template, all services, data-driven | ✅ one module, 13 generated shells |
| Arabic · English · RTL · LTR | ✅ |
| 390 / 834 / 1440, no horizontal overflow, hero single-column on phones | ✅ |
| CTA logic per record · related services · requirements data-driven | ✅ |
| Loading / empty / error / success · unknown slug · missing data · 404 | ✅ |
| Accessibility: one h1, ordered headings, breadcrumb nav, focus rings, alt text, decorative hidden | ✅ |
| SEO: unique title, description, canonical per route; language metadata | ✅ |
| Header and footer intact · no invented business information | ✅ |

#### Still needed from the business

Service photography (one image per record) · any approved facts to add to a
service's page (partners, coverage, timings) · the numbers that switch the
contact channels on.

---

## 10.7 — Destinations
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

### One registry, every surface

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

### The page, top to bottom

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

### Decisions worth knowing

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

### Acceptance

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

#### Still needed from the business

Destination photography (one image per record) · confirmation of which
purposes and services apply to each destination (launch content today) ·
the numbers that switch the contact channels on.

---

## 10.8 — Offers & packages
Built on the 10.1–10.7 foundation: the hero, choose and CTA compositions,
the chip nav, the card system, the state machinery, the modal (as a phone
sheet), the journey steps, the support panels, the service and destination
registries. Nothing here redefines a token or a component.

```
offers/index.html                 the listing: /offers/  (?category=… opens filtered)
offers/<slug>/index.html          GENERATED detail routes — one per registry record
assets/js/data/offers.js          THE offer registry: categories, statuses, sorts,
                                  guides, records, queryOffers()
assets/js/components/offers.js    listing (hero, chips, filters, sheet, deck, featured,
                                  guides, mountOffers) + detail template (mountOfferDetail)
assets/js/components/cards.js     offerBadge · priceBlock · offerMeta · inclusionList · offerCard
assets/css/18-offers.css          card parts · filter bar/sheet · itinerary
tools/build-routes.mjs            writes services/<slug>/ and offers/<slug>/ shells + sitemap
```

```js
import { mountOffers, mountOfferDetail, queryOffers } from './assets/js/foundation.js';
const offers = mountOffers({ initial: { category: 'umrah' } });   // the listing
offers.set({ destination: 'dxb', sort: 'price' });                 // what the filters do
offers.regions.grid.error();                                       // loading() empty() error() content()
const offer = mountOfferDetail({ slug: 'umrah' });                 // what every shell does
```

### Data: the registry, and what "placeholder" means

`OFFER_REGISTRY` records carry `id`/`slug`, `category` + `categories`,
`destination` (a destinations-registry id), bilingual `title` / `short` /
`desc`, `duration { nights }`, `price`, `status`, `bookingMode`, `featured`,
`placeholder`, `services`, `inclusions`, `exclusions`, `itinerary`,
`important`, `terms`, `faq`, `travelPeriod`, `publishedAt`, `image`.

The three launch records are **placeholders and say so**: `price: null`,
`duration.nights: null`, empty inclusions, itinerary, terms and FAQ. What
the customer sees for such a record:

- "اطلب السعر" wherever a price would be, never a number;
- "المدة حسب طلبك" for the duration;
- a note in the overview: the programme, price and dates are approved before
  publication, request the offer and a specialist comes back;
- "ما تُبنى عليه الباقة" listing the services the package is made of (from
  the service registry), instead of an inclusions list nobody approved;
- the sections that need approved content (not included, programme,
  important information, terms, FAQ) hidden, never empty.

Give a record a price, nights, lists and `placeholder: false`, and every
surface — card, hero, detail sections, filters — shows them. The template
was verified with such a record in the browser (below).

### Listing

| | Section | Built from |
| --- | --- | --- |
| 1 | Hero: title, lead, "تصفّح العروض" + "ساعدني في الاختيار" | `.c-hero` |
| 2 | Featured offer, one large card | `offerCard(record, { large })` |
| 3 | Category chips with counts (six data-driven categories) | `.c-catnav--inline` |
| 4 | Filters: destination, service type, sort — plus duration, price and travel period **only when some offer carries them** | `filterControls` → `.c-filters` |
| 5 | Count line + offer deck | `offerCard` |
| 6 | Help me choose: seven chips that apply a filter or a sort | `.c-choose--band` |
| 7 | Final CTA: "اطلب باقة" → booking entry on packages; "تحدث مع خبير" | `.c-cta-band` |

**One filter form, two homes.** From tablet up the form sits inline above
the grid and applies live. On a phone it lives inside a `<dialog
class="c-modal">` — the modal primitive is a bottom sheet under 48em — opened
by a "الفلاتر" button, applied by its own button. `mountOffers` moves the
same node between the two hosts as the viewport crosses the breakpoint and
clears both first, so a re-mount (a language change) never leaves a copy.

**Sorting never drops an offer.** `queryOffers()` sorts unknown values last:
an unpriced offer sorted by price stays in the list, at the end. A duration
bucket, by contrast, is a filter and matches only known durations.

### Detail template

Breadcrumb · hero (status + category badges, H1, destination and duration
meta, short description, large price block, one primary CTA and a
subordinate secondary, image slot) · overview · included (or "built around")
· not included · programme · important information · terms · FAQ (the
accordion primitive) · how the request works (the journey steps, 4 for
request, 5 for online booking) · more offers · human support · CTA band ·
footer with its own CTA off. Title, description and Open Graph follow the
record and the language.

**The CTA is decided by the record.** `bookingMode: 'online'` → "احجز الآن";
`'request'` → "اطلب العرض"; `status: 'soon'` → "تحدث مع خبير"; `'ended'` →
"تصفّح العروض". Both doors open the homepage booking entry on the offer's
vertical with the offer and its destination carried
(`?vertical=packages&offer=<slug>&to=<destination>`); `index.html` prefills
the destination and sends the offer id on with the search.

**The flow, honestly.** Offers → offer details → request → the booking entry
→ the Stage 11 route, where traveller information, review, payment or
request submission and confirmation live. Nothing on these pages pretends to
submit or confirm a request; when the engine exists, `offerEntry()` is the
one function that changes.

### Acceptance

Verified in-browser — see the commit for the exact counts — at 390 / 834 /
1440 in both directions: the listing's structure, chips, live filters, the
phone sheet (open, apply, Escape), sorting, guide chips, `?category=`, the
five states; every detail route in both languages; the template with a full
synthetic record (every section, real price, accordion); the deep link into
the booking entry; keyboard and focus; plus every earlier suite and the
language audit at 0 untranslated across all 22 pages.

#### Still needed from the business

Real offers: programme, price, dates, inclusions and exclusions, terms —
each is a field on the record · offer photography · the numbers that switch
the contact channels on.

---

## 10.9 — Booking entry
Built on the 10.1–10.8 foundation: the search widget, the field system, the
segmented control, the popover and stepper, the card, the state machinery,
the choose module, the trust list, the booking header and footer variants.
Nothing here redefines a token or a component. Nothing here calls an API:
the page ends in a **booking context**, the object Stage 11 consumes.

```
book/index.html                      the entry: /book/  (?vertical=&to=&service=&offer=&sort=)
assets/js/core/booking.js            THE booking context: buildContext · validate ·
                                     saveContext / loadContext · contextToParams ·
                                     continueUrl · entryUrl · applyEntryParams
assets/js/components/booking.js      serviceSelector · contextSummary · bookingTrust · mountBooking
assets/js/components/search.js       the widget, now data-driven for `when`, legs, pax counts,
                                     values() / setError() / clearErrors()
assets/js/data/config.js             SEARCH_VERTICALS: eight bookable services and their fields
assets/css/19-booking.css            pick cards · page layout · legs · travellers · summary
```

```js
import { mountBooking, buildContext, validate, loadContext } from './assets/js/foundation.js';
const booking = mountBooking({ params: new URLSearchParams(location.search) });
booking.select('hotels');            // what a service card does
booking.submit();                    // what the red button does: validate → prepare → summary
booking.region.error();              // loading() empty() error() content()
booking.context;                     // the last prepared context, or null
loadContext();                       // the same object, on the next page
```

### SELECT → DEFINE → CONTINUE, on one page

| | Block | Built from |
| --- | --- | --- |
| 1 | "أريد أن أحجز… ماذا؟" and eight service cards — flights selected, the radio group the keyboard walks with the arrow keys | `serviceSelector` · `.c-pick-grid` |
| 2 | "حدّد احتياجك": the widget for the chosen service with its tab strip hidden, a one-line caption per service | `searchWidget({ tabs: false })` |
| 3 | The one red action — "ابحث عن الرحلات" on flights, "ابحث" / "اطلب عرضاً" elsewhere | `vertical.submit` |
| 4 | "ساعدني في اختيار الرحلة" — a tertiary disclosure that opens the priorities and hands focus back to the form | `chooseModule(HOME_PRIORITIES)` |
| 5 | Trust and support — four verified statements, the help centre, the contact channels once they have an `href` | `bookingTrust` · `liveChannels()` |
| 6 | Success — the context summary with "متابعة إلى الخيارات" (the one red action now) and "تعديل" | `contextSummary` |

**The form is data.** Every service is a `SEARCH_VERTICALS` record; its
fields are declared, not coded. Stage 10.9 added three field behaviours the
widget reads from the data:

- `when: { field, value | values }` — a field shows only while another
  control holds that value. One way hides the return date; multi-city hides
  from/to/dates and shows the legs. Hidden fields are disabled too, so the
  form never carries stale values.
- `legs` — a repeatable from/to/date group, `min`..`max` rows (2..4), add
  and remove, renumbered.
- `pax` — the travellers trigger now writes `adults` / `children` /
  `infants` as hidden inputs and reads a family-first summary ("بالغان ·
  طفل واحد · رضيع واحد"), with a note when infants outnumber adults or the
  nine-seat maximum is reached.

Flights carries trip type (round trip · one way · multi-city), from, to,
departure, return, travellers, cabin (economy · premium · business · first)
and direct flights under "more options". Hotels carries destination,
check-in, check-out, guests and rooms (1–4). Packages, visa, Umrah, medical,
transport and other services keep their 10.4 fields.

### The booking context

`buildContext(vertical, formData, extras)` returns one flat, serialisable
object with stable keys — every field a service does not use stays empty
rather than absent:

```
version · service · tripType · origin · destination · legs[{from,to,date}]
dates{depart,return,checkin,checkout} · travellers{adults,children,infants}
rooms · cabin · options{direct,sort,offer,nights,country,nationality,service,notes}
locale · createdAt
```

`validate(vertical, ctx)` holds the customer-facing rules only — nothing
about availability: origin, destination, a different destination, departure,
return (and after departure) on a round trip; every multi-city leg complete
and in date order; check-in and check-out (and after check-in); at least one
adult, an infant per adult at most, nine travellers in total. Each rule
names the control it marks, so the message sits under the field
(`aria-invalid`, `aria-describedby`, `role="alert"`), focus moves to the
first one, and the status line says how many to check. Rules that hit the
same control read as one line.

On submit: clear errors → build → validate → the button's loading state and
"جاري تجهيز البحث..." → `prepare(ctx)` (the seam Stage 11 plugs the engine
into; today it persists the context in `sessionStorage` under
`no.booking.context`) → the summary, or the error state ("تعذر تجهيز
البحث. يرجى مراجعة البيانات والمحاولة مرة أخرى.") with retry. "Continue"
links to `search/?…` with the context flattened by `contextToParams`, so
the next stage can read it from either the URL or storage.

### Every door leads here

`serviceEntry`, `destinationEntry` and `offerEntry` — the helpers every
card, hero and CTA on the site already used — now return `book/?…`, so the
homepage, services, service details, destinations and offers all land on
this page with the service selected (`?vertical=`), the destination prefilled
in the customer's language (`?to=<slug>`), the "other services" option
chosen (`?service=`) or the offer carried into the context (`?offer=`). The
header's "احجز الآن", the bottom nav's "احجز" and the help panel's booking
link point here too. The homepage hero keeps its own widget and now runs the
same `buildContext` → `validate` → `saveContext` → `continueUrl` path, so
both entries produce the same object.

Since Stage 10.10 a `?supervisor=<slug>` on any door is stored for the
session and written into the context as `attribution` (see
`docs/STAGES.md#1010--supervisor-profile`); the page shows who the customer is booking with.

A language change re-mounts the page on the chosen service and drops the
URL prefills; the header and footer are the booking variants (no second red
action, "حجز آمن — بياناتك محمية").

### Acceptance

Verified in-browser — see the commit for the exact counts — at 390 / 834 /
1440 in both directions: the eight cards, their columns, the keyboard walk
and roving tabindex; every service's form and its one primary action; trip
types, legs (add to four, remove, renumber), the travellers popover and its
notes; every validation message in place with focus and status; the loading,
success (summary rows, continue URL, persisted context), edit, error, retry,
empty and skeleton states; help-me-choose; the deep links from every door;
the language switch; the header search hand-over; focus rings; plus every
earlier suite and the language audit at 0 untranslated across all 23 pages.

#### Still needed from the business

Nothing on this page states a fact the business has not approved. Stage 11
needs: the airport and city list the place fields autocomplete from · the
booking engine or supplier the `prepare` seam calls · the numbers that
switch the contact channels on.

---

## 10.10 — Supervisor profile
Built on the 10.1–10.9 foundation: the header and footer, the card system
(service, destination, offer), the badge, chip, trust-list, note, state and
CTA-band primitives, the toast, the booking entry and its booking context.
Nothing here redefines a token or a component, and nothing here is a
supervisor's own brand: the page is **Number One + a personal supervisor**.

```
supervisor/<slug>/index.html         GENERATED public profiles — one per registry record
assets/js/data/supervisors.js        THE supervisor registry: statuses, languages, specialties,
                                     records, selectors, channels, attributed routes
assets/js/components/supervisor.js   profileHero · aboutSection · servicesSection · trustSection ·
                                     contactSection · discoverySection · ctaBand · mountSupervisor
assets/js/core/booking.js            saveAttribution / loadAttribution / attributionFrom;
                                     the booking context now carries `attribution`
assets/js/components/booking.js      attributionChip on /book/, "supervisor" row in the summary
assets/css/20-supervisor.css         profile hero · facts · channels · discovery · attribution chip
tools/build-routes.mjs               writes supervisor/<slug>/ shells + the sitemap block
```

```js
import { mountSupervisor, supervisorBySlug, loadAttribution } from './assets/js/foundation.js';
const profile = mountSupervisor({ slug: 'supervisor-1' });   // what every shell does
profile.render('nobody');                                    // unknown slug → empty state
profile.paint({ ...record, nameAr: '…' });                   // any record through the template
profile.region.error();                                      // loading() empty() error() content()
loadAttribution();                                           // { supervisor, source, at } | null
```

### Data: the registry, and what "placeholder" means

A `SUPERVISOR_REGISTRY` record carries `id`, `slug`, `status`, bilingual
`name` / `title` / `bio`, `image { src, altAr, altEn }`, `languages`
(`SUPERVISOR_LANGUAGES` ids), `specialties` (the travel purposes — one
vocabulary with the destinations page), `services` (service-registry ids),
`phone`, `whatsapp`, `email`, `createdAt`. That is the contract the admin
dashboard will edit: add a record, change a field, set `status:
'inactive'`, rename a slug and re-run `node tools/build-routes.mjs`.

The five launch records are **placeholders and say so**: every personal
field is `null`, the services list is the default set of eight, and no
channel is set. What the customer sees for such a record:

- the neutral name "مشرف نمبرون" and the role line, never an invented bio;
- the neutral photo slot (labelled "no photo yet");
- an info block in the About section saying the details are being
  completed, with the booking door beside it;
- the eight default services, the trust statements, the attributed
  request-assistance door, the discovery rows and the final CTA.

Give a record a name, title, bio, photo, languages, specialties and
channels, and the template shows them all — verified in the browser with a
full synthetic record (below). A null channel produces no action, so no
placeholder number can reach a customer.

### The page

| | Block | Built from |
| --- | --- | --- |
| 1 | Hero: photo with the Number One ring, brand mark + "مشرف من نمبرون", name, title, verified badge (from `status`), bio, **"ابدأ الحجز"** (the one red action) and "تواصل مع المشرف" | `.c-profile` · `logo` · `.c-badge` |
| 2 | About: languages, areas of expertise, services count, public profile link with copy | `.c-facts` · `toast` |
| 3 | Services the supervisor handles — the existing service card, every action attributed | `serviceCard` |
| 4 | Trust: five statements that are true of the Number One journey, no numbers | `.c-trust-list` |
| 5 | Contact: verified channels as cards, else a note; "اطلب المساعدة" always | `.c-channel` · `.c-note` |
| 6 | Discovery: three destinations and three offers, attributed, secondary | `destinationCard` · `offerCard` |
| 7 | Final CTA band, attributed; the footer's own CTA is off | `.c-cta-band` |

Unknown slug → the "profile does not exist" state with the plain booking
door and the expert door. `status !== 'active'` → the "currently
unavailable" state. A load failure → the error state with retry. Loading →
a profile skeleton.

### Attribution hand-off

Every door on the profile carries `?supervisor=<slug>`:
`supervisorEntry(sup, { vertical })`, `attributed(path, sup)`,
`supervisorContactUrl(sup)`. The booking entry (and the homepage hero)
read it through `attributionFrom(params)`: an **active** registry slug is
stored in `sessionStorage` under `no.attribution` as `{ supervisor,
source: 'link', at }`; anything else is ignored. From then on, for the
session, `buildContext()` writes `attribution: { supervisor, source }`
into every booking context (`source: 'session'` when it came from
storage), `contextToParams()` adds `supervisor=` to the continue URL, the
summary shows a "المشرف" row, and `/book/` shows the attribution chip
with a link back to the profile. Commission logic belongs to a later
stage; only the hand-off exists here.

### Acceptance

Verified in-browser — see the commit for the exact counts — at 390 / 834 /
1440 in both directions: the hero (stacked on phones, side by side from
tablet), the neutral placeholder rendering, the badge, the sections, the
attributed service, discovery and CTA doors, the contact action and the
copy-link row (success and failure), a full record through the template
(name, title, bio, photo alt, languages, expertise, three channels), the
skeleton, unknown, inactive, error and retry states, the hand-off into
`/book/` (chip, stored attribution, context, summary row, continue URL),
the session persistence on a plain `/book/` visit and the homepage hero,
the unknown-slug guard, keyboard and focus rings; plus every earlier suite
and the language audit at 0 untranslated across all 28 pages.

#### Still needed from the business

For each supervisor: name (Ar + En), photo (square, with consent), title,
bio, languages, areas of expertise, the services they handle, and the
verified phone / WhatsApp / email — each is a field on the record. The
slug should become the person's public handle before launch.

---

## 10.11 — Responsive & accessibility refinement
A QA pass over everything built in 10.1–10.10. Nothing was redesigned; the
audit found a short list of real defects and each was fixed at its source
(a token, a rule, a component), never with a one-off.

```
tools/a11y-audit.mjs   the cross-site audit this stage introduced (run it after any change)
```

### What the audit covers

Every key page at 390 / 600 / 834 / 1024 / 1200 / 1440 in both languages,
every generated route at 390 and 1440: horizontal overflow (naming the
element), clipped text, touch targets under 40px, text under 12px, images
without alt, decorative SVGs exposed to assistive tech, controls without a
name, inputs without a label, heading order and landmarks, duplicate ids,
dangling `aria-*` references, colour contrast (WCAG AA against the
composited background), focus rings on the first 30 tab stops, every header
control (opens, Escape closes, focus returns) and transition durations under
`prefers-reduced-motion`. It exits non-zero on any finding; the site is at
zero.

Beside it, the per-stage browser suites and the language audit ran again,
and a motion/keyboard pass exercised every overlay (mobile drawer, header
search, mega menu, footer accordion, offers phone sheet, travellers
popover) with and without reduced motion: focus lands inside, Tab cycles
without a trap, Escape closes, focus returns to the trigger.

### What was found and fixed

| Finding | Fix (where) |
| --- | --- |
| Small buttons, tertiary links and the trip-type segments were 36px tall — under a comfortable target | `--control-height-sm` is now 40px; the segmented option reads the same token (`01-tokens`, `06-forms`) |
| At the desktop line in English (1024–1060px) the header bar squeezed the logo image to ~38px | the brand column is `max-content` and, between 64em and 80em (where the action labels are still hidden), the primary links close ranks (`12-header`) |
| Opening a header menu with Enter, then Tab, skipped the open panel and left it open | Tab from an open trigger enters its panel; leaving the trigger elsewhere closes it (`header.js`) |
| Every in-page move used `scrollIntoView({ behavior: 'smooth' })`, which ignores `prefers-reduced-motion` (CSS `scroll-behavior` does not govern it) | one `scrollTo()` helper in `core/dom.js` picks the behaviour and focuses without a second scroll; all six call sites use it |
| The homepage "go to booking" focused the form on a 350ms timer, which under reduced motion left nothing focused | the helper focuses immediately with `preventScroll` |
| The style guide's section links were 37px tall | `min-block-size: var(--control-height-sm)` on the guide's own nav |

Reviewed and left as they are: the neutral text tokens (5.66:1 on white),
placeholder text (same token), the success/warning/error foregrounds; every
form control has a persistent label, required fields carry `required` and
a visible mark, invalid fields carry `aria-invalid` and `aria-describedby`
to a `role="alert"` message, and every region announces loading through
`aria-busy`. Chromium moves focus into a date input's shadow picker button,
which paints its own ring; the audit knows to ignore that one case.

### Acceptance

390 / 834 / 1440 plus 600 / 1024 / 1200, Arabic and English: no overflow,
no clipped content, no console errors; keyboard, focus, Escape and focus
return on every overlay; touch targets, headings, landmarks, names, labels,
contrast and reduced motion at zero findings; every earlier suite green and
the language audit at 0 untranslated across all 28 pages.

## 11 — Booking experience / booking engine

The journey from the Stage 10.9 booking context to a confirmed booking:
search → results → compare / filter → flight details → select → traveller
details → extras → review → payment → confirmation. One context system (the
10.9 context, extended with airport codes and attribution), one journey record
in the session, and a strict split between the screens, the booking domain and
the supplier adapters. Everything dynamic reaches the page through a clearly
labelled **development adapter**: fictional carriers, generated fares, a
simulated payment provider. No real inventory, no real prices, no real
provider — and every screen that shows such data says so.

```
search/index.html                      results (URL context or the saved one)
booking/details/index.html             one flight: segments, layovers, rules, price
booking/travellers/index.html          one form per traveller + contact
booking/extras/index.html              included and optional extras
booking/review/index.html              re-quote, price change, terms
booking/payment/index.html             provider boundary, failure recovery
booking/confirmation/index.html        reference, status, next steps

assets/js/booking/
  journey.js        the session record (no.journey): context, search, selection,
                    travellers, contact, extras, quote, payment, booking, draft;
                    STEPS, guard(step) → recovery reason + where to go back
  search.js         toSearchRequest(ctx) — resolves places, builds legs; runSearch
  locations.js      dev airport/city registry + searchLocations(query) (replaceable)
  rank.js           sorts, priorities, labels (cheapest / fastest / fewest stops /
                    best for family / balanced) with the rule each one prints; filters
  pricing.js        breakdown(offer, travellers, extras, price) — base, taxes, fees,
                    extras, total, one currency
  travellers.js     slots per traveller type, data-driven fields per service and mode,
                    validation (ages at travel date, passport, expiry, contact)
  payment.js        provider registry; DEV_PAYMENT (dev-success / dev-failure)
  adapters/index.js adapter contract + normalized Offer shape; request-mode fallback
  adapters/dev-flights.js   the development supplier (search, offer, extras, quote, book)
  adapters/installed.js     the adapters this build registers — a real supplier is one line here
  ui/               location-field (combobox), results, result-card, details,
                    travellers, extras, review, payment, confirmation, shared
assets/css/21-journey.css   every journey component (the flight card, price rows and
                    progress steps moved here from the 10.1 preview)
tests/journey.mjs   the Stage 11 suite (512 checks)
```

### Architecture

* **UI → domain → adapter.** Screens call the domain (`journey`, `search`,
  `pricing`, `rank`, `travellers`); the domain calls `adapterFor(service)`.
  An adapter returns the normalized shape documented in `adapters/index.js`
  (offer, carrier, legs, segments, stops, fare, baggage, rules, price per
  traveller type, taxes, fees, availability, extras) and nothing else. The
  screens never see supplier fields.
* **Search vs request.** A service with a search adapter (flights, in
  development mode) gets the full journey. Every other service is a
  **request**: the results screen explains that a specialist comes back with
  options and a price, the traveller form asks for names only, the review
  submits a request and the confirmation shows a *received* status with
  nothing charged. This is the honest state for services without inventory.
* **Session, not URL.** The journey record lives in `sessionStorage`; the
  URL carries only what a shared link needs (the search parameters, a flight
  id). Every screen runs `guard()` first and renders a recovery state
  (continue, back to results, edit search) instead of a blank page when the
  step's prerequisites are missing, and points at the confirmation once a
  booking exists so nothing can be charged twice.
* **Search freshness.** Results expire after 20 minutes; a refresh or a step
  back reuses fresh results instead of searching again.

### Screens

* **Results.** Search summary with edit; "help me choose" priorities (lowest
  price, fewest stops, shortest time, family friendly) that re-sort and print
  *why* on every card from the data itself; labels for cheapest, fastest,
  fewest stops, family and a balanced pick whose rule is shown — never
  "objectively best"; sort; filters (price, stops, times, duration, carrier,
  baggage, airports) as a panel on desktop and a sheet on phones; compare up
  to three on price, duration, stops, departure, arrival, baggage and fare
  rules, usable at 390px; loading skeletons at once, empty, error with retry,
  expired, unknown-place and filtered-empty states.
* **Details.** Segments with aircraft where the adapter has it, layovers,
  baggage, fare / change / cancel rules, what is included, the price
  breakdown, and one CTA: اختيار الرحلة.
* **Travellers.** One form per traveller (adult / child / infant) from the
  context's composition, fields per service and mode, validation tied to
  each control, ages checked at the travel date, a draft that survives a
  language switch or refresh.
* **Extras.** Included extras marked, optional ones priced per traveller with
  a stepper; the running total updates live; unavailable extras are not shown.
* **Review.** Trip, travellers, price (base, taxes, fees, extras, total),
  contact, supervisor when present — every block editable. The price is
  re-quoted on arrival: a change is shown with the old and new totals and the
  CTA re-labelled; an unavailable flight blocks and sends the customer back
  to the results.
* **Payment.** Amount, methods from the provider, the provider boundary (no
  card fields on this site, no secrets in the client), a clearly labelled
  development provider; processing feedback at once; failure keeps
  everything and offers retry, another method, or back to review; a
  supplier failure after a successful payment is its own warning state.
* **Confirmation.** Status (confirmed / received / processing), reference,
  customer, service, trip, date, payment status, total, ticket status
  (pending until the supplier confirms — never "issued"), next steps, view
  trip (planned route), print, support, new booking. Attribution to the
  supervisor is carried from the entry link through every step to here.

### Acceptance

`npm test` — the twelve earlier suites, the journey suite (512 checks: search
building for round trip, one way, multi-city, invalid dates, travellers and
places; results labels, sort, priorities, filters, compare, loading, empty,
error, expired; family forms and validation; extras; review re-quote, price
change, unavailable; payment processing, failure, retry, change method,
booking failure; confirmation; request-mode journey; the combobox; back and
refresh persistence; language switch mid-form; 390 / 834 / 1440 × ar / en on
every screen with no overflow, one h1, ≤ 1 dominant CTA, labelled controls,
zero Arabic left in English), the link check, the language audit (0
untranslated across 35 pages) and the accessibility audit (0 findings) all
green, with zero console errors.

### Business data still needed

A supplier adapter (GDS / NDC / aggregator) with credentials and a server-side
proxy; a payment provider (hosted fields or redirect) and its webhook; the
airport / city registry the supplier serves; fare-rule texts, baggage
policies and service-fee amounts; the terms the review step links to; e-mail
or SMS confirmation delivery. Until these exist the journey runs on the
development adapter and says so on every screen.

## 12 — Customer account

The authenticated customer ecosystem: sign in / sign up / sign out /
password recovery, a customer session the header reads, and an account
where a customer finds trips, bookings, travellers, documents, payments,
notifications, support and settings. Everything runs on two clearly
labelled **development adapters** (identity and customer data) that a
production identity provider and backend API replace one line each; no
screen presents the development set-up as security.

```
account/index.html                     dashboard
account/sign-in/ · sign-up/ · forgot-password/ · reset-password/ · sign-out/
trips/index.html                       my trips (?id= → one trip, everything that belongs to it)
account/bookings/index.html            bookings (?id= → one booking)
account/travellers/ · documents/ · payments/ · notifications/ · support/ · settings/

assets/js/account/
  auth.js             provider contract, the stored opaque token, restoreSession() (the
                      session the header shows is derived from the provider on every load),
                      signIn/signUp/signOut/requestReset/resetPassword, safeNext() for
                      booking continuity (in-site paths only)
  customer.js         the data facade: every call carries the session token; the adapter
                      resolves it to ONE customer — screens never name a customer id
  adapters/dev-auth.js       development identity: accounts in this browser, salted digest,
                             12-hour tokens, single-use reset links, a one-click development customer
  adapters/dev-customer.js   development records for the seeded customer; new customers start
                             empty and gain records only from bookings made on this site
  adapters/installed.js      the two registrations a production build swaps
  ui/shell.js         mountAccount(): session guard, navigation, support entry, shared pieces
  ui/auth-screens.js  sign in, sign up, forgot, reset, sign out
  ui/dashboard.js · trips.js · bookings.js · travellers.js · documents.js · payments.js ·
  notifications.js · support.js · settings.js
assets/css/22-account.css
tests/account.mjs   the Stage 12 suite (782 checks)
```

### Architecture and authorization

* **Authentication → session → data → screens.** `page.js` restores the
  session before the header paints; `components/session.js` is only ever
  set from the provider's answer. The client keeps one opaque token in
  `localStorage`; nothing about the role is trusted from the client.
* **Scoping.** `customer.js` passes the token to the adapter, which resolves
  it to a customer and answers from that customer's records. A URL id for a
  trip, booking or document that belongs to someone else resolves to *not
  found*; a call without a token is refused. The backend enforces the same
  boundary when connected; the frontend already never asks any other way.
* **Continuity.** Sign-in and sign-up accept `?next=` (validated: same site,
  no scheme, no traversal) and return there. The Stage 11 journey lives in
  the session, so a guest who signs in mid-booking continues where they
  were, with search, selection, options, typed draft, locale and supervisor
  attribution intact. At the confirmation a signed-in customer's booking is
  attached to the account (idempotently) and becomes a trip; a guest sees
  the invitation to keep it and, after signing in, returns to the same
  confirmation, where it is attached.
* **Attribution.** The supervisor from the entry link is carried through
  sign-up, the booking and the trip; the customer record takes it from the
  first attributed booking and cannot edit it. No commission, no supervisor
  surface (Stage 13).

### Screens

* **Dashboard** — identity, the next trip with a countdown, the latest
  booking, four quick actions, unread notifications, the support entry.
* **My trips** — search and status filter (shown once there are trips),
  cards with destination, dates, services, status and the next action.
* **Trip details** — every service of the trip (flight, hotel, visa …) in
  one view with reference, status, payment status and its details; the
  trip's documents (pending ones shown as *not issued yet*), payments,
  supervisor and support.
* **Bookings** — reference, service, date, status, payment status, total,
  trip; one booking with its documents and payments.
* **Travellers** — add / edit / delete saved travellers (names, birth date,
  gender, nationality, passport, expiry; nothing else). Passport numbers are
  masked in lists. A signed-in customer picks a saved traveller in the
  booking's traveller form.
* **Documents** — only what the (development) booking system issued:
  tickets, confirmations, receipts; a visa still with the consulate shows
  as pending with no action. A document opens in a dialog with print/save.
* **Payments** — booking, date, amount, currency, status, transaction
  reference, method label. No card data exists on this site.
* **Notifications** — unread/read, filter, mark one or all, open the
  related record.
* **Support** — verified channels only (none are configured, so the
  honest "announced soon" note), the supervisor when there is one, recent
  support replies.
* **Settings** — profile (name, phone, language; e-mail locked as the
  identifier; image slot honest), password change, sign out, the
  supervisor shown read-only.

### Acceptance

`npm test`: the earlier fourteen suites, the account suite (authentication
including invalid credentials, session expiry, reset links single-use and
non-enumerating, outage; authorization across two customers and via the
facade; trips, details, bookings, documents, payments, notifications,
support, settings; travellers add/edit/delete/validation and the booking
picker; booking continuity and attribution; 390 / 834 / 1440 × ar / en on
every screen with no overflow, one h1, ≤ 1 dominant action, labelled
controls, touch targets, no Arabic left in English; dialog focus handling),
links, the language audit (0 untranslated across 49 pages) and the
accessibility audit (0 findings) all green with zero console errors.

### Security notes and what production must supply

The development identity adapter keeps a salted SHA-256 digest of the
password in `localStorage` — a stand-in for testing screens, not security;
the notice on every auth screen says so. Production needs: a hosted
identity provider (server sessions or HttpOnly cookies, real password
policy, MFA if wanted), a backend customer API that enforces the customer
boundary, document storage with signed URLs, the payment layer's history
endpoint, notification delivery (e-mail / SMS / push), and the terms and
privacy documents the sign-up refers to.

## 12.1 — Production integrations (partially complete)

The account's six integrations connected through the adapter architecture:
hosted identity, customer backend API, document storage, payment history,
notification delivery, Terms & Privacy. Each is **implemented against a
documented backend contract and verified in a real browser against the
contract test server** (`tests/contract-server.mjs`); **none is connected to
a real external service**, because no backend, identity provider, storage,
payment endpoint, notification service or legal text exists for this
repository. `docs/INTEGRATION.md` is the full guide; the summary:

```
assets/js/data/env.js              public runtime configuration (generated at deploy by tools/write-env.mjs; .env.example)
assets/js/core/api.js              the HTTP client: cookie sessions, CSRF header, timeouts, customer-safe error codes
assets/js/core/diagnostics.js      scrubbed technical events, optional beacon to the backend
assets/js/account/adapters/
  session-api-auth.js · api-customer.js · api-legal.js     the production adapters (NOT CONNECTED)
  not-connected.js                                          production without a backend: fails safely
  installed.js                                              chooses by environment; production never gets dev data
assets/js/account/legal.js         Terms / Privacy seam (fetch, version, sanitise) — never writes legal text
legal/terms/ · legal/privacy/      the pages (say "not published" until the text is supplied)
tests/contract-server.mjs          the backend stand-in: cookie sessions, CSRF, per-customer scoping, signed expiring URLs, faults
tests/integration.mjs              518 checks: auth, authorization, documents, payments, notifications, legal, continuity, errors, 6 widths × 2 languages
```

What changed on screen: documents can be uploaded, are viewed through
temporary signed links (expiry shown, renew on lapse) and deleted where
permitted; payments page through the history; notifications refresh quietly
on focus; the sign-up shows the acceptance checkbox with Terms and Privacy
links when the documents are published and records the versions; every
failure has a customer-language state (network, timeout, 401, 403, 404,
429, 5xx, not connected) with retry and a support path; a backend that is
unreachable while verifying the session no longer signs the customer out.

Status: **STAGE 12.1 — PARTIALLY COMPLETE.** Connected: nothing external.
Pending with exact inputs: see `docs/INTEGRATION.md` §13.

## 12.2 — Real backend and production security (partially complete)

The contract from 12.1 now has a **real, deployable implementation**:
`backend/` — a dependency-free Node 22 service (SQLite, migrations) with
backend-managed identity (scrypt, lockout, neutral single-use reset),
HttpOnly/Secure/SameSite server sessions with refresh and revocation, CSRF
double-submit, exact-origin CORS with credentials, security headers, rate
limiting (429 + Retry-After), the customer boundary enforced in SQL,
private document storage with content validation, sanitised names and
HMAC-signed expiring revocable links, paged payment history,
notifications, the legal-document seam (official files or 404), a mailer
outbox that never claims delivery, scrubbed logs and diagnostics, and test
controls that production configuration refuses. `docs/INTEGRATION.md` is
the full guide (architecture, env variables, deployment, rollback, inputs).

```
backend/                     config.mjs db.mjs http.mjs identity.mjs storage.mjs mailer.mjs legal.mjs routes.mjs server.mjs fixtures.mjs logger.mjs
backend/migrations/001_init.sql   customers, sessions, reset_tokens, login_attempts, supervisors, trips, bookings, travellers, documents, payments, notifications, outbox, diagnostics
backend/.env.example · README.md · Dockerfile · legal/README.md
tools/deploy.mjs             validate → env.js (unverified) → backend check + migrate → smoke → real-backend acceptance → env.js with INTEGRATIONS_VERIFIED
tools/smoke.mjs              safe production checks from the outside
tools/write-env.mjs          + INTEGRATIONS_VERIFIED only with --verified-by-deploy → ENV.verified
adapters/installed.js        CONNECTED only from ENV.verified; otherwise "implemented — NOT CONNECTED"
tests/run-backend.mjs        npm run test:backend — tests/integration.mjs against the real backend (518 checks)
tests/backend.mjs            38 HTTP checks: config refusals, CORS, CSRF ×5, lockout, rate limit, uploads, signed URLs, boundary, scrubbing
```

Status: **STAGE 12.2 — PARTIALLY COMPLETE.** Implemented and verified
locally: everything above. Connected to a real external service: nothing —
no deployed origin, hosted identity provider, S3, email/SMS provider, legal
text, flight supplier or payment provider is available to this repository.
Exact inputs: `docs/INTEGRATION.md` §13.


## 13 — The supervisor system (partially complete)

The public supervisor profile (Stage 10) and booking attribution (Stage
10.9) become a first-class, authenticated part of the platform: an account,
a session and a portal for each supervisor — separate from the customer
account, on the same Stage 12.2 backend — with server-authoritative
attribution (an audit trail, first-attribution preserved as the current
rule pending business confirmation), customers/leads/bookings/revenue/
performance scoped to that one supervisor and enforced in SQL, and a
commission architecture that never fabricates a rate. Full guide:
`docs/SUPERVISOR-SYSTEM.md`.

```
backend/migrations/002_supervisors.sql   profile/credential columns, supervisor_sessions, leads,
                                          attribution_events, commissions, supervisor_notifications, business_config
backend/supervisor.mjs · supervisor-routes.mjs   identity, attribution (assign/reassign), scoped read models, routes
assets/js/supervisor/                    auth.js, data.js, adapters/{dev,api,not-connected,installed}, ui/*
assets/css/23-supervisor-portal.css      metrics, responsive table, filters, lead cards
supervisor/{dashboard,customers,leads,bookings,revenue,performance,notifications,settings,
  sign-in,forgot-password,reset-password,sign-out}/index.html
tests/backend.mjs (+Stage 13 block, 79 checks) · tests/supervisor-portal.mjs (505 checks)
```

What changed on screen: nothing on the public site — the profile pages and
booking flow are unchanged. A new, separate authenticated area at
`supervisor/*` gives a signed-in supervisor their own dashboard, customer
list and detail, leads with a status workflow, bookings, revenue and
performance (with a period filter), notifications and settings — built
from the same design system as the customer account, verified at
390/834/1440 in Arabic and English with zero console errors.

Status: **STAGE 13 — PARTIALLY COMPLETE.** Implemented and verified,
including a real end-to-end flow (public profile → booking → attribution →
supervisor visibility, and cross-supervisor isolation) against the Stage
12.2 backend. Not connected: a deployed backend (same gap as Stage 12.2),
real supervisor accounts, and the business decisions in
`docs/SUPERVISOR-SYSTEM.md` §14 (final attribution rule, commission model
and rates, real supervisor identities and credentials).

## 15 — Operations control, service management & business integration (partially complete)

Stage 15's own first-action audit found that **Stage 14 does not exist** in
this repository — there was no admin dashboard to build on. Rather than
assume one or skip the stage, a minimal Admin/Operations Staff portal was
built as the necessary host for the operations control layer the brief
actually asked for: a backend-authoritative, configurable booking lifecycle
state machine (separate from the customer-facing booking status), a task
and escalation system, a service operational catalogue (workflow steps and
document requirements layered onto the existing service ids, never
duplicating their names), document review, a supplier/provider directory
kept separate from booking state, strictly isolated customer-facing vs.
internal booking notes, a sanitized notification-template system with
delivery history, and a full server-enforced permission system covering
the Admin and Operations Staff roles. Full guide:
`docs/STAGE-15-OPERATIONS-CONTROL.md`.

```
backend/migrations/003_operations.sql    staff/staff_sessions, ops_status/assigned_operator, booking_status_history,
                                          operation_tasks, escalations, services, service_workflows,
                                          service_document_requirements, documents.review_*, suppliers,
                                          booking_suppliers, booking_notes, notification_templates, audit_events
backend/staff.mjs · staff-routes.mjs     identity, permissions, state machine, tasks/escalations, services,
                                          suppliers, notes, templates, audit
assets/js/ops/                           auth.js, data.js, adapters/{dev,api,not-connected,installed}, ui/*
assets/css/24-ops-portal.css             inline action forms, workflow steps, audit columns
admin/{dashboard,bookings,tasks,escalations,services,suppliers,notifications,audit,settings,
  sign-in,forgot-password,reset-password,sign-out}/index.html
tests/backend.mjs (+Stage 15 block, 130 checks total) · tests/ops-portal.mjs (499 checks)
```

What changed on screen: nothing on the public site, and nothing in the
existing customer or supervisor portals — a new, separate authenticated
area at `admin/*` gives Admin and Operations Staff a dashboard, a booking
lifecycle/assignment/supplier/document/notes workspace, task and
escalation queues, a service configuration screen, a supplier directory,
a notification template/history centre, an audit trail and settings —
built from the same design system as the customer account and supervisor
portal, verified at 390/834/1440 in Arabic and English with zero console
errors, and permission-gated both in the UI and (independently, and
authoritatively) on the backend.

Status: **STAGE 15 — PARTIALLY COMPLETE.** Implemented and verified,
including a real end-to-end pass against the Stage 12.2 backend confirming
permission isolation between an Admin and an Operations Staff fixture.
Not connected: a deployed backend (same gap as Stage 12.2/13), any real
supplier/payment/ticketing integration, an outbound notification send
pipeline, and the business decisions in
`docs/STAGE-15-OPERATIONS-CONTROL.md` §14 (final lifecycle, SLA durations,
task priority meaning, per-service document requirements, the remaining
nine services' workflows, real staff identities). No Stage 14 admin
dashboard was built or assumed — see §0 of that document.
