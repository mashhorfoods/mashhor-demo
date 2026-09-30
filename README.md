# Pixora — website + campaign landing

## Launching and checking the live site

**[LAUNCH.md](LAUNCH.md)** (Arabic) lists every step in order: SSL, PHP,
upload, the admin password, SPF/DKIM, Search Console, Plausible goals. After
every upload run `node tools/launch_check.mjs` (add `--send-test-lead` for a
real test message): it checks the live site in eight sections — pages,
HTTPS, script hashes against the CSP (catches pages and .htaccess from
different builds), headers, caching and compression, every asset, redirects
and the 404, closed folders, and lead.php. For a local Apache:
`--header "X-Forwarded-Proto: https" --skip-https`.

## Getting the upload package

Every push builds and tests the site on GitHub (`.github/workflows/build.yml`).
Open **Actions → Build site →** the latest green run **→ Artifacts →
`pixora-site-upload-<commit>`**, download it, and extract its contents into
`public_html`. A red run means a test failed: nothing from it should be
uploaded. Packages are kept for 30 days; "Run workflow" on the same page makes
a fresh one at any time.

Do not overwrite `admin/config.php` on the server once the admin password is
set (the package carries the empty one).

Once the FTP secrets are set, the workflow uploads it itself after every
green run on `main` — see "Editing content" below.

## Preview on GitHub Pages

Every push to `main` that passes the tests also publishes a preview at
https://mashhorfoods.github.io/mashhor-demo/ (`tools/pages.py`): the same
pages, moved under the repository's path. It is static, so the campaign form
falls back to WhatsApp there and `/admin/` is absent, and every page says
`noindex` — the real site stays the one search engines show. One-time
setting: **Settings → Pages → Source: GitHub Actions**.

## How it is built

`site/` is the deployable web root. It is **generated** and not kept in git
(build it locally with `npm run build`, or take it from Actions):

```
source/      the site exactly as supplied (replace wholesale with each new version)
overlay/     what this project adds: go.html, lead.php, admin/, _lib/ (PHP shared
             by lead.php and admin, never served), _leads/, assets/ (go.js,
             motion.js, viewer.js, forms.js, images)
tools/css/   the project's stylesheets, one per build step (services, story-hero,
             about, cases, home-links, refinements, motion, sparks, viewer), injected in that order
tools/build.py   →   site/
```

`python3 tools/build.py` copies source then overlay into a fresh `site/`
(keeping any lead data in `site/_leads`), then runs, in order:

