# Stage 15B — Apply & Verify Business Rules

## 1. Source-of-truth audit

Read the Stage 15A register (`business_config`, `docs/BUSINESS-RULES.md`)
and cross-checked its `status` column against the live repository state.
Result: **9 of the 10 registered rules are DRAFT or PENDING; only
`admin_dashboard_scope` is ACTIVE** (a delivered-scope statement, not a
runtime behaviour rule). No rule crossed from PENDING/DRAFT to
APPROVED/ACTIVE as part of this stage — Stage 15B does not resolve a
single business decision. What it does is close a real architecture gap
this audit found: two of the register's own rules (`booking_lifecycle`,
`task_priority_levels`, `commission_model`) were already read live by
domain code, but that code's returned `status` field came from a
second, independently-stale copy embedded in the JSON value, not the
register's own status column — so an admin activating a rule would not
be reflected anywhere a consumer actually looked. See §4 of
`docs/BUSINESS-RULES.md` for the fix.

## 2. Current system audit

Verified against the actual code (not assumed) for every area §2 of the
brief lists:

| Area | Finding |
|---|---|
| Booking domain/lifecycle | `transitionBooking()` reads `lifecycleConfig()` live, every call — no caching to invalidate |
| Payment gates | previously a hardcoded `Set`; now reads live from the register (§4.1, `docs/BUSINESS-RULES.md`) |
| Customer ownership | `/me/*` routes filter by `customer_id = ctx.customer.id` on every query — unchanged, re-verified |
| Supervisor attribution | `assignAttribution`/`reassignAttribution` unchanged; first-touch, admin-reassignment-only, full history |
| Supervisor rights/commission | `commissionModel()` now reads the register's status column too; still returns `model: null` — no calculation exists anywhere in the codebase (grepped, confirmed) |
| Operations/tasks/escalations | Stage 15, unchanged; grepped for "overdue"/"SLA" — no such computation exists anywhere |
| Services/documents | `service_workflows`/`service_document_requirements` unchanged; 4/13 services configured |
| Suppliers | `suppliers.integration_status` unchanged; fixture stays `not_connected` |
| Payments | read-only views unchanged; no settlement/refund calculation anywhere (grepped, confirmed) |
| Notifications | `outbox`-backed history unchanged; no real provider, `queued`/`failed` only |
| Audit | `audit_events` unchanged; every business-rule mutation writes `businessRule.update` |
| Permissions | `rules.view`/`rules.manage` (Stage 15A) unchanged; re-verified end-to-end here |
| Admin Dashboard | unchanged; the register's manage form gained a raw-value JSON editor (§18 requirement) |
| Business configuration | `business_config`/`business_config_history` — the wiring fix is the only structural change |

## 3. What was applied

Nothing new was approved or activated as a permanent change. What
changed is **plumbing**, verified to produce identical current
behaviour and correct future behaviour:

1. `lifecycleConfig()`, `taskPriorityLevels()` (`backend/staff.mjs`) and
   `commissionModel()` (`backend/supervisor.mjs`) now derive their
   `status` field from the register's own status column.
2. Payment gates (`backend/staff.mjs`) read live from
   `business_config.payment_gates.gatedStatuses` instead of a hardcoded
   `Set` — same default values, now admin-editable.
3. The Business Rules manage form gained a JSON value editor
   (`rules.manage` only), client-side validated.

## 4. What remains protected (verified, not assumed)

Per §19 of the brief, for every PENDING/unconfigured area:

- **Commission** — `commissions` table is never written to with a
  calculated amount anywhere in the codebase (grepped); the API always
  returns `model: null`.
- **SLA** — no code path computes "overdue" or an SLA breach anywhere
  (grepped, zero matches); verified via a live API response scan in
  `tests/backend.mjs`.
- **Refund/cancellation** — no fee or eligibility calculation exists
  anywhere; `payment_status='refunded'` is only ever set by an external
  payment-provider signal, never inferred.
- **Unconfigured service workflows** — `serviceWorkflow()` returns an
  empty array for a service with no configured steps; the UI shows it
  as empty, never a fabricated default.
- **Not-connected suppliers** — `integration_status` never
  auto-transitions to `connected`; no code path does this.
- **Notifications** — `outbox` status is only ever `queued`/`sent`/
  `failed` as set by the real (absent) provider integration; never
  claimed delivered without one.

## 5. Verification methodology

- **API tests** (`tests/backend.mjs`, Stage 15B section, 16 new checks):
  live-wiring proof (activate a rule → resolved status flips
  immediately with no reload step; disable → reverts), payment-gate
  live editing (empty the gated list → a normally-blocked transition
  succeeds; restore it → the next gated transition is blocked again),
  pending-rule protection (commission/refund/cancellation/SLA still
  carry a `null` value), the customer/ops status boundary (a customer
  reading their own booking never sees `opsStatus`/`assignedOperator`),
  and three direct-API authorization checks (a customer session cannot
  transition a booking; a supervisor session cannot activate a business
  rule; no session at all cannot reach the register).
