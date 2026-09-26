# Stage 16A — Production Infrastructure & Hosting Provisioning

## 0. Status

**PARTIALLY COMPLETE.** This sandbox has no hosting provider account, no
domain, no DNS control, no TLS certificate authority access, and no
persistent storage outside this ephemeral session. None of those can be
provisioned from here — not because the work is hard, but because there is
nothing to provision *against*. Following Stage 16A's own non-negotiable
rules ("do not invent a hosting provider," "do not invent credentials,"
"do not mark anything CONNECTED without real verification"), this stage's
honest output is: confirmation that the codebase is genuinely ready to
deploy, the exact deployment procedure it already implements, and the
precise list of external inputs a real deployment needs before it can run.

This is the same conclusion Stage 16 reached for the business-integration
side, for the same reason, applied here to hosting.

## 1. What §2 inspection found (verified, not assumed)

| Item | Finding |
|---|---|
| `backend/Dockerfile` | Real, minimal (`node:22-alpine`, no dependencies to install), runs as non-root `USER node`, `HEALTHCHECK` hits `/health`, `CMD` runs `migrate.mjs` then `server.mjs` — migrations run automatically on every container start, before the server accepts traffic |
| `tools/deploy.mjs` | Implements exactly the sequence this stage's §8 asks for: public-config check → (local) backend config check + migrations → smoke test → real-backend acceptance suite → **only then** write `INTEGRATIONS_VERIFIED` and report ready to publish. Every step `stop()`s the whole deploy on failure — nothing is skipped or soft-failed |
| `backend/config.mjs` | Refuses to start in production with: no/weak signing secret, missing/non-https allowed origins, insecure cookies, `BACKEND_TEST_CONTROLS=1`, or `BACKEND_STORAGE`/`BACKEND_MAILER` set to anything not actually implemented (`local`/`none` are the only implemented values — verified by reading the refusal conditions directly, not assumed) |
| `tools/smoke.mjs` | A real external check against a *deployed* site+backend: `/health`, environment/test-controls flags, CORS (allows the site origin with credentials, refuses a foreign origin), session endpoints require a session, HTTPS on both origins, HSTS header present, legal documents either published-with-version or honestly 404 |
| `backend/.env.example` / root `.env.example` | Every variable a real deployment needs is already named, documented, and defaulted safely for development — nothing is missing from the *contract*, only from *values* (a real signing secret, a real origin, a real domain) |
| Document storage | `BACKEND_STORAGE=local` only; the directory lives outside any web root by construction (`backend/storage.mjs` serves files only through the signed-URL route, never a static path) — confirmed nothing in `server.mjs`'s static-serving path overlaps `BACKEND_STORAGE_DIR` |
| Database | SQLite via `node:sqlite`, WAL mode, path fully configurable via `BACKEND_DATABASE_PATH`; migrations are idempotent (`schema_migrations` table, `INSERT OR IGNORE` seeds) — safe to run on every container start, which the Dockerfile already does |
| Backup | **No backup mechanism exists anywhere in the codebase or docs** — confirmed by Stage 16's own audit and re-confirmed here; `docs/PRODUCTION-INTEGRATION.md` §5 already says this plainly |

Conclusion: nothing here needed to be built. The infrastructure *contract*
(Dockerfile, deploy sequence, config refusals, smoke checks) was already
production-shaped before this stage started. What Stage 16A actually
needed — a real host to run it on — is the one thing that cannot be
fabricated.

## 2. Hosting architecture (§3) — designed, not provisioned

| Layer | Design (already implemented in code) | Provisioning status |
|---|---|---|
| Frontend | Static files (`assets/`, HTML pages) served by any static host or CDN with HTTPS and standard cache headers | **NOT PROVISIONED** — no static host account available |
| Backend | `backend/Dockerfile` → any container host with a mounted persistent volume at `BACKEND_DATABASE_PATH` and `BACKEND_STORAGE_DIR` | **NOT PROVISIONED** — no container host account available |
| Database | SQLite file on that persistent volume | **NOT PROVISIONED** — no persistent volume exists outside this session |
| Documents | Same persistent volume, private directory, signed URLs only | **NOT PROVISIONED** — same as above |

## 3. Exactly what must be supplied before this can move past PARTIALLY COMPLETE

1. **A hosting decision** — which static host (for the frontend) and which
   container/VM host (for the backend), and whether they're the same
   provider. This is a business/cost decision, not a technical one; this
   session cannot make it.
2. **A domain** the business owns, with DNS access to point it at both the
   frontend host and the backend host (same-origin or a subdomain split —
   either works with the existing CORS/cookie configuration).
