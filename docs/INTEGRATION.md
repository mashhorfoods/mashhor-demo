# Integration guide — Stages 12.1 → 12.2

How the customer account talks to real services, what the backend provides,
how it is deployed, and what is and is not connected today.

**Status: STAGE 12.2 — PARTIALLY COMPLETE.** Stage 12.1 implemented every
integration behind a documented contract. Stage 12.2 adds the **real,
deployable backend** (`backend/`) that implements that contract with server
sessions, CSRF, the customer boundary, private storage with signed URLs,
payment history, notifications, the legal seam, rate limiting, scrubbed
logging and a gated deployment process — and verifies the unchanged browser
suite against it (`npm run test:backend`, 518 checks) plus a backend
security suite (`tests/backend.mjs`, 38 checks). **Nothing external is
connected**: no backend is deployed at a public https origin, no hosted
identity provider, S3 storage, email/SMS provider, flight supplier, payment
provider or official legal text exists for this repository. The registry
reads CONNECTED only when a deployment records it (§10); today it reads NOT
CONNECTED, and a production build never falls back to development data.

## 1. Architecture

```
UI (assets/js/account/ui/*)          screens, states, forms — know nothing of providers
  ↓
Account domain (auth.js, customer.js, legal.js)   session marker, facade, error codes
  ↓
Adapter interface                    the method names and shapes customer.js documents
  ↓
Installed adapter (adapters/installed.js, chosen by data/env.js)
  ├─ session-api-auth.js + api-customer.js + api-legal.js   → the customer backend (HTTPS, cookie sessions)
  ├─ dev-auth.js + dev-customer.js                           → this browser only (never in production)
  └─ not-connected.js                                        → production without a backend: every call fails safely
  ↓
backend/ (Node 22, no dependencies)  the ONE origin the browser talks to: API_BASE_URL
  ├─ identity.mjs   accounts, sessions, lockout, reset      — hosted IdP: documented seam, NOT CONNECTED
  ├─ storage.mjs    private files + HMAC signed URLs        — local; S3 seam, NOT CONNECTED
  ├─ mailer.mjs     outbox (queued, never "sent")           — provider NOT CONNECTED
  ├─ legal.mjs      official documents from a directory     — texts NOT SUPPLIED
  ├─ routes.mjs     /auth /me /legal /files /diagnostics
  └─ SQLite (node:sqlite, WAL, migrations)
```

The browser talks to **one** origin. The backend holds every secret,
resolves the customer from its cookie and answers only from that
customer's records. Nothing provider-specific reaches the browser.

**Production backend URL:** none deployed. `API_BASE_URL` is empty in the
committed configuration; the site on GitHub Pages runs the development
adapters (labelled on screen) because it is a development environment
build. A deployment sets the URL through the process in §10.

## 2. Environment and configuration

### 2.1 Site (public, generated)

Public configuration is one file, `assets/js/data/env.js`, generated at
deploy time by `node tools/write-env.mjs` from these variables
(`.env.example` documents them; `.env` files are git-ignored):

| Variable | Browser field | Meaning |
| --- | --- | --- |
| `NO_ENVIRONMENT` | `environment` | `development` · `staging` · `production` |
| `AUTH_PROVIDER` | `authProvider` | `dev` (never in production) · `session-api` |
| `AUTH_PUBLIC_CONFIG` | `authPublicConfig` | browser-safe identity settings only, e.g. `{"sessionRefreshMinutes":10}` |
| `API_BASE_URL` | `apiBaseUrl` | the backend origin (+ path); https in production |
| `DOCUMENT_SERVICE_CONFIG` | `documentService` | `{ maxBytes, accept[] }` — the backend enforces the same |
| `PAYMENT_API_CONFIG` | `paymentApi` | `{ pageSize }` |
| `NOTIFICATION_CONFIG` | `notifications` | `{ refreshOnFocus, refreshMinSeconds }` |
| `LEGAL_DOCUMENT_CONFIG` | `legal` | `{ source: "api" }` · `{ source: "static", termsPath, privacyPath }` · `{ source: null }` |
| `DIAGNOSTICS_CONFIG` | `diagnostics` | `{ endpoint }` on the same backend, or null |
| `INTEGRATIONS_VERIFIED` | `verified` | written by `tools/deploy.mjs` only (`--verified-by-deploy`); ignored with a warning otherwise |

Everything in `env.js` ships to every visitor: **no private key, service-role
key, database or storage credential, payment secret or signing secret is
ever configured here**. The generator refuses a production file that uses
the development adapter, lacks an https backend, or contains a value that
looks like a secret (verified in `tests/backend.mjs`).

