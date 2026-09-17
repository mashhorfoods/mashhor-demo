# Integration guide — Stage 12.1

How the customer account talks to real services, what the backend must
provide, and what is and is not connected today.

**Status: STAGE 12.1 — PARTIALLY COMPLETE.** Every integration is
implemented against a documented contract and verified in a real browser
against the contract test server (`tests/contract-server.mjs`). **No external
service is connected**: there is no deployed backend, identity provider,
document store, payment-history endpoint, notification service, or supplied
legal text in this repository or available to it. `installed.js` says so, a
production build cannot fall back to development data, and the exact inputs
needed are listed at the end.

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
External service / backend           identity provider, database, storage, payment layer, notifications — behind the backend
```

The browser talks to **one** origin, `API_BASE_URL`. The backend fronts the
hosted identity provider, the database, document storage, the payment
layer's history endpoint and notification delivery, and holds every secret.
Nothing provider-specific reaches the browser.

## 2. Environment and configuration

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

Everything in `env.js` ships to every visitor: **no private key, service-role
key, database or storage credential, payment secret or signing secret is
ever configured here**. The generator refuses a production file that uses
the development adapter, lacks an https backend, or contains a value that
looks like a secret.

Local development: the committed `env.js` is the development default
(`authProvider: 'dev'`). Staging: `NO_ENVIRONMENT=staging AUTH_PROVIDER=session-api API_BASE_URL=https://…`.
Production: the same with `NO_ENVIRONMENT=production`; the file is written in
the deploy step, after the checks, never committed.

## 3. Backend contract

All routes relative to `API_BASE_URL`. JSON in and out; errors as
`{ "error": { "code": "…" } }` with the HTTP status. Codes the browser maps:
401 unauthenticated · 403 forbidden · 404 notFound · 409 conflict/exists ·
410 expired/invalidToken · 413 tooLarge · 415 unsupported · 422 invalid/weak ·
429 rateLimited (with `Retry-After`) · 5xx unavailable.

