# Offers & Packages — Stage 10.8
## نمبرون للسفر و السياحة · Number One Travel & Tourism

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

## Data: the registry, and what "placeholder" means

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

## Listing

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

## Detail template

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

## Acceptance

Verified in-browser — see the commit for the exact counts — at 390 / 834 /
1440 in both directions: the listing's structure, chips, live filters, the
phone sheet (open, apply, Escape), sorting, guide chips, `?category=`, the
five states; every detail route in both languages; the template with a full
synthetic record (every section, real price, accordion); the deep link into
the booking entry; keyboard and focus; plus every earlier suite and the
language audit at 0 untranslated across all 22 pages.

### Still needed from the business

Real offers: programme, price, dates, inclusions and exclusions, terms —
each is a field on the record · offer photography · the numbers that switch
the contact channels on.
