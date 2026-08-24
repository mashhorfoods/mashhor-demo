# Deploying عون الدرب

## What to upload

Run the build, then upload **the contents of `dist/`** to the web root.

```sh
node build.js      # regenerates dist/ from scratch
```

`dist/` after a build:

```
index.html                       the site
404.html                         not-found page
robots.txt
sitemap.xml
google192f612c4e876e6f.html      Search Console verification
brand/aun-aldrb-logo.svg         header logo + favicon
brand/aun-aldrb-logo-white.svg   footer logo
brand/aun-aldrb-logo.png         Open Graph / social preview
brand/aun-aldrb-logo-white.png
```

Nothing else. In particular **do not upload** `ux/` (verification harnesses),
`build.js`, `brand/*.md`, `brand/design-system.html`, `brand/tokens.css`,
`brand/system.css`, or `node_modules/`.

`build.js` deletes `dist/` before writing it, so the folder is never stale.

## Server requirements

There is no build server, no runtime and no database — this is static hosting.
Two things need configuring:

1. **404 handling** — point the server's not-found handler at `/404.html`.
   - Apache: `ErrorDocument 404 /404.html`
   - Nginx: `error_page 404 /404.html;`
2. **HTTPS**, because the page loads fonts and images over `https://` and the
   canonical URL is `https://aunaldrb.com/`.

3. **Compression.** `index.html` is 174KB of markup and CSS, which gzips to
   **34KB** — an 81% saving on the one render-blocking resource, for one line
   of server config. If only one thing on this list gets done, make it this.
   - Apache: enable `mod_deflate` for `text/html`, `text/css`, `image/svg+xml`
   - Nginx: `gzip on; gzip_types text/html text/css image/svg+xml;`

Caching: `index.html` should be revalidated (`Cache-Control: no-cache` or a
short max-age) so updates appear; the files under `brand/` never change name
and can be cached for a long time.

## Before you upload

The site is verified by the harnesses in `ux/`. They run against the source by
default, or against what actually ships:

```sh
CHROMIUM_PATH=<chrome> SITE_URL="file://$PWD/dist/index.html" node ux/verify-polish.js
```

Every harness accepts `SITE_URL`, because development success is not production
success.

## Known deployment considerations

- **All ten photographs are served from `i.ibb.co`**, a third-party
  image-sharing host. They are on the critical path — the hero image is the
  Largest Contentful Paint element on every screen size. Moving them onto
  `aunaldrb.com/` alongside the logos would remove that dependency, allow
  responsive `srcset` variants, and let them be cached under your own rules.
- The Google Fonts stylesheet is render-blocking by design. Self-hosting the
  five weights would remove two third-party connections from the critical path.
