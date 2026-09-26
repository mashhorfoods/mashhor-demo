# Operations control, service management & business integration — Stage 15

## 0. First-action audit: what Stage 14 actually is

The brief's own §01 required a full audit before writing any code, and an
explicit instruction: **"If Stage 14 is not actually implemented, do not
silently assume that it is complete."**

That audit (repository search, `docs/STAGES.md`, git history) found: **Stage
14 does not exist in this repository.** Stages 10–13 are built (public
site, booking engine, customer account, Stage 12.1/12.2 backend and
integration layer, Stage 13 supervisor system). There is no admin
dashboard, no operations UI, and no staff/admin identity of any kind prior
to this stage.

Stage 15 depends on *some* authenticated surface for operations staff to
act through — the brief's own §35 browser-verification checklist assumes
"Admin login, Dashboard, Booking operations, Task management, …" exist to
verify. Rather than silently assuming a Stage 14 admin dashboard and
building on top of it, or refusing the stage outright, this stage builds
**only what Stage 15 itself needs**: a minimal staff portal — one login,
one session type, shared by the Admin and Operations Staff roles named in
§22 — as the host for the operations control layer. It is explicitly **not**
a general admin dashboard: there is no user-management epic, no CMS, no
financial reporting suite, no supplier-contract management beyond the
fields Stage 15's own domain model needs. Anything broader belongs to a
real Stage 14, not to this one.

## 1. What this stage adds

- A backend-authoritative, configurable **booking lifecycle state machine**
  (`ops_status`, separate from the customer-facing `status` the booking
  engine already owns), with an audited transition history.
- A **task system** (create, assign, reassign, status) and an
  **escalation system**, both reusable across booking types.
- A **service operational catalogue** layered onto the existing
  `assets/js/data/services.js` registry (by id, never duplicating
  name/description) — active/booking-enabled flags, workflow type,
  supplier type, per-service **workflow steps** and **document
  requirements**.
- **Document review** (approve/reject with a reason) added to the existing
  `documents` table from Stage 12.2 — never a second documents entity.
- A **supplier/provider directory**, separate from booking state, plus a
  **booking↔supplier record** (reservation reference, ticket number,
  status) — never a provider credential or secret anywhere in this layer.
- **Customer-facing vs. internal booking notes**, enforced separate at the
  API layer: the customer's own `/me/bookings/:id` route only ever reads
  `type='customer'` notes.
- A **notification template** system (sanitized server-side: HTML stripped,
  `{{variables}}` kept as plain text) and a **delivery history** view that
  reuses the existing `outbox` table.
- A third role tier — **Admin** and **Operations Staff** — sharing one
  login and one session type, differentiated entirely by a **named
  permission list**, enforced server-side on every mutating route.
- A full **audit trail** (`audit_events`), distinct from the scrubbed
  technical `diagnostics` table Stage 12.2 built.

## 2. Booking lifecycle — the state machine

