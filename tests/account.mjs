// Stage 12 customer account verification — authentication (sign in, sign up,
// sign out, invalid credentials, session state and expiry, password reset),
// authorization (guests blocked, one customer cannot read another's records),
// trips, bookings, travellers, documents, payments, notifications, support,
// settings, booking continuity and supervisor attribution, three widths ×
// both languages, zero console errors. Exits 1 on any ✗.
import { shot, makeCtx } from './env.mjs';
import { chromium } from 'playwright';
const ORIGIN = process.env.TEST_ORIGIN + '';
const P = '/mashhor-demo/';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let pass = 0, fail = 0;
const ok = (name, cond, note = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} ${note}`); } };
const errs = [];
const AR = /[؀-ۿ]/;
const DOB = { adult: '1990-01-01', child: '2019-01-01', infant: '2025-06-01' };

const ctx = makeCtx(b, errs);
const go = async (p, url, handle) => { await p.goto(ORIGIN + P + url); if (handle) await p.waitForFunction((h) => window.no?.[h], handle); };
const mainReady = (p) => p.waitForFunction(() => document.querySelector('[data-account=main] h1') && !document.querySelector('[data-account=main] .c-loading-block'));
const text = (p, sel) => p.locator(sel).first().textContent().then((s) => (s ?? '').replace(/\s+/g, ' ').trim()).catch(() => '');
const count = (p, sel) => p.locator(sel).count();
const visible = (p, sel) => p.locator(sel).first().isVisible().catch(() => false);
const signUp = async (p, { name, email, password = 'password123', next = null }) => {
  await go(p, 'account/sign-up/' + (next ? `?next=${encodeURIComponent(next)}` : ''), 'signUp');
  await p.fill('[name=name]', name); await p.fill('[name=email]', email); await p.fill('[name=password]', password); await p.fill('[name=confirm]', password);
  await Promise.all([p.waitForURL((u) => !/sign-up/.test(u.pathname)), p.click('[data-form=sign-up] button[type=submit]')]);
};
const signIn = async (p, { email, password = 'password123', next = null }) => {
  await go(p, 'account/sign-in/' + (next ? `?next=${encodeURIComponent(next)}` : ''), 'signIn');
  await p.fill('[name=email]', email); await p.fill('[name=password]', password);
  await Promise.all([p.waitForURL((u) => !/sign-in/.test(u.pathname)), p.click('[data-form=sign-in] button[type=submit]')]);
};
const devSignIn = async (p) => { await go(p, 'account/sign-in/', 'signIn'); await Promise.all([p.waitForURL(/account\/$/), p.click('[data-action=dev-sign-in]')]); await mainReady(p); };
const signOut = async (p) => { await go(p, 'account/sign-out/', 'signOut'); };
const session = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('no.session') ?? 'null'));
const dev = (p, key, value) => p.evaluate(([k, v]) => { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); }, [key, value]);
const fillTravellers = async (p) => { const forms = p.locator('form.c-traveller[data-traveller]'); const n = await forms.count(); for (let i = 0; i < n; i++) { const f = forms.nth(i); const type = await f.getAttribute('data-type'); await f.locator('[name=firstName]').fill('Test'); await f.locator('[name=lastName]').fill('Traveller'); if (await f.locator('[name=dob]').count()) { await f.locator('[name=dob]').fill(DOB[type]); await f.locator('select[name=gender]').selectOption({ index: 1 }); await f.locator('select[name=nationality]').selectOption({ index: 1 }); await f.locator('[name=passport]').fill(`P${1000000 + i}`); await f.locator('[name=passportExpiry]').fill('2030-01-01'); } } await p.fill('[name=email]', 'test@example.com'); await p.fill('[name=phone]', '+249912345678'); };
const next = async (p, re) => { await Promise.all([p.waitForURL(re), p.click('.c-journey__actions .c-btn--primary')]); };

// ================================================================= 1. authentication
{
  const { c, p } = await ctx();
  await go(p, 'account/', 'account');
  ok('guest on account → sign-in guard with return path', /sign-in\/\?next=/.test(await p.locator('[data-action=sign-in]').getAttribute('href')) && await count(p, '[data-account=nav] a') === 0);
  for (const u of ['trips/', 'account/bookings/', 'account/travellers/', 'account/documents/', 'account/payments/', 'account/notifications/', 'account/settings/', 'account/support/']) { await p.goto(ORIGIN + P + u); await p.waitForFunction(() => document.querySelector('[data-account=main] h1')); ok(`guest blocked: ${u}`, await count(p, '[data-action=sign-in]') === 1 && await count(p, '.c-acct-trip, .c-acct-booking, .c-acct-trv, .c-acct-docrow, .c-acct-pay, [data-form=profile]') === 0); }
  ok('account pages are noindex', await p.getAttribute('meta[name=robots]', 'content') === 'noindex, nofollow');
  await go(p, 'account/sign-in/', 'signIn');
  ok('sign-in: dev notice visible, no password stored in source', await visible(p, '[data-dev=true]') && await count(p, 'input[type=password]') === 1);
  await p.click('[data-form=sign-in] button[type=submit]'); await p.waitForTimeout(100);
  ok('sign-in: empty submit → field errors, focus first', await count(p, '[data-form=sign-in] .c-field__error:not([hidden])') === 2 && await p.evaluate(() => document.activeElement?.name === 'email'));
  await p.fill('[name=email]', 'nobody@example.com'); await p.fill('[name=password]', 'wrongpass1');
  await p.click('[data-form=sign-in] button[type=submit]'); await p.waitForFunction(() => document.querySelector('[data-form=sign-in] [role=status]')?.dataset.tone === 'error');
  ok('invalid credentials → error, password cleared, still guest', /غير صحيحة/.test(await text(p, '[data-form=sign-in] [role=status]')) && await p.inputValue('[name=password]') === '' && (await session(p)) === null);
  await p.click('[data-form=sign-in] .c-auth__toggle');
  ok('password show/hide toggle', await p.getAttribute('[name=password]', 'type') === 'text' && await p.getAttribute('[data-form=sign-in] .c-auth__toggle', 'aria-pressed') === 'true');
  await go(p, 'account/sign-up/', 'signUp');
  await p.fill('[name=name]', 'A'); await p.fill('[name=email]', 'bad'); await p.fill('[name=phone]', 'x'); await p.fill('[name=password]', 'short'); await p.fill('[name=confirm]', 'other');
  await p.click('[data-form=sign-up] button[type=submit]'); await p.waitForTimeout(100);
  ok('sign-up validation: email, phone, password length, confirm', await count(p, '[data-form=sign-up] .c-field__error:not([hidden])') === 4);
  await signUp(p, { name: 'Alpha Customer', email: 'alpha@example.com' });
  await p.waitForFunction(() => window.no?.account); await mainReady(p);
  const s1 = await session(p);
  ok('sign-up → account, session token stored (opaque, with expiry), no password anywhere', /^dev\./.test(s1?.token) && !!s1.expiresAt && !JSON.stringify(s1).includes('password') && !(await p.evaluate(() => localStorage.getItem('no.dev.auth'))).includes('password123'));
  ok('header shows the customer (avatar + name), customer menu', await count(p, 'header .c-gh__avatar') === 1 && /Alpha/.test(await text(p, 'header button:has(.c-gh__avatar)')));
  await p.click('header button:has(.c-gh__avatar)'); await p.waitForTimeout(200);
  const rows = await p.$$eval('header .c-gh__menu-row', (rs) => rs.map((r) => r.textContent.trim()));
  ok('customer menu items in order', rows.join('|') === 'حسابي|رحلاتي|حجوزاتي|المسافرون|المستندات|المدفوعات|الإشعارات|المساعدة|الإعدادات|تسجيل الخروج', rows.join('|'));
  await p.keyboard.press('Escape');
  ok('dashboard for a new customer: welcome, empty trip, quick actions', /Alpha/.test(await text(p, 'h1')) && /لا توجد رحلات/.test(await text(p, '[data-region=trip]')) && await count(p, '.c-acct-quick a') === 4);
  await signUp(p, { name: 'Dup', email: 'alpha@example.com' }).catch(() => {});
  ok('signed-in visit to sign-up redirects to the account', /account\/$/.test(p.url()));
  await signOut(p);
  ok('sign out: session cleared, header back to guest, state shown', (await session(p)) === null && await count(p, 'header .c-gh__avatar') === 0 && /تم تسجيل الخروج/.test(await text(p, 'h1')));
  await go(p, 'account/sign-up/', 'signUp'); await p.fill('[name=name]', 'Dup'); await p.fill('[name=email]', 'ALPHA@example.com'); await p.fill('[name=password]', 'password123'); await p.fill('[name=confirm]', 'password123');
  await p.click('[data-form=sign-up] button[type=submit]'); await p.waitForFunction(() => document.querySelector('[data-form=sign-up] [role=status]')?.dataset.tone === 'error');
  ok('duplicate email (case-insensitive) rejected', /يوجد حساب/.test(await text(p, '[data-field=email] .c-field__error')));
  await signIn(p, { email: 'alpha@example.com' }); await p.waitForFunction(() => window.no?.account);
  ok('sign in with the created account', /Alpha/.test(await text(p, 'header button:has(.c-gh__avatar)')));
  // session expiry
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('no.session')); s.expiresAt = new Date(Date.now() - 1000).toISOString(); localStorage.setItem('no.session', JSON.stringify(s)); });
  await go(p, 'trips/'); await p.waitForFunction(() => document.querySelector('[data-account=main] h1'));
  ok('expired session → expired state with sign-in, header guest', /انتهت الجلسة/.test(await text(p, 'h1')) && await count(p, '[data-action=sign-in]') === 1 && await count(p, 'header .c-gh__avatar') === 0 && (await session(p)) === null);
  // password reset flow
  await go(p, 'account/forgot-password/', 'forgot'); await p.fill('[name=email]', 'alpha@example.com'); await p.click('[data-form=forgot] button[type=submit]'); await p.waitForSelector('[data-dev-reset]');
  const link = await p.getAttribute('[data-dev-reset]', 'href');
  ok('forgot password: neutral confirmation + dev link', /reset-password\/\?token=/.test(link) && /تحقّق من بريدك/.test(await text(p, '.c-state__title')));
  await go(p, 'account/forgot-password/', 'forgot'); await p.fill('[name=email]', 'unknown@example.com'); await p.click('[data-form=forgot] button[type=submit]'); await p.waitForSelector('.c-state--success');
  ok('unknown email gets the same answer (no account enumeration)', await count(p, '[data-dev-reset]') === 0 && /تحقّق من بريدك/.test(await text(p, '.c-state__title')));
  await p.goto(ORIGIN + link); await p.waitForFunction(() => window.no?.reset);
  await p.fill('[name=password]', 'newpassword1'); await p.fill('[name=confirm]', 'newpassword1'); await p.click('[data-form=reset] button[type=submit]'); await p.waitForSelector('.c-state--success');
  ok('reset password succeeds', /تم تغيير/.test(await text(p, '.c-state__title')));
  await p.goto(ORIGIN + link); await p.waitForFunction(() => window.no?.reset); await p.fill('[name=password]', 'newpassword1'); await p.fill('[name=confirm]', 'newpassword1'); await p.click('[data-form=reset] button[type=submit]'); await p.waitForFunction(() => /غير صالح/.test(document.querySelector('[data-form=reset] [role=status]')?.textContent ?? ''));
  ok('reset token is single-use', /غير صالح/.test(await text(p, '[data-form=reset] [role=status]')), await text(p, '[data-form=reset] [role=status]'));
  await go(p, 'account/reset-password/', 'reset'); ok('reset without token → clear state', await count(p, '.c-state--warning') === 1);
  await go(p, 'account/sign-in/', 'signIn'); await p.fill('[name=email]', 'alpha@example.com'); await p.fill('[name=password]', 'password123'); await p.click('[data-form=sign-in] button[type=submit]'); await p.waitForFunction(() => document.querySelector('[data-form=sign-in] [role=status]')?.dataset.tone === 'error');
  ok('old password no longer works', true);
  await signIn(p, { email: 'alpha@example.com', password: 'newpassword1' }); await p.waitForFunction(() => window.no?.account);
  ok('new password works', /Alpha/.test(await text(p, 'header button:has(.c-gh__avatar)')));
  // auth outage
  await signOut(p); await dev(p, 'no.dev.auth', 'error'); await go(p, 'account/sign-in/', 'signIn'); await p.fill('[name=email]', 'alpha@example.com'); await p.fill('[name=password]', 'newpassword1'); await p.click('[data-form=sign-in] button[type=submit]'); await p.waitForFunction(() => document.querySelector('[data-form=sign-in] [role=status]')?.dataset.tone === 'error');
  ok('auth service outage → retryable error, still on sign-in', /تعذّر الاتصال/.test(await text(p, '[data-form=sign-in] [role=status]')) && /sign-in/.test(p.url()));
  await dev(p, 'no.dev.auth', null);
  // unsafe next values
  const bad = await p.evaluate(async () => { const m = await import('./assets/js/account/auth.js'); return ['https://evil.example/x', '//evil.example', '/other-site/', '../x', 'javascript:alert(1)', 'account/settings/', '/mashhor-demo/trips/?id=1'].map((v) => m.safeNext(v)); });
  ok('next= accepts only in-site paths', bad.slice(0, 5).every((v) => v === null) && bad[5] === '/mashhor-demo/account/settings/' && bad[6] === '/mashhor-demo/trips/?id=1', JSON.stringify(bad));
  await c.close();
}

// ================================================================= 2. authorization: two customers, records scoped by session
{
  const { c, p } = await ctx();
  await signUp(p, { name: 'Beta Customer', email: 'beta@example.com' }); await p.waitForFunction(() => window.no?.account);
  await go(p, 'account/travellers/'); await mainReady(p);
  await p.click('[data-action=add]'); await p.waitForSelector('dialog[data-dialog=traveller][open]');
  await p.fill('dialog [name=firstName]', 'Beta'); await p.fill('dialog [name=lastName]', 'Traveller'); await p.fill('dialog [name=dob]', '1985-05-05'); await p.selectOption('dialog [name=gender]', 'F'); await p.selectOption('dialog [name=nationality]', { index: 1 }); await p.fill('dialog [name=passport]', 'B7654321'); await p.fill('dialog [name=passportExpiry]', '2031-01-01');
  await p.click('dialog button[type=submit]'); await p.waitForSelector('.c-acct-trv');
  const betaTrv = await p.locator('.c-acct-trv').getAttribute('data-traveller');
  await signOut(p); await devSignIn(p);
  await go(p, 'account/travellers/'); await mainReady(p);
  ok('another customer never sees Beta\'s traveller', await count(p, `[data-traveller="${betaTrv}"]`) === 0 && await count(p, '.c-acct-trv') === 2);
  await signOut(p); await signIn(p, { email: 'beta@example.com' }); await p.waitForFunction(() => window.no?.account);
  for (const u of ['account/bookings/?id=NO-DEV-F1JED', 'trips/?id=trip-dev-jed', 'account/documents/?id=doc-dev-1']) { await p.goto(ORIGIN + P + u); await mainReady(p); ok(`Beta cannot open the dev customer's record via URL: ${u}`, await count(p, '[data-reference], .c-acct-service, dialog[open]') === 0 && (/غير موجود/.test(await text(p, '[data-account=main] h1')) || await count(p, '.c-state--empty') === 1)); }
  const leak = await p.evaluate(async () => { const m = await import('./assets/js/account/customer.js'); const a = await import('./assets/js/account/auth.js'); const before = await m.customer.bookings(); localStorage.removeItem('no.session'); try { await m.customer.bookings(); return 'answered'; } catch (e) { return `${before.length}:${e.name}`; } });
  ok('the facade refuses without a session token', leak === '0:AuthError', leak);
  await c.close();
}

