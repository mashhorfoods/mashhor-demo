# Supervisor Profile — Stage 10.10
## نمبرون للسفر و السياحة · Number One Travel & Tourism

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

## Data: the registry, and what "placeholder" means

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

## The page

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

## Attribution hand-off

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

## Acceptance

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

### Still needed from the business

For each supervisor: name (Ar + En), photo (square, with consent), title,
bio, languages, areas of expertise, the services they handle, and the
verified phone / WhatsApp / email — each is a field on the record. The
slug should become the person's public handle before launch.
