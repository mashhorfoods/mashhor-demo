# Stage 10 — Final QA & Verification (10.12)
## نمبرون للسفر و السياحة · Number One Travel & Tourism

**Status: STAGE 10 — COMPLETE / BUILT + VERIFIED**

| | |
| --- | --- |
| QA date | 2026-09-16 |
| Viewports | 390 · 834 · 1440, plus 600 · 1024 · 1200 for breakpoint checks |
| Languages | Arabic (RTL, default) · English (LTR, live switch) |
| Pages | 28 — home, 404, style guide, services, 13 service details, destinations, offers, 3 offer details, booking entry, 5 supervisor profiles |
| Browser | Chromium (Playwright), served from the same sub-path as GitHub Pages |

## Scope verified

| Stage | Verified by | Result |
| --- | --- | --- |
| 10.1 Foundation | site suite (tokens, icons, sprite, dir, h1, alt, names) | 96/96 |
| 10.2 Header & navigation | interaction + responsive suites, motion/keyboard pass | 17/17 · 42/42 |
| 10.3 Footer | footer suite | 62/62 |
| 10.4 Homepage | homepage suite | 169/169 |
| 10.5 Services | services suite | 146/146 |
| 10.6 Service details | detail suite, every route, full-record template | 470/470 |
| 10.7 Destinations | destinations suite | 165/165 |
| 10.8 Offers / packages | offers suite, every route | 170/170 |
| 10.9 Booking entry | booking suite | 236/236 |
| 10.10 Supervisor profile | supervisor suite, attribution hand-off | 182/182 |
| 10.11 Refinement | cross-site audit (28 pages × 6 widths × 2 languages), motion/keyboard pass | 0 findings · 29/29 |
| Language | language audit, 28 pages, both locales | 0 untranslated |
| Links | every link on every page, both languages, resolved against the server | 0 dead |
| Console | every load in every suite and audit | 0 errors |

## The final matrix

| | Arabic | English |
| --- | --- | --- |
| Desktop 1440 | ✓ visual · navigation · interaction · responsive · accessibility · language · console · states | ✓ |
| Tablet 834 | ✓ | ✓ |
| Mobile 390 | ✓ | ✓ |

Each cell is backed by the suites above running at that width and locale;
the screenshots reviewed for the visual pass are the suites' own.

## Issues found in this gate and fixed

| Finding | Root cause | Fix (layer) |
| --- | --- | --- |
| Layout shift of ~1.0 on every page at first paint | the module script fills the page after the browser has painted the empty shell, so everything moves down when the header and regions arrive | the header's space is reserved by a placeholder built from the same tokens (`12-header`, every shell); the main column and phone nav stay unpainted until `boot()` swaps `.no-js` for `.js` (`04-layout`); the phone nav has its token height (`07-components`). CLS is now < 0.002 on every measured page |
| Dead link "تحدث مع مختص" on the 404 page | pointed at `support/`, which was never a route | `help/contact/` (planned help route) |
| Style guide's sample supervisor card linked to a slug the registry does not know | the sample record predates the registry | samples carry the launch slugs |

## Reviewed with no change needed

- **Security-aware review.** The only `innerHTML` in the codebase injects the
  same-origin icon sprite. Every element is built with `el()` and text
  nodes. URL parameters are never rendered raw: `?vertical`, `?service`,
  `?category` and `?supervisor` are matched against registries or data-driven
  controls, `?to` resolves a slug to a localised name, and the profile's
  public-link field shows the page's own URL as a value. No credentials,
  keys or personal data exist in the repository.
- **Business data safety.** No phone, WhatsApp, email, address, social
  account, price, rating, statistic or certification appears anywhere;
  the audit greps for them on every page. Channels render only from a set
  `href`; placeholder offers say "request price"; supervisor records are
  null until supplied.
- **Performance.** One CSS bundle (177 KB across 22 layered files), one
  JS module graph (437 KB uncompressed, no dependencies, no bundler), the
  icon sprite, fonts preloaded with `font-display: swap`; 62–65 requests
  per page, no failed or duplicate requests, three images or fewer per
  page (all brand assets). Photography slots stay neutral until filled.
- **SEO / structure.** Every page has a unique title in both languages, a
  description, `lang` + `dir` set live, one `h1`, no heading jumps,
  landmarks (`header`, `nav`, `main`, `footer`), canonical + `og:url` on
  every public route, and a custom 404 that routes back to the services.
- **Code quality.** No duplicate CSS or JS was introduced in Stage 10;
  the refinement helpers (`scrollTo`, the audit tools) each exist once.
  The data → components → pages architecture is intact.

## Planned routes (future stages, 404 today by design)

`search/` (Stage 11 results) · `hotels/<id>/`, `packages/<id>/` (Stage 11
products) · `trips/`, `account/`, `account/sign-in/`, `account/sign-up/`
(Stage 12) · `supervisors/` (listing) · `destinations/<slug>/` (detail
pages) · `help/`, `help/faq/`, `help/contact/`, `about/`. Each is reached
only from a labelled link and lands on the custom 404, which explains and
routes back. No content was invented for them.

## Remaining business inputs

- **Photography.** The sandbox's egress policy blocks every image host
  (Wikimedia Commons, Unsplash, Pexels), so the free stand-ins the business
  asked for could not be downloaded here. The pipeline is ready: every slot
  has a key in `tools/images.manifest.json`, the data reads
  `data/images.js`, and `node tools/fetch-images.mjs` on a machine with
  internet access fetches freely licensed photographs, writes the credits
  and regenerates the map. Then commit `assets/images/` and the map.
- Contact channels (phone, WhatsApp, email) — `data/navigation.js`,
  `data/supervisors.js`.
- Real offers (programme, price, dates, inclusions, terms) — `data/offers.js`.
- Supervisor details (name, photo, title, bio, languages, expertise,
  channels) — `data/supervisors.js`.
- Legal entity details, social accounts, office address — footer and
  JSON-LD slots.
- Airport / city list for the place fields, and the booking engine the
  `prepare` seam calls — Stage 11.

## Known limitations belonging to later stages

Search results, product pages, traveller details, payment and
confirmation (Stage 11); customer account and trips (Stage 12);
supervisor dashboard, commissions and the admin system that edits the
registries (later stages). The booking context and the supervisor
attribution built in 10.9 and 10.10 are the hand-offs those stages consume.
