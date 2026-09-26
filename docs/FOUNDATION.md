# Travel & Tourism — Website Master Foundation
## السفر والسياحة — Stage 10.1

This is the master visual, UX and frontend foundation. Every later website
stage inherits it. Nothing here is re-interpreted, re-branded or re-decided
without an explicit project-level instruction.

**Build the system once. Reuse it everywhere. Keep the experience consistent.**

---

## 1. Where everything lives

```
travel-demo/
├── index.html              Foundation entry point (NOT the homepage — §01)
├── styleguide.html         Living style guide: every token, every component,
│                           every state, in both RTL and LTR
├── docs/FOUNDATION.md      This document
└── assets/
    ├── brand/              the official lockup (4 variants), icons, OG card
    ├── fonts/              IBM Plex Sans Arabic (12) + Inter (4), self-hosted
    ├── icons/sprite.svg    61 icons, one family
    ├── css/
    │   ├── 00-fonts.css    @font-face, split by unicode-range
    │   ├── 01-tokens.css   ← the single source of truth
    │   ├── 02-reset.css    03-base.css      04-layout.css
    │   ├── 05-primitives   06-forms.css     07-components.css
    │   ├── 08-product.css  09-states.css    10-motion.css
    │   └── 11-utilities.css
    └── js/
        ├── foundation.js   ← the only module a page imports
        ├── core/           dom.js · i18n.js · format.js
        ├── data/           config.js (services, nav, statuses, verticals,
        │                   roles) · samples.js (demo records + API shapes)
        └── components/     ui.js · cards.js · search.js · states.js
```

A page links the stylesheets and imports one module:

```html
<!-- the stylesheet block, written by `node tools/css-links.mjs` from tools/lib/stylesheets.mjs -->
<style>@layer reset, tokens, base, layout, primitives, components, motion, utilities;</style>
<link rel="stylesheet" href="assets/css/00-fonts.css">
<!-- … one <link> per file, in order; portal pages also get 23 and 24 … -->
<script type="module">
  import { boot } from './assets/js/foundation.js';
  boot({ sprite: 'assets/icons/sprite.svg' });
</script>
```

---

## 2. Architecture

```
FOUNDATION → TOKENS → PRIMITIVES → COMPONENTS → PRODUCT COMPONENTS → PAGES
```

The CSS enforces this with cascade layers, declared once at the top of every
page's stylesheet block (`tools/lib/stylesheets.mjs`), before any file loads:

```css
@layer reset, tokens, base, layout, primitives, components, motion, utilities;
```

Because the order is fixed up front, a component written with a single class
always beats a base element rule, and no one ever needs `!important` or a
specificity war to make a component behave.

**Naming.** `.c-` component · `.l-` layout · `.t-` type · `.u-` utility.
Elements use `__`, variants use `--`. State lives in `data-*` attributes or
ARIA, never in a class like `.is-red`.

**Rule (§33):** when a new requirement appears — check whether an existing
component covers it, extend it if appropriate, and create a new one only when
necessary. The system must get *more* consistent as the project grows.

---

## 3. Colour (§04)

Two tiers. Raw values are private (`--_red-600`); components only ever consume
semantic names (`--color-primary`, `--color-text-secondary`).

### The brand colours — signed off

Sampled directly from the official logo: **red `#FE0002`**, **ink `#01010B`**.
Both are live in `01-tokens.css`.

**The identity red is not usable as the interface red.** `#FE0002` measures
4.03:1 against white. Contrast is symmetric, so that is the figure *both* for
red text on white *and* for a white label on a red fill — both fail WCAG AA for
normal text (4.5:1). Both clear the 3:1 bar for large text and UI boundaries.

| | Token | Use |
| --- | --- | --- |
| `#FE0002` | `--color-brand-red` | The identity red. The artwork carries it. In the UI only where nothing sits on it at body size — rules, bars, borders. |
| `#E00000` | `--color-primary`, `--color-text-brand`, `--color-text-link` | The interface red. 5.04:1. Every fill holding white text, and red as text. |

They are 4% of luminance apart and read as the same red side by side. The only
difference is that one is legible under a white label.

To use the exact `#FE0002` on buttons anyway, point `--color-primary` at
`var(--_red-600)`. That is a deliberate AA failure on every primary action, so
record it as a decision rather than a default.

### Measured contrast (against white)

