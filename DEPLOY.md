# Deploying عون الدرب

## What to upload

Build, then upload **the contents of `dist/`** to the web root — or run
`node tools-package.js` and upload the single archive it makes. For Hostinger
specifically, follow **[HOSTINGER.md](HOSTINGER.md)**, which covers the two
things that actually go wrong there: extracting one level too deep, and the
placeholder `index.php` that answers `/` instead of the site.

```sh
npm install            # once — sharp, for the two image tools
node tools-images.js   # only when a photograph in img/ has changed
node tools-fonts.js    # only when a font weight is added or dropped
node tools-brand-images.js   # only when the logo changes
node build.js          # always — regenerates dist/ from scratch
node tools-package.js  # optional — dist/ as one uploadable, verified archive
```

`build.js` deletes `dist/` before writing it, so the folder is never stale, and
it fails loudly if the page references an asset that is not there.

The three `tools-*.js` scripts regenerate **derived** assets — the responsive
photo variants, the self-hosted font subsets, the social card and icons. Their
outputs are *not* committed, and neither is `dist/`: what the repository holds
is the sources they are made from.

So a clean checkout needs the dependency installed once, and then one command:

```sh
npm install                      # sharp, the only dependency, used by the image tool
npm run release                  # regenerates what is missing, builds, then runs every gate
```

`npm run build` alone is enough when the photo variants are already present;
it fails clearly if `img/manifest.json` is not, and `npm run release`
regenerates it rather than stopping.

> This page used to say the tools' outputs were committed and that a clean
> checkout could build without running them. That was not true — the variants
> and the manifest have always been ignored — and it went unnoticed because
> `dist/` was committed, so nobody ever had to build. Untracking `dist/` is
> what surfaced it.

`dist/` after a build — `node tools-package.js` prints the file count and size
of the archive it writes, and checks the archive against `dist/` file by file.
Read the count from there rather than from here; a number typed into a document
is right the day it is typed.

What a visitor actually pulls is measured, not estimated: `bin/qa-perf.js` puts
a first visit at **518KB uncompressed over 16 requests**, of which the document
itself is 202KB — and that 202KB is the part compression works on, while the
photographs and the font subsets are already compressed formats.

The static half of that, which is what the rest of this document describes:

```
index.html                          the site
404.html                            not-found page
.htaccess                           compression, caching, 404, MIME types
robots.txt
sitemap.xml
llms.txt                            machine-readable summary for AI assistants
google192f612c4e876e6f.html         Search Console verification
img/                                62 photo variants (srcset), WebP + AVIF hero
fonts/                              8 woff2 subsets + OFL.txt
brand/aun-aldrb-logo.svg            header logo + favicon
brand/aun-aldrb-logo-white.svg      footer logo
brand/og-image.png                  Open Graph / Twitter card, 1200x630
brand/logo.png                      the logo raster the structured data names
brand/apple-touch-icon.png          iOS home screen
brand/favicon-32.png                PNG favicon fallback
```

Nothing else. In particular **do not upload** `seo/`, `bin/` (beyond the six
scripts the package carries), `build.js`, `tools-*.js`, `package.json`, `brand/*.md`,
`brand/design-system.html`, `brand/index.html`, `brand/tokens.css`,
`brand/system.css`, the image masters in `img/*.webp` (they are several times
larger than any variant), or `node_modules/`.

## Server requirements

**RECOVERY 01 changed this.** The public site is still static and still renders
without anything running behind it. The admin dashboard and the request form
are not: they need **PHP 8.1+ with PDO, pdo_mysql, mbstring and openssl**, and
a **MySQL or MariaDB** database. Hostinger's shared plans provide both, and the
backend ships inside the same zip — see `BACKEND.md` for the architecture and
`HOSTINGER.md` §6 for the five steps that bring it up.

Everything below still describes the static site.
**The only third-party request the site makes is Google Analytics**: the
photographs, both font families and every icon are served from this origin, so
nothing outside `aunaldrb.com` has to resolve for the page to *render* — the
analytics tag is `async` and nothing waits for it.

**On Apache**, `.htaccess` ships with the site and configures everything below
by itself, as long as the host allows overrides.

> **One block in `.htaccess` needs a decision before you upload.** It redirects
> `http://` to `https://` and `www.` to the apex, so the site answers on the one
> address its canonical tag, sitemap, Open Graph tags and structured data all
> name. That assumes the TLS certificate is installed and covers both
> `aunaldrb.com` and `www.aunaldrb.com` — which is a requirement of this site
> anyway. **If the certificate is not in place yet, comment that block out
> until it is**; redirecting to an address that cannot be served takes the site
> down. It is marked in the file.

**On Nginx**, `.htaccess` is inert and this belongs in the server block:

```nginx
error_page 404 /404.html;

gzip on;
gzip_types text/html text/css application/javascript image/svg+xml
           application/xml text/plain;
gzip_min_length 1024;

types { image/avif avif; image/webp webp; font/woff2 woff2; }

location ~* \.(webp|avif|png|svg|woff2)$ {
  add_header Cache-Control "public, max-age=31536000, immutable";
}
location ~* \.html$ {
  add_header Cache-Control "no-cache";
}
```