`ops_status` and `assigned_operator` are new columns on the existing
`bookings` table (Stage 12.2's table, not a new one). The transition graph
itself is **data, not code**: it lives in `business_config` (key
`booking_lifecycle`), the same mechanism Stage 13 used for the commission
model. `backend/staff.mjs`'s `transitionBooking()` is the single place a
status can change:

```
submitted → pending_review → awaiting_payment → payment_received → processing
  → supplier_pending → confirmed → ticketed → service_in_progress → completed
(+ cancelled / failed / refunded at the appropriate points)
```

This is the brief's own §03 example graph, seeded exactly as given and
marked `technical_example_pending_business_confirmation` in the config
row — it is **not** a business decision made by this implementation (see
§14 below).

Every transition:
- is rejected (`422 invalid`) unless it is in the current status's allowed
  list, read from `business_config` — never hard-coded in a screen;
- is rejected (`409 conflict`) if it would enter a **payment-gated**
  status (`payment_received`, `processing`, `confirmed`, `ticketed`,
  `service_in_progress`, `completed`) while `payment_status !== 'paid'` —
  the payment provider's own status stays authoritative;
- writes a `booking_status_history` row (bookingId, previousStatus,
  newStatus, actor, actorRole, reason, metadata, at) and an `audit_events`
  row, both server-side — the frontend never writes either directly.

The UI (`assets/js/ops/ui/bookings.js`) reads `allowedTransitions` back
from the booking-detail response and offers only those — an operator can
never even attempt an invalid transition from the screen, and a direct API
call to an invalid one is rejected the same way (verified in
`tests/backend.mjs`).

## 3. Operations workflow — tasks & escalations

`operation_tasks`: id, type, bookingId, customerId, supervisorId,
assignedTo, status (`open|in_progress|waiting|completed|cancelled`),
priority, dueAt, notes, createdBy, createdAt, updatedAt, completedAt.
Priority levels (`low|normal|high|urgent`) are read from
`business_config.task_priority_levels`, marked
`default_pending_confirmation` — the four values are used consistently
everywhere in this stage, but the business has not confirmed them as
final. Create/assign/reassign/status-change are each gated on
`task.manage`; every reassignment is audited.

`escalations`: id, bookingId, taskId, reason, severity, assignedTeam,
assignedOperator, status (`open|investigating|waiting|resolved|closed`),
createdBy, createdAt, updatedAt, resolvedAt. **No SLA duration is
invented** — `business_config.sla_config` exists as an empty, clearly
labelled placeholder for the business to fill in; nothing in this stage
reads or enforces a duration from it.

## 4. Service management

`services` extends the existing service ids (`flights, hotels, visa,
packages, umrah, transport, groups, medical, study, work, issue, change,
cancel` — the same 13 the public site already lists) with: active,
bookingEnabled, workflowType, supplierType, operationalRequirements. Names
and descriptions are **never duplicated** here — they stay owned by
`assets/js/data/services.js`; this table is purely the operational layer
Stage 15 adds on top, joined by id.

`service_workflows` (ordered steps, Arabic/English labels) is seeded only
for the four workflows the brief itself gave as examples — **flights,
visa, hotels, medical** — each genuinely different (the brief's own point
in §09: "do not hard-code one universal workflow"). The other nine
services have no seeded workflow and the UI shows that honestly ("no
workflow configured yet") rather than inventing one.

`service_document_requirements` (docType, required, customerUpload) exists
per service; none are seeded, since no document list was given in the
brief for any specific service, and inventing one would be exactly the
kind of business decision §38 forbids.

Document review reuses the existing `documents` table (Stage 12.2), adding
`review_status`, `reviewer_id`, `reviewed_at`, `rejection_reason` — never
a second documents entity, and never a permanent/public document URL
(the existing signed-URL mechanism from Stage 12.2 is unchanged).

## 5. Supplier / provider operations

`suppliers` (id, name, type, services[], status, integrationStatus,
supportedOperations[], contact, timestamps) is a directory, entirely
separate from booking state. `booking_suppliers` links one booking to one
supplier with its own status
(`not_required|pending|submitted|processing|confirmed|rejected|failed|cancelled`),
a **supplier reservation reference** and a **ticket/confirmation number**
kept as two distinct fields (never conflated with the booking's own
reference, per §19). No supplier integration is connected in this stage —
every supplier's `integrationStatus` reads `not_connected` and nothing in
the UI or backend claims a real reservation, ticket, or hotel confirmation
was made. No provider credential or secret is ever stored in a field this
layer exposes to the frontend.

## 6. Booking notes — customer-facing vs. internal

`booking_notes.type` is a hard `CHECK (type IN ('customer','internal'))`.
The customer's own account route
(`me.booking()` in `backend/routes.mjs`) only ever queries
`type='customer'` — there is no code path by which an internal note can
reach a customer-facing response. `tests/backend.mjs` asserts this
directly: an internal note written through the staff API never appears in
the customer's own booking read.

## 7. Communication centre

`notification_templates` (event, channel, subjectAr/En, bodyAr/En,
variables[], active, version, timestamps). `sanitizeTemplateBody()` strips
all HTML tags then escapes entities before storing a body — a template can
never carry a script or unsafe markup, and `{{variable}}` placeholders
survive as plain text for the (future, not-built-here) send pipeline to
substitute. Delivery history reuses the existing `outbox` table from Stage
12.2 rather than a new entity, and never claims a message was delivered
beyond what that record's own `status` says.

## 8. Roles and permissions

A third session tier, `staff`, mirrors the pattern Stage 12.2 (customer)
and Stage 13 (supervisor) already established: its own cookie pair
(`no_ops_session` / `no_ops_csrf`), its own session table
(`staff_sessions`), completely isolated from the other two — a customer or
supervisor session can never be read as a staff session and vice versa
(verified in `tests/backend.mjs`).

`role` is `admin` or `ops`. Admin implicitly holds every permission in the
fixed vocabulary below; `ops` holds only what is explicitly granted in
`staff.permissions_json`. **The backend is the sole authority** —
`requirePermission()` is called on every mutating route, and the frontend's
`can(permission)` helper (`assets/js/ops/auth.js`) only ever *hides* a
control the backend would reject anyway; it is documented in code as never
the authority. `tests/ops-portal.mjs` §6 confirms this against the real
backend: an Operations Staff fixture with a named, partial permission set
never sees the supplier control it lacks `supplier.manage` for, and a
region it lacks `supplier.view` for shows the backend's own "forbidden"
answer rather than an empty list.

The permission vocabulary (exactly the list in the brief's §25, no more):
`booking.view, booking.manage, booking.status.change, booking.assign,
task.view, task.manage, document.review, supplier.view, supplier.manage,
notification.send, notification.manage, service.manage, workflow.manage,
report.view, audit.view`. (`notification.manage` was added alongside the
brief's `notification.send` to distinguish "compose/manage templates" from
"trigger a send" — both gate real routes; nothing in the vocabulary is
unenforced.)

## 9. API surface (implemented subset)

```
POST   /staff/auth/sign-in · /refresh · /sign-out · /reset/request · /reset · /change-password
GET    /operations/tasks | /operations/escalations           task.view / task.view
POST   /operations/tasks | /operations/escalations           task.manage
POST   /operations/tasks/:id/assign | /status                task.manage
POST   /operations/escalations/:id/status                    task.manage
GET    /bookings | /bookings/:id                              booking.view
POST   /bookings/:id/status                                   booking.status.change (+ payment gate)
POST   /bookings/:id/assign                                   booking.assign
GET/POST /bookings/:id/notes                                  booking.view / booking.manage
POST   /bookings/:id/supplier                                 supplier.manage
POST   /documents/:id/review                                   document.review
GET    /services | /services/:id | /services/:id/workflow | /services/:id/documents   (staff, any role)
POST   /services/:id | /services/:id/workflow | /services/:id/documents               service.manage / workflow.manage
GET    /suppliers                                               supplier.view
POST   /suppliers                                                supplier.manage
GET/POST /notifications/templates                              notification.manage
GET    /notifications/history                                   notification.send
GET    /audit                                                    audit.view
```

## 10. Domain model (new entities only)

`Staff, StaffSession, BookingStatusHistory, OperationTask, Escalation,
Service, ServiceWorkflow, ServiceDocumentRequirement, Supplier,
BookingSupplier, BookingNote, NotificationTemplate, AuditEvent`. Booking,
Document, Payment, Customer, Supervisor and their sessions are the
existing Stage 12.2/13 entities, extended with new columns where the
brief required it (`bookings.ops_status`/`assigned_operator`,
`documents.review_*`) and never duplicated.

## 11. Frontend architecture

`assets/js/ops/` mirrors the supervisor portal's own structure exactly
(`auth.js`, `data.js`, `adapters/{dev,api,not-connected,installed}.js`,
`ui/{shell,dashboard,bookings,tasks,escalations,services,suppliers,
notifications,audit,settings,auth-screens}.js`), registered from
`assets/js/page.js` behind the same `ENV`-driven adapter selection Stage
12.1 introduced. The dev adapter persists nothing across a full page
reload by design (a fresh module instance each navigation) — screens that
mutate dev data refresh themselves in place rather than relying on
cross-reload persistence, which is exercised directly in
`tests/ops-portal.mjs`.

Pages live under `admin/*` (reserved as a supervisor slug since Stage 13,
so there is no collision with the public `supervisor/<slug>` profile
registry): `dashboard, bookings, tasks, escalations, services, suppliers,
notifications, audit, settings, sign-in, forgot-password, reset-password,
sign-out`. All are `noindex, nofollow`, exactly like the supervisor portal.

CSS: `assets/css/24-ops-portal.css` adds only what Stage 13's own
`23-supervisor-portal.css` did not already provide (inline action forms,
the workflow-step list, the audit trail's data columns) — every table,
metric, filter and card class is reused as-is.

## 12. Security testing (§30/§33 of the brief)

- Every mutating route requires `requirePermission()` — verified directly
  at the API layer (not just "the button is hidden") in `tests/backend.mjs`:
  an `ops` fixture with a named permission set gets `403 forbidden` calling
  a route outside that set, even with a valid session and CSRF token.
- CSRF: the staff session's own token is required on every mutating call,
  the same double-submit pattern as the customer/supervisor sessions.
- Session isolation: a customer or supervisor session token is rejected by
  every `/operations/*`, `/bookings/*` (staff view), `/services*`,
  `/suppliers*`, `/notifications/*`, `/audit` route, and vice versa.
- Rate limiting and exact-origin CORS reuse the existing Stage 12.2
  middleware — no new surface was added that bypasses it.
- No secret, credential, or permanent document URL is ever placed in a
  staff-facing response; suppliers' `integrationStatus` is the only
  integration detail exposed, never a key or token.
- `tests/ops-portal.mjs` §6 repeats the cross-role checks in a real
  browser against the real backend (not just the dev stand-in), confirming
  the UI's `can()` gate and the backend's own `requirePermission()` agree.

## 13. Responsive, RTL/LTR, accessibility

Verified at 390×844 (mobile), 834×1100 (tablet) and 1440×1000 (desktop),
in both Arabic (RTL) and English (LTR), across sign-in, dashboard,
bookings, tasks, escalations, services, suppliers, notifications, audit
and settings: exactly one `<h1>`, no horizontal scroll, `noindex` present,
no font under 12px, every input/select/textarea has an accessible name
(a `<label for>` or `aria-label` — none left bare), and the portal nav
marks the current item with `aria-current`. English screens are checked
for zero residual Arabic text. See `tests/ops-portal.mjs` §5 for the full
matrix and `.playwright-mcp`-style screenshots saved per width/language.

## 14. Business decisions still required (§38 of the brief)

This implementation deliberately does **not** decide, and instead built
configurable architecture with the placeholder marked as
`pending_business_confirmation` in `business_config`:

1. **The final booking lifecycle** — the state graph in §2 above is the
   brief's own worked example, not a confirmed business rule.
2. **SLA durations** for escalations (`business_config.sla_config` is an
   empty placeholder).
3. **Task priority levels and their meaning** — the four levels used are a
   reasonable default, not confirmed.
4. **Document requirements per service** — none are seeded; every service
   needs an explicit list from the business (which documents, whether
   customer-uploaded, whether required).
5. **Workflow steps for the nine services without a seeded workflow**
   (packages, umrah, transport, groups, study, work, issue, change,
   cancel) — only flights/visa/hotels/medical were given as examples.
6. **Real supplier integrations** — every supplier in this stage is
   `integrationStatus: not_connected`; no real reservation, ticketing, or
   hotel-confirmation API is called anywhere.
7. **Notification send pipeline** — templates and sanitization exist;
   actually dispatching a message through a real provider (SMS/email/push)
   is not built in this stage, matching Stage 12.2's own mailer seam.
8. **Commission, refund and cancellation policy** — untouched, carried
   over unresolved from Stage 13 (`docs/SUPERVISOR-SYSTEM.md` §14).
9. **Real staff identities** — `staff-admin-1` / `staff-ops-1` are fixture
   accounts for testing only; production staff provisioning is a business
   process, not a frontend decision.
10. **The minimal-staff-portal scope decision itself** (§0 above) — a
    genuine Stage 14 admin dashboard, if the business wants one beyond
    what Stage 15 needed, is unbuilt and should be scoped separately.

## 15. Files

```
backend/migrations/003_operations.sql   staff, staff_sessions, staff_reset_tokens, ops_status/assigned_operator,
                                         booking_status_history, operation_tasks, escalations, services,
                                         service_workflows, service_document_requirements, documents.review_*,
                                         suppliers, booking_suppliers, booking_notes, notification_templates,
                                         audit_events, business_config seeds
backend/staff.mjs · staff-routes.mjs    identity, permissions, state machine, tasks, escalations, services,
                                         suppliers, notes, templates, audit — all route handlers
backend/http.mjs                        no_ops_session / no_ops_csrf cookies
backend/server.mjs                      /staff/auth/*, gated /operations|bookings|documents|notifications routes
backend/fixtures.mjs                    staff-admin-1, staff-ops-1, and one fixture of every Stage 15 entity
assets/js/ops/                          auth.js, data.js, adapters/{dev,api,not-connected,installed}.js,
                                         ui/{shell,dashboard,bookings,tasks,escalations,services,suppliers,
                                         notifications,audit,settings,auth-screens}.js
assets/css/24-ops-portal.css            inline action forms, workflow steps, audit columns
admin/{dashboard,bookings,tasks,escalations,services,suppliers,notifications,audit,settings,
  sign-in,forgot-password,reset-password,sign-out}/index.html
assets/js/core/strings/{ar,en}.js       ops.* and page.ops.* (parity verified: 1490 keys each language)
tests/backend.mjs (+Stage 15 block, 130 checks total) · tests/ops-portal.mjs (499 checks)
```

## 16. Final status

**Stage 15 — PARTIALLY COMPLETE.** Implemented and verified: the state
machine, task/escalation systems, service operational catalogue, document
review, supplier directory, note isolation, notification templates and
history, the three-role permission system enforced server-side, the audit
trail, and a real end-to-end pass against the Stage 12.2 backend
confirming permission isolation between an Admin and an Operations Staff
fixture. Not connected: a deployed backend (the same gap Stage 12.2/13
already carry), any real supplier/payment/ticketing integration, an
outbound notification send pipeline, and the ten business decisions in
§14 above. See the final report delivered alongside this document for the
brief's required 16-item summary.
