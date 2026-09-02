# Uploading to Hostinger

`aun-aldrb-site.zip` — 70 files, 3.07MB. Build it with:

```sh
node build.js && node tools-package.js
```

The archive holds the **contents** of `dist/` at its root: `index.html` is the
first entry, not `dist/index.html`. That matters — see step 3.

---

## 1 · Open the File Manager

hPanel → **Websites** → *aunaldrb.com* → **File Manager**, and go into
**`public_html`**. That folder is the web root: a file at
`public_html/index.html` is served at `https://aunaldrb.com/`.

## 2 · Empty it first

Hostinger creates `public_html` with a placeholder in it — usually
`default.php`, sometimes `index.php`, occasionally a `.html` welcome page.
**Delete everything that is already there.** If a leftover `index.php`
survives, most servers list it ahead of `index.html` and it answers `/`
instead of the site. (`.htaccess` sets `DirectoryIndex index.html` to make that
impossible, but an empty folder is still the right starting point.)

If the site has been deployed before, delete the old files rather than
overwriting them: an asset that stops being referenced does not stop being
served, and stale files linger for years.

## 3 · Upload and extract INTO `public_html`

Upload `aun-aldrb-site.zip` into `public_html`, then right-click it →
**Extract** → and extract to `public_html` itself, **not** to a new folder.

You should end up with:

```
public_html/
  .htaccess          index.html        404.html
  robots.txt         sitemap.xml       llms.txt
  google192f612c4e876e6f.html
  img/  fonts/  brand/
```

If you see `public_html/dist/` or `public_html/aun-aldrb-site/`, the extract
went one level too deep. Move the contents up and delete the empty folder.

**Delete `aun-aldrb-site.zip` from the server once it is extracted.** It sits
at a public URL otherwise.

## 4 · Check `.htaccess` arrived

It is a dotfile, so the File Manager may hide it: **Settings → Show hidden
files**. It must be there. Without it the site still works, but it loses
compression, caching, the 404 page and the canonical redirects — which is most
of the performance work.

## 5 · SSL, before anything else

hPanel → **Security → SSL**. Install the free certificate and wait for it to
show *Active*, for **both** `aunaldrb.com` and `www.aunaldrb.com`.

`.htaccess` redirects `http://` → `https://` and `www.` → the apex, so the
site answers on the one address its canonical tag, sitemap and structured data
all name. **If the certificate is not active yet, that redirect sends visitors
to an address that cannot be served.** Either install the certificate first, or
comment out the block marked *"one canonical address"* until you have.

Hostinger also has its own **Force HTTPS** toggle. Either that or the
`.htaccess` block is enough; both together is harmless.

---

## After it is live

1. Open `https://aunaldrb.com/` and confirm the Arabic text renders in the
   brand typefaces, not a system fallback — that tells you `fonts/` uploaded.
2. Open `https://aunaldrb.com/nonsense` and confirm the branded 404 appears.
3. Open `https://aunaldrb.com/robots.txt`, `/sitemap.xml` and `/llms.txt`.
4. Type `http://www.aunaldrb.com` and confirm you land on
   `https://aunaldrb.com/` — one redirect, not two.
5. **Google Search Console** — verification passes as soon as the site is live
   (`google192f612c4e876e6f.html` is in the package). Submit
   `https://aunaldrb.com/sitemap.xml`, then run the URL Inspection tool and
   check the Rich Results Test picks up the `LocalBusiness` and the seven
   `Service` nodes.
6. **Google Analytics** — open the site, then GA4 → Reports → Realtime. The
   tag was never seen to execute in the build environment, so this is the
   first real confirmation it works.
7. **PageSpeed Insights** on the live URL. This is the only place the
   analytics tag's real cost shows up, and the only place Hostinger's own
   compression is measured rather than assumed.

## A note on caching

`.htaccess` asks for a one-year `immutable` cache on everything in `img/`,
`fonts/` and `brand/`, which is safe because those filenames carry a width or a
weight — a changed file is a changed name. `index.html` is set to revalidate,
so edits appear immediately.

If Hostinger's LiteSpeed Cache is enabled and a change does not show, purge it
from hPanel rather than adding cache-busting query strings.

## If something is wrong

| Symptom | Cause |
|---|---|
| Blank page, or a Hostinger placeholder | files went into `public_html/dist/` — move them up one level |
| A PHP page instead of the site | leftover `index.php` or `default.php` in `public_html` — delete it |
| Arabic renders in a system font | `fonts/` did not upload, or uploaded as an empty folder |
| Photographs missing | `img/` did not upload |
| No 404 page, plain server error instead | `.htaccess` is missing (hidden file not extracted) |
| Redirect loop | SSL is not active yet — comment out the canonical-address block until it is |
| Site is slow, PageSpeed says "enable text compression" | LiteSpeed compression is off in hPanel; turn it on |
