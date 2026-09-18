# Admin Dashboard — Stage 14

## 0. First-action audit: what already existed

Before writing any code, this stage audited the actual implementation
status of the stages it sits on top of, per the brief's own §1:

- **Stage 10–11** (public site, booking journey) — built and unchanged.
- **Stage 12 / 12.1 / 12.2** — customer identity, account, and the real
  deployable backend (SQLite, sessions, CSRF, CORS, signed URLs) — built
  and unchanged.
- **Stage 13** — the supervisor system: a separate credential/session
  store, attribution (`assignAttribution`, first-touch, never overwritten),
  scoped read models (`supervisorCustomers`, `supervisorBookings`,
  `supervisorLeads`, `supervisorRevenue`, `supervisorPerformance`,
  `supervisorCommissions` — each already taking an explicit `supervisorId`
  parameter, not session-derived) and a disabled-by-default bearer-token
  reassignment route (`/admin/attribution/reassign`, `backend/supervisor-
  routes.mjs`'s `admin.reassign`, guarded by `BACKEND_ADMIN_TOKEN`) — built
  and unchanged.
- **Stage 15** — a minimal authenticated staff portal (Admin + Operations
  Staff roles, one session type, `backend/staff.mjs`) and the full
  **operations control layer**: booking lifecycle state machine
  (`ops_status`), tasks, escalations, service catalogue + workflow +
  document requirements, document review, supplier directory,
  customer/internal notes, notification templates + history, and the audit
  trail (`audit_events`). Built and unchanged.

**What was genuinely absent**: an admin-wide view across customers,
supervisors, payments, and documents; supervisor account provisioning
through any API; staff account provisioning through any API beyond the
two hand-seeded fixture accounts; descriptive reporting; a global search;
and the nav/UI to reach any of it. This is what Stage 14 adds — the
**management/oversight layer above** Stage 15's operational engine, never
a second copy of it (§30).

## 1. Architecture

UI → API → domain functions → SQLite, the same separation every earlier
stage uses. The Admin Dashboard's own domain functions live in
`backend/staff.mjs` (customers, payments, documents, staff accounts,
reports, overview, search) and `backend/supervisor.mjs` (supervisor
management, admin-wide leads/attribution) — both read tables that Stage
12/12.2/13/15 already own; **no new domain entity, task/escalation/
service/supplier/notification/audit/permission/lifecycle system was
created** (§29/§30). Route handlers live in `backend/staff-routes.mjs`'s
new `dashboard` export, wired into `backend/server.mjs` under a single
`/admin/*` prefix (kept separate from the pre-existing bearer-token
`/admin/attribution/reassign` route, matched by exact path before the
prefix block so the two never collide).

The frontend follows the same adapter pattern as every stage before it:
`assets/js/ops/data.js` (facade) → `assets/js/ops/adapters/{api,dev,not-
connected}-ops-data.js` → the seven new screens under `assets/js/ops/ui/`.

## 2. Roles & permissions

Reuses Stage 15's `PERMISSIONS` vocabulary, `hasPermission`/
`requirePermission` (`backend/staff.mjs`) and its three-tier session
model (`admin` implicitly holds every permission; `ops` holds only an
explicit `permissions_json` list). Seven permissions were added on top of
Stage 15's, for the Admin Dashboard's own modules:

| Permission | Gates |
|---|---|
| `customer.view` | Overview, Customers list/detail, global search's customer/booking categories |
| `supervisor.view` | Supervisors list/detail |
| `supervisor.manage` | Create/update a supervisor, activate/deactivate; combined with `attribution.view` for reassignment |
| `payment.view` | Payments list |
| `document.view` | Admin-wide document browse |
| `attribution.view` | Leads, attribution history; combined with `supervisor.manage` for reassignment |
| `staff.manage` | Staff & Permissions: list/create/activate/deactivate/set-permissions |
| `rules.view` | Business Rules (Stage 15A): view the register, pending decisions, final matrix |
| `rules.manage` | Business Rules: change a rule's status/value/notes |

Every one of these is enforced **server-side** in `staff-routes.mjs`'s
`dashboard` object via `requirePermission(ctx.staff, '...')` — the
frontend's `can(permission)` helper (from `hasOpsPermission`) only decides
what a control *renders as*; a staff member reaching an endpoint directly
without the permission gets the backend's own 403, not a client-side
guess. The nav (`assets/js/ops/ui/shell.js`) hides a module entirely when
the signed-in staff member lacks its permission, matching the actual
enforcement rather than just cosmetically greying out a control.

Reassignment (`POST /admin/customers/:id/reassign`) requires **both**
`attribution.view` and `supervisor.manage` — it reuses the exact same
`reassignAttribution()` function Stage 13's bearer-token route already
called, so history/audit behaviour is identical; the old route is
untouched for compatibility.

## 3. Routes

All under `/admin/*`, staff-session-gated (`ctx.staffSession`), each
handler additionally permission-gated as in §2:

```
GET  /admin/overview
GET  /admin/search?q=...
GET  /admin/customers?search=&page=&pageSize=
GET  /admin/customers/:id
POST /admin/customers/:id/reassign        { supervisorId }
GET  /admin/supervisors?search=&page=&pageSize=
POST /admin/supervisors                   { slug, nameAr, nameEn, email, phone, city }
GET  /admin/supervisors/:id
PATCH /admin/supervisors/:id              { slug?, nameAr?, ..., active? }
GET  /admin/leads?supervisorId=&status=&page=&pageSize=
GET  /admin/attribution-events?supervisorId=&customerId=&page=&pageSize=
GET  /admin/payments?customerId=&bookingId=&status=&page=&pageSize=
GET  /admin/documents?customerId=&bookingId=&reviewStatus=&page=&pageSize=
GET  /admin/reports/bookings
GET  /admin/reports/operations
GET  /admin/reports/suppliers
GET  /admin/reports/documents
GET  /admin/reports/notifications
GET  /admin/staff
POST /admin/staff                         { email, name, role, permissions? }
POST /admin/staff/:id/active              { active }
POST /admin/staff/:id/permissions         { permissions }
GET  /admin/rules?category=&status=
GET  /admin/rules/pending
GET  /admin/rules/matrix
GET  /admin/rules/:id
PATCH /admin/rules/:id                    { value?, allowedValues?, status?, notes? }
GET  /admin/rules/:id/history
POST /admin/rules/:id/activate
POST /admin/rules/:id/disable
```

The `/admin/rules/*` routes (Stage 15A — the Business Rules Register)
are documented fully in `docs/BUSINESS-RULES.md`.

`/admin/attribution/reassign` (Stage 13, bearer-token, `BACKEND_ADMIN_
TOKEN`) is a separate, pre-existing route matched before this prefix and
is not part of Stage 14.

## 4. Data relationships

No schema migration was needed — every Stage 14 read/write uses tables
Stage 12/12.2/13/15 already created:

- **Customers** (`customers`, Stage 12) — `listCustomers`/
  `customerDetailForStaff` add a batched `bookingsCount` (a plain `COUNT`,
  never a fabricated "activity" score — the table has no active/inactive
  column, so none is invented) and unify bookings/documents/payments/
  notifications/attribution history in one admin-side read, using the
  exact row shapers (`nBookingRow`, `nDocReview`) Stage 15 already built.
- **Supervisors** (`supervisors`, Stage 13) — `listSupervisors`/
  `createSupervisor`/`updateSupervisor`/`supervisorDetailForStaff` are new
  admin-wide writes (supervisor accounts previously existed only as
  config-seeded rows with no creation API at all); `supervisorDetailForStaff`
  composes the same scoped functions (`supervisorCustomers`,
  `supervisorBookings`, `supervisorLeads`, `supervisorRevenue`,
  `supervisorPerformance`, `supervisorCommissions`) the supervisor portal's
  own session-scoped routes call — called explicitly with an id instead of
  a session, never re-implemented.
- **Leads / attribution** (`leads`, `attribution_events`, Stage 13) —
  `adminLeads`/`adminAttributionEvents` read admin-wide instead of scoped
  to one supervisor's session; the attribution **rule itself** (first-
  touch, never overwritten) is untouched — Stage 14 never invents or
  silently changes it (§9).
