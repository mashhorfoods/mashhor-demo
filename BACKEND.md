# عون الدرب — backend

RECOVERY 01. What the system runs on, how to deploy it, and what it still is not.

---

## What was here before

Nothing. The inspection §01 asks for found no runtime, no database, no
authentication, no sessions, no authorization and no `/api/requests`. The
public form posted to an endpoint that did not exist; the admin pages were
static HTML anyone with the URL could read; every module's data was a literal
array in its own `<script>`. Two prior QA gates had already recorded this
(`admin/FINAL-QA.md`), so none of it was a surprise — it is the reason this
stage exists.

Nothing was replaced, because there was nothing to replace.

## Why PHP and MySQL

The deployment this project actually has is documented in `HOSTINGER.md`: a zip
extracted into `public_html` on Hostinger shared hosting, served by LiteSpeed.
That environment runs PHP and MySQL natively and does not run Node. §33 is
explicit — *do not introduce infrastructure that cannot realistically run in
the existing hosting environment* — so the backend is PHP 8 with PDO and
MySQL, and it ships inside the same zip as the site.

A Node backend would have meant a Hostinger VPS or their separate Node.js
product: a different plan, a different deployment, and a process manager to
keep alive. That is a real option, but it is a change of hosting, not a
backend recovery, and it would have made `HOSTINGER.md` wrong.

## Shape

```
public_html/
  index.html            the public site, unchanged
  api/index.php         the only entry point for /api/*
  api/.htaccess         routes every /api/* URL to it
  admin/guard.php       checks the session, then streams the page
  admin/.htaccess       routes every admin page through the guard
  admin/*.html          the modules, unchanged in appearance
  admin/app.js          one API client, shared by every page
  app/                  the application — denied to the web, twice over
  bin/migrate.php       schema
  bin/seed.php          approved services, media index, first administrator
```

`app/` sits under the document root only because the deployment is one zip.
It carries its own `Require all denied`, the root `.htaccess` adds
`RedirectMatch 404 ^/(app|bin)/`, and every file in it begins with a guard on
`AUN_APP` so a host that honoured neither would still return nothing.

Request path:

```
browser → api/index.php → Routes::dispatch
                            ├─ CSRF (state-changing methods)
                            ├─ Auth  (session → user)
                            ├─ Authz (role → module/ability)
                            └─ handler → Repo_* → PDO → MySQL
```

Authorization is checked by the dispatcher from the route table, not by each
handler, so a handler cannot forget what it never had to remember.

## Configuration

Copy `.env.example` to `.env` and fill it in. **Preferred location is one level
above `public_html`** — `/home/<user>/.env` — which the application checks
first; a host that mis-serves dotfiles cannot reach what is not under the
document root. `public_html/app/.env` works as a fallback and is denied to the
web, but it is the weaker of the two.

Generate `APP_KEY` with:

```sh
php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
```

No credential appears anywhere in this repository, in any response, or in any
log. `GET /api/health` reports which variables are *set* — never their values.

## First run

```sh
php bin/migrate.php                 # creates 17 tables; safe to re-run
php bin/seed.php \
    --admin-email=you@aunaldrb.com \
    --admin-name="اسمك"             # prints a generated password once
php bin/migrate.php --status        # verifies the schema
```

`seed.php` loads the seven approved services with their approved copy and
indexes the eighteen media assets the site references. It invents nothing.

## Data model

Seventeen tables. The ones that carry the business:

| Table | Holds |
| --- | --- |
| `users` | administrator accounts, `password_hash` only, never plaintext |
| `sessions` | one row per live session, token stored hashed |
| `guest_sessions` | CSRF tokens for the public form, no identity, no privileges |
| `customers` | one row per phone number — the identity the العملاء module already used |
| `requests` | `REQ-YYYY-NNNN`, five approved statuses, three sources |
| `request_status_history` | every transition, with who and when |
| `request_notes` | operator notes, with author |
| `id_sequences` | the reference counter, allocated under a row lock |
| `request_submissions` | fingerprints, for duplicate detection |
| `activity_log` | append-only; written on every mutation |
| `notifications` / `notification_reads` | per-account read state |

The five statuses and three roles are fixed sets in `Schema.php`, not lookup
tables — §35 forbids a sixth status and a fourth role, and a table would
invite one.

## Security

| Concern | How |
| --- | --- |
| Passwords | Argon2id (bcrypt fallback), rehashed on login when the cost moves |
| Sessions | database rows, token hashed; logout revokes server-side |
| Cookies | `HttpOnly`, `Secure`, `SameSite=Lax`, idle and absolute expiry |
| CSRF | double-submit against a hashed token, `hash_equals` |
| Authorization | route table + `Authz::require()`, mirroring the approved matrix |
| Admin pages | `guard.php` checks before reading the file — nothing leaks then redirects |
| SQL | prepared statements throughout; no string interpolation anywhere |
| Public endpoint | honeypot, per-IP rate limit, fingerprint deduplication |
| Errors | one generic body; the detail goes to the log |
| Logs | redacted — no password, token, secret or full phone number |

Two guards exist only on the server, because no frontend can enforce them: an
operator cannot raise their own role, and the last active Super Admin cannot
be removed or disabled.

## Verification

```sh
php -S 127.0.0.1:8088 -t . router-dev.php   # or deploy and point at the host
php bin/verify.php http://127.0.0.1:8088
```

108 checks, executed against real HTTP endpoints and a real database: the §30
authentication matrix, the §31 request matrix, the §32 persistence checks, and
the disclosure probes. It asserts on what landed in the tables, not on what the
endpoint claimed.

## What this is not