3. **TLS certificates** for that domain — most hosts issue these
   automatically (Let's Encrypt et al.) once DNS is pointed at them; this
   needs no code, only the domain + host from items 1–2.
4. **A persistent volume** on the backend host, mounted at whatever paths
   `BACKEND_DATABASE_PATH`/`BACKEND_STORAGE_DIR` are set to — this is a
   hosting-platform setting, not a code change.
5. **Real secret values** for `BACKEND_SIGNING_SECRET` (32+ random bytes,
   e.g. `openssl rand -hex 32`) and `BACKEND_ADMIN_TOKEN` if the future
   admin-reassignment seam is to be enabled — generated once, stored only
   in the hosting platform's secret store, never in the repository.
6. **The real origins** — `SITE_URL`, `API_BASE_URL`, `BACKEND_PUBLIC_URL`,
   `BACKEND_ALLOWED_ORIGINS` — filled in with the domain from item 2, once
   it exists.
7. **A backup mechanism** — none exists today. The simplest correct option
   given a single SQLite file plus a documents directory is a scheduled
   filesystem/volume snapshot on whichever host is chosen (item 1); this
   is a hosting-platform feature to enable, not new application code. *(Removed 2026-09-25: reassignment is now only the admin dashboard's `POST /admin/customers/:id/reassign`, with a staff session; `BACKEND_ADMIN_TOKEN` is refused if set.)*

None of items 1–7 can be produced by writing more code in this repository.

## 4. Deployment pipeline (§8) — already correct, re-confirmed

`tools/deploy.mjs --plan` was run (with placeholder, clearly-not-real
origins so the plan logic executes) to confirm the step ordering without
requiring real credentials:

```
Deploying production: site https://www.example.test → backend https://api.example.test

▶ 1–2. public configuration (no verified marks yet)
  node tools/write-env.mjs

▶ 3. backend deployed by its own pipeline (backend/Dockerfile); checked in steps 5–6

▶ 4. services: storage=local, mailer=none — NOT CONNECTED, identity=backend-managed (hosted provider NOT CONNECTED), legal={"source":null} — NOT CONNECTED

▶ 5. smoke test of the deployed backend
  node tools/smoke.mjs

▶ 6. real-backend acceptance (tests/integration.mjs)
  node tests/run-backend.mjs

▶ 7. public configuration with verified marks
  node tools/write-env.mjs --verified-by-deploy

(plan only — nothing was run or written)
```

This matches this stage's required order exactly (Config Check → Migrations
→ Smoke Test → Real Backend Acceptance → Verify → Publish) and already
refuses to continue past any failed step — confirmed by reading `stop()`'s
call sites, not assumed.

## 5. What §7 (persistence), §12 (backup/restore), §14 (performance
   baseline at real widths), and §15 (production security test) require

Every one of these is a **verification against a running deployment** —
restart a real container, hit a real URL at each width, attempt a real
restore. None can be performed without the deployment in §2 existing first.
Claiming any of them "passed" without a real target to test against would
be exactly the fabrication this stage's rules forbid. What *can* be, and
was, verified without a deployment:

- The **code-level** equivalents of §7 and §15 — migration idempotency,
  config refusal rules, session/CSRF/CORS isolation — are covered by the
  existing automated suite (`tests/backend.mjs`), which was run as part of
  this session's regression gate (see the accompanying commit).
- §14's responsive matrix (390–1440px) is already covered against the
  *development* stand-in by the existing Playwright suites; it cannot be
  re-run against a production deployment that doesn't exist.

## 6. Payment and supplier boundaries (§17, §18) — explicitly preserved, not touched

No change was made to `backend/routes.mjs`'s `me.claim` route or to any
booking supplier adapter in this stage. The known gap remains exactly as
Stage 16 documented it: **`payment_status` is still set from a
browser-reported value**, safe only because the only payment provider
wired in is the labelled `dev` stand-in. This is **Stage 16B's** fix
(server-side payment intent + signature-verified webhook), not this one's.
Likewise, no flight/hotel/visa/medical/transport supplier was connected;
every one of those services still correctly falls through to the
request-only adapter with no live inventory.

## 7. Acceptance criteria (§19) — checked against reality

| Requirement | Met? |
|---|---|
| Real production hosting exists | **NO** |
| Frontend/backend deployed | **NO** |
| HTTPS / persistent database / private storage in production | **NOT VERIFIABLE** — no production instance exists |
| Deployment pipeline correct and fails safely | **YES** (code-verified) |
| Health/smoke checks implemented | **YES** (code-verified, not run against a live deployment) |
| Backup/recovery verified or its limitation documented | **DOCUMENTED AS MISSING** (item 7 above) |
| No development fallback active | **YES** — production refuses every dev/mock path by construction |
| No integration falsely marked CONNECTED | **YES** — nothing was marked connected |

Per this stage's own §19, the criteria are not fully met, so:

**STATUS = PARTIALLY COMPLETE.**

## 8. Next stage

Per this stage's own §21.7: Stage 16B (real payment provider integration)
should not begin before Stage 16A's infrastructure is genuinely available
and verified — it isn't, for the reason in §0. The next actionable step is
supplying items 1–7 in §3 above; once a real host and domain exist, the
already-correct `tools/deploy.mjs` pipeline can run against them and this
document should be replaced with an actual verification report.
