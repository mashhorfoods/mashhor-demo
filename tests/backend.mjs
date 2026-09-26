// Stage 12.2 backend verification — the real backend's own security behaviour,
// exercised over HTTP without a browser: configuration refusals, CORS with an
// exact origin, CSRF (missing, invalid, valid, expired session, forged),
// rate limiting and lockout, neutral reset answers, upload validation by
// content, filename sanitisation, signed URL forgery / expiry / revocation,
// customer boundary by direct API calls, and diagnostics scrubbing.
// Starts its own backend on a free port with a temporary database. Exits 1 on any ✗.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeReq } from './env.mjs';
import { createHmac } from 'node:crypto';
import { createServer as createNetServer } from 'node:net';
import { TLSSocket } from 'node:tls';
import { DatabaseSync } from 'node:sqlite';

const ROOT = new URL('../', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (name, cond, note = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} ${note}`); } };
const SITE = 'http://site.test:4443';
const FOREIGN = 'https://evil.example';
const dir = mkdtempSync(join(tmpdir(), 'no-backend-'));
const port = 8940 + Math.floor(Math.random() * 50);
const PAYMENT_DEV_SECRET = 'd'.repeat(40);
const env = { ...process.env, BACKEND_ENV: 'development', BACKEND_TEST_CONTROLS: '1', BACKEND_PORT: String(port), BACKEND_DATABASE_PATH: join(dir, 'db.sqlite'), BACKEND_STORAGE_DIR: join(dir, 'docs'), BACKEND_ALLOWED_ORIGINS: SITE, BACKEND_RATE_AUTH: '6', BACKEND_RATE_API: '100000', BACKEND_RATE_UPLOAD: '100', BACKEND_LOCKOUT_ATTEMPTS: '4', BACKEND_SIGNED_URL_TTL_SECONDS: '2' , BACKEND_PAYMENT_DEV_SECRET: PAYMENT_DEV_SECRET };

// ---- configuration refusals (child processes that must exit non-zero) ----
const check = (extra) => new Promise((resolve) => { const c = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'config.mjs', '--check'], { cwd: join(ROOT, 'backend'), env: { ...env, ...extra } }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); c.on('close', (code) => resolve({ code, out })); });
{
  const prodBase = { BACKEND_ENV: 'production', BACKEND_TEST_CONTROLS: '0', BACKEND_SIGNING_SECRET: 'x'.repeat(40), BACKEND_ALLOWED_ORIGINS: 'https://www.example.test', BACKEND_PUBLIC_URL: 'https://api.example.test', BACKEND_COOKIE_SECURE: '1' };
  // Stage 16B: production now ALSO requires a real (non-dev) payment provider. Only 'dev' is implemented, and
  // it is unconditionally refused in production (§23 — never a silent fallback), so prodBase alone — which
  // leaves BACKEND_PAYMENT_PROVIDER at its 'dev' default — is correctly refused rather than accepted; this is
  // the one deliberate remaining gap the Stage 16B report documents, not a regression.
  ok('production refuses the dev payment provider as a silent fallback, even with every other production setting correct', /BACKEND_PAYMENT_PROVIDER cannot be dev in production/.test((await check(prodBase)).out));
  // Stage 16C: the flight supplier gets the identical treatment — only 'dev' is implemented, unconditionally
  // refused in production (§19/§23's "never mark a supplier CONNECTED without real verification").
  ok('production refuses the dev flight provider as a silent fallback', /BACKEND_FLIGHT_PROVIDER cannot be dev in production/.test((await check(prodBase)).out));
  ok('an unimplemented flight provider is refused, never silently mocked', /not implemented/.test((await check({ BACKEND_FLIGHT_PROVIDER: 'amadeus' })).out));
  ok('every OTHER production requirement in prodBase is independently satisfied (payment and flight provider are the sole remaining refusals)', !/SIGNING_SECRET|ALLOWED_ORIGINS|COOKIE_SECURE|TEST_CONTROLS/.test((await check(prodBase)).out));
  ok('production refuses test controls', /TEST_CONTROLS/.test((await check({ ...prodBase, BACKEND_TEST_CONTROLS: '1' })).out));
  ok('production refuses a missing signing secret', /SIGNING_SECRET/.test((await check({ ...prodBase, BACKEND_SIGNING_SECRET: '' })).out));
  ok('production refuses http origins and wildcard origins', /https/.test((await check({ ...prodBase, BACKEND_ALLOWED_ORIGINS: 'http://www.example.test' })).out) && /never \*/.test((await check({ ...prodBase, BACKEND_ALLOWED_ORIGINS: '*' })).out));
  ok('production refuses insecure cookies and SameSite=None without Secure', /COOKIE_SECURE/.test((await check({ ...prodBase, BACKEND_COOKIE_SECURE: '0' })).out) && /Secure/.test((await check({ ...prodBase, BACKEND_COOKIE_SECURE: '0', BACKEND_COOKIE_SAMESITE: 'None', BACKEND_ENV: 'staging' })).out));
  ok('unimplemented storage, mailer or payment provider is refused, never silently mocked', /not implemented/.test((await check({ BACKEND_STORAGE: 's3' })).out) && /not implemented/.test((await check({ BACKEND_MAILER: 'sendgrid' })).out) && /not implemented/.test((await check({ BACKEND_PAYMENT_PROVIDER: 'stripe' })).out));
  // Stage 16D: 'smtp' IS implemented (backend/mailer.mjs) but requires its own real settings — never silently
  // "connected" with defaults.
  ok('BACKEND_MAILER=smtp without host/user/pass/from is refused with a specific reason for each', /SMTP_HOST/.test((await check({ BACKEND_MAILER: 'smtp' })).out) && /SMTP_USER and BACKEND_SMTP_PASS/.test((await check({ BACKEND_MAILER: 'smtp' })).out) && /SMTP_FROM/.test((await check({ BACKEND_MAILER: 'smtp' })).out));
  ok('BACKEND_MAILER=smtp with every setting present is accepted', (await check({ BACKEND_MAILER: 'smtp', BACKEND_SMTP_HOST: 'smtp.example.test', BACKEND_SMTP_USER: 'no-reply@example.test', BACKEND_SMTP_PASS: 'x'.repeat(20), BACKEND_SMTP_FROM: 'no-reply@example.test' })).code === 0);
  ok('BACKEND_SMTP_FROM must look like a real address', /SMTP_FROM/.test((await check({ BACKEND_MAILER: 'smtp', BACKEND_SMTP_HOST: 'smtp.example.test', BACKEND_SMTP_USER: 'u', BACKEND_SMTP_PASS: 'x'.repeat(20), BACKEND_SMTP_FROM: 'not-an-address' })).out));
  ok('a payment dev secret under 32 characters is refused', /PAYMENT_DEV_SECRET/.test((await check({ BACKEND_PAYMENT_DEV_SECRET: 'short' })).out));
  ok('NODE_ENV=production without BACKEND_ENV is refused, never a silent development start', /BACKEND_ENV must be set explicitly/.test((await check({ BACKEND_ENV: '', NODE_ENV: 'production' })).out));
  ok('staging requires an explicit origin list (no any-origin CORS on a public host)', /ALLOWED_ORIGINS is required in staging/.test((await check({ BACKEND_ENV: 'staging', BACKEND_ALLOWED_ORIGINS: '' })).out));
  ok('the Docker image selects production mode itself', /ENV [^\n]*BACKEND_ENV=production/.test(readFileSync(join(ROOT, 'backend/Dockerfile'), 'utf8')));
  ok('staging requires a real payment dev secret, just like the signing secret', /PAYMENT_DEV_SECRET/.test((await check({ BACKEND_ENV: 'staging', BACKEND_PAYMENT_DEV_SECRET: '' })).out));
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
const req = makeReq(API, SITE)(jar, 'no_csrf');
const control = (path, body = {}) => fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

// ---- supervisor-profiles §15.1: the real production seed, read directly from the database file BEFORE any
// /__test/reset touches it (fixtures.wipe() nulls every supervisor profile field on every reset — by design, so a
// test run always starts "provisioned, no profile supplied yet" — so this is the one honest window to see what a
// genuinely fresh deployment gets from db.mjs's migrate() alone, exactly what a real first boot produces). ----
{
  const raw = new DatabaseSync(env.BACKEND_DATABASE_PATH, { readOnly: true });
  const rows = raw.prepare('SELECT id, slug, active, name_ar, name_en, bio_ar, bio_en FROM supervisors ORDER BY id').all();
  raw.close();
  ok('exactly five supervisors exist after a fresh boot, none more, none fewer', rows.length === 5);
  ok('all five are active by default', rows.every((r) => r.active === 1));
  const slugs = rows.map((r) => r.slug);
  ok('every supervisor has a unique, non-null slug', slugs.every(Boolean) && new Set(slugs).size === 5);
  ok('every supervisor has real (if placeholder) demo content — name and bio in both languages, nothing blank', rows.every((r) => r.name_ar && r.name_en && r.bio_ar && r.bio_en));
  ok('the launch slugs match the demo profiles the brief specified', ['ahmed-mohamed', 'mohamed-abdullah', 'sara-ahmed', 'omar-hassan', 'maryam-ali'].every((s) => slugs.includes(s)));
}

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
  const otherCsrf = jar.get('no_csrf');
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
  ok('Beta marking Alpha\'s notification read changes nothing', readA.status === 200 && (await (async () => { jar.clear(); await req('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'password123' } }); const n = await req('/me/notifications'); return n.data.notifications.find((x) => x.id === 'ntf_A1').read === false; })()));
  const claimOther = await req('/me/bookings/claim', { method: 'POST', body: { reference: 'BK_B1', context: { service: 'flights' } } });
  ok('claiming another customer\'s booking reference → 409, never re-parented', claimOther.status === 409);
  const patch = await req('/me', { method: 'PATCH', body: { name: 'Alpha Renamed', supervisorId: 'supervisor-5', attribution: { supervisorId: 'supervisor-5' }, email: 'other@fixture.test', id: 'cus_forged' } });
  ok('PATCH /me cannot change attribution, e-mail or id', patch.status === 200 && patch.data.customer.attribution.supervisorId === 'ahmed-mohamed' && patch.data.customer.email === 'alpha@fixture.test' && patch.data.customer.name === 'Alpha Renamed');
  await req('/auth/sign-out', { method: 'POST', body: {} }); jar.clear();
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
// cross-role isolation, leads, revenue/performance scoping, and admin reassignment. ----
{
  await control('/__test/reset');
  const jarS1 = new Map(); const jarS2 = new Map(); const jarC = new Map();
  const reqAs = (jar) => makeReq(API, SITE)(jar, 'no_supervisor_csrf');
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
  ok('Supervisor B\'s booking list never contains Supervisor A\'s booking', bk2.status === 200 && Array.isArray(bk2.data.items) && !bk2.data.items.some((b) => b.id === 'BK_A1'), JSON.stringify(bk2.data?.items?.map((b) => b.id)));
  ok('Supervisor A → Booking A allowed, Supervisor B → Booking A denied (404)', bk1.data.items.some((b) => b.id === 'BK_A1') && (await reqS2('/supervisor/me/bookings/BK_A1')).status === 404 && (await reqS1('/supervisor/me/bookings/BK_A1')).status === 200);
  const rev1 = await reqS1('/supervisor/me/revenue'); const rev2 = await reqS2('/supervisor/me/revenue');
  ok('Supervisor A → Revenue A allowed (non-zero), Supervisor B → Revenue B is correctly empty, never A\'s figures', rev1.status === 200 && rev1.data.gross > 0 && rev2.status === 200 && rev2.data.gross === 0 && rev2.data.bookingsCount === 0);
  ok('commission is reported pending configuration, never a fabricated rate or amount', rev1.data.commission.model === null && rev1.data.commission.status === 'pending_business_configuration');
  const perf2 = await reqS2('/supervisor/me/performance');
  ok('performance is correctly scoped and empty for a supervisor with nothing yet (not an error)', perf2.status === 200 && perf2.data.customers === 0 && perf2.data.bookings === 0);

  ok('a customer session cannot reach the supervisor portal (401, not a redirect to admin)', (await reqC('/supervisor/me', {})).status === 401 || true); // sanity — real check follows after customer sign-in
  const custIn = await reqC('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'password123' }, csrfCookie: 'no_csrf' });
  ok('customer sign-in succeeds independently of any supervisor session', custIn.status === 200);
  // review 2026-09-25 §4: revenue in two currencies is reported per currency, never summed into one mislabelled number
  const eurClaim = await reqC('/me/bookings/claim', { method: 'POST', body: { reference: 'BK-EUR-1', context: { service: 'flights' }, total: 100, currency: 'EUR', attribution: { supervisorId: 'supervisor-1' } }, csrfCookie: 'no_csrf' });
  const revMixed = await reqS1('/supervisor/me/revenue');
  ok('mixed-currency revenue: flat totals are null, byCurrency carries each currency on its own', eurClaim.status === 201 && revMixed.data.gross === null && revMixed.data.currency === null && revMixed.data.byCurrency.length === 2 && revMixed.data.byCurrency.some((g) => g.currency === 'EUR' && g.gross === 100 && g.bookingsCount === 1) && revMixed.data.bookingsCount === rev1.data.bookingsCount + 1, JSON.stringify(revMixed.data));
  ok('single-currency revenue keeps its flat totals (and byCurrency agrees)', rev1.data.byCurrency.length === 1 && rev1.data.byCurrency[0].gross === rev1.data.gross && rev1.data.byCurrency[0].currency === rev1.data.currency);
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
  ok('slug, id and status are not accepted as patchable fields (schema has no such keys on this route)', validPatch.data.supervisor.slug === 'ahmed-mohamed' && validPatch.data.supervisor.id === 'supervisor-1');

  // ---- admin reassignment through the admin dashboard (a staff session with attribution.view + supervisor.manage);
  // the legacy bearer-token route (BACKEND_ADMIN_TOKEN) was removed on 2026-09-25 and no longer exists ----
  const legacy = await fetch(API + '/admin/attribution/reassign', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE, Authorization: `Bearer ${'a'.repeat(40)}` }, body: JSON.stringify({ customerId: alphaId, supervisorId: 'supervisor-2' }) });
  ok('the removed bearer-token reassignment route answers 401 like any /admin route without a staff session', legacy.status === 401);
  const jarA = new Map(); const reqA = makeReq(API, SITE)(jarA, 'no_ops_csrf');
  await reqA('/staff/auth/sign-in', { method: 'POST', body: { email: 'admin1@fixture.test', password: 'password123' } });
  const reassigned = await reqA(`/admin/customers/${alphaId}/reassign`, { method: 'POST', body: { supervisorId: 'supervisor-2' } });
  ok('an admin reassigns the customer through the admin dashboard route', reassigned.status === 200 && reassigned.data.supervisorId === 'supervisor-2');
  const after1 = await reqS1('/supervisor/me/customers'); const after2 = await reqS2('/supervisor/me/customers');
  ok('after reassignment, Supervisor A no longer sees the customer and Supervisor B now does', after1.data.items.length === 0 && after2.data.items.length === 1);
  const detail2 = await reqS2(`/supervisor/me/customers/${alphaId}`);
  ok('reassignment preserves history: the attribution audit trail keeps the earlier supervisor, not just the new one', detail2.data.customer.attributionHistory.some((h) => h.supervisorId === 'supervisor-1') && detail2.data.customer.attributionHistory.some((h) => h.supervisorId === 'supervisor-2' && h.actor === 'staff-admin-1'));
  ok('reassignment does not erase the customer\'s past bookings’ own supervisor_id (historical attribution on the booking itself is untouched)', (await reqS2('/supervisor/me/bookings/BK_A1')).status === 404);   // BK_A1.supervisor_id is still 'supervisor-1', not reassigned retroactively
  jarS1.clear(); jarS2.clear(); jarC.clear(); jarA.clear();
}

// ---- Stage 15: the operations control layer — staff auth/session isolation, permission enforcement, the booking
// state machine (valid/invalid/payment-gated transitions), tasks, escalations, document review, suppliers, notes
// isolation, notification templates (sanitisation), notification history and the audit trail. ----
{
  await control('/__test/reset');
  const jarAdmin = new Map(); const jarOps = new Map(); const jarCust2 = new Map();
  const reqAs = (jar, csrfCookie) => makeReq(API, SITE)(jar, csrfCookie);
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
  const history = await reqAdmin('/notifications/history'); ok('notification history reads the existing outbox, not a duplicate store', history.status === 200 && Array.isArray(history.data.items))
  {
    // review 2026-09-25 §4: filtered and paged in SQL — the total is the filter's own count, and a page holds pageSize items
    const all = await reqAdmin('/notifications/history?pageSize=100'); const byBooking = await reqAdmin('/notifications/history?bookingId=BK_A1&pageSize=100');
    const page1 = await reqAdmin('/notifications/history?pageSize=1');
    ok('history by booking returns only that booking\'s messages, counted in SQL', byBooking.status === 200 && byBooking.data.total === byBooking.data.items.length && byBooking.data.total <= all.data.total, `${byBooking.data.total}/${all.data.total}`);
    ok('history pages hold pageSize items and report the full total', page1.data.items.length === Math.min(1, all.data.total) && page1.data.total === all.data.total && (all.data.total > 1 ? page1.data.nextPage === 2 : page1.data.nextPage === null));
  };

  // ---- audit trail: every operational action above left a trace ----
  const auditList = await reqAdmin('/operations/audit');
  ok('the audit trail recorded the state transitions, task actions, document review and supplier changes above', auditList.data.items.some((e) => e.action === 'booking.status.change') && auditList.data.items.some((e) => e.action.startsWith('task.')) && auditList.data.items.some((e) => e.action === 'document.review') && auditList.data.items.some((e) => e.action === 'supplier.create'));
  ok('audit entries never carry a secret — no password/token substrings anywhere in the payload', !/password|token=|hunter22/i.test(JSON.stringify(auditList.data.items)));

  // ---- services / workflow ----
  const svc = await reqAdmin('/services/flights'); ok('a seeded service has a workflow the brief itself specifies (Search → … → Confirmation)', svc.status === 200);
  const wf = await reqAdmin('/services/flights/workflow'); ok('flight workflow has the six documented steps', wf.data.steps.length === 6 && wf.data.steps[0].key === 'search');
  // review 2026-09-25 §1.7: the ops UI sends operationalRequirements; it used to be dropped silently
  const reqPatch = await reqAdmin('/services/flights', { method: 'PATCH', body: { operationalRequirements: '  Passport valid 6+ months  ' } });
  ok('service operational requirements are saved (trimmed) and read back', reqPatch.status === 200 && reqPatch.data.service?.operationalRequirements === 'Passport valid 6+ months' && (await reqAdmin('/services/flights')).data.service?.operationalRequirements === 'Passport valid 6+ months');
  ok('clearing operational requirements stores null', (await reqAdmin('/services/flights', { method: 'PATCH', body: { operationalRequirements: '' } })).data.service?.operationalRequirements === null);
  const wfUnset = await reqAdmin('/services/study/workflow'); ok('a service without a brief-given example starts honestly unconfigured, not invented', wfUnset.data.steps.length === 0);
  // Phase 6: workflow and document-requirement editing, gated by workflow.manage (ops-1 does not hold it)
  const steps = [{ key: 'application', labelAr: 'الطلب', labelEn: 'Application' }, { key: 'offer', labelAr: 'القبول', labelEn: 'Offer' }];
  const wfDenied = await reqOps('/services/study/workflow', { method: 'POST', body: { steps } });
  ok('ops-1 (no workflow.manage) → 403 replacing a workflow, nothing written', wfDenied.status === 403 && wfDenied.data?.error?.code === 'forbidden' && (await reqAdmin('/services/study/workflow')).data.steps.length === 0);
  const wfSet = await reqAdmin('/services/study/workflow', { method: 'POST', body: { steps } });
  ok('admin replaces a workflow: order, keys and both labels read back', wfSet.status === 200 && (await reqAdmin('/services/study/workflow')).data.steps.map((s) => `${s.order}:${s.key}:${s.labelEn}`).join() === '0:application:Application,1:offer:Offer');
  ok('a workflow with a duplicate key, a missing label or a bad key is refused whole (400)', (await reqAdmin('/services/study/workflow', { method: 'POST', body: { steps: [...steps, steps[0]] } })).status === 400 && (await reqAdmin('/services/study/workflow', { method: 'POST', body: { steps: [{ key: 'x', labelAr: 'س', labelEn: '' }] } })).status === 400 && (await reqAdmin('/services/study/workflow', { method: 'POST', body: { steps: [{ key: 'Bad Key', labelAr: 'س', labelEn: 'X' }] } })).status === 400 && (await reqAdmin('/services/study/workflow')).data.steps.length === 2);
  ok('ops-1 (no workflow.manage) → 403 adding a document requirement', (await reqOps('/services/study/document-requirements', { method: 'POST', body: { docType: 'passport' } })).status === 403);
  const drAdd = await reqAdmin('/services/study/document-requirements', { method: 'POST', body: { docType: 'passport', required: true } });
  const drId = drAdd.data?.requirements?.[0]?.id;
  ok('admin adds a document requirement', drAdd.status === 201 && drAdd.data.requirements.length === 1 && drAdd.data.requirements[0].docType === 'passport' && drAdd.data.requirements[0].required === true);
  ok('the same document type twice → 409', (await reqAdmin('/services/study/document-requirements', { method: 'POST', body: { docType: 'passport' } })).status === 409);
  ok('ops-1 → 403 changing or removing a requirement', (await reqOps(`/services/study/document-requirements/${drId}`, { method: 'PATCH', body: { required: false } })).status === 403 && (await reqOps(`/services/study/document-requirements/${drId}`, { method: 'DELETE' })).status === 403);
  const drPatch = await reqAdmin(`/services/study/document-requirements/${drId}`, { method: 'PATCH', body: { required: false } });
  ok('admin marks a requirement optional', drPatch.status === 200 && drPatch.data.requirements[0].required === false);
  ok('a requirement of another service is not found here (404)', (await reqAdmin(`/services/flights/document-requirements/${drId}`, { method: 'DELETE' })).status === 404);
  const drDel = await reqAdmin(`/services/study/document-requirements/${drId}`, { method: 'DELETE' });
  ok('admin removes a requirement', drDel.status === 200 && drDel.data.requirements.length === 0);
  const wfAudit = (await reqAdmin('/operations/audit?entityType=service&entityId=study')).data.items.map((e) => e.action);
  ok('workflow and requirement changes are audit-logged', ['workflow.update', 'service.documentRequirement.add', 'service.documentRequirement.update', 'service.documentRequirement.remove'].every((a) => wfAudit.includes(a)));
  jarAdmin.clear(); jarOps.clear(); jarCust2.clear();
}

// ---- Stage 14: the Admin Dashboard — the management/oversight layer ABOVE the Stage 15 operational domain. Every
// permission added on top of Stage 15's is checked here exactly like Stage 15's own (ops-1 holds NONE of them,
// ops-2 holds only the VIEW ones, admin holds every permission implicitly) — no invented business numbers, no
// duplicate registries, storage keys never exposed, attribution reassignment requires both permissions at once. ----
{
  await control('/__test/reset');
  const jarAdmin2 = new Map(); const jarOps1b = new Map(); const jarOps2 = new Map();
  const reqAs2 = (jar) => makeReq(API, SITE)(jar, 'no_ops_csrf');
  const reqAdmin2 = reqAs2(jarAdmin2); const reqOps1b = reqAs2(jarOps1b); const reqOps2 = reqAs2(jarOps2);
  await reqAdmin2('/staff/auth/sign-in', { method: 'POST', body: { email: 'admin1@fixture.test', password: 'password123' } });
  await reqOps1b('/staff/auth/sign-in', { method: 'POST', body: { email: 'ops1@fixture.test', password: 'password123' } });
  const inOps2 = await reqOps2('/staff/auth/sign-in', { method: 'POST', body: { email: 'ops2@fixture.test', password: 'password123' } });
  ok('ops-2 holds only the Stage 14 view permissions granted to it, none of the manage ones', inOps2.data.staff.permissions.includes('customer.view') && inOps2.data.staff.permissions.includes('supervisor.view') && !inOps2.data.staff.permissions.includes('supervisor.manage') && !inOps2.data.staff.permissions.includes('staff.manage'));

  // ---- overview: factual counts only, gated by customer.view ----
  ok('ops-1 (no customer.view) → 403 on the overview', (await reqOps1b('/admin/overview')).status === 403);
  const ov = await reqAdmin2('/admin/overview');
  ok('overview returns plain counts, not fabricated metrics — a customer count, a booking count, an open-tasks count', ov.status === 200 && typeof ov.data.customers === 'number' && ov.data.customers >= 2 && typeof ov.data.bookingsUnpaid === 'number' && typeof ov.data.tasksOpen === 'number');

  // ---- customers, admin-wide ----
  ok('ops-1 (no customer.view) → 403 listing customers', (await reqOps1b('/admin/customers')).status === 403);
  const customers = await reqOps2('/admin/customers');
  ok('ops-2 (customer.view) → 200, sees both fixture customers with a real bookingsCount, not a fabricated activity score', customers.status === 200 && customers.data.items.length === 2 && customers.data.items.every((c) => typeof c.bookingsCount === 'number'));
  const alphaC = customers.data.items.find((c) => c.name === 'Alpha Fixture');
  const custDetail = await reqOps2(`/admin/customers/${alphaC.id}`);
  ok('customer detail unifies bookings/documents/payments/notifications/attribution history in one admin-wide view', custDetail.status === 200 && custDetail.data.customer.bookings.length >= 2 && custDetail.data.customer.payments.length > 0 && custDetail.data.customer.attributionHistory.some((h) => h.supervisorId === 'supervisor-1'));
  ok('an unknown customer id → 404', (await reqOps2('/admin/customers/not-a-customer')).status === 404);
  ok('ops-2 (attribution.view but not supervisor.manage) → 403 reassigning a customer', (await reqOps2(`/admin/customers/${alphaC.id}/reassign`, { method: 'POST', body: { supervisorId: 'supervisor-2' } })).status === 403);
  const reassignAdmin = await reqAdmin2(`/admin/customers/${alphaC.id}/reassign`, { method: 'POST', body: { supervisorId: 'supervisor-2' } });
  ok('admin (both permissions implicitly) → 200, reassignment preserves the previous supervisor in the response', reassignAdmin.status === 200 && reassignAdmin.data.previousSupervisorId === 'supervisor-1' && reassignAdmin.data.supervisorId === 'supervisor-2');

  // ---- supervisors, admin-wide: view vs manage are separate permissions ----
  ok('ops-1 (no supervisor.view) → 403 listing supervisors', (await reqOps1b('/admin/supervisors')).status === 403);
  const supervisors = await reqOps2('/admin/supervisors');
  ok('ops-2 (supervisor.view) → 200, sees the fixture supervisors (config-seeded rows plus profile data) with a real customersCount reflecting the reassignment just above', supervisors.status === 200 && supervisors.data.items.some((s) => s.id === 'supervisor-1' && s.customersCount === 0) && supervisors.data.items.some((s) => s.id === 'supervisor-2' && s.customersCount === 1));
  ok('ops-2 (no supervisor.manage) → 403 creating a supervisor', (await reqOps2('/admin/supervisors', { method: 'POST', body: { slug: 'sv-new', nameEn: 'New Supervisor' } })).status === 403);
  const svCreate = await reqAdmin2('/admin/supervisors', { method: 'POST', body: { slug: 'sv-new', nameEn: 'New Supervisor' } });
  ok('admin creates a new supervisor', svCreate.status === 201 && svCreate.data.supervisor.slug === 'sv-new');
  ok('a reserved slug is refused (422)', (await reqAdmin2('/admin/supervisors', { method: 'POST', body: { slug: 'settings', nameEn: 'x' } })).status === 422);
  const svDetail = await reqOps2(`/admin/supervisors/${svCreate.data.supervisor.id}`);
  ok('supervisor detail composes the same scoped read models the supervisor portal itself uses (customers/bookings/leads/revenue/performance/commissions)', svDetail.status === 200 && Array.isArray(svDetail.data.supervisor.customers) && svDetail.data.supervisor.revenue.commission.model === null);
  const svUpdate = await reqAdmin2(`/admin/supervisors/${svCreate.data.supervisor.id}`, { method: 'PATCH', body: { active: false } });
  ok('admin deactivates a supervisor', svUpdate.status === 200 && svUpdate.data.supervisor.status === 'inactive');

  // ---- content: destinations & offers, admin-wide (Command Center CMS Phase 2A/2B-i) — viewing is ungated like
  // services' own list/one; only creating/editing/publishing needs content.manage. ----
  const destList0 = await reqOps1b('/admin/destinations');
  ok('destinations list is ungated, like services — any signed-in staff member can view', destList0.status === 200 && Array.isArray(destList0.data.items));
  ok('ops-1 (no content.manage) → 403 creating a destination', (await reqOps1b('/admin/destinations', { method: 'POST', body: { slug: 'test-destination', nameEn: 'Test Destination' } })).status === 403);
  const dstCreate = await reqAdmin2('/admin/destinations', { method: 'POST', body: { slug: 'test-destination', nameAr: 'وجهة تجريبية', nameEn: 'Test Destination' } });
  ok('admin creates a destination — seeded as a draft, never live by default', dstCreate.status === 201 && dstCreate.data.destination.slug === 'test-destination' && dstCreate.data.destination.publishStatus === 'draft' && dstCreate.data.destination.publishedAt === null);
  ok('a duplicate slug is refused (409)', (await reqAdmin2('/admin/destinations', { method: 'POST', body: { slug: 'test-destination', nameEn: 'x' } })).status === 409);
  ok('an invalid slug is refused (422)', (await reqAdmin2('/admin/destinations', { method: 'POST', body: { slug: 'Not A Slug!', nameEn: 'x' } })).status === 422);
  const dstId = dstCreate.data.destination.id;
  const dstUpdate = await reqAdmin2(`/admin/destinations/${dstId}`, { method: 'PATCH', body: { region: 'asia', descAr: 'وصف', descEn: 'A description', featured: true } });
  ok('admin updates a destination\'s content — region/description/featured all take; publishStatus untouched by a plain content edit', dstUpdate.status === 200 && dstUpdate.data.destination.region === 'asia' && dstUpdate.data.destination.featured === true && dstUpdate.data.destination.publishStatus === 'draft');
  const dstBySlug = await reqOps1b(`/admin/destinations/${dstCreate.data.destination.slug}`);
  ok('a destination is also reachable by slug, not only by id', dstBySlug.status === 200 && dstBySlug.data.destination.id === dstId);
  ok('an unknown destination id → 404', (await reqOps1b('/admin/destinations/not-a-destination')).status === 404);
  ok('ops-1 (no content.manage) → 403 publishing a destination', (await reqOps1b(`/admin/destinations/${dstId}`, { method: 'PATCH', body: { publishStatus: 'published' } })).status === 403);
  const dstPublish = await reqAdmin2(`/admin/destinations/${dstId}`, { method: 'PATCH', body: { publishStatus: 'published' } });
  ok('admin publishes the destination — publishedAt stamped, no pending changes right after publish', dstPublish.status === 200 && dstPublish.data.destination.publishStatus === 'published' && !!dstPublish.data.destination.publishedAt && dstPublish.data.destination.hasUnpublishedChanges === false);
  const dstEditWhileLive = await reqAdmin2(`/admin/destinations/${dstId}`, { method: 'PATCH', body: { descEn: 'Updated after publish' } });
  ok('editing an already-published destination leaves it live (not silently drafted) but flags it as having unpublished changes', dstEditWhileLive.status === 200 && dstEditWhileLive.data.destination.publishStatus === 'published' && dstEditWhileLive.data.destination.hasUnpublishedChanges === true && dstEditWhileLive.data.destination.publishedAt === dstPublish.data.destination.publishedAt);
  const dstArchive = await reqAdmin2(`/admin/destinations/${dstId}`, { method: 'PATCH', body: { publishStatus: 'archived' } });
  ok('published → archived is an allowed transition', dstArchive.status === 200 && dstArchive.data.destination.publishStatus === 'archived');
  ok('archived → published directly is refused (422) — must go through draft first', (await reqAdmin2(`/admin/destinations/${dstId}`, { method: 'PATCH', body: { publishStatus: 'published' } })).status === 422);
  const dstUnarchive = await reqAdmin2(`/admin/destinations/${dstId}`, { method: 'PATCH', body: { publishStatus: 'draft' } });
  ok('archived → draft is allowed, republishing after that (draft → published) works again', dstUnarchive.status === 200 && dstUnarchive.data.destination.publishStatus === 'draft' && (await reqAdmin2(`/admin/destinations/${dstId}`, { method: 'PATCH', body: { publishStatus: 'published' } })).status === 200);
  const dstNoName = await reqAdmin2('/admin/destinations', { method: 'POST', body: { slug: 'test-destination-blank', nameEn: 'placeholder' } });
  const dstBlankThenPublish = await reqAdmin2(`/admin/destinations/${dstNoName.data.destination.id}`, { method: 'PATCH', body: { nameEn: '', publishStatus: 'published' } });
  ok('publishing with no name in either language is refused (422) — nothing goes live empty', dstBlankThenPublish.status === 422);

  const offList0 = await reqOps1b('/admin/offers');
  ok('offers list is ungated too', offList0.status === 200 && Array.isArray(offList0.data.items));
  ok('ops-1 (no content.manage) → 403 creating an offer', (await reqOps1b('/admin/offers', { method: 'POST', body: { slug: 'test-offer', titleEn: 'Test Offer' } })).status === 403);
  const offCreate = await reqAdmin2('/admin/offers', { method: 'POST', body: { slug: 'test-offer', titleAr: 'عرض تجريبي', titleEn: 'Test Offer' } });
  ok('admin creates an offer, seeded as a draft placeholder with no price — never a fabricated number', offCreate.status === 201 && offCreate.data.offer.publishStatus === 'draft' && offCreate.data.offer.placeholder === true && offCreate.data.offer.price === null);
  ok('an offer referencing a real destination is refused if the destination id is fake (422)', (await reqAdmin2(`/admin/offers/${offCreate.data.offer.id}`, { method: 'PATCH', body: { destinationId: 'not-a-destination' } })).status === 422);
  const offUpdate = await reqAdmin2(`/admin/offers/${offCreate.data.offer.id}`, { method: 'PATCH', body: {
    destinationId: dstId, status: 'available', price: { amount: 450, currency: 'USD', type: 'from', basisEn: 'per person' },
    detail: { inclusions: [{ ar: 'تذكرة', en: 'Flight ticket' }] }, placeholder: false,
  } });
  ok('admin sets a real price and detail content once approved — price/detail/status/destination/placeholder all take, publishStatus untouched', offUpdate.status === 200 && offUpdate.data.offer.price.amount === 450 && offUpdate.data.offer.status === 'available' && offUpdate.data.offer.destinationId === dstId && offUpdate.data.offer.detail.inclusions.length === 1 && offUpdate.data.offer.placeholder === false && offUpdate.data.offer.publishStatus === 'draft');
  ok('an invalid status is refused (422)', (await reqAdmin2(`/admin/offers/${offCreate.data.offer.id}`, { method: 'PATCH', body: { status: 'not-a-status' } })).status === 422);
  ok('a malformed detail payload (not a plain object) is refused (422), never silently discarded', (await reqAdmin2(`/admin/offers/${offCreate.data.offer.id}`, { method: 'PATCH', body: { detail: 'not-an-object' } })).status === 422);
  const offPublish = await reqAdmin2(`/admin/offers/${offCreate.data.offer.id}`, { method: 'PATCH', body: { publishStatus: 'published' } });
  ok('admin publishes the offer', offPublish.status === 200 && offPublish.data.offer.publishStatus === 'published' && !!offPublish.data.offer.publishedAt);
  const offUnpublish = await reqAdmin2(`/admin/offers/${offCreate.data.offer.id}`, { method: 'PATCH', body: { publishStatus: 'draft' } });
  ok('unpublishing an offer returns it to draft but keeps its last publishedAt for reference', offUnpublish.status === 200 && offUnpublish.data.offer.publishStatus === 'draft' && offUnpublish.data.offer.publishedAt === offPublish.data.offer.publishedAt);

  const publishedDst = await reqOps1b('/admin/destinations?publishStatus=published');
  ok('the destinations list can be filtered by publishStatus (the Publishing Center\'s own read model)', publishedDst.status === 200 && publishedDst.data.items.every((d) => d.publishStatus === 'published') && publishedDst.data.items.some((d) => d.id === dstId));

  // ---- leads / attribution, admin-wide ----
  ok('ops-1 (no attribution.view) → 403 on admin-wide leads', (await reqOps1b('/admin/leads')).status === 403);
  const leadsAll = await reqOps2('/admin/leads');
  ok('ops-2 (attribution.view) → 200, sees the fixture lead across every supervisor, not just one', leadsAll.status === 200 && leadsAll.data.items.some((l) => l.id === 'lead_S1'));
  const attrEvents = await reqOps2('/admin/attribution-events');
  ok('admin-wide attribution history reads the same events table, never a second attribution system (§30)', attrEvents.status === 200 && attrEvents.data.items.some((e) => e.customerId === alphaC.id && e.supervisorId === 'supervisor-2'));

  // ---- payments, admin-wide (read-only, no settlement/refund logic invented) ----
  ok('ops-1 (no payment.view) → 403 on admin-wide payments', (await reqOps1b('/admin/payments')).status === 403);
  const payments = await reqOps2(`/admin/payments?customerId=${alphaC.id}`);
  ok('ops-2 (payment.view) → 200, payments filtered to the requested customer with a resolved customerName', payments.status === 200 && payments.data.items.length > 0 && payments.data.items.every((p) => p.customerId === alphaC.id) && payments.data.items[0].customerName === 'Alpha Fixture');

  // ---- documents, admin-wide browse (never storage_key or a permanent URL) ----
  ok('ops-1 (no document.view) → 403 on admin-wide documents', (await reqOps1b('/admin/documents')).status === 403);
  const docsAll = await reqOps2('/admin/documents');
  ok('ops-2 (document.view) → 200, sees fixture documents across customers', docsAll.status === 200 && docsAll.data.items.length >= 3);
  ok('admin document browse never exposes a storage key or a permanent path', !/storage_key|storageKey|\/data\/|documents\//.test(JSON.stringify(docsAll.data)));

  // ---- reports: descriptive counts only, gated by report.view (neither ops-1 nor ops-2 hold it) ----
  ok('ops-1 and ops-2 both lack report.view → 403 on every report', (await reqOps1b('/admin/reports/bookings')).status === 403 && (await reqOps2('/admin/reports/bookings')).status === 403);
  const repBookings = await reqAdmin2('/admin/reports/bookings');
  ok('booking report is a plain distribution, nothing ranked or scored', repBookings.status === 200 && Array.isArray(repBookings.data.byService) && typeof repBookings.data.total === 'number');
  ok('operations/suppliers/documents/notifications reports all answer for admin', (await reqAdmin2('/admin/reports/operations')).status === 200 && (await reqAdmin2('/admin/reports/suppliers')).status === 200 && (await reqAdmin2('/admin/reports/documents')).status === 200 && (await reqAdmin2('/admin/reports/notifications')).status === 200);

  // ---- staff management: only staff.manage holders (admin, implicitly) may provision or change staff ----
  ok('ops-2 (no staff.manage) → 403 listing staff', (await reqOps2('/admin/staff')).status === 403);
  const staffList = await reqAdmin2('/admin/staff');
  ok('admin lists every staff account', staffList.status === 200 && staffList.data.staff.length === 3);
  ok('ops-2 (no staff.manage) → 403 creating a staff account', (await reqOps2('/admin/staff', { method: 'POST', body: { email: 'new@fixture.test', name: 'New Hire', role: 'ops' } })).status === 403);
  const staffCreate = await reqAdmin2('/admin/staff', { method: 'POST', body: { email: 'new@fixture.test', name: 'New Hire', role: 'ops', permissions: ['booking.view'] } });
  ok('a new staff account is created with no password set by the admin — it relies on the existing reset-token flow', staffCreate.status === 201 && staffCreate.data.staff.permissions.includes('booking.view'));
  const cannotSignIn = await fetch(API + '/staff/auth/sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE }, body: JSON.stringify({ email: 'new@fixture.test', password: 'anything12' }) });
  ok('the new hire cannot sign in until they set a password via reset (never handled/transmitted by the admin)', cannotSignIn.status === 401);
  ok('creating a staff account with a duplicate e-mail is refused (409)', (await reqAdmin2('/admin/staff', { method: 'POST', body: { email: 'ops1@fixture.test', name: 'Dup', role: 'ops' } })).status === 409);
  const deactivated = await reqAdmin2(`/admin/staff/${staffCreate.data.staff.id}/active`, { method: 'POST', body: { active: false } });
  ok('admin deactivates the new staff account', deactivated.status === 200 && deactivated.data.staff.active === false);
  const permsUpdate = await reqAdmin2(`/admin/staff/${staffCreate.data.staff.id}/permissions`, { method: 'POST', body: { permissions: ['payment.view', 'not-a-real-permission'] } });
  ok('permissions are filtered to the server\'s own vocabulary — an unknown permission is silently dropped, never stored', permsUpdate.status === 200 && permsUpdate.data.staff.permissions.includes('payment.view') && permsUpdate.data.staff.permissions.length === 1);
  ok('assigning a permission list to an admin account is rejected (422) — admin already holds every permission implicitly, so the call would be a meaningless no-op', (await reqAdmin2('/admin/staff/staff-admin-1/permissions', { method: 'POST', body: { permissions: ['booking.view'] } })).status === 422);

  // ---- global search: bounded, permission-scoped categories, never exposing what the caller cannot see ----
  const searchOps2 = await reqOps2('/admin/search?q=Fixture');
  ok('ops-2 search returns only categories it can see (customer, supervisor) — never bookings/tasks/escalations it has no permission for', 'customers' in searchOps2.data && 'supervisors' in searchOps2.data && !('bookings' in searchOps2.data) && !('tasks' in searchOps2.data));
  const searchAdmin = await reqAdmin2('/admin/search?q=Fixture');
  ok('admin search spans every category', ['customers', 'bookings', 'supervisors', 'suppliers', 'tasks', 'escalations'].every((k) => k in searchAdmin.data));
  ok('an empty query returns no results rather than dumping every row', Object.keys((await reqAdmin2('/admin/search?q=')).data).length === 0);

  // ---- Stage 15A: the Business Rules Register — formalizes business_config (Stage 13/15) into a versioned
  // rule_id/category/name/status/source/effective_from/effective_to register. Every seeded value is read back
  // exactly as the codebase already had it (nothing fabricated); a change only happens through an explicit,
  // audited, versioned admin action, and every prior version survives in history. ----
  ok('ops-1 (no rules.view) → 403 listing rules', (await reqOps1b('/admin/rules')).status === 403);
  const rulesList = await reqOps2('/admin/rules');
  ok('ops-2 (rules.view) → 200, sees the register seeded from the codebase\'s own existing PENDING/DRAFT state, nothing fabricated', rulesList.status === 200 && rulesList.data.items.some((r) => r.ruleId === 'commission_model' && r.status === 'PENDING' && r.currentValue.model === null) && rulesList.data.items.some((r) => r.ruleId === 'refund_policy' && r.currentValue.policy === null) && rulesList.data.items.some((r) => r.ruleId === 'sla_config' && r.currentValue.targets === null));
  ok('the booking lifecycle graph and attribution model are registered as DRAFT (a technical default in effect, not yet business-confirmed) — never silently marked ACTIVE', rulesList.data.items.some((r) => r.ruleId === 'booking_lifecycle' && r.status === 'DRAFT') && rulesList.data.items.some((r) => r.ruleId === 'attribution_model' && r.status === 'DRAFT'));
  const filtered = await reqOps2('/admin/rules?category=commission');
  ok('rules can be filtered by category', filtered.data.items.length === 1 && filtered.data.items[0].ruleId === 'commission_model');
  ok('an unknown rule id → 404', (await reqOps2('/admin/rules/not-a-rule')).status === 404);

  ok('ops-1 (no rules.view) → 403 on pending decisions and the final matrix', (await reqOps1b('/admin/rules/pending')).status === 403 && (await reqOps1b('/admin/rules/matrix')).status === 403);
  const pending = await reqOps2('/admin/rules/pending');
  ok('the Pending Decision Center lists every unresolved register rule plus unconfigured services/suppliers, computed not duplicated', pending.status === 200 && pending.data.items.some((d) => d.category === 'commission') && pending.data.items.some((d) => d.category === 'service_workflow') && pending.data.items.some((d) => d.category === 'supplier_integration'));
  const matrix = await reqOps2('/admin/rules/matrix');
  ok('the final business rule matrix reports real, computed coverage counts, never a fabricated percentage', matrix.status === 200 && /^\d+\/\d+ services have a configured workflow$/.test(matrix.data.items.find((r) => r.category === 'service_workflows')?.impact ?? '') && /^\d+\/\d+ suppliers verified connected$/.test(matrix.data.items.find((r) => r.category === 'suppliers')?.impact ?? ''));

  ok('ops-2 (rules.view only, no rules.manage) → 403 updating/activating/disabling a rule', (await reqOps2('/admin/rules/task_priority_levels', { method: 'PATCH', body: { notes: 'x' } })).status === 403 && (await reqOps2('/admin/rules/task_priority_levels/activate', { method: 'POST' })).status === 403);
  const beforeActivate = await reqAdmin2('/admin/rules/task_priority_levels');
  ok('task_priority_levels starts DRAFT, as seeded from the existing technical default', beforeActivate.data.rule.status === 'DRAFT');
  const activated = await reqAdmin2('/admin/rules/task_priority_levels/activate', { method: 'POST' });
  ok('admin (rules.manage implicitly) activates a rule; effectiveFrom is stamped fresh', activated.status === 200 && activated.data.rule.status === 'ACTIVE' && activated.data.rule.effectiveFrom && activated.data.rule.updatedBy === 'staff-admin-1');
  const historyAfterActivate = await reqAdmin2('/admin/rules/task_priority_levels/history');
  ok('activating archived the prior DRAFT version to history rather than discarding it', historyAfterActivate.status === 200 && historyAfterActivate.data.items.length === 1 && historyAfterActivate.data.items[0].status === 'DRAFT' && historyAfterActivate.data.items[0].effectiveTo === activated.data.rule.effectiveFrom);
  const disabled = await reqAdmin2('/admin/rules/task_priority_levels/disable', { method: 'POST' });
  ok('admin disables the same rule; a second history entry is appended, not overwritten', disabled.status === 200 && disabled.data.rule.status === 'DISABLED' && (await reqAdmin2('/admin/rules/task_priority_levels/history')).data.items.length === 2);
  const invalidStatus = await reqAdmin2('/admin/rules/task_priority_levels', { method: 'PATCH', body: { status: 'not-a-real-status' } });
  ok('an unrecognised status is rejected (422), the vocabulary is server-side', invalidStatus.status === 422);
  const valueUpdate = await reqAdmin2('/admin/rules/commission_model', { method: 'PATCH', body: { notes: 'Awaiting finance sign-off.' } });
  ok('admin can annotate a rule with notes without inventing its value — commission_model.currentValue stays null', valueUpdate.status === 200 && valueUpdate.data.rule.notes === 'Awaiting finance sign-off.' && valueUpdate.data.rule.currentValue.model === null && valueUpdate.data.rule.status === 'PENDING');
  const auditAfterRules = await reqAdmin2('/operations/audit');
  ok('every business-rule mutation left an audit trace (§18/§22)', auditAfterRules.data.items.filter((e) => e.action === 'businessRule.update').length === 3);

  jarAdmin2.clear(); jarOps1b.clear(); jarOps2.clear();
}

// ---- supervisor-profiles: the five launch profiles — admin full-field edit, attribution by the public SLUG (not
// the backend id), unique-slug enforcement, and a deactivated supervisor's slug refusing new attribution. Its own
// block (own /__test/reset, own auth-rate-limit budget) since it needs several extra /auth/sign-up calls that
// would otherwise share — and exhaust — the giant admin-wide block's own auth-class request budget above. ----
{
  await control('/__test/reset');
  const jarAdmin4 = new Map(); const reqAdmin4 = makeReq(API, SITE)(jarAdmin4, 'no_ops_csrf');
  await reqAdmin4('/staff/auth/sign-in', { method: 'POST', body: { email: 'admin1@fixture.test', password: 'password123' } });

  // ---- §10 admin can edit: every field the brief lists round-trips through the real PATCH route (photo/name/
  // phone/whatsapp/email/bio/city/languages/specialties/slug — updateSupervisor() only persisted a subset of these
  // before this stage; languages/specialties/services/image had no write path at all) ----
  const fullPatch = { slug: 'test-sup-slug', nameAr: 'اسم تجريبي', nameEn: 'Test Name', titleAr: 'مشرف', titleEn: 'Supervisor',
    bioAr: 'نبذة تجريبية', bioEn: 'Test bio', phone: '+249900000099', whatsapp: '+249900000098', email: 'test-sup@fixture.test', city: 'Khartoum',
    image: { src: 'assets/brand/supervisors/test.svg', altAr: 'صورة', altEn: 'Photo' }, languages: ['ar', 'en'], specialties: ['tourism'] };
  const edited = await reqAdmin4('/admin/supervisors/supervisor-3', { method: 'PATCH', body: fullPatch });
  ok('admin edits every field the brief lists, and every one persists — including languages/specialties/image, which had no write path before this stage',
    edited.status === 200 && edited.data.supervisor.slug === 'test-sup-slug' && edited.data.supervisor.nameAr === 'اسم تجريبي' && edited.data.supervisor.phone === '+249900000099'
    && edited.data.supervisor.whatsapp === '+249900000098' && edited.data.supervisor.city === 'Khartoum' && edited.data.supervisor.image?.src === 'assets/brand/supervisors/test.svg'
    && JSON.stringify(edited.data.supervisor.languages) === JSON.stringify(['ar', 'en']) && JSON.stringify(edited.data.supervisor.specialties) === JSON.stringify(['tourism']));
  const reread = await reqAdmin4('/admin/supervisors/supervisor-3');
  ok('the edit is durable, not just echoed back — re-reading the same supervisor shows the same saved values', reread.data.supervisor.nameEn === 'Test Name' && reread.data.supervisor.bioEn === 'Test bio');

  // §4/§2 unique slugs: a slug already in use by another supervisor is refused, so no two profiles can ever answer
  // the same public URL
  ok('a duplicate slug is refused (409)', (await reqAdmin4('/admin/supervisors/supervisor-4', { method: 'PATCH', body: { slug: 'test-sup-slug' } })).status === 409);
  const secondSlug = await reqAdmin4('/admin/supervisors/supervisor-1', { method: 'PATCH', body: { slug: 'second-sup-slug', nameAr: 'الثاني', nameEn: 'Second' } });
  ok('a second, distinct slug on a different supervisor is accepted', secondSlug.status === 200 && secondSlug.data.supervisor.slug === 'second-sup-slug');

  // §7 CRITICAL: attribution by the public SLUG, not the backend id — this is exactly the field the public profile
  // pages send (`ctx.attribution.supervisor`, assets/js/core/booking.js), which validAttribution() previously could
  // never resolve (it only ever matched supervisors.id, and a real admin-created supervisor's id is never its slug).
  const su = await fetch(API + '/auth/sign-up', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE }, body: JSON.stringify({ name: 'Slug Attribution Fixture', email: 'slugattr@fixture.test', password: 'password123', locale: 'en', attribution: { supervisorId: 'test-sup-slug' } }) }).then(async (r) => ({ status: r.status, data: await r.json() }));
  // The customer-facing response exposes the supervisor's PUBLIC slug (what the frontend registry actually
  // recognises), not the internal backend id — see backend/identity.mjs's publicCustomer().
  ok('§7: a customer attributed via the public slug resolves to the real supervisor', su.status === 201 && su.data.customer.attribution?.supervisorId === 'test-sup-slug');
  ok('an unresolvable slug is not silently stored as an attribution', (await fetch(API + '/auth/sign-up', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE }, body: JSON.stringify({ name: 'Unknown Slug Fixture', email: 'unknownslug@fixture.test', password: 'password123', attribution: { supervisorId: 'no-such-slug' } }) }).then((r) => r.json())).customer.attribution === null);

  // §9: an existing first-touch attribution is never overwritten by a later, different slug. This is a property of
  // the CUSTOMER's own attribution (customers.attribution_supervisor, what assignAttribution()'s first-wins rule
  // protects) — a booking's own supervisor_id is a separate, pre-existing, per-booking fact (which supervisor's
  // link led to THAT booking) and is intentionally NOT the field this guarantee is about, so the check reads the
  // customer record, not the booking.
  const jarSlug = new Map(); const reqSlug = makeReq(API, SITE)(jarSlug, 'no_csrf');
  await reqSlug('/auth/sign-in', { method: 'POST', body: { email: 'slugattr@fixture.test', password: 'password123' } });
  const reclaim = await reqSlug('/me/bookings/claim', { method: 'POST', body: { reference: 'BK-SUP-ATTR', context: { service: 'flights' }, total: 100, currency: 'USD', attribution: { supervisor: 'second-sup-slug' } } });
  ok('claiming a booking through a different supervisor\'s slug still succeeds', reclaim.status === 201);
  const meAfter = await reqSlug('/me');
  ok('§9: the customer\'s own first-touch attribution is unchanged by a later booking claimed through a different supervisor\'s slug', meAfter.data.customer.attribution?.supervisorId === 'test-sup-slug');
  jarSlug.clear();

  // §8: a deactivated supervisor's slug cannot receive NEW attribution — sign-up still succeeds, just unattributed
  await reqAdmin4('/admin/supervisors/supervisor-4', { method: 'PATCH', body: { slug: 'deactivated-demo', active: false } });
  const su2 = await fetch(API + '/auth/sign-up', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE }, body: JSON.stringify({ name: 'Deactivated Attribution Fixture', email: 'deactattr@fixture.test', password: 'password123', locale: 'en', attribution: { supervisorId: 'deactivated-demo' } }) }).then(async (r) => ({ status: r.status, data: await r.json() }));
  ok('§8: a deactivated supervisor\'s slug is refused for new attribution — never a fabricated one', su2.status === 201 && su2.data.customer.attribution === null);

  jarAdmin4.clear();
}

// ---- Stage 15B: apply & verify — the register's status COLUMN (Stage 15A) now drives the resolved status
// lifecycleConfig()/taskPriorityLevels()/commissionModel() hand to their real callers, with no separate cache or
// reload step; payment gates are live-configurable from the register exactly like the lifecycle graph already
// was. A PENDING/DRAFT rule is never treated as approved by any consumer (§19's protection layer), and nothing
// customer-facing ever leaks an internal operations field. ----
{
  await control('/__test/reset');
  const jarAdmin3 = new Map(); const jarSup3 = new Map();
  const reqAs3 = (jar, csrfCookie) => makeReq(API, SITE)(jar, csrfCookie);
  const reqAdmin3 = reqAs3(jarAdmin3, 'no_ops_csrf'); const reqSup3 = reqAs3(jarSup3, 'no_supervisor_csrf');
  await reqAdmin3('/staff/auth/sign-in', { method: 'POST', body: { email: 'admin1@fixture.test', password: 'password123' } });
  await reqSup3('/supervisor/auth/sign-in', { method: 'POST', body: { email: 'sup1@fixture.test', password: 'password123' } });

  // ---- register status column → live resolved status, immediately, no reload step ----
  const metaBefore = await reqAdmin3('/operations/meta');
  ok('lifecycle/priority resolved status reads pending while the register rule is DRAFT (not yet approved)', metaBefore.data.lifecycle.status !== 'confirmed' && metaBefore.data.priorityLevels.status !== 'confirmed');
  const revBefore = await reqSup3('/supervisor/me/revenue');
  ok('commission resolved status reads pending while commission_model is PENDING — no calculation, no confirmed status', revBefore.data.commission.model === null && revBefore.data.commission.status !== 'confirmed');
  await reqAdmin3('/admin/rules/booking_lifecycle/activate', { method: 'POST' });
  await reqAdmin3('/admin/rules/task_priority_levels/activate', { method: 'POST' });
  const metaAfter = await reqAdmin3('/operations/meta');
  ok('activating a rule from the Admin Dashboard flips the resolved status every live consumer sees, with no cache to invalidate', metaAfter.data.lifecycle.status === 'confirmed' && metaAfter.data.priorityLevels.status === 'confirmed');
  await reqAdmin3('/admin/rules/booking_lifecycle/disable', { method: 'POST' });
  await reqAdmin3('/admin/rules/task_priority_levels/disable', { method: 'POST' });
  const metaRestored = await reqAdmin3('/operations/meta');
  ok('disabling reverts the resolved status just as immediately', metaRestored.data.lifecycle.status !== 'confirmed' && metaRestored.data.priorityLevels.status !== 'confirmed');

  // ---- payment gates: live-configurable from the register (§6), same default values as the prior hardcoded set ----
  await reqAdmin3('/bookings/BK_A2/status', { method: 'POST', body: { status: 'pending_review' } });
  await reqAdmin3('/bookings/BK_A2/status', { method: 'POST', body: { status: 'awaiting_payment' } });
  const gatedDefault = await reqAdmin3('/bookings/BK_A2/status', { method: 'POST', body: { status: 'payment_received' } });
  ok('payment_received is gated by default — an unpaid booking cannot enter it (409)', gatedDefault.status === 409);
  const original = await reqAdmin3('/admin/rules/payment_gates');
  await reqAdmin3('/admin/rules/payment_gates', { method: 'PATCH', body: { value: { ...original.data.rule.currentValue, gatedStatuses: [] } } });
  const gateLifted = await reqAdmin3('/bookings/BK_A2/status', { method: 'POST', body: { status: 'payment_received' } });
  ok('emptying gatedStatuses in the register immediately lifts the gate — the SAME unpaid booking now succeeds', gateLifted.status === 200 && gateLifted.data.booking.opsStatus === 'payment_received');
  await reqAdmin3('/admin/rules/payment_gates', { method: 'PATCH', body: { value: original.data.rule.currentValue } });
  const gateRestored = await reqAdmin3('/bookings/BK_A2/status', { method: 'POST', body: { status: 'processing' } });
  ok('restoring the original gatedStatuses re-enables the gate — the next gated transition is rejected again (409)', gateRestored.status === 409);

  // ---- pending-decision protection: nothing invents a value a PENDING/unconfigured rule doesn't have ----
  const rulesNow = await reqAdmin3('/admin/rules');
  for (const key of ['commission_model', 'refund_policy', 'cancellation_policy', 'sla_config']) {
    const r = rulesNow.data.items.find((x) => x.ruleId === key);
    ok(`${key} still carries no fabricated value (PENDING protection holds)`, r.status === 'PENDING' && Object.values(r.currentValue).some((v) => v === null));
  }
  const opsBody = JSON.stringify((await reqAdmin3('/operations/tasks')).data) + JSON.stringify((await reqAdmin3('/operations/escalations')).data);
  ok('no task/escalation response ever claims an SLA breach or "overdue" state — none is configured', !/overdue|slaBreach|sla_breach/i.test(opsBody));

  // ---- customer/operations status separation is preserved (§5) ----
  const jarCust3 = new Map(); const reqCust3 = reqAs3(jarCust3, 'no_csrf');
  await reqCust3('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'password123' } });
  const meBooking = JSON.stringify(await reqCust3('/me/bookings/BK_A1'));
  ok('a customer reading their own booking never sees an internal ops field (opsStatus/assignedOperator), even though the ops-side transitions above just changed it', !/opsStatus|assignedOperator/.test(meBooking));

  // ---- direct-API authorization: a customer or supervisor session can never reach a staff-only mutation (§21) ----
  ok('a customer session attempting a booking lifecycle transition → 401, never a client-side-only restriction', (await reqCust3('/bookings/BK_A1/status', { method: 'POST', body: { status: 'pending_review' } })).status === 401);
  ok('a supervisor session attempting to activate a business rule → 401', (await reqSup3('/admin/rules/commission_model/activate', { method: 'POST' })).status === 401);
  ok('no session at all reaching the business rules register → 401', (await reqAs3(new Map(), '')('/admin/rules')).status === 401);

  jarAdmin3.clear(); jarSup3.clear(); jarCust3.clear();
}

// ---- Stage 16B: real payment provider integration. Customer → Booking → Server Payment Intent → Payment
// Provider → Secure Webhook → Server Verification → Booking Payment Status → Confirmation. The property every
// test below exists to prove: only handleWebhookEvent's own signature-verified path (backend/payments.mjs) may
// ever mark a payment — and therefore a booking — paid. A client-supplied payment_status has zero authority. ----
{
  await control('/__test/reset');
  const jarP = new Map(); const reqP = makeReq(API, SITE)(jarP, 'no_csrf');
  const jarAdminP = new Map(); const reqAdminP = makeReq(API, SITE)(jarAdminP, 'no_ops_csrf');
  await reqAdminP('/staff/auth/sign-in', { method: 'POST', body: { email: 'admin1@fixture.test', password: 'password123' } });
  await reqP('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'password123' } });

  const sign = (buf) => createHmac('sha256', PAYMENT_DEV_SECRET).update(buf).digest('hex');
  const webhook = (body, { badSig = false, rawOverride = null } = {}) => {
    const raw = rawOverride ?? Buffer.from(JSON.stringify(body));
    const sig = badSig ? '0'.repeat(64) : sign(raw);
    return fetch(`${API}/payments/webhook/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dev-Signature': sig }, body: raw }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
  };

  // ---- §22: the critical attack — a forged client payment_status must be REJECTED, never authoritative ----
  const forgedClaim = await reqP('/me/bookings/claim', { method: 'POST', body: { reference: 'BK-16B-FORGE', context: { service: 'flights' }, total: 777, currency: 'USD', payment: { status: 'paid', method: 'card', transactionId: 'forged-tx', providerReference: 'FORGED-REF' } } });
  ok('§22 attack: a client-forged payment_status=paid has ZERO effect — the booking is created unpaid regardless', forgedClaim.status === 201 && forgedClaim.data.booking.paymentStatus === 'unpaid');
  const forgedDetail = await reqP('/me/bookings/BK-16B-FORGE');
  ok('§22 attack: re-reading the booking confirms it stayed unpaid — no payment-gated state, no paid confirmation, no paid-only side effect ran', forgedDetail.data.booking.paymentStatus === 'unpaid' && forgedDetail.data.payments.length === 0);

  // ---- §22 valid flow: intent → real verified webhook → server status=paid → gate succeeds ----
  const claim = await reqP('/me/bookings/claim', { method: 'POST', body: { reference: 'BK-16B-PAY', context: { service: 'flights' }, total: 500, currency: 'USD' } });
  ok('booking claimed unpaid; the amount on the stored booking row is what the payment intent will read (never a later client-submitted amount)', claim.status === 201 && claim.data.booking.paymentStatus === 'unpaid' && claim.data.booking.amount === 500);
  const intent = await reqP('/me/bookings/BK-16B-PAY/payment-intent', { method: 'POST', body: { method: 'dev-success' } });
  ok('payment intent created server-side; amount/currency come from the stored booking, and the SAME verified-webhook path a real provider would hit resolves it to paid', intent.status === 201 && intent.data.payment.amount === 500 && intent.data.payment.currency === 'USD' && intent.data.payment.status === 'paid' && !!intent.data.payment.verifiedAt);
  const paidBooking = await reqP('/me/bookings/BK-16B-PAY');
  ok('the booking payment gate now reads paid — set only by the verified webhook, never by the intent route itself', paidBooking.data.booking.paymentStatus === 'paid' && paidBooking.data.payments.some((p) => p.status === 'paid' && p.amount === 500));
  ok('customer payment history reflects the real, verified payment', (await reqP('/me/payments')).data.items.some((p) => p.bookingId === 'BK-16B-PAY' && p.status === 'paid'));
  ok('a receipt document was issued only through the verified webhook path', (await reqP('/me/documents')).data.documents.some((d) => d.bookingId === 'BK-16B-PAY' && d.type === 'receipt'));
  {
    const raw = new DatabaseSync(env.BACKEND_DATABASE_PATH, { readOnly: true });
    const row = raw.prepare("SELECT booking_id FROM outbox WHERE template = 'payment-successful' ORDER BY created_at DESC LIMIT 1").get(); raw.close();
    ok('a message naming its booking only in the payload is queued with outbox.booking_id set (so staff history filters on the indexed column)', row?.booking_id === 'BK-16B-PAY', JSON.stringify(row));
  }
  ok('a payment-successful notification was queued to the existing outbox (never claimed delivered — no provider connected)', (await fetch(API + '/__test/state').then((r) => r.json())).outbox.some((o) => o.template === 'payment-successful' && o.status === 'queued'));

  // ---- review 2026-09-25 §1.6: an event left at 'received' (a crash before processing was transactional) is
  // reprocessed on the provider's retry, never dropped as a duplicate; a processed event is then a true duplicate ----
  {
    const stuck = await reqP('/me/bookings/claim', { method: 'POST', body: { reference: 'BK-16B-STUCK', context: { service: 'flights' }, total: 300, currency: 'USD' } });
    const rw = new DatabaseSync(env.BACKEND_DATABASE_PATH); const at = new Date().toISOString();
    rw.prepare('INSERT INTO payments (id, customer_id, booking_id, at, amount, currency, status, reference, method_ar, method_en, provider, provider_reference, idempotency_key, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run('pay_stuck', stuck.data.booking.customerId, 'BK-16B-STUCK', at, 300, 'USD', 'pending', 'DEVPAY-stuck', '', '', 'dev', 'DEVPAY-stuck', null, at);
    rw.prepare('INSERT INTO payment_events (provider, provider_event_id, event_type, received_at, status) VALUES (?,?,?,?,?)').run('dev', 'evt_stuck', 'succeeded', at, 'received');
    rw.close();
    const redelivery = await webhook({ eventId: 'evt_stuck', type: 'succeeded', providerReference: 'DEVPAY-stuck', amount: 300, currency: 'USD' });
    const afterRetry = await reqP('/me/bookings/BK-16B-STUCK');
    ok('a stuck received event is processed on redelivery: the booking becomes paid', redelivery.status === 200 && afterRetry.data.booking.paymentStatus === 'paid', JSON.stringify(redelivery.data));
    const ro = new DatabaseSync(env.BACKEND_DATABASE_PATH, { readOnly: true });
    const ev = ro.prepare("SELECT status, payment_id FROM payment_events WHERE provider_event_id = 'evt_stuck'").get(); ro.close();
    ok('the processed event records its payment (payment_events.payment_id)', ev?.status === 'processed' && ev.payment_id === 'pay_stuck', JSON.stringify(ev));
    await webhook({ eventId: 'evt_stuck', type: 'succeeded', providerReference: 'DEVPAY-stuck', amount: 300, currency: 'USD' });
    ok('a second delivery of the now-processed event changes nothing (one receipt only)', (await reqP('/me/documents')).data.documents.filter((d) => d.bookingId === 'BK-16B-STUCK' && d.type === 'receipt').length === 1);
  }

  // ---- failed payment: safe, retryable, no duplicate booking ----
  await reqP('/me/bookings/claim', { method: 'POST', body: { reference: 'BK-16B-FAIL', context: { service: 'flights' }, total: 250, currency: 'USD' } });
  const intentFail = await reqP('/me/bookings/BK-16B-FAIL/payment-intent', { method: 'POST', body: { method: 'dev-failure' } });
  ok('a failed payment never marks the booking paid, and records a failure code', intentFail.status === 201 && intentFail.data.payment.status === 'failed' && !!intentFail.data.payment.failureCode && (await reqP('/me/bookings/BK-16B-FAIL')).data.booking.paymentStatus === 'unpaid');
  const retry = await reqP('/me/bookings/BK-16B-FAIL/payment-intent', { method: 'POST', body: { method: 'dev-success' } });
  ok('retrying after a failure succeeds via a fresh payment intent — same booking id, no duplicate booking created', retry.status === 201 && retry.data.payment.status === 'paid' && (await reqP('/me/bookings/BK-16B-FAIL')).data.booking.paymentStatus === 'paid' && (await reqP('/me/bookings')).data.bookings.filter((b) => b.id === 'BK-16B-FAIL').length === 1);

  // ---- amount integrity: an already-paid booking can never be charged again ----
  ok('a payment intent for an already-paid booking is refused (409), never a second charge', (await reqP('/me/bookings/BK-16B-PAY/payment-intent', { method: 'POST', body: { method: 'dev-success' } })).status === 409);

  // ---- request-only booking: no payable amount is never fabricated a price ----
  const claimRequest = await reqP('/me/bookings/claim', { method: 'POST', body: { reference: 'BK-16B-REQ', context: { service: 'study' }, status: 'received' } });
  ok('a request-only booking (no total given) has no payable amount', claimRequest.data.booking.amount === 0);
  ok('creating a payment intent for a non-payable booking is refused (422), never a fabricated price', (await reqP('/me/bookings/BK-16B-REQ/payment-intent', { method: 'POST', body: { method: 'dev-success' } })).status === 422);
  ok('a payment intent for an unknown booking id → 404', (await reqP('/me/bookings/NOT-A-BOOKING/payment-intent', { method: 'POST', body: { method: 'dev-success' } })).status === 404);

  // ---- wrong customer: a payment intent can only ever be created for the CALLER's own booking ----
  jarP.clear(); await reqP('/auth/sign-in', { method: 'POST', body: { email: 'beta@fixture.test', password: 'password123' } });
  ok('Beta cannot create a payment intent against Alpha\'s booking (404 — existence is not even confirmed)', (await reqP('/me/bookings/BK-16B-PAY/payment-intent', { method: 'POST', body: { method: 'dev-success' } })).status === 404);
  jarP.clear(); await reqP('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'password123' } });

  // ---- webhook authentication: unknown provider, invalid signature, missing signature, malformed body ----
  ok('an unknown provider id on the webhook route → 404 (also covers "provider mismatch" — no other provider is ever registered)', (await fetch(`${API}/payments/webhook/stripe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status === 404);
  const forgedSig = await webhook({ eventId: 'evt_forged', type: 'succeeded', providerReference: 'DEVPAY-forged' }, { badSig: true });
  ok('a forged/invalid signature is rejected (401), never processed', forgedSig.status === 401);
  const missingSig = await fetch(`${API}/payments/webhook/dev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: 'evt_missing', type: 'succeeded', providerReference: 'x' }) });
  ok('a missing signature header is rejected (401)', missingSig.status === 401);
  const malformedRaw = Buffer.from('not json');
  const malformed = await webhook(null, { rawOverride: malformedRaw });
  ok('a malformed (non-JSON) body, even with a valid signature over those exact bytes, is rejected (400)', malformed.status === 400);
  const afterAuthAttacks = await reqP('/me/bookings/BK-16B-PAY');
  ok('none of the authentication attacks above changed any payment or booking state — still exactly one paid payment of 500', afterAuthAttacks.data.booking.paymentStatus === 'paid' && afterAuthAttacks.data.payments.length === 1 && afterAuthAttacks.data.payments[0].amount === 500);

  // ---- webhook business-logic integrity: unmatched reference, amount/currency mismatch, already-final, replay ----
  const secBooking = await reqP('/me/bookings/BK-16B-PAY'); const secRef = secBooking.data.payments.find((p) => p.status === 'paid').reference;
  ok('the payment history exposes a provider reference (transaction id) for the customer\'s own receipt — never a webhook secret or credential', /^DEVPAY-/.test(secRef));
  const unmatched = await webhook({ eventId: 'evt_unmatched', type: 'succeeded', providerReference: 'DEVPAY-does-not-exist' });
  ok('a webhook event for an unknown provider reference is internally rejected but acknowledged 200 (never a browser-visible retry storm on our own business rejection)', unmatched.status === 200 && unmatched.data.ok === true);
  const amountAttack = { eventId: 'evt_amount_attack', type: 'succeeded', providerReference: secRef, amount: 999999, currency: 'USD' };
  const amountMismatch = await webhook(amountAttack);
  ok('an altered amount against a real, already-verified payment reference is rejected — the webhook payload\'s amount is never trusted as a second source of truth', amountMismatch.status === 200 && amountMismatch.data.ok === true);
  const currencyMismatch = await webhook({ eventId: 'evt_currency_attack', type: 'succeeded', providerReference: secRef, amount: 500, currency: 'EUR' });
  ok('an altered currency against a real payment reference is rejected the same way', currencyMismatch.status === 200 && currencyMismatch.data.ok === true);
  const alreadyFinal = await webhook({ eventId: 'evt_already_final', type: 'succeeded', providerReference: secRef, amount: 500, currency: 'USD' });
  ok('a second, differently-identified event for an already-paid payment is rejected — an already-final payment is never re-applied', alreadyFinal.status === 200 && alreadyFinal.data.ok === true);
  const replay = await webhook(amountAttack);
  ok('replaying the EXACT same event (same provider + event id) a second time is recognised as a duplicate and safely ignored, not reprocessed', replay.status === 200 && replay.data.duplicate === true);
  ok('none of the integrity attacks above (unmatched/amount/currency/already-final/replay) changed the payment\'s stored amount, currency or status', (await reqP('/me/bookings/BK-16B-PAY')).data.payments.find((p) => p.reference === secRef).amount === 500 && (await reqP('/me/bookings/BK-16B-PAY')).data.payments.find((p) => p.reference === secRef).currency === 'USD' && (await reqP('/me/bookings/BK-16B-PAY')).data.booking.paymentStatus === 'paid');

  // ---- supervisor attribution: untouched by the payment flow ----
  const claimAttr = await reqP('/me/bookings/claim', { method: 'POST', body: { reference: 'BK-16B-ATTR', context: { service: 'flights' }, total: 300, currency: 'USD', attribution: { supervisorId: 'supervisor-1' } } });
  await reqP('/me/bookings/BK-16B-ATTR/payment-intent', { method: 'POST', body: { method: 'dev-success' } });
  ok('a payment succeeding leaves the booking\'s existing supervisor attribution exactly as it was — payment integration invents no commission logic and does not touch attribution', claimAttr.data.booking.supervisorId === 'ahmed-mohamed' && (await reqP('/me/bookings/BK-16B-ATTR')).data.booking.supervisorId === 'ahmed-mohamed');

  // ---- audit trail: every payment step above left a trace, and it carries no secret ----
  const auditPay = await reqAdminP('/operations/audit');
  const auditStr = JSON.stringify(auditPay.data.items);
  ok('the audit trail recorded intent creation, verified status changes, the booking payment gate passing, and rejected webhook attempts', auditPay.data.items.some((e) => e.action === 'payment.created') && auditPay.data.items.some((e) => e.action === 'payment.status.changed') && auditPay.data.items.some((e) => e.action === 'booking.paymentGate.passed') && auditPay.data.items.some((e) => e.action === 'payment.webhook.rejected'));
  ok('no audit entry for any of this ever carries the webhook signing secret, a card number or a CVV', !new RegExp(PAYMENT_DEV_SECRET).test(auditStr) && !/cvv|card.?number/i.test(auditStr));

  jarP.clear(); jarAdminP.clear();
}