| Token | Value | Ratio | Use |
| --- | --- | --- | --- |
| `--color-brand-red` | `#FE0002` | 4.03:1 | Identity red — no body text on or in it |
| `--color-primary` | `#E00000` | 5.04:1 | Interface red — fills with white labels |
| `--color-charcoal` | `#1F2429` | 15.6:1 | Body text |
| `--color-black` | `#01010B` | 20.4:1 | Inverse surfaces — the wordmark ink |
| `--color-gray-600` | `#5E6874` | 5.66:1 | Secondary text, help text |
| `--color-gray-500` | `#7F8994` | 3.55:1 | Disabled only — **not** body text |
| `--color-success` | `#0F7A43` | 5.41:1 | Success text and icons |
| `--color-warning` | `#9A5B00` | 5.43:1 | Warning text |
| `--color-error` | `#B3261E` | 6.54:1 | Error text |
| `--color-info` | `#0B5FBF` | 6.17:1 | Info text, **focus ring** |

The style guide recomputes every one of these live from the real token values,
so a palette change that breaks contrast shows up immediately.

**Two deliberate decisions:**

- **The focus ring is blue, not brand red.** A red ring on a red button is
  invisible. Focus must survive every surface it lands on (§23).
- **Error red is close in hue to brand red, and that is fine** *because*
  §12 and §20 forbid colour-only meaning. Every error and every status in this
  system carries an icon and a word. Turn the page greyscale and nothing is
  lost — that is the test.

Red is used for brand identity, the primary CTA, important actions, active
states and key highlights. It is not used as a background wash.

---

## 4. Typography (§05)

| Face | Role |
| --- | --- |
| **IBM Plex Sans Arabic** | Arabic **and** Latin. One face across both scripts keeps a mixed line on one rhythm. Professional, non-decorative, holds up small on mobile. |
| **Inter** | Booking data only — prices, times, flight numbers, references. Tabular figures so columns align. |

Both are SIL OFL, self-hosted, and split by `unicode-range`: an English visitor
never downloads the Arabic subsets.

**Inter ships without its `latin-ext` subset.** Inter is applied only through
`--font-data`, which carries digits, IATA codes, flight numbers, booking
references and currency codes — all ASCII. Its Central/Eastern European glyphs
were 336KB that no price or airport code could reach.

**IBM Plex keeps its `latin-ext` subset**, and must. Plex is the body face, so a
destination name like `İstanbul Beşiktaş` or `Łódź` resolves through it —
Turkish `ş ğ İ ı` are latin-ext, not Latin-1. Verified: injecting Turkish body
copy fetches `ibm-plex-sans-arabic-latin-ext-400.woff2`. Do not delete it to
match Inter. If Turkish ever lands in a data context anyway, `--font-data` falls
through to Plex, which still has the glyphs.

**Scale:** `--text-display` · `h1`–`h4` · `body-lg` · `body` · `body-sm` ·
`caption` · `button` · `price` · `price-lg` · `number-lg` · `data` · `label` ·
`overline`. All fluid via `clamp()`, so there is no font-size media query
anywhere in the system.

**Size is decoupled from heading level.** Use `<h2 class="t-h3">` when the
document outline needs an h2 but the design needs h3 size. The outline is an
accessibility and SEO contract (§23, §31); it is not a styling tool.

**Arabic-specific rules, applied automatically by `[lang="ar"]`:**
- letter-spacing is zeroed — negative tracking breaks Arabic joins;
- headings get looser leading (1.35) for ascenders and diacritics;
- `text-transform: uppercase` is dropped from `.t-overline` (a no-op in Arabic
  that only damages the tracking).

---

## 5. RTL / LTR (§06)

Arabic is the default: `<html lang="ar" dir="rtl">`.

**There is no RTL stylesheet.** Every rule in the system uses logical
properties — `margin-inline`, `padding-inline`, `inset-inline`,
`border-inline`, `text-align: start/end`. Flipping `dir` on `<html>` flips the
entire interface, including the drawer's slide direction, the select chevron,
the toggle thumb travel and the card badge corner.

`setLocale('en' | 'ar')` sets `lang` and `dir` together and re-renders
everything data-driven. The style guide's language button is the live proof.

**Two translation mechanisms, one rule for which to use.**

| | Mechanism | Use for |
| --- | --- | --- |
| `t('key')` | string table in `core/i18n.js` | Interface strings the system owns: button labels, validation, empty states, ARIA names |
| `pick(record, 'field')` | `fieldAr` / `fieldEn` on the data record | Content a record carries: navigation labels, service titles, menu descriptions, anything an admin or an API will supply |