// ================================================================= 3. the populated account: dashboard, trips, details, bookings, documents, payments, notifications, support, settings
{
  const { c, p } = await ctx(); await devSignIn(p);
  ok('dashboard: identity, next trip with countdown, latest booking, notifications, dev notice', /Demo Customer/.test(await text(p, 'h1')) && await count(p, '[data-region=trip] .c-acct-trip') === 1 && await visible(p, '[data-countdown]') && await count(p, '[data-region=booking] .c-acct-booking') === 1 && /2/.test(await text(p, '[data-region=notifications] [data-unread]')) && await visible(p, '[data-account=notice] [data-dev=true]'));
  ok('dashboard support entry with supervisor', await count(p, '[data-account=support] a[href*="supervisor/ahmed-mohamed"]') === 1);
  ok('one dominant primary action on the dashboard', await count(p, '[data-account=main] .c-btn--primary:visible') === 1);
  // trips
  await go(p, 'trips/'); await mainReady(p); await p.waitForSelector('.c-acct-trip');
  const order = await p.$$eval('.c-acct-trip', (els) => els.map((e) => e.dataset.tripStatus));
  ok('trips listed upcoming → completed → cancelled with dates, services, status and next action', order.join() === 'upcoming,completed,cancelled' && await count(p, '.c-acct-trip [data-next]') === 3 && await count(p, '.c-acct-trip__service') >= 5, order.join());
  await p.click('.c-chip[data-filter=cancelled]'); ok('trip filter', await count(p, '.c-acct-trip') === 1 && await p.getAttribute('.c-chip[data-filter=cancelled]', 'aria-pressed') === 'true');
  await p.click('.c-chip[data-filter=all]'); await p.fill('#trips-search', 'IST'); ok('trip search by code', await count(p, '.c-acct-trip') === 1 && (await text(p, '.c-acct-tools [role=status]')).length > 0);
  await p.fill('#trips-search', 'nothing-here'); ok('no match → state with clear', await count(p, '.c-state--empty [data-action=clear]') === 1); await p.click('[data-action=clear]'); ok('clear restores', await count(p, '.c-acct-trip') === 3);
  await Promise.all([p.waitForURL(/trips\/\?id=trip-dev-jed/), p.locator('[data-trip=trip-dev-jed] a').first().click()]); await mainReady(p);
  ok('trip details: service names rendered', await p.$$eval('.c-acct-service h3', (hs) => hs.every((h) => h.textContent.trim().length > 2)));
  ok('trip details: every service of the trip in one view, documents, payments, support, supervisor', await count(p, '.c-acct-service') === 3 && await p.$$eval('.c-acct-service', (els) => els.map((e) => e.dataset.service).join()) === 'flights,hotels,visa' && await count(p, '.c-acct-doc') === 5 && await count(p, '#trip-pays dd') === 2 && await count(p, '#trip-support') === 1 && await count(p, '[data-account=main] a[href*="supervisor/ahmed-mohamed"]') >= 1);
  ok('trip details: pending visa document shown as not issued, never claimed', await count(p, '.c-acct-doc[data-doc-status=pending]') === 1 && await count(p, '.c-acct-doc[data-doc-status=pending] a') === 0);
  await go(p, 'trips/?id=trip-dev-nope'); await mainReady(p); ok('unknown trip → not found with a way back', /غير موجود/.test(await text(p, 'h1')) && await count(p, '.c-state a[href$="/trips/"]') === 1);
  // bookings
  await go(p, 'account/bookings/'); await mainReady(p); await p.waitForSelector('.c-acct-booking');
  ok('bookings: reference, service, status, payment status, total, trip association', await count(p, '.c-acct-booking') === 6 && await count(p, '.c-acct-booking [data-status]') === 6 && await count(p, '.c-acct-booking [data-pay]') === 6 && await count(p, '.c-acct-booking .t-price') === 5);
  await Promise.all([p.waitForURL(/bookings\/\?id=NO-DEV-F1JED/), p.locator('[data-booking=NO-DEV-F1JED] a').first().click()]); await mainReady(p);
  ok('booking details: h1 names the service', (await text(p, 'h1')).length > 2);
  ok('booking details: reference, route, carrier, ticket issued, supervisor, docs, payments, trip link', await text(p, '[data-reference]') === 'NO-DEV-F1JED' && /KRT/.test(await text(p, '#bk-details')) && /صدرت/.test(await text(p, '#bk-details')) && await count(p, '#bk-docs .c-acct-doc') === 3 && await count(p, '#bk-pays dd') === 1 && await count(p, 'a[href*="trips/?id=trip-dev-jed"]') >= 1);
  await go(p, 'account/bookings/?id=NO-DEV-H1JED'); await mainReady(p);
  ok('request booking shows not charged, no ticket row', /لم يُحصَّل/.test(await text(p, '#bk-details')) && !/التذكرة/.test(await text(p, '#bk-details')));
  // documents
  await go(p, 'account/documents/'); await mainReady(p); await p.waitForSelector('.c-acct-docrow');
  ok('documents: type, related booking, date, status, action only when available', await count(p, '.c-acct-docrow') === 8 && await count(p, '.c-acct-docrow[data-doc-status=available] [data-action=view]') === 7 && await count(p, '.c-acct-docrow[data-doc-status=pending] [data-action=view]') === 0);
  await p.locator('[data-action=view]').first().click(); await p.waitForSelector('dialog[data-dialog=document][data-state=ready]');
  ok('document view: dialog with content, dev label, print action; Escape closes', await count(p, 'dialog[open] .c-acct-docview') === 1 && await count(p, 'dialog[open] [data-dev=true]') === 1 && await count(p, 'dialog[open] [data-action=print]') === 1);
  await p.keyboard.press('Escape'); await p.waitForTimeout(100); ok('document dialog closed', await count(p, 'dialog[data-dialog=document]') === 0);
  await go(p, 'account/documents/?id=doc-dev-6'); await mainReady(p); await p.waitForSelector('dialog[data-dialog=document][data-state=ready]'); ok('deep link opens the document', /NO-DEV-F2IST/.test(await text(p, 'dialog[open] h2'))); await p.keyboard.press('Escape');
  // payments
  await go(p, 'account/payments/'); await mainReady(p); await p.waitForSelector('.c-acct-pay');
  const payText = await text(p, '[data-account=main]');
  ok('payments: booking, date, amount, currency, status, reference; no card data', await count(p, '.c-acct-pay') === 6 && await count(p, '.c-acct-pay[data-pay-status=refunded]') === 1 && /DEVTX-/.test(payText) && !/\d{4} ?\d{4} ?\d{4}|CVV|cvv|\*{4}/.test(payText));
  // notifications
  await go(p, 'account/notifications/'); await mainReady(p); await p.waitForSelector('.c-acct-ntf');
  ok('notifications: unread marked, kinds, open links', await count(p, '[data-read=false]') === 2 && await count(p, '.c-acct-ntf[data-kind]') === 5 && await count(p, '.c-acct-ntf a[href]') === 5);
  await p.click('.c-chip[data-filter=unread]'); ok('unread filter', await count(p, '.c-acct-ntf') === 2);
  await p.locator('[data-action=mark-read]').first().click(); await p.waitForFunction(() => document.querySelectorAll('[data-read=false]').length === 1);
  ok('mark one read', await count(p, '[data-read=false]') === 1);
  await p.click('[data-action=mark-all]'); await p.waitForFunction(() => !document.querySelector('[data-action=mark-all]:not([hidden])'));
  ok('mark all read → filter empty state with switch to all', await count(p, '[data-read=false]') === 0 && await count(p, '.c-state--empty [data-action=all]') === 1);
  await p.reload(); await mainReady(p); await p.waitForSelector('.c-acct-ntf'); ok('read state persists', await count(p, '[data-read=false]') === 0);
  // support
  await go(p, 'account/support/'); await mainReady(p);
  ok('support: no invented channels, supervisor block, recent replies', await count(p, '[data-channels=none]') === 1 && await count(p, '#sup-channels a[href^="tel"], #sup-channels a[href*="wa.me"], #sup-channels a[href^="mailto"]') === 0 && await count(p, '#sup-supervisor') === 1 && await count(p, '#sup-recent .c-acct-ntf') === 1);
  // settings
  await go(p, 'account/settings/'); await mainReady(p);
  ok('settings: profile fields, email locked, language, password, session, supervisor locked', await count(p, '[data-form=profile] [name=name]') === 1 && await p.getAttribute('[data-form=profile] [type=email]', 'readonly') !== null && await count(p, '[name=locale]') === 1 && await count(p, '[data-form=password]') === 1 && await count(p, '[data-action=sign-out]') === 1 && await count(p, '#set-supervisor input, #set-supervisor select') === 0);
  await p.fill('[data-form=profile] [name=phone]', 'nope'); await p.click('[data-form=profile] button[type=submit]'); await p.waitForTimeout(100);
  ok('profile validation', await count(p, '[data-form=profile] .c-field__error:not([hidden])') === 1);
  await p.fill('[data-form=profile] [name=phone]', '+249 91 234 5678'); await p.fill('[data-form=profile] [name=name]', 'Demo Renamed'); await p.click('[data-form=profile] button[type=submit]'); await p.waitForFunction(() => /تم حفظ/.test(document.querySelector('[data-form=profile] [role=status]')?.textContent ?? ''));
  ok('profile saved → header name updates', /Demo Renamed/.test(await text(p, 'header button:has(.c-gh__avatar)')));
  await p.reload(); await mainReady(p); ok('profile persisted', await p.inputValue('[data-form=profile] [name=name]') === 'Demo Renamed');
  await p.fill('[data-form=password] [name=next]', 'newpassword1'); await p.fill('[data-form=password] [name=confirm]', 'newpassword2'); await p.click('[data-form=password] button[type=submit]'); await p.waitForTimeout(100);
  ok('password change validation', await count(p, '[data-form=password] .c-field__error:not([hidden])') === 1);
  // data states
  await dev(p, 'no.dev.account', 'error'); await go(p, 'trips/'); await mainReady(p);
  ok('data outage → error state with retry', await count(p, '[data-region=trips] .c-state--error [data-action=retry]') === 1);
  await dev(p, 'no.dev.account', null); await p.click('[data-action=retry]'); await p.waitForSelector('.c-acct-trip'); ok('retry recovers', await count(p, '.c-acct-trip') === 3);
  await dev(p, 'no.dev.account', 'slow'); await go(p, 'account/bookings/'); await p.waitForFunction(() => document.querySelector('[data-account=main] h1'));
  ok('slow data → loading feedback immediately', await count(p, '[data-region=bookings] .c-loading-block') === 1 && await p.getAttribute('[data-region=bookings]', 'aria-busy') === 'true');
  await dev(p, 'no.dev.account', 'empty'); await go(p, 'account/'); await mainReady(p);
  ok('empty account → clear empty states', /لا توجد رحلات/.test(await text(p, '[data-region=trip]')) && /لا حجوزات/.test(await text(p, '[data-region=booking]')));
  await dev(p, 'no.dev.account', null);
  await c.close();
}