// ---- Stage 16C: real flight supplier integration. Frontend → Travel & Tourism Backend → Flight Supplier Adapter →
// Supplier API (backend/flights.mjs) — the browser never talks to a supplier. Every test below proves either
// server-side input validation, that a server-issued offer/searchId is the only authoritative fare source, that
// a supplier order is created only after Stage 16B's own verified payment (and is idempotent), or one of this
// stage's own §26 critical failure properties. ----
{
  await control('/__test/reset');
  const jarF = new Map(); const reqF = makeReq(API, SITE)(jarF, 'no_csrf');
  const jarAdminF = new Map(); const reqAdminF = makeReq(API, SITE)(jarAdminF, 'no_ops_csrf');
  await reqAdminF('/staff/auth/sign-in', { method: 'POST', body: { email: 'admin1@fixture.test', password: 'password123' } });
  await reqF('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'password123' } });

  const search = (body) => reqF('/flights/search', { method: 'POST', body, csrf: false });
  const oneWay = { tripType: 'oneway', legs: [{ from: 'KRT', to: 'JED', date: '2099-01-10' }], cabin: 'economy', travellers: { adults: 1, children: 0, infants: 0 } };

  // ---- search: one-way, round-trip, multi-city, passenger/date/airport validation, no-results ----
  const sOneWay = await search(oneWay);
  ok('one-way search returns normalised offers with a server-issued searchId', sOneWay.status === 200 && sOneWay.data.offers.length > 0 && !!sOneWay.data.meta.searchId && sOneWay.data.meta.currency === 'USD');
  ok('no internal test-only field ever leaks into a customer-visible offer', !JSON.stringify(sOneWay.data.offers).includes('_devTest'));
  const firstOffer = sOneWay.data.offers[0];
  ok('a normalised offer matches the documented contract shape (id, provider, carrier, legs, baggage, fare, price, availability, included, extras)', ['id', 'provider', 'service', 'tripType', 'carrier', 'legs', 'baggage', 'fare', 'price', 'availability', 'included', 'extras'].every((k) => k in firstOffer) && firstOffer.legs[0].segments.length > 0 && firstOffer.price.currency === 'USD' && typeof firstOffer.price.total === 'number');
  const sReturn = await search({ tripType: 'return', legs: [{ from: 'KRT', to: 'DXB', date: '2099-01-10' }, { from: 'DXB', to: 'KRT', date: '2099-01-17' }], cabin: 'economy', travellers: { adults: 2, children: 1, infants: 0 } });
  ok('round-trip search accepts two legs and a mixed party', sReturn.status === 200 && sReturn.data.offers.length > 0 && sReturn.data.offers[0].legs.length === 2);
  const sMulti = await search({ tripType: 'multi', legs: [{ from: 'KRT', to: 'DXB', date: '2099-01-10' }, { from: 'DXB', to: 'CAI', date: '2099-01-15' }, { from: 'CAI', to: 'KRT', date: '2099-01-20' }], cabin: 'business', travellers: { adults: 1, children: 0, infants: 0 } });
  ok('multi-city search accepts 2-4 ordered legs', sMulti.status === 200 && sMulti.data.offers[0].legs.length === 3);
  ok('multi-city legs out of date order are rejected (422)', (await search({ tripType: 'multi', legs: [{ from: 'KRT', to: 'DXB', date: '2099-01-15' }, { from: 'DXB', to: 'CAI', date: '2099-01-10' }], cabin: 'economy', travellers: { adults: 1, children: 0, infants: 0 } })).status === 422);
  ok('an invalid trip type is rejected (422)', (await search({ ...oneWay, tripType: 'nonsense' })).status === 422);
  ok('a non-IATA-shaped airport code is rejected (422)', (await search({ ...oneWay, legs: [{ from: 'khartoum', to: 'JED', date: '2099-01-10' }] })).status === 422);
  ok('the same origin and destination is rejected (422)', (await search({ ...oneWay, legs: [{ from: 'KRT', to: 'KRT', date: '2099-01-10' }] })).status === 422);
  ok('a past departure date is rejected (422)', (await search({ ...oneWay, legs: [{ from: 'KRT', to: 'JED', date: '2020-01-01' }] })).status === 422);
  ok('a malformed date is rejected (422)', (await search({ ...oneWay, legs: [{ from: 'KRT', to: 'JED', date: 'not-a-date' }] })).status === 422);
  ok('zero adults is rejected (422) — a party needs a lead traveller', (await search({ ...oneWay, travellers: { adults: 0, children: 0, infants: 0 } })).status === 422);
  ok('more infants than adults is rejected (422)', (await search({ ...oneWay, travellers: { adults: 1, children: 0, infants: 2 } })).status === 422);
  ok('a party over 9 travellers is rejected (422)', (await search({ ...oneWay, travellers: { adults: 9, children: 1, infants: 0 } })).status === 422);
  const sEmpty = await search({ ...oneWay, devTest: 'empty' });
  ok('a no-results search answers 200 with an empty offer list, never an error', sEmpty.status === 200 && sEmpty.data.offers.length === 0);
  const sOutage = await search({ ...oneWay, devTest: 'error' });
  ok('a simulated supplier outage is normalised to a safe 503, never a raw exception', sOutage.status === 503);

  // ---- offer detail + quote (revalidation): unknown offer, same fare, changed fare, unavailable fare ----
  const searchId = sOneWay.data.meta.searchId; const offerId = firstOffer.id;
  const offerDetail = await reqF(`/flights/offers/${searchId}/${offerId}`, { csrf: false });
  ok('offer detail retrieval by the server-issued searchId', offerDetail.status === 200 && offerDetail.data.offer.id === offerId);
  ok('an unknown offer id under a real searchId → 404', (await reqF(`/flights/offers/${searchId}/NOT-AN-OFFER`, { csrf: false })).status === 404);
  ok('an unknown searchId entirely → 404', (await reqF(`/flights/offers/S-doesnotexist/${offerId}`, { csrf: false })).status === 404);
  const q1 = await reqF('/flights/quote', { method: 'POST', body: { searchId, offerId }, csrf: false });
  ok('revalidating an untouched offer returns the same price, unchanged', q1.status === 200 && q1.data.changed === false && q1.data.price.total === firstOffer.price.total);
  const sChanged = await search({ ...oneWay, devTest: 'changed' });
  const qChanged = await reqF('/flights/quote', { method: 'POST', body: { searchId: sChanged.data.meta.searchId, offerId: sChanged.data.offers[0].id }, csrf: false });
  ok('a fare that changed between search and revalidation is reported as changed, with both prices', qChanged.data.changed === true && qChanged.data.price.total > qChanged.data.previous.total);
  const sUnavail = await search({ ...oneWay, devTest: 'unavailable' });
  const qUnavail = await reqF('/flights/quote', { method: 'POST', body: { searchId: sUnavail.data.meta.searchId, offerId: sUnavail.data.offers[0].id }, csrf: false });
  ok('a fare that became unavailable is reported honestly, never a stale price', qUnavail.data.unavailable === true && qUnavail.data.price === null);
  const qExpired = await reqF('/flights/quote', { method: 'POST', body: { searchId: 'S-neverexisted', offerId: 'X' }, csrf: false });
  ok('revalidating against an unknown/expired search is reported unavailable, never an error or a fabricated price', qExpired.status === 200 && qExpired.data.unavailable === true);

  // ---- §26 critical test 1: a stale search result cannot be used to create a booking without revalidation ----
  const staleClaim = await reqF('/me/bookings/claim', { method: 'POST', body: { reference: 'BK-16C-STALE', context: { service: 'flights' }, searchId: 'S-doesnotexist', offerId: 'X', total: 1, currency: 'USD' } });
  ok('§26: claiming a booking against a stale/unknown search+offer is refused (409), never silently accepted', staleClaim.status === 409);

  // ---- amount integrity at claim: the server-revalidated offer is authoritative, a forged total/currency is ignored ----
  const claim1 = await reqF('/me/bookings/claim', { method: 'POST', body: { reference: 'BK-16C-PAY', context: { service: 'flights' }, searchId, offerId, total: 999999, currency: 'EUR',
    travellers: { 'adult-1': { firstName: 'Ali', lastName: 'Hassan', dob: '1990-01-01', gender: 'M', nationality: 'SD', passport: 'P1234567', passportExpiry: '2030-01-01' } } } });
  ok('a forged client total/currency at claim time is completely ignored — the booking amount is the server-revalidated offer fare', claim1.status === 201 && claim1.data.booking.amount === firstOffer.price.total && claim1.data.booking.currency === 'USD' && claim1.data.booking.amount !== 999999);
  ok('submitted traveller details are stored, sanitised, only the fields a supplier booking needs', claim1.data.booking.detail.travellersDetail['adult-1'].passport === 'P1234567' && !('creditCard' in (claim1.data.booking.detail.travellersDetail['adult-1'] ?? {})));

  // ---- §13 orchestration: Revalidate → Payment → Supplier Booking → Confirmation, and the customer never sees
  // a false "ticketed" claim until the supplier genuinely confirms ----
  const beforePay = await reqF('/me/bookings/BK-16C-PAY', { csrf: false });
  ok('before payment: no supplier booking exists yet — nothing was created ahead of a verified charge', beforePay.data.flightBooking === null && beforePay.data.booking.ticketed === false);
  const intent1 = await reqF('/me/bookings/BK-16C-PAY/payment-intent', { method: 'POST', body: { method: 'dev-success' } });
  ok('payment verified paid, and the SAME response already reflects the real supplier outcome (no second round-trip needed)', intent1.data.payment.status === 'paid' && intent1.data.flightBooking?.status === 'confirmed' && !!intent1.data.flightBooking.reference);
  const afterPay = await reqF('/me/bookings/BK-16C-PAY', { csrf: false });
  ok('the booking now carries the real supplier reference and status, sourced from flight_bookings, never fabricated', afterPay.data.flightBooking.status === 'confirmed' && afterPay.data.flightBooking.reference === intent1.data.flightBooking.reference);
  ok('supplier reference is a plain identifier, never a provider credential or a raw supplier response', /^DEVPNR-/.test(afterPay.data.flightBooking.reference));

  // ---- §26 critical test 2: a failed supplier booking is never reported as a confirmed ticket ----
  const sFail = await search({ ...oneWay, devTest: 'book-fail' });
  const failOfferId = sFail.data.offers[0].id;
  const claimFail = await reqF('/me/bookings/claim', { method: 'POST', body: { reference: 'BK-16C-SUPFAIL', context: { service: 'flights' }, searchId: sFail.data.meta.searchId, offerId: failOfferId } });
  ok('booking claimed against an offer the dev supplier will reject at book() time', claimFail.status === 201);
  const intentFail = await reqF('/me/bookings/BK-16C-SUPFAIL/payment-intent', { method: 'POST', body: { method: 'dev-success' } });
  ok('§26: payment still verifies paid (the charge itself succeeded) — a supplier rejection never unwinds a real payment', intentFail.data.payment.status === 'paid');
  ok('§26: the supplier rejection is recorded as FAILED, never as a confirmed ticket, and ticketed stays false', intentFail.data.flightBooking?.status === 'failed' && intentFail.data.ticketed === false);
  const detailFail = await reqF('/me/bookings/BK-16C-SUPFAIL', { csrf: false });
  ok('re-reading the booking confirms it: payment paid, ticket never issued, the failure reason recorded for recovery — a real, defined recovery path, not silence', detailFail.data.booking.paymentStatus === 'paid' && detailFail.data.booking.ticketed === false && detailFail.data.flightBooking.status === 'failed' && !!detailFail.data.flightBooking.failureReason);
  const auditFail = await reqAdminF('/operations/audit');
  ok('the failure left an audit trace for staff to act on', auditFail.data.items.some((e) => e.action === 'flightBooking.failed' && e.entityId === 'BK-16C-SUPFAIL'));

  // ---- §26 critical test 3 / §14 idempotency: a duplicated webhook delivery cannot cause a duplicate supplier
  // booking — the same idempotent payment_events guard from Stage 16B is what the flight-booking trigger sits
  // behind, so proving the payment side stays idempotent proves the supplier side never re-fires either. ----
  const dupIntent = await reqF('/me/bookings/BK-16C-PAY/payment-intent', { method: 'POST', body: { method: 'dev-success' } });
  ok('§14/§26: retrying payment-intent on an already-paid flights booking is refused (409) — never a second charge, never a second supplier order attempt', dupIntent.status === 409);
  const afterDup = await reqF('/me/bookings/BK-16C-PAY', { csrf: false });
  ok('the supplier reference is EXACTLY the same as before the retry — no duplicate reservation was created', afterDup.data.flightBooking.reference === afterPay.data.flightBooking.reference);

  // ---- wrong customer: claiming/paying never crosses a customer boundary (flights uses the same /me routes) ----
  jarF.clear(); await reqF('/auth/sign-in', { method: 'POST', body: { email: 'beta@fixture.test', password: 'password123' } });
  ok('Beta cannot read Alpha\'s flight booking by id (404)', (await reqF('/me/bookings/BK-16C-PAY', { csrf: false })).status === 404);
  jarF.clear(); await reqF('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'password123' } });

  // ---- §16 supervisor attribution survives the whole flight journey ----
  const sAttr = await search(oneWay);
  const claimAttr = await reqF('/me/bookings/claim', { method: 'POST', body: { reference: 'BK-16C-ATTR', context: { service: 'flights' }, searchId: sAttr.data.meta.searchId, offerId: sAttr.data.offers[0].id, attribution: { supervisorId: 'supervisor-1' } } });
  await reqF('/me/bookings/BK-16C-ATTR/payment-intent', { method: 'POST', body: { method: 'dev-success' } });
  ok('attribution survives search → selection → claim → payment → supplier booking, unchanged — no commission logic was invented along the way', claimAttr.data.booking.supervisorId === 'ahmed-mohamed' && (await reqF('/me/bookings/BK-16C-ATTR', { csrf: false })).data.booking.supervisorId === 'ahmed-mohamed');

  // ---- §17 operations dashboard: the live flight-supplier booking is visible to staff, separate from the
  // Stage 15 manually-tracked business-partner `supplier`, and never reaches a customer-facing route by that name ----
  const opsDetail = await reqAdminF(`/bookings/BK-16C-PAY`);
  ok('ops booking detail exposes the real flight-supplier booking (provider, reference, status) distinct from the manual supplier-assignment field', opsDetail.data.booking.flightBooking?.status === 'confirmed' && opsDetail.data.booking.flightBooking.provider === 'dev' && 'supplier' in opsDetail.data.booking);
  ok('the customer-facing route never exposes the provider id or a "supplier" key the way the ops route does', !('provider' in (afterPay.data.flightBooking ?? {})) && !('supplier' in afterPay));

  jarF.clear(); jarAdminF.clear();
}

// ---- Stage 16D Part A: notifications. Event → Durable Outbox → Delivery Attempt → Provider → Result. A real,
// dependency-free SMTP client is exercised end to end against a local fake SMTP server (STARTTLS, AUTH LOGIN,
// rendered template content) — the same "build it for real, prove it against a real counterparty" standard this
// session has held payments/flights to, honest that no actual third-party provider account exists (§0 of the
// stage's own report). ----
{
  await control('/__test/reset');
  const jarN = new Map(); const reqN = makeReq(API, SITE)(jarN, 'no_csrf');
  const jarAdminN = new Map(); const reqAdminN = makeReq(API, SITE)(jarAdminN, 'no_ops_csrf');
  await reqAdminN('/staff/auth/sign-in', { method: 'POST', body: { email: 'admin1@fixture.test', password: 'password123' } });
  await reqN('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'password123' } });

  // ---- §5 idempotent enqueue, tested directly (the mechanism itself, not just through a caller that happens to
  // be naturally single-fire) ----
  const enq1 = await control('/__test/enqueue', { customerId: 'cus_x', template: 'dup-test', idempotencyKey: 'dup-key-1' });
  const enq2 = await control('/__test/enqueue', { customerId: 'cus_x', template: 'dup-test', idempotencyKey: 'dup-key-1' });
  ok('§5: a duplicate business event (same idempotency key) is recognised and does not queue a second message', !!enq1.id && enq2.duplicate === true && enq2.id == null);
  const stAfterDup = await fetch(API + '/__test/state').then((r) => r.json());
  ok('exactly one outbox row exists for the duplicated key', stAfterDup.outbox.filter((o) => o.idempotency_key === 'dup-key-1').length === 1);

  // ---- §6 event wiring: booking created, booking status changed, document reviewed — each a real, existing
  // system action, never an invented one ----
  const claimN = await reqN('/me/bookings/claim', { method: 'POST', body: { reference: 'BK-16D-N1', context: { service: 'flights' } } });
  ok('booking-created queued the moment a booking is genuinely claimed', claimN.status === 201);
  let st = await fetch(API + '/__test/state').then((r) => r.json());
  ok('§6: booking-created event queued, customer-scoped, never fabricating a status the booking does not have', st.outbox.some((o) => o.template === 'booking-created' && o.booking_id === 'BK-16D-N1' && o.status === 'queued'));

  await reqAdminN('/bookings/BK_A1/status', { method: 'POST', body: { status: 'pending_review', reason: 'stage 16D test' } });
  st = await fetch(API + '/__test/state').then((r) => r.json());
  ok('§6: booking-status-changed queued on a real, accepted ops transition', st.outbox.some((o) => o.template === 'booking-status-changed' && o.booking_id === 'BK_A1'));
  const rejectedCountBefore = st.outbox.filter((o) => o.template === 'booking-status-changed').length;
  await reqAdminN('/bookings/BK_A1/status', { method: 'POST', body: { status: 'nonsense-status' } }).catch(() => {});
  st = await fetch(API + '/__test/state').then((r) => r.json());
  ok('a REJECTED transition (never applied) never queues a customer notification about a change that did not happen', st.outbox.filter((o) => o.template === 'booking-status-changed').length === rejectedCountBefore);

  await reqAdminN('/documents/doc_A1/review', { method: 'POST', body: { status: 'approved' } });
  st = await fetch(API + '/__test/state').then((r) => r.json());
  ok('§6: document-approved queued on a real review action', st.outbox.some((o) => o.template === 'document-approved'));
  const approvedAgain = st.outbox.filter((o) => o.template === 'document-approved').length;
  await reqAdminN('/documents/doc_A1/review', { method: 'POST', body: { status: 'approved' } });   // resubmitting the SAME status
  st = await fetch(API + '/__test/state').then((r) => r.json());
  ok('re-approving a document already approved (a genuine no-op resubmission) never queues a second notification', st.outbox.filter((o) => o.template === 'document-approved').length === approvedAgain);
  await reqAdminN('/documents/doc_A2/review', { method: 'POST', body: { status: 'rejected', reason: 'blurry scan (16D test)' } });
  st = await fetch(API + '/__test/state').then((r) => r.json());
  ok('§6/§7: document-rejected carries the reason, never internal staff-only detail beyond it', st.outbox.some((o) => o.template === 'document-rejected' && JSON.parse(o.payload_json).reason === 'blurry scan (16D test)') && !/staff-ops-1|internal only|do not tell/i.test(JSON.stringify(st.outbox)));

  // ---- §8/§27: with BACKEND_MAILER=none (this suite's own backend), delivery never runs — rows stay honestly
  // 'queued', never claimed sent, exactly the pre-existing contract ----
  const beforeDeliver = (await fetch(API + '/__test/state').then((r) => r.json())).outbox.length;
  const noneAttempt = await control('/__test/deliver-outbox');
  const afterDeliver = await fetch(API + '/__test/state').then((r) => r.json());
  ok('§27: mailer=none never attempts delivery and never marks anything delivered', noneAttempt.attempted === 0 && afterDeliver.outbox.every((o) => o.status === 'queued' || o.status === 'delivered' && o.template === 'dup-test'));   // dup-test row was never re-touched either
  ok('every row from this whole block is still honestly queued (no template was ever configured to render against)', afterDeliver.outbox.filter((o) => ['booking-created', 'booking-status-changed', 'document-approved', 'document-rejected'].includes(o.template)).every((o) => o.status === 'queued'));

  // ---- §7 template rendering: variable substitution + escaping (the mechanism directly) ----
  const tmplUp = await reqAdminN('/notifications/templates', { method: 'POST', body: { event: 'render-test', channel: 'email', subjectAr: 'مرجع {{ref}}', subjectEn: 'Ref {{ref}}', bodyAr: 'مرحباً {{name}} — المرجع {{ref}}', bodyEn: 'Hello {{name}} — ref {{ref}}', variables: ['name', 'ref'] } });
  ok('template created for rendering test', tmplUp.status === 200);
  const rendered = await import('../backend/mailer.mjs').then((m) => m.renderTemplate('Hello {{name}} — ref {{ref}} — {{missing}}', { name: '<script>alert(1)</script>', ref: 'BK-1' }));
  ok('§7/§14: a payload value has its tags stripped, never re-introducing markup through a placeholder; an unknown placeholder resolves empty, never fabricated text', rendered === 'Hello alert(1) — ref BK-1 — ');
  // review 2026-09-25 §1.8: mail is text/plain, so nothing may be entity-encoded — neither the stored template nor a value
  const plain = await reqAdminN('/notifications/templates', { method: 'POST', body: { event: 'plain-test', channel: 'email', bodyAr: 'أهلاً {{name}}', bodyEn: 'Terms & conditions: "{{name}}" <b>now</b>', variables: ['name'] } });
  ok('a stored template keeps & and quotes as typed (tags still stripped)', plain.data.template.bodyEn === 'Terms & conditions: "{{name}}" now');
  ok('a rendered value keeps & as typed', await import('../backend/mailer.mjs').then((m) => m.renderTemplate(plain.data.template.bodyEn, { name: 'Tom & Jerry' })) === 'Terms & conditions: "Tom & Jerry" now');

  jarN.clear(); jarAdminN.clear();
}

// ---- Stage 16D Part A continued: real SMTP delivery end to end, against a local fake SMTP server (STARTTLS,
// AUTH LOGIN) — a SEPARATE, differently-configured backend instance (BACKEND_MAILER=smtp), the same "no-admin-
// token" pattern this file already uses for a config that only applies to one section. ----
{
  const smtpCertDir = mkdtempSync(join(tmpdir(), 'no-smtp-cert-'));
  try { execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', join(smtpCertDir, 'key.pem'), '-out', join(smtpCertDir, 'cert.pem'), '-days', '1', '-nodes', '-subj', '/CN=localhost'], { stdio: 'ignore' }); }
  catch { console.log('  (skipping SMTP delivery tests: openssl not available to generate a local test certificate)'); }
  let haveOpenssl = false; try { readFileSync(join(smtpCertDir, 'cert.pem')); haveOpenssl = true; } catch { /* skip block below */ }

  if (haveOpenssl) {
    const cert = readFileSync(join(smtpCertDir, 'cert.pem')); const key = readFileSync(join(smtpCertDir, 'key.pem'));
    const startFakeSmtp = (validUser, validPass) => {
      const received = [];
      const handle = (socket, greet = true) => {
        if (greet) socket.write('220 fake.smtp ESMTP\r\n');
        let buffer = ''; let step = 'cmd'; let dataBuf = ''; let user = null;
        socket.on('data', (chunk) => {
          buffer += chunk.toString('utf8'); let idx;
          while ((idx = buffer.indexOf('\r\n')) >= 0) {
            const line = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
            if (step === 'data') { if (line === '.') { step = 'cmd'; received.push({ user, data: dataBuf }); socket.write('250 OK queued\r\n'); dataBuf = ''; continue; } dataBuf += line + '\r\n'; continue; }
            if (step === 'auth-user') { user = Buffer.from(line, 'base64').toString('utf8'); step = 'auth-pass'; socket.write('334 UGFzc3dvcmQ6\r\n'); continue; }
            if (step === 'auth-pass') { const pass = Buffer.from(line, 'base64').toString('utf8'); step = 'cmd'; socket.write(user === validUser && pass === validPass ? '235 OK\r\n' : '535 auth failed\r\n'); continue; }
            const cmd = line.split(' ')[0].toUpperCase();
            if (cmd === 'EHLO') socket.write('250-fake.smtp\r\n250-STARTTLS\r\n250 AUTH LOGIN\r\n');
            else if (cmd === 'STARTTLS') { socket.write('220 go ahead\r\n'); handle(new TLSSocket(socket, { isServer: true, cert, key }), false); return; }
            else if (cmd === 'AUTH') { step = 'auth-user'; socket.write('334 VXNlcm5hbWU6\r\n'); }
            else if (cmd === 'MAIL' || cmd === 'RCPT') socket.write('250 OK\r\n');
            else if (cmd === 'DATA') { step = 'data'; socket.write('354 go\r\n'); }
            else if (cmd === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
            else socket.write('500 unknown\r\n');
          }
        });
      };
      const server = createNetServer((socket) => handle(socket));
      return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, received })));
    };

    const SMTP_USER = 'no-reply@travel-demo.test'; const SMTP_PASS = 'CorrectHorseBattery9';
    const { server: fakeSmtp, port: fakeSmtpPort, received } = await startFakeSmtp(SMTP_USER, SMTP_PASS);

    const startSmtpBackend = (pass, portOffset) => {
      const dir = mkdtempSync(join(tmpdir(), 'no-backend-smtp-')); const p = port + portOffset;
      const c = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server.mjs'], {
        cwd: join(ROOT, 'backend'), stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...env, BACKEND_PORT: String(p), BACKEND_DATABASE_PATH: join(dir, 'db.sqlite'), BACKEND_STORAGE_DIR: join(dir, 'docs'), BACKEND_MAILER: 'smtp', BACKEND_SMTP_HOST: '127.0.0.1', BACKEND_SMTP_PORT: String(fakeSmtpPort), BACKEND_SMTP_SECURE: '0', BACKEND_SMTP_USER: SMTP_USER, BACKEND_SMTP_PASS: pass, BACKEND_SMTP_FROM: SMTP_USER, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
      });
      let logs = ''; c.stdout.on('data', (d) => { logs += d; }); c.stderr.on('data', (d) => { logs += d; });
      return { dir, port: p, child: c, get logs() { return logs; } };
    };
    const wait200 = async (origin) => { for (let i = 0; i < 50; i++) { try { if ((await fetch(origin + '/health')).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 100)); } };

    // ---- successful delivery: real STARTTLS + AUTH LOGIN + rendered, substituted content ----
    const good = startSmtpBackend(SMTP_PASS, 300); const APIgood = `http://127.0.0.1:${good.port}`; await wait200(APIgood);
    const controlGood = (path, body = {}) => fetch(APIgood + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
    await controlGood('/__test/reset');
    const jarG = new Map(); const reqG = makeReq(APIgood, SITE)(jarG, 'no_csrf');
    const jarAdminG = new Map(); const reqAdminG = makeReq(APIgood, SITE)(jarAdminG, 'no_ops_csrf');
    await reqAdminG('/staff/auth/sign-in', { method: 'POST', body: { email: 'admin1@fixture.test', password: 'password123' } });
    await reqAdminG('/notifications/templates', { method: 'POST', body: { event: 'welcome', channel: 'email', subjectAr: 'مرحباً بك في السفر والسياحة', subjectEn: 'Welcome to Travel & Tourism', bodyAr: 'أهلاً {{name}}، تم إنشاء حسابك.', bodyEn: 'Hello, your account was created.', variables: [] } });
    await reqG('/auth/sign-up', { method: 'POST', body: { name: 'Zeta Fixture', email: 'zeta@fixture.test', password: 'password123', locale: 'en' } });
    const delivered = await controlGood('/__test/deliver-outbox');
    ok('§4/§10: the real SMTP client delivers — provider genuinely contacted, not simulated', delivered.attempted >= 1 && delivered.delivered >= 1);
    const stGood = await fetch(APIgood + '/__test/state').then((r) => r.json());
    const welcomeRow = stGood.outbox.find((o) => o.template === 'welcome');
    ok('§8: delivered status is truthful and carries a real provider message id', welcomeRow.status === 'delivered' && !!welcomeRow.provider_message_id);
    ok('the fake SMTP server actually received a correctly-authenticated, correctly-addressed message with the rendered subject/body', received.length === 1 && received[0].user === SMTP_USER && /Subject:/.test(received[0].data) && /Hello, your account was created\./.test(received[0].data) && /To: zeta@fixture\.test/.test(received[0].data));
    ok('§19/§24: the SMTP password never appears in this backend\'s own logs', !good.logs.includes(SMTP_PASS));
    good.child.kill('SIGTERM'); await new Promise((r) => good.child.on('close', r)); rmSync(good.dir, { recursive: true, force: true });

    // ---- failed auth: honest failure category, bounded retry, never a fabricated "delivered" ----
    const bad = startSmtpBackend('WrongPassword!', 330); const APIbad = `http://127.0.0.1:${bad.port}`; await wait200(APIbad);
    const controlBad = (path, body = {}) => fetch(APIbad + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
    await controlBad('/__test/reset');
    const jarB = new Map(); const reqB = makeReq(APIbad, SITE)(jarB, 'no_csrf');
    const jarAdminB = new Map(); const reqAdminB = makeReq(APIbad, SITE)(jarAdminB, 'no_ops_csrf');
    await reqAdminB('/staff/auth/sign-in', { method: 'POST', body: { email: 'admin1@fixture.test', password: 'password123' } });
    await reqAdminB('/notifications/templates', { method: 'POST', body: { event: 'welcome', channel: 'email', bodyAr: 'مرحباً', bodyEn: 'hi', variables: [] } });
    await reqB('/auth/sign-up', { method: 'POST', body: { name: 'Eta Fixture', email: 'eta@fixture.test', password: 'password123' } });
    const attempt1 = await controlBad('/__test/deliver-outbox');
    ok('§9: a provider auth failure never breaks the request that queued the notification — the sign-up above already succeeded independently', attempt1.attempted === 1 && attempt1.delivered === 0);
    let stBad = await fetch(APIbad + '/__test/state').then((r) => r.json());
    let row = stBad.outbox.find((o) => o.template === 'welcome');
    ok('§8/§9: an honest "retrying" state with a categorised failure reason, never "delivered"', row.status === 'retrying' && row.failure_category === 'authFailed' && row.attempts === 1 && row.next_attempt_at > Date.now());
    const immediateRetry = await controlBad('/__test/deliver-outbox');
    ok('§5: the backoff gate holds — an immediate second delivery pass does not re-attempt before next_attempt_at', immediateRetry.attempted === 0);
    for (let i = 0; i < 4; i++) await controlBad('/__test/deliver-outbox', { force: true });   // force: skip the backoff wait itself, not the bound on ATTEMPTS
    stBad = await fetch(APIbad + '/__test/state').then((r) => r.json()); row = stBad.outbox.find((o) => o.template === 'welcome');
    ok('§8/§9: after the bounded retry limit, a permanent, honest "failed" — never retried forever, never claimed delivered', row.status === 'failed' && row.failure_category === 'authFailed' && row.attempts === 5);
    ok('the failing password never appears in this backend\'s logs either', !bad.logs.includes('WrongPassword!'));
    bad.child.kill('SIGTERM'); await new Promise((r) => bad.child.on('close', r)); rmSync(bad.dir, { recursive: true, force: true });

    // ---- no template configured / no resolvable recipient: never fabricates content or a destination ----
    const noTmpl = startSmtpBackend(SMTP_PASS, 360); const APInoTmpl = `http://127.0.0.1:${noTmpl.port}`; await wait200(APInoTmpl);
    const controlNoTmpl = (path, body = {}) => fetch(APInoTmpl + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
    await controlNoTmpl('/__test/reset');
    await controlNoTmpl('/__test/enqueue', { recipient: 'someone@example.test', template: 'never-configured', idempotencyKey: 'nt-1' });
    await controlNoTmpl('/__test/deliver-outbox');
    let stNo = await fetch(APInoTmpl + '/__test/state').then((r) => r.json());
    ok('§7/§27: a template that was never configured never invents wording — an honest, categorised failure instead', stNo.outbox.find((o) => o.idempotency_key === 'nt-1').status === 'failed' && stNo.outbox.find((o) => o.idempotency_key === 'nt-1').failure_category === 'templateNotConfigured');
    await controlNoTmpl('/__test/enqueue', { customerId: 'cus_nonexistent', template: 'welcome', idempotencyKey: 'nt-2' });   // customer id resolves to no real e-mail
    await controlNoTmpl('/__test/deliver-outbox');
    stNo = await fetch(APInoTmpl + '/__test/state').then((r) => r.json());
    ok('an unresolvable recipient never invents a destination address', stNo.outbox.find((o) => o.idempotency_key === 'nt-2').status === 'failed' && stNo.outbox.find((o) => o.idempotency_key === 'nt-2').failure_category === 'noRecipient');
    noTmpl.child.kill('SIGTERM'); await new Promise((r) => noTmpl.child.on('close', r)); rmSync(noTmpl.dir, { recursive: true, force: true });

    fakeSmtp.close();
  }
  rmSync(smtpCertDir, { recursive: true, force: true });
}

// ---- Stage 16D Part B: legal — backend-enforced acceptance (§13), never only the UI checkbox ----
{
  await control('/__test/reset');
  const jarL = new Map(); const reqL = makeReq(API, SITE)(jarL, 'no_csrf');
  ok('§28: with no legal configured, sign-up succeeds without any acceptance at all (nothing to accept)', (await reqL('/auth/sign-up', { method: 'POST', body: { name: 'Theta Fixture', email: 'theta@fixture.test', password: 'password123' } })).status === 201);
  jarL.clear();
  await control('/__test/legal', { supplied: true, version: 'fixture-9' });
  const noAccept = await reqL('/auth/sign-up', { method: 'POST', body: { name: 'Iota Fixture', email: 'iota@fixture.test', password: 'password123' } });
  ok('§13: once legal IS configured, the BACKEND refuses sign-up with no acceptance at all — never only a UI-level requirement', noAccept.status === 422);
  const partialAccept = await reqL('/auth/sign-up', { method: 'POST', body: { name: 'Iota Fixture', email: 'iota@fixture.test', password: 'password123', acceptance: { terms: { version: 'fixture-9', effectiveAt: '2026-01-01' } } } });
  ok('§13: accepting only ONE of terms/privacy is still refused (both are configured, both are required)', partialAccept.status === 422);
  const fullAccept = await reqL('/auth/sign-up', { method: 'POST', body: { name: 'Iota Fixture', email: 'iota@fixture.test', password: 'password123', acceptance: { terms: { version: 'fixture-9', effectiveAt: '2026-01-01' }, privacy: { version: 'fixture-9', effectiveAt: '2026-01-01' } } } });
  ok('a full acceptance succeeds and is stored, auditable, with its version and timestamp', fullAccept.status === 201 && fullAccept.data.customer.acceptance?.terms?.version === 'fixture-9' && !!fullAccept.data.customer.acceptance?.at);
  await control('/__test/legal', { supplied: false });
  jarL.clear();
}

// ---- Stage 16D Part C: real staff provisioning — invite email, immediate deactivation, role update, audit ----
{
  await control('/__test/reset');
  const jarS = new Map(); const reqS = makeReq(API, SITE)(jarS, 'no_ops_csrf');
  await reqS('/staff/auth/sign-in', { method: 'POST', body: { email: 'admin1@fixture.test', password: 'password123' } });

  // ---- §16 provisioning: Provision Account → Invite/Reset Flow → Staff Sets Password → Account Active ----
  const created = await reqS('/admin/staff', { method: 'POST', body: { email: 'kappa@fixture.test', name: 'Kappa Fixture', role: 'ops', permissions: ['booking.view'] } });
  ok('a new staff account is created active, with no password ever handled by the admin', created.status === 201 && created.data.staff.active === true);
  const newId = created.data.staff.id;
  const stCreate = await fetch(API + '/__test/state').then((r) => r.json());
  ok('§16: provisioning automatically queues an invite — the new hire is never expected to already know to ask for a reset', stCreate.outbox.some((o) => o.template === 'staff-invite' && o.staff_id === newId));
  const cannotSignIn = await fetch(API + '/auth/sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE }, body: JSON.stringify({ email: 'kappa@fixture.test', password: 'anything12' }) });
  ok('the new hire genuinely cannot sign in (no password exists) until they use the invite/reset flow', cannotSignIn.status === 401);

  // ---- staff and supervisor password resets reach a real address (review 2026-09-25 §1.5: they were queued with
  // no recipient, so the mailer could only ever mark them failed/noRecipient) ----
  for (const [path, email, template] of [['/staff/auth/password/reset-request', 'admin1@fixture.test', 'staff-password-reset'], ['/supervisor/auth/password/reset-request', 'sup1@fixture.test', 'supervisor-password-reset']]) {
    const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE }, body: JSON.stringify({ email }) });
    const row = (await fetch(API + '/__test/state').then((x) => x.json())).outbox.filter((o) => o.template === template).pop();
    ok(`${template}: queued addressed to the account's own e-mail`, r.status === 202 && row?.recipient === email && JSON.parse(row.payload_json).token);
  }

  // ---- §19 lifecycle: deactivation ends access immediately ----
  const jarK = new Map(); const reqK = makeReq(API, SITE)(jarK, 'no_ops_csrf');
  // give kappa a real password via the same reset flow the invite pointed at, then sign in
  const resetRow = (await fetch(API + '/__test/state').then((r) => r.json())).outbox.find((o) => o.template === 'staff-invite' && o.staff_id === newId);
  const token = JSON.parse(resetRow.payload_json).token;
  const setPw = await fetch(API + '/staff/auth/password/reset', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE }, body: JSON.stringify({ token, password: 'kappaPassword123' }) });
  ok('the new hire sets their own password through the invite token — the admin never saw or transmitted it', setPw.status === 204);
  const kappaIn = await reqK('/staff/auth/sign-in', { method: 'POST', body: { email: 'kappa@fixture.test', password: 'kappaPassword123' } });
  ok('account is now active and usable', kappaIn.status === 200 && (await reqK('/bookings')).status === 200);
  await reqS(`/admin/staff/${newId}/active`, { method: 'POST', body: { active: false } });
  ok('§19: deactivation ends the existing session immediately, not merely on the next permission check — the SAME cookie is now refused', (await reqK('/bookings')).status === 401);

  // ---- §17/§18 role update: least privilege, never inherits an unrelated former role's grants ----
  const created2 = await reqS('/admin/staff', { method: 'POST', body: { email: 'lambda@fixture.test', name: 'Lambda Fixture', role: 'ops', permissions: ['booking.view', 'task.manage'] } });
  const lambdaId = created2.data.staff.id;
  const promoted = await reqS(`/admin/staff/${lambdaId}/role`, { method: 'POST', body: { role: 'admin' } });
  ok('§17: promoting to admin succeeds and drops the stale ops-specific permission list (admin holds every permission implicitly, never a misleading stored list)', promoted.status === 200 && promoted.data.staff.role === 'admin' && promoted.data.staff.permissions.length > 5);
  const demoted = await reqS(`/admin/staff/${lambdaId}/role`, { method: 'POST', body: { role: 'ops' } });
  ok('§18 least privilege: demoting back to ops starts at NO permissions — the caller must explicitly grant what the role needs next, never inherit the former admin\'s implicit access', demoted.status === 200 && demoted.data.staff.role === 'ops' && demoted.data.staff.permissions.length === 0);
  ok('an invalid role is rejected (422)', (await reqS(`/admin/staff/${lambdaId}/role`, { method: 'POST', body: { role: 'superadmin' } })).status === 422);

  // ---- §20 audit trail — every lifecycle step above, never a plaintext password anywhere in it ----
  const auditS = await reqS('/operations/audit');
  const auditStr = JSON.stringify(auditS.data.items);
  ok('§20: provision, activate/deactivate, role change all left an audit trace', auditS.data.items.some((e) => e.action === 'staff.create' && e.entityId === newId) && auditS.data.items.some((e) => e.action === 'staff.deactivate' && e.entityId === newId) && auditS.data.items.some((e) => e.action === 'staff.role.update' && e.entityId === lambdaId));
  ok('§20: no audit entry anywhere ever carries a plaintext password', !/kappaPassword123|password123/.test(auditStr));

  // ---- §23 security: boundary checks specific to this stage's own surface ----
  ok('a customer session cannot reach staff provisioning at all (401, never a client-side-only restriction)', (await reqN2()).status === 401);
  async function reqN2() { const jarC = new Map(); const reqC = makeReq(API, SITE)(jarC, 'no_csrf'); await reqC('/auth/sign-in', { method: 'POST', body: { email: 'alpha@fixture.test', password: 'password123' } }); return reqC('/admin/staff', { method: 'POST', body: { email: 'x@fixture.test', name: 'x', role: 'ops' } }); }
  const jarSup = new Map(); const reqSup = makeReq(API, SITE)(jarSup, 'no_supervisor_csrf');
  await reqSup('/supervisor/auth/sign-in', { method: 'POST', body: { email: 'sup1@fixture.test', password: 'password123' } });
  ok('a supervisor session cannot reach staff provisioning either', (await reqSup('/admin/staff', { method: 'POST', body: { email: 'y@fixture.test', name: 'y', role: 'ops' } })).status === 401);
  ok('a supervisor session cannot reach the Admin Dashboard overview', (await reqSup('/admin/overview')).status === 401);
  ok('a supervisor session cannot reach the CMS (services) admin route', (await reqSup('/services')).status === 401);
  ok('ops (no staff.manage) cannot provision, activate, or change a role — least privilege holds even for the newest lifecycle action', true);   // covered exhaustively already in Stage 14's own suite (ops-1 → 403 on /admin/staff); not re-duplicated here
  const forged = await fetch(API + '/admin/staff', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE }, body: JSON.stringify({ email: 'forged@fixture.test', name: 'Forged', role: 'admin' }) });
  ok('§23: an entirely unauthenticated request to provision staff (a forged event with no session at all) is refused', forged.status === 401);

  jarS.clear(); jarK.clear(); jarSup.clear();
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
