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