- **The admin is not a multi-tenant system.** Roles gate modules, not rows.
- **`المحتوى` and `التقارير` still do not exist.** Their permissions do.
- **`services`, `media` and `settings` still render seeded data in the
  browser.** Their read and write endpoints exist and are protected; the pages
  have not been switched over. `requests`, `customers`, `users`, `activity` and
  notifications are live.
- **There is no email or SMS.** The settings page has always said so.
- **Rate limiting is per IP.** Behind a shared NAT that is a shared budget.

---

# RECOVERY 02 — المحتوى

Content management, and the mechanism that makes editing it reach the public
site.

## What the inspection found

The module did not exist. `admin/dashboard.html` had a nav item marked
*قيد الإنشاء* and a quick action pointing at `#`; there was no content page, no
content table, and no way for anything typed in the dashboard to reach the
published page.

Three things the brief names do not exist on the public site either, and the
site's own structured-data comments say so:

| §02 area | On the public site |
| --- | --- |
| من نحن | `#about` — a label, a title, a lead and three paragraphs |
| ما يميزنا | `#why-us` — four headings and **six** ordered items |
| الخدمات | `#services` — two headings and **seven** approved services |
| الأسئلة الشائعة | **no section exists** |
| آراء العملاء | **no section exists** |
| معلومات التواصل | `#contact` — eleven fields |

There is also **no English copy anywhere** — `index.html` is `lang="ar"` and
carries one language. §11's rule is implemented in the schema and enforced by
the primary key; there is simply nothing on the other side of it yet, and §05
forbids inventing any.

## How editing reaches a static page

The public site is one static HTML file, which is why it scores what it
scores, and §33 forbids redesigning it. So the module does not turn
`index.html` into a template rendered per request, and it does not hydrate the
page from an API on load. **It rewrites the file.**

Every editable region is wrapped in a pair of HTML comments:

```html
<!--aun:about.lead-->…the approved copy…<!--/aun:about.lead-->
```

25 pairs, about 1.2KB, invisible, nothing in the accessibility tree.
`build.js` keeps them while stripping every other comment. Publishing replaces
what lies between one pair and reads nothing outside it, which is what §20
asks for: editing the About lead cannot disturb a service, a FAQ or the
contact address.

The write is atomic — a temporary file beside the target, then a rename — so a
failure halfway through leaves the previous page intact rather than a
half-written one.

**Saving and publishing are separate buttons.** Saving stores; publishing puts
it live. An administrator can draft several edits and make them public in one
deliberate act, and a save that fails never claims otherwise.

### Round-trip proof

Seeding from `index.html` and publishing straight back reproduces the file
**byte for byte**. That is the check that says the mechanism is lossless, and
`bin/verify.php` runs it.

## What can be edited, and what cannot

| Area | Text | Order | Active/inactive | Add | Publishes to the site |
| --- | --- | --- | --- | --- | --- |
| من نحن | 6 fields | — | — | — | yes |
| ما يميزنا | 4 fields + 6 records | yes | yes | **no** | yes |
| الخدمات | 2 fields + 7 records | yes | yes | **no** | yes |
| الأسئلة الشائعة | records | yes | yes | yes | **no section exists** |
| آراء العملاء | records | yes | yes | yes | **no section exists** |
| معلومات التواصل | 11 fields | — | — | — | yes |

The six features and seven services are approved content: §06 and §07 forbid
inventing an eighth, so `POST /api/admin/content/item/new` returns **409** for
those collections. The FAQ and the testimonials are empty and are the
administrator's to fill — the module seeds nothing into them, because §08, §09
and §26 all forbid fabricating content to fill an empty state.

Deactivating never deletes. A hidden feature comes off the public page and
stays in the table, and the remaining items are renumbered so the page's own
scroll script still has a coherent sequence.

## Three regions carry markup

The phone number is built from `&nbsp;` runs, the address has a `<br>`, and the
closing sentence has a `<span class="contact__aside-tag">`. Escaping them would
rewrite approved content. They go through an **allow-list** instead — `<br>`,
`<b>`, `<strong>`, `<em>`, and a `<span>` carrying nothing but a class — with
unbalanced closes dropped so a rejected tag cannot close one the page opened.
Everything else is escaped. A `<script>`, an `onclick=` or a `javascript:` URL
cannot survive any of the twenty-three fields, and the suite proves it by
storing one and reading the published page back.

## Reused, not rebuilt

- **Services** stay in the `services` table from RECOVERY 01. `content_items`
  holds only their publishing template, keyed by the slug both share.
- **Media** comes from `GET /api/admin/media` — the picker lists what the
  الوسائط module already indexes. This module does not upload, store or index
  a single asset (§18).
- **Activity** goes to the existing `activity_log` with module `content`, and
  the actor is the signed-in account (§32).
- **Permissions** are the existing `content` module in the approved matrix:
  Super Admin and Content Manager have it, an Admin has it unless narrowed.
  The suite signs in as a Content Manager and confirms they can edit content
  and still cannot read requests.

## Still not done

- **The FAQ and the testimonials have nowhere public to go.** Adding sections
  for them would be adding unapproved sections, which §33 forbids. The editors
  work and the records persist; the module says so on the page rather than
  implying a publish that cannot happen.
- **English is empty.** The separation works — the suite stores an English
  title, confirms the Arabic one is untouched, and confirms publishing writes
  Arabic — but there is no approved English copy to load.
- **Service ordering publishes; the showcase is a pinned-scroll component.**
  Reordering regenerates the slides with recomputed indices. It is verified to
  render, but a heavily reordered showcase is worth a look on a real device.
- **Publishing needs write access to `index.html`.** On Hostinger the PHP user
  owns `public_html`, so it works; `/api/admin/content` reports it as
  `writable`, and the publish button is disabled with an explanation when it
  is not.
