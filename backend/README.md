# Customer backend — Number One Travel & Tourism (Stages 12.2–13)

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
the one function prepared for a future Admin Dashboard (reassigning a
customer's attribution) — no admin UI exists yet.

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
- **Email / SMS:** `BACKEND_MAILER=none` — deliveries are recorded in the
  outbox as *queued* and never reported as sent. No provider is connected.
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
`Dockerfile` builds a dependency-free image; mount persistent volumes at the
database and storage paths and pass the configuration as environment.

Files: `config.mjs` `db.mjs` `http.mjs` `identity.mjs` `storage.mjs`
`mailer.mjs` `legal.mjs` `routes.mjs` `server.mjs` `fixtures.mjs`
`logger.mjs` (scrubbed structured logs) `migrate.mjs`.
