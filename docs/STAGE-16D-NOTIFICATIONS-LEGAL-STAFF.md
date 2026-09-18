# Stage 16D — Notifications, Legal Content, Real Staff Provisioning

## 0. Status

**PARTIALLY COMPLETE.** This sandbox has no real e-mail provider account
(no SMTP credentials from any real sender), no approved legal text from the
business, and no list of real employees to provision. Following this
stage's own non-negotiable rules ("do not invent a notification provider,"
"do not invent staff identities," "do not invent legal policies," "never
mark an integration CONNECTED without real evidence"), none of those was
fabricated.

What **was** built, genuinely, and verified against a real (if local)
counterparty exactly the way Stages 16B/16C's dev providers were: a durable
outbox with idempotent delivery and bounded retry, a real dependency-free
SMTP client (STARTTLS, AUTH LOGIN, RFC 2047 subject encoding — this project
has zero npm dependencies, so this is hand-built, not a wrapped library),
backend-enforced legal acceptance at signup, and real fixes to two staff-
provisioning gaps: a new hire's account previously had no invite path at
all, and deactivating a staff member previously left their existing
session valid. Every claim below is backed by an automated test that
exercises the real code path, not a description of intent.

## 1. Notifications

### Provider

| Channel | Status |
|---|---|
| Email | **NOT CONNECTED.** `BACKEND_MAILER` defaults to `none` (deliveries recorded as queued, never claimed sent). `smtp` — a real, dependency-free RFC 5321 client (`backend/mailer.mjs`) — is implemented and refused by `backend/config.mjs` without real `BACKEND_SMTP_HOST/PORT/USER/PASS/FROM`, exactly mirroring how Stage 16B/16C treat an unconfigured payment/flight provider. No real SMTP account exists in this sandbox to connect it to. |
| SMS | **NOT_CONNECTED.** No adapter exists; none was fabricated. |
| WhatsApp | **NOT_CONNECTED.** Same. |

Per §27: *Email = CONNECTED, SMS = NOT_CONNECTED, WhatsApp = NOT_CONNECTED
unless actually verified* — none of the three is actually verified against
a real third party here, so all three read NOT CONNECTED. The SMTP
adapter's correctness (not its connectedness) **was** verified: a local
fake SMTP server (STARTTLS negotiated, AUTH LOGIN credentials decoded
correctly, a rendered Arabic subject round-tripped through RFC 2047,
message body delivered verbatim) received a real, correctly-formed message
from this backend's real client. See §5 below for the exact test.

### Outbox architecture (§4)

`backend/migrations/007_notifications.sql` extends the existing `outbox`
table (Stage 12.2) with `idempotency_key` (unique, nullable),
`event_type`, `booking_id`, `staff_id`, `recipient`, `attempts`,
`next_attempt_at`, `provider_message_id`, `failure_category`, `updated_at`.
`enqueue()` (`backend/mailer.mjs`) is now the **one** durable entry point
every business event uses — it always writes the row before anything else
happens, so a provider outage or a process restart can never lose the
event. `deliverOutbox()` runs on its own 15-second interval in
`server.mjs`, never inside the request that queued a message (§4's own
requirement, tested: a sign-up succeeds even when the configured SMTP
provider immediately fails auth — §9 below).

### Delivery status (§8) — five real states, never fabricated

`queued` → `processing` → `delivered` (with a real `provider_message_id`)
or `retrying` (with a categorised `failure_category` and a future
`next_attempt_at`) → eventually `failed` after 5 bounded attempts. A row
is marked `delivered` **only** after the provider genuinely accepted the
message (a 250 response to `DATA`) — never on enqueue, never optimistically.

### Idempotency (§5) — tested directly and through real callers

