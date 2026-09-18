# Production Integration — Stage 16

## 0. Status at a glance

**No real external provider is connected.** This is not a gap in this
stage's effort — it is the correct, honest outcome the brief itself
requires: every provider this platform needs (payment, flight
inventory, hotel inventory, email/SMS/WhatsApp, hosted identity, S3
storage) requires a real account, real credentials and, in most cases,
a business decision (which provider, what commercial terms) that
nobody has supplied. Stage 16's own rules are explicit and repeated:
never invent a credential, never fabricate a connection, never mark
something CONNECTED without genuine evidence. Following those rules to
the letter means this stage's output is an **audit + a runbook**, not a
set of live connections.

What Stage 16 *did* verify: **the architecture built across Stages
10–15B is already production-shaped.** Every seam a real provider would
plug into already exists, is documented, and is tested to refuse an
unsafe or half-configured production setup rather than silently run
with a mock. The remaining work is entirely "supply real values and
flip a switch," not "write new code" — with one exception (§3 below),
a genuine gap this audit found and is documenting rather than
papering over.

## 1. What already exists (verified, not assumed)

| Layer | Verified state |
|---|---|
| Environment separation | `backend/config.mjs` refuses production with test controls on, a missing/weak signing secret, a non-https origin, an insecure cookie, or `BACKEND_STORAGE`/`BACKEND_MAILER` set to anything not yet implemented — all covered by `tests/backend.mjs`'s existing config-refusal suite |
| Deployment sequence | `tools/deploy.mjs` already runs the exact order this stage's §28 asks for: config check → migrations → smoke test → real-backend acceptance suite → **only then** mark `INTEGRATIONS_VERIFIED` and publish |
| Frontend/backend contract | `docs/INTEGRATION.md` — the full route-by-route contract, already implemented against a real (if unhosted) backend, `tests/integration.mjs` passing both against a contract server and the real `backend/` |
| Booking supplier seam | `assets/js/booking/adapters/index.js` — a documented adapter contract (`search`/`offer`/`quote`/`book`/`extras`) a real flight supplier plugs into by registering one more adapter; `amadeus` is the example id already named in the contract's own comment |
| Non-live-inventory services | Hotels, packages, visa, Umrah, medical, transport correctly run through `REQUEST_ADAPTER` (no search, no price, no charge — a specialist follows up) rather than a fabricated search result |
| Payment provider seam | `assets/js/booking/payment.js` — `registerPaymentProvider()`; only a `dev` provider exists, clearly labelled |
| Document storage | Private local storage, signed/expiring/revocable URLs (Stage 12.2); an S3 module is a documented, not-yet-built seam (`backend/config.mjs` refuses `BACKEND_STORAGE≠local`) |
| Notifications | `backend/mailer.mjs` — the only implementation (`none`) records intent in `outbox` as `queued`, never claims delivery; refuses any other `BACKEND_MAILER` value |
| Staff identity | Stage 14's `createStaffAccount` + the existing password-reset flow is a real, working provisioning mechanism — it has only ever been used to create fixture accounts |
| Business rules | Stage 15A/15B's register — 9 of 10 rules genuinely PENDING/DRAFT; verified live-wiring (an approved rule takes effect with no cache to invalidate) |
| Security | Session isolation (customer/supervisor/staff, three separate cookie pairs), CSRF, exact-origin CORS, rate limiting, upload validation, signed URLs, audit trail — all pre-existing and covered by the full regression suite |

## 2. Environments

Three, exactly as `backend/config.mjs`'s `BACKEND_ENV` already
enforces: `development` (this repository's default), `staging` (same
rules as production except test controls may stay on), `production`
(every safety check in §1 active). No environment currently has a
deployed backend — `backend/` runs only in this sandbox and in
`npm test`'s own temporary instances. Deploying to a real staging or
production host is an infrastructure decision (which host, whose
account) this session cannot make.

## 3. Gap found by this audit: payment status is client-reported

`backend/routes.mjs`'s `me.claim` (the route that finalizes a booking
after checkout) sets `payment_status = 'paid'` based on
`b.payment?.status === 'paid'` — a value the **browser** sends in its
request body. This is safe today only because no real money moves
(the only payment provider is the labelled `dev` stand-in). It is
**exactly** the situation Stage 16 §12 warns about: *"Never trust a
browser success page as proof of payment."*

**This must change before a real payment provider is connected.** The
fix (not implemented here, since there is no real provider to build it
against) is:

1. The backend creates a payment intent/order with the real provider
   server-side, before the browser ever sees a client secret / redirect
   URL.
2. The booking's `payment_status` is set to `paid` **only** from a
   verified, signature-checked webhook the provider sends the backend
   directly — never from anything the browser reports.
3. `me.claim` stops accepting `payment.status` from the client
   entirely; it reads the booking's already-recorded payment state.
4. Webhook handling is idempotent (a provider may resend the same
   event) and every event is audited (`audit_events`), per §13/§21 of
   this stage's brief.