**Sessions.** The backend sets `no_session` (HttpOnly, Secure, SameSite=Lax
or None with the site's origin allowed) on sign-in / sign-up and reads it
on every call. It also sets `no_csrf` (readable); the browser echoes it in
`X-CSRF-Token` on every POST/PATCH/DELETE (double-submit). The browser keeps
only a marker, never a credential. `GET /auth/session` is the authority.

| Method · path | Body | Answer |
| --- | --- | --- |
| `POST /auth/sign-up` | `{ name, email, phone, password, locale, attribution: { supervisorId, source } \| null, acceptance: { terms: { version, effectiveAt }, privacy: {…}, locale } \| null }` | 201 `{ customer, expiresAt }` + cookies · 409 exists · 422 weak/invalid |
| `POST /auth/sign-in` | `{ email, password }` | 200 `{ customer, expiresAt }` + cookies · 401 invalid (same answer for unknown and wrong) |
| `GET /auth/session` | — | 200 `{ customer, expiresAt }` · 401 |
| `POST /auth/refresh` | `{}` | 200 `{ customer, expiresAt }` + new cookies · 401 |
| `POST /auth/sign-out` | `{}` | 204 + cleared cookies |
| `POST /auth/password/reset-request` | `{ email }` | 202 always (never reveals whether the address exists); the link is e-mailed |
| `POST /auth/password/reset` | `{ token, password }` | 204 (ends other sessions) · 410 invalidToken · 422 weak |
| `POST /auth/password/change` | `{ current, next }` | 204 · 422 invalid/weak |
| `GET /me` · `PATCH /me` | `{ name, phone, locale }` | `{ customer }` |
| `GET /me/trips` · `GET /me/trips/:id` | — | `{ trips }` · `{ trip, bookings, documents, payments }` · 404 when not this customer's |
| `GET /me/bookings` · `GET /me/bookings/:id` | — | `{ bookings }` · `{ booking, trip, documents, payments }` |
| `POST /me/bookings/claim` | the Stage 11 journey record (reference, context, offer, travellers, contact, extras, payment status, attribution) | 201 `{ booking }`; idempotent by reference; sets the customer's attribution once |
| `GET/POST /me/travellers` · `PATCH/DELETE /me/travellers/:id` | traveller fields | `{ travellers }` · `{ traveller }` · 204 |
| `GET /me/documents` | — | `{ documents: [{ id, bookingId, tripId, type, kind, status, issuedAt, title, size, contentType, deletable, booking?, trip? }] }` |
| `POST /me/documents` | multipart `file`, `title`, `type` | 201 `{ document }` · 413 · 415 |
| `GET /me/documents/:id/url` | — | `{ url, expiresAt }` — a short-lived signed URL · 404 |
| `DELETE /me/documents/:id` | — | 204 · 403 when not deletable |
| `GET /me/payments?page=&pageSize=` | — | `{ items: [{ id, bookingId, at, amount, currency, status, reference, methodAr/En, booking? }], page, pageSize, total, nextPage }` |
| `GET /me/notifications` · `POST /me/notifications/read` | `{ ids }` or `{ all: true }` | `{ notifications }` |
| `POST /me/legal/acceptance` | `{ terms: { version }, privacy: { version }, locale }` | 204 |
| `GET /legal/terms?locale=` · `GET /legal/privacy?locale=` | — | `{ version, effectiveAt, title, html }` · 404 when not published |
| `POST /diagnostics` (optional) | a scrubbed event | 204 |

`customer` is `{ id, name, email, phone, locale, image, supervisorId, attribution: { supervisorId, source, at }, acceptance, createdAt }`.
The contract test server implements every row; a real backend must behave
the same way, and `tests/integration.mjs` is the acceptance suite to run
against it.

## 4. Authentication flow

Sign up → acceptance (when the documents are published) → `POST /auth/sign-up`
(identity + customer record + attribution + acceptance, one call) → cookie
session → dashboard. Sign in → `POST /auth/sign-in` → cookie session →
`GET /auth/session` on every later load → dashboard. Sign out →
`POST /auth/sign-out` → marker and header cleared → sign-in page. Reset →
`reset-request` (neutral answer) → e-mailed link → `reset` (single-use,
ends other sessions) → sign in again.

Handled and verified: invalid credentials (one message), expired session
(marker expiry or 401 → "session expired" + sign-in with return path),
revoked session mid-page (a 401 on any data call), network failure while
verifying (kept signed in, "could not reach", retry), account not found on
reset (neutral), duplicate registration (409), invalid / expired / reused
reset link (410), rate limiting (429), backend outage (5xx), timeout.
A session near expiry is refreshed on load through `POST /auth/refresh`.

## 5. Customer authorization model

The backend resolves the customer from its session cookie and answers
**only** from that customer's records; a foreign id is a 404. The browser
never sends a customer id, and the marker in `localStorage` carries none;
tampering with it changes nothing (verified). CSRF: state changes without
the header are refused (403). Signed file URLs are verified server-side and
expire (410). Frontend guards are UX only.

## 6. Document flow

Upload → client checks size/type from `DOCUMENT_SERVICE_CONFIG` → multipart
`POST /me/documents` → backend authorises, stores, records metadata for
this customer → listed. View → `GET /me/documents/:id/url` → short-lived
signed URL → shown in the viewer (image / PDF frame / open-in-new-window)
with its expiry → on expiry an "expired" state offers a new link → delete
where `deletable`. Handled: too large, unsupported, upload failure with
retry, expired link, revoked/deleted document, network failure, another
customer's document (404). No permanent URL exists.

## 7. Payment history, notifications, legal

Payments: `GET /me/payments` paged (`PAYMENT_API_CONFIG.pageSize`), "show
more" until `nextPage` is null, loading / empty / error / retry / 429 kept
the loaded list. Only backend-supplied fields are shown; no card data
exists. No payment processing was added in this stage.

Notifications: retrieval, unread/read, mark one / all, open the related
record, empty / loading / failure / retry; a quiet refresh when the tab
regains focus, throttled by `NOTIFICATION_CONFIG.refreshMinSeconds` — no
polling.

Legal: `legal/terms/` and `legal/privacy/` render whatever the configured
source supplies (version, effective date, sanitised HTML). Sign-up shows
the acceptance checkbox with links when both documents are published and
records the versions with the account; when they are not published the
pages and the sign-up say so — **no placeholder legal text is ever shown or
committed**.

## 8. Failure handling and observability

Every screen: loading, success, empty, error with retry, session expired,
unauthorised (→ sign in), forbidden, not found, rate limited, network,
timeout, service unavailable, not connected. Messages are customer
language; internals never surface. `core/diagnostics.js` records technical
events (auth failure, API failure, document upload/link failure,
payment-history failure, notification failure, session expiry) with
scrubbed fields and beacons them to `DIAGNOSTICS_CONFIG.endpoint` when
set; it never logs passwords, tokens, cookies, card or personal data.

## 9. Security notes and infrastructure outside this repository

- HTTPS everywhere; `Secure` cookies; HSTS on the backend.
- CORS: the backend allows the site's exact origin with credentials, no wildcard.
- CSRF: double-submit cookie as above; SameSite on the session cookie.
- Rate limiting on `/auth/*` and `/me/documents` at the backend or edge; the browser honours 429.
- Password policy, MFA, breach checks: the identity provider's; the browser only enforces the minimum length for immediacy.
- Signed URLs: short TTL, single document, verified signature; storage buckets private.
- Uploads: virus scanning and type sniffing at the backend; the browser's checks are UX.
- Logging: no request bodies with credentials; diagnostics endpoint accepts only the scrubbed shape.
- Nothing above is a certification; it is the list a backend team must implement and review.

## 10. Testing and deployment

- `npm test` runs every suite. `tests/integration.mjs` starts the contract
  server and a staging-configured copy of the site and verifies the
  production adapters end to end (518 checks), plus a production build
  without a backend (fails safely). Run the same suite against a real
  backend by pointing `env.js` at it and skipping the `/__test/` controls.
- Deploy: `NO_ENVIRONMENT=… AUTH_PROVIDER=session-api API_BASE_URL=… node tools/write-env.mjs`
  in the deploy step, then publish the static files. Never commit the
  generated production `env.js`.

## 11. Missing production inputs (exact)

| Integration | Status | Required input |
| --- | --- | --- |
| Identity provider | NOT CONNECTED — adapter implemented | A backend exposing `/auth/*` above, fronting the chosen hosted identity provider; its public settings in `AUTH_PUBLIC_CONFIG` |
| Customer backend API | NOT CONNECTED — adapter implemented | A backend exposing `/me/*` above with server-side customer scoping; `API_BASE_URL` |
| Document storage | NOT CONNECTED — flow implemented | Private storage behind `/me/documents*` with signed, expiring URLs |
| Payment history | NOT CONNECTED — flow implemented | The payment layer's history behind `/me/payments` |
| Notification delivery | NOT CONNECTED — flow implemented | The notification service behind `/me/notifications*` (delivery channels are the backend's) |
| Terms of Service | NOT CONNECTED — pages + acceptance implemented | The official text (Arabic and English), version and effective date, via `/legal/terms` or static files |
| Privacy Policy | NOT CONNECTED — pages + acceptance implemented | As above via `/legal/privacy` |