- **Browser tests** (`tests/ops-portal.mjs`, extended): the JSON value
  editor — an invalid value is caught client-side with an inline error
  and never submitted; a valid value is applied and re-rendered.
- **Full regression**: every earlier stage's suite, run to green.

## 6. Realistic scenarios (already covered, re-verified this stage)

- **Scenario A (customer booking)** — `tests/journey.mjs`/`booking.mjs`:
  unchanged, green.
- **Scenario B (supervisor customer)** — `tests/supervisor.mjs`/
  `supervisor-portal.mjs`: unchanged, green; attribution persistence
  re-verified via the Stage 15B commission-status check (reads the same
  live `commissionModel()` a supervisor's own revenue view uses).
- **Scenario C (operations)** — `tests/ops-portal.mjs` real-backend
  section: unchanged, green; the payment-gate live-edit test in this
  stage is a variant of this scenario proving the gate mechanism
  responds to admin configuration.
- **Scenario D (invalid action)** — the three new direct-API
  authorization checks above, plus the large pre-existing set in
  `tests/backend.mjs`'s Stage 13/14/15/15A sections.
- **Scenario E (pending rule)** — the four pending-protection checks
  above (§4).

## 7. Security verification

Unchanged pattern, re-verified: server-side authorization on every new
and existing route, CSRF on every state change, exact-origin CORS,
customer/supervisor/staff session isolation, no secret in any response,
no sensitive value in diagnostics. No new attack surface was introduced
— the payment-gate live-wiring reads the *same* table every other
register rule already did, behind the *same* `rules.manage` permission
check as every other mutation.

## 8. Regression, browser, accessibility, performance

- Full `npm test` (21 suites + i18n/a11y audits): all green.
- `tests/ops-portal.mjs`: 900/900 passed, 0 console/network problems.
- `tests/backend.mjs`: 201/201 passed.
- Responsive/RTL/LTR: unchanged screens re-verified as part of the
  existing ops-portal matrix; no new screen was added this stage (the
  value editor is inline on the existing rule-detail screen).
- Performance: no new query pattern — `paymentGates()`/
  `lifecycleConfig()`/`taskPriorityLevels()`/`commissionModel()` are all
  the same single-row `SELECT` as before (now selecting one extra
  column), called at the same call sites, no additional round trip.

## 9. Known limitations

- The value editor is a raw JSON textarea, not a schema-aware form per
  rule type — acceptable for an internal admin tool at this data
  volume (10 rules), revisit if the register grows much larger.
- `refund_policy`/`cancellation_policy`/`sla_config`/`attribution_model`/
  `staff_provisioning` have no live domain-function reader yet, because
  no feature consumes them — wiring a reader with nothing to read would
  be speculative; add one only when a real feature needs the value.

## 10. Unresolved rules (unchanged by this stage)

Identical to `docs/BUSINESS-RULES.md` §17 — booking lifecycle graph,
SLA values, task priority policy, required documents/workflows for 9
services, real supplier integrations, notification delivery pipeline,
commission/refund/cancellation policy values, real staff provisioning.

## 11. Final verification matrix

| Rule | Status | Applied | Verified | Tests | Browser | Notes |
|---|---|---|---|---|---|---|
| Booking lifecycle graph | DRAFT | NO | YES | ✓ | ✓ | mechanism active; graph unconfirmed |
| Payment gates | DRAFT | NO | YES | ✓ | — | now live-configurable; default unchanged |
| Cancellation policy | PENDING | NO | YES | ✓ | — | `null`, no fee logic exists |
| Refund policy | PENDING | NO | YES | ✓ | — | `null`, no calc logic exists |
| Supervisor attribution | DRAFT | NO | YES | ✓ | ✓ | first-touch active as a technical default |
| Commission model | PENDING | NO | YES | ✓ | — | `null`; register status now visible live |
| Task priority levels | DRAFT | NO | YES | ✓ | ✓ | vocabulary active; ordering unconfirmed |
| SLA targets | PENDING | NO | YES | ✓ | — | `null`; no breach detection exists |
| Service workflows | PARTIALLY_CONFIGURED | N/A | YES | ✓ | ✓ | 4/13 configured, rest honestly NOT_CONFIGURED |
| Suppliers | NOT_CONNECTED | N/A | YES | ✓ | ✓ | never falsely marked connected |
| Notifications | NOT_CONNECTED | N/A | YES | ✓ | — | `queued`/`failed` only |
| Staff provisioning | PENDING | NO | YES | ✓ | ✓ | mechanism built, no real hire |
| Admin Dashboard scope | ACTIVE | YES | YES | ✓ | ✓ | delivered scope, Stage 14 + 15A/B |

No rule shows `APPLIED = YES` unless it was already `ACTIVE`/`APPROVED`
before this stage (only `admin_dashboard_scope`). Every `NOT_CONNECTED`
integration remains `NOT_CONNECTED`.