| Step | Script | What it does |
| --- | --- | --- |
| 0 | `content.py` | The package prices and the WhatsApp number from `content/` and `tools/config.json`, written wherever the supplied pages state them (see "Editing content"). |
| 1 | `build_services.py`, `streamline.py` | One page per service at `/services/<id>` (details, showcase, what it covers, packages and prices, related add-ons, other services). The homepage gets a single services section of cards; the old accordion, the five detail sections and the add-ons leave it. `/pricing` keeps only pricing matters: what moves a price, an index linking to the service pages, every add-on, the build-your-own estimator and billing. |
| 1b | `story_hero.py`, `about_page.py`, `cases.py`, `home_links.py` | The Story page's hero, the About page, the case studies (`/work`, `/work/<slug>` — see below), and the homepage's two doors to them and to About. |
| 2 | `refinements.py` | Spacing, pill buttons, WhatsApp button on phones, hero copy, profile, privacy note, root-based clean links, 301s from `.html`. |
| 3 | `motion.py` | "Quiet luxury" motion layer, stylesheet half: one rhythm (480/900 ms, expo ease-out) with a light blur on the site's own reveal; page-to-page cross-fades with the header held still and each service card growing into its page (`@view-transition`); long text and the campaign page surfacing with the scroll (scroll-driven CSS); hero lines rising; pointer light on cards. Script half: `overlay/assets/motion.js` (line split, magnetic primary buttons, pointer light, self-gliding galleries that stop when touched, counting totals). On touch screens (phones, tablets) reveals start just before content arrives and run shorter, closer and without blur, so a flick never outruns them; hover lifts and zooms stay off there, so a tap leaves no card stuck raised. Case studies and the Story show a gold reading-progress line bound to the scroll. All off under reduced motion; nothing hidden without it. |
| 3b | `seo.py` | Titles that say what a page offers (a service's from-price included), link previews that describe their own page, structured data (Organization and WebSite on the homepage, each service with its packages and prices read from its page, each case study and the Story as a CreativeWork), and a date on every sitemap entry (the commit built). No hreflang: both languages share one address. |
| 4 | `finalize.py`, `prune_css.py` | Comments and indentation stripped from the stylesheet (it holds up the first paint); one shared, content-hashed `site.<hash>.css` / `.js` / `motion.<hash>.js` for every page (go and admin included), long caching, CSP hashes. The stylesheet loses the rules of components no page uses (listed by exact class name in `prune_css.py`; the build stops if a page uses one again). |
| 5 | `cms.py` | The editing panel at `/cms/` (needs `npm ci` first). |

Photographs are encoded once with `python3 tools/images.py covers|about|board|cases|work`
(the results are committed; the build never encodes). Shared helpers live in
`tools/common.py`: the page list, CSS injection, `drop()` for supplied files
that no longer ship.

The build is deterministic (two runs give identical output); the tests below
run against its output. Every edit it makes to the supplied pages must find
the text it expects: when a new version of the site changes that text, the
build stops and names it instead of silently skipping the change.

The homepage's placeholder blocks (campaign artwork, showreel) are left out
with their files until real work replaces them — see `PLACEHOLDERS` in
`streamline.py`.

## The campaign flow

```
Ad  →  /go (hero)  →  "شوف أعمالنا"  →  /go#work     →  تواصل معنا / WhatsApp
                    →  "تواصل معنا"   →  /go#contact  →  WhatsApp  or  5-field form  →  /go#sent
```

| File | What it is |
| --- | --- |
| `overlay/go.html` | The landing page. One document, four views (`#top`, `#work`, `#contact`, `#sent`); Back always works; without JavaScript the views stack. Arabic, RTL, `noindex`, not in the sitemap. |
| `overlay/assets/go.js` | Views, WhatsApp messages, the form, attribution. External so the site's CSP needs no new hash. |
| `overlay/lead.php` | Receives the form: validates, stores a CSV row, emails `muhalabsalah@gmail.com`. Answers "ok" only when the lead is actually held — otherwise the page offers WhatsApp with the details pre-written. |
| `overlay/_leads/.htaccess` | Refuses all web access to the fallback storage folder. |
| `tools/config.json` | The business WhatsApp number — the one place to change it (also from `/cms/`). The build writes it over the supplied site's own number everywhere, and fills it into the campaign page. |
| `tests/campaign.mjs` | End-to-end checks: routes, devices, WhatsApp links, validation, submission, tracking, fallback, every page's links, and that every file in `site/assets` is used. |

## Service covers

Each service has one cover image: `overlay/assets/svc-<id>.webp` (1600×1000,
16:10) plus `svc-<id>-1200.webp` for phones. It is the thumbnail on the
service's card and the full-width hero of its page, and the card's image grows
into the hero when the page opens (a cross-document view transition). Keep
the subject near the centre: the card shows the whole frame, the hero shows
it wider on desktop and only the middle third on phones, with the headline
over its lower part — so low-key images with a calm lower third work best.

To replace one: save it (16:10, at least 1600 wide) as
`tools/service-covers/out/svc-<id>.png` or `.jpg`, run
`python3 tools/images.py covers`, and rebuild. The originals in
`out/` stay out of git; the encoded covers in `overlay/assets/` are what count.

## Work slideshows on service pages

A service page can show a slideshow of real work in place of its sample
boards: add it to `SHOWCASE` in `tools/build_services.py` — the block it
replaces and the images, in order. Captions and alt text are taken from where
each image already appears on the homepage (the work gallery), so a new image
goes into the gallery first. Frames are uniform (4:3; three per view on
desktop, two on tablets, one and a bit on phones); its first step comes
1.2 s after it scrolls into view, then every 4 s. It pauses only when a
person reaches for it — a sideways swipe or wheel, a mouse that moves over
it, keyboard focus — never because the page scrolls past it (the homepage
gallery follows the same rule, in motion.js `reachFor`), and under reduced
motion it moves only by its arrows, swipe or the arrow keys; when every slide fits it
shows no controls. The replaced block's images leave the upload. Every
service page opens its content with one (real client work first).

The site shows no sequence numbering (01, 02/07 …): the rule is in the
refinements stylesheet; prices, counts and the brand challenge's steps keep
their numbers. A test fails if an "01"-style label shows on any page.

## About page

`tools/about_page.py` rewrites About around Pixora and its team, from the
site's own parts: a hero like the service pages', who we are, four
principles, the six stages of a project (their line draws in as it
arrives), the five service cards (copied from the homepage), the promises
and a closing call to action. The site speaks as Pixora everywhere: no
founder links or mentions (the build stops if one returns); the contact
card keeps the name of the person you reach, in both languages —
Muhalab Basheir, Visual Communications Designer / مهلب بشير، مصمم المحتوى البصري.

Its three photographs (hero, the team, the process) live in
`overlay/assets/about-*.webp`, 16:9, with 640 and 1280 wide copies made by
`python3 tools/images.py about <folder>` from the source PNGs; the supplied site's
About photos leave the upload.

## Pixora identity board

The campaign page's hero shows Pixora's own identity — the wordmark and its
gold X monogram, colours, type, voice, and the brand on a business card, a
post, the site and the five services — "our identity, to the standard we
build yours". It is an HTML template (`tools/share-cards/board.html`, the
site's own fonts and colours), rendered and encoded like the other images:

    node tools/share-cards/render.mjs board && python3 tools/images.py board

It opens in the image viewer, and the /go link preview shows it too.

## Link previews

What WhatsApp, X and the rest show when a page is shared: one 1200×630 card
per page, all in one design (`tools/share-cards/base.css`) — the brand, the
page's own headline in Arabic with its accent in yellow, the English line,
a few facts and the page's address. Home, /go, Story, About, Pricing and
each service, /work and each case study have their own; privacy, terms and accessibility use the
homepage's. The pricing card's prices and each service card's headline and
starting price are read from the built site, so run the build, then
`node tools/share-cards/render.mjs`, whenever those change (the cards land
in `overlay/assets/share-*.jpg`).

## Homepage: the services rail and the two doors

The five services sit in one horizontal rail on every screen size: it runs
to the window's edges, snaps card by card, and has a gold line that fills
with how much of it has been seen, plus previous/next buttons (a mouse can
also drag it; fingers and trackpads scroll it natively). About shows the same
rail. The script half is `overlay/assets/motion.js`, section 6; without it the
rail still scrolls. On phones, Recent work (Al Mada's four tiles) runs
sideways in the same kind of rail; wider screens keep its grid.

After the portfolio, two doors (`tools/home_links.py`): the case studies,
previewed as the studies' own covers laid out as prints that fan out under
the pointer, and About, previewed by the team photograph. Each lists what its
page covers. Inner pages carry no breadcrumbs: the menu and these doors lead
to them.

## Sideways and scroll-bound presentation

- **Service packages, phones:** the three packages in a rail that opens on
  the recommended one (`data-rail-start`, motion.js section 6), neighbours
  at the edges; wider screens keep the grid.
- **About, the six stages:** on computers the section pins and scrolling
  down carries the stage cards across while the gold line fills — CSS bound
  to the scroll (`view-timeline`, inset 0), one pixel of scroll to one of
  travel; off without scroll-driven animations, under 40em tall or under
  reduced motion (the six columns stay). Phones and tablets swipe them.
- **About, the four principles:** cards that stack as they scroll, each
  holding a step below the last (`position: sticky`), the heading holding
  beside them on computers.
- **Case studies:** on computers, a chapter that shows work keeps its text
  still while the work passes beside it; each study ends in a rail of every
  other study and the Al Mada story.
- **Home, brands from our work:** under the hero, the brands the site's
  own work shows (`BRANDS` in `home_links.py`) drift slowly past; a pointer
  holds them, reduced motion shows them still. A test fails if a name is
  not in the site's own images — the site promises no invented client.

## Case studies — /work

`tools/cases.py` builds the section; `tools/case_stories.py` holds the four
studies' shape (pieces, chapters, drawings, links) and `content/studies/`
their words (editable in `/cms/`), each in English and Arabic, in the team's
voice, with no number or result the work cannot show.

- `/work` — the hub: the Al Mada story as the featured card, then one card
  per study, filtered by discipline (identity, editorial, information,
  digital) without reloading — plain radio buttons and CSS, so it works
  without JavaScript too. Each filter shows how many studies it holds (a
  single sideways row on phones), and each card lists what its study holds:
  how many pieces and chapters, and the first pieces by name. The menu's "Case studies" and the homepage's
  "All case studies" link lead here.
- `/work/<slug>` — each study told the way the Al Mada story is: its headline
  beside four pieces of its work laid out like prints (each a link down to
  the chapter that shows it), then five chapters — an annotation, a headline,
  the lead, an aside, a hand-drawn line that draws itself in, and the work —
  joined by the story's thread, a closing line (with "More of this work on
  Behance" beside it where the study has a `behance` link in
  `case_stories.py`), two more studies and the contact call. The card's cover grows into the prints between pages.

**The work, and its placeholders.** Each study lists its pieces (identity
sheet, report cover, map, stories…) with their proportions. Until a piece's
image exists it shows as a framed placeholder in those proportions, so the
page does not move when the work arrives. To add the real work, name each
image `<slug>-<piece>` (for example `information-design-infographic.png`,
`brand-identity-systems-packaging.jpg` — the slugs and piece names are in
`tools/case_stories.py`), put them in one folder, and run

    python3 tools/images.py work <folder> && npm run build

The images are cropped to the piece's proportions (1600 and 800 wide) and
replace the placeholder in the hero and in the chapter at once. Once a study's
first piece is real, it also becomes the study's card on `/work` and, after
`node tools/share-cards/render.mjs`, its link preview.

The hub cards' covers are HTML scenes in the site's colours
(`tools/share-cards/case-cover.html?s=<slug>`), rendered and encoded with

    node tools/share-cards/render.mjs covers && python3 tools/images.py cases

To use a photograph instead, save it as `tools/share-cards/out/case-<slug>.png`
(16:10) and run only the second command.

## Case study hero

The Story page opens with its four surfaces beside the title — identity,
website, campaign, profile — laid out like prints on a table
(`tools/story_hero.py`). Each card links down to its chapter, shows its name
under the pointer (always on touch screens), rises in on arrival and then
drifts slowly (under reduced motion it simply stays still). It mirrors in Arabic and sits
under the text on phones.

## Image viewer

Every work image (slideshows, the homepage gallery, the work page, Story and
About photos) opens up close in a viewer (`overlay/assets/viewer.js`, styles
in `tools/motion.py` `VIEWER_CSS`): it grows out of the image tapped and
shrinks back into it. Zoom with the + / − buttons, the wheel, a pinch or a
double tap (up to 4×); drag to look around; move between the images of the
same section with the arrows, a swipe or the arrow keys (mirrored in Arabic);
Escape or a tap beside the image closes it. Images inside links or buttons
keep their link. Which images browse together is `GROUPS` in viewer.js.
Slideshows and the gallery pause while it is open.

## Details that keep the experience smooth

Kept by tests in `tests/campaign.mjs` ("UX pass"):
- "Back to top" scrolls the page it is on (every page has `<body id="top">`;
  it used to lead to the homepage from every other page), and the logo and
  "Home" go to `/` away from the homepage.
- A block already at the fold when a page opens is revealed straight away
  (the reveal starts as soon as any of it is in view).
- The FAQ, add-on and brand-challenge +/− marks sit in their box in Arabic.
- Form messages follow the page's language (`overlay/assets/forms.js`);
  email addresses are typed left to right in Arabic too.
- On phones the floating WhatsApp button steps aside over the contact
  section and the footer, where WhatsApp is already on screen.
- Phones held sideways (under 520px tall): the headline sits beside the
  lead and buttons, heroes drop their portrait minimum height, and the
  main button is on the first screen (tested at 844×390).
- The floating WhatsApp button also waits while the homepage hero, the
  About hero or a service's price box is on screen — it never covers the
  hero's own button (tested at 320px).
- No blue tap flash; cards and FAQ answer a tap with a slight press. The
  contact form's keyboard key moves to the next field.

Large screens (refinements stylesheet, end): from 1680 px the base size and
the page's width grow in steps (17 px / 1440 px, 18 px / 1600 px from
1920, 20 px / 1840 px from 2400), so a 1920 or 2560 screen gets the same
layout in proportion instead of a narrow column; below 1680 nothing
changes. Recent work's Al Mada tiles offer their full-size copies to large
and high-density screens. Tested at 1440, 1920 and 2560.

