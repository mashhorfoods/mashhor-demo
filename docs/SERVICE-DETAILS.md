# Service Details — Stage 10.6
## نمبرون للسفر و السياحة · Number One Travel & Tourism

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

## Routes

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

## The page, top to bottom

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

## Decisions worth knowing

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

## Acceptance

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

### Still needed from the business

Service photography (one image per record) · any approved facts to add to a
service's page (partners, coverage, timings) · the numbers that switch the
contact channels on.