- **Payments** (`payments`, Stage 12.2) — `listPayments` is read-only; no
  settlement, refund or payout logic is performed or invented (§15, §28).
- **Documents** (`documents`, Stage 12.2/15) — `listDocumentsAdmin` never
  returns `storage_key`; per-document review stays on Stage 15's existing
  `POST /documents/:id/review`, one document at a time.
- **Staff** (`staff`, Stage 15) — `listStaff`/`createStaffAccount`/
  `setStaffActive`/`setStaffPermissions` are new; a created account gets
  **no password** (an admin never handles or transmits one) — the existing
  reset-token flow (`createStaffReset`/`consumeStaffReset`, already used by
  `staffAuth.resetRequest`) lets the new hire set their own, exactly like a
  forgotten-password reset.
- **Reports** (`bookings`, `operation_tasks`, `escalations`, `suppliers`,
  `documents`, `outbox`) — plain `GROUP BY` counts/distributions, nothing
  ranked, scored or projected (§18, §28).
- **Overview** (`customers`, `bookings`, `operation_tasks`, `escalations`,
  `documents`, `suppliers`, `supervisors`) — factual counts and filters
  over vocabulary Stage 15 already defined (e.g. `ops_status NOT IN
  (completed, cancelled, failed, refunded)` for "in progress").

## 5. Dashboard modules (nav)