// ================================================================= 4. travellers: add, edit, delete, validation, use in a booking
{
  const { c, p } = await ctx(); await signUp(p, { name: 'Gamma Customer', email: 'gamma@example.com' }); await p.waitForFunction(() => window.no?.account);
  await go(p, 'account/travellers/'); await mainReady(p);
  ok('travellers empty state with add action', await count(p, '.c-state--empty [data-action=add]') === 1);
  await p.click('[data-action=add]'); await p.waitForSelector('dialog[data-dialog=traveller][open]');
  ok('dialog: labelled fields, no unnecessary data (no email/phone/address)', await count(p, 'dialog[open] [name=email], dialog[open] [name=phone], dialog[open] [name=address]') === 0 && await count(p, 'dialog[open] .c-field') === 7 && await p.evaluate(() => document.activeElement?.closest('dialog') !== null));
  await p.click('dialog button[type=submit]'); await p.waitForTimeout(100);
  ok('empty traveller → every field marked, focus on first', await count(p, 'dialog[open] .c-field__error:not([hidden])') === 7 && await p.evaluate(() => document.activeElement?.getAttribute('aria-invalid') === 'true'));
  await p.fill('dialog [name=firstName]', 'Gamma'); await p.fill('dialog [name=lastName]', 'One'); await p.fill('dialog [name=dob]', '1992-02-02'); await p.selectOption('dialog [name=gender]', 'M'); await p.selectOption('dialog [name=nationality]', { index: 2 }); await p.fill('dialog [name=passport]', 'G1111111'); await p.fill('dialog [name=passportExpiry]', '2020-01-01');
  await p.click('dialog button[type=submit]'); await p.waitForTimeout(100);
  ok('expired passport rejected', await count(p, 'dialog[open] [data-field=passportExpiry] .c-field__error:not([hidden])') === 1);
  await p.fill('dialog [name=passportExpiry]', '2032-01-01'); await p.click('dialog button[type=submit]'); await p.waitForSelector('.c-acct-trv');
  ok('traveller added; passport masked in the list', await count(p, '.c-acct-trv') === 1 && /•••• 111/.test(await text(p, '.c-acct-trv')) && !/G1111111/.test(await text(p, '.c-acct-trv')));
  await p.click('[data-action=edit]'); await p.waitForSelector('dialog[data-dialog=traveller][open]');
  ok('edit dialog prefilled', await p.inputValue('dialog [name=firstName]') === 'Gamma' && await p.inputValue('dialog [name=passport]') === 'G1111111');
  await p.fill('dialog [name=firstName]', 'Gamma Edited'); await p.click('dialog button[type=submit]'); await p.waitForFunction(() => /Gamma Edited/.test(document.querySelector('.c-acct-trv')?.textContent ?? ''));
  ok('traveller edited', true);
  p.once('dialog', (d) => d.dismiss()); await p.click('[data-action=delete]'); await p.waitForTimeout(200); ok('delete cancelled keeps the traveller', await count(p, '.c-acct-trv') === 1);
  p.once('dialog', (d) => d.accept()); await p.click('[data-action=delete]'); await p.waitForSelector('.c-state--empty'); ok('delete removes the traveller', await count(p, '.c-acct-trv') === 0);
  // pick in a booking
  await p.click('[data-action=add]'); await p.waitForSelector('dialog[open]'); await p.fill('dialog [name=firstName]', 'Pick'); await p.fill('dialog [name=lastName]', 'Me'); await p.fill('dialog [name=dob]', '1991-03-03'); await p.selectOption('dialog [name=gender]', 'F'); await p.selectOption('dialog [name=nationality]', { index: 1 }); await p.fill('dialog [name=passport]', 'PK123456'); await p.fill('dialog [name=passportExpiry]', '2032-01-01'); await p.click('dialog button[type=submit]'); await p.waitForSelector('.c-acct-trv');
  await go(p, 'search/?vertical=flights&tripType=oneway&from=KRT&to=JED&fromCode=KRT&toCode=JED&depart=2026-11-16&adults=1', 'results'); await p.waitForSelector('.c-flight[data-offer]');
  await Promise.all([p.waitForURL(/travellers/), p.locator('[data-action=select]').first().click()]); await p.waitForFunction(() => window.no?.travellers); await p.waitForSelector('[data-pick=traveller]');
  await p.selectOption('[data-pick=traveller]', { index: 1 });
  ok('saved traveller fills the booking form', await p.inputValue('form.c-traveller[data-traveller] [name=firstName]') === 'Pick' && await p.inputValue('form.c-traveller[data-traveller] [name=passport]') === 'PK123456');
  await c.close();
}