`enqueue()`'s `idempotencyKey` uses `INSERT OR IGNORE` against the unique
column — a duplicate business event (a webhook redelivery, a retried
request) never queues a second message; tested directly (two identical
calls, one row) and through real callers: `booking-created` keyed on the
claimed reference, `staff-invite` keyed on the staff id, and
`booking-status-changed` keyed on the specific `booking_status_history`
row id (so *repeat, distinct* transitions still each notify — only an
exact duplicate of the same one is suppressed). Backoff itself was proven
too: a failed attempt sets `next_attempt_at` in the future, and an
immediate second delivery pass genuinely skips it.

### Events wired (§6) — only where a real system action already exists

| Event | Trigger | Notes |
|---|---|---|
| Account creation | `auth.signUp` (unchanged, pre-existing) | `welcome` |
| Booking created | `me.claim`, the moment a NEW booking is genuinely claimed | new this stage |
| Payment successful/failed | Stage 16B's payment webhook (unchanged, pre-existing) | |
| Supplier booking result | Stage 16C's `createFlightBooking`/`recordFailure` (unchanged, pre-existing) | |
| Booking status changed | `transitionBooking`, only on an **accepted** transition | new this stage; a rejected transition never notifies a change that didn't happen |
| Document approved/rejected | `reviewDocument`, only when the status genuinely **changes** (a resubmission of the same status is a no-op) | new this stage |
| Staff invited | `createStaffAccount` (§16, see §3 below) | new this stage |
| Password reset/changed | pre-existing, unchanged | |