Arabic first (refinements.py `LANG_FIRST`): before anything is painted,
every page (not /go, which is Arabic) takes the visitor's saved choice or,
on a first visit, the first of Arabic or English in the device's language
list — an Arabic phone opens the site in Arabic, right to left, with its
Arabic title. The site script carries on from there; the HTML itself stays
English, so search engines read it as before. The Arabic titles carry the
same information as the English ones (seo.py: a service's from-price, a
case study's name).

Across screens (refinements stylesheet; tests in "Layout across screens"):
- Tablets and wide phones (48em–64em): a chapter's text sits beside its
  drawing, the closing box stacks, one-column text reads up to 68
  characters, the hero's buttons keep their size, add-ons run three to a
  row, the contact channels sit beside the form, a service's packages are
  a rail.
- Computers: the hero lines up with the header's logo (it used a wider
  container), the FAQ sits beside its heading, and sections are spaced a
  quarter tighter (no empty stretch over 300 px at a 16 px base).
- Rails keep their buttons, line and opening card under reduced motion,
  and on phones their buttons stay clear of the floating WhatsApp button.
  Recent work is a rail on every screen; every study, the Al Mada story
  included, ends in a rail of the others.

One visual system (refinements stylesheet, "UI pass"; a test checks it):
every section label is gold with its short rule, every heading is the bold
display face (the page template, the brand challenge and the builder
included); the testimonial is a full-width pull quote; "What it covers"
dots sit inside their chips; "Copy" and the "Check us" links are pills.

