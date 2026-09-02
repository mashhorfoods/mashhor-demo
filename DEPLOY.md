# Deploying عون الدرب

## What to upload

Build, then upload **the contents of `dist/`** to the web root.

```sh
npm install            # once — sharp, for the two image tools
node tools-images.js   # only when a photograph in img/ has changed
node tools-fonts.js    # only when a font weight is added or dropped
node tools-brand-images.js   # only when the logo changes
node build.js          # always — regenerates dist/ from scratch
```

`build.js` deletes `dist/` before writing it, so the folder is never stale, and
it fails loudly if the page references an asset that is not there.

Only `build.js` is needed for a normal deploy. The three `tools-*.js` scripts
regenerate **derived** assets — the responsive photo variants, the self-hosted
font subsets, the social card and icons — and their outputs are committed, so a
clean checkout can build without running them.

`dist/` after a build — **70 files, 3.3MB**, of which a first visit downloads
about 250KB:

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

Nothing else. In particular **do not upload** `ux/` (the verification
harnesses), `seo/`, `build.js`, `tools-*.js`, `package.json`, `brand/*.md`,
`brand/design-system.html`, `brand/index.html`, `brand/tokens.css`,
`brand/system.css`, the image masters in `img/*.webp` (they are several times
larger than any variant), or `node_modules/`.

## Server requirements

There is no build server, no runtime and no database — this is static hosting.
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

The site is verified by the harnesses in `ux/`. They run against the source by
default, or against what actually ships:

```sh
export CHROMIUM_PATH=<path to chrome>
export SITE_URL="http://127.0.0.1:8080/"
node tools-serve.js &            # serves dist/ the way the host should
for f in ux/verify-*.js; do node "$f"; done
```

`tools-serve.js` is not a convenience: it applies the same gzip, the same cache
headers and the same 404 handler the real host is asked for above, so what is
measured locally is what a visitor gets. `GZIP=0 node tools-serve.js` shows
what an unconfigured host costs.

All ten harnesses pass against the production build — 1,231 assertions.

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
first HTTP response** — 5,477 characters of text, 32 headings, no JavaScript
required. Most AI crawlers do not execute JavaScript at all, and a site whose
content only appears after a script runs is, to them, an empty page. Verify it
stays that way with `ux/verify-crawlability.js`.

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