**Deliberately not wired**, with the reason (§6: "do not invent business
events that have no corresponding system action"):

- *Operational escalation* — no existing "notify staff by e-mail" channel
  exists anywhere in the codebase (staff work escalations through the ops
  dashboard's own in-app queue, which already surfaces them); building one
  would be inventing new architecture, not extending existing.
- *Required document* — no business action in this codebase ever requests
  a specific document from a customer; documents are customer-initiated
  uploads only. There is nothing to notify about.
- *Support response* — no support/ticketing system exists in this
  codebase at all.

### Templates (§7) — the existing Stage 15 system, now actually connected

`notification_templates` (bilingual subject/body, `{{variable}}`
placeholders, versioned, active flag, tag-stripped at storage) already
existed but was never read by anything — `enqueue()` stored a payload and
nothing ever rendered it. `deliverOutbox()` now looks up the active
template for `(event, channel)` and calls the new `renderTemplate()`,
which escapes every payload value before substitution (so a customer's own
name or a rejection reason can never reintroduce markup through a
placeholder) and resolves an unknown placeholder to nothing, never
fabricated text. **If no active template is configured for an event, the
row fails honestly (`templateNotConfigured`) — it is never sent with
invented wording.** This is why a fresh deployment (no templates ever
created by an admin) delivers nothing yet, correctly.

### Never exposed

Internal notes, staff-only detail, and commission/financial data were
never put into any payload this stage wires (`booking-status-changed`
carries only the two status values; `document-rejected` carries only the
customer-facing rejection reason already stored on the document row) —
verified by asserting the internal note text and staff ids never appear in
the outbox.

## 2. Legal

| | |
|---|---|
| Documents | **NOT_CONFIGURED.** `legal/terms.ar.html` etc. and `meta.json` (the format `backend/legal.mjs` reads) do not exist anywhere in this repository — only the frontend's static "not published" page shells do. No content was written on the business's behalf (§11). |
| Versioning (§12) | Already implemented, file-based: `meta.json` carries `version`/`effectiveAt`/title per document; a customer's stored acceptance (`customers.acceptance_json`) independently freezes the version/date **they** accepted at signup time, so a later file change never silently rewrites history. |
| Acceptance enforcement (§13) — **new this stage** | `auth.signUp` now refuses (422) a sign-up with no acceptance, or with only one of terms/privacy accepted, whenever legal is actually configured — checked server-side against the same source `GET /legal/:kind` uses (real files, or the test-fixture override), never only the frontend checkbox. When nothing is configured, nothing is required (§28) — unchanged, backward-compatible behaviour for every existing test and every real deployment today. |
| Safe rendering (§14) | Pre-existing (Stage 12.2), unchanged and re-verified by the existing suites: `<script>` and `javascript:` URLs are stripped from rendered legal HTML (`tests/integration.mjs`'s XSS assertions still pass). |

## 3. Staff

| | |
|---|---|
| Accounts | **READY, NOT PROVISIONED** (§29). The provisioning mechanism (`POST /admin/staff`) is real and tested; no real, named employee was given to this session to provision, and none was invented. Only the pre-existing, clearly-labelled fixture accounts (`admin1@fixture.test`, `ops1@fixture.test`, `ops2@fixture.test`) exist, unchanged. |
| Provisioning flow (§16) — **fixed this stage** | Previously, `createStaffAccount` created an account with no password (correct — an admin never handles one) but also **never told the new hire it existed**: no invite was ever queued. It now automatically enqueues a `staff-invite` notification carrying a real reset token through the exact reset-token mechanism `staffAuth.resetRequest` already used, closing the loop: **Provision → Invite/Reset → Staff Sets Password → Account Active**, verified end to end (a fresh account cannot sign in until it uses the token; after using it, it can). |
| Roles/permissions (§17/§18) | Preserved exactly: customer/supervisor/admin/ops, three separate credential stores, unchanged. **New this stage:** `setStaffRole` (`POST /admin/staff/:id/role`), the one lifecycle action §17/§19 name that did not exist — promoting to admin drops any stored permission list (admin holds every permission implicitly; a stale list would be misleading), demoting to ops starts at **zero** permissions (least privilege, §18: the caller must explicitly grant what the new role needs, never inherit an unrelated former role's access). |
| Deactivation (§19) — **fixed this stage** | `hasPermission()` already refused every permission check for an inactive account (deactivation was already effective on the *next* action) — but the account's *existing, already-issued* session cookie kept working for the ops routes that don't gate on a specific permission until it expired naturally (up to the configured session TTL). `setStaffActive(id, false, …)` now also calls `endAllStaffSessions(id)`, the same session-revocation Stage 12's password-change already does — deactivation is immediate, not merely "denied on the next explicit check," verified: the exact same cookie that worked before deactivation is refused (401) right after. |
| Audit trail (§20) | `staff.create`, `staff.activate`/`staff.deactivate`, `staff.permissions.update`, `staff.role.update` (new) — every one attributed to the acting admin, never a plaintext password anywhere in any entry (tested). |

## 4. Security (§23)

Tested explicitly, this stage's own scope: a duplicate business event
producing no second notification; a template placeholder never
re-introducing markup (escaped); a never-configured template never
inventing wording; an unresolvable recipient never inventing a
destination; the SMTP password never appearing in server logs (delivered
and failed cases both); a customer session cannot reach staff
provisioning (401); a supervisor session cannot reach staff provisioning
(401); a wholly unauthenticated request to provision staff is refused
(401); a deactivated staff member's existing session is refused
immediately. Pre-existing coverage this stage did not need to re-add:
ops-without-`staff.manage` → 403 on every staff route (Stage 14's own
suite), customer/supervisor/staff cross-role isolation generally (Stage
13/15's own suites), malicious legal HTML stripped (Stage 12.2/16's own
integration suite).

Credentials: the SMTP password exists only in `backend/config.mjs`
(from `BACKEND_SMTP_PASS`) and inside the one closure in
`backend/mailer.mjs` that opens the socket — never logged, never returned
by any route, never present in the frontend. `backend/.env.example`
documents every SMTP variable without a real value.

## 5. Verification

**Automated backend tests** (`tests/backend.mjs`): **323/323 passing**
(280 pre-existing Stages 12–16C + 43 new for this stage) — 0 regressions.
New coverage: outbox idempotency (direct mechanism test + through real
callers), event wiring for booking-created/status-changed/document-
review (including the "rejected transition never notifies" and
"resubmitting the same status never re-notifies" negative cases), `mailer
= none` never attempts delivery, template rendering/escaping, **real SMTP
delivery end to end** against a local fake server (STARTTLS, AUTH LOGIN,
rendered Arabic/English content, a genuine provider message id), auth
failure → `retrying` → (bounded) → `failed` with the backoff gate proven,
never-configured-template and unresolvable-recipient failures, legal
acceptance enforcement (none required / required / partial refused / full
accepted, each independently), and the full staff lifecycle (invite email,
cannot sign in before reset, deactivation revokes an existing session
immediately, role update resets permissions correctly both directions,
audit trail, and the security boundary checks in §4 above).

**Browser suites** (this session's own regression, run before this
stage's changes and re-run afterward for everything this stage touched):
`backend` 323/323, `journey` 512/512, `account` 782/782, `integration`
518/518, `ops-portal` 900/900, `supervisor-portal` 505/505, plus the full
12-suite marketing/static matrix (`final`/`ghx`/`ghm`/`gfx`/`home`/
`services`/`detail`/`destinations`/`offers`/`booking`/`rm`/`links`) and
the site-wide language/accessibility audits (**0 untranslated strings, 0
a11y findings**) — none of which this stage's backend-only changes could
plausibly regress, and all of which were genuinely re-run, not assumed.

## 6. Status — checked against §30 acceptance

| Requirement | Met? |
|---|---|
| Real notification provider connected and verified | **NO** — no SMTP account exists |
| Notification outbox is durable | **YES** |
| Notification delivery is idempotent | **YES** (tested) |
| Delivery status is truthful | **YES** |
| Approved legal content published where supplied | **N/A** — none supplied; correctly NOT_CONFIGURED |
| Legal versions are auditable | **YES** (pre-existing, re-verified) |
| Legal acceptance is backend-enforced | **YES** (new this stage, tested) |
| Real authorized staff accounts provisioned | **NO** — none were supplied to provision |
| Role/permission boundaries verified | **YES** |
| Deactivation works | **YES** (fixed + tested this stage) |
| Audit trail works | **YES** |
| Security tests pass | **YES** |
| Regression tests pass | **YES** — 323/323 backend, full browser matrix, 0 untranslated, 0 a11y findings |
| Browser verification passes | **YES**, for every suite this sandbox can run |

Per this stage's own §30, not every criterion is met (items depending on a
real e-mail account and real employee identities cannot be), so:

**STATUS = PARTIALLY COMPLETE.**

## 7. Remaining gaps — exactly what is needed

1. **An e-mail provider decision and account** — any SMTP-compatible
   sender (a transactional provider, or the business's own mail
   infrastructure) — a commercial/operational decision, not a technical
   one. Once chosen, `BACKEND_MAILER=smtp` plus the five `BACKEND_SMTP_*`
   variables is the entire remaining configuration step; no code changes.
2. **SMS/WhatsApp providers**, if the business wants those channels —
   separate integrations, not attempted here per §10's own instruction to
   implement email first.
3. **Approved legal content** (Terms, Privacy, and any booking/
   cancellation policy the business wants published) from the business —
   `backend/legal.mjs` and its versioning already work; only the files
   (`legal/terms.ar.html`, `terms.en.html`, `privacy.ar.html`,
   `privacy.en.html`, `meta.json`) and `BACKEND_LEGAL_DIR` are missing.
4. **A list of real, authorized employees** (name, email, role, and the
   permissions each one needs) to actually provision through the now-
   complete invite flow — no code work remains for this either.
5. **Notification template content** — even once a provider is
   connected, nothing is delivered until an admin creates the actual
   Arabic/English subject/body text for each event through the existing
   `/notifications/templates` screen (Stage 15) — this is business content
   to write and approve, not a missing feature.
6. Real production hosting (Stage 16A), a real payment provider (Stage
   16B), and a real flight supplier (Stage 16C) are themselves still
   PARTIALLY COMPLETE for the identical reason — no external account
   exists in this sandbox for any of them.

None of items 1–5 can be produced by writing more code in this repository.