The test: if the text would be edited by a content owner rather than a
developer, it belongs on the record. Navigation labels moved from `t()` keys to
records in Stage 10.2 for exactly that reason; putting them back in the string
table would be a regression, not a tidy-up.

**Directional icons** carry `data-flip="true"` and mirror automatically; a
clock or an aeroplane does not flip.

### Bidi: the part that is easy to get wrong

Latin runs inside Arabic sentences reorder unless they are isolated. The system
handles this in three places, and new code must keep doing it:

- `.u-ltr-run` and `<bdi>` for codes, distances, references (`1.2 km` renders
  as `km 1.2` without it);
- `.c-phone__number` and `.c-otp` force LTR — a phone number is never RTL;
- `money()` maps the ISO currency code to a localised label (`USD` → `دولار`)
  rather than printing Latin script into an Arabic price.

Times use a 24-hour clock with Western digits, always. A departure time is the
one number a traveller cannot afford to misread.

### Language completeness — a standing rule

**Every page must be fully translated in both directions.** Switching the
locale must leave nothing behind: no Arabic sentence on the English page, no
English sentence on the Arabic page — in text, in `aria-label`, `placeholder`,
`alt` and `title`, in the `<title>` and in the meta description.

How a page meets it:

- every developer-owned string in the markup carries `data-i18n="key"` (or
  `data-i18n-label` / `-placeholder` / `-title` / `-alt` / `-value` /
  `-content` for attributes) with the key in **both** tables of
  `core/i18n.js`; the Arabic in the HTML is only the pre-hydration fallback;
- every data record carries both `fieldAr` and `fieldEn`;
- a deliberate exception is declared, never implied: a specimen that is meant
  to stay in one language carries `lang="en"` (or `lang="ar"`); a code, token,
  hex value or data cell carries `translate="no"`. Anything without one of
  those is a bug.

`tools/i18n-audit.mjs` enforces it. It loads each page, switches locale, and
lists every string still in the wrong script; it exits non-zero if any remain.
Run it for every page a stage adds or touches — a stage is not done until it
reports `TOTAL untranslated strings: 0`.

---

## 6. Grid, spacing, shape (§07–§10)

**Grid.** 4 columns mobile / 8 tablet / 12 desktop, switched by redeclaring
`--grid-columns` at two breakpoints. Components ask for a *span*, never a
width. Container max is 1280px with growing gutters, and prose is capped at
`68ch` so text never stretches across an ultrawide screen.

**Breakpoints.** `48em` (768px) tablet · `64em` (1024px) desktop. Mobile-first:
everything below 48em needs no media query.

**Spacing.** 4 · 8 · 12 · 16 · 24 · 32 · 40 · 48 · 64 · 80 · 96, named by px
(`--space-24`) so a value is legible in review. Section rhythm is fluid.

**Radius.** sm 6 · md 10 · lg 16 · pill. Pill is for tags, chips and toggles
only — never a card or a primary button. Nothing is bubble-shaped.

**Shadow.** Four neutral, low-opacity steps plus an overlay step. No colour, no
glow, no 3D.

---

## 7. Components

### Buttons (§11)
Primary · secondary · secondary-brand · tertiary · utility · danger · inverse,
in three sizes, with all eight states: default, hover, pressed, focus,
disabled, loading, success, error. `setButtonState(btn, state)` drives the last
three. The label stays in the DOM while loading so the width never jumps and
the accessible name survives.

One dominant primary action per page. On mobile the primary goes full width.

### Forms (§12)
Input, select, search, date, passenger selector, checkbox, radio, boxed choice,
toggle, phone, OTP, file upload, textarea — each with default, focus, filled,
error, success, disabled and loading.

Enforced by the CSS and the markup contract:
- a visible, persistent label on every field (placeholders never replace them);
- errors carry a thicker border **and** an icon **and** a sentence saying what
  to do, wired with `aria-invalid` + `aria-describedby`;
- every control clears the 44px touch target.

### Search (§13)
One architecture, every vertical. A vertical is **data** (`SEARCH_VERTICALS`):
it declares its fields, and `searchWidget()` builds them. Flights, hotels,
packages and visa run the same code path. Adding "cruises" is an object
literal — no new component.

Progressive disclosure is data too: `advanced: true` puts a field behind
"more options" instead of on the first screen.

### Cards (§14)
Service · flight · hotel · package · supervisor · trip — all built from one
`.c-card`. Variants change content, never the visual language.