## Lost visitors and security headers

The 404 page offers the homepage, WhatsApp and every service, case studies,
pricing, about and contact (refinements.py `NOTFOUND_LINKS`). `.htaccess`
forwards (301) addresses people type or that used to exist — /contact,
/services, /faq, /portfolio, /projects, /case-studies, the removed
/work/talk-about-sudan, /prices, /packages, /about-us, /team — in its
FORWARD block, which `tests/router.php` also reads.

Headers added to the supplied set (nosniff, referrer policy, HSTS, CSP):
Cross-Origin-Opener-Policy, X-Frame-Options, a current Permissions-Policy
(browsing-topics, payment, usb off) and `upgrade-insecure-requests` in the
CSP. HSTS deliberately has no includeSubDomains.

## Ad URLs

Use standard UTM parameters. Everything is optional; the page works with none.

```
https://zaokalyamamah.online/go?utm_source=snapchat&utm_medium=paid&utm_campaign=launch-q4&utm_content=video-a
https://zaokalyamamah.online/go?utm_source=instagram&utm_campaign=launch-q4#work      ← opens on the portfolio
https://zaokalyamamah.online/go?utm_source=tiktok&utm_campaign=launch-q4&v=contact     ← opens on contact (for platforms that drop #)
```

`utm_source` values the WhatsApp greeting turns into words: `snapchat`,
`instagram`, `facebook`, `meta`, `tiktok`, `x`, `google`, `youtube`,
`linkedin`. Ads with no UTM tags are still recognised from their click id
(`gclid`, `fbclid`, `ttclid`, `ScCid`, `twclid`).

