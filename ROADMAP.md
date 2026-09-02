# Launch route

Six stages from where the build stands today to a live, hardened deployment on
Hostinger. One of them is yours and it comes first.

Companion page: the same plan, laid out —
https://claude.ai/code/artifact/331bd20f-2bd3-416d-8133-4491e6c9969f

---

## Where the build stands

Measured on `claude/aun-aldrb-brand-identity-7by0a9`:

| | |
|---|---|
| Verification suite | 293 / 293 assertions in `bin/verify.php` pass |
| Admin modules | 11 of 11 read and write through `/api`; none on literal data |
| Backend | 25 PHP files; authorization enforced in the dispatcher |
| Public site | `index.html` 405 KB source → 200 KB built |

One caveat, and it is the reason this document exists: those 293 checks have
only ever run against **SQLite**, on a development machine, over plain HTTP.
Never against MySQL, never on Hostinger, never over TLS. Until that happens,
every claim about the production system is a prediction rather than a
measurement.

---

## A · Deploy, and prove it on the real host — **yours**

> **Staging first.** The site is being brought up on a temporary domain,
> `https://zaokalyamamah.online`, and moves to `aunaldrb.com` once it is
> verified. Set `APP_URL` to the temporary domain in `.env` — preflight reads
> it, and nothing else in the application depends on it. `.htaccess` no longer
> names a domain: `www` → apex and `http` → `https` both preserve whatever
> host was asked for, so the same file works on both, and section 3b sends
> `X-Robots-Tag: noindex, nofollow` on every host *except* `aunaldrb.com`, so
> the temporary copy cannot be indexed while carrying canonical URLs that name
> the real one. Nothing has to be edited at cutover.
>
> One thing does not move by itself: the seeded content lives in the database,
> so the real domain needs its own `migrate` + `seed` + `seed-content` run, or
> a copy of the staging database.


I have no access to Hostinger, so this stage is yours and it blocks every
other one. The goal is not to get files onto the server; it is to run the same
293 checks against MySQL over HTTPS and see what a real host says.

1. hPanel → **Databases** → create a MySQL database and user. That password
   belongs in `.env` only, never in the repository.
2. Build and upload, following `HOSTINGER.md` §1–3. Empty `public_html` first;
   the archive's *contents* go at the root.
   ```sh
   node build.js && node tools-package.js
   ```
3. Place `.env` **one level above** `public_html`. `Env.php` looks there first,
   and a file outside the web root cannot be fetched by any request.
4. **If the account has no usable terminal** — SSH refusing, cron not firing —
   run `install.php` from a browser instead. Put a `SETUP_TOKEN` (16+ chars) in
   `.env`, open `https://aunaldrb.com/install.php?t=<token>`, and it performs
   the same three steps by calling the same `app/Setup.php` code. Without the
   token it answers a bare 404; it refuses once a Super Admin exists; it
   deletes itself on success. Then remove `SETUP_TOKEN` from `.env` —
   `preflight` fails if either survives. Otherwise, run the CLI scripts:
   ```sh
   php bin/migrate.php        # 20 tables, 2 migrations
   php bin/seed.php           # roles + the first Super Admin
   php bin/seed-content.php   # services, media, settings
   ```
5. Sign in and **change the seeded Super Admin password immediately**.
6. Run the read-only preflight and send me its output. It reads files, reads
   the database and makes ordinary HTTP requests; it writes nothing, so it is
   safe against the live site.
   ```sh
   php bin/preflight.php
   ```
7. Then the full suite, **against a second, empty database** — not the live
   one. `bin/verify.php` writes: it creates test customers, test requests and
   test accounts, and it publishes content into `index.html`. It refuses to
   run when `APP_ENV=production` for exactly that reason. It is also excluded
   from the deployment package by design, so upload it by hand and delete it
   afterwards.
   ```sh
   # a second MySQL database in hPanel, and a copy of .env pointing at it
   php bin/migrate.php
   php bin/seed.php --admin-email=you@example.com --admin-name="اسمك"
   php bin/verify.php https://aunaldrb.com --email=you@example.com --password=…
   ```
   Send me the raw output, failures included — that text is what stage B is
   built from.

**Done when** preflight reports no failures against the live database, and the
293-check suite has run to completion against MySQL on this host. Green or red,
a result is the deliverable.

---

## B · Close whatever MySQL surfaces — mine

SQLite forgives what MySQL does not. Driven by stage A's output; these are the
seams I would bet on.

- **Row locking.** `Db::lockRow()` appends `FOR UPDATE` only on MySQL, so that
  branch has never executed. It guards the status-change path.
- **Strict mode.** MySQL rejects over-long strings and invalid dates SQLite
  accepts. Every `VARCHAR` length in `Schema.php` meets real Arabic input here.
- **Collation.** Tables are `utf8mb4`, but Arabic comparison and sorting is
  only settled by the server's collation.
- **Atomic publish.** `Publisher` writes a temp file and renames over
  `index.html`. That rename has never run on LiteSpeed.

