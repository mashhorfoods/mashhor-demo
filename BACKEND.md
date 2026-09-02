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
- ~~**`services`, `media` and `settings` still render seeded data in the
  browser.**~~ Closed — see *The last three modules on their endpoints* below.
  Every admin module now reads and writes through the API.
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

---

# RECOVERY 03 — التقارير

Reports, built from the approved specification rather than from what a
transport company "normally" reports.

## The specification, found not assumed

§03 says to inspect the approved specification before implementing anything.
It is `admin/stage-02-admin-ux.html`, module 08, and it is precise:

> **Scope** — "Basic request and customer counts over a period"
> **Main flow** — Pick a report and a period → read the answer in words, then
> the breakdown → open any figure as a filtered request list.
> **Primary** — Select report · select period.
> **Secondary** — Drill into the requests behind a figure · change the period
> without losing the report.
> **States** — Loading · error with retry · an empty period that offers a wider
> one instead of a row of zeroes.
> **Exit** — Drilling out goes to طلبات النقل; returning comes back to the same
> report and period.
> **Access** — Super Admin · Admin.
> **Patterns** — P01 list, P02 search & filter, P09 states, P10 return.

That is the whole scope, and it is the whole implementation.

**Two reports**, because "request and customer counts" names two:
`طلبات النقل خلال الفترة` and `العملاء خلال الفترة`. Asking for a third
returns 404.

## What is deliberately absent

| Not built | Why |
| --- | --- |
| **Export** | §18 — only if explicitly approved. The specification names none. |
| **Charts** | §16 — only where part of the approved specification. It names none. The share bars beside each count are a second reading of a number that is always printed, which is the dashboard's own existing treatment. |
| **Rates, averages, trends, forecasts** | §29 lists them by name. None appears in the specification, and the existence of the data is not approval. |
| **A reporting table** | §02 — every figure is a `COUNT` over the live operational rows. The suite asserts no table containing `report`, `metric`, `analytic`, `aggregate` or `snapshot` exists. |

## The date basis is chosen, not assumed

A request carries two dates: `created_at`, when it was logged, and `trip_date`,
when the trip is. The specification says only "a period". Picking one silently
would be exactly the undocumented assumption §12 forbids, so the basis is a
labelled control — **تاريخ تسجيل الطلب** or **تاريخ الرحلة** — and the answer
line always names which one it used.

Ranges are validated rather than repaired: an end before a start is an error,
not something to quietly swap. A same-day range is valid. A span beyond ten
years is refused.

## Read-only, structurally

`Repo_Reports` has no `INSERT`, `UPDATE` or `DELETE`, and every statement it
runs passes `assertReadOnly()` first — a report that tried to write would throw
rather than succeed. The route table exposes `GET /api/admin/reports` and
nothing else; there is no POST to a reporting endpoint at all.

§27 says reading a report must not generate activity noise, so it writes no
activity rows either. The suite runs sixteen reports and asserts that the
request count, the customer count, the service count, the exact status
sequence and the activity-log count are all unchanged.

## Drilling out and back

"Open any figure as a filtered request list" is a real link. Every non-zero
figure and every breakdown row links to `requests.html` carrying the period as
`from`/`to`, the basis as `dateby`, and the status or service it represents.
`requests.html` gained that range filter in this stage — it is how the list
shows exactly the records behind the figure, which is also how §12's accuracy
requirement is checkable by clicking.

The report and the period live in the address, so the browser's own Back button
returns to the same report and the same period, which is what P10 asks for.

## Data minimisation

The customer report shows a name, a request count and a date. No phone number,
no email, no origin, no destination. The suite greps the response for a Saudi
mobile pattern, for `@aunaldrb.com`, and for a known trip origin, and asserts a
customer row carries exactly `id`, `name`, `count`, `lastAt`.

## Verified

