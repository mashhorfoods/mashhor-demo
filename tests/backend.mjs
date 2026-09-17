// Stage 12.2 backend verification — the real backend's own security behaviour,
// exercised over HTTP without a browser: configuration refusals, CORS with an
// exact origin, CSRF (missing, invalid, valid, expired session, forged),
// rate limiting and lockout, neutral reset answers, upload validation by
// content, filename sanitisation, signed URL forgery / expiry / revocation,
// customer boundary by direct API calls, and diagnostics scrubbing.
// Starts its own backend on a free port with a temporary database. Exits 1 on any ✗.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (name, cond, note = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} ${note}`); } };
const SITE = 'http://site.test:4443';
const FOREIGN = 'https://evil.example';
const dir = mkdtempSync(join(tmpdir(), 'no-backend-'));
const port = 8940 + Math.floor(Math.random() * 50);
const env = { ...process.env, BACKEND_ENV: 'development', BACKEND_TEST_CONTROLS: '1', BACKEND_PORT: String(port), BACKEND_DATABASE_PATH: join(dir, 'db.sqlite'), BACKEND_STORAGE_DIR: join(dir, 'docs'), BACKEND_ALLOWED_ORIGINS: SITE, BACKEND_RATE_AUTH: '6', BACKEND_RATE_API: '100000', BACKEND_RATE_UPLOAD: '100', BACKEND_LOCKOUT_ATTEMPTS: '4', BACKEND_SIGNED_URL_TTL_SECONDS: '2' };

// ---- configuration refusals (child processes that must exit non-zero) ----
const check = (extra) => new Promise((resolve) => { const c = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'config.mjs', '--check'], { cwd: join(ROOT, 'backend'), env: { ...env, ...extra } }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); c.on('close', (code) => resolve({ code, out })); });
{
  const prodBase = { BACKEND_ENV: 'production', BACKEND_TEST_CONTROLS: '0', BACKEND_SIGNING_SECRET: 'x'.repeat(40), BACKEND_ALLOWED_ORIGINS: 'https://www.example.test', BACKEND_PUBLIC_URL: 'https://api.example.test', BACKEND_COOKIE_SECURE: '1' };
  ok('production config with everything set is accepted', (await check(prodBase)).code === 0);
  ok('production refuses test controls', /TEST_CONTROLS/.test((await check({ ...prodBase, BACKEND_TEST_CONTROLS: '1' })).out));
  ok('production refuses a missing signing secret', /SIGNING_SECRET/.test((await check({ ...prodBase, BACKEND_SIGNING_SECRET: '' })).out));
  ok('production refuses http origins and wildcard origins', /https/.test((await check({ ...prodBase, BACKEND_ALLOWED_ORIGINS: 'http://www.example.test' })).out) && /never \*/.test((await check({ ...prodBase, BACKEND_ALLOWED_ORIGINS: '*' })).out));
  ok('production refuses insecure cookies and SameSite=None without Secure', /COOKIE_SECURE/.test((await check({ ...prodBase, BACKEND_COOKIE_SECURE: '0' })).out) && /Secure/.test((await check({ ...prodBase, BACKEND_COOKIE_SECURE: '0', BACKEND_COOKIE_SAMESITE: 'None', BACKEND_ENV: 'staging' })).out));
  ok('unimplemented storage or mailer is refused, never silently mocked', /not implemented/.test((await check({ BACKEND_STORAGE: 's3' })).out) && /not implemented/.test((await check({ BACKEND_MAILER: 'smtp' })).out));
}

// ---- the site's public configuration generator (writes to a temporary file) ----
{
  const out = join(dir, 'env.js');
  const gen = (extra, flag = []) => new Promise((resolve) => { const c = spawn(process.execPath, ['tools/write-env.mjs', ...flag], { cwd: ROOT, env: { ...process.env, ENV_OUT: out, NO_ENVIRONMENT: 'production', AUTH_PROVIDER: 'session-api', API_BASE_URL: 'https://api.example.test/v1', ...extra } }); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { o += d; }); c.on('close', (code) => resolve({ code, out: o, file: (() => { try { return readFileSync(out, 'utf8'); } catch { return ''; } })() })); });
  ok('write-env refuses production with the dev adapter', (await gen({ AUTH_PROVIDER: 'dev' })).code !== 0);
  ok('write-env refuses production with a non-https backend', (await gen({ API_BASE_URL: 'http://api.example.test' })).code !== 0);
  ok('write-env refuses a secret-looking value in any public variable', /looks like a secret/.test((await gen({ AUTH_PUBLIC_CONFIG: '{"serviceRoleKey":"abc"}' })).out));
  const plain = await gen({ INTEGRATIONS_VERIFIED: '{"at":"2026-09-17","backend":"https://api.example.test/v1","adapters":["session-api","api-customer"]}' });
  ok('INTEGRATIONS_VERIFIED is ignored without --verified-by-deploy (nothing reads CONNECTED by hand)', plain.code === 0 && /ignored/.test(plain.out) && /"verified": null/.test(plain.file));
  const marked = await gen({ INTEGRATIONS_VERIFIED: '{"at":"2026-09-17","backend":"https://api.example.test/v1","adapters":["session-api","api-customer"]}' }, ['--verified-by-deploy']);
  ok('the deploy step records the verified adapters for this exact backend', marked.code === 0 && /"backend": "https:\/\/api\.example\.test\/v1"/.test(marked.file) && /"session-api"/.test(marked.file));
  ok('a verified mark for a different backend is refused', (await gen({ INTEGRATIONS_VERIFIED: '{"at":"2026-09-17","backend":"https://other.example","adapters":["session-api"]}' }, ['--verified-by-deploy'])).code !== 0);
}

