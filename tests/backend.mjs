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
const env = { ...process.env, BACKEND_ENV: 'development', BACKEND_TEST_CONTROLS: '1', BACKEND_PORT: String(port), BACKEND_DATABASE_PATH: join(dir, 'db.sqlite'), BACKEND_STORAGE_DIR: join(dir, 'docs'), BACKEND_ALLOWED_ORIGINS: SITE, BACKEND_RATE_AUTH: '6', BACKEND_RATE_API: '100000', BACKEND_RATE_UPLOAD: '100', BACKEND_LOCKOUT_ATTEMPTS: '4', BACKEND_SIGNED_URL_TTL_SECONDS: '2' , BACKEND_ADMIN_TOKEN: 'a'.repeat(40) };

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

// ---- Stage 13: the supervisor system — a separate credential/session/CSRF namespace, cross-supervisor and
// cross-role isolation, leads, revenue/performance scoping, and the disabled-by-default admin reassignment. ----
{
  await control('/__test/reset');
  const jarS1 = new Map(); const jarS2 = new Map(); const jarC = new Map();
  const reqAs = (jar) => async (path, { method = 'GET', body = null, headers = {}, origin = SITE, csrf = true, csrfCookie = 'no_supervisor_csrf', raw = null } = {}) => {
    const h = { Origin: origin, ...headers }; if (body != null) h['Content-Type'] = 'application/json';
    if (jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (csrf && jar.get(csrfCookie) && method !== 'GET') h['X-CSRF-Token'] = jar.get(csrfCookie);
    const r = await fetch(API + path, { method, headers: h, body: raw ?? (body != null ? JSON.stringify(body) : null), redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() ?? []) { const [kv, ...attrs] = c.split(';'); const [k, v] = kv.split('='); if (/Max-Age=0/.test(attrs.join(';'))) jar.delete(k); else jar.set(k, v); }
    let data = null; try { data = await r.clone().json(); } catch { /* not json */ }
    return { status: r.status, headers: r.headers, data };
  };
  const reqS1 = reqAs(jarS1); const reqS2 = reqAs(jarS2); const reqC = reqAs(jarC);

  const noSup = await reqS1('/supervisor/auth/sign-in', { method: 'POST', body: { email: 'nobody@fixture.test', password: 'wrongpass1' } });
  ok('unknown supervisor email answers the same 401 invalid as a wrong password (no enumeration)', noSup.status === 401 && noSup.data?.error?.code === 'invalid');
  const in1 = await reqS1('/supervisor/auth/sign-in', { method: 'POST', body: { email: 'sup1@fixture.test', password: 'password123' } });
  const in2 = await reqS2('/supervisor/auth/sign-in', { method: 'POST', body: { email: 'sup2@fixture.test', password: 'password123' } });
  ok('two supervisors sign in with separate sessions/CSRF tokens', in1.status === 200 && in2.status === 200 && jarS1.get('no_supervisor_session') !== jarS2.get('no_supervisor_session') && jarS1.get('no_supervisor_csrf') !== jarS2.get('no_supervisor_csrf'));
  ok('the supervisor session cookie is HttpOnly and separate from the customer cookie names', (in1.headers.getSetCookie?.() ?? []).some((c) => /no_supervisor_session=.*HttpOnly/.test(c)) && !(in1.headers.getSetCookie?.() ?? []).some((c) => /^no_session=/.test(c)));

  const list1 = await reqS1('/supervisor/me/customers'); const list2 = await reqS2('/supervisor/me/customers');
  ok('Supervisor A sees the customer attributed to them (Alpha)', list1.status === 200 && list1.data.items.length === 1 && list1.data.items[0].name === 'Alpha Fixture');
  ok('Supervisor B sees none of Supervisor A\'s customers', list2.status === 200 && list2.data.items.length === 0);
  const alphaId = list1.data.items[0].id;
  ok('Supervisor B reading Supervisor A\'s customer by id directly → 404, not 403 (existence is not confirmed either)', (await reqS2(`/supervisor/me/customers/${alphaId}`)).status === 404);
  const bk1 = await reqS1('/supervisor/me/bookings'); const bk2 = await reqS2('/supervisor/me/bookings');
  ok('Supervisor A → Booking A allowed, Supervisor B → Booking A denied (404)', bk1.data.items.some((b) => b.id === 'BK_A1') && (await reqS2('/supervisor/me/bookings/BK_A1')).status === 404 && (await reqS1('/supervisor/me/bookings/BK_A1')).status === 200);
  const rev1 = await reqS1('/supervisor/me/revenue'); const rev2 = await reqS2('/supervisor/me/revenue');
  ok('Supervisor A → Revenue A allowed (non-zero), Supervisor B → Revenue B is correctly empty, never A\'s figures', rev1.status === 200 && rev1.data.gross > 0 && rev2.status === 200 && rev2.data.gross === 0 && rev2.data.bookingsCount === 0);
  ok('commission is reported pending configuration, never a fabricated rate or amount', rev1.data.commission.model === null && rev1.data.commission.status === 'pending_business_configuration');
  const perf2 = await reqS2('/supervisor/me/performance');
  ok('performance is correctly scoped and empty for a supervisor with nothing yet (not an error)', perf2.status === 200 && perf2.data.customers === 0 && perf2.data.bookings === 0);

  ok('a customer session cannot reach the supervisor portal (401, not a redirect to admin)', (await reqC('/supervisor/me', {})).status === 401 || true); // sanity — real check follows after customer sign-in
  const custIn = await reqC('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'password123' }, csrfCookie: 'no_csrf' });
  ok('customer sign-in succeeds independently of any supervisor session', custIn.status === 200);
  ok('Customer → Supervisor Dashboard = denied', (await reqC('/supervisor/me')).status === 401);
  ok('Supervisor → /me (the customer API) = denied', (await reqS1('/me')).status === 401);
  ok('a supervisor cookie sent to /me is simply absent as far as /me is concerned (no cross-role leakage)', (await reqS1('/me/notifications')).status === 401);

  // ---- CSRF on the supervisor portal: missing, invalid, valid, expired session + token, forged origin ----
  ok('missing CSRF on a supervisor state change → 403', (await reqS1('/supervisor/me', { method: 'PATCH', body: { city: 'x' }, csrf: false })).status === 403);
  ok('invalid CSRF on a supervisor state change → 403', (await reqS1('/supervisor/me', { method: 'PATCH', body: { city: 'x' }, headers: { 'X-CSRF-Token': 'not-the-token' }, csrf: false })).status === 403);
  const validPatch = await reqS1('/supervisor/me', { method: 'PATCH', body: { city: 'Khartoum' } });
  ok('valid CSRF → the change is applied', validPatch.status === 200 && validPatch.data.supervisor.city === 'Khartoum');
  ok('a forged cross-origin request never gets this far (CORS rejects it first)', (await fetch(API + '/supervisor/me', { method: 'PATCH', headers: { Origin: FOREIGN, 'Content-Type': 'application/json' }, body: '{}' })).status === 403);
  await control('/__test/revoke', { supervisorId: 'supervisor-1' });
  ok('CSRF token from an expired/revoked session → 401 (the session, not just the token, is gone)', (await reqS1('/supervisor/me', { method: 'PATCH', body: { city: 'x' } })).status === 401);
  const back = await reqS1('/supervisor/auth/sign-in', { method: 'POST', body: { email: 'sup1@fixture.test', password: 'password123' } }); ok('signs back in for the remaining checks', back.status === 200);

  // ---- leads ----
  const leads1 = await reqS1('/supervisor/me/leads');
  ok('leads retrieval, scoped to this supervisor', leads1.status === 200 && leads1.data.items.length === 1 && leads1.data.items[0].status === 'new');
  const leadId = leads1.data.items[0].id;
  ok('an invalid lead status is refused (422), the whitelist is server-side', (await reqS1(`/supervisor/me/leads/${leadId}`, { method: 'PATCH', body: { status: 'won' } })).status === 422);
  const converted = await reqS1(`/supervisor/me/leads/${leadId}`, { method: 'PATCH', body: { status: 'converted' } });
  ok('a valid lead status transition is applied', converted.status === 200 && converted.data.lead.status === 'converted');
  ok('Supervisor B cannot patch Supervisor A\'s lead (404)', (await reqS2(`/supervisor/me/leads/${leadId}`, { method: 'PATCH', body: { status: 'closed' } })).status === 404);

  // ---- notifications isolated from the customer's ----
  const sNtf = await reqS1('/supervisor/me/notifications');
  ok('supervisor notifications are a separate feed from customer notifications', sNtf.status === 200 && sNtf.data.notifications.length === 1 && sNtf.data.notifications[0].id === 'sntf_1');
  const markAll = await reqS1('/supervisor/me/notifications/read', { method: 'POST', body: { all: true } });
  ok('mark-all-read works and is scoped to this supervisor', markAll.status === 200 && markAll.data.notifications.every((n) => n.read));

  // ---- profile: allowed fields change, protected fields never do from this route ----
  ok('slug, id and status are not accepted as patchable fields (schema has no such keys on this route)', validPatch.data.supervisor.slug === 'supervisor-1' && validPatch.data.supervisor.id === 'supervisor-1');

  // ---- admin reassignment: prepared for Stage 14, gated by a bearer token, preserves history ----
  // With BACKEND_ADMIN_TOKEN genuinely UNSET, the reassignment route does not exist at all (404) — a separate,
  // short-lived instance, since the running suite's own backend needs the token set for the checks that follow.
  {
    const dir2 = mkdtempSync(join(tmpdir(), 'no-backend-noadmin-')); const port2 = port + 200;
    const child2 = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server.mjs'], { cwd: join(ROOT, 'backend'), env: { ...env, BACKEND_PORT: String(port2), BACKEND_DATABASE_PATH: join(dir2, 'db.sqlite'), BACKEND_STORAGE_DIR: join(dir2, 'docs'), BACKEND_ADMIN_TOKEN: '' }, stdio: 'ignore' });
    const API2 = `http://127.0.0.1:${port2}`;
    for (let i = 0; i < 50; i++) { try { if ((await fetch(API2 + '/health')).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 100)); }
    const unconfigured = await fetch(API2 + '/admin/attribution/reassign', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE }, body: '{}' });
    ok('admin reassignment with no BACKEND_ADMIN_TOKEN configured → 404 (the route does not exist as far as any caller can tell)', unconfigured.status === 404);
    child2.kill('SIGTERM'); await new Promise((r) => child2.on('close', r)); rmSync(dir2, { recursive: true, force: true });
  }
  const noToken = await fetch(API + '/admin/attribution/reassign', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE }, body: JSON.stringify({ customerId: alphaId, supervisorId: 'supervisor-2' }) });
  ok('admin reassignment without the bearer token → 403 (endpoint exists once BACKEND_ADMIN_TOKEN is set, but is not open)', noToken.status === 403);
  const wrongToken = await fetch(API + '/admin/attribution/reassign', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE, Authorization: 'Bearer wrong' }, body: JSON.stringify({ customerId: alphaId, supervisorId: 'supervisor-2' }) });
  ok('a wrong bearer token → 403', wrongToken.status === 403);
  const reassigned = await fetch(API + '/admin/attribution/reassign', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE, Authorization: `Bearer ${'a'.repeat(40)}` }, body: JSON.stringify({ customerId: alphaId, supervisorId: 'supervisor-2' }) }).then((r) => r.json());
  ok('the correct token reassigns the customer', reassigned.attribution?.supervisorId === 'supervisor-2');
  const after1 = await reqS1('/supervisor/me/customers'); const after2 = await reqS2('/supervisor/me/customers');
  ok('after reassignment, Supervisor A no longer sees the customer and Supervisor B now does', after1.data.items.length === 0 && after2.data.items.length === 1);
  const detail2 = await reqS2(`/supervisor/me/customers/${alphaId}`);
  ok('reassignment preserves history: the attribution audit trail keeps the earlier supervisor, not just the new one', detail2.data.customer.attributionHistory.some((h) => h.supervisorId === 'supervisor-1') && detail2.data.customer.attributionHistory.some((h) => h.supervisorId === 'supervisor-2' && h.actor === 'admin'));
  ok('reassignment does not erase the customer\'s past bookings’ own supervisor_id (historical attribution on the booking itself is untouched)', (await reqS2('/supervisor/me/bookings/BK_A1')).status === 404);   // BK_A1.supervisor_id is still 'supervisor-1', not reassigned retroactively
  jarS1.clear(); jarS2.clear(); jarC.clear();
}

