// Shared test environment: where the site is served and which browser runs.
// `npm test` (tests/run.mjs) sets both; running one suite by hand falls back
// to a local server at :8919 and the bundled Chromium when one exists.
import { existsSync, mkdtempSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.TEST_ORIGIN ??= 'http://localhost:8919';
if (!process.env.CHROMIUM && existsSync('/opt/pw-browsers/chromium')) process.env.CHROMIUM = '/opt/pw-browsers/chromium';
// Screenshots the suites take go under tests/.shots/ (ignored), never the repo root.
export const SHOTS = new URL('./.shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
export const shot = (name) => `${SHOTS}${name}`;

/** A browser context + page wired for the suites' shared error-capture idiom: pageerror, console error/warning
    (skipping the app's own `[no] ` dev-notice logs), and any HTTP >=400 response, all pushed onto `errs` tagged
    with the width/locale that triggered them. `locale !== 'ar'` seeds `no.locale` before the app boots. */
export function makeCtx(b, errs) {
  return async (width = 1440, height = 1000, locale = 'ar') => {
    const c = await b.newContext({ viewport: { width, height } });
    const p = await c.newPage(); p.setDefaultTimeout(10000);
    p.on('pageerror', (e) => errs.push(`${p.url()}@${width}/${locale} pageerror: ${e.message}`));
    p.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().startsWith('[no] ')) errs.push(`${p.url()}@${width} console: ${m.text().slice(0, 160)}`); });
    p.on('response', (r) => { if (r.status() >= 400) errs.push(`${p.url()}@${width} HTTP ${r.status()} ${r.url()}`); });
    if (locale !== 'ar') await c.addInitScript((l) => { try { localStorage.setItem('no.locale', l); } catch {} }, locale);
    return { c, p };
  };
}

/** A cookie-jar-bound HTTP request wrapper against a real backend origin: injects Origin + (once the named CSRF
    cookie is held) X-CSRF-Token, tracks Set-Cookie into the jar (deleting on Max-Age=0), and resolves
    {status, headers, data, text}. `makeReq(API, siteOrigin)(jar, csrfCookie)` binds one request function to one
    jar; `csrfCookie` names which cookie in that jar carries the CSRF token — customer sessions use 'no_csrf',
    staff/admin 'no_ops_csrf', supervisor 'no_supervisor_csrf' — and can still be overridden per call (e.g. before
    a jar's own session exists yet). */
export function makeReq(API, siteOrigin) {
  return (jar, csrfCookie = 'no_csrf') => async (path, { method = 'GET', body = null, headers = {}, origin = siteOrigin, csrf = true, csrfCookie: perCallCsrfCookie = csrfCookie, raw = null } = {}) => {
    const h = { Origin: origin, ...headers }; if (body != null) h['Content-Type'] = 'application/json';
    if (jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (csrf && jar.get(perCallCsrfCookie) && method !== 'GET') h['X-CSRF-Token'] = jar.get(perCallCsrfCookie);
    const r = await fetch(API + path, { method, headers: h, body: raw ?? (body != null ? JSON.stringify(body) : null), redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() ?? []) { const [kv, ...attrs] = c.split(';'); const [k, v] = kv.split('='); if (/Max-Age=0/.test(attrs.join(';'))) jar.delete(k); else jar.set(k, v); }
    let data = null; try { data = await r.clone().json(); } catch { /* not json */ }
    return { status: r.status, headers: r.headers, data, text: await r.text() };
  };
}

/** Spins up `backend/server.mjs` on a free-ish port against a disposable temp SQLite dir, with test controls on
    and test-scale rate limits (loose, not the deliberately tight ones `tests/backend.mjs` uses to exercise
    lockout/rate-limit behaviour — pass `rate` to override). Polls /health until it answers. Caller is responsible
    for `backend.kill('SIGTERM')` + `rmSync(dir, { recursive: true, force: true })` when done. */
export async function startEphemeralBackend({ prefix = 'no-backend-', portBase = 8960, portSpread = 30, rate = { auth: '1000', api: '100000', upload: '1000' } } = {}) {
  const ROOT = new URL('../', import.meta.url).pathname;
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const port = portBase + Math.floor(Math.random() * portSpread);
  const backend = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server.mjs'], {
    cwd: join(ROOT, 'backend'), stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, BACKEND_ENV: 'development', BACKEND_TEST_CONTROLS: '1', BACKEND_PORT: String(port), BACKEND_DATABASE_PATH: join(dir, 'db.sqlite'), BACKEND_STORAGE_DIR: join(dir, 'docs'), BACKEND_ALLOWED_ORIGINS: '', BACKEND_RATE_AUTH: rate.auth, BACKEND_RATE_API: rate.api, BACKEND_RATE_UPLOAD: rate.upload },
  });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(origin + '/health')).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 100)); }
  return { dir, backend, origin };
}
