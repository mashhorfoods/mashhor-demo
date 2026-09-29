# Pixora — website + campaign landing

## Getting the upload package

Every push builds and tests the site on GitHub (`.github/workflows/build.yml`).
Open **Actions → Build site →** the latest green run **→ Artifacts →
`pixora-site-upload-<commit>`**, download it, and extract its contents into
`public_html`. A red run means a test failed: nothing from it should be
uploaded. Packages are kept for 30 days; "Run workflow" on the same page makes
a fresh one at any time.

Do not overwrite `admin/config.php` on the server once the admin password is
set (the package carries the empty one).

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
source/    the site exactly as supplied (replace wholesale with each new version)
overlay/   what this project adds: go.html, assets/go.js, lead.php, _leads/, admin/
tools/build.py   →   site/
```

`python3 tools/build.py` copies source then overlay into a fresh `site/`
(keeping any lead data in `site/_leads`), then runs, in order:

| Step | Script | What it does |
| --- | --- | --- |
| 1 | `build_services.py`, `streamline.py` | One page per service at `/services/<id>` (details, showcase, what it covers, packages and prices, related add-ons, other services). The homepage gets a single services section of cards; the old accordion, the five detail sections and the add-ons leave it. `/pricing` keeps only pricing matters: what moves a price, an index linking to the service pages, every add-on, the build-your-own estimator and billing. |
| 2 | `refinements.py` | Spacing, pill buttons, WhatsApp button on phones, hero copy, profile, privacy note, root-based clean links, 301s from `.html`. |
| 3 | `motion.py` | "Quiet luxury" motion layer, stylesheet half: one rhythm (480/900 ms, expo ease-out) with a light blur on the site's own reveal; page-to-page cross-fades with the header held still and each service card growing into its page (`@view-transition`); long text and the campaign page surfacing with the scroll (scroll-driven CSS); hero lines rising; pointer light on cards. Script half: `overlay/assets/motion.js` (line split, magnetic primary buttons, pointer light, self-gliding galleries that stop when touched, counting totals). All off under reduced motion; nothing hidden without it. |
| 4 | `finalize.py`, `prune_css.py` | One shared, content-hashed `site.<hash>.css` / `.js` / `motion.<hash>.js` for every page (go and admin included), long caching, CSP hashes. The stylesheet loses the rules of components no page uses (listed by exact class name in `prune_css.py`; the build stops if a page uses one again). |

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
| `tools/config.json` | The business WhatsApp number — the one place to change it. The build fills it into the campaign page and stops if the supplied site's own links use a different one. |
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
`FFMPEG=ffmpeg tools/service-covers/encode.sh`, and rebuild. The originals in
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
`tools/about-images/encode.sh` from the source PNGs; the supplied site's
About photos leave the upload.

## Link previews

What WhatsApp, X and the rest show when a page is shared: one 1200×630 card
per page, all in one design (`tools/share-cards/base.css`) — the brand, the
page's own headline in Arabic with its accent in yellow, the English line,
a few facts and the page's address. Home, /go, Story, About, Pricing and
each service have their own; privacy, terms and accessibility use the
homepage's. The pricing card's prices and each service card's headline and
starting price are read from the built site, so run the build, then
`node tools/share-cards/render.mjs`, whenever those change (the cards land
in `overlay/assets/share-*.jpg`).

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
- Breadcrumb links have finger-sized targets.
- Phones held sideways (under 520px tall): the headline sits beside the
  lead and buttons, heroes drop their portrait minimum height, and the
  main button is on the first screen (tested at 844×390).
- The floating WhatsApp button also waits while the homepage hero, the
  About hero or a service's price box is on screen — it never covers the
  hero's own button (tested at 320px).
- No blue tap flash; cards and FAQ answer a tap with a slight press. The
  contact form's keyboard key moves to the next field.

One visual system (refinements stylesheet, "UI pass"; a test checks it):
every section label is gold with its short rule, every heading is the bold
display face (the page template, the brand challenge and the builder
included); the testimonial is a full-width pull quote; "What it covers"
dots sit inside their chips; "Copy" and the "Check us" links are pills.

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