The flight card deliberately surfaces **baggage, stops and fare rules on the
card itself**. §19 forbids hiding the terms a traveller needs to compare
honestly; price alone is not a comparison.

### Status (§20)
Seven states — pending, processing, confirmed, completed, cancelled, failed,
expired — in one central registry (`STATUSES`). `statusBadge(id)` always emits
icon **+** word **+** tint. There is no way to call it and get colour alone.

### States (§21)
`stateRegion()` gives a region all five states: loading, skeleton, content,
empty, error. Skeletons mirror the real shapes so nothing reflows when data
arrives. `stateBlock()` warns in the console if an error or empty state is
rendered without an action — a dead end is a bug.

Every error answers two questions: **what happened** and **what you can do
next**.

---

## 8. Icons (§15)

61 icons, one family: 24×24, outline, round caps and joins, stroke weight from
`--icon-stroke`, colour from `currentColor`.

**The sprite is fetched once and injected into the document**, and icons
reference it as same-document fragments (`#no-flight`). This is not a
preference — Chromium and Safari do **not** resolve *external* references in
`<use>`: the file downloads, the CSS applies, and nothing paints. Only Firefox
renders it. Injection costs the same single request and works everywhere.

Without JavaScript there are no icons. That is acceptable **only because** no
icon in this system is the sole carrier of meaning: each one either sits beside
its own text or its control has an `aria-label`. A build step that inlines the
sprite into the HTML removes even that gap.

---

## 9. Graphic language (§16)

Direction → route → journey, expressed as rules and paths rather than
illustrations, so it costs almost nothing:

- `.u-mark` — the single decisive stroke, marking a section heading;
- `.u-route` — the dotted path, used as a divider and inside itineraries.

(A third primitive, `.u-numeral-watermark`, was never used by the demo brand
and was removed on 2026-09-25.)

The flight card's route line is the same idea doing real work: a drawn path
with the stops marked on it, so "1 stop" is *visible*, not merely stated.

No generic aeroplane logos, globes, passports, suitcases or wings as identity.

---

## 10. Motion & accessibility (§23, §24)

Motion is for state changes, navigation, loading, feedback and disclosure. No
parallax, no floating decoration, no continuous animation.

`prefers-reduced-motion` is handled **once, at the token layer** — the four
duration tokens drop to 1ms and every transition in the system obeys. Spinners
switch from rotation to a gentle opacity pulse rather than freezing into a
meaningless ring.

