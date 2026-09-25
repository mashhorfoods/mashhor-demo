# Stage 16B — Real Payment Provider Integration

## 0. Status

**PARTIALLY COMPLETE.** This sandbox has no real payment provider account —
no Stripe/PayTabs/HyperPay (or equivalent) credentials, no merchant
account, no webhook signing secret issued by an external party. Following
this stage's own non-negotiable rules ("do not invent a provider,
credentials, API responses, or a successful payment"), no such provider was
fabricated. What **was** built, and is genuinely live in this codebase, is
the entire server-authoritative architecture the brief asks for — and, most
importantly, **the actual vulnerability it exists to close is fixed**:
`backend/routes.mjs`'s `me.claim` (booking-finalize) no longer reads
`payment_status` from the client under any circumstance. Only a
signature-verified webhook event can ever mark a payment, and therefore a
booking, paid.

The one thing this stage cannot do without external input is connect a
*real* provider. Everything else — intent creation, webhook verification,
idempotency, amount/currency integrity, the payment state machine, the
booking gate fix, payment history, audit trail, tests — is built and
verified against a fully real (not stubbed or mocked) implementation of the
provider contract, using a `dev` adapter that is unmistakably labelled,
refused in production by `backend/config.mjs`, and charges nothing.

## 1. What §2 inspection found (verified, not assumed)

Before any change, the existing code was read end to end:

| Area | Finding |
|---|---|
| `backend/routes.mjs` `me.claim` | **The actual vulnerability.** The client-submitted booking payload included a `payment` object; if `payment.status === 'paid'`, the route inserted a `payments` row with `status: 'paid'` and issued a receipt document — entirely from client input, with no provider, no verification, nothing server-authoritative behind it |
| `backend/db.mjs` schema | A `payments` table already existed (id, customer_id, booking_id, amount, currency, status, reference, method) from Stage 12, built for read-only payment history, never for accepting a live charge |
| `assets/js/booking/ui/payment.js` | A local, in-browser payment *simulation* for UX (choosing a method, a fake "processing" delay, a `dev-failure` test path) — never wired to a real provider, and its result was exactly what `me.claim` above trusted |
| `assets/js/account/adapters/api-customer.js` | `claimBooking` forwarded the local `payment` object straight into the claim POST body — the client → server trust boundary this stage exists to remove |
| `backend/business-rules.mjs` | `payment_gates` (Stage 15A/15B) already gates operational transitions like `payment_received` on `bookings.payment_status = 'paid'` — this stage does not touch that gate's *mechanism*, only what is allowed to set the value it reads |
| Booking-supplier adapter registry (`assets/js/booking/adapters/index.js`) | The existing `registerAdapter`/`adapterFor` pattern this stage's own provider registry (`backend/payments.mjs`) deliberately mirrors, so a real provider only ever touches one new module |

Conclusion: the booking system did not need rebuilding — one route trusted
one client-controlled field it should never have trusted. Everything below
exists to give that route (and the payment domain generally) something
real, server-verified to read instead.

## 2. Architecture (§3–§11)

```
Customer → Booking → Server Payment Intent → Payment Provider →
Secure Webhook → Server Verification → Booking Payment Status → Confirmation
```

