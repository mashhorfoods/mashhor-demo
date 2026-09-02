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

## 6 · The database and the backend (RECOVERY 01)

The site above is static and works on its own. The admin dashboard and the
public request form need PHP and MySQL, which the shared plan already
provides — nothing extra to buy, and the files came up in the same zip.

**a. Create the database.** hPanel → **Databases → MySQL Databases**. Create a
database and a user, give the user all privileges on it, and note the three
values. Hostinger prefixes both names with your account id; use the prefixed
forms exactly as shown.

**b. Write `.env`.** In the File Manager, go **up one level from
`public_html`** — to your home directory — and create a file called `.env`
there. Copy `public_html/.env.example` into it and fill in:

```
APP_ENV=production
APP_DEBUG=false
APP_URL=https://aunaldrb.com
DB_DRIVER=mysql
DB_HOST=localhost
DB_NAME=u123456789_aun
DB_USER=u123456789_aun
DB_PASS=…the password you set…
APP_KEY=…64 hex characters…
SESSION_COOKIE_SECURE=true
```

Above `public_html` is the right place: nothing there is reachable over HTTP
under any misconfiguration. `public_html/app/.env` also works and is denied by
`.htaccess`, but it is the weaker of the two.

For `APP_KEY`, hPanel → **Advanced → SSH Access** (or any PHP host) and run:

```sh
php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
```

**c. Create the tables and the first administrator.** Over SSH, from
`public_html`:

```sh
php bin/migrate.php
php bin/seed.php --admin-email=you@aunaldrb.com --admin-name="اسمك"
```

`seed.php` prints a generated password **once**. It is not written to the log
or the database — only its hash is stored. Save it, sign in, change it.

If SSH is not enabled on your plan, hPanel → **Advanced → Cron Jobs** will run
the same two commands once each; set them to run once, check the output mail,
then delete them. The generated password arrives in that mail, so change it
immediately afterwards.

**d. Check it.** Open `https://aunaldrb.com/api/health`. You want:

```json
{"ok":true,"db":{"driver":"mysql","connected":true,"missingTables":[]}}
```

It reports which settings are *present*, never their values, so it is safe to
open in a browser. If `connected` is false, the three `DB_` values are wrong —
the reason is in `app/storage/logs/`, not in the response.

**e. Sign in.** `https://aunaldrb.com/admin/` redirects to the login page.
After signing in you land on الرئيسية. Open `https://aunaldrb.com/admin/requests.html`
in a private window to confirm it redirects instead of showing the page.

**f. Load the website content.** Still from `public_html`:

```sh
php bin/seed-content.php
```

This reads the current copy out of `index.html` — the approved text, verbatim —
and loads it into the database so المحتوى has something to show. It prints the
publish target and whether it is writable; you want **writable**. Re-running it
is safe and never overwrites an edit an administrator has made.

**g. Submit a real request.** Fill in «اطلب رحلة» on the public site. You
should get a رقم الطلب back, and it should appear in طلبات النقل as **جديد**.
That is the whole flow: form → API → database → dashboard.

### If the backend does not answer

| Symptom | Cause |
| --- | --- |
| `/api/health` returns the site's 404 page | `api/.htaccess` did not upload (hidden file), or `mod_rewrite` is off |
| `{"connected":false}` | `DB_NAME`, `DB_USER` or `DB_PASS` is wrong, or the user has no privileges on that database |
| `missingTables` is not empty | `php bin/migrate.php` has not been run |
| The admin pages show raw HTML without a login | `admin/.htaccess` did not upload — **take the site down until it does**; the pages are readable by anyone until then |
| PHP source appears in the browser | the host is not executing PHP; contact support, and do not leave it in that state |
| Login says the form expired | the clock is far off, or cookies are blocked; `SESSION_COOKIE_SECURE=true` on an `http://` URL will also do it |
| المحتوى says publishing is unavailable | `index.html` is not writable by PHP — set it to 644 owned by the site user, and make sure `public_html` itself is writable |
| المحتوى is empty | `php bin/seed-content.php` has not been run |
| An edit saves but the site does not change | saving and publishing are separate — press **نشر إلى الموقع** |
| التقارير shows no data | check the period — an empty period offers a wider one; the report counts the date basis you selected |

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