Overview/Today (Stage 15's existing screen, unchanged), **Customers**,
**Supervisors**, **Leads / Attribution**, Bookings, Operations (Tasks,
Escalations), Services, Suppliers, **Payments**, **Documents**,
Notifications, **Reports**, Audit Log, **Staff & Permissions**,
**Business Rules** (Stage 15A — see `docs/BUSINESS-RULES.md`), Settings.
Bold entries are new since Stage 14; the rest are Stage 15's, unchanged.
Every nav entry with a permission attached
(`assets/js/ops/ui/shell.js`'s `NAV` array) is hidden for a staff member
who lacks that permission — the array is filtered by `hasOpsPermission`
before rendering, so an Operations Staff account with only view
permissions never even sees a Staff & Permissions or Business Rules
link it could not use.

## 6. Stage 15 integration

The Operations Center (Tasks, Escalations, Bookings, Services, Suppliers,
Notifications, Audit) is Stage 15's own screens, reused exactly as built —
Stage 14 adds no second task queue, escalation system, service registry,
supplier directory, notification system or audit trail (§30). The
Overview screen and reports read the same `operation_tasks`/`escalations`/
`suppliers` tables Stage 15 owns.

## 7. Security model

Unchanged from Stage 15, reused as-is: server-side authorization on every
route (`requirePermission`, never trusting a client-supplied role or
permission list), the staff session's own cookie pair
(`no_ops_session`/`no_ops_csrf`, HttpOnly + CSRF, never accepted by `/me/*`
or `/supervisor/me/*` and vice versa), exact-origin CORS, rate limiting,
input validation (`str`, `isEmail`) and output shaping that never returns
a storage key, password hash or credential. Nothing in Stage 14 bypasses
or duplicates this — every new route goes through the same middleware
chain as Stage 15's.

## 8. Configuration

No new environment variables or configuration tables. The commission
model (`commissionModel()`, `business_config` table) stays exactly as
Stage 13 left it — `{ model: null, status: 'pending_business_
configuration' }` until the business configures a real one; Stage 14
displays this honestly rather than computing or guessing a figure.

## 9. Pending business decisions

Unchanged from Stage 15's own list (§28), plus nothing new invented here:
the booking lifecycle graph, SLA values, task priority policy, per-service
required documents, real supplier integrations, the notification delivery
pipeline, and commission/refund/cancellation policy remain configuration
the business has not supplied yet. Stage 14 exposes them honestly
(`pending_business_configuration`, `not_connected`) rather than deciding
on the business's behalf.

## 10. Deployment requirements

None beyond what Stage 12.2/15 already require (the Node backend, its
`.env`, `BACKEND_ADMIN_TOKEN` only if the legacy bearer-token reassignment
route is still wanted). No migration script — every table already exists.

## 11. Testing

- **Backend** (`tests/backend.mjs`) — 20 new checks: permission
  enforcement per Stage 14 permission (an account with none of them, and
  one with only the view subset), customers list/detail/reassign, an
  unknown customer id → 404, supervisor list/create/detail/update
  (including a reserved-slug rejection), admin-wide leads/attribution
  events, payments filtered by customer, admin document browse (never a
  storage key), all five reports, staff list/create/duplicate-email
  rejection/activate-deactivate/set-permissions (including the admin-role
  rejection and unknown-permission filtering), and global search's
  permission-scoped categories.
- **Browser** (`tests/ops-portal.mjs`, extended) — every new route's
  auth-guard, the full nav list (dashboard through staff), each screen
  populated against the development stand-in, the responsive/RTL/LTR
  matrix (390/834/1440 × ar/en) for all seven new screens, and a real-
  backend pass confirming: Stage 14 nav items are absent entirely for a
  staff member with none of their permissions; a staff member with only
  view permissions sees Customers but never Staff & Permissions, sees real
  fixture data through `/admin/customers`, and is refused server-side
  reaching `/admin/staff/` directly.
- Full regression (`npm test`) — every earlier stage's suite plus the
  above, run to green before this stage was considered complete.

## 12. Known limitations

- The seven new screens are list/detail workspaces, not the full "Booking
  Detail Workspace" sub-structure the original brief sketched (Journey/
  Operational/Commercial/Supplier/Documents/Communication/Audit panels)
  — that level of detail already exists on Stage 15's own booking detail
  screen and was not duplicated here.
- Supervisor commission/revenue figures are shown exactly as Stage 13
  reports them (`pending_business_configuration` until set) — no payout,
  settlement or profitability calculation exists anywhere in this stage.
- Global search is a bounded (`LIMIT 5` per category) `LIKE` match, not a
  ranked or fuzzy search — adequate for the current data volumes, revisit
  if/when a real search index is ever justified.
- Notification delivery status reporting reuses Stage 15's existing
  `outbox`/history views as-is; Stage 14 adds no new delivery pipeline.