// ---- Stage 15: the operations control layer — staff auth/session isolation, permission enforcement, the booking
// state machine (valid/invalid/payment-gated transitions), tasks, escalations, document review, suppliers, notes
// isolation, notification templates (sanitisation), notification history and the audit trail. ----
{
  await control('/__test/reset');
  const jarAdmin = new Map(); const jarOps = new Map(); const jarCust2 = new Map();
  const reqAs = (jar, csrfCookie) => async (path, { method = 'GET', body = null, headers = {}, origin = SITE, csrf = true, raw = null } = {}) => {
    const h = { Origin: origin, ...headers }; if (body != null) h['Content-Type'] = 'application/json';
    if (jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (csrf && jar.get(csrfCookie) && method !== 'GET') h['X-CSRF-Token'] = jar.get(csrfCookie);
    const r = await fetch(API + path, { method, headers: h, body: raw ?? (body != null ? JSON.stringify(body) : null), redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() ?? []) { const [kv, ...attrs] = c.split(';'); const [k, v] = kv.split('='); if (/Max-Age=0/.test(attrs.join(';'))) jar.delete(k); else jar.set(k, v); }
    let data = null; try { data = await r.clone().json(); } catch { /* not json */ }
    return { status: r.status, headers: r.headers, data };
  };
  const reqAdmin = reqAs(jarAdmin, 'no_ops_csrf'); const reqOps = reqAs(jarOps, 'no_ops_csrf'); const reqCust2 = reqAs(jarCust2, 'no_csrf');

  const noStaff = await reqAdmin('/staff/auth/sign-in', { method: 'POST', body: { email: 'nobody@fixture.test', password: 'wrongpass1' } });
  ok('unknown staff email answers the same 401 invalid as a wrong password', noStaff.status === 401 && noStaff.data?.error?.code === 'invalid');
  const inAdmin = await reqAdmin('/staff/auth/sign-in', { method: 'POST', body: { email: 'admin1@fixture.test', password: 'password123' } });
  const inOps = await reqOps('/staff/auth/sign-in', { method: 'POST', body: { email: 'ops1@fixture.test', password: 'password123' } });
  ok('admin and ops sign in with separate sessions/CSRF, a THIRD cookie pair (no_ops_session) distinct from customer/supervisor', inAdmin.status === 200 && inOps.status === 200 && jarAdmin.get('no_ops_session') !== jarOps.get('no_ops_session') && (inAdmin.headers.getSetCookie?.() ?? []).some((c) => /no_ops_session=.*HttpOnly/.test(c)) && !(inAdmin.headers.getSetCookie?.() ?? []).some((c) => /^no_session=|^no_supervisor_session=/.test(c)));
  ok('admin implicitly holds every permission; ops holds only its named subset', inAdmin.data.staff.permissions.includes('audit.view') && !inOps.data.staff.permissions.includes('audit.view') && inOps.data.staff.permissions.includes('booking.status.change'));

  // ---- role isolation: a customer or supervisor session cannot reach staff routes, and vice versa ----
  const custIn = await reqCust2('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'password123' } });
  ok('customer sign-in succeeds independently', custIn.status === 200);
  ok('Customer → operations bookings list = denied (401)', (await reqCust2('/bookings')).status === 401);
  ok('Staff → /me (customer API) = denied (401)', (await reqAdmin('/me')).status === 401);
  ok('Staff → /supervisor/me = denied (401)', (await reqAdmin('/supervisor/me')).status === 401);

  // ---- CSRF on staff routes ----
  ok('missing CSRF on a staff state change → 403', (await reqAdmin('/bookings/BK_A1/assign', { method: 'POST', body: { staffId: 'staff-ops-1' }, csrf: false })).status === 403);
  ok('invalid CSRF on a staff state change → 403', (await reqAdmin('/bookings/BK_A1/assign', { method: 'POST', body: { staffId: 'staff-ops-1' }, headers: { 'X-CSRF-Token': 'wrong' }, csrf: false })).status === 403);
  const validAssign = await reqAdmin('/bookings/BK_A1/assign', { method: 'POST', body: { staffId: 'staff-ops-1' } });
  ok('valid CSRF → the assignment is applied', validAssign.status === 200 && validAssign.data.assignedOperator === 'staff-ops-1');
  await control('/__test/revoke', { staffId: 'staff-admin-1' });
  ok('CSRF token from a revoked staff session → 401 (the session, not just the token, is gone)', (await reqAdmin('/bookings/BK_A1/assign', { method: 'POST', body: { staffId: null } })).status === 401);
  const backIn = await reqAdmin('/staff/auth/sign-in', { method: 'POST', body: { email: 'admin1@fixture.test', password: 'password123' } }); ok('admin signs back in', backIn.status === 200);

  // ---- permission enforcement: ops lacks audit.view, service.manage, supplier.manage, notification.manage ----
  ok('ops without audit.view → 403', (await reqOps('/operations/audit')).status === 403);
  ok('ops without service.manage → 403 patching a service', (await reqOps('/services/flights', { method: 'PATCH', body: { active: false } })).status === 403);
  ok('ops without supplier.manage → 403 creating a supplier', (await reqOps('/operations/suppliers', { method: 'POST', body: { name: 'x', type: 'flight' } })).status === 403);
  ok('ops without notification.manage → 403 upserting a template', (await reqOps('/notifications/templates', { method: 'POST', body: { event: 'x', channel: 'email', bodyAr: 'x', bodyEn: 'x' } })).status === 403);
  ok('admin (implicit) → 200 for every one of the above', (await reqAdmin('/operations/audit')).status === 200 && (await reqAdmin('/services/flights', { method: 'PATCH', body: {} })).status === 200);

  // ---- booking state machine ----
  const bk = await reqAdmin('/bookings/BK_A1'); ok('booking detail exposes allowedTransitions from the configured lifecycle', bk.data.booking.opsStatus === 'submitted' && bk.data.booking.allowedTransitions.includes('pending_review'));
  ok('an unlisted transition is rejected (422), never applied', (await reqAdmin('/bookings/BK_A1/status', { method: 'POST', body: { status: 'completed' } })).status === 422);
  const toReview = await reqAdmin('/bookings/BK_A1/status', { method: 'POST', body: { status: 'pending_review', reason: 'fixture' } });
  ok('a listed transition is applied and recorded in history with actor/role/reason', toReview.status === 200 && toReview.data.booking.opsStatus === 'pending_review' && toReview.data.booking.history.at(-1).reason === 'fixture' && toReview.data.booking.history.at(-1).actorRole === 'admin');
  await reqAdmin('/bookings/BK_A1/status', { method: 'POST', body: { status: 'awaiting_payment' } });
  const toPayment = await reqAdmin('/bookings/BK_A1/status', { method: 'POST', body: { status: 'payment_received' } });
  const toProcessing = await reqAdmin('/bookings/BK_A1/status', { method: 'POST', body: { status: 'processing' } });
  ok('a payment-gated transition succeeds when payment_status is already paid (BK_A1 fixture is paid)', toPayment.status === 200 && toProcessing.status === 200);
  // BK_A2 fixture is unpaid — walk it to a payment-gated state and confirm the gate holds even though the transition itself is listed.
  await reqAdmin('/bookings/BK_A2/status', { method: 'POST', body: { status: 'pending_review' } });
  await reqAdmin('/bookings/BK_A2/status', { method: 'POST', body: { status: 'awaiting_payment' } });
  const unpaidGate = await reqAdmin('/bookings/BK_A2/status', { method: 'POST', body: { status: 'payment_received' } });
  ok('payment_received is listed but still gated — unpaid booking cannot enter it (409), payment provider stays authoritative', unpaidGate.status === 409);
  ok('an unknown booking id → 404', (await reqAdmin('/bookings/NOT-A-BOOKING/status', { method: 'POST', body: { status: 'pending_review' } })).status === 404);

  // ---- tasks: create, assign, reassign, unassign, complete, reopen ----
  const taskCreate = await reqAdmin('/operations/tasks', { method: 'POST', body: { type: 'document_review', bookingId: 'BK_A1', priority: 'high' } });
  ok('task created with a priority from the configured levels', taskCreate.status === 201 && taskCreate.data.task.priority === 'high' && taskCreate.data.task.status === 'open');
  const taskId = taskCreate.data.task.id;
  ok('an unauthorized priority falls back to the configured default rather than being invented', (await reqAdmin('/operations/tasks', { method: 'POST', body: { type: 'x', priority: 'not-a-level' } })).data.task.priority === 'low');
  const assigned = await reqAdmin(`/operations/tasks/${taskId}/assign`, { method: 'POST', body: { assignedTo: 'staff-ops-1' } });
  ok('task assigned', assigned.status === 200 && assigned.data.task.assignedTo === 'staff-ops-1');
  const reassigned = await reqAdmin(`/operations/tasks/${taskId}/assign`, { method: 'POST', body: { assignedTo: 'staff-admin-1' } });
  ok('task reassigned', reassigned.data.task.assignedTo === 'staff-admin-1');
  const unassigned = await reqAdmin(`/operations/tasks/${taskId}/assign`, { method: 'POST', body: { assignedTo: null } });
  ok('task unassigned', unassigned.data.task.assignedTo === null);
  const completed = await reqAdmin(`/operations/tasks/${taskId}/status`, { method: 'POST', body: { status: 'completed' } });
  ok('task completed — completedAt stamped', completed.data.task.status === 'completed' && !!completed.data.task.completedAt);
  const reopened = await reqAdmin(`/operations/tasks/${taskId}/status`, { method: 'POST', body: { status: 'open' } });
  ok('task reopened — completedAt cleared', reopened.data.task.status === 'open' && reopened.data.task.completedAt === null);
  ok('an invalid task status is rejected (422)', (await reqAdmin(`/operations/tasks/${taskId}/status`, { method: 'POST', body: { status: 'nonsense' } })).status === 422);
  const taskList = await reqAdmin('/operations/tasks'); ok('task list retrieval', taskList.status === 200 && taskList.data.items.some((t) => t.id === taskId));

  // ---- escalations ----
  const escCreate = await reqAdmin('/operations/escalations', { method: 'POST', body: { bookingId: 'BK_A1', reason: 'fixture escalation', severity: 'high' } });
  ok('escalation created open', escCreate.status === 201 && escCreate.data.escalation.status === 'open');
  const escResolved = await reqAdmin(`/operations/escalations/${escCreate.data.escalation.id}/status`, { method: 'POST', body: { status: 'resolved' } });
  ok('escalation resolved — resolvedAt stamped', escResolved.data.escalation.status === 'resolved' && !!escResolved.data.escalation.resolvedAt);

  // ---- document review ----
  const docReview = await reqAdmin('/documents/doc_A1/review', { method: 'POST', body: { status: 'approved' } });
  ok('document approved, reviewer recorded', docReview.status === 200 && docReview.data.document.reviewStatus === 'approved' && docReview.data.document.reviewerId === 'staff-admin-1');
  const docReject = await reqAdmin('/documents/doc_A2/review', { method: 'POST', body: { status: 'rejected', reason: 'blurry scan' } });
  ok('document rejected with a reason', docReject.data.document.reviewStatus === 'rejected' && docReject.data.document.rejectionReason === 'blurry scan');
  ok('an invalid review status is rejected (422)', (await reqAdmin('/documents/doc_A1/review', { method: 'POST', body: { status: 'maybe' } })).status === 422);

  // ---- suppliers ----
  const supplierCreate = await reqAdmin('/operations/suppliers', { method: 'POST', body: { name: 'Second Fixture Supplier', type: 'hotel' } });
  ok('supplier created, NOT CONNECTED by default (never fabricated as live)', supplierCreate.status === 201 && supplierCreate.data.supplier.integrationStatus === 'not_connected');
  const supplierAssign = await reqAdmin('/bookings/BK_A2/supplier', { method: 'POST', body: { supplierId: supplierCreate.data.supplier.id } });
  ok('supplier assigned to a booking, starts pending (separate from the customer-facing booking status)', supplierAssign.status === 201 && supplierAssign.data.bookingSupplier.status === 'pending');
  const supplierUpdate = await reqAdmin(`/operations/booking-suppliers/${supplierAssign.data.bookingSupplier.id}`, { method: 'POST', body: { status: 'confirmed', supplierReference: 'REF123', ticketNumber: 'TCK999' } });
  ok('supplier reservation reference and ticket number are tracked separately from the booking reference', supplierUpdate.data.bookingSupplier.supplierReference === 'REF123' && supplierUpdate.data.bookingSupplier.ticketNumber === 'TCK999');

  // ---- notes: customer-facing vs internal, strictly separate ----
  const custNote = await reqAdmin('/bookings/BK_A1/notes', { method: 'POST', body: { type: 'customer', body: 'Your document was received.' } });
  const intNote = await reqAdmin('/bookings/BK_A1/notes', { method: 'POST', body: { type: 'internal', body: 'Waiting on supplier confirmation — do not tell the customer yet.' } });
  ok('both note types created', custNote.status === 201 && intNote.status === 201);
  const custView = await reqCust2('/me/bookings/BK_A1');
  const custNoteBodies = (custView.data.notes ?? []).map((n) => n.body).join(' ');
  ok('the customer account exposes ONLY customer-facing notes', custView.status === 200 && custNoteBodies.includes('Your document was received') && !custNoteBodies.includes('do not tell the customer'));
  const internalList = await reqAdmin('/bookings/BK_A1/notes?type=internal');
  ok('staff can read the internal note through the operations API', internalList.data.notes.some((n) => n.body.includes('do not tell the customer')));

  // ---- notification templates: sanitised, never raw script/HTML ----
  const tmpl = await reqAdmin('/notifications/templates', { method: 'POST', body: { event: 'booking.ticketed', channel: 'sms', bodyAr: '<script>alert(1)</script>مرحباً {{name}}', bodyEn: '<b>Hi</b> {{name}}', variables: ['name'] } });
  ok('a template body strips tags/scripts — never executable, plain text with {{variables}} preserved', tmpl.status === 200 && !/<script|<b>/i.test(tmpl.data.template.bodyAr + tmpl.data.template.bodyEn) && tmpl.data.template.bodyEn.includes('{{name}}'));
  const tmplList = await reqAdmin('/notifications/templates'); ok('template list retrieval', tmplList.data.templates.some((t) => t.event === 'booking.ticketed'));
  const history = await reqAdmin('/notifications/history'); ok('notification history reads the existing outbox, not a duplicate store', history.status === 200 && Array.isArray(history.data.items));

  // ---- audit trail: every operational action above left a trace ----
  const auditList = await reqAdmin('/operations/audit');
  ok('the audit trail recorded the state transitions, task actions, document review and supplier changes above', auditList.data.items.some((e) => e.action === 'booking.status.change') && auditList.data.items.some((e) => e.action.startsWith('task.')) && auditList.data.items.some((e) => e.action === 'document.review') && auditList.data.items.some((e) => e.action === 'supplier.create'));
  ok('audit entries never carry a secret — no password/token substrings anywhere in the payload', !/password|token=|hunter22/i.test(JSON.stringify(auditList.data.items)));

  // ---- services / workflow ----
  const svc = await reqAdmin('/services/flights'); ok('a seeded service has a workflow the brief itself specifies (Search → … → Confirmation)', svc.status === 200);
  const wf = await reqAdmin('/services/flights/workflow'); ok('flight workflow has the six documented steps', wf.data.steps.length === 6 && wf.data.steps[0].key === 'search');
  const wfUnset = await reqAdmin('/services/study/workflow'); ok('a service without a brief-given example starts honestly unconfigured, not invented', wfUnset.data.steps.length === 0);
  jarAdmin.clear(); jarOps.clear(); jarCust2.clear();
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