Accessibility is built into the layers, not bolted on:
semantic HTML · logical heading hierarchy · a visible focus ring that is never
removed · 44px touch targets · labelled fields with real error wiring ·
`aria-live` on every region that swaps content · native `<dialog>` for modals
(so focus trapping, Esc and inertness are the platform's job) · arrow-key tab
navigation that follows the reading direction · no colour-only meaning
anywhere.

---

## 11. Data-driven UI (§27) and future stages (§28)

Navigation, services, statuses, search verticals and roles are all data in
`data/config.js`. No component hard-codes a list. Card renderers take a plain
object and return a node — they do not fetch, route, or contain booking logic.

`data/samples.js` carries demonstration records whose **shapes are the
deliverable**: `FLIGHTS`, `HOTELS`, `PACKAGES`, `SUPERVISORS`, `TRIPS`. They
are the contract Stage 11 builds against.

What is already expressible without any later-stage code existing:

| Stage | What the foundation already provides |
| --- | --- |
| **11 — Booking** | Search verticals, flight/hotel/package cards, fare and baggage display, price breakdown, passenger forms, OTP, upload, steps, sticky rail. (Booking-summary and filter-panel CSS were sketched in 10.1 and removed unused in the second maintainability pass — Stage 11 designs them against real requirements.) |
| **12 — Customer account** | `tripCard`, status registry, next-step notices, trip reference formatting, empty/error states |
| **13 — Supervisor** | `supervisorCard`, the `supervisorId` link on every trip, the inline `.c-assist` human-help component |
| **14 — Admin / operations** | the same status registry and data shapes; the role ranks and the `can(role, minimum)` check arrive with the stage that has a session to check (removed as unused in the 10.12 cleanup) |

The relationship **Customer → Supervisor → Booking → Payment → Revenue →
Supervisor right** is expressible today: a trip already carries its supervisor
and its total. Nothing in the presentation layer blocks it.

**Supervisor branding (§29):** a supervisor is a person *inside* Travel & Tourism,
never a second brand. The profile hero renders the brand name, type, colour
and trust language — no logo, since the demo carries none; the record carries
only photo, name, role, bio, contact and services. The single brand flourish
permitted on a person is the red ring on the photo.

---

## 12. Performance (§30) & SEO (§31)

Self-hosted subset fonts with `font-display: swap` and preload on the two faces
the first screen needs. One icon request. No framework and no build step — the
CSS is layered plain CSS and the JS is ES modules. Images are lazy-loaded with
their aspect ratio reserved, so nothing shifts. Skeletons mirror real shapes.
Reduced motion is honoured.

Semantic HTML throughout, one `h1` per page, heading levels never chosen for
size, real `<nav>`/`<main>`/`<footer>` landmarks, a skip link, `alt` on every
meaningful image, `lang` and `dir` correct on both languages, Open Graph and
`og:locale:alternate` in place.

---

## 13. Security-aware UI (§32)

The role model (Super Admin → Admin → Operations → Supervisor → Customer →
Guest, checked by `can(role, minimum)`) ships with the first stage that has a
session to check; the public site carries no permission code. Passwords, payment details, private
documents and internal supervisor information are never rendered by any
component in this layer. Permission is asked, never assumed.

---

## 14. Acceptance criteria (§36)

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Brand identity preserved | ✅ generic demo brand; no invented mark or wordmark |
| 2 | Logo correctly implemented | ✅ deliberately absent — no logo anywhere, including the favicon, home-screen icon and link-preview card |
| 3 | Colour tokens | ✅ full contract + applied roles |
| 4 | Typography tokens | ✅ 14-step scale, AR + EN + booking data |
| 5 | Spacing system | ✅ |
| 6 | Grid system | ✅ 4 / 8 / 12, verified in browser |
| 7 | Button system | ✅ 7 variants × 8 states |
| 8 | Form system | ✅ 12 field types × 7 states |
| 9 | Card system | ✅ 6 card types, one language |
| 10 | Icon system | ✅ 61 icons, one family |
| 11 | Search architecture | ✅ data-driven, 4 verticals |
| 12 | Status system | ✅ 7 states, icon + word |
| 13 | Loading states | ✅ spinner, skeletons, progress |
| 14 | Error states | ✅ with required next step |
| 15 | Empty states | ✅ with required action |
| 16 | RTL works | ✅ default, verified |
| 17 | LTR works | ✅ verified by live switch |
| 18–20 | Mobile / tablet / desktop behaviour | ✅ verified at 390 / 834 / 1440 |
| 21 | Accessibility rules | ✅ implemented (see §10 above); audited site-wide in 10.11 — `tools/a11y-audit.mjs`, see `docs/STAGES.md#1011--responsive--accessibility-refinement` |
| 22 | Motion rules | ✅ token-level reduced motion; in-page scrolls respect it too (10.11) |
| 23 | Component architecture reusable | ✅ layered, no duplication |
| 24 | Data-driven structure | ✅ config + sample shapes |
| 25–28 | Booking / Account / Supervisor / Admin integration supported | ✅ shapes and components in place |
| 29 | Performance principles | ✅ |
| 30 | SEO foundation | ✅ structure; ⚠️ canonical, `og:image`, JSON-LD need a domain and assets |
| 31 | No conflicting visual styles | ✅ one token source, one card language |

### Open items — blocked on inputs that do not exist in this repository

1. ~~**The official logo file.**~~ Removed. The demo now carries no logo or
   wordmark anywhere (header, footer, drawer, supervisor profile) — a buyer
   adds their own if they want one; the old raster artwork was deleted since
   nothing referenced it. See assets/brand/README.md.
2. ~~**The approved brand HEX values.**~~ Sampled from the original master and live.
3. **Photography (§17).** Real, human, warm, authentic imagery of families,
   travellers, airports and destinations — deliberately not tied to any one
   nationality or market, per the country-genericization update. Rather than
   ship stock-looking filler, every
   media slot renders a neutral placeholder that reserves the exact aspect
   ratio, so dropping in the real photograph shifts nothing. Every slot reads
   its file from `data/images.js`, maintained by hand: add the file under
   `assets/images/` and update its entry there (`assets/images/CREDITS.md`
   explains the rules). (The Stage 10.12 generator,
   `tools/fetch-images.mjs`, and its manifest were removed in `7b52cc9`.)
3b. **Supplier, payment and airport data (Stage 11).** The booking journey
   runs on `assets/js/booking/adapters/dev-flights.js` (fictional carriers,
   generated fares) and `DEV_PAYMENT` (a simulated provider), both labelled on
   every screen. Needed: a flight supplier adapter behind a server-side proxy
   (credentials never reach the client), a payment provider with hosted
   fields or a redirect plus its webhook, the airport / city registry the
   supplier serves (`booking/locations.js` is the dev stand-in), fare-rule
   texts, service-fee amounts, the booking terms, and confirmation delivery
   (e-mail / SMS). Each is one registration in `adapters/installed.js` or
   `payment.js`; the screens do not change.
3c. **Identity and customer API (Stage 12).** The account runs on
   `assets/js/account/adapters/dev-auth.js` and `dev-customer.js`, both
   labelled on screen. Needed: a hosted identity provider (server sessions
   or HttpOnly cookies), a backend customer API that enforces the customer
   boundary, document storage with signed URLs, the payment layer's history
   endpoint, notification delivery, and the terms / privacy documents the
   sign-up refers to. Since 12.1 the production adapters exist and
   `docs/INTEGRATION.md` states the contract and the exact inputs; since
   12.2 the backend itself exists (`backend/`, verified locally) and what
   remains is a deployment, a hosted identity choice, storage, delivery
   and the legal texts; the screens do not change.
3d. **Supervisor accounts (Stage 13).** The supervisor portal
   (`assets/js/supervisor/`) runs on the same backend as the customer
   account, with the same gap: no deployment. Additionally needed: real
   supervisor identities and credentials (today `password_hash` is null
   until a reset/admin flow sets one), and the business decisions
   `docs/SUPERVISOR-SYSTEM.md` §14 lists (the final attribution rule, a
   commission model and rates). The five launch supervisors remain
   Stage 10's placeholders.
4. ~~**Production domain**~~ — resolved. The site deploys to
   `https://mashhorfoods.github.io/mashhor-demo/`; canonical and `og:url` are
   set. Because it is a *project* page served from a subpath, routes are stored
   without a leading slash and resolved through `route()` (see `data/config.js`),
   so attaching a custom domain later needs no data changes. Note that
   `robots.txt` is not honoured at a project-page subpath — see the note in the
   file itself.
5. **Legal entity details**, for Organization JSON-LD. The homepage ships a
   `WebSite` JSON-LD block with name and URL only, and grows to `Organization`
   once these exist.
6. ~~**Raster brand exports**~~ — `icon-32.png`, `icon-180.png` (180×180) and
   `share-card.jpg` (1200×630) are logo-free and rendered by
   `tools/build-brand-images.mjs`; they are wired into every page.
7. **Contact channels.** Phone and WhatsApp are `href: null` in
   `data/navigation.js` (`SUPPORT_CHANNELS`) since Stage 10.4: no surface renders
   a channel without an href, so nothing placeholder-shaped reaches a customer.
   Set the two values and the header panels, the drawer, the footer and the
   homepage support block all show them.
8. **Service photography.** Every registry record in `data/services.js`
   carries `image.src: null`; the services page and every service detail page
   render the neutral slot at the reserved ratio until the approved
   photographs arrive.
9. **Destination photography.** Every `data/destinations.js` record carries
   `image.src: null`; the destinations page and the homepage render the neutral
   slot at the card's ratio until the approved photographs arrive.
10. **Real offers.** The three `data/offers.js` records are placeholders:
   no price, nights, inclusions, programme, terms or FAQ until the business
   approves them; the pages say so and hide what they cannot show.
11. **The booking engine.** `book/` ends in a booking context
   (`core/booking.js`) persisted for the next step; `mountBooking({ prepare })`
   is the seam the Stage 11 search calls into, and the place fields need
   the airport/city list they will autocomplete from.
12. **Supervisor data.** The five `data/supervisors.js` records are
   placeholders: name, photo, title, bio, languages, expertise and verified
   channels are null until the business supplies them; the profiles render
   the neutral structure and say the details are being completed.
---

## 15. Working rules

**Do:** consume tokens · extend an existing component before making a new one ·
use logical properties · keep meaning out of colour · give every dynamic region
all five states · keep booking logic out of presentation components · ship
every page fully translated in both locales and prove it with
`tools/i18n-audit.mjs` (§5).

**Do not:** invent a logo or colours · hard-code a hex, a px or a duration in a
component · write a direction-specific rule when a logical property exists ·
introduce a second card style · hide a price or a booking condition · build
desktop first and patch mobile after · create a separate supervisor brand ·
ship placeholder UI that cannot scale into the real product.