**241 checks, 0 failed** — 57 new. Every figure is reproduced from a direct
`COUNT` against the records; the breakdowns are asserted to sum to the total;
the all-time report is asserted to equal the dashboard's own counts and the
requests module's own status counts. A Content Manager gets 403, an
unauthenticated caller gets 401, and adding parameters does not widen either.

## Still not done

- **No English.** Reports render Arabic labels over data stored in Arabic;
  §22's LTR half has nothing to show until the system has English content.
- **Aggregation is per request.** At the current data volume that is correct
  and simple. If the request table grows into six figures, the status and
  service breakdowns are the queries to look at first — they are already
  indexed on `status` and `created_at`.
- **The customer report paginates at ten rows** and has no search. The
  specification's P02 covers the report's own filters; a searchable customer
  list already exists in العملاء.

---

# The last three modules on their endpoints

`الخدمات`, `الوسائط والأصول` and `الإعدادات` were the three pages still
rendering literal data in the browser after RECOVERY 03. They now read and
write through the API like every other module. Three gaps had to be closed
first.

## Services: the endpoint could not do what the page could

`POST /api/admin/services/save` accepted a title, a description and a
published flag. The page also offers reordering and image replacement, so the
endpoint gained `order` and `image`, and `POST /api/admin/services/reorder`
was added under the same `services:edit` permission.

Two things moved to the server with them:

- **The terminology guard.** `الخدمات` has always refused
  `ذوي الإعاقة`, `معاق` and their variants in the browser. That refusal is now
  also in the endpoint, so it holds against a direct API call — which is the
  only place it was ever going to matter.
- **Template synchronisation.** The public page renders services from the
  RECOVERY 02 publishing template. `updateService()` and `reorderServices()`
  keep that template in step, so hiding or reordering a service through
  `الخدمات` reaches the site on the next publish. Verified: hide one, publish,
  and the page carries six services renumbered 01–06; restore, and the
  approved seven come back in order with the file byte-identical.

An `order` given to `save` re-sequences the whole set rather than writing one
number, so two services can never share a position.

## Media: usage is computed, not described

The literal `ASSETS` array carried a hand-written `u:` list per asset —
`["ترويسة الموقع","التذييل"]` for the logo, and so on. Those were descriptions,
and two of them were already wrong: the header logo is a base64 data URI in
the source page, so the file was not referenced at all.

`GET /api/admin/media` now computes usage from the published page, the way
Stage 12 said it should be:

- `src`, `href`, `content`, `srcset` and JSON-LD strings are all scanned.
- An absolute URL resolves to the same file as a relative one.
- A responsive variant counts towards its master — but only when the master
  actually exists, because `brand/favicon-32.png` is a master whose name merely
  looks like a variant.
- HTML comments are blanked first (preserving offsets), so a commented-out
  `<img>` is not a use.
- The section an asset belongs to is the nearest preceding `<h2>`, so the
  answer stays true when a section moves.

The answer legitimately differs between the source page and the built one:
`build.js` externalises the inlined logos, so the logo SVGs are unused in
source and used in `dist/`. Whichever page is deployed is the one measured.

## Settings: types had to survive the round trip

A settings value can be a boolean (`siteLive`), a select index (`tz`) or a
string that looks numeric (`sess: "60"`). A `TEXT` column flattens all three.
Each value is therefore stored JSON-encoded and decoded on read, so what the
interface saved is exactly what it loads — and `"60"` survives as a string,
which a numeric cast would not.

The real company values were seeded from the module's own former defaults;
`bin/seed-content.php` writes them once and never overwrites an edited value.

## Verified

**293 checks, 0 failed** — 52 new. Among them: a prohibited term refused by the
endpoint in both the title and the description with the record unchanged; a
path-traversal image reference refused; a hidden service leaving the public
page and coming back; no two services sharing a position after a reorder;
usage computed rather than stored, with a `used_in` column asserted not to
exist; each of the three value types round-tripping; a saved field not
disturbing its siblings; and a grep asserting that none of the three pages
still contains a literal dataset.