Three things matter, in this order:

1. **Compression.** `index.html` is 182KB of markup and inline CSS and gzips to
   34KB. It is the one render-blocking resource on the page. Measured on this
   build, on a throttled mobile profile: **mobile Lighthouse performance 99 and
   LCP 2.2s with compression, 93 and 3.1s without.** If only one thing on this
   list gets done, make it this one.
2. **HTTPS**, because the canonical URL is `https://aunaldrb.com/`.
3. **404 handling** — point the not-found handler at `/404.html`.

**Caching.** Every photograph carries its width in its filename and every font
file carries its weight, so a changed file is a changed name: a one-year
`immutable` cache is safe for `img/`, `fonts/` and `brand/`. `index.html` is
not versioned and must revalidate, or an update never reaches anyone.

## Before you upload

One command, which runs every gate and then asks the questions a green test
suite does not answer — is debug off, is the installer shut, is the package
built from the source in front of you:

```sh
npm run serve &                  # the development server the gates drive
npm run release                  # every gate, then the release conditions
```

It ends in one of three verdicts: GO, GO WITH ACTIONS, or NO-GO. Read the
count off that run rather than from here; a number written into a document is
right on the day it is typed.

`npm run smoke` is the same runner with `--quick`, which skips the four slowest
browser gates. It is a smoke run, not a gate — never upload on its word alone.

To see what the host will actually serve, `npm run preview` serves `dist/` with
the same gzip, cache headers and 404 handler asked for above, so what is
measured locally is what a visitor gets. `GZIP=0 node tools-serve.js` shows
what an unconfigured host costs.

> The harnesses that used to live in `ux/` were what this section named for a
> long time. They required `playwright-core`, which is not a dependency of this
> project and was never installed, so every one of them failed on its first
> line — while this page still told you to run them. They were removed once
> the gates covered what they measured; the last gap, `robots.txt` and
> `sitemap.xml`, moved into `bin/qa-public.js` first.

## Being found — search engines and AI assistants

Three surfaces do this work, and all three ship:

- **`robots.txt`** names twenty-two crawlers explicitly and blocks none of
  them. Naming matters: a crawler that finds its own name uses *its* group and
  stops reading the wildcard one, so leaving them to inherit is not the same
  as allowing them. `Google-Extended` and `Applebot-Extended` are in there on
  purpose — they are not crawlers but the opt-out switches for Gemini and
  Apple Intelligence, and this site opts in.
- **`sitemap.xml`** — one canonical URL with a `lastmod`. Update the `lastmod`
  when the content changes, not on every deploy.
- **`llms.txt`** — the convention AI assistants look for. It carries the same
  facts as the page plus an explicit list of what the site does *not* state:
  no prices, no ratings, no branches outside Riyadh, no ambulance service. An
  assistant with a gap tends to fill it; this closes the gaps.

The thing that matters most is not a file. **Every word of the page is in the
first HTTP response** — no JavaScript required. Most AI crawlers do not execute
JavaScript at all, and a site whose content only appears after a script runs
is, to them, an empty page. `bin/qa-public.js` fetches the page as Googlebot,
GPTBot and ClaudeBot in turn and fails if what comes back is not already the
text, so this cannot quietly stop being true.

## Search Console, after the first deploy

1. `google192f612c4e876e6f.html` is already in the package; verification will
   pass as soon as the site is live.
2. Submit `https://aunaldrb.com/sitemap.xml`.
3. Check the structured data with the Rich Results Test. The page publishes a
   `LocalBusiness`, a `WebSite`, a `WebPage` and seven `Service` nodes — every
   value in them is copied from the page, and there are deliberately no
   ratings, reviews, offers or prices, because the site publishes none.
4. `sitemap.xml` carries a `lastmod`. Update it when the content changes — not
   on every deploy.
5. **Check Google Analytics is receiving.** The GA4 tag (property
   `G-NG6B8KSZQ9`) is in the `<head>`. `googletagmanager.com` is unreachable
   from the environment this build was verified in, so the tag was never seen
   to execute here — confirm the first pageview lands in GA4 Realtime.
6. **Re-run Lighthouse on the live URL**, via PageSpeed Insights. It is the
   only place the analytics tag's real cost can be measured, and the only
   place the `https://` and `www.` redirects can be confirmed.

## A note on cookies

GA4 sets first-party cookies (`_ga`, `_ga_NG6B8KSZQ9`). Saudi PDPL, and the
GDPR rules that apply to EU and UK visitors, make a consent banner the safe
default for analytics. **There is no consent banner on this site.** If one is
added, the `gtag('config', ...)` call in the `<head>` is what it has to gate —
loading the script is harmless, sending the pageview is the part that needs
consent. This is a decision for the client, not a defect in the build.
