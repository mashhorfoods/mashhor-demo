# Stage 16C — Real Flight Supplier Integration

## 0. Status

**PARTIALLY COMPLETE.** This sandbox has no real flight-supplier account —
no Amadeus/Sabre/Duffel (or equivalent) credentials, no GDS/NDC contract,
no sandbox API key issued by an external party. Following this stage's own
non-negotiable rules ("do not invent a supplier," "do not fabricate live
inventory, fares, PNRs or ticket numbers," "never mark a supplier CONNECTED
without real verification"), no such supplier was fabricated.

What **was** built, and is genuinely live in this codebase, is the entire
server-authoritative architecture the brief asks for — search, offer
normalization, price revalidation, idempotent supplier-order creation, the
Stage 16B payment orchestration, and, most importantly, **the boundary this
stage exists to move is actually moved**: the browser no longer runs the
flight-search "supplier" itself. `assets/js/booking/adapters/dev-flights.js`
generated fictional offers **in the browser**, client-side, with no backend
involved at all. That code path is now backend-only
(`backend/flights.mjs`), reached only through public, server-validated
routes, using a real (not stubbed) implementation of the provider contract
— a `dev` adapter, unmistakably labelled, refused in production by
`backend/config.mjs`, exactly like Stage 16B's payment provider.

## 1. What §2 inspection found (verified, not assumed)

| Area | Finding |
|---|---|
| `assets/js/booking/adapters/index.js` | The registry/contract Stage 11 already built (`registerAdapter`/`adapterFor`, a documented normalised `Offer` shape) — reused exactly as designed; this stage adds a second adapter behind it, never a new shape |
| `assets/js/booking/adapters/dev-flights.js` | **The actual boundary problem.** Search, offer detail, quote (price revalidation) and `book()` all ran entirely in the browser, deterministic and clearly labelled `dev`, but with zero backend involvement — nothing stopped a browser from being "the supplier" |
| `assets/js/booking/journey.js` / `search.js` / `review.js` | The re-quote-before-payment step (§10) **already existed** in `review.js` (`adapter.quote(searchId, offer.id)`, continue button stays disabled until it resolves) — this stage did not need to invent that UX step, only make the quote it calls real |
| `assets/js/booking/ui/payment.js` | `adapter.book()` runs client-side, *before* any charge, and only ever picks the booking's reference string — no supplier fact was ever asserted here (confirmed by reading its own copy: "the ticket is issued once a real supplier confirms") |
| `backend/routes.mjs` `me.claim` | Trusted the client's `total`/`currency` for `bookings.amount` — the same class of vulnerability Stage 16B closed for payment status, here for the flight fare itself |
| `backend/staff.mjs` `opsBookingDetail` | Already exposes a Stage 15 `supplier` field — a **manually-tracked business-partner assignment** (hotel/tour operator), unrelated to a live search API; this stage adds a distinct `flightBooking` field rather than overloading that one |
| `backend/payments.mjs` | Stage 16B's verified-webhook path already updates `bookings.payment_status` and runs side effects (receipt, notification) exactly once, idempotently — the natural, already-idempotent point to trigger supplier-order creation from |

Conclusion: the booking engine, UI, customer accounts, supervisor system and
operations dashboard were not rebuilt. One client-side generator moved
behind the backend, one route stopped trusting a client-submitted fare, and
one existing idempotent trigger point gained one more side effect.

## 2. Integration architecture (§4, §12)

```
Customer → Travel & Tourism Backend → Flight Supplier Adapter → Supplier API
```

| Component | Implementation |
|---|---|
| Provider registry | `backend/flights.mjs` — `registerFlightProvider`/`flightProviderFor`, one adapter per supplier id, mirroring `backend/payments.mjs` exactly |
| Search | `POST /flights/search` — public (search happens before sign-in), server-validates every field (`validateSearchRequest`: trip type, 1–4 ordered legs, IATA-shaped distinct airport codes, future dates, passenger counts and ratios), never forwards an unvalidated browser parameter to a provider |
| Offer cache | A server-side `Map<searchId, {request, offers, expiresAt}>` (20-minute TTL) — a server-issued `searchId` is the one thing the browser carries forward; every later call re-reads this cache, nothing is trusted back from the client as fact |
| Offer detail | `GET /flights/offers/:searchId/:offerId` |
| Revalidation | `POST /flights/quote` → `provider.quote(offer)` — used visibly by `review.js` before payment, and again, invisibly, as the *first* step of `createFlightBooking()` right before a supplier order is placed |
| Booking/order creation | `createFlightBooking()` — runs only after Stage 16B's verified payment webhook, for a booking claimed against a server-issued offer; revalidates once more, calls `provider.book()`, and persists the result |
| Storage | Migration `006_flights.sql`: `bookings.flight_search_id`/`flight_offer_id` (which offer a booking was claimed against) and `flight_bookings` (id, booking_id **UNIQUE**, customer_id, provider, provider_booking_id, status, itinerary/passengers/fare JSON, failure_reason, timestamps) |
| Frontend adapter | `assets/js/booking/adapters/api-flights.js` — implements the *exact same* contract `dev-flights.js` did, calling the three public routes instead of generating data locally; `installed.js` now gates `dev-flights` (development, no backend) vs `api-flights` (a configured backend) vs nothing at all (production without a backend — service falls back to the pre-existing `REQUEST_ADAPTER`, never a crash, never fabricated inventory) |

### Amount integrity extended from Stage 16B to the fare itself

`me.claim` now reads `searchId`/`offerId` from the claim request and, when
present, **revalidates the offer right there** and uses that price as
`bookings.amount`/`currency` — a client-submitted `total`/`currency` is
completely ignored for a flights booking claimed against a server-issued
offer. An offer that no longer exists in the server cache (expired, or
never real) refuses the claim outright (409) rather than falling back to
the client's number. Verified: `tests/backend.mjs` claims a booking with a
forged `total: 999999, currency: EUR` and asserts the stored amount is the
real, server-revalidated fare.

## 3. Payment relationship with Stage 16B (§13)

```
Revalidate → Payment → Supplier Booking → Confirmation
```

the exact default ordering this stage's own brief offers. Concretely:

1. `me.claim` — booking created `unpaid`, amount from a fresh revalidation (above).
2. `POST /me/bookings/:id/payment-intent` (Stage 16B, unchanged) — server creates the intent, the dev payment provider's real signed webhook resolves it.
3. **New:** inside `handleWebhookEvent`'s existing `paid` branch (`backend/payments.mjs`) — the SAME branch that already flips `payment_status` and issues a receipt, now also calls `createFlightBooking()` for a flights booking claimed against a server offer, and awaits it before the webhook responds.
4. The `payment-intent` response is extended with the booking's fresh `ticketed`/`flightBooking` fields, so the confirmation screen gets the real outcome in the same round-trip — no polling, no second request.

**A failed supplier order never unwinds a successful payment**, and never
reports a false ticket: `recordFailure()` marks `flight_bookings.status =
'failed'` with a reason, leaves `bookings.payment_status = 'paid'` and
`ticketed = false` exactly as they are, records an audit entry
(`flightBooking.failed`) and queues a `flight-booking-failed` customer
notification — a real, defined recovery path for staff to act on, not
silence and not a fabricated success. Verified end to end in
`tests/backend.mjs` (§26 critical test 2, below).

Because the trigger sits inside Stage 16B's own idempotent
`payment_events` guard (unique on `(provider, provider_event_id)`), a
duplicated webhook delivery — the exact scenario that would otherwise risk
two airline reservations — never reaches this branch a second time at all;
the existing idempotency mechanism protects the supplier side for free.
`flight_bookings.booking_id` is additionally `UNIQUE`, so any other retry
path (a future manual ops retry, for instance) also finds the existing row
instead of calling the supplier again.

## 4. Security (§19, §20)

| Requirement | How it is met |
|---|---|
| Supplier credentials only on the backend | The dev provider needs none; a real provider's credentials would live in `backend/flights.mjs`'s new adapter and `backend/config.mjs`, never in any frontend file — the frontend adapter (`api-flights.js`) only ever calls this backend's own public routes |
| No credentials in the frontend or Git | Verified by construction: `api-flights.js` contains no key, secret, or provider endpoint — it calls `/flights/*` on this same origin |
| HTTPS | Inherited from the existing production configuration (`backend/config.mjs` already refuses non-https origins in production; unchanged by this stage) |
| Input validation | `validateSearchRequest` — trip type, leg count/order, IATA-shaped codes, distinct origin/destination, future dates, passenger count/ratio bounds — every case tested |
| Output sanitisation | An internal-only QA field (`_devTest`, the dev provider's own test switch) is stripped from every customer-facing offer response (`stripInternal`) — verified nothing carrying that key ever reaches a search/offer response |
| Rate limiting | `/flights/*` sits behind the same per-IP `api` rate-limit class every other public route does (checked before the route match, same as the payments webhook) |
| Customer ownership | Flight-booking creation is reached only through the customer's own already-claimed booking id (`ctx.customer.id` scoping, unchanged Stage 12 pattern) — a payment intent, and therefore a supplier order, can never be created against another customer's booking (tested: 404, not 403 — existence not confirmed either) |
| Privacy (§20) | Only the passenger fields a supplier booking needs (first/last name, dob, gender, nationality, passport, passport expiry — `sanitizeTravellers`) are stored and forwarded; no supervisor commission data, staff information, or unrelated customer records ever reach `flight_bookings` or a provider call |
| No internal test-only leakage | `provider` id, `_devTest`, and the raw supplier response never reach a customer-facing route (`nFlightBookingCustomer` exposes only `status`/`reference`/`failureReason`/`updatedAt`) — staff see more (`nFlightBookingOps`), but still never a raw response |
| Production safety | `BACKEND_FLIGHT_PROVIDER` defaults to `dev` and is unconditionally refused in production (`backend/config.mjs`), an unimplemented value is refused regardless of environment — identical treatment to Stage 16B's payment provider |

## 5. Verification

**Automated backend tests** (`tests/backend.mjs`, 277/277 passing — 234
pre-existing + 43 new): search validation (one-way/round-trip/multi-city,
passenger/date/airport/trip-type validation, no-results, simulated
outage), offer detail + revalidation (unknown offer/search, unchanged
fare, changed fare, unavailable fare, expired search), amount integrity at
claim (forged total/currency ignored, sanitised traveller storage),
end-to-end orchestration (payment → real supplier booking → customer
confirmation reflects it), customer-boundary isolation, supervisor
attribution surviving the whole journey, and operations-dashboard
visibility (`flightBooking` distinct from the Stage 15 `supplier` field,
never exposed by that name on the customer route). Config-check
assertions mirror Stage 16B's for the flight provider (production
refusal, unimplemented-value refusal).

**§26 critical failure tests — explicitly proven, not asserted by
description:**

1. *A stale search result cannot be used to create a booking without
   revalidation.* Claiming against an unknown/expired `searchId`+`offerId`
   is refused (409) before anything is written.
2. *A failed supplier booking is never reported as a confirmed ticket.*
   A dev-provider `book-fail` scenario: payment still verifies `paid`
   (the charge is real and untouched), but `flightBooking.status` is
   `'failed'`, `ticketed` stays `false`, and a failure reason plus audit
   entry exist for recovery.
3. *A supplier timeout / duplicate delivery cannot cause an unsafe
   duplicate retry.* A second `payment-intent` call against an
   already-paid flights booking is refused (409), and the supplier
   reference is proven byte-for-byte identical before and after — no
   second reservation.

**Browser suites** (Playwright, against this repository's own static
build): `journey` (512/512, the exact suite driving search → results →
details → travellers → extras → review → payment → confirmation against
the `dev-flights` adapter in a no-backend development build), `account`
(782/782), `ops-portal` (900/900, including the real-backend section that
renders a flights booking's admin detail), `supervisor-portal` (505/505).
`integration` (518/518) drives the *production* `api-flights` adapter
against a lightweight contract test server
(`tests/contract-server.mjs`) that was extended this stage with its own
minimal `/flights/search`/`/flights/offers/:id/:id`/`/flights/quote` and
`/me/bookings/:id/payment-intent` stand-ins — without that extension the
suite hung waiting on search results that could never arrive, which this
stage's own testing caught and fixed rather than shipped broken (see §6).
All of the above ran with **0 console/network problems**.

**Supplier sandbox/production tests:** none — no real supplier account
exists to test against (§0). Nothing was marked CONNECTED without real
verification.

## 6. A regression caught and fixed during this stage's own verification

Moving flight search behind the backend meant `assets/js/booking/adapters/installed.js`
now registers `api-flights.js` whenever a backend is configured — which
includes `tests/integration.mjs`'s scenario (it deliberately runs the
*production* adapter set against a contract test server, not the dev
adapters). That contract server predates Stage 16B/16C and had neither a
flights endpoint nor a payment-intent endpoint, so the integration suite's
booking journey hung indefinitely waiting for search results. This was
caught by this stage's own regression run (not discovered by a user), and
fixed by extending `tests/contract-server.mjs` with the minimal stand-ins
described above — the same reason that file exists in the first place, so
the production adapters can be verified in a real browser before a real
backend is deployed. `tests/integration.mjs` now passes 518/518.

## 7. Status — checked against §29 acceptance

| Requirement | Met? |
|---|---|
| Real flight supplier selected | **NO** — no account exists |
| Real credentials configured | **N/A** — none exist to configure |
| Backend adapter connected | **YES** (dev provider; contract is supplier-neutral, verified against it) |
| Live search works | **YES** (against the dev provider only) |
| Real inventory returned | **NO** — cannot be, without item 1 |
| Results normalise correctly | **YES** |
| Filters/sorting work | **YES** (client-side, Stage 11's `rank.js`, unchanged, reads the same normalised shape) |
| Fare revalidation works | **YES** (tested: unchanged/changed/unavailable/expired) |
| Booking creation works | **YES** (against the dev provider; idempotent, tested) |
| Supplier references stored | **YES** |
| Duplicate booking protection | **YES** (tested) |
| Supplier errors handled | **YES** (outage, rejection, unavailable fare — all normalised, never a raw exception) |
| Payment integration works with Stage 16B | **YES** (tested end to end) |
| Customer confirmation reflects actual supplier state | **YES** |
| Supervisor attribution survives the journey | **YES** (tested) |
| Security tests pass | **YES** |
| Production acceptance tests pass | **N/A** — no production deployment exists (Stage 16A) |
| Browser verification passes | **YES**, for every suite this sandbox can run against the dev/contract adapters |
| A REAL supplier is CONNECTED | **NO** |

Per this stage's own §29, not every criterion is met, so:

**STATUS = PARTIALLY COMPLETE.**

## 8. Remaining gaps — exactly what is needed

1. **A flight supplier decision** — Amadeus, Sabre, Duffel, or another —
   is a commercial decision (coverage, fees, NDC vs GDS, settlement), not
   a technical one this session can make.
2. **A supplier account and API credentials** (and, for most GDS/NDC
   suppliers, a signed agreement) — stored only in the hosting platform's
   secret store (Stage 16A), never in this repository.
3. **One new adapter** in `backend/flights.mjs` implementing that
   supplier's `search`/`quote`/`book` against its own SDK or REST API —
   the registry, the routes, the claim-time revalidation, the payment
   orchestration and the entire test suite above already work against any
   adapter meeting the existing contract; connecting a real one is
   additive.
4. **`BACKEND_FLIGHT_PROVIDER` set to that supplier's id in production**
   — at which point `backend/config.mjs`'s existing production refusal is
   satisfied for the first time, exactly as designed.
5. Real production hosting (Stage 16A) and a real payment provider
   (Stage 16B) are themselves still PARTIALLY COMPLETE for the same
   reason — no external account exists in this sandbox for either.

None of items 1–4 can be produced by writing more code in this repository.

## 9. Next stage

Per the brief's own ordering: Stage 16D (notifications, legal content,
real staff provisioning) should not begin claiming Stage 16C is done until
a real flight supplier is genuinely connected and verified per §8 above —
it isn't, for the reasons given. The next actionable step is supplying
items 1–4; the architecture, the amount-integrity fix, the payment
orchestration, the operations visibility and the full test suite need no
further change to accept a real supplier once one exists.
