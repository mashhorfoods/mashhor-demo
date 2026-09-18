# Business Rules — Stage 15A

## 0. Source-of-truth audit

Before writing any code, this stage audited what the codebase already
decided about the ten areas Stage 15's own status report named
unresolved. The finding: **every one of them already had an honest
answer in the code** — Stage 13 (`migrations/002_supervisors.sql`) and
Stage 15 (`migrations/003_operations.sql`) had already seeded a
`business_config` table with exactly the "explicitly NOT decided yet"
rows the brief describes:

| Area | Existing row | Existing state (before this stage) |
|---|---|---|
| Booking lifecycle | `booking_lifecycle` | technical example, not business-confirmed |
| Task priority | `task_priority_levels` | default working vocabulary, not confirmed |
| Refund policy | `refund_policy` | `null`, `pending_business_configuration` |
| Cancellation policy | `cancellation_policy` | `null`, `pending_business_configuration` |
| SLA | `sla_config` | `null`, `pending_business_configuration` |
| Commission | `commission_model` | `null`, `pending_business_configuration` |
| Supervisor attribution | `attribution_model` | first-touch, `pending_business_confirmation` |
| Required documents / workflows | `service_workflows`/`service_document_requirements` | 4/13 services configured, rest genuinely unconfigured |
| Real supplier integrations | `suppliers.integration_status` | `not_connected` |
| Notification delivery | `outbox` | `queued`, never claimed delivered |

What was genuinely **missing** was a formal, versioned, auditable
**register** around these values (the brief's exact rule_id/category/
name/status/source/effective_from/effective_to/updated_by schema), a
Pending Decision Center, a Final Business Rule Matrix, and an Admin UI
to see and change any of it. This is what Stage 15A adds. **No business
value was invented or resolved** — every seeded register row carries
forward the exact value and pending/technical-default nature the
codebase already had (verified byte-for-byte during migration).

Two corrections the audit itself produced, both caught by testing the
migration against the real schema rather than assuming: attribution was
initially assumed "confirmed" — the actual seeded row says
`pending_business_confirmation`, so it is registered as **DRAFT**, not
ACTIVE; and `attribution_model` already existed as a `business_config`
row since Stage 10/13, so this stage's migration **updates** that row's
register metadata rather than inserting a duplicate.

## 1. Architecture