### 2.2 Backend (private, server only)

`backend/.env.example` lists every `BACKEND_*` variable with its meaning.
`backend/config.mjs` refuses to start (exit 78, reasons printed) when
production is configured with: no `BACKEND_SIGNING_SECRET` (32+ chars), an
`http` or `*` allowed origin, no `BACKEND_PUBLIC_URL`, insecure cookies,
test controls on, or a storage/mailer value that is not implemented.
Secrets exist only in the server's environment or its platform secret store;
`backend/.env` and `backend/data/` are git-ignored; the container image
(`backend/Dockerfile`) contains no secrets.

## 3. Backend contract

All routes relative to `API_BASE_URL`. JSON in and out; errors as
`{ "error": { "code": "…" } }` with the HTTP status. Codes the browser maps:
401 unauthenticated · 403 forbidden · 404 notFound · 409 conflict/exists ·
410 expired/invalidToken · 413 tooLarge · 415 unsupported · 422 invalid/weak ·
429 rateLimited (with `Retry-After`) · 5xx unavailable.

**Sessions.** The backend sets `no_session` (HttpOnly, Secure in
production, SameSite=Lax by default) on sign-in / sign-up and reads it on
every call. It also sets `no_csrf` (readable); the browser echoes it in
`X-CSRF-Token` on every POST/PATCH/DELETE (double-submit). The browser keeps
only a marker, never a credential. `GET /auth/session` is the authority.

| Method · path | Body | Answer |
| --- | --- | --- |
| `POST /auth/sign-up` | `{ name, email, phone, password, locale, attribution: { supervisorId, source } \| null, acceptance: { terms: { version, effectiveAt }, privacy: {…}, locale } \| null }` | 201 `{ customer, expiresAt }` + cookies · 409 exists · 422 weak/invalid |
| `POST /auth/sign-in` | `{ email, password }` | 200 `{ customer, expiresAt }` + cookies · 401 invalid (same answer for unknown and wrong) · 429 after lockout |
| `GET /auth/session` | — | 200 `{ customer, expiresAt }` · 401 |
| `POST /auth/refresh` | `{}` | 200 `{ customer, expiresAt }` + new cookies · 401 |
| `POST /auth/sign-out` | `{}` | 204 + cleared cookies |
| `POST /auth/password/reset-request` | `{ email }` | 202 always (never reveals whether the address exists); the link is queued for delivery |
| `POST /auth/password/reset` | `{ token, password }` | 204 (ends other sessions) · 410 invalidToken · 422 weak |
| `POST /auth/password/change` | `{ current, next }` | 204 · 422 invalid/weak |
| `GET /me` · `PATCH /me` | `{ name, phone, locale }` | `{ customer }` — email and attribution never change here |
| `GET /me/trips` · `GET /me/trips/:id` | — | `{ trips }` · `{ trip, bookings, documents, payments }` · 404 when not this customer's |
| `GET /me/bookings` · `GET /me/bookings/:id` | — | `{ bookings }` · `{ booking, trip, documents, payments }` |
| `POST /me/bookings/claim` | the Stage 11 journey record | 201 `{ booking }`; idempotent by reference; 409 when another customer holds it; sets the customer's attribution once |
| `GET/POST /me/travellers` · `PATCH/DELETE /me/travellers/:id` | traveller fields | `{ travellers }` · `{ traveller }` · 204 |
| `GET /me/documents` | — | `{ documents: [{ id, bookingId, tripId, type, kind, status, issuedAt, title, size, contentType, deletable, booking?, trip? }] }` |
| `POST /me/documents` | multipart `file`, `title`, `type` | 201 `{ document }` · 413 · 415 (declared type AND magic bytes) |
| `GET /me/documents/:id/url` | — | `{ url, expiresAt }` — a short-lived signed URL · 404 |
| `DELETE /me/documents/:id` | — | 204 (file removed, issued links revoked) · 403 when not deletable |
| `GET /files/:id?exp&sig` | — | the bytes · 403 forged · 410 expired · 404 revoked/deleted |
| `GET /me/payments?page=&pageSize=` | — | `{ items: [{ id, bookingId, at, amount, currency, status, reference, methodAr/En, booking? }], page, pageSize, total, nextPage }` |
| `GET /me/notifications` · `POST /me/notifications/read` | `{ ids }` or `{ all: true }` | `{ notifications }` |
| `POST /me/legal/acceptance` | `{ terms: { version }, privacy: { version }, locale }` | 204 |
| `GET /legal/terms?locale=` · `GET /legal/privacy?locale=` | — | `{ version, effectiveAt, title, html }` · 404 when not published |
| `POST /diagnostics` | a scrubbed event | 204 (stored scrubbed; sensitive keys dropped) |
| `GET /health` | — | `{ ok, environment, version, storage, mailer, testControls }` |