| Step | Implementation |
|---|---|
| Booking | `POST /me/bookings/claim` — unchanged in shape, changed in trust: always inserts `payment_status = 'unpaid'`, whatever the request body claims (`backend/routes.mjs` `me.claim`) |
| Server Payment Intent | `POST /me/bookings/:id/payment-intent` → `createPaymentIntent()` (`backend/payments.mjs`). Loads the booking by id **and** the caller's customer id (never trusts a client-supplied amount/currency), refuses a booking with no payable amount (422) or one already paid (409), and is idempotent on an optional `idempotencyKey` |
| Payment Provider | A registry (`registerPaymentProvider`/`paymentProviderFor`), one adapter per provider id — the exact pattern the frontend's own booking-supplier adapters already use. `createIntent`/`verifySignature`/`normalizeEvent` is the whole contract a real provider (Stripe, PayTabs, HyperPay, …) would implement; nothing else in the codebase needs to change to add one |
| Secure Webhook | `POST /payments/webhook/:provider` — public (no session; a provider's own server calls this, not a browser), routed **before** the session/CSRF middleware in `server.mjs`, authenticated entirely by `verifySignature(rawBody, headers)` |
| Server Verification | `handleWebhookEvent()` — the single function in the whole codebase allowed to write `payments.status = 'paid'`. Verifies signature → idempotency (`payment_events` unique on `(provider, provider_event_id)`) → cross-checks the event's amount/currency against the STORED payment row → rejects an already-final payment being re-applied → only then updates status |
| Booking Payment Status | On a verified `paid` event: `bookings.payment_status = 'paid'` (the same column Stage 15's `paymentGates()` already reads), a receipt document is issued, and a `payment-successful` notification is queued to the existing outbox |
| Confirmation | `assets/js/booking/ui/confirmation.js` no longer renders "paid" from local journey state. After claiming, it calls `createPaymentIntent()` and paints the row from the **server's own returned status** — pending/paid/failed |

### Payment state machine

A payment row's `status` is one of `pending`, `processing`, `paid`, `failed`,
`cancelled`, `refunded` (written by `backend/payments.mjs`; the unused
`PAYMENT_STATUSES` constant that listed them was removed on 2026-09-25) — provider-neutral, independent of the binary
`bookings.payment_status` (unpaid/paid) that Stage 15's payment gates
already consume. `payment_gates` itself is read from the existing Business
Rules Register, unchanged by this stage — no new commercial policy was
hardcoded, and no commission logic was introduced.

### Migration

`backend/migrations/005_payments.sql` — extends `payments` with `provider`,
`provider_reference`, `idempotency_key` (unique, nullable), `verified_at`,
`failure_code`, `updated_at`; adds `payment_events` (the idempotency /
audit ledger for every webhook delivery, unique on
`(provider, provider_event_id)`).

## 3. Security (§13–§17)

| Requirement | How it is met |
|---|---|
| Webhook signature verification | HMAC-SHA256 over the **raw** request body (`readBody()` returns a `Buffer`, never re-serialized JSON), compared with `crypto.timingSafeEqual` — the provider's own official mechanism, not a homemade scheme |
| Secret handling | `BACKEND_PAYMENT_DEV_SECRET` is server-only (`backend/config.mjs`), never sent to the frontend, never logged, never present in any audit entry (tested — see §5) |
| Idempotency / replay protection | `payment_events` unique index on `(provider, provider_event_id)`; a redelivered event returns `{duplicate: true}` via `INSERT OR IGNORE` before touching payment or booking state a second time |
| Amount/currency integrity | Every webhook event's claimed amount/currency is compared against the payment row this backend itself stored at intent-creation time; any mismatch is rejected, never trusted as a second source of truth |
| "Reject but ack" | A business-logic rejection (unmatched reference, mismatch, already-final) is recorded and returns HTTP 200 `{ok:true}` — the provider is never given a reason to retry-storm us for our own decision. Only genuinely malformed/unauthenticated deliveries get a non-200 (401 invalid signature, 404 unknown provider, 400 malformed body) |
| CSRF | The webhook route is public and cookie-less by construction, matched in `server.mjs` **before** the session/CSRF block runs — verified by reading the routing order, not assumed |
| Production safety | `backend/config.mjs` refuses `BACKEND_PAYMENT_PROVIDER=dev` in production unconditionally (never a silent fallback), refuses any other value outright (not implemented — only `dev` exists), and requires a real 32+ character `BACKEND_PAYMENT_DEV_SECRET` in staging |
| Raw card data | Never handled. The dev provider stands in for a redirect/hosted-fields flow; no card number, expiry or CVV field exists anywhere in this codebase |
| Payment data stored | `payments` carries only: id, customer/booking ids, provider, provider reference, amount, currency, status, idempotency key, timestamps, verified timestamp, failure code — no card data, ever |
| Audit trail | `payment.created`, `payment.status.changed`, `payment.webhook.rejected`, `booking.paymentGate.passed` all recorded via the existing `audit()` helper (Stage 15), attributed to a `system` actor for webhook-driven changes |

## 4. Testing (§20–§22)

`tests/backend.mjs` gained a dedicated Stage 16B block (30 new assertions,
all against a real running backend instance over real HTTP — no mocked
transport):

- **§22 critical attack**: a `POST /me/bookings/claim` with a forged
  `payment: { status: 'paid', ... }` body is proven to have **zero**
  effect — the booking is created (and re-read) unpaid, no payment row
  exists.
- **§22 valid flow**: intent creation → the dev provider's real signed
  webhook delivery (through the exact same `handleWebhookEvent()` a
  genuine external POST would hit) → booking gate reads `paid` → customer
  payment history and issued receipt reflect it.
- **Failure/retry**: a failed payment never marks a booking paid; retrying
  after a failure succeeds without creating a duplicate booking.
- **Amount integrity**: a payment intent for an already-paid booking is
  refused (409); a non-payable (request-only) booking is refused a price
  entirely (422), never fabricated one.
- **Authorization boundary**: a payment intent can only be created for the
  caller's own booking (404 for another customer's).
- **Webhook authentication**: unknown provider (404, also covers provider
  mismatch — no second provider is ever registered), forged signature
  (401), missing signature (401), malformed body with an otherwise-valid
  signature over those exact bytes (400).
- **Webhook business-logic integrity**: unmatched provider reference,
  altered amount, altered currency, a second event against an
  already-final payment, and an exact replay of the same
  `(provider, event id)` — every one rejected or recognised as a
  duplicate, none reprocessed, verified by re-reading the payment
  afterwards.
- **Attribution**: a booking's existing supervisor attribution is
  unchanged by a successful payment.
- **Audit**: every step above left a trace, and none of it — across every
  attack attempted — ever contains the webhook signing secret or a
  card/CVV-shaped string.

The pre-existing production-configuration baseline test
(`'production config with everything set is accepted'`) was updated to its
new, correct reality: production now also refuses the `dev` payment
provider unconditionally, so a fully "accepted" production config is not
possible today without a real provider — this is intentional (§23), not a
regression, and the test now asserts exactly that refusal plus every other
production requirement passing independently.

**Result: 234/234 backend assertions pass** (204 pre-existing + 30 new).
The full regression gate (`npm test` — backend, browser suites across
390/600/834/1024/1200/1440px, Arabic/English, accessibility, language
audit) was run as part of this stage's own verification; see the
accompanying commit for the exact final counts.

## 5. Production Status

**NOT CONNECTED.** `config.paymentProvider` is `dev` by default and can
only ever be `dev` today — no other adapter is implemented. Production
configuration unconditionally refuses to start with `BACKEND_PAYMENT_PROVIDER=dev`
(verified: `tests/backend.mjs`'s config-check block). No real payment has
ever been processed by this codebase; none was fabricated to claim
otherwise.

## 6. Remaining Gaps — exactly what is needed to move past PARTIALLY COMPLETE

1. **A real provider decision** — which payment provider (Stripe, PayTabs,
   HyperPay, or another) is a business/commercial decision (fees, payout
   currency, regional card support), not a technical one this session can
   make.
2. **A merchant/provider account** with that provider, and its **API
   credentials** (secret key, publishable/client key as applicable) and
   **webhook signing secret** — issued by the provider once an account
   exists, stored only in the hosting platform's secret store (Stage 16A),
   never in this repository.
3. **A new `backend/payments.mjs` adapter** implementing that provider's
   `createIntent`/`verifySignature`/`normalizeEvent` against its own SDK
   or REST API and its own webhook signature scheme — the registry, the
   webhook route, the booking gate and every test above already work
   against any adapter meeting that contract; connecting a real one is
   additive, not a rewrite.
4. **A publicly reachable HTTPS endpoint** for `/payments/webhook/:provider`
   — depends on Stage 16A's real hosting/domain, which is itself
   PARTIALLY COMPLETE for the same reason (no hosting account in this
   sandbox).
5. **`BACKEND_PAYMENT_PROVIDER` set to that provider's id in production**,
   with its real config values — at which point the existing production
   refusal in `backend/config.mjs` (§4 above) is satisfied for the first
   time, exactly as designed.

None of items 1–5 can be produced by writing more code in this repository.

## 7. Acceptance criteria (§27) — checked against reality

| Requirement | Met? |
|---|---|
| A real payment provider decision made and configured | **NO** — no account exists |
| Provider credentials securely stored | **N/A** — none exist to store |
| Server creates the payment intent, never the browser | **YES** |
| Amount/currency read only from the authoritative booking record | **YES** |
| A secure webhook exists, is signature-verified and idempotent | **YES** (dev provider; contract is provider-neutral) |
| Payment state is server-authoritative | **YES** |
| `booking-finalize` no longer trusts a client-reported payment status | **YES — the core fix** |
| A successful payment is confirmed only via verified backend state | **YES** |
| A failed/forged payment cannot finalize a paid booking | **YES** (tested, §22) |
| Duplicate webhook deliveries are harmless | **YES** (tested) |
| Payment records persist with correct metadata, no raw card data | **YES** |
| Customer payment history reflects real payment activity | **YES** |
| Audit trail records every payment event | **YES** |
| Supervisor attribution preserved, no invented commission logic | **YES** |
| Security tests (forged status, invalid/replayed webhook, altered amount, wrong booking/customer) pass | **YES** |
| Production safety (no dev fallback) verified | **YES** |
| A REAL provider is CONNECTED and processing real payments | **NO** |

Per this stage's own §27, not every criterion is met, so:

**STATUS = PARTIALLY COMPLETE.**

## 8. Next stage

Per the brief's own ordering, Stage 16C (flight supplier integration)
should not begin claiming this stage is done until a real payment provider
is genuinely connected and verified per §6 above — it isn't, for the
reasons given. Once a provider decision, account and credentials exist,
the next actionable step is the single new adapter in item 3; the
architecture, the booking-finalize fix, the webhook route and the full
test suite need no further change to accept it.