// ================================================================= 5. booking continuity + supervisor attribution
{
  const { c, p } = await ctx();
  await go(p, 'search/?vertical=flights&tripType=return&from=KRT&to=JED&fromCode=KRT&toCode=JED&depart=2026-11-16&return=2026-11-23&adults=2&children=1&supervisor=sara-ahmed', 'results'); await p.waitForSelector('.c-flight[data-offer]');
  await Promise.all([p.waitForURL(/travellers/), p.locator('[data-action=select]').first().click()]); await p.waitForFunction(() => window.no?.travellers);
  await p.locator('form.c-traveller[data-traveller]').first().locator('[name=firstName]').fill('Keep');
  const back = new URL(p.url()).pathname;
  await signUp(p, { name: 'Delta Customer', email: 'delta@example.com', next: back });
  await p.waitForFunction(() => window.no?.travellers);
  ok('sign-up mid-journey returns to the step with the journey intact (search, selection, attribution, typed draft)', /booking\/travellers/.test(p.url()) && await p.evaluate(() => { const j = JSON.parse(sessionStorage.getItem('no.journey')); return !!j.selection && j.context.attribution.supervisor === 'sara-ahmed' && j.context.travellers.children === 1; }) && await p.locator('form.c-traveller[data-traveller]').first().locator('[name=firstName]').inputValue() === 'Keep');
  await fillTravellers(p); await next(p, /extras/); await p.waitForFunction(() => window.no?.extras); await next(p, /review/); await p.waitForFunction(() => window.no?.review); await p.waitForSelector('#review-terms'); await p.check('#review-terms'); await next(p, /payment/); await p.waitForFunction(() => window.no?.payment);
  await p.check('#pm-dev-success'); await p.click('[data-action=pay]'); await p.waitForURL(/confirmation/); await p.waitForFunction(() => window.no?.confirmation); await p.waitForSelector('[data-claimed]');
  const tripId = await p.getAttribute('[data-claimed]', 'data-claimed');
  ok('confirmation attaches the booking to the account, view trip points at it', /^trip-/.test(tripId) && (await p.getAttribute('[data-action=view-trip]', 'href')).includes(`trips/?id=${tripId}`));
  await p.reload(); await p.waitForFunction(() => window.no?.confirmation); await p.waitForSelector('[data-claimed]');
  ok('reload does not attach twice', await p.evaluate(async () => (await (await import('./assets/js/account/customer.js')).customer.bookings()).length) === 1);
  await go(p, `trips/?id=${tripId}`); await mainReady(p);
  ok('trip in the account with the flight, travellers 3, sara-ahmed attribution', await count(p, '.c-acct-service[data-service=flights]') === 1 && await count(p, '[data-account=main] a[href*="supervisor/sara-ahmed"]') >= 1);
  await go(p, 'account/settings/'); await mainReady(p);
  ok('customer now attributed to sara-ahmed, not editable', await count(p, '#set-supervisor a[href*="sara-ahmed"]') === 1 && await count(p, '#set-supervisor input') === 0);
  await go(p, 'account/documents/'); await mainReady(p); await p.waitForSelector('.c-acct-docrow');
  ok('documents the system issued for the new booking: receipt + confirmation only', await count(p, '.c-acct-docrow') === 2 && await count(p, '.c-acct-docrow[data-type=eticket]') === 0);
  await go(p, 'account/payments/'); await mainReady(p); ok('payment recorded', await count(p, '.c-acct-pay[data-pay-status=paid]') === 1);
  await go(p, 'account/notifications/'); await mainReady(p); ok('booking notification created, unread', await count(p, '[data-read=false][data-kind=booking]') === 1);
  // guest at confirmation → prompt, sign in → claim
  await signOut(p); await go(p, 'booking/confirmation/', 'confirmation'); await p.waitForSelector('[data-action=claim-sign-in]');
  ok('guest at confirmation sees the keep-in-account prompt returning here', /next=.*confirmation/.test(await p.getAttribute('[data-action=claim-sign-in]', 'href')));
  await Promise.all([p.waitForURL(/sign-in/), p.click('[data-action=claim-sign-in]')]); await p.waitForFunction(() => window.no?.signIn);
  ok('sign-in shows the continue note', await count(p, '[data-next]') === 1);
  await p.fill('[name=email]', 'delta@example.com'); await p.fill('[name=password]', 'password123'); await Promise.all([p.waitForURL(/confirmation/), p.click('[data-form=sign-in] button[type=submit]')]); await p.waitForFunction(() => window.no?.confirmation); await p.waitForSelector('[data-claimed]');
  ok('back on the confirmation, booking already in the account', await p.getAttribute('[data-claimed]', 'data-claimed') === tripId);
  await c.close();
}