`customer` is `{ id, name, email, phone, locale, image, supervisorId, attribution: { supervisorId, source, at }, acceptance, createdAt }`.
Both the contract test server (`tests/contract-server.mjs`) and the real
backend implement every row; `tests/integration.mjs` runs unchanged
against either (`BACKEND_ORIGIN` selects the real one).

## 4. Authentication and session architecture

**Identity.** Accounts are backend-managed: scrypt-hashed passwords with a
per-account salt, constant-time comparison, one neutral message for unknown
address and wrong password, lockout after `BACKEND_LOCKOUT_ATTEMPTS`
failures per address and per client within `BACKEND_LOCKOUT_MINUTES`
(answered 429 with `Retry-After`), minimum length `BACKEND_PASSWORD_MIN_LENGTH`.
Reset: `reset-request` always answers 202 and queues a single-use token
(`BACKEND_RESET_TTL_MINUTES`); `reset` consumes it once and ends every other
session. A **hosted identity provider** would replace `createIdentity` /
`verifyPassword` / `createReset` in `backend/identity.mjs` with calls to the
provider and keep everything else (sessions, cookies, boundary) as is. It is
NOT CONNECTED; choosing it, and its MFA / breach-check settings, needs a
business decision (§13).

**Sessions.** Server-side rows (`sessions` table: random id, csrf token,
expiry). Cookies: `no_session` HttpOnly + `no_csrf` readable, both with
`Secure` (required in production), `SameSite` (`Lax` default; `None`
only with `Secure`), optional `Domain`. TTL `BACKEND_SESSION_TTL_HOURS`;
`POST /auth/refresh` rotates the session when the browser sees it near
expiry (`sessionRefreshMinutes`). Expired sessions are swept every ten
minutes; sign-out deletes the row and clears both cookies; a revoked
session answers 401 on the next call and the browser shows "session
expired" with a return path (verified in the browser against the real
backend: expiry, revocation mid-page, refresh, network loss while verifying).

**CSRF.** Double-submit: every POST/PATCH/DELETE with a live session must
carry `X-CSRF-Token` equal to the session's token; missing, wrong, another
session's, or a token with an expired session → 403 / 401 (all five cases in
`tests/backend.mjs`). A forged cross-origin request cannot read `no_csrf`
and is refused by CORS before the route (§5).

## 5. CORS, headers, rate limiting

- **CORS:** `BACKEND_ALLOWED_ORIGINS` is an exact list (never `*`, https in
  production). A listed origin gets `Access-Control-Allow-Origin: <origin>`,
  `Allow-Credentials: true`, the allowed methods and headers; any other
  `Origin` gets 403 and no CORS headers (preflight included).
- **Headers:** `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  no-referrer`, `X-Frame-Options: DENY` (except `/files/*`, which carries
  `Content-Security-Policy: frame-ancestors <allowed origins>` so the site's
  document viewer may frame a signed file and nobody else may), HSTS when
  cookies are Secure. Bodies are capped (413 with `Connection: close`).
- **Rate limiting:** fixed windows per client ip and class — `auth`
  (`BACKEND_RATE_AUTH`/min), `upload` (`BACKEND_RATE_UPLOAD`/min), `api`
  (`BACKEND_RATE_API`/min) — answered 429 with `Retry-After`, which the
  browser turns into its "try again in a moment" state. `BACKEND_TRUST_PROXY=1`
  reads `X-Forwarded-For` behind a trusted proxy. An edge/WAF layer is the
  hosting platform's (§13).

## 6. Customer authorization model (the boundary)

The backend resolves the customer **only** from its session cookie; every
`/me/*` query is scoped by that customer id in SQL. A foreign id in the
URL, query or payload is a 404 (trips, bookings, travellers, documents,
document links); claiming a booking reference another customer holds is a
409; `PATCH /me` cannot change email, id or attribution; the browser never
sends a customer id and the `localStorage` marker carries none. Verified
with two seeded customers (Alpha and Beta) through URL substitution, id
substitution, payload substitution and client-state manipulation, in the
browser suite and in `tests/backend.mjs`. Frontend guards are UX only.

## 7. Document storage and signed URLs

