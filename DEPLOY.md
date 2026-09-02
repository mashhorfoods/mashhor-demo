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

`dist/` after a build — **69 files, 3.3MB**, of which a first visit downloads
about 250KB:

```
index.html                          the site
404.html                            not-found page
.htaccess                           compression, caching, 404, MIME types
robots.txt
sitemap.xml
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
**The site makes zero third-party requests**: the photographs, both font
families and every icon are served from this origin. Nothing outside
`aunaldrb.com` has to resolve for the page to render.

**On Apache**, `.htaccess` ships with the site and configures everything below
by itself, as long as the host allows overrides.

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
