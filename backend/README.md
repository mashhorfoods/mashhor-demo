# Backend — Travel & Tourism

The single origin the website talks to. It implements the contract in
`docs/INTEGRATION.md` §3 (`/auth/*`, `/me/*`, `/legal/*`, `/files/*`,
`/diagnostics`, `/health`) with server-side sessions, CSRF protection, the
customer boundary, private document storage with signed expiring links, the
payment history and notification endpoints, and the legal-document seam.

Stage 13 adds the **supervisor system** on the same origin: a separate
credential store, session (`no_supervisor_session`, its own CSRF token) and
route set (`/supervisor/auth/*`, `/supervisor/me/*`), server-authoritative
attribution with an audit trail, and customer/booking/lead/revenue/
performance views enforced per-supervisor in SQL. See
`docs/SUPERVISOR-SYSTEM.md`. `BACKEND_ADMIN_TOKEN` (unset by default) gates
a legacy bearer-token route for reassigning a customer's attribution; the admin
dashboard (below) does the same through a staff session.

A third session serves **staff** — operations staff and admins
(`no_ops_session`, its own CSRF token): `/staff/auth/*`, the operations routes
(`/operations/*`, `/bookings/*`, `/documents/*`, `/notifications/*`,
`/services/*`, Stage 15) and the admin dashboard (`/admin/*`, Stage 14), each
action gated by a named permission. A write is checked against the CSRF token
of the session its route belongs to (`sessionFamily` in `http.mjs`).

- **Runtime:** Node 22.13+ (`node:sqlite`), **no dependencies**, one process.
- **Configuration:** the process environment only — `.env.example` lists
  every `BACKEND_*` variable. Production refuses an unsafe combination at
  start-up (`npm run check` shows why).
- **Data:** SQLite (WAL) at `BACKEND_DATABASE_PATH`; migrations in
  `migrations/*.sql` are applied by `npm run migrate` (and at start-up).
- **Documents:** stored under `BACKEND_STORAGE_DIR` under random keys, served
  only through `/files/:id?exp&sig` (HMAC, short TTL, revoked on delete).
- **Identity:** backend-managed accounts (scrypt, lockout, neutral reset).
  A hosted identity provider is a documented seam in `identity.mjs`, NOT
  CONNECTED.
- **Email:** every message is queued in the outbox first. `BACKEND_MAILER=none`
  (the default) never sends and never reports a message as sent;
  `BACKEND_MAILER=smtp` is implemented (`mailer.mjs`) but not connected to a
  real sender. Templates are staff-authored plain text.
- **Payments / flights:** provider seams in `payments.mjs` and `flights.mjs`;
  only the development providers exist, and production refuses them.
- **Legal:** `legal/` — the business's official documents, or 404.
- **Test controls:** `/__test/*` only with `BACKEND_TEST_CONTROLS=1`
  (production refuses it). They seed the two fixture customers and inject
  faults for the acceptance suite.

```
npm run check      # configuration check (exit 78 when refused)
npm run migrate    # apply migrations
npm start          # listen on BACKEND_HOST:BACKEND_PORT
```

From the repository root: `npm run test:backend` starts this backend on a
temporary database and runs the browser integration suite against it;
`npm test` runs `tests/backend.mjs` (the HTTP security suite) with the rest.
`Dockerfile` builds a dependency-free image that defaults to
`BACKEND_ENV=production`, so it refuses to start until it is configured; mount
persistent volumes at the database and storage paths and pass the
configuration as environment (`BACKEND_ENV=staging` for a staging container).

Files:

| | |
| --- | --- |
| `server.mjs` | the HTTP server: routing, session resolution, CSRF, rate limits, test controls |
| `config.mjs` | configuration from the environment, and the refusals |
| `db.mjs`, `migrate.mjs`, `migrations/` | SQLite access and schema |
| `http.mjs` | request/response helpers, cookies, CORS, `sessionFamily` |
| `logger.mjs` | scrubbed structured logs |
| `identity.mjs`, `routes.mjs` | customer accounts and sessions; the customer routes (`/auth`, `/me`, `/legal`, `/files`, flights, payments webhook) |
| `supervisor.mjs`, `supervisor-routes.mjs` | supervisor accounts, sessions and portal data |
| `staff.mjs`, `staff-routes.mjs` | staff accounts and permissions, operations, admin dashboard |
| `business-rules.mjs` | the business rules register (Stage 15A) |
| `content.mjs` | destinations and offers content with draft/publish state |
| `payments.mjs`, `flights.mjs` | payment and flight-supplier provider seams |
| `mailer.mjs` | outbox, template rendering, SMTP provider |
| `storage.mjs`, `legal.mjs` | private document storage and signed links; legal documents |
| `fixtures.mjs` | test fixtures (used only when test controls are enabled) |