Upload: multipart `POST /me/documents` → size cap (413) → declared type in
`BACKEND_UPLOAD_TYPES` **and** matching magic bytes (415) → filename
sanitised (path separators, reserved and control characters, `..` removed;
the stored key is random, never the name) → written under
`BACKEND_STORAGE_DIR` with mode 0600, outside any web root → metadata row
for this customer. Retrieval: `GET /me/documents/:id/url` (owner only) →
`/files/:id?exp=<ms>&sig=<hmac-sha256(id:exp, BACKEND_SIGNING_SECRET)>`
valid `BACKEND_SIGNED_URL_TTL_SECONDS` (300 by default) → served with
`Content-Disposition: inline`, `nosniff`, `no-store`; forged signature 403,
expired 410 (the viewer offers a new link), deleted or revoked 404 even
for a link issued earlier. Delete removes the file and the row.
**Virus/malware scanning** is not performed here: it is an infrastructure
step (a scanner on the storage volume or bucket, quarantining before the
row becomes available) that is documented, not claimed. **S3-compatible
storage** shares the `put/get/remove` interface in `storage.mjs`; setting
`BACKEND_STORAGE=s3` is refused until it is implemented and tested.

## 8. Payment history, notifications, legal, attribution

**Payments:** `GET /me/payments` paged from the `payments` table (the
payment layer's records: status, amount, currency, reference, method
label). No card data exists in the schema; no payment is processed here.
The browser's paging, loading, empty, retry, 429, 5xx and network states
are verified against the real backend.

**Notifications:** `GET /me/notifications` + `POST /me/notifications/read`
(one or all), scoped to the customer; the browser refreshes quietly on
focus, throttled, never polling. Delivery channels (email/SMS push of a
notification) go through the mailer outbox and are NOT CONNECTED.

**Legal:** `GET /legal/terms|privacy?locale=` serve the business's official
files from `BACKEND_LEGAL_DIR` (`backend/legal/README.md` gives the file
names and `meta.json`), otherwise 404 → the pages show "not published" and
sign-up omits the acceptance checkbox. Acceptance versions are recorded on
the customer at sign-up or through `POST /me/legal/acceptance`. **No legal
wording exists in this repository.**

**Supervisor attribution:** carried from the Stage 10/11 link or journey
record, validated against the `supervisors` table (`BACKEND_SUPERVISORS`),
stored once per customer at sign-up or first claim, never editable from the
browser (`PATCH /me` ignores it), returned read-only. No commission logic
exists anywhere (Stage 13).

**Booking continuity:** a booking made as a guest, claimed after sign-in
or sign-up, stays attached to that customer and keeps its attribution
(verified end to end).

## 9. Failure handling and observability

Every screen: loading, success, empty, error with retry, session expired,
unauthorised, forbidden, not found, rate limited, network, timeout,
service unavailable, not connected. `core/diagnostics.js` beacons scrubbed
events to `POST /diagnostics`; the backend drops sensitive keys again
(`logger.mjs` SENSITIVE list: passwords, tokens, cookies, card, passport,
email, phone, name, address, bodies) before storing, and its own logs are
structured JSON lines with the same scrubbing — verified in
`tests/backend.mjs` (a beacon carrying a token and card number is stored
without them). Internals never leave the process: unexpected errors are
`500 { code: "unavailable" }`.

## 10. Deployment process

`node tools/deploy.mjs --plan` prints the steps; `npm run deploy` runs them
and stops on the first failure. Nothing is marked CONNECTED before step 7.

1. Validate the public variables (`tools/write-env.mjs` rules: no dev
   adapter, https backend, no secret-looking value).
2. Write `env.js` **without** verified marks.
3. Backend: `npm run check` and `npm run migrate` (when `BACKEND_DEPLOY=local`);
   otherwise the backend is deployed by its own pipeline from
   `backend/Dockerfile` with `BACKEND_*` in the platform's secret store, a
   persistent volume for the database and documents, and TLS at the edge.
4. Services: storage, identity, delivery and legal are whatever the backend
   configuration says; anything not configured stays NOT CONNECTED.
5. `npm run smoke` (`SITE_URL`, `API_BASE_URL`): health, production mode,
   no test controls, the site's env.js points at this backend with the
   production adapters and no secrets, CORS allow/refuse, 401s, HTTPS, HSTS,
   legal 200-with-version or honest 404, signed files refuse unsigned access.
6. `npm run test:backend` with `BACKEND_ORIGIN=$STAGING_BACKEND_ORIGIN`: the
   full browser integration suite (518 checks, six widths, both languages)
   against a **staging** backend with test controls on (production refuses
   them, so acceptance never runs against production data). The suite
   serves the site itself; `SITE_PORT` pins its origin so the staging
   backend can list `http://127.0.0.1:<SITE_PORT>` in `BACKEND_ALLOWED_ORIGINS`.
