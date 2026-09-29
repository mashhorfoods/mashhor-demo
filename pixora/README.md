# Pixora — website + campaign landing

`site/` is the deployable web root — upload its **contents** to `public_html`.
It is **generated**; do not edit it by hand:

```
pixora/source/    the site exactly as supplied (replace wholesale with each new version)
pixora/overlay/   what this project adds: go.html, assets/go.js, lead.php, _leads/, admin/
pixora/tools/build.py   →   pixora/site/
```

`python3 pixora/tools/build.py` copies source then overlay into a fresh `site/`
(keeping any lead data in `site/_leads`), then runs, in order:

| Step | Script | What it does |
| --- | --- | --- |
| 1 | `build_services.py`, `streamline.py` | One page per service at `/services/<id>` (details, showcase, what it covers, packages and prices, related add-ons, other services). The homepage gets a single services section of cards; the old accordion, the five detail sections and the add-ons leave it. `/pricing` keeps only pricing matters: what moves a price, an index linking to the service pages, every add-on, the build-your-own estimator and billing. |
| 2 | `apply-site-refinements.py` | Spacing, pill buttons, WhatsApp button on phones, hero copy, profile, privacy note, root-based clean links, 301s from `.html`, CSP hashes. |
| 3 | `motion.py` | "Quiet luxury" motion layer, stylesheet half: one rhythm (480/900 ms, expo ease-out) with a light blur on the site's own reveal; page-to-page cross-fades with the header held still and each service card growing into its page (`@view-transition`); long text and the campaign page surfacing with the scroll (scroll-driven CSS); hero lines rising; pointer light on cards. Script half: `overlay/assets/motion.js` (line split, magnetic primary buttons, pointer light, self-gliding galleries that stop when touched, counting totals). All off under reduced motion; nothing hidden without it. |
| 4 | `finalize.py` | One shared, content-hashed `site.<hash>.css` / `.js` / `motion.<hash>.js` for every page (go and admin included), long caching, CSP hashes. |

The build is deterministic (two runs give identical output); the tests below
run against its output.

## The campaign flow

```
Ad  →  /go (hero)  →  "شوف أعمالنا"  →  /go#work     →  تواصل معنا / WhatsApp
                    →  "تواصل معنا"   →  /go#contact  →  WhatsApp  or  5-field form  →  /go#sent
```

| File | What it is |
| --- | --- |
| `site/go.html` | The landing page. One document, four views (`#top`, `#work`, `#contact`, `#sent`); Back always works; without JavaScript the views stack. Arabic, RTL, `noindex`, not in the sitemap. |
| `site/assets/go.js` | Views, WhatsApp messages, the form, attribution. External so the site's CSP needs no new hash. |
| `site/lead.php` | Receives the form: validates, stores a CSV row, emails `muhalabsalah@gmail.com`. Answers "ok" only when the lead is actually held — otherwise the page offers WhatsApp with the details pre-written. |
| `site/_leads/.htaccess` | Refuses all web access to the fallback storage folder. |
| `tools/apply-site-refinements.py` | Site-wide design refinements on all six pages: more generous spacing, one pill-shaped 52px button, softer fields, a floating WhatsApp button on phones, and the profile (Muhalab Basheir, Visual Communications Designer). CSS and markup only — the inline scripts and their CSP hashes are untouched. **Idempotent; run it after every site rebuild, then the sync below.** |
| `tools/sync-shared-styles.py` | Copies `index.html`'s stylesheet into `go.html` verbatim. **Run it after every site rebuild.** |
| `tests/campaign.mjs` | End-to-end checks (99): routes, devices, WhatsApp links, validation, submission, tracking, fallback, and the existing pages. |

Outside the campaign, the pages carry the refinements above, and `privacy.html` (it said the
site's only form has no server — now it describes the campaign form too) and
`robots.txt` (keeps `lead.php` out of search). Both are build outputs of
`tools/build-deploy.js`, which was not supplied: carry these edits into the
generator's sources, or they will be lost on the next build.

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
php -S 127.0.0.1:8099 -t pixora/site pixora/tests/router.php &
BASE=http://127.0.0.1:8099 node pixora/tests/campaign.mjs
# if the installed Playwright wants a browser it cannot download:
CHROMIUM=/path/to/chrome BASE=http://127.0.0.1:8099 node pixora/tests/campaign.mjs
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

Test: `node pixora/tests/admin.mjs` (self-contained; starts its own server).