Each failure fixed at its root, never by relaxing an assertion, and each fix
covered by a new check — the suite grows past 293 rather than staying there.

**Done when** the same suite reports zero failures on the host.

---

## C · The security baseline — mine, one decision yours

Already built: Argon2id hashing, session tokens stored only as SHA-256 hashes,
idle and absolute expiry, HttpOnly + SameSite cookies, CSRF double-submit with
`hash_equals`, authorization in the dispatcher before any handler, rate
limiting, account lockout, `.env` outside the web root.

Four gaps, in the order they matter:

1. **Password reset — there is none.** The real hole, and the account lockout
   makes it worse: one Super Admin who forgets their password is locked out
   with no route back in. **Your decision:** emailed reset link (needs working
   SMTP on the plan) or a CLI reset over SSH. My recommendation is the CLI one
   first — no external dependency, cannot be phished, closes the lockout risk
   immediately — with email later if you want self-service.
2. **Content Security Policy.** None in `.htaccess`, `admin/.htaccess` or
   `api/.htaccess`. The admin pages are deliberately self-contained, so an
   honest policy means per-file hashes generated at build time, not
   `unsafe-inline`.
3. **HSTS.** Deliberately last: hard to undo, so it goes on only after the
   certificate is confirmed and the site has been stable on HTTPS.
4. **Log rotation.** `app/Log.php` and the activity table grow without bound.
   A disk quota should never be what takes the site down.

**Done when** headers are verified on the live URL, one reset is performed end
to end on the host, rotation is observed to rotate, and a repository scan
confirms no secret was ever committed.

---

## D · Performance, without touching the design — mine

Two admin pages were built before the API existed, so their images were inlined
as base64. Both now load their data from `/api`, which makes those inlined
copies duplicates of files already on the server.

| File | Size | of which base64 |
|---|---|---|
| `admin/media.html` | 521 KB | 400 KB (77%) |
| `admin/services.html` | 289 KB | 183 KB (63%) |

The other nine admin pages sit between 30 and 138 KB and are not the problem.

- Replace the data URIs with file references — media ≈ 120 KB, services
  ≈ 105 KB, roughly 585 KB removed from two page loads with nothing visibly
  different.
- Content-hashed filenames and long-lived cache headers for `img/`, `fonts/`,
  `brand/`.
- Confirm LiteSpeed compression is applied to HTML, CSS and JS.
- Measure with Lighthouse against the live URL. A local number is a fiction.

**Constraint:** no redesign, no change to the brand identity, no change to
approved content. If a metric can only improve by changing how the site looks,
I bring the number and stop.

**Done when** before/after byte counts and a live Lighthouse run are recorded.

---

## E · What happens on the ordinary bad day — shared

No backup, no restore procedure, no update path exists today. One property of
the architecture drives this stage: the publisher writes approved content
*into* `index.html`, so the database and that file are a matched pair. Backing
up one without the other restores a site whose content and admin disagree.

- `bin/backup.php` — MySQL dump, published `index.html` and uploaded media in
  one timestamped set.
- A written restore procedure, **tested once by actually restoring** into a
  scratch database. An untested backup is a guess.
- A repeatable update path that replaces code without touching `.env`, the
  database, or anything uploaded through the dashboard.
- A plain uptime check, so the site being down arrives as a notification
  rather than as a customer.

**Done when** a backup from the live host has been restored at least once, and
a code update applied without data loss.

---

## F · The final QA gate — mine, then your sign-off

The Stage 16 audit was run against a system with no backend. Re-run here
against the deployed one; each of its six blockers closed with evidence or
restated with a named reason, never quietly dropped.

Walked on the live host:

- All five approved statuses — جديد، قيد المراجعة، مؤكد، مكتمل، ملغي — end to
  end, including the transitions the log records.
- Every role preset, verified by calling endpoints directly rather than by
  what the interface shows. Frontend restrictions are not the security layer.
- A public request submitted through the real form, landing in الطلبات with
  the right source.
- A content change published from المحتوى and confirmed live, byte-compared to
  prove nothing else moved.
- Error responses re-read for leakage: no SQL, no stack traces, no internal
  paths, no credentials.
- Terminology across every page and API response: ذوي الاحتياجات الخاصة, and
  nothing else.

**Done when** nothing on the audit list is open, or each remaining item carries
a written reason and an explicit decision to accept it.

---

## Standing rules

- Each stage lands as its own commit on the branch, with a written report.
- I stop and ask exactly twice: the password-reset channel in C, and
  confirmation before HSTS goes on in C. Both are decisions, not
  implementation details.
- No redesign of the public site, no change to the brand identity, no change
  to approved content. No new roles, no new request statuses beyond the
  approved five.
- No invented metrics, no fabricated content, no placeholder testimonials or
  customers. An empty state stays empty.
- Anything I cannot measure from here is reported as unverified, not as done.
- ذوي الاحتياجات الخاصة is the only approved wording, in code, in content and
  in every report.
