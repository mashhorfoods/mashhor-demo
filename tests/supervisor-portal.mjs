// Stage 13 supervisor system verification — public profile → attribution → booking → customer account → supervisor
// dashboard end to end against the REAL backend; the supervisor portal's screens (dashboard, customers, leads,
// bookings, revenue, performance, notifications, settings) against the development stand-in; guard/authorization,
// empty/error/slow states, and the responsive + RTL/LTR matrix. Exits 1 on any ✗.
import { shot, makeCtx, startEphemeralBackend, launch, staticServer, stagingEnv } from './env.mjs';
import { rmSync } from 'node:fs';

const ORIGIN = process.env.TEST_ORIGIN + '';
const P = '/mashhor-demo/';
const b = await launch();
let pass = 0, fail = 0;
const ok = (name, cond, note = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} ${note}`); } };
const errs = [];
const AR = /[؀-ۿ]/;

const ctx = makeCtx(b, errs);
const go = async (p, url, handle) => { await p.goto(ORIGIN + P + url); if (handle) await p.waitForFunction((h) => window.no?.[h], handle); };
const mainReady = (p) => p.waitForFunction(() => document.querySelector('[data-portal=main] h1') && !document.querySelector('[data-portal=main] .c-loading-block'));
const text = (p, sel) => p.locator(sel).first().textContent().then((s) => (s ?? '').replace(/\s+/g, ' ').trim()).catch(() => '');
const count = (p, sel) => p.locator(sel).count();
const visible = (p, sel) => p.locator(sel).first().isVisible().catch(() => false);
const dev = (p, key, value) => p.evaluate(([k, v]) => { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); }, [key, value]);
const devSignIn = async (p) => { await go(p, 'supervisor/sign-in/', 'supervisorSignIn'); await Promise.all([p.waitForURL(/dashboard\/$/), p.click('[data-action=dev-sign-in]')]); await mainReady(p); };
const signOut = async (p) => { await go(p, 'supervisor/sign-out/', 'supervisorSignOut'); };
const marker = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('no.supervisor.session') ?? 'null'));

// ================================================================= 1. authorization: every portal route guarded, sign in / out
{
  const { c, p } = await ctx();
  const PORTAL_ROUTES = ['supervisor/dashboard/', 'supervisor/customers/', 'supervisor/leads/', 'supervisor/bookings/', 'supervisor/revenue/', 'supervisor/performance/', 'supervisor/notifications/', 'supervisor/settings/'];
  for (const u of PORTAL_ROUTES) {
    await p.goto(ORIGIN + P + u); await p.waitForFunction(() => document.querySelector('[data-portal=main] h1'));
    ok(`guest blocked: ${u}`, await count(p, '[data-action=sign-in]') === 1 && await count(p, '[data-portal=nav] a') === 0);
    ok(`${u} is noindex`, (await p.getAttribute('meta[name=robots]', 'content')) === 'noindex, nofollow');
  }
  await go(p, 'supervisor/sign-in/', 'supervisorSignIn');
  ok('sign-in: dev notice, one password field, no sign-up link', await visible(p, '[data-dev=true]') && await count(p, 'input[type=password]') === 1 && await count(p, '[data-portal=main] a[href*="sign-up"]') === 0);
  await p.fill('[name=email]', 'nobody@example.com'); await p.fill('[name=password]', 'wrongpass1');
  await p.click('[data-form=sign-in] button[type=submit]'); await p.waitForFunction(() => document.querySelector('[data-form=sign-in] [role=status]')?.dataset.tone === 'error');
  ok('invalid credentials → error, still guest', /غير صحيحة/.test(await text(p, '[data-form=sign-in] [role=status]')) && (await marker(p)) === null);
  await devSignIn(p);
  ok('dev demo sign-in → dashboard, session marker stored', /^dev\./.test((await marker(p))?.token ?? '') && /مرحباً/.test(await text(p, 'h1')));
  ok('portal nav shows every module, current marked', (await p.$$eval('[data-portal=nav] a', (as) => as.map((a) => a.dataset.nav))).join('|') === 'dashboard|customers|leads|bookings|revenue|performance|notifications|settings|sign-out');
  await signOut(p);
  ok('sign out: marker cleared, signed-out message', (await marker(p)) === null && /تم تسجيل الخروج|تسجيل الخروج/.test(await text(p, 'h1')));
  await go(p, 'supervisor/dashboard/'); await p.waitForFunction(() => document.querySelector('[data-portal=main] h1'));
  ok('guarded again after sign out', await count(p, '[data-action=sign-in]') === 1);
  // ?next= returns to the page the guard interrupted (review 2026-09-25 §1.4) — and only to a page of this portal
  await p.goto(ORIGIN + P + 'supervisor/leads/'); await p.waitForFunction(() => document.querySelector('[data-action=sign-in]'));
  await Promise.all([p.waitForURL(/sign-in\/\?next=/), p.click('[data-action=sign-in]')]); await p.waitForFunction((h) => window.no?.[h], 'supervisorSignIn');
  await Promise.all([p.waitForURL((u) => u.pathname.endsWith(P + 'supervisor/leads/')), p.click('[data-action=dev-sign-in]')]);
  ok('sign-in from a guarded page returns to that page via ?next=', p.url().endsWith(P + 'supervisor/leads/'));
  await signOut(p);
  for (const bad of ['//evil.example/', 'https://evil.example/supervisor/', P + 'admin/dashboard/', P + 'supervisor/../admin/dashboard/']) {
    await go(p, 'supervisor/sign-in/?next=' + encodeURIComponent(bad), 'supervisorSignIn');
    await Promise.all([p.waitForURL(/dashboard\/$/), p.click('[data-action=dev-sign-in]')]);
    ok(`?next=${bad} is refused → own dashboard`, p.url().endsWith(P + 'supervisor/dashboard/'));
    await signOut(p);
  }
  await c.close();
}

// ================================================================= 2. populated screens (development data adapter)
{
  const { c, p } = await ctx(); await devSignIn(p);
  ok('dashboard: metrics, revenue, leads mini-list, notifications', await count(p, '.c-svp-metric') >= 1 && await count(p, '#dash-rev .t-price') === 1 && await visible(p, '#dash-leads'));

  await go(p, 'supervisor/customers/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap');
  ok('customers: two development customers listed', await count(p, 'tbody tr') === 2);
  await p.fill('#svp-cust-search', 'Two'); await p.locator('#svp-cust-search').press('Enter'); await p.waitForTimeout(300);
  ok('customer search filters the list', await count(p, 'tbody tr') === 1);
  await p.fill('#svp-cust-search', ''); await p.locator('#svp-cust-search').press('Enter'); await p.waitForTimeout(300);
  await p.click('tbody tr:first-child a'); await mainReady(p);
  ok('customer detail: contact, attribution history, bookings', await count(p, '#cust-contact') === 1 && await count(p, '#cust-history li') >= 1 && await count(p, '#cust-bookings tbody tr, #cust-bookings td') >= 1);
  await go(p, 'supervisor/customers/?id=not-a-real-customer'); await mainReady(p);
  ok('unknown customer id → not-found state, not an error', /غير موجود/.test(await text(p, 'h1')));

  await go(p, 'supervisor/leads/'); await mainReady(p); await p.waitForSelector('.c-svp-lead');
  ok('leads: two development leads with status selects', await count(p, '.c-svp-lead') === 2 && await count(p, '[data-lead-status-select]') === 2);
  const firstLeadSelect = p.locator('[data-lead-status-select]').first();
  await firstLeadSelect.selectOption({ label: 'مغلق' }); await p.waitForTimeout(400);
  await go(p, 'supervisor/leads/'); await mainReady(p); await p.waitForSelector('.c-svp-lead');
  ok('lead status change persists after reload', await p.locator('[data-lead-status-select]').first().inputValue() === 'closed');

  await go(p, 'supervisor/bookings/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap');
  ok('bookings: development bookings listed with status/pay badges', await count(p, 'tbody tr') === 3);
  await p.selectOption('select', { label: 'مؤكد' }).catch(() => {}); await p.waitForTimeout(300);
  await p.click('tbody tr:first-child a').catch(() => {}); await mainReady(p);
  ok('booking detail renders reference and amount', await count(p, '#svp-bk-details') === 1);

  await go(p, 'supervisor/revenue/'); await mainReady(p); await p.waitForSelector('.c-svp-metrics, .c-state--empty');
  ok('revenue: gross/completed/pending/cancelled + commission pending notice', await count(p, '.c-svp-metrics .c-svp-metric') === 4 && /لم يُحدَّد نظام العمولة/.test(await text(p, '#rev-commission')));

  await go(p, 'supervisor/performance/'); await mainReady(p); await p.waitForSelector('.c-svp-metrics');
  ok('performance: customers/leads/conversion/bookings metrics', await count(p, '.c-svp-metrics .c-svp-metric') >= 5);

  await go(p, 'supervisor/notifications/'); await mainReady(p); await p.waitForSelector('.c-svp-ntf, .c-acct-ntf');
  ok('notifications: development feed, one unread', await count(p, '.c-svp-ntf, .c-acct-ntf') === 2);
  await p.click('[data-action=markAll]'); await p.waitForTimeout(300);
  ok('mark-all-read clears the unread badge', (await p.getAttribute('[data-unread]', 'data-unread')) === '0');

  await go(p, 'supervisor/settings/'); await mainReady(p);
  await p.fill('#svp-city', 'بورتسودان'); await p.click('#svp-settings-profile button[type=submit]'); await p.waitForTimeout(400);
  ok('settings: profile field saves without error', await count(p, '#svp-settings-profile .c-field__error:not([hidden])') === 0);
  ok('settings never exposes slug, id, commission or role fields', await count(p, '#svp-settings-profile input[name=slug], #svp-settings-profile input[name=id], #svp-settings-profile input[name=commission], #svp-settings-profile input[name=role]') === 0 && !/commission|عمولة/i.test(await p.evaluate(() => document.body.innerText)));
  await c.close();
}
// ================================================================= 3. empty and failure states (development switches)
{
  const { c, p } = await ctx(); await devSignIn(p); await dev(p, 'no.dev.supervisor', 'empty');
  for (const [url, sel, textMatch] of [
    ['supervisor/customers/', null, 'لا يوجد عملاء'],
    ['supervisor/leads/', null, 'لا يوجد عملاء محتملون'],
    ['supervisor/bookings/', null, 'لا توجد حجوزات'],
    ['supervisor/revenue/', null, 'لا توجد إيرادات'],
    ['supervisor/performance/', null, 'لا توجد بيانات كافية'],
    ['supervisor/notifications/', null, 'لا توجد إشعارات'],
  ]) { await go(p, url); await mainReady(p); ok(`empty state: ${url}`, (await text(p, '[data-portal=main]')).includes(textMatch)); }
  await dev(p, 'no.dev.supervisor', 'error'); await go(p, 'supervisor/customers/'); await mainReady(p);
  ok('error state has a retry action, no crash', await count(p, '[data-action=retry]') === 1);
  await dev(p, 'no.dev.supervisor', 'slow');
  const t0 = Date.now();
  await go(p, 'supervisor/dashboard/');
  await p.waitForFunction(() => document.querySelector('[data-portal=main] .c-loading-block, [data-portal=main] [aria-busy="true"]'));
  const duringLoad = await count(p, '.c-loading-block, [aria-busy="true"]');
  await mainReady(p);
  ok('slow response shows a loading state before the content, not a blank screen', duringLoad >= 1 && Date.now() - t0 >= 1500);
  await dev(p, 'no.dev.supervisor', null);
  await c.close();
}

// ================================================================= 4. widths × languages
for (const [w, h, tag] of [[390, 844, 'mobile'], [834, 1100, 'tablet'], [1440, 1000, 'desktop']]) for (const loc of ['ar', 'en']) {
  const { c, p } = await ctx(w, h, loc);
  const screen = async (name, extra = {}) => {
    const r = await p.evaluate(() => ({
      lang: document.documentElement.lang, dir: document.documentElement.dir,
      h1: Array.from(document.querySelectorAll('h1')).filter((x) => x.checkVisibility()).length, hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      primaries: Array.from(document.querySelectorAll('main .c-btn--primary')).filter((n) => n.checkVisibility() && !n.closest('dialog')).length,
      mainText: Array.from(document.querySelectorAll('main h1, main h2, main h3, main p, main a, main button, main label, main th, main td, main span')).filter((n) => n.checkVisibility() && !n.closest('select')).map((n) => n.childNodes.length && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) ? n.textContent : '').join('\n'),
      robots: document.querySelector('meta[name=robots]')?.content,
      small: Array.from(document.querySelectorAll('main p, main a, main button, main span, main li, main label, main th, main td')).filter((n) => n.checkVisibility() && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 12).length,
      unlabelled: Array.from(document.querySelectorAll('main input:not([type=hidden]), main select')).filter((c) => c.checkVisibility() && !(c.id && document.querySelector(`label[for="${c.id}"]`)) && !c.getAttribute('aria-label') && !c.getAttribute('aria-labelledby')).length,
      nav: !!document.querySelector('[data-portal=nav] [aria-current=page]'),
    }));
    const L = `${tag}/${loc}/${name}`;
    ok(`${L} lang/dir`, r.lang === loc && r.dir === (loc === 'ar' ? 'rtl' : 'ltr'));
    ok(`${L} one h1`, r.h1 === 1, String(r.h1)); ok(`${L} no horizontal scroll`, !r.hScroll); ok(`${L} noindex`, /noindex/.test(r.robots));
    ok(`${L} ≤1 dominant CTA`, r.primaries <= 1, String(r.primaries)); ok(`${L} no tiny text`, r.small === 0, String(r.small)); ok(`${L} controls labelled`, r.unlabelled === 0, String(r.unlabelled));
    if (!extra.auth) ok(`${L} portal nav marks current`, r.nav);
    if (loc === 'en') ok(`${L} fully English`, !AR.test(r.mainText), (r.mainText.match(/[^\n]*[؀-ۿ][^\n]*/) ?? [''])[0].slice(0, 80));
    if (extra.shot) await p.screenshot({ path: shot(`supervisor-${name}-${tag}-${loc}.png`), fullPage: true });
  };
  await go(p, 'supervisor/sign-in/', 'supervisorSignIn'); await screen('sign-in', { auth: true, shot: true });
  await Promise.all([p.waitForURL(/dashboard\/$/), p.click('[data-action=dev-sign-in]')]); await mainReady(p); await screen('dashboard', { shot: true });
  await go(p, 'supervisor/customers/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap'); await screen('customers', { shot: true });
  await go(p, 'supervisor/leads/'); await mainReady(p); await p.waitForSelector('.c-svp-lead'); await screen('leads');
  await go(p, 'supervisor/bookings/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap'); await screen('bookings');
  await go(p, 'supervisor/revenue/'); await mainReady(p); await screen('revenue');
  await go(p, 'supervisor/performance/'); await mainReady(p); await screen('performance');
  await go(p, 'supervisor/notifications/'); await mainReady(p); await screen('notifications');
  await go(p, 'supervisor/settings/'); await mainReady(p); await screen('settings', { shot: true });
  await c.close();
}

await b.close();

// ================================================================= 5. real backend: public profile → attribution → booking → supervisor visibility
{
  const { dir, backend, origin: API } = await startEphemeralBackend({ prefix: 'no-sup-backend-', portBase: 8990, portSpread: 9 });
  const control = (path, body = {}) => fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  const apiState = () => fetch(API + '/__test/state').then((r) => r.json());
  await control('/__test/reset');

  const site = await staticServer({ prefix: P, env: stagingEnv(API) });
  const siteOrigin = site.origin;

  const b2 = await launch();
  const bctx = async () => { const c = await b2.newContext({ viewport: { width: 1440, height: 1000 } }); const p = await c.newPage(); p.setDefaultTimeout(10000); return { c, p }; };
  const bgo = async (p, url, handle) => { await p.goto(siteOrigin + P + url); if (handle) await p.waitForFunction((h) => window.no?.[h], handle); };

  // Public profile → booking, attributed to supervisor-1
  const { c: c1, p: p1 } = await bctx();
  await bgo(p1, 'supervisor/ahmed-mohamed/', 'supervisor');
  await Promise.all([p1.waitForURL(/search|book/), p1.click('[data-profile-action=book]')]);
  await bgo(p1, 'search/?vertical=flights&tripType=oneway&from=KRT&to=JED&fromCode=KRT&toCode=JED&depart=2026-12-01&adults=1&supervisor=ahmed-mohamed', 'results');
  await p1.waitForSelector('.c-flight[data-offer]');
  await Promise.all([p1.waitForURL(/travellers/), p1.locator('[data-action=select]').first().click()]);
  await p1.waitForFunction(() => window.no?.travellers);
  const backUrl = new URL(p1.url()).pathname;
  await bgo(p1, 'account/sign-up/?next=' + encodeURIComponent(backUrl), 'signUp');
  ok('sign-up shows the supervisor-1 attribution note', await count(p1, '[data-attributed=ahmed-mohamed]') === 1);
  await p1.fill('[name=name]', 'Zeta Customer'); await p1.fill('[name=email]', 'zeta@fixture.test'); await p1.fill('[name=password]', 'password123'); await p1.fill('[name=confirm]', 'password123');
  const acc = p1.locator('[name=accept]'); if (await acc.count()) await acc.check();
  await Promise.all([p1.waitForURL(/booking\/travellers/), p1.click('[data-form=sign-up] button[type=submit]')]); await p1.waitForFunction(() => window.no?.travellers);
  const forms = p1.locator('form.c-traveller[data-traveller]'); const n = await forms.count();
  for (let i = 0; i < n; i++) { const f = forms.nth(i); await f.locator('[name=firstName]').fill('Zeta'); await f.locator('[name=lastName]').fill('Traveller'); if (await f.locator('[name=dob]').count()) { await f.locator('[name=dob]').fill('1990-01-01'); await f.locator('select[name=gender]').selectOption({ index: 1 }); await f.locator('select[name=nationality]').selectOption({ index: 1 }); await f.locator('[name=passport]').fill('Z1111111'); await f.locator('[name=passportExpiry]').fill('2032-01-01'); } }
  await p1.fill('[name=email]', 'zeta@fixture.test'); await p1.fill('[name=phone]', '+249900000000');
  const stepNext = async (re) => { await Promise.all([p1.waitForURL(re), p1.click('.c-journey__actions .c-btn--primary')]); };
  await stepNext(/extras/); await p1.waitForFunction(() => window.no?.extras); await stepNext(/review/); await p1.waitForFunction(() => window.no?.review); await p1.waitForSelector('#review-terms'); await p1.check('#review-terms'); await stepNext(/payment/); await p1.waitForFunction(() => window.no?.payment);
  await p1.check('#pm-dev-success'); await p1.click('[data-action=pay]'); await p1.waitForURL(/confirmation/); await p1.waitForFunction(() => window.no?.confirmation); await p1.waitForSelector('[data-claimed]');
  ok('the booking claims through the real backend', /^trip_/.test(await p1.getAttribute('[data-claimed]', 'data-claimed')));
  const zeta = (await apiState()).customers.find((x) => x.email === 'zeta@fixture.test');
  ok('the real backend recorded the attribution to supervisor-1', zeta?.attribution?.supervisorId === 'ahmed-mohamed' && zeta.attribution.source === 'link');
  // review 2026-09-25 §1.1: the SAME browser, still holding the customer session, signs in as supervisor-1 and writes.
  // The write must be checked against the supervisor session (no_supervisor_csrf), not the customer one found first.
  await bgo(p1, 'supervisor/sign-in/'); await p1.fill('[name=email]', 'sup1@fixture.test'); await p1.fill('[name=password]', 'password123');
  await Promise.all([p1.waitForURL(/dashboard\/$/), p1.click('[data-form=sign-in] button[type=submit]')]);
  await bgo(p1, 'supervisor/leads/'); await p1.waitForSelector('[data-lead-status-select=lead_S1]');
  const leadResp = p1.waitForResponse((r) => r.url().endsWith('/supervisor/me/leads/lead_S1') && r.request().method() === 'PATCH');
  await p1.selectOption('[data-lead-status-select=lead_S1]', 'contacted');
  ok('supervisor portal write (lead status) is accepted while a customer session is also live', (await leadResp).status() === 200, String((await leadResp).status()));
  await bgo(p1, 'supervisor/leads/'); await p1.waitForSelector('[data-lead-status-select=lead_S1]');
  ok('the lead status change persisted', (await p1.inputValue('[data-lead-status-select=lead_S1]')) === 'contacted');
  const custResp = p1.waitForResponse((r) => r.url().endsWith('/auth/sign-out') && !r.url().includes('/supervisor/'));
  await bgo(p1, 'account/sign-out/');
  ok('the customer session in the same browser still writes with its own token (customer sign-out accepted)', (await custResp).status() === 204);
  await c1.close();

  // Supervisor-1 signs in on the SAME backend and sees the new customer + booking
  const { c: c2, p: p2 } = await bctx();
  await bgo(p2, 'supervisor/sign-in/'); await p2.fill('[name=email]', 'sup1@fixture.test'); await p2.fill('[name=password]', 'password123');
  await Promise.all([p2.waitForURL(/dashboard\/$/), p2.click('[data-form=sign-in] button[type=submit]')]);
  await p2.waitForFunction(() => document.querySelector('[data-portal=main] h1'));
  await bgo(p2, 'supervisor/customers/'); await p2.waitForFunction(() => document.querySelector('[data-portal=main] h1'));
  ok('supervisor-1 sees the newly attributed customer end to end', (await text(p2, '[data-portal=main]')).includes('Zeta') || (await p2.locator('tbody tr').count()) >= 2);
  await bgo(p2, 'supervisor/bookings/'); await p2.waitForFunction(() => document.querySelector('[data-portal=main] h1'));
  const rows2 = await p2.locator('tbody tr').count();
  ok('supervisor-1 sees the new booking in their bookings list', rows2 >= 2);
  await c2.close();

  // Supervisor-2 signs in on the SAME backend and must NOT see it
  const { c: c3, p: p3 } = await bctx();
  await bgo(p3, 'supervisor/sign-in/'); await p3.fill('[name=email]', 'sup2@fixture.test'); await p3.fill('[name=password]', 'password123');
  await Promise.all([p3.waitForURL(/dashboard\/$/), p3.click('[data-form=sign-in] button[type=submit]')]);
  await bgo(p3, 'supervisor/customers/'); await p3.waitForFunction(() => document.querySelector('[data-portal=main] h1'));
  ok('supervisor-2 sees none of supervisor-1\'s customers (cross-supervisor isolation, end to end)', !(await text(p3, '[data-portal=main]')).includes('Zeta') && !(await text(p3, '[data-portal=main]')).includes('Alpha'));
  await bgo(p3, `supervisor/customers/?id=${zeta.id}`); await p3.waitForFunction(() => document.querySelector('[data-portal=main] h1'));
  ok('direct id access to another supervisor\'s customer → not-found, not the record', /غير موجود/.test(await text(p3, 'h1')));
  await c3.close();

  await b2.close(); await site.close();
  backend.kill('SIGTERM'); await new Promise((r) => backend.on('close', r)); rmSync(dir, { recursive: true, force: true });
}

const filtered = errs.filter((e) => !/favicon/.test(e));
console.log(`supervisor-portal: ${pass} passed, ${fail} failed, ${filtered.length} console/network problems`);
filtered.slice(0, 10).forEach((e) => console.log('  ✗', e));
process.exit(fail || filtered.length ? 1 : 0);