7. Only then `tools/write-env.mjs --verified-by-deploy` with
   `INTEGRATIONS_VERIFIED={at, backend, adapters}` → `ENV.verified` →
   `installed.js` reports `CONNECTED — verified <date> against <backend>`.
   Publish the static files (the generated `env.js` is build output, never
   committed).

**Rollback:** the site is static — republish the previous build (the
previous `env.js` included). The backend is one container image — redeploy
the previous tag; migrations are additive (`schema_migrations` records
them) and no migration so far drops or rewrites data. Rotating
`BACKEND_SIGNING_SECRET` invalidates issued document links only; the
browser's "expired link → new link" state covers it.

**Local verification today:** `npm run test:backend` (starts the real
backend on a temporary database) and `npm test` (includes `tests/backend.mjs`).

## 11. Testing

| Suite | Target | Checks |
| --- | --- | --- |
| `tests/integration.mjs` (in `npm test`) | contract test server | 518 |
| `npm run test:backend` → the same suite | **real backend** (`backend/`) | 518 |
| `tests/backend.mjs` (in `npm test`) | real backend over HTTP: config refusals, CORS, CSRF ×5, lockout, rate limit, upload validation, signed URL forgery/expiry/revocation, boundary, diagnostics scrubbing, write-env refusals | 38 |
| `tests/account.mjs`, `tests/journey.mjs` | account and booking screens | 782, 512 |

## 12. Security notes

- Secrets: none in the repository, the browser, URLs or documentation; the
  site's config generator and the smoke test both check for secret-looking
  values; `.gitignore` excludes `.env*`, `backend/.env`, `backend/data/`.
- Sessions HttpOnly + Secure + SameSite; CSRF double-submit; exact-origin
  CORS with credentials; security headers; HSTS.
- Boundary enforced in SQL per request; ids from the browser are never
  trusted; supervisor attribution backend-authoritative.
- Uploads validated by size, declared type and content; random keys;
  private directory; signed, expiring, revocable links; no permanent URL.
- No card data stored or accepted; no payment provider connected.
- Delivery never claimed: the outbox records `queued`; the UI says "if the
  address exists, instructions will be sent" only as the neutral reset copy.
- Logs and diagnostics scrubbed; internals never surface.
- Test controls impossible in production configuration.
- Not a certification: the hosting platform still owns TLS, WAF/edge rate
  limiting, backups, malware scanning and secret storage (§13).

## 13. Unresolved dependencies and required inputs (exact)

| Integration | Status | Required to connect |
| --- | --- | --- |
| Backend deployment | IMPLEMENTED — NOT DEPLOYED | A host for `backend/Dockerfile` with a persistent volume, TLS, `BACKEND_*` values (§2.2); the resulting https `API_BASE_URL`; the site origin in `BACKEND_ALLOWED_ORIGINS` |
| Hosted identity provider | NOT CONNECTED — backend-managed identity in place | Choice of provider (or approval of backend-managed accounts), MFA and breach-check policy, password policy values (`BACKEND_PASSWORD_MIN_LENGTH`, lockout) — business approval |
| Document storage | IMPLEMENTED (local) — S3 NOT CONNECTED | A bucket + credentials on the server, the `s3` storage module, a scanning step |
| Email / SMS delivery | NOT CONNECTED — outbox only | A provider account + credentials on the server, a mailer module, sender identity, templates approved by the business; tested before `BACKEND_MAILER` is switched |
| Payment history | IMPLEMENTED against the backend's `payments` table | The payment layer feeding that table (webhook or import) once a payment provider exists |
| Payment provider | NOT CONNECTED — Stage 11 dev provider, labelled | Provider, hosted fields/redirect, webhook, merchant account |
| Flight supplier | NOT CONNECTED — Stage 11 dev adapter, labelled | Supplier credentials behind the backend, airport registry, fare rules, fees |
| Terms of Service · Privacy Policy | NOT PUBLISHED | The official Arabic + English texts, version, effective date, in `backend/legal/` or static files |
| Supervisors registry | Fixture ids (`BACKEND_SUPERVISORS`) | The real supervisor ids/names (Stage 13 owns the rest) |
| Rate-limit / lockout values | Defaults in place | Business approval of the numbers in `backend/.env.example` |
| Edge protection | Platform's | WAF / bot protection / backups on the chosen host |
