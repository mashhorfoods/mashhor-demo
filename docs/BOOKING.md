# Booking Entry — Stage 10.9
## نمبرون للسفر و السياحة · Number One Travel & Tourism

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

## SELECT → DEFINE → CONTINUE, on one page

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

## The booking context

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

## Every door leads here

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

A language change re-mounts the page on the chosen service and drops the
URL prefills; the header and footer are the booking variants (no second red
action, "حجز آمن — بياناتك محمية").

## Acceptance

Verified in-browser — see the commit for the exact counts — at 390 / 834 /
1440 in both directions: the eight cards, their columns, the keyboard walk
and roving tabindex; every service's form and its one primary action; trip
types, legs (add to four, remove, renumber), the travellers popover and its
notes; every validation message in place with focus and status; the loading,
success (summary rows, continue URL, persisted context), edit, error, retry,
empty and skeleton states; help-me-choose; the deep links from every door;
the language switch; the header search hand-over; focus rings; plus every
earlier suite and the language audit at 0 untranslated across all 23 pages.

### Still needed from the business

Nothing on this page states a fact the business has not approved. Stage 11
needs: the airport and city list the place fields autocomplete from · the
booking engine or supplier the `prepare` seam calls · the numbers that
switch the contact channels on.
