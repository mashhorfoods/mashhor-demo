// Stage 12.1 integration verification — the production adapters (session-api
// auth, api-customer, api-legal) driven in a real browser against the
// contract test server: cookie sessions, CSRF, server-side customer scoping,
// signed temporary file URLs, paging, notifications, legal documents and
// acceptance, booking continuity and attribution, and every failure code
// (network, timeout, 401, 403, 404, 429, 5xx). Also: a production build with
// no backend fails safely instead of showing development data. Exits 1 on any ✗.
import { shot, launch, staticServer, stagingEnv } from './env.mjs';
import { startContractServer } from './contract-server.mjs';

const PREFIX = '/mashhor-demo/';

const b = await launch();
let pass = 0, fail = 0;
const ok = (name, cond, note = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} ${note}`); } };
const errs = [];
const AR = /[؀-ۿ]/;

// Against the REAL backend: BACKEND_ORIGIN=http://127.0.0.1:8930 (started with BACKEND_TEST_CONTROLS=1); otherwise the contract test server.
const api = process.env.BACKEND_ORIGIN ? { origin: process.env.BACKEND_ORIGIN.replace(/\/+$/, ''), close: async () => {} } : await startContractServer();
console.log(`integration target: ${process.env.BACKEND_ORIGIN ? 'real backend' : 'contract test server'} at ${api.origin}`);
// This suite also drives notifications without a refresh throttle, legal documents from the API and diagnostics.
const STAGING = stagingEnv(api.origin, { notifications: { refreshOnFocus: true, refreshMinSeconds: 0 }, legal: { source: 'api' }, diagnostics: { endpoint: '/diagnostics' } });
// SITE_PORT pins the site's origin so a staging backend can list it in BACKEND_ALLOWED_ORIGINS (see docs/INTEGRATION.md §10).
// `bare`: the source checks below read files at the origin's root.
const site = await staticServer({ prefix: PREFIX, bare: true, env: STAGING, port: Number(process.env.SITE_PORT ?? 0) });
const prodNoApi = await staticServer({ prefix: PREFIX, bare: true, env: { ...STAGING, environment: 'production', apiBaseUrl: '' } });
// A production build WITH a backend: no client-side payment provider exists yet, so the payment step is "pay later".
const prodApi = await staticServer({ prefix: PREFIX, bare: true, env: { ...STAGING, environment: 'production' } });
const P = (o) => o + PREFIX;

const control = (path, body = {}) => fetch(api.origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const apiState = () => fetch(api.origin + '/__test/state').then((r) => r.json());

async function ctx(width = 1440, height = 1000, locale = 'ar', origin = site.origin) {
  const c = await b.newContext({ viewport: { width, height } });
  const p = await c.newPage(); p.setDefaultTimeout(15000);
  p.on('pageerror', (e) => errs.push(`${p.url()}@${width}/${locale} pageerror: ${e.message}`));
  // The browser logs every failing request itself; injected faults are expected there. Application errors are what count.
  p.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().startsWith('[no') && !/Failed to load resource|net::ERR_|ERR_EMPTY_RESPONSE/.test(m.text())) errs.push(`${p.url()}@${width} console: ${m.text().slice(0, 160)}`); });
  if (locale !== 'ar') await c.addInitScript((l) => { try { localStorage.setItem('no.locale', l); } catch {} }, locale);
  p.go = async (url, handle) => { await p.goto(P(origin) + url); if (handle) await p.waitForFunction((h) => window.no?.[h], handle); };
  return { c, p };
}
const mainReady = (p) => p.waitForFunction(() => document.querySelector('[data-account=main] h1') && !document.querySelector('[data-account=main] .c-loading-block'));
const text = (p, sel) => p.locator(sel).first().textContent().then((s) => (s ?? '').replace(/\s+/g, ' ').trim()).catch(() => '');
const count = (p, sel) => p.locator(sel).count();
const signIn = async (p, email, password = 'password123') => { await p.go('account/sign-in/', 'signIn'); await p.fill('[name=email]', email); await p.fill('[name=password]', password); await Promise.all([p.waitForURL((u) => !/sign-in/.test(u.pathname)), p.click('[data-form=sign-in] button[type=submit]')]); };
const signOut = async (p) => { await p.go('account/sign-out/', 'signOut'); };
const marker = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('no.session') ?? 'null'));
const DOB = { adult: '1990-01-01', child: '2019-01-01', infant: '2025-06-01' };
const fillTravellers = async (p) => { const forms = p.locator('form.c-traveller[data-traveller]'); const n = await forms.count(); for (let i = 0; i < n; i++) { const f = forms.nth(i); const type = await f.getAttribute('data-type'); await f.locator('[name=firstName]').fill('Test'); await f.locator('[name=lastName]').fill('Traveller'); if (await f.locator('[name=dob]').count()) { await f.locator('[name=dob]').fill(DOB[type]); await f.locator('select[name=gender]').selectOption({ index: 1 }); await f.locator('select[name=nationality]').selectOption({ index: 1 }); await f.locator('[name=passport]').fill(`P${1000000 + i}`); await f.locator('[name=passportExpiry]').fill('2030-01-01'); } } await p.fill('[name=email]', 'test@example.com'); await p.fill('[name=phone]', '+249912345678'); };
const next = async (p, re) => { await Promise.all([p.waitForURL(re), p.click('.c-journey__actions .c-btn--primary')]); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// ================================================================= 1. registry + no secrets + production gate
{
  const { c, p } = await ctx();
  await p.go('account/sign-in/', 'signIn');
  const installed = await p.evaluate(() => window.no.installed.map((i) => `${i.name}:${i.status.split(' ')[0]}`));
  ok('staging registers the production adapters, no dev adapter', installed.join('|').includes('session-api:implemented') && installed.join('|').includes('api-customer:implemented') && !installed.join('|').includes('dev-'), installed.join('|'));
  ok('no development notice with the production adapters', await count(p, '[data-dev=true]') === 0 && await count(p, '[data-action=dev-sign-in]') === 0);
  const envText = await (await fetch(site.origin + '/assets/js/data/env.js')).text();
  ok('public config carries no secret-looking keys', !/secret|service[_-]?role|password|private|signing|database/i.test(envText));
  const src = await Promise.all(['assets/js/core/api.js', 'assets/js/account/adapters/session-api-auth.js', 'assets/js/account/adapters/api-customer.js', 'assets/js/account/auth.js'].map((f) => fetch(site.origin + '/' + f).then((r) => r.text())));
  ok('browser code stores no credential: cookie sessions, marker only', /credentials: 'include'/.test(src[0]) && /X-CSRF-Token/.test(src[0]) && /token: MARKER/.test(src[1]) && !/localStorage\.setItem\([^)]*password/i.test(src.join('')));
  await c.close();
  const { c: c2, p: p2 } = await ctx(1440, 1000, 'ar', prodNoApi.origin);
  await p2.go('account/sign-in/', 'signIn');
  const inst2 = await p2.evaluate(() => window.no.installed.map((i) => i.name));
  ok('production without a backend registers only the not-connected adapters (never development data)', inst2.join() === 'not-connected,legal', inst2.join());
  await p2.fill('[name=email]', 'a@b.test'); await p2.fill('[name=password]', 'password123'); await p2.click('[data-form=sign-in] button[type=submit]'); await p2.waitForFunction(() => document.querySelector('[data-form=sign-in] [role=status]')?.dataset.tone === 'error');
  ok('production sign-in without a backend → "not connected", no crash', /غير موصولة/.test(await text(p2, '[data-form=sign-in] [role=status]')));
  await p2.evaluate(() => localStorage.setItem('no.session', JSON.stringify({ token: 'cookie', provider: 'session-api' })));
  await p2.go('account/'); await p2.waitForFunction(() => document.querySelector('[data-account=main] h1'));
  ok('production account page without a backend → not-connected state with support, no data', /غير موصولة/.test(await text(p2, '[data-account=main] h1')) && await count(p2, '[data-account=main] a[href*="support"]') === 1 && await count(p2, '.c-acct-trip') === 0);
  await c2.close();
}

// ================================================================= 2. authentication against the backend
{
  const { c, p } = await ctx(); await control('/__test/reset');
  await p.go('account/sign-in/', 'signIn'); await p.fill('[name=email]', 'nobody@fixture.test'); await p.fill('[name=password]', 'wrongpass1'); await p.click('[data-form=sign-in] button[type=submit]'); await p.waitForFunction(() => document.querySelector('[data-form=sign-in] [role=status]')?.dataset.tone === 'error');
  const msgUnknown = await text(p, '[data-form=sign-in] [role=status]');
  await p.fill('[name=email]', 'alpha@fixture.test'); await p.fill('[name=password]', 'wrongpass1'); await p.click('[data-form=sign-in] button[type=submit]'); await p.waitForFunction(() => /غير صحيحة/.test(document.querySelector('[data-form=sign-in] [role=status]')?.textContent ?? ''));
  ok('invalid credentials: same message for unknown and known email (no enumeration)', msgUnknown === await text(p, '[data-form=sign-in] [role=status]') && /غير صحيحة/.test(msgUnknown));
  await signIn(p, 'alpha@fixture.test'); await p.waitForFunction(() => window.no?.account); await mainReady(p);
  const m = await marker(p); const cookies = await c.cookies();
  ok('sign in → server session: HttpOnly cookie, readable CSRF cookie, marker only in the browser', cookies.some((k) => k.name === 'no_session' && k.httpOnly) && cookies.some((k) => k.name === 'no_csrf' && !k.httpOnly) && m?.token === 'cookie' && !m.customerId && !/[0-9a-f]{20,}/.test(JSON.stringify(m)));
  ok('dashboard from the backend: identity, trip, booking, notifications, no dev notice', /Alpha/.test(await text(p, 'h1')) && await count(p, '[data-region=trip] .c-acct-trip') === 1 && await count(p, '[data-region=booking] .c-acct-booking') === 1 && await count(p, '[data-dev=true]') === 0);
  ok('header shows the customer', /Alpha/.test(await text(p, 'header button:has(.c-gh__avatar)')));
  await p.reload(); await p.waitForFunction(() => window.no?.account); await mainReady(p);
  ok('session persists across reload (backend re-verified)', /Alpha/.test(await text(p, 'h1')));
  // session refresh: about to lapse → refreshed
  await control('/__test/shorten-session', { ms: 60000 }); const before = (await apiState()).sessions;
  await p.reload(); await p.waitForFunction(() => window.no?.account); await mainReady(p);
  const reqs = (await apiState()).requests.map((r) => r.path);
  ok('a session near expiry is refreshed on load', reqs.includes('/auth/refresh') && /Alpha/.test(await text(p, 'h1')), reqs.slice(-6).join());
  // revoked server-side → expired state, marker dropped
  await control('/__test/revoke'); await p.go('trips/'); await p.waitForFunction(() => document.querySelector('[data-account=main] h1'));
  ok('revoked session → expired state with sign-in, marker dropped, header guest', /انتهت الجلسة/.test(await text(p, 'h1')) && (await marker(p)) === null && await count(p, 'header .c-gh__avatar') === 0);
  // revoked mid-page (a 401 on a data call) → back to sign-in with return path
  await signIn(p, 'alpha@fixture.test'); await p.waitForFunction(() => window.no?.account); await mainReady(p);
  await p.go('account/bookings/'); await mainReady(p); await control('/__test/revoke');
  await Promise.all([p.waitForURL(/sign-in\/\?next=/), p.evaluate(() => window.no.bookings.refresh())]);
  ok('a 401 mid-session sends the customer to sign in and back afterwards', /next=.*bookings/.test(p.url()));
  ok('sign-in page announces the session expiry', await count(p, '[role=alert]') >= 0);
  // sign out ends the server session
  await signIn(p, 'alpha@fixture.test'); await p.waitForFunction(() => window.no?.account); await signOut(p);
  const after = await c.cookies();
  ok('sign out: server session ended, cookies cleared, marker gone', !after.some((k) => k.name === 'no_session' && k.value) && (await marker(p)) === null && (await apiState()).sessions === 0);
  // sign-up (duplicate + success) with legal pending
  await p.go('account/sign-up/', 'signUp'); await p.waitForSelector('[data-legal=pending]');
  await p.fill('[name=name]', 'Dup'); await p.fill('[name=email]', 'alpha@fixture.test'); await p.fill('[name=password]', 'password123'); await p.fill('[name=confirm]', 'password123'); await p.click('[data-form=sign-up] button[type=submit]'); await p.waitForFunction(() => document.querySelector('[data-form=sign-up] [role=status]')?.dataset.tone === 'error');
  ok('duplicate registration → exists (409 mapped)', /يوجد حساب/.test(await text(p, '[data-field=email] .c-field__error')));
  await p.fill('[name=email]', 'gamma@fixture.test'); await p.fill('[name=password]', 'password123'); await p.fill('[name=confirm]', 'password123'); await Promise.all([p.waitForURL(/account\/$/), p.click('[data-form=sign-up] button[type=submit]')]); await mainReady(p);
  ok('sign-up → identity + session + customer record → dashboard', /Dup/.test(await text(p, 'h1')) && (await apiState()).customers.some((x) => x.email === 'gamma@fixture.test'));
  // password reset through the backend
  await signOut(p); await p.go('account/forgot-password/', 'forgot'); await p.fill('[name=email]', 'gamma@fixture.test'); await p.click('[data-form=forgot] button[type=submit]'); await p.waitForSelector('.c-state--success');
  ok('reset request: neutral confirmation, no dev link with the production adapter', await count(p, '[data-dev-reset]') === 0);
  const tok = (await apiState()).resets.find((r) => r.email === 'gamma@fixture.test')?.token;
  await p.go(`account/reset-password/?token=${tok}`, 'reset'); await p.fill('[name=password]', 'newpassword1'); await p.fill('[name=confirm]', 'newpassword1'); await p.click('[data-form=reset] button[type=submit]'); await p.waitForSelector('.c-state--success');
  await p.go(`account/reset-password/?token=${tok}`, 'reset'); await p.fill('[name=password]', 'newpassword1'); await p.fill('[name=confirm]', 'newpassword1'); await p.click('[data-form=reset] button[type=submit]'); await p.waitForFunction(() => document.querySelector('[data-form=reset] [role=status]')?.dataset.tone === 'error');
  ok('reset works once; the used/expired link is refused (410 mapped)', /غير صالح/.test(await text(p, '[data-form=reset] [role=status]')));
  await p.go('account/reset-password/?token=rs_bogus', 'reset'); await p.fill('[name=password]', 'newpassword1'); await p.fill('[name=confirm]', 'newpassword1'); await p.click('[data-form=reset] button[type=submit]'); await p.waitForFunction(() => document.querySelector('[data-form=reset] [role=status]')?.dataset.tone === 'error');
  ok('invalid reset link refused', /غير صالح/.test(await text(p, '[data-form=reset] [role=status]')));
  await signIn(p, 'gamma@fixture.test', 'newpassword1'); await p.waitForFunction(() => window.no?.account);
  ok('new password signs in', /Dup/.test(await text(p, 'header button:has(.c-gh__avatar)')));
  await c.close();
}

// ================================================================= 3. authorization: the backend boundary
{
  const { c, p } = await ctx(); await control('/__test/reset');
  await signIn(p, 'beta@fixture.test'); await p.waitForFunction(() => window.no?.account); await mainReady(p);
  ok('Beta sees Beta', await count(p, '[data-trip=trip_B1]') === 1);
  for (const u of ['trips/?id=trip_A1', 'account/bookings/?id=BK_A1', 'account/documents/?id=doc_A1']) { await p.go(u); await mainReady(p); ok(`Beta cannot open Alpha's record: ${u}`, await count(p, '[data-reference], .c-acct-service, dialog[open]') === 0 && (/غير موجود/.test(await text(p, '[data-account=main] h1')) || await count(p, '.c-state--empty, .c-acct-docrow') >= 0)); }
  const direct = await p.evaluate(async (api) => { const r = await Promise.all(['/me/trips/trip_A1', '/me/bookings/BK_A1', '/me/documents/doc_A1/url', '/me/travellers/trv_A1'].map((x) => fetch(api + x, { credentials: 'include' }).then((r) => r.status))); return r; }, api.origin);
  ok('direct API calls with Beta\'s session for Alpha\'s ids → 404 (server-side scoping)', direct.every((s) => s === 404), direct.join());
  const forged = await p.evaluate(async (api) => { const r = await fetch(api + '/me/travellers', { method: 'DELETE', credentials: 'include' }); const r2 = await fetch(api + '/me/notifications/read', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{"all":true}' }); return [r.status, r2.status]; }, api.origin);
  ok('state-changing requests without the CSRF header are refused (403)', forged[1] === 403, forged.join());
  const signedA = await p.evaluate(async (api) => (await fetch(api + '/files/doc_A1?exp=9999999999999&sig=forged', { credentials: 'include' })).status, api.origin);
  ok('a forged signed URL is refused (403)', signedA === 403);
  const noCookie = await fetch(api.origin + '/me').then((r) => r.status);
  ok('no session → 401', noCookie === 401);
  await p.evaluate(() => localStorage.setItem('no.session', JSON.stringify({ token: 'cookie', customerId: 'cus_forged', role: 'admin' })));
  await p.go('account/'); await mainReady(p);
  ok('client-side marker tampering changes nothing: the backend decides the customer', /Beta/.test(await text(p, 'h1')) && await count(p, '[data-trip=trip_A1]') === 0);
  await c.close();
}

// ================================================================= 4. documents: upload, signed URL, expiry, delete, failures
{
  const { c, p } = await ctx(); await control('/__test/reset');
  await signIn(p, 'alpha@fixture.test'); await p.waitForFunction(() => window.no?.account);
  await p.go('account/documents/'); await mainReady(p); await p.waitForSelector('.c-acct-docrow');
  ok('documents from the backend with metadata only', await count(p, '.c-acct-docrow') === 2 && await count(p, '.c-acct-docrow [data-action=delete]') === 0);
  await p.locator('[data-action=view]').first().click(); await p.waitForSelector('dialog[data-dialog=document][data-state=ready]');
  const frameSrc = await p.locator('dialog iframe').getAttribute('src');
  ok('viewing asks for a temporary signed URL and shows the file', /\/files\/doc_A\d\?exp=\d+&sig=[0-9a-f]+/.test(frameSrc) && /صالح حتى/.test(await text(p, 'dialog [data-expiry]')));
  ok('the signed URL is temporary and its expiry is shown', /exp=\d+/.test(frameSrc));
  const fileStatus = await p.evaluate(async (u) => (await fetch(u)).status, frameSrc);
  ok('the signed URL itself serves the file', fileStatus === 200);
  await p.keyboard.press('Escape');
  await control('/__test/url-ttl', { ttlMs: 800 }); await p.locator('[data-action=view]').first().click(); await p.waitForSelector('dialog[data-dialog=document][data-state=ready]'); const shortSrc = await p.locator('dialog iframe').getAttribute('src');
  await p.waitForSelector('dialog[data-dialog=document][data-state=expired]', { timeout: 5000 });
  ok('an expired link is detected → expired state with renew', /انتهت صلاحية/.test(await text(p, 'dialog .c-state__title')) && await count(p, 'dialog [data-action=renew]') === 1);
  const gone = await p.evaluate(async (u) => (await fetch(u)).status, shortSrc);
  ok('the expired signed URL no longer serves the file (410)', gone === 410);
  await control('/__test/url-ttl', { ttlMs: 300000 }); await p.click('dialog [data-action=renew]'); await p.waitForSelector('dialog[data-dialog=document][data-state=ready]');
  ok('renew fetches a fresh link', (await p.locator('dialog iframe').getAttribute('src')) !== shortSrc); await p.keyboard.press('Escape');
  // upload
  await p.click('[data-action=upload]'); await p.waitForSelector('dialog[data-dialog=upload][open]');
  await p.setInputFiles('dialog input[type=file]', { name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(6 * 1024 * 1024) }); await p.click('dialog button[type=submit]'); await p.waitForTimeout(100);
  ok('too large → field error before any request', /أكبر/.test(await text(p, 'dialog [data-field=file] .c-field__error')));
  await p.setInputFiles('dialog input[type=file]', { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') }); await p.click('dialog button[type=submit]'); await p.waitForTimeout(100);
  ok('unsupported type → field error', /غير مدعوم/.test(await text(p, 'dialog [data-field=file] .c-field__error')));
  await p.setInputFiles('dialog input[type=file]', { name: 'scan.png', mimeType: 'image/png', buffer: PNG }); await p.fill('dialog [name=title]', 'Passport scan');
  await control('/__test/fault', { status: 500, path: 'me/documents' }); await p.click('dialog button[type=submit]'); await p.waitForFunction(() => document.querySelector('dialog [role=status]')?.dataset.tone === 'error');
  ok('upload failure (5xx) → customer-safe message, retry possible', /غير متاحة/.test(await text(p, 'dialog [role=status]')) && await count(p, 'dialog button[type=submit]:enabled') === 1);
  await p.click('dialog button[type=submit]'); await p.waitForSelector('.c-acct-docrow[data-kind=customer]');
  ok('upload → backend authorises → stored → listed with metadata + delete', /Passport scan/.test(await text(p, '.c-acct-docrow[data-kind=customer] h3')) && await count(p, '.c-acct-docrow[data-kind=customer] [data-action=delete]') === 1);
  await p.locator('.c-acct-docrow[data-kind=customer] [data-action=view]').click(); await p.waitForSelector('dialog[data-dialog=document][data-state=ready]'); ok('uploaded image previews through its signed URL', await count(p, 'dialog img[src*="/files/"]') === 1); await p.keyboard.press('Escape');
  const uploadedId = await p.locator('.c-acct-docrow[data-kind=customer]').getAttribute('data-doc');
  await signOut(p); await signIn(p, 'beta@fixture.test'); await p.waitForFunction(() => window.no?.account);
  const betaUrl = await p.evaluate(async (a) => (await fetch(a, { credentials: 'include' })).status, `${api.origin}/me/documents/${uploadedId}/url`);
  ok('another customer cannot get a link to the upload (404)', betaUrl === 404);
  await signOut(p); await signIn(p, 'alpha@fixture.test'); await p.waitForFunction(() => window.no?.account); await p.go('account/documents/'); await mainReady(p); await p.waitForSelector('.c-acct-docrow[data-kind=customer]');
  p.once('dialog', (d) => d.accept()); await p.locator('.c-acct-docrow[data-kind=customer] [data-action=delete]').click(); await p.waitForFunction(() => !document.querySelector('.c-acct-docrow[data-kind=customer]'));
  ok('delete where permitted', true);
  await p.locator('[data-action=view]').first().click(); await p.waitForSelector('dialog[data-dialog=document][data-state=ready]'); await p.keyboard.press('Escape');
  await control('/__test/fault', { status: 404, path: '/url' }); await p.locator('[data-action=view]').first().click();
  try { await p.waitForSelector('dialog[data-dialog=document][data-state=error]'); } catch (e) { console.log('  debug 404 step:', await p.evaluate(() => document.querySelector('dialog[data-dialog=document]')?.dataset.state), (await apiState()).requests.slice(-6).map((r) => r.path).join(',')); throw e; }
  ok('a deleted/revoked document → "unavailable" state', /غير متاح/.test(await text(p, 'dialog .c-state__title'))); await p.keyboard.press('Escape');
  await p.route('**/me/documents/*/url', (r) => r.abort('failed'), { times: 1 }); await p.locator('[data-action=view]').first().click(); await p.waitForSelector('dialog[data-dialog=document][data-state=error]');
  ok('network failure while fetching a link → retry', /تعذّر الاتصال/.test(await text(p, 'dialog .c-state__text')) && await count(p, 'dialog [data-action=retry]') === 1);
  await p.click('dialog [data-action=retry]'); await p.waitForSelector('dialog[data-dialog=document][data-state=ready]'); ok('retry recovers', true); await p.keyboard.press('Escape');
  await c.close();
}

// ================================================================= 5. payments (paged), notifications, legal, settings
{
  const { c, p } = await ctx(); await control('/__test/reset');
  await signIn(p, 'alpha@fixture.test'); await p.waitForFunction(() => window.no?.account);
  await p.go('account/payments/'); await mainReady(p); await p.waitForSelector('.c-acct-pay');
  ok('payment history page 1 from the backend: 10 of 25, statuses, references, no card data', await count(p, '.c-acct-pay') === 10 && /10.*25|٢٥/.test(await text(p, '[data-shown]')) && await count(p, '.c-acct-pay[data-pay-status=refunded]') === 1 && await count(p, '.c-acct-pay[data-pay-status=failed]') === 1 && /FXTX-/.test(await text(p, '[data-account=main]')) && !/\d{4} \d{4} \d{4}/.test(await text(p, '[data-account=main]')));
  await control('/__test/fault', { status: 429, path: 'me/payments', retryAfter: 2 }); await p.click('[data-action=more]'); await p.waitForFunction(() => !document.querySelector('[data-action=more] [role=alert], [data-region=payments] [role=alert][hidden]') || true); await p.waitForSelector('[data-region=payments] .c-field__error:not([hidden])');
  ok('429 on the next page → "too many requests", list kept', /طلبات كثيرة/.test(await text(p, '[data-region=payments] .c-field__error')) && await count(p, '.c-acct-pay') === 10);
  await p.click('[data-action=more]'); await p.waitForFunction(() => document.querySelectorAll('.c-acct-pay').length === 20);
  await p.click('[data-action=more]'); await p.waitForFunction(() => document.querySelectorAll('.c-acct-pay').length === 25);
  ok('paging to the end hides "show more"', await p.locator('[data-action=more]').isHidden());
  await control('/__test/fault', { status: 503, path: 'me/payments' }); await p.go('account/payments/'); await mainReady(p);
  ok('failed history request → error state with retry and support', await count(p, '[data-region=payments] .c-state--error [data-action=retry]') === 1 && await count(p, '[data-region=payments] .c-state--error a[href*="support"]') === 1);
  await p.click('[data-action=retry]'); await p.waitForSelector('.c-acct-pay'); ok('retry loads the history', await count(p, '.c-acct-pay') === 10);
  await signOut(p); await signIn(p, 'beta@fixture.test'); await p.waitForFunction(() => window.no?.account); await p.go('account/payments/'); await mainReady(p);
  ok('empty history → empty state', await count(p, '[data-region=payments] .c-state--empty') === 1);
  await signOut(p); await signIn(p, 'alpha@fixture.test'); await p.waitForFunction(() => window.no?.account);
  // notifications
  await p.go('account/notifications/'); await mainReady(p); await p.waitForSelector('.c-acct-ntf');
  ok('notifications retrieved with read state', await count(p, '.c-acct-ntf') === 2 && await count(p, '[data-read=false]') === 1);
  await p.locator('[data-action=mark-read]').first().click(); await p.waitForFunction(() => document.querySelectorAll('[data-read=false]').length === 0);
  const st = await apiState(); ok('mark as read reached the backend', st.requests.some((r) => r.path === '/me/notifications/read'));
  await control('/__test/fault', { status: 'timeout', path: 'me/notifications' }); await p.go('account/notifications/'); await p.waitForFunction(() => document.querySelector('[data-account=main] h1'));
  await p.waitForSelector('[data-region=notifications] .c-state--error', { timeout: 20000 });
  ok('timeout → error state with retry (no hang)', /أطول من المعتاد/.test(await text(p, '[data-region=notifications] .c-state__text')) && await count(p, '[data-action=retry]') === 1);
  await p.click('[data-action=retry]'); await p.waitForSelector('.c-acct-ntf'); ok('retry recovers notifications', true);
  const beforeQuiet = (await apiState()).requests.filter((r) => r.path === '/me/notifications').length;
  await p.evaluate(() => window.no.notifications.quietRefresh()); await p.waitForTimeout(300);
  ok('returning to the tab refreshes quietly (one request, no polling)', (await apiState()).requests.filter((r) => r.path === '/me/notifications').length === beforeQuiet + 1);
  // legal + acceptance
  await p.go('legal/terms/'); await p.waitForFunction(() => document.documentElement.dataset.legal);
  ok('terms page: not supplied state when the backend has no document', await count(p, '.c-state--info') === 1 && !/fixture|نموذج/.test(await text(p, '[data-legal=main]')));
  await control('/__test/legal', { supplied: true, version: 'fixture-2' });
  await p.go('legal/terms/'); await p.waitForFunction(() => document.documentElement.dataset.legal === 'supplied');
  ok('terms page renders the backend document with version and date, scripts stripped', /نموذج اختبار/.test(await text(p, 'h1')) && await count(p, '[data-version="fixture-2"]') === 1 && await count(p, '[data-legal=body] script') === 0 && await count(p, '[data-legal=body] a[href^="javascript"]') === 0 && await p.evaluate(() => window.__xss === undefined));
  await p.go('legal/privacy/'); await p.waitForFunction(() => document.documentElement.dataset.legal === 'supplied'); ok('privacy page renders', /سياسة الخصوصية/.test(await text(p, 'h1')));
  await signOut(p); await p.go('account/sign-up/', 'signUp'); await p.waitForSelector('[name=accept]');
  ok('sign-up: acceptance checkbox with Terms and Privacy links, version shown', await count(p, '[data-legal=terms][target=_blank]') === 1 && await count(p, '[data-legal=privacy]') === 1 && /fixture-2/.test(await text(p, '[data-legal=host]')));
  await p.fill('[name=name]', 'Delta'); await p.fill('[name=email]', 'delta@fixture.test'); await p.fill('[name=password]', 'password123'); await p.fill('[name=confirm]', 'password123'); await p.click('[data-form=sign-up] button[type=submit]'); await p.waitForTimeout(100);
  ok('acceptance required', await count(p, '[data-form=sign-up] .c-field__error:not([hidden])') === 1 && /قبول|الموافقة/.test(await text(p, '[data-form=sign-up] .c-field__error:not([hidden])')) && /sign-up/.test(p.url()));
  await p.check('[name=accept]'); await Promise.all([p.waitForURL(/account\/$/), p.click('[data-form=sign-up] button[type=submit]')]); await mainReady(p);
  const delta = (await apiState()).customers.find((x) => x.email === 'delta@fixture.test');
  ok('acceptance recorded server-side with the versions', delta?.acceptance?.terms?.version === 'fixture-2' && delta?.acceptance?.privacy?.version === 'fixture-2' && !!delta.acceptance.at);
  await p.go('account/settings/'); await mainReady(p); ok('settings shows the accepted version', /fixture-2/.test(await text(p, '#set-acceptance')));
  await p.fill('[data-form=profile] [name=name]', 'Delta Renamed'); await p.click('[data-form=profile] button[type=submit]'); await p.waitForFunction(() => /تم حفظ/.test(document.querySelector('[data-form=profile] [role=status]')?.textContent ?? ''));
  ok('profile PATCH → backend, header updated', /Delta Renamed/.test(await text(p, 'header button:has(.c-gh__avatar)')) && (await apiState()).customers.find((x) => x.email === 'delta@fixture.test').name === 'Delta Renamed');
  // travellers through the API
  await p.go('account/travellers/'); await mainReady(p); await p.click('[data-action=add]'); await p.waitForSelector('dialog[open]');
  await p.fill('dialog [name=firstName]', 'Delta'); await p.fill('dialog [name=lastName]', 'One'); await p.fill('dialog [name=dob]', '1992-02-02'); await p.selectOption('dialog [name=gender]', 'M'); await p.selectOption('dialog [name=nationality]', { index: 1 }); await p.fill('dialog [name=passport]', 'D1111111'); await p.fill('dialog [name=passportExpiry]', '2032-01-01'); await p.click('dialog button[type=submit]'); await p.waitForSelector('.c-acct-trv');
  ok('traveller created through the API', await count(p, '.c-acct-trv') === 1);
  await c.close();
}

// ================================================================= 6. booking continuity + attribution through the backend
{
  const { c, p } = await ctx(); await control('/__test/reset');
  await p.go('search/?vertical=flights&tripType=return&from=KRT&to=JED&fromCode=KRT&toCode=JED&depart=2026-11-16&return=2026-11-23&adults=2&children=1&cabin=business&supervisor=omar-hassan', 'results'); await p.waitForSelector('.c-flight[data-offer]');
  await Promise.all([p.waitForURL(/travellers/), p.locator('[data-action=select]').first().click()]); await p.waitForFunction(() => window.no?.travellers);
  const back = new URL(p.url()).pathname;
  await p.go('account/sign-up/?next=' + encodeURIComponent(back), 'signUp'); await p.waitForSelector('[data-legal]');
  ok('sign-up carries the attribution note', await count(p, '[data-attributed=omar-hassan]') === 1);
  await p.fill('[name=name]', 'Epsilon'); await p.fill('[name=email]', 'epsilon@fixture.test'); await p.fill('[name=password]', 'password123'); await p.fill('[name=confirm]', 'password123'); const acc = p.locator('[name=accept]'); if (await acc.count()) await acc.check();
  await Promise.all([p.waitForURL(/booking\/travellers/), p.click('[data-form=sign-up] button[type=submit]')]); await p.waitForFunction(() => window.no?.travellers);
  const j = await p.evaluate(() => JSON.parse(sessionStorage.getItem('no.journey')));
  ok('booking context survives authentication (service, trip type, route, dates, travellers, cabin, attribution, locale)', j.context.service === 'flights' && j.context.tripType === 'return' && j.context.originCode === 'KRT' && j.context.destinationCode === 'JED' && j.context.dates.depart === '2026-11-16' && j.context.travellers.children === 1 && j.context.cabin === 'business' && j.context.attribution.supervisor === 'omar-hassan' && j.context.locale === 'ar' && !!j.selection);
  const eps = (await apiState()).customers.find((x) => x.email === 'epsilon@fixture.test');
  // The customer-facing state exposes the supervisor's PUBLIC slug (what the frontend registry recognises), not the
  // internal backend id — see backend/identity.mjs's publicCustomer().
  ok('backend holds the attribution (supervisor, source, date) from sign-up', eps?.attribution?.supervisorId === 'omar-hassan' && eps.attribution.source === 'link' && !!eps.attribution.at);
  await fillTravellers(p); await next(p, /extras/); await p.waitForFunction(() => window.no?.extras); await next(p, /review/); await p.waitForFunction(() => window.no?.review); await p.waitForSelector('#review-terms'); await p.check('#review-terms'); await next(p, /payment/); await p.waitForFunction(() => window.no?.payment);
  await p.check('#pm-dev-success'); await p.click('[data-action=pay]'); await p.waitForURL(/confirmation/); await p.waitForFunction(() => window.no?.confirmation); await p.waitForSelector('[data-claimed]');
  const tripId = await p.getAttribute('[data-claimed]', 'data-claimed');
  ok('the booking is attached through the backend and becomes a trip', /^trip_/.test(tripId) && (await apiState()).requests.some((r) => r.path === '/me/bookings/claim'));
  await p.go(`trips/?id=${tripId}`); await mainReady(p);
  ok('trip from the backend with the attributed supervisor', await count(p, '.c-acct-service') === 1 && await count(p, '[data-account=main] a[href*="supervisor/omar-hassan"]') >= 1);
  await p.go('account/settings/'); await mainReady(p);
  ok('attribution read-only in settings; no commission anywhere', await count(p, '#set-supervisor input, #set-supervisor select') === 0 && !/commission|عمولة/i.test(await p.evaluate(() => document.body.innerText)));
  await c.close();
}

// ================================================================= 7. error states on the dashboard: network, 5xx, 403, timeout; diagnostics scrubbed
{
  const { c, p } = await ctx(); await control('/__test/reset');
  await signIn(p, 'alpha@fixture.test'); await p.waitForFunction(() => window.no?.account);
  for (const [status, re] of [['network', /تعذّر الاتصال/], [500, /غير متاحة/], [403, /صلاحية/], [429, /طلبات كثيرة/]]) {
    if (status === 'network') await p.route('**/me/trips', (r) => r.abort('failed'), { times: 1 }); else await control('/__test/fault', { status, path: 'me/trips' });
    await p.go('trips/'); await mainReady(p);
    ok(`trips: ${status} → understandable error, no internals`, re.test(await text(p, '[data-region=trips] .c-state__text')) && !/Error|stack|500|fetch/i.test(await text(p, '[data-region=trips] .c-state')) && await count(p, '[data-region=trips] a[href*="support"]') === 1);
  }
  await p.route('**/auth/session', (r) => r.abort('failed'), { times: 1 }); await p.go('account/'); await p.waitForFunction(() => document.querySelector('[data-account=main] h1'));
  ok('backend unreachable while verifying the session → "could not reach", NOT signed out, retry', /تعذّر الوصول/.test(await text(p, 'h1')) && (await marker(p))?.token === 'cookie' && await count(p, '[data-action=retry]') === 1);
  await p.go('account/'); await mainReady(p); ok('next load recovers the session', /Alpha/.test(await text(p, 'h1')));
  const st = await apiState();
  ok('diagnostics reached the backend for failures', st.events.some((e) => e.event === 'api.failure') && st.events.some((e) => e.event === 'auth.unavailable' || e.event === 'trips.failure'));
  ok('diagnostics carry no credentials, tokens or personal data', st.events.every((e) => !/password|token|cookie|email|passport/i.test(Object.keys(e).join()) && !/[0-9a-f]{32,}/.test(JSON.stringify(e))));
  await c.close();
}

// ================================================================= 8. widths × languages on the production adapters (incl. 600 / 1024 / 1200)
for (const [w, h, tag] of [[390, 844, 'mobile'], [600, 900, 'intermediate'], [834, 1100, 'tablet'], [1024, 900, 'tablet-desktop'], [1200, 900, 'desktop-md'], [1440, 1000, 'desktop']]) for (const loc of ['ar', 'en']) {
  const { c, p } = await ctx(w, h, loc); await control('/__test/reset'); await control('/__test/legal', { supplied: true, version: 'fixture-2' });
  const screen = async (name, extra = {}) => {
    const r = await p.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, h1: [...document.querySelectorAll('h1')].filter((x) => x.checkVisibility()).length, hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth, mainText: [...document.querySelectorAll('main h1, main h2, main h3, main p, main a, main button, main label, main dt, main dd, main span, main li')].filter((n) => n.checkVisibility() && !n.closest('select')).map((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) ? n.textContent : '').join('\n'), unlabelled: [...document.querySelectorAll('main input:not([type=hidden]), main select')].filter((c) => c.checkVisibility() && !(c.id && document.querySelector(`label[for="${c.id}"]`)) && !c.getAttribute('aria-label')).length }));
    const L = `${tag}/${loc}/${name}`;
    ok(`${L} lang/dir`, r.lang === loc && r.dir === (loc === 'ar' ? 'rtl' : 'ltr')); ok(`${L} one h1`, r.h1 === 1, String(r.h1)); ok(`${L} no horizontal scroll`, !r.hScroll); ok(`${L} controls labelled`, r.unlabelled === 0, String(r.unlabelled));
    if (loc === 'en') ok(`${L} fully English`, !AR.test(r.mainText.replace(/\(نموذج اختبار\)|نموذج اختبار|هذا نص نموذج اختبار وليس وثيقة قانونية\.|بند/g, '')), (r.mainText.match(/[^\n]*[؀-ۿ][^\n]*/) ?? [''])[0].slice(0, 80));
    if (extra.shot) await p.screenshot({ path: shot(`integration-${name}-${tag}-${loc}.png`), fullPage: true });
  };
  await p.go('legal/terms/'); await p.waitForFunction(() => document.documentElement.dataset.legal === 'supplied'); await screen('terms', { shot: w === 390 });
  await p.go('account/sign-in/', 'signIn'); await p.fill('[name=email]', 'x@fixture.test'); await p.fill('[name=password]', 'wrongpass1'); await p.click('[data-form=sign-in] button[type=submit]'); await p.waitForFunction(() => document.querySelector('[data-form=sign-in] [role=status]')?.dataset.tone === 'error'); await screen('sign-in-error');
  await signIn(p, 'alpha@fixture.test'); await p.waitForFunction(() => window.no?.account); await mainReady(p); await screen('dashboard', { shot: w === 390 || w === 1440 });
  await p.go('trips/'); await mainReady(p); await screen('trips');
  await p.go('account/documents/'); await mainReady(p); await p.waitForSelector('.c-acct-docrow'); await screen('documents');
  await p.go('account/payments/'); await mainReady(p); await p.waitForSelector('.c-acct-pay'); await screen('payments');
  await control('/__test/fault', { status: 500, path: 'me/notifications' }); await p.go('account/notifications/'); await mainReady(p); await screen('notifications-error');
  await control('/__test/revoke'); await p.go('account/settings/'); await p.waitForFunction(() => document.querySelector('[data-account=main] h1')); await screen('session-expired', { shot: w === 390 });
  if (w === 1440 && loc === 'ar') {
    await signIn(p, 'alpha@fixture.test'); await p.waitForFunction(() => window.no?.account); await p.go('account/documents/'); await mainReady(p); await p.waitForSelector('.c-acct-docrow');
    await p.focus('[data-action=upload]'); await p.keyboard.press('Enter'); await p.waitForSelector('dialog[data-dialog=upload][open]');
    let hops = 0; let inside = true; while (hops++ < 20) { await p.keyboard.press('Tab'); inside = await p.evaluate(() => !!document.activeElement?.closest('dialog[open]')); if (!inside) break; }
    ok('upload dialog keeps keyboard focus inside', inside); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    ok('Escape closes and returns focus to the upload button', await count(p, 'dialog[open]') === 0 && await p.evaluate(() => document.activeElement?.dataset.action === 'upload'));
    await p.locator('[data-action=view]').first().focus(); await p.keyboard.press('Enter'); await p.waitForSelector('dialog[data-dialog=document][data-state=ready]'); await p.keyboard.press('Escape'); ok('viewer opens and closes by keyboard', await count(p, 'dialog[open]') === 0);
  }
  await c.close();
}

// ================================================================= 9. production payment step: no dev provider, "pay later", no -DEV- reference (§1.13)
// Only against the contract server: a real staging backend lists just SITE_PORT's origin in BACKEND_ALLOWED_ORIGINS.
if (!process.env.BACKEND_ORIGIN) {
  await control('/__test/reset');
  for (const loc of ['ar', 'en']) {
    const { c, p } = await ctx(1440, 1000, loc, prodApi.origin);
    await p.go('search/?vertical=flights&tripType=oneway&from=KRT&to=JED&fromCode=KRT&toCode=JED&depart=2026-11-16&adults=1&cabin=economy', 'results'); await p.waitForSelector('.c-flight[data-offer]');
    const mods = await p.evaluate(async () => { const Pm = await import('./assets/js/booking/payment.js'); const A = await import('./assets/js/booking/adapters/index.js'); return { providers: Pm.paymentProviders().map((x) => x.id), dev: Pm.DEV_PAYMENT, refs: [A.bookingReference('NO'), A.bookingReference('RQ')] }; });
    ok(`${loc} production registers no development payment provider`, mods.providers.length === 0 && mods.dev === null, mods.providers.join());
    ok(`${loc} production references carry no -DEV-`, mods.refs.every((r) => /^(NO|RQ)-[A-Z0-9]{8}$/.test(r) && !r.includes('-DEV-')), mods.refs.join());
    await Promise.all([p.waitForURL(/travellers/), p.locator('[data-action=select]').first().click()]); await p.waitForFunction(() => window.no?.travellers);
    await fillTravellers(p); await next(p, /extras/); await p.waitForFunction(() => window.no?.extras); await next(p, /review/); await p.waitForFunction(() => window.no?.review); await p.waitForSelector('#review-terms'); await p.check('#review-terms'); await next(p, /payment/); await p.waitForFunction(() => window.no?.payment);
    const body = await p.evaluate(() => document.body.innerText);
    ok(`${loc} production payment step: no development mode, no simulated methods`, !/Development payment mode|وضع الدفع التجريبي|Simulate|محاكاة/.test(body) && await count(p, '[id^=pm-dev], [data-action=pay]') === 0);
    ok(`${loc} production payment step shows "pay later" with the payment-link copy`, await count(p, '[data-pay-later=true]') === 1 && await count(p, '[data-action=pay-later]') === 1 && (loc === 'ar' ? /رابط دفع آمن/.test(body) : /secure payment link/.test(body)));
    await Promise.all([p.waitForURL(/confirmation/), p.click('[data-action=pay-later]')]); await p.waitForFunction(() => window.no?.confirmation);
    const ref = await p.getAttribute('[data-reference]', 'data-reference'); const j = await p.evaluate(() => JSON.parse(sessionStorage.getItem('no.journey')));
    ok(`${loc} placed as awaiting payment with a non-dev reference`, /^NO-[A-Z0-9]{8}$/.test(ref) && j.booking.payment === 'awaiting' && j.payment.status === 'awaiting' && await count(p, '[data-payment-status=awaiting]') === 1, ref);
    ok(`${loc} no payment intent is requested for a pay-later booking`, !(await apiState()).requests.some((r) => /payment-intent/.test(r.path)));
    await c.close();
  }
}

await b.close(); await site.close(); await prodNoApi.close(); await prodApi.close(); await api.close();
const filtered = errs.filter((e) => !/favicon/.test(e));
console.log(`integration: ${pass} passed, ${fail} failed, ${filtered.length} console/network problems`);
filtered.slice(0, 12).forEach((e) => console.log('  ✗', e));
process.exit(fail || filtered.length ? 1 : 0);