This is real, contained, well-understood engineering work — it should
be done as part of connecting the real payment provider (§12), not
before, since designing the webhook contract without knowing which
provider (Stripe, PayTabs, HyperPay, …) will be used risks building the
wrong shape.

## 4. What each provider needs before it can be connected

| Provider | What's needed | Where it plugs in |
|---|---|---|
| Payment | Provider account, hosted-fields/redirect integration choice, webhook signing secret | New `assets/js/booking/adapters/*-payment.js` (frontend intent), new backend webhook route + the fix in §3 |
| Flight supplier | Supplier/GDS credentials (e.g. Amadeus, Sabre), a supported-airports/fare-rules mapping | One new file registered in `assets/js/booking/adapters/installed.js`, matching the existing contract in `index.js` |
| Hotel supplier | Supplier credentials, room/rate mapping | Same adapter contract, `services: ['hotels']`; currently correctly falls back to `REQUEST_ADAPTER` |
| Email | Provider account (e.g. SES, SendGrid), sender domain verified, approved Arabic/English templates | `backend/mailer.mjs`'s `BACKEND_MAILER` seam — one new module |
| SMS / WhatsApp | Provider account, sender id/number, approved templates | Same `mailer.mjs` seam, an additional channel |
| Document storage (if moving off local disk) | Bucket + credentials, retention policy | `backend/storage.mjs`'s `BACKEND_STORAGE=s3` seam (documented, not built) |
| Hosted identity (optional — backend-managed accounts already work) | Provider choice, MFA policy | Would replace `backend/identity.mjs`'s own hashing — not required to launch |
| Real staff | Real names/emails, roles, initial permission grants | `POST /admin/staff` (Stage 14) — the mechanism exists, just needs real people |
| Legal content | Approved Arabic + English Terms/Privacy text, version, effective date | `backend/legal/` per `docs/INTEGRATION.md` §"Legal" |
| Hosting | A host for `backend/Dockerfile` with a persistent volume + TLS, plus a static host for the frontend | `BACKEND_PUBLIC_URL`, `API_BASE_URL`, `SITE_URL` |

## 5. Backup & recovery

**BACKUP NOT VERIFIED.** No hosting has been chosen, so no backup job,
retention policy or restore has ever run. `docs/INTEGRATION.md` §12
already states this responsibility sits with whichever hosting platform
is chosen (WAF, backups, secret storage). Nothing here claims otherwise.

## 6. Monitoring / observability

The existing `diagnostics` scrubbing pipeline (Stage 12.2) is real and
tested: it drops passwords, tokens, emails and long free-text fields
before anything is stored, and logs never contain a session cookie or
password (verified in `tests/backend.mjs`). No external monitoring
service (Sentry, Datadog, etc.) is connected — none has been chosen.

## 7. Security verification

Every item in this stage's §26 checklist that does not require a real
external provider was already covered by the full regression suite
before this stage began, and re-verified here: session security, CSRF,
cookie flags, customer/supervisor/staff isolation, staff permission
enforcement, booking ownership, document private-storage + signed-URL
expiry. Items that require a real provider (webhook authenticity,
supplier secret isolation over a live connection) cannot be verified
without one — see §3–4.

## 8. Production Integration Matrix

| System | Environment | Provider | Status | Verified | Notes |
|---|---|---|---|---|---|
| Authentication | dev/staging/production (config supports all three) | backend-managed | NOT_CONNECTED | N/A | mechanism implemented and tested; no deployed instance |
| Customer Backend | — | `backend/` (this repo) | NOT_CONNECTED | N/A | implemented, not deployed anywhere |
| Supervisor System | — | backend-managed | NOT_CONNECTED | N/A | same backend, same deployment gap |
| Flight Supplier | — | none chosen | NOT_CONNECTED | N/A | dev adapter only, clearly labelled |
| Hotel Supplier | — | none chosen | NOT_CONFIGURED | N/A | correctly routed to request-only, no search exists |
| Payment Provider | — | none chosen | NOT_CONNECTED | N/A | dev provider only; §3 fix required before connecting a real one |
| Document Storage | local disk | — | CONNECTED (local) | YES | private, signed URLs, tested; S3 seam NOT_CONFIGURED |
| Email | — | none chosen | NOT_CONNECTED | N/A | outbox records intent only |
| SMS | — | none chosen | NOT_CONNECTED | N/A | same seam as email |
| WhatsApp | — | none chosen | NOT_CONNECTED | N/A | same seam |
| Database | local SQLite file | — | CONNECTED (local) | YES | migrations tested; no production host |
| Staff Identity | — | backend-managed | NOT_CONNECTED | N/A | mechanism (Stage 14) real; only fixture accounts exist |
| Legal Content | — | fixture text | NOT_CONFIGURED | N/A | placeholder terms/privacy, explicitly labelled as fixtures |

No row in this table claims CONNECTED/VERIFIED without the evidence
stated in its Notes column.