After Plausible records the visit, the parameters are removed from the
address bar, so a visitor never sees or shares a tracking link.

## What is tracked, and where to see it

**Plausible** (already on the site) records source / medium / campaign /
device / entry page from the landing URL on its own. On top of that, go.js
sends these custom events — add them as Goals in Plausible to see them:

| Event | When | Properties |
| --- | --- | --- |
| `lp_view` | page loaded | `entry` (home/work/contact), `device`, `source`, `medium`, `campaign`, `content`, `ref` |
| `lp_cta` | a CTA pressed | `cta` (work/contact), `placement` (hero, header, work_end, work_dock, sent) |
| `lp_step` | a view shown | `step`, `path` (portfolio, contact, portfolio>contact, …) |
| `channel_tap` | WhatsApp opened | `channel`, `placement`, `path` |
| `enquiry_started` / `enquiry_sent` / `enquiry_failed` | form | `service`, `path` |

Every event also carries `source`, `campaign`, `device`, `entry` and `ref`.
Nothing typed into the form is ever sent to analytics.

**Each lead** (email + CSV) carries the same context: source, medium,
campaign, content, term, landing page, entry view, device, path and reference.

**WhatsApp conversations** end with a reference such as `رقم المرجع: PX-7K2QM`.
Filter Plausible by the `ref` property to see which ad and path that chat
came from. That code is the only tracking a customer ever sees; the rest of
the message is plain language ("وصلت إليكم من إعلانكم على سناب شات واطّلعت
على أعمالكم…").

To have a campaign named in the greeting, map its code in `go.js`:

```js
campaigns: { 'launch-q4': 'عرض الإطلاق' },   // → "…على سناب شات بخصوص عرض الإطلاق…"
```

## Where leads go

Both forms send to `lead.php`: the campaign page's (/go) and, since the
contact-path pass, the main site's contact form (/#contact, `form=site`:
name, email, an optional WhatsApp number, the topic and the message). The
site form says "received" only once `lead.php` answers that the message is
held; if it cannot be (no server, as on the GitHub Pages preview, or a
failure) the visitor's mail app opens with the message written and WhatsApp
is offered beside it — the form's old behaviour, now the fallback
(`overlay/assets/forms.js`). A site message keeps its email in the
`location` column and its topic and message in `note`; the admin page shows
it with "رد بالبريد" (and WhatsApp too when a number was given). Plausible
counts `enquiry_sent` only when a message is held, `enquiry_failed` otherwise.