// ---- start the backend ----
const child = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server.mjs'], { cwd: join(ROOT, 'backend'), env, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; child.stdout.on('data', (d) => { logs += d; }); child.stderr.on('data', (d) => { logs += d; });
const API = `http://127.0.0.1:${port}`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 100)); }
const jar = new Map();
const req = async (path, { method = 'GET', body = null, headers = {}, origin = SITE, csrf = true, raw = null } = {}) => {
  const h = { Origin: origin, ...headers }; if (body != null) h['Content-Type'] = 'application/json';
  if (jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  if (csrf && jar.get('no_csrf') && method !== 'GET') h['X-CSRF-Token'] = jar.get('no_csrf');
  const r = await fetch(API + path, { method, headers: h, body: raw ?? (body != null ? JSON.stringify(body) : null), redirect: 'manual' });
  for (const c of r.headers.getSetCookie?.() ?? []) { const [kv, ...attrs] = c.split(';'); const [k, v] = kv.split('='); if (/Max-Age=0/.test(attrs.join(';'))) jar.delete(k); else jar.set(k, v); }
  let data = null; try { data = await r.clone().json(); } catch { /* not json */ }
  return { status: r.status, headers: r.headers, data, text: await r.text() };
};
const control = (path, body = {}) => fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
await control('/__test/reset');

// ---- CORS ----
{
  const pre = await fetch(API + '/me', { method: 'OPTIONS', headers: { Origin: SITE, 'Access-Control-Request-Method': 'GET' } });
  ok('preflight from the site origin: allowed with credentials, exact origin echoed', pre.status === 204 && pre.headers.get('access-control-allow-origin') === SITE && pre.headers.get('access-control-allow-credentials') === 'true');
  const preF = await fetch(API + '/me', { method: 'OPTIONS', headers: { Origin: FOREIGN, 'Access-Control-Request-Method': 'GET' } });
  const getF = await fetch(API + '/health', { headers: { Origin: FOREIGN } });
  ok('a foreign origin gets no CORS headers and a 403', preF.status === 403 && getF.status === 403 && !getF.headers.get('access-control-allow-origin'));
  const h = await fetch(API + '/health');
  ok('security headers on every response', h.headers.get('x-content-type-options') === 'nosniff' && h.headers.get('x-frame-options') === 'DENY' && h.headers.get('referrer-policy') === 'no-referrer');
}

// ---- auth: neutral answers, lockout, rate limit ----
{
  const bad1 = await req('/auth/sign-in', { method: 'POST', body: { email: 'nobody@fixture.test', password: 'wrongpass1' } });
  const bad2 = await req('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'wrongpass1' } });
  ok('unknown email and wrong password answer identically (401 invalid)', bad1.status === 401 && bad2.status === 401 && bad1.text === bad2.text);
  for (let i = 0; i < 3; i++) await req('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'wrongpass1' } });
  const locked = await req('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'password123' } });
  ok('lockout after repeated failures → 429 with Retry-After, even for the right password', locked.status === 429 && !!locked.headers.get('retry-after') && locked.data?.error?.code === 'rateLimited');
  const rl = await req('/auth/sign-in', { method: 'POST', body: { email: 'x@fixture.test', password: 'whatever12' } });
  ok('auth rate limit → 429 with only the code, nothing about the policy', rl.status === 429 && rl.data?.error?.code === 'rateLimited' && Object.keys(rl.data).length === 1 && !/window|attempts|per minute/i.test(rl.text));
  await control('/__test/reset');
  const reset1 = await req('/auth/password/reset-request', { method: 'POST', body: { email: 'alpha@fixture.test' } });
  const reset2 = await req('/auth/password/reset-request', { method: 'POST', body: { email: 'ghost@fixture.test' } });
  ok('reset request: 202 and identical bodies for known and unknown addresses; delivery queued, never claimed sent', reset1.status === 202 && reset1.text === reset2.text);
  const st = await fetch(API + '/__test/state').then((r) => r.json());
  ok('outbox records the reset e-mail as queued (no provider = not delivered)', st.outbox.some((o) => o.template === 'password-reset' && o.status === 'queued'));
}

// ---- CSRF ----
{
  await control('/__test/reset');
  const s = await req('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'password123' } });
  ok('sign-in sets HttpOnly session + readable CSRF cookies', s.status === 200 && jar.has('no_session') && jar.has('no_csrf') && (s.headers.getSetCookie?.() ?? []).some((c) => /no_session=.*HttpOnly/.test(c)) && (s.headers.getSetCookie?.() ?? []).every((c) => !/no_csrf=.*HttpOnly/.test(c)));
  const missing = await req('/me/notifications/read', { method: 'POST', body: { all: true }, csrf: false });
  const invalid = await req('/me/notifications/read', { method: 'POST', body: { all: true }, csrf: false, headers: { 'X-CSRF-Token': 'forged' } });
  const valid = await req('/me/notifications/read', { method: 'POST', body: { all: true } });
  ok('state change: missing CSRF → 403, invalid CSRF → 403, valid → 200', missing.status === 403 && invalid.status === 403 && valid.status === 200);
  const get = await req('/me/notifications', { csrf: false });
  ok('GET needs no CSRF header (cookie session only)', get.status === 200);
  const otherCsrf = jar.get('no_csrf'); const otherSession = jar.get('no_session');
  await control('/__test/revoke');
  const expired = await req('/me/notifications/read', { method: 'POST', body: { all: true } });
  ok('expired/revoked session + a CSRF token → 401 (session decides first)', expired.status === 401);
  jar.clear(); await req('/auth/sign-in', { method: 'POST', body: { email: 'beta@fixture.test', password: 'password123' } });
  const forged = await req('/me/notifications/read', { method: 'POST', body: { all: true }, csrf: false, headers: { 'X-CSRF-Token': otherCsrf } });
  ok('a CSRF token from another session is refused (403)', forged.status === 403);
  jar.clear();
}

// ---- customer boundary by direct API ----
{
  await control('/__test/reset');
  await req('/auth/sign-in', { method: 'POST', body: { email: 'beta@fixture.test', password: 'password123' } });
  const codes = await Promise.all(['/me/trips/trip_A1', '/me/bookings/BK_A1', '/me/documents/doc_A1/url'].map((p) => req(p).then((r) => r.status)));
  const del = await req('/me/travellers/trv_A1', { method: 'DELETE' }); const pat = await req('/me/travellers/trv_A1', { method: 'PATCH', body: { firstName: 'X' } });
  const delDoc = await req('/me/documents/doc_A1', { method: 'DELETE' });
  const readA = await req('/me/notifications/read', { method: 'POST', body: { ids: ['ntf_A1'] } });
  ok('Beta reading Alpha by id: trips, bookings, document links → 404', codes.every((c) => c === 404), codes.join());
  ok('Beta changing Alpha by id: traveller delete/patch, document delete → 404', del.status === 404 && pat.status === 404 && delDoc.status === 404);
  const stA = await fetch(API + '/__test/state').then((r) => r.json());
  ok('Beta marking Alpha\'s notification read changes nothing', readA.status === 200 && (await (async () => { jar.clear(); await req('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'password123' } }); const n = await req('/me/notifications'); return n.data.notifications.find((x) => x.id === 'ntf_A1').read === false; })()));
  const claimOther = await req('/me/bookings/claim', { method: 'POST', body: { reference: 'BK_B1', context: { service: 'flights' } } });
  ok('claiming another customer\'s booking reference → 409, never re-parented', claimOther.status === 409);
  const patch = await req('/me', { method: 'PATCH', body: { name: 'Alpha Renamed', supervisorId: 'supervisor-5', attribution: { supervisorId: 'supervisor-5' }, email: 'other@fixture.test', id: 'cus_forged' } });
  ok('PATCH /me cannot change attribution, e-mail or id', patch.status === 200 && patch.data.customer.attribution.supervisorId === 'supervisor-1' && patch.data.customer.email === 'alpha@fixture.test' && patch.data.customer.name === 'Alpha Renamed');
  const bogusSup = await req('/auth/sign-out', { method: 'POST', body: {} }); jar.clear();
  const su = await req('/auth/sign-up', { method: 'POST', body: { name: 'Gamma', email: 'gamma@fixture.test', password: 'password123', attribution: { supervisorId: 'supervisor-999', source: 'admin' } } });
  ok('an unknown supervisor id at sign-up is not stored (backend registry decides)', su.status === 201 && su.data.customer.attribution === null);
  jar.clear();
}

// ---- documents: content validation, sanitised names, signed URLs ----
{
  await control('/__test/reset'); await req('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'password123' } });
  const multipart = (name, type, body, title = '') => { const b = '----nob' + Math.random().toString(16).slice(2); const parts = [`--${b}\r\nContent-Disposition: form-data; name="title"\r\n\r\n${title}\r\n`, `--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`]; return { raw: Buffer.concat([Buffer.from(parts.join('')), body, Buffer.from(`\r\n--${b}--\r\n`)]), headers: { 'Content-Type': `multipart/form-data; boundary=${b}` } }; };
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const fake = multipart('x.png', 'image/png', Buffer.from('not really a png'));
  const r1 = await req('/me/documents', { method: 'POST', raw: fake.raw, headers: fake.headers });
  ok('a declared type that does not match the content is refused (415)', r1.status === 415);
  const txt = multipart('x.txt', 'text/plain', Buffer.from('hello'));
  ok('an unsupported type is refused (415)', (await req('/me/documents', { method: 'POST', raw: txt.raw, headers: txt.headers })).status === 415);
  const big = multipart('big.pdf', 'application/pdf', Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(6 * 1024 * 1024)]));
  ok('an oversized upload is refused (413)', (await req('/me/documents', { method: 'POST', raw: big.raw, headers: big.headers })).status === 413);
  const good = multipart('../../etc/passwd .png', 'image/png', PNG);
  const r2 = await req('/me/documents', { method: 'POST', raw: good.raw, headers: good.headers });
  ok('a valid upload is stored under a random key; the filename is sanitised', r2.status === 201 && !/\.\.|\//.test(r2.data.document.title) && !/[ -]/.test(r2.data.document.title) && r2.data.document.deletable === true, r2.data?.document?.title);
  const id = r2.data.document.id;
  const link = await req(`/me/documents/${id}/url`);
  ok('a signed URL is temporary (exp + sig)', /exp=\d+&sig=[0-9a-f]{64}/.test(link.data.url) && Date.parse(link.data.expiresAt) > Date.now());
  const direct = await fetch(link.data.url); const forgedSig = await fetch(link.data.url.replace(/sig=[0-9a-f]+/, 'sig=' + '0'.repeat(64))); const tamperedExp = await fetch(link.data.url.replace(/exp=\d+/, 'exp=9999999999999'));
  ok('the signed URL serves the file; a forged signature or tampered expiry → 403', direct.status === 200 && direct.headers.get('content-type') === 'image/png' && forgedSig.status === 403 && tamperedExp.status === 403);
  ok('file responses are private, no-store, nosniff, framed only by the site', /no-store/.test(direct.headers.get('cache-control')) && direct.headers.get('x-content-type-options') === 'nosniff' && direct.headers.get('content-security-policy').includes(`frame-ancestors ${SITE}`) && !direct.headers.get('x-frame-options'));
  await new Promise((r) => setTimeout(r, 2300));
  ok('after the TTL the link is dead (410)', (await fetch(link.data.url)).status === 410);
  const link2 = await req(`/me/documents/${id}/url`); const del = await req(`/me/documents/${id}`, { method: 'DELETE' });
  ok('deleting the document revokes an issued link (404) and the row is gone', del.status === 204 && (await fetch(link2.data.url)).status === 404 && (await req(`/me/documents/${id}/url`)).status === 404);
  ok('issued documents are not deletable (403)', (await req('/me/documents/doc_A1', { method: 'DELETE' })).status === 403);
  const listing = await req('/me/documents'); const dumpStr = JSON.stringify(listing.data);
  ok('document metadata never exposes storage keys or paths', !/storage_key|storageKey|\/data\/|documents\//.test(dumpStr));
  jar.clear();
}

// ---- diagnostics scrubbing + logs ----
{
  await fetch(API + '/diagnostics', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE }, body: JSON.stringify({ event: 'api.failure', code: 'unavailable', password: 'hunter22', token: 'abcdef0123456789abcdef0123456789abcdef', email: 'x@y.z', note: 'x'.repeat(500) }) });
  const st = await fetch(API + '/__test/state').then((r) => r.json()); const e = st.events.at(-1);
  ok('diagnostics keep the event and code, drop credentials, personal data and long strings', e.event === 'api.failure' && e.code === 'unavailable' && !('password' in e) && !('token' in e) && !('email' in e) && !('note' in e));
  ok('server logs contain no passwords, tokens, cookies or e-mails', !/password123|no_session=|@fixture\.test|hunter22/.test(logs));
}

child.kill('SIGTERM'); await new Promise((r) => child.on('close', r)); rmSync(dir, { recursive: true, force: true });
console.log(`backend: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