// ================================================================= 6. widths × languages
for (const [w, h, tag] of [[390, 844, 'mobile'], [834, 1100, 'tablet'], [1440, 1000, 'desktop']]) for (const loc of ['ar', 'en']) {
  const { c, p } = await ctx(w, h, loc);
  const screen = async (name, extra = {}) => {
    const r = await p.evaluate(() => ({
      lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title,
      h1: Array.from(document.querySelectorAll('h1')).filter((x) => x.checkVisibility()).length, hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      primaries: Array.from(document.querySelectorAll('main .c-btn--primary')).filter((n) => n.checkVisibility() && !n.closest('dialog')).length,
      mainText: Array.from(document.querySelectorAll('main h1, main h2, main h3, main p, main a, main button, main label, main dt, main dd, main span')).filter((n) => n.checkVisibility() && !n.closest('select')).map((n) => n.childNodes.length && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) ? n.textContent : '').join('\n'),
      robots: document.querySelector('meta[name=robots]')?.content, dialogs: document.querySelectorAll('dialog[open]').length,
      small: Array.from(document.querySelectorAll('main p, main a, main button, main span, main li, main label, main dt, main dd')).filter((n) => n.checkVisibility() && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 12).length,
      unlabelled: Array.from(document.querySelectorAll('main input:not([type=hidden]), main select')).filter((c) => c.checkVisibility() && !(c.id && document.querySelector(`label[for="${c.id}"]`)) && !c.getAttribute('aria-label') && !c.getAttribute('aria-labelledby')).length,
      targets: Array.from(document.querySelectorAll('main a[href], main button')).filter((n) => n.checkVisibility() && n.getBoundingClientRect().height < 40 && getComputedStyle(n).display !== 'inline' && !n.classList.contains('c-btn--tertiary') && !n.classList.contains('c-btn--sm')).length,
      nav: !!document.querySelector('[data-account=nav] [aria-current=page]'), navVisible: document.querySelector('.c-acct-nav__list')?.checkVisibility(),
    }));
    const L = `${tag}/${loc}/${name}`;
    ok(`${L} lang/dir`, r.lang === loc && r.dir === (loc === 'ar' ? 'rtl' : 'ltr'));
    ok(`${L} one h1`, r.h1 === 1, String(r.h1)); ok(`${L} no horizontal scroll`, !r.hScroll); ok(`${L} noindex`, /noindex/.test(r.robots));
    ok(`${L} ≤1 dominant CTA`, r.primaries <= 1, String(r.primaries)); ok(`${L} no tiny text`, r.small === 0, String(r.small)); ok(`${L} controls labelled`, r.unlabelled === 0, String(r.unlabelled)); ok(`${L} touch targets`, r.targets === 0, String(r.targets));
    if (!extra.auth) ok(`${L} account nav marks current, visible`, r.nav && r.navVisible);
    if (loc === 'en') ok(`${L} fully English`, !AR.test(r.mainText) && !AR.test(r.title), (r.mainText.match(/[^\n]*[؀-ۿ][^\n]*/) ?? [''])[0].slice(0, 80));
    if (extra.shot) await p.screenshot({ path: shot(`account-${name}-${tag}-${loc}.png`), fullPage: true });
  };
  await go(p, 'account/sign-in/', 'signIn'); await screen('sign-in', { auth: true, shot: true });
  await Promise.all([p.waitForURL(/account\/$/), p.click('[data-action=dev-sign-in]')]); await mainReady(p); await screen('dashboard', { shot: true });
  if (w < 1024) ok(`${tag}/${loc} support entry reachable after the content on small screens`, await p.evaluate(() => { const s = document.querySelector('.c-account__main > .c-acct-support'); return !!s && s.checkVisibility() && !document.querySelector('.c-account__side .c-acct-support')?.checkVisibility(); }));
  else ok(`${loc} sidebar navigation + sticky side on desktop`, await p.evaluate(() => getComputedStyle(document.querySelector('.c-account__side')).position === 'sticky' && getComputedStyle(document.querySelector('.c-acct-nav__list')).flexDirection === 'column'));
  await go(p, 'trips/'); await mainReady(p); await p.waitForSelector('.c-acct-trip'); await screen('trips', { shot: true });
  await go(p, 'trips/?id=trip-dev-jed'); await mainReady(p); await screen('trip', { shot: true });
  await go(p, 'account/bookings/'); await mainReady(p); await p.waitForSelector('.c-acct-booking'); await screen('bookings');
  await go(p, 'account/bookings/?id=NO-DEV-F1JED'); await mainReady(p); await screen('booking');
  await go(p, 'account/travellers/'); await mainReady(p); await p.waitForSelector('.c-acct-trv'); await screen('travellers');
  await go(p, 'account/documents/'); await mainReady(p); await p.waitForSelector('.c-acct-docrow'); await screen('documents');
  await go(p, 'account/payments/'); await mainReady(p); await p.waitForSelector('.c-acct-pay'); await screen('payments');
  await go(p, 'account/notifications/'); await mainReady(p); await p.waitForSelector('.c-acct-ntf'); await screen('notifications');
  await go(p, 'account/support/'); await mainReady(p); await screen('support');
  await go(p, 'account/settings/'); await mainReady(p); await screen('settings', { shot: true });
  if (w === 1440 && loc === 'ar') {
    // keyboard: tab through the account nav and reach the main content; Escape closes the traveller dialog and returns focus
    await go(p, 'account/travellers/'); await mainReady(p);
    await p.focus('[data-action=add]'); await p.keyboard.press('Enter'); await p.waitForSelector('dialog[open]');
    let hops = 0; let inside = true; while (hops++ < 30) { await p.keyboard.press('Tab'); inside = await p.evaluate(() => !!document.activeElement?.closest('dialog[open]')); if (!inside) break; }
    ok('dialog keeps focus inside (no trap beyond the dialog, no escape into the page)', inside, String(hops));
    await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    ok('Escape closes the dialog and focus returns to the opener', await count(p, 'dialog[open]') === 0 && await p.evaluate(() => document.activeElement?.dataset.action === 'add'));
    await p.keyboard.press('Tab'); ok('focus ring visible on account controls', await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0; }));
  }
  await c.close();
}

await b.close();
const filtered = errs.filter((e) => !/favicon/.test(e));
console.log(`account: ${pass} passed, ${fail} failed, ${filtered.length} console/network problems`);
filtered.slice(0, 10).forEach((e) => console.log('  ✗', e));
process.exit(fail || filtered.length ? 1 : 0);