The admin page (`/admin/`) lists both kinds of request with totals, search
and filters; per request: reply (WhatsApp or email), status, internal note,
**edit** its details (a new number keeps its status and note), **archive**
and restore (the archive is its own tab, outside the counts), and **delete**
for good (asked first). Several can be ticked and archived, restored or
deleted together. Deleting rewrites `leads.csv` under the same lock
`lead.php` appends with, so a request arriving at that moment is kept.

After a case study (and the Al Mada story) the main action opens WhatsApp
with the study's name in the message; the phones' floating WhatsApp button
carries the page's topic on service pages and studies.


1. Email to `muhalabsalah@gmail.com` via PHP `mail()` (from `no-reply@<domain>`).
   Worth sending one test from the live site: Hostinger mail can land in spam
   until the domain has SPF/DKIM set in hPanel.
2. `leads.csv` in `../pixora-leads/` — the folder **above** `public_html`,
   which the web cannot reach. If the host does not allow that, it falls back
   to `public_html/_leads/`, which its `.htaccess` locks. Opens in Excel with
   the Arabic intact.

Spam protection: a hidden honeypot field and 5 requests per IP per 10 minutes
(the IP is stored only as a hash).

## Verify locally

```bash
php -S 127.0.0.1:8099 -t site tests/router.php &
BASE=http://127.0.0.1:8099 node tests/campaign.mjs
# if the installed Playwright wants a browser it cannot download:
CHROMIUM=/path/to/chrome BASE=http://127.0.0.1:8099 node tests/campaign.mjs
```