The register **is** `business_config` (Stage 13/15's own table),
extended with descriptive columns rather than replaced by a second
table — no duplicate configuration system (§30). A new companion table,
`business_config_history`, holds every superseded version: a mutation
always archives the current row there before overwriting it, so no
business decision is ever lost. Domain logic lives in
`backend/business-rules.mjs`; routes live in `backend/staff-routes.mjs`'s
`dashboard` object under `/admin/rules/*`; the UI is
`assets/js/ops/ui/business-rules.js`, reachable at `admin/business-rules/`.

## 2. Business Rule Register schema

Every row (`business_config`) carries:

| Column | Meaning |
|---|---|
| `key` | the rule_id |
| `category` | e.g. `commission`, `sla`, `cancellation`, `booking_lifecycle` |
| `name` / `description` | human-readable |
| `value_json` (`currentValue`) | the rule's actual value — `null`/no fabricated figure until approved |
| `allowed_values_json` | optional enumerated choices, when relevant |
| `status` | `DRAFT` \| `PENDING` \| `APPROVED` \| `ACTIVE` \| `DISABLED` \| `SUPERSEDED` |
| `source` | where the value/status came from (a brief section, an implementation) |
| `effective_from` / `effective_to` | when the current version took effect; `effective_to` is set only in history rows |
| `updated_by` / `updated_at` | the staff id and timestamp of the last change |
| `notes` | free-text admin annotation |

`status` values and their meaning:

- **DRAFT** — a technical default is in effect (the code does something),
  but the business has not confirmed it as final policy.
- **PENDING** — no value or mechanism exists at all yet; the field is
  `null` and stays `null` until supplied.
- **APPROVED** — confirmed by the business but not yet switched live.
- **ACTIVE** — confirmed and in effect.
- **DISABLED** — was active, deliberately turned off.
- **SUPERSEDED** — reserved for a future version scheme; not currently
  auto-applied by any mutation (every current mutation moves a row
  between the other five statuses; history rows are what "superseded"
  really means in practice today).

## 3. The ten registered rules

| rule_id | category | status | value |
|---|---|---|---|
| `booking_lifecycle` | booking_lifecycle | DRAFT | the Stage 15 brief's own worked-example graph (initial state, transitions per status) |
| `payment_gates` | payment | DRAFT | `PAYMENT_GATED` — which ops statuses require `payment_status='paid'` first |
| `attribution_model` | attribution | DRAFT | `first-touch`, never overwritten once set |
| `task_priority_levels` | task_priority | DRAFT | `[low, normal, high, urgent]`, unordered-by-business-severity |
| `commission_model` | commission | PENDING | `null` |
| `refund_policy` | refund | PENDING | `null` |
| `cancellation_policy` | cancellation | PENDING | `null` |
| `sla_config` | sla | PENDING | `null` |
| `staff_provisioning` | staff | PENDING | mechanism built (Stage 14's reset-token flow), no real hire yet |
| `admin_dashboard_scope` | admin | ACTIVE | the delivered module list (Stage 14 + this stage) |

Per-service and per-supplier configuration (workflows, document
requirements, supplier integration status) is **not** duplicated into
this register — it already has its own tables
(`services`/`service_workflows`/`service_document_requirements`,
`suppliers`) and is read directly by the Pending Decision Center and
Final Matrix (§5/§6 below), never re-expressed as a second source of
truth (§30).

## 4. Booking lifecycle & payment gates

The **mechanism** (the state machine in `backend/staff.mjs`,
`transitionBooking`, and the `PAYMENT_GATED` set) is active and
enforced server-side regardless of the register's status — Stage 15A
does not touch behaviour, only how the still-unconfirmed graph is
tracked and surfaced. An invalid transition is rejected with 422; a
payment-gated transition on an unpaid booking is rejected with 409 —
both already covered by `tests/backend.mjs`'s Stage 15 section,
unchanged. The register documents:

- every status and its allowed transitions (from `lifecycleConfig()`);
- which statuses require `payment_status='paid'` first, and what
  happens on failure (remains at the pre-gate status), cancellation
  (moves to `cancelled`, gate never crossed), and timeout (**not
  implemented** — no automatic timeout exists; this is stated plainly
  rather than pretended).

## 5. Cancellation & refund

Both are `PENDING` with `value: null`. No refund percentage, fee,
notice period or cancellation state beyond what the booking engine
already tracks (`status='cancelled'`, `payment_status='refunded'`, both
set only by an external payment provider signal, never inferred here)
exists. The register structure (category/description/allowed_values)
is ready to hold a real policy the moment the business supplies one;
until then the Admin UI shows exactly `null` / "Pending", never a
placeholder number.

## 6. Commission / supervisor rights

Unchanged from Stage 13: `commissionModel()` returns
`{ model: null, status: 'pending_business_configuration' }`; every
commission row in the `commissions` table is written with a `null`
amount and `pending_configuration` status. Stage 15A registers this
fact (`commission_model`, category `commission`) without choosing a
percentage, fixed amount, trigger or cancellation/refund treatment.
Attribution (§8 below) is correctly kept a separate rule from
commission — reassigning a customer's supervisor never touches a
commission row, and a commission calculation basis is not implied by
attribution alone.

## 7. Supervisor attribution

`attribution_model` (DRAFT): first-touch, implemented since Stage 10,
confirmed **as current, unchanged technical behaviour** — but not yet
approved as final business policy, hence DRAFT rather than ACTIVE. The
rule itself (`assignAttribution` in `backend/supervisor.mjs`) is
untouched by this stage: a customer's first attributed supervisor is
permanent; reassignment is admin-only (`attribution.view` +
`supervisor.manage`, Stage 14) and preserves full history
(`attribution_events`). Survival through Navigation → Authentication →
Booking → Payment → Confirmation was verified in Stage 13's own test
suite and is unchanged.

## 8. Task priority

`task_priority_levels` (DRAFT): `[low, normal, high, urgent]`, a
working vocabulary with no confirmed ordering-to-severity or SLA
relationship. Stage 15's task queue already uses this list; Stage 15A
adds no new priority values and does not invent an SLA link.

## 9. SLA

`sla_config` (PENDING, `targets: null`). No SLA duration, warning
threshold or escalation threshold exists anywhere in the system — tasks
and escalations have no time-based rule. The register structure is
ready (category `sla`) but genuinely empty until supplied.

## 10. Required documents & service workflows

Read directly from `services`/`service_workflows`/
`service_document_requirements` (Stage 15), not duplicated into the
register. As of this stage: 4 of 13 services (flights, visa, hotels,
medical) have a configured workflow; the rest remain honestly
`NOT_CONFIGURED` — the Pending Decision Center lists each one by id
rather than inventing a workflow for it.

## 11. Suppliers

Read directly from `suppliers.integration_status` (Stage 15), not
duplicated into the register. The fixture supplier is `not_connected`;
the Pending Decision Center and Final Matrix report this honestly —
no supplier is ever shown as `connected` without a real, verified
integration.

## 12. Notifications

Unchanged from Stage 15: templates + the existing `outbox` table
(`QUEUED`/`SENT`/`FAILED`, never a claimed delivery without a real
provider). Stage 15A does not add a notification policy register row
because no channel/recipient/timing rule has been supplied to register
— this remains implicit in "not connected" until a real provider
exists.

## 13. Pending Decision Center

`GET /admin/rules/pending` (`rules.view`) — a single computed read,
never a duplicate table: every register rule with status `PENDING` or
`DRAFT`, plus every service with no configured workflow, plus every
supplier not `connected`. Rendered as its own panel on the Business
Rules screen.

## 14. Final Business Rule Matrix

`GET /admin/rules/matrix` (`rules.view`) — every register rule plus two
computed coverage rows (service workflow coverage, supplier integration
coverage), each a plain `configured/total` tally, never a fabricated
percentage or score.

## 15. Versioning & audit

Every mutation (`PATCH /admin/rules/:id`, `POST /admin/rules/:id/
activate`, `POST /admin/rules/:id/disable`, all `rules.manage`) first
archives the current row into `business_config_history` (with a fresh
`effective_to` stamp), then applies the change and writes an
`audit_events` row (`businessRule.update`, actor id/role, previous vs.
new status). A status change is rejected with 422 unless it is one of
the six defined values — nothing is ever left in an unrecognised state.
Nothing is ever destructively overwritten: `GET /admin/rules/:id/
history` returns every prior version, newest first.

## 16. Security model

Identical pattern to Stage 14: `rules.view` and `rules.manage` are
separate permissions in `staff.mjs`'s `PERMISSIONS` vocabulary, checked
server-side on every route; the frontend nav hides the module entirely
for a staff member without `rules.view`, and the change-status form is
hidden (not just disabled) for one without `rules.manage`. Operations
Staff hold neither by default — only an explicit grant (as tested with
the fixture `staff-ops-2` account, which holds `rules.view` but not
`rules.manage`) reaches the register at all.

## 17. Pending business decisions (unchanged by this stage)

This stage did not resolve any of the following — it only made their
unresolved state explicit, versioned and visible:

1. Final booking lifecycle graph
2. SLA values
3. Task priority policy (ordering/severity meaning)
4. Required documents for the 9 unconfigured services
5. Workflows for the 9 unconfigured services
6. Real supplier integrations
7. Notification delivery pipeline (a real provider)
8. Commission / refund / cancellation policy (values)
9. Real staff provisioning (actual hiring through the built mechanism)
10. Any future change to the Admin Dashboard's delivered scope

## 18. Testing

- **Backend** (`tests/backend.mjs`) — 16 new checks: permission
  enforcement (`rules.view`/`rules.manage` as separate gates), the
  register reads back every seeded value unmodified (`model: null`,
  `policy: null`, `targets: null`), DRAFT classification for the
  lifecycle graph and attribution model, category filtering, 404 for an
  unknown rule, the Pending Decision Center's computed union, the Final
  Matrix's computed coverage counts, activate/disable/update with
  history growing on every change, a rejected invalid status (422), and
  an audit trail entry per mutation.
- **Browser** (`tests/ops-portal.mjs`, extended) — the route's
  auth-guard, the full nav list including `rules`, the register/pending/
  matrix panels populated against the development stand-in, activating
  a rule from the UI and seeing its status and history update, the
  responsive/RTL/LTR matrix, and a real-backend pass confirming
  `rules.view`-only staff see the register and a rule's details but
  never the manage form.
- Full regression (`npm test`) run to green before this stage was
  considered complete.