## Editing content — /cms/

The owner edits content at `https://zaokalyamamah.online/cms/` without
touching code: the twelve package prices, the WhatsApp number, the brands in
the homepage strip, and each case study's words (card, headline, standfirst,
the five chapters, the closing line), in Arabic and English. The panel is
[Sveltia CMS](https://github.com/sveltia/sveltia-cms) (MIT, pinned in
`package.json`); `tools/cms.py` writes its config from the content files, so
everything in them has a field and nothing can be added that the build could
not place.

    content/prices.json            package prices by service and package id
    content/brands.json            the brands strip
    content/studies/<slug>.json    a study's words
    tools/config.json              the WhatsApp number

**What a save does.** The panel commits the one file to `main`. The workflow
builds the site, runs every test, and — if the FTP secrets exist — uploads it
to Hostinger (`tools/deploy.sh`: files, then pages, then `.htaccess`; never
`admin/config.php` once it exists, never the leads, nothing deleted). A few
minutes after "Save" the change is live; if a test fails, nothing is
uploaded and the run in Actions says why. A price reaches its card, its
WhatsApp message, the contact form, the homepage's "from" (the lowest
package), the pricing index, the price data the estimator reads, and search
results data.

**Signing in** takes a GitHub fine-grained token for this repository with
*Contents: read and write* (LAUNCH.md, step by step). "Sign in with GitHub"
on the panel needs an OAuth server and is not set up; use the token button.

**Automatic upload** needs three repository secrets — `FTP_SERVER`,
`FTP_USERNAME`, `FTP_PASSWORD` (hPanel → Files → FTP Accounts) — and
optionally two variables: `FTP_DIR` (default `public_html`, the site's folder
as the FTP account sees it) and `FTP_PROTOCOL` (`ftps` by default; `ftp` only
if the host offers no encryption). Until the secrets exist the run notes
"Not uploaded" and the package is downloaded by hand as before.

The build proved the move byte for byte: with the content files as
generated, the site is identical to the one built before them. Tests:
`python3 tests/content.py` (edits every price, the number, a brand and a
study in a copy, builds it, finds every new value and no old one; broken
files stop the build with a message naming the field; the panel has a field
for every value) and `node tests/cms.mjs` (the panel against a stand-in for
GitHub: signs in, saves a price and a study, checks the commit changes one
line, and that a malformed number does not save).

## Admin — /admin/

A password-protected page for the campaign requests: totals, search, filters
(status, source, campaign, service), a WhatsApp reply button with a ready
greeting, call, status (جديد / تم التواصل / تم الاتفاق / غير مهتم), an internal
note, and export to Excel. It reads the same `leads.csv` that `lead.php`
writes and keeps statuses and notes in `admin-state.json` beside it.

**First use (once):**
1. Upload the site, then open `https://zaokalyamamah.online/admin/`.
2. The setup screen asks for the password you want (10+ characters) and
   shows one line, `const ADMIN_PASSWORD_HASH = '…';`. Nothing is saved.
3. In hPanel → File Manager, open `public_html/admin/config.php`, replace the
   `const ADMIN_PASSWORD_HASH = '';` line with it, and save.
4. Reload `/admin/` and sign in. To change the password later, empty that
   line again and repeat.

Protection: 5 wrong passwords lock the address out for 15 minutes; the
session cookie is HttpOnly, SameSite=Strict and Secure on HTTPS; every change
carries a CSRF token; sessions end after 2 idle hours; `config.php` is
blocked from direct access; the page is `noindex` and out of `robots.txt`.

Test: `node tests/admin.mjs` (self-contained; starts its own server).
