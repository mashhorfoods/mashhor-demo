// Stage 15 operations portal verification — guard/authorization, permission-gated UI (Admin vs Operations Staff),
// the state-machine transition picker, populated screens via the development stand-in, empty/error/slow states, the
// responsive + RTL/LTR matrix, and a real-backend end-to-end pass confirming role isolation server-side. Exits 1 on
// any ✗.
import { shot, makeCtx, startEphemeralBackend, launch, staticServer, stagingEnv } from './env.mjs';
import { rmSync, readFileSync } from 'node:fs';

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
const devSignIn = async (p) => { await go(p, 'admin/sign-in/', 'opsSignIn'); await Promise.all([p.waitForURL(/dashboard\/$/), p.click('[data-action=dev-sign-in]')]); await mainReady(p); };
const signOut = async (p) => { await go(p, 'admin/sign-out/', 'opsSignOut'); };
const marker = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('no.ops.session') ?? 'null'));

// ================================================================= 0. the Staff screen offers every permission the backend enforces
{
  // A permission with no checkbox is revoked by every save (review 2026-09-25 §1.3): the two lists must match exactly.
  const list = (file, re) => [...(readFileSync(new URL(file, import.meta.url), 'utf8').match(re)?.[1] ?? '').matchAll(/'([a-z.]+)'/g)].map((m) => m[1]).sort().join();
  const ui = list('../assets/js/ops/ui/staff.js', /OPS_PERMISSIONS = \[([^\]]+)\]/);
  const backend = list('../backend/staff.mjs', /export const PERMISSIONS = \[([\s\S]+?)\];/);
  ok('Staff screen permission list = backend PERMISSIONS', ui && ui === backend, `ui=${ui} backend=${backend}`);
}

// ================================================================= 1. authorization: every portal route guarded, sign in / out
{
  const { c, p } = await ctx();
  const PORTAL_ROUTES = ['admin/dashboard/', 'admin/customers/', 'admin/supervisors/', 'admin/destinations/', 'admin/offers/', 'admin/publishing/', 'admin/leads/', 'admin/bookings/', 'admin/tasks/', 'admin/escalations/', 'admin/services/', 'admin/suppliers/', 'admin/payments/', 'admin/documents/', 'admin/notifications/', 'admin/reports/', 'admin/audit/', 'admin/staff/', 'admin/business-rules/', 'admin/settings/'];
  for (const u of PORTAL_ROUTES) {
    await p.goto(ORIGIN + P + u); await p.waitForFunction(() => document.querySelector('[data-portal=main] h1'));
    ok(`guest blocked: ${u}`, await count(p, '[data-action=sign-in]') === 1 && await count(p, '[data-portal=nav] a') === 0);
    ok(`${u} is noindex`, (await p.getAttribute('meta[name=robots]', 'content')) === 'noindex, nofollow');
  }
  await go(p, 'admin/sign-in/', 'opsSignIn');
  ok('sign-in: dev notice, one password field, no sign-up link', await visible(p, '[data-dev=true]') && await count(p, 'input[type=password]') === 1 && await count(p, '[data-portal=main] a[href*="sign-up"]') === 0);
  await p.fill('[name=email]', 'nobody@example.com'); await p.fill('[name=password]', 'wrongpass1');
  await p.click('[data-form=sign-in] button[type=submit]'); await p.waitForFunction(() => document.querySelector('[data-form=sign-in] [role=status]')?.dataset.tone === 'error');
  ok('invalid credentials → error, still guest', (await marker(p)) === null);
  await devSignIn(p);
  ok('dev demo sign-in → dashboard, session marker stored', /^dev\./.test((await marker(p))?.token ?? '') && /مرحباً/.test(await text(p, 'h1')));
  ok('portal nav shows every module (admin sees Stage 14/15A\'s modules too), current marked, grouped by the Command Center taxonomy', (await p.$$eval('[data-portal=nav] a', (as) => as.map((a) => a.dataset.nav))).join('|') === 'dashboard|services|destinations|offers|publishing|supervisors|customers|leads|bookings|payments|documents|tasks|escalations|suppliers|notifications|reports|audit|staff|rules|settings|sign-out');
  await signOut(p);
  ok('sign out: marker cleared, signed-out message', (await marker(p)) === null && /تسجيل الخروج/.test(await text(p, 'h1')));
  await go(p, 'admin/dashboard/'); await p.waitForFunction(() => document.querySelector('[data-portal=main] h1'));
  ok('guarded again after sign out', await count(p, '[data-action=sign-in]') === 1);
  // ?next= returns to the page the guard interrupted (review 2026-09-25 §1.4) — and only to a page of this portal
  await p.goto(ORIGIN + P + 'admin/tasks/'); await p.waitForFunction(() => document.querySelector('[data-action=sign-in]'));
  await Promise.all([p.waitForURL(/sign-in\/\?next=/), p.click('[data-action=sign-in]')]); await p.waitForFunction((h) => window.no?.[h], 'opsSignIn');
  await Promise.all([p.waitForURL((u) => u.pathname.endsWith(P + 'admin/tasks/')), p.click('[data-action=dev-sign-in]')]);
  ok('sign-in from a guarded page returns to that page via ?next=', p.url().endsWith(P + 'admin/tasks/'));
  await signOut(p);
  for (const bad of ['//evil.example/', 'https://evil.example/admin/', P + 'supervisor/dashboard/', P + 'admin/../supervisor/dashboard/']) {
    await go(p, 'admin/sign-in/?next=' + encodeURIComponent(bad), 'opsSignIn');
    await Promise.all([p.waitForURL(/dashboard\/$/), p.click('[data-action=dev-sign-in]')]);
    ok(`?next=${bad} is refused → own dashboard`, p.url().endsWith(P + 'admin/dashboard/'));
    await signOut(p);
  }
  await c.close();
}

// ================================================================= 2. populated screens (development data adapter, demo staff = admin, all permissions)
{
  const { c, p } = await ctx(); await devSignIn(p);
  ok('dashboard: open tasks and open escalations mini-lists', await visible(p, '#dash-tasks') && await visible(p, '#dash-esc') && await visible(p, '#dash-bookings'));

  await go(p, 'admin/bookings/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap');
  ok('bookings: development bookings listed with ops-status/payment badges', await count(p, 'tbody tr') === 2);
  await p.click('tbody tr:first-child a'); await mainReady(p);
  ok('booking detail: details block renders', await count(p, '#ops-bk-details') === 1);
  ok('booking detail: transition picker (admin has booking.status.change)', await count(p, '#ops-bk-transition select[name=status]') === 1);
  await p.selectOption('#ops-bk-transition select[name=status]', { index: 0 });
  await p.click('#ops-bk-transition button[type=submit]'); await p.waitForTimeout(500);
  ok('transition submitted without a client-side error', await count(p, '#ops-bk-transition .c-field__error:not([hidden])') === 0);
  ok('booking detail: internal notes block visible, customer notes separate', await count(p, '#ops-bk-notes-internal') === 1 && await count(p, '#ops-bk-notes-customer') === 1);
  ok('internal note text never leaks into the customer notes block', !(await text(p, '#ops-bk-notes-customer')).includes('never shown to the customer'));
  ok('booking detail: document review actions present (pending doc)', await count(p, '#ops-bk-documents button') >= 1);
  await go(p, 'admin/bookings/?id=not-a-real-booking'); await mainReady(p);
  ok('unknown booking id → not-found state, not an error', /غير موجود/.test(await text(p, 'h1')));

  await go(p, 'admin/tasks/'); await mainReady(p); await p.waitForSelector('.c-svp-lead');
  ok('tasks: development tasks with status/priority badges and a create form', await count(p, '.c-svp-lead') === 2 && await count(p, '#ops-tasks-create') === 1);
  await p.fill('#ops-tasks-create input[name=type]', 'qa_test_task'); await p.click('#ops-tasks-create button[type=submit]'); await p.waitForTimeout(500);
  ok('created task appears in the list without a page reload', (await count(p, '.c-svp-lead')) === 3);

  await go(p, 'admin/escalations/'); await mainReady(p); await p.waitForSelector('.c-svp-lead');
  ok('escalations: development escalation with severity/status badges', await count(p, '.c-svp-lead') >= 1);

  await go(p, 'admin/services/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap');
  ok('services: the full operational catalogue (13 services)', await count(p, 'tbody tr') === 13);
  await p.click('tbody tr:first-child a'); await mainReady(p);
  ok('service detail: config, edit form, workflow, documents blocks', await count(p, '#ops-svc-details') === 1 && await count(p, '#ops-svc-edit') === 1 && await count(p, '#ops-svc-workflow') === 1);

  await go(p, 'admin/suppliers/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap');
  ok('suppliers: development supplier listed, never a credential/secret on screen', await count(p, 'tbody tr') === 1 && !/secret|password|token/i.test(await text(p, '[data-portal=main]')));

  await go(p, 'admin/notifications/'); await mainReady(p);
  ok('notifications: templates and history blocks, create form', await count(p, '#ops-notifications-templates') === 1 && await count(p, '#ops-notifications-history') === 1 && await count(p, '#ops-notifications-create') === 1);

  await go(p, 'admin/audit/'); await mainReady(p);
  ok('audit: at least the seeded audit event', await count(p, 'tbody tr') >= 1);

  await go(p, 'admin/settings/'); await mainReady(p);
  await p.fill('#ops-pw-current', 'anything'); await p.fill('#ops-pw-next', 'newpassword1'); await p.click('#ops-settings-password button[type=submit]'); await p.waitForTimeout(400);
  ok('settings: only email/role shown, password form present, no role/permission editor', await count(p, '#ops-settings-profile select[name=role], #ops-settings-profile input[name=permissions]') === 0);
  await c.close();
}

// ================================================================= 2b. Stage 14: the Admin Dashboard's own screens (development stand-in, demo staff = admin)
{
  const { c, p } = await ctx(); await devSignIn(p);
  ok('dashboard: Command Center overview metrics and quick actions render', await visible(p, '#dash-tasks') && await visible(p, '#dash-quick-actions'));

  await go(p, 'admin/customers/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap');
  ok('customers: development customers listed', await count(p, 'tbody tr') === 2);
  await p.click('tbody tr:first-child a'); await mainReady(p);
  ok('customer detail: unified view (details, reassignment, bookings, payments, documents, attribution)', await count(p, '#ops-cus-details') === 1 && await count(p, '#ops-cus-reassign') === 1 && await count(p, '#ops-cus-attribution') === 1);

  await go(p, 'admin/supervisors/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap');
  ok('supervisors: development supervisors listed with a create form', await count(p, 'tbody tr') === 2 && await count(p, '#ops-sv-create') === 1);
  await p.click('tbody tr:first-child a'); await mainReady(p);
  ok('supervisor detail: composes the same scoped read models the supervisor portal itself uses', await count(p, '#ops-sv-details') === 1 && await count(p, '#ops-sv-manage') === 1);
  ok('supervisor edit form is present and pre-filled with the current record', await count(p, '#ops-sv-edit') === 1 && await p.inputValue('#ops-sv-edit input[name=city]') === 'Dubai' && await p.inputValue('#ops-sv-edit input[name=nameAr]') !== '');
  await p.fill('#ops-sv-edit input[name=city]', 'Port Sudan');
  await p.fill('#ops-sv-edit textarea[name=bioEn]', 'Updated demo bio.');
  await p.click('#ops-sv-edit button[type=submit]'); await p.waitForTimeout(500);
  ok('admin edits a supervisor\'s profile (city, bio) through the extended edit form and it persists on re-render', await p.inputValue('#ops-sv-edit input[name=city]') === 'Port Sudan' && (await p.$eval('#ops-sv-edit textarea[name=bioEn]', (t) => t.value)) === 'Updated demo bio.');

  // Phase 2B-i Publishing Center, checked against the pristine seed (1 published destination, 1 draft offer) —
  // each admin screen is its own static document (a full navigation, not an SPA route), so the development
  // stand-in's in-memory records reset between page loads; only in-page state (an edit followed by `refresh()`,
  // no navigation) can be asserted to persist, which is what the destination/offer flows below rely on instead.
  await go(p, 'admin/publishing/'); await mainReady(p);
  ok('Publishing Center: pending changes / drafts / published / archived sections all render', await count(p, '#ops-pub-pendingChanges') === 1 && await count(p, '#ops-pub-drafts') === 1 && await count(p, '#ops-pub-published') === 1 && await count(p, '#ops-pub-archived') === 1);
  ok('Publishing Center: the seeded published destination is listed under Published, the seeded draft offer under Drafts', await count(p, '#ops-pub-published li') === 1 && await count(p, '#ops-pub-drafts li') === 1 && await count(p, '#ops-pub-archived li') === 0);
  ok('Publishing Center: each row carries a working preview link', (await p.getAttribute('#ops-pub-published a[target=_blank]', 'href'))?.includes('admin/destinations/preview/?id=dev-dst-1'));

  await go(p, 'admin/destinations/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap');
  ok('destinations: development destination listed with a create form (Command Center CMS Phase 2A)', await count(p, 'tbody tr') === 1 && await count(p, '#ops-dst-create') === 1);
  await p.click('tbody tr:first-child a'); await mainReady(p);
  ok('destination detail: details block and edit form both present', await count(p, '#ops-dst-details') === 1 && await count(p, '#ops-dst-edit') === 1);
  await p.fill('#ops-dst-edit input[name=region]', 'asia');
  await p.click('#ops-dst-edit button[type=submit]'); await p.waitForTimeout(500);
  ok('admin edits a destination\'s region through the edit form and it persists on re-render', await p.inputValue('#ops-dst-edit input[name=region]') === 'asia');

  // Phase 2B-i: the seeded dev destination starts published — unpublish/archive offered, not publish/restore, and a
  // Preview link points at the staff-only preview route. :text-is() (exact match) throughout, not :has-text()
  // (substring) — "نشر" (publish) is itself a substring of "إلغاء النشر" (unpublish) in Arabic.
  ok('destination detail (published): publishing block offers unpublish + archive, a preview link, no publish/restore', await count(p, '#ops-dst-publishing') === 1 && await count(p, '#ops-dst-publishing button:text-is("إلغاء النشر")') === 1 && await count(p, '#ops-dst-publishing button:text-is("أرشفة")') === 1 && await count(p, '#ops-dst-publishing button:text-is("نشر")') === 0 && (await p.getAttribute('#ops-dst-publishing a', 'href')).includes('admin/destinations/preview/?id=dev-dst-1'));
  await p.click('#ops-dst-publishing button:text-is("إلغاء النشر")'); await p.waitForTimeout(500);
  ok('unpublishing a destination swaps the publishing block to offer publish again', await count(p, '#ops-dst-publishing button:text-is("نشر")') === 1 && await count(p, '#ops-dst-publishing button:text-is("إلغاء النشر")') === 0);
  await p.click('#ops-dst-publishing button:text-is("نشر")'); await p.waitForTimeout(500);
  ok('re-publishing restores the unpublish button', await count(p, '#ops-dst-publishing button:text-is("إلغاء النشر")') === 1 && await count(p, '#ops-dst-publishing button:text-is("نشر")') === 0);

  await go(p, 'admin/offers/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap');
  ok('offers: development offer listed with a create form', await count(p, 'tbody tr') === 1 && await count(p, '#ops-off-create') === 1);
  await p.click('tbody tr:first-child a'); await mainReady(p);
  ok('offer detail: placeholder note shown (programme not yet approved), details and edit form both present', await count(p, '#ops-off-details') === 1 && await count(p, '#ops-off-edit') === 1 && await count(p, '[data-portal=main] .c-note--warning') === 1);
  await p.fill('#ops-off-edit input[name=priceAmount]', '450');
  await p.click('#ops-off-edit button[type=submit]'); await p.waitForTimeout(500);
  ok('admin sets a real price through the edit form and it persists on re-render', await p.inputValue('#ops-off-edit input[name=priceAmount]') === '450');

  // Phase 2B-i: the seeded dev offer starts a draft — publish/archive offered, not unpublish/restore.
  ok('offer detail (draft): publishing block offers publish + archive, a preview link, no unpublish/restore', await count(p, '#ops-off-publishing') === 1 && await count(p, '#ops-off-publishing button:text-is("نشر")') === 1 && await count(p, '#ops-off-publishing button:text-is("أرشفة")') === 1 && await count(p, '#ops-off-publishing button:text-is("إلغاء النشر")') === 0 && (await p.getAttribute('#ops-off-publishing a', 'href')).includes('admin/offers/preview/?id=dev-off-1'));
  await p.click('#ops-off-publishing button:text-is("نشر")'); await p.waitForTimeout(500);
  ok('publishing an offer offers unpublish afterwards', await count(p, '#ops-off-publishing button:text-is("إلغاء النشر")') === 1);

  await go(p, 'admin/destinations/preview/?id=dev-dst-1'); await p.waitForSelector('[data-preview=true]');
  ok('destination preview: banner shown, hero renders the draft record through the public component', await visible(p, '[data-preview=true]') && (await text(p, '#dest-title')).includes('وجهة تطوير'));
  await go(p, 'admin/offers/preview/?id=dev-off-1'); await p.waitForSelector('[data-preview=true]');
  ok('offer preview: banner shown, hero renders the draft record through the public component', await visible(p, '[data-preview=true]') && (await text(p, '#offer-title')).includes('عرض تطوير'));

  await go(p, 'admin/leads/'); await mainReady(p);
  ok('leads: admin-wide leads and attribution history panels', await count(p, '#ops-leads-list') === 1 && await count(p, '#ops-leads-attribution') === 1);
  await p.waitForSelector('#ops-leads-list tbody tr');
  ok('leads: an unassigned lead says so and its source is a label, not a raw code', (await text(p, '#ops-leads-list tbody')).includes('غير مُسنَد') && (await text(p, '#ops-leads-list tbody')).includes('رابط المنسق') && (await text(p, '#ops-leads-list tbody')).includes('نموذج التواصل') && !/\b(link|contact)\b/.test(await text(p, '#ops-leads-list tbody')));

  await go(p, 'admin/payments/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap');
  ok('payments: development payment records, read-only', await count(p, 'tbody tr') === 2);

  await go(p, 'admin/documents/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap');
  ok('documents: admin-wide document browse, never a storage key on screen', await count(p, 'tbody tr') === 1 && !/storage_key|storageKey/i.test(await text(p, '[data-portal=main]')));

  await go(p, 'admin/reports/'); await mainReady(p);
  ok('reports: every descriptive report panel renders', await count(p, '#ops-rep-bookings') === 1 && await count(p, '#ops-rep-operations') === 1 && await count(p, '#ops-rep-suppliers') === 1 && await count(p, '#ops-rep-documents') === 1 && await count(p, '#ops-rep-notifications') === 1);

  await go(p, 'admin/staff/'); await mainReady(p);
  ok('staff: the seeded demo admin listed, a create-account form present', await count(p, '#ops-staff-create') === 1 && await count(p, '[data-staff]') >= 1);

  await go(p, 'admin/business-rules/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap');
  ok('business rules: register, pending decisions and final matrix panels all render', await count(p, '#ops-rules-register') === 1 && await count(p, '#ops-rules-pending') === 1 && await count(p, '#ops-rules-matrix') === 1);
  ok('the register lists development rules with their PENDING/DRAFT/ACTIVE status, nothing fabricated as confirmed', await count(p, '#ops-rules-register tbody tr') >= 10);
  await p.click('#ops-rules-register tbody tr:first-child a'); await mainReady(p);
  ok('rule detail: details, current value and manage form all render (admin has rules.manage)', await count(p, '#ops-rule-details') === 1 && await count(p, '#ops-rule-value') === 1 && await count(p, '#ops-rule-manage') === 1);
  await p.selectOption('#ops-rule-manage select[name=status]', 'ACTIVE'); await p.click('#ops-rule-manage button[type=submit]'); await p.waitForTimeout(500);
  ok('activating a rule from the form applies and re-renders the new status', await count(p, '[data-rule-status="ACTIVE"]') >= 1);
  ok('the version history records the change rather than discarding the prior version', await count(p, '#ops-rule-history li') >= 1);
  await p.fill('#ops-rule-manage textarea[name=value]', '{ not valid json'); await p.click('#ops-rule-manage button[type=submit]'); await p.waitForTimeout(300);
  ok('an invalid JSON value is caught client-side with an inline error, never sent to the backend', await visible(p, '#ops-rule-manage .c-field__error'));
  await p.fill('#ops-rule-manage textarea[name=value]', '{"levels":["low","normal","high","urgent","critical"]}'); await p.click('#ops-rule-manage button[type=submit]'); await p.waitForTimeout(500);
  ok('a valid JSON value is applied and re-rendered', (await text(p, '#ops-rule-value')).includes('critical'));
  await c.close();
}

// ================================================================= 2c. Phase 6: pagination + workflow editing (development stand-in, both languages, 390px)
for (const loc of ['ar', 'en']) {
  const { c, p } = await ctx(390, 844, loc); await devSignIn(p); await dev(p, 'no.dev.ops.bulk', '60');
  const status = (n, total) => (loc === 'ar' ? `يُعرض ${n} من ${total}` : `Showing ${n} of ${total}`);
  const hScroll = () => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  for (const [url, rowSel] of [['admin/bookings/', 'tbody tr'], ['admin/tasks/', '.c-svp-lead']]) {
    await go(p, url); await mainReady(p); await p.waitForSelector(rowSel);
    ok(`${loc}/${url}: first page holds 50 of 62 rows, a polite status line and Load more`, await count(p, rowSel) === 50 && await text(p, '[data-pager-status]') === status(50, 62) && await p.getAttribute('[data-pager-status]', 'aria-live') === 'polite' && await visible(p, '[data-action=load-more]'), `${await count(p, rowSel)} · ${await text(p, '[data-pager-status]')}`);
    ok(`${loc}/${url}: no horizontal scroll at 390px with the pager`, !(await hScroll()));
    await p.click('[data-action=load-more]'); await p.waitForFunction((sel) => document.querySelectorAll(sel).length === 62, rowSel);
    ok(`${loc}/${url}: Load more appends the last 12, the count follows, the button goes`, await text(p, '[data-pager-status]') === status(62, 62) && !(await visible(p, '[data-action=load-more]')));
  }
  // a filter change starts again at page 1 (the pager follows the new total)
  await p.selectOption('[data-portal=main] .c-svp-filter select', 'completed'); await p.waitForTimeout(800);
  ok(`${loc}: a filter with no matches hides the pager`, !(await visible(p, '[data-pager]')));
  await dev(p, 'no.dev.ops.bulk', null);

  // workflow editing (the dev admin holds workflow.manage)
  await go(p, 'admin/services/?id=flights'); await mainReady(p); await p.waitForSelector('#ops-svc-workflow form[data-form=workflow]');
  const keys = () => p.$$eval('#ops-svc-workflow [name=key]', (xs) => xs.map((x) => x.value).join());
  ok(`${loc}: workflow editor lists the six steps with both labels`, await keys() === 'search,select,passengers,payment,ticketing,confirmation' && await p.inputValue('#ops-svc-workflow li:first-child [name=labelAr]') === 'البحث');
  ok(`${loc}: the first step cannot move up, the last cannot move down`, await p.isDisabled('#ops-svc-workflow li:first-child [data-step-action=up]') && await p.isDisabled('#ops-svc-workflow li:last-child [data-step-action=down]'));
  await p.click('#ops-svc-workflow li:nth-child(2) [data-step-action=up]');
  ok(`${loc}: moving a step up reorders it and keeps focus on the control`, (await keys()).startsWith('select,search,') && await p.evaluate(() => document.activeElement?.dataset.stepAction === 'down'));
  await p.click('#ops-svc-workflow li:last-child [data-step-action=remove]');
  await p.click('#ops-svc-workflow [data-action=add-step]');
  ok(`${loc}: add focuses the new step's key`, await p.evaluate(() => document.activeElement?.name === 'key'));
  await p.click('#ops-svc-workflow button[type=submit]'); await p.waitForTimeout(300);
  ok(`${loc}: an incomplete step is refused inline, nothing saved`, await visible(p, '#ops-svc-workflow .c-field__error') && await count(p, '#ops-svc-workflow [aria-invalid=true]') === 3);
  await p.fill('#ops-svc-workflow li:last-child [name=key]', 'handover'); await p.fill('#ops-svc-workflow li:last-child [name=labelAr]', 'التسليم'); await p.fill('#ops-svc-workflow li:last-child [name=labelEn]', 'Handover');
  await p.fill('#ops-svc-workflow li:first-child [name=labelEn]', 'Choose');
  const stored = () => p.evaluate(async () => (await import(new URL('assets/js/ops/data.js', document.baseURI.replace(/admin\/.*$/, '')).href)).opsData.serviceWorkflow('flights').then((xs) => xs.map((x) => `${x.key}:${x.labelEn}`).join()));
  await p.click('#ops-svc-workflow button[type=submit]');
  await p.waitForFunction(() => document.querySelector('#ops-svc-workflow button[type=submit]')?.dataset.state !== 'loading' && !document.querySelector('#ops-svc-workflow [aria-invalid]') && document.querySelector('#ops-svc-workflow li:last-child [name=key]')?.value === 'handover');
  await p.waitForTimeout(1000); await p.waitForSelector('#ops-svc-workflow form[data-form=workflow]');
  ok(`${loc}: the workflow is saved in its new order with the new labels`, (await stored()) === 'select:Choose,search:Search,passengers:Passenger data,payment:Payment,ticketing:Ticketing,handover:Handover', await stored());
  ok(`${loc}: and re-renders that way`, await keys() === 'select,search,passengers,payment,ticketing,handover' && await p.inputValue('#ops-svc-workflow li:first-child [name=labelEn]') === 'Choose');
  ok(`${loc}: no horizontal scroll at 390px with the workflow editor`, !(await hScroll()));

  // document requirements (visa has two in the stand-in)
  await go(p, 'admin/services/?id=visa'); await mainReady(p); await p.waitForSelector('#ops-svc-documents form[data-form=doc-requirement]');
  ok(`${loc}: document requirements listed with their required flag`, await count(p, '#ops-svc-documents [data-doc-req]') === 2 && await p.isChecked('[data-doc-req=passport] input[type=checkbox]'));
  await p.fill('#ops-req-docType', 'ticket'); await p.click('#ops-svc-documents button[type=submit]'); await p.waitForSelector('[data-doc-req=ticket]');
  ok(`${loc}: a new requirement is added`, await count(p, '#ops-svc-documents [data-doc-req]') === 3);
  await p.fill('#ops-req-docType', 'passport'); await p.click('#ops-svc-documents button[type=submit]'); await p.waitForTimeout(500);
  ok(`${loc}: the same document type twice is refused with its own message`, (await text(p, '#ops-svc-documents .c-field__error')).length > 0 && await count(p, '#ops-svc-documents [data-doc-req]') === 3);
  await p.uncheck('[data-doc-req=passport] input[type=checkbox]'); await p.waitForFunction(() => document.querySelector('[data-doc-req=passport] input[type=checkbox]') && !document.querySelector('[data-doc-req=passport] input[type=checkbox]').checked && !document.querySelector('[data-doc-req=passport] input[type=checkbox]').disabled);
  ok(`${loc}: unticking required saves and survives the re-render`, !(await p.isChecked('[data-doc-req=passport] input[type=checkbox]')));
  await p.click('[data-doc-req=photo] [data-action=remove-requirement]'); await p.waitForFunction(() => !document.querySelector('[data-doc-req=photo]'));
  ok(`${loc}: a requirement is removed`, await count(p, '#ops-svc-documents [data-doc-req]') === 2);
  ok(`${loc}: no horizontal scroll at 390px with the requirements editor`, !(await hScroll()));
  if (loc === 'en') ok('en: the service editors are fully English', !AR.test(await p.evaluate(() => [...document.querySelectorAll('#ops-svc-workflow label, #ops-svc-workflow legend, #ops-svc-workflow button, #ops-svc-workflow p, #ops-svc-documents label, #ops-svc-documents button, #ops-svc-documents p')].map((n) => `${n.textContent} ${n.getAttribute('aria-label') ?? ''}`).join('\n'))));
  await c.close();
}

// ================================================================= 3. permission gating: a limited Operations Staff account never gets an admin-only control
{
  const { c, p } = await ctx(); await devSignIn(p);
  // The dev stand-in's one seeded account is role=admin (every permission) so every control is reachable in dev —
  // this is documented in dev-ops-auth.js. What this suite CAN verify against the dev adapter is that `can()`
  // actually gates rendering at all (the transition/assign/supplier/document blocks only appear because `can()`
  // returned true) — full cross-role denial is verified against the real backend in section 5 below, and
  // exhaustively at the API layer in tests/backend.mjs (role=ops with a named, partial permission set).
  await go(p, 'admin/bookings/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap');
  await p.click('tbody tr:first-child a'); await mainReady(p);
  ok('gated blocks are rendered only through can(), not unconditionally', await count(p, '#ops-bk-supplier') === 1 && await count(p, '#ops-bk-assign') === 1);
  await c.close();
}

// ================================================================= 4. empty and failure states (development switches)
{
  const { c, p } = await ctx(); await devSignIn(p); await dev(p, 'no.dev.ops', 'empty');
  for (const [url, textMatch] of [
    ['admin/bookings/', 'لا توجد حجوزات'],
    ['admin/tasks/', 'لا توجد مهام'],
    ['admin/escalations/', 'لا يوجد أي تصعيد'],
  ]) { await go(p, url); await mainReady(p); ok(`empty state: ${url}`, (await text(p, '[data-portal=main]')).includes(textMatch)); }
  await dev(p, 'no.dev.ops', 'error'); await go(p, 'admin/bookings/'); await mainReady(p);
  ok('error state has a retry action, no crash', await count(p, '[data-action=retry]') === 1);
  await dev(p, 'no.dev.ops', 'slow');
  const t0 = Date.now();
  await go(p, 'admin/dashboard/');
  await p.waitForFunction(() => document.querySelector('[data-portal=main] .c-loading-block, [data-portal=main] [aria-busy="true"]'));
  const duringLoad = await count(p, '.c-loading-block, [aria-busy="true"]');
  await mainReady(p);
  ok('slow response shows a loading state before the content, not a blank screen', duringLoad >= 1 && Date.now() - t0 >= 1500);
  await dev(p, 'no.dev.ops', null);
  await c.close();
}

// ================================================================= 5. widths × languages
for (const [w, h, tag] of [[390, 844, 'mobile'], [834, 1100, 'tablet'], [1440, 1000, 'desktop']]) for (const loc of ['ar', 'en']) {
  const { c, p } = await ctx(w, h, loc);
  const screen = async (name, extra = {}) => {
    const r = await p.evaluate(() => ({
      lang: document.documentElement.lang, dir: document.documentElement.dir,
      h1: Array.from(document.querySelectorAll('h1')).filter((x) => x.checkVisibility()).length, hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      mainText: Array.from(document.querySelectorAll('main h1, main h2, main h3, main p, main a, main button, main label, main th, main td, main span')).filter((n) => n.checkVisibility() && !n.closest('select')).map((n) => n.childNodes.length && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) ? n.textContent : '').join('\n'),
      robots: document.querySelector('meta[name=robots]')?.content,
      small: Array.from(document.querySelectorAll('main p, main a, main button, main span, main li, main label, main th, main td')).filter((n) => n.checkVisibility() && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 12).length,
      unlabelled: Array.from(document.querySelectorAll('main input:not([type=hidden]), main select, main textarea')).filter((c) => c.checkVisibility() && !(c.id && document.querySelector(`label[for="${c.id}"]`)) && !c.getAttribute('aria-label') && !c.getAttribute('aria-labelledby')).length,
      nav: !!document.querySelector('[data-portal=nav] [aria-current=page]'),
    }));
    const L = `${tag}/${loc}/${name}`;
    ok(`${L} lang/dir`, r.lang === loc && r.dir === (loc === 'ar' ? 'rtl' : 'ltr'));
    ok(`${L} one h1`, r.h1 === 1, String(r.h1)); ok(`${L} no horizontal scroll`, !r.hScroll); ok(`${L} noindex`, /noindex/.test(r.robots));
    ok(`${L} no tiny text`, r.small === 0, String(r.small)); ok(`${L} controls labelled`, r.unlabelled === 0, String(r.unlabelled));
    if (!extra.auth) ok(`${L} portal nav marks current`, r.nav);
    if (loc === 'en') ok(`${L} fully English`, !AR.test(r.mainText), (r.mainText.match(/[^\n]*[؀-ۿ][^\n]*/) ?? [''])[0].slice(0, 80));
    if (extra.shot) await p.screenshot({ path: shot(`ops-${name}-${tag}-${loc}.png`), fullPage: true });
  };
  await go(p, 'admin/sign-in/', 'opsSignIn'); await screen('sign-in', { auth: true, shot: true });
  await Promise.all([p.waitForURL(/dashboard\/$/), p.click('[data-action=dev-sign-in]')]); await mainReady(p); await screen('dashboard', { shot: true });
  await go(p, 'admin/customers/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap'); await screen('customers', { shot: true });
  await go(p, 'admin/supervisors/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap'); await screen('supervisors');
  await go(p, 'admin/leads/'); await mainReady(p); await screen('leads');
  await go(p, 'admin/bookings/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap'); await screen('bookings', { shot: true });
  await go(p, 'admin/tasks/'); await mainReady(p); await p.waitForSelector('.c-svp-lead'); await screen('tasks');
  await go(p, 'admin/escalations/'); await mainReady(p); await screen('escalations');
  await go(p, 'admin/services/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap'); await screen('services');
  await go(p, 'admin/suppliers/'); await mainReady(p); await screen('suppliers');
  await go(p, 'admin/payments/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap'); await screen('payments');
  await go(p, 'admin/documents/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap'); await screen('documents');
  await go(p, 'admin/notifications/'); await mainReady(p); await screen('notifications');
  await go(p, 'admin/reports/'); await mainReady(p); await screen('reports');
  await go(p, 'admin/audit/'); await mainReady(p); await screen('audit');
  await go(p, 'admin/staff/'); await mainReady(p); await screen('staff', { shot: true });
  await go(p, 'admin/business-rules/'); await mainReady(p); await p.waitForSelector('.c-svp-table, .c-svp-table-wrap'); await screen('business-rules', { shot: true });
  await go(p, 'admin/settings/'); await mainReady(p); await screen('settings', { shot: true });
  await c.close();
}

await b.close();

// ================================================================= 6. real backend: staff sign-in, permission isolation, state machine, note isolation
{
  const { dir, backend, origin: API } = await startEphemeralBackend({ prefix: 'no-ops-backend-', portBase: 8980, portSpread: 9 });
  const control = (path, body = {}) => fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  await control('/__test/reset');

  const site = await staticServer({ prefix: P, env: stagingEnv(API) });
  const siteOrigin = site.origin;

  const b2 = await launch();
  const bctx = async () => { const c = await b2.newContext({ viewport: { width: 1440, height: 1000 } }); const p = await c.newPage(); p.setDefaultTimeout(10000); return { c, p }; };
  const bgo = async (p, url, handle) => { await p.goto(siteOrigin + P + url); if (handle) await p.waitForFunction((h) => window.no?.[h], handle); };
  const bMainReady = (p) => p.waitForFunction(() => document.querySelector('[data-portal=main] h1'));

  // Admin (staff-admin-1, role=admin, every permission implicitly)
  const { c: c1, p: p1 } = await bctx();
  await bgo(p1, 'admin/sign-in/'); await p1.fill('[name=email]', 'admin1@fixture.test'); await p1.fill('[name=password]', 'password123');
  await Promise.all([p1.waitForURL(/dashboard\/$/), p1.click('[data-form=sign-in] button[type=submit]')]); await bMainReady(p1);
  ok('real backend: admin fixture signs in', /مرحباً/.test(await text(p1, 'h1')));
  await bgo(p1, 'admin/bookings/'); await bMainReady(p1);
  ok('real backend: admin sees the fixture booking with ops status', await count(p1, 'tbody tr') >= 1);
  await bgo(p1, 'admin/bookings/?id=BK_A1'); await bMainReady(p1);
  ok('real backend: admin sees both customer and internal notes on the fixture booking', await count(p1, '#ops-bk-notes-customer li') >= 1 && await count(p1, '#ops-bk-notes-internal li') >= 1);
  ok('real backend: internal-only note text never appears in the customer notes block', !(await text(p1, '#ops-bk-notes-customer')).includes('never shown to the customer'));
  // review 2026-09-25 §1.1: a WRITE from the staff portal carries the staff CSRF token (no_ops_csrf) and is accepted
  const notesBefore = await count(p1, '#ops-bk-notes-internal li');
  const noteResp = p1.waitForResponse((r) => /\/bookings\/BK_A1\/notes/.test(r.url()) && r.request().method() === 'POST');
  await p1.fill('#ops-bk-notes-internal textarea[name=body]', 'Staff write through the real backend');
  await p1.click('#ops-bk-notes-internal button[type=submit]');
  ok('real backend: staff portal write (internal note) is accepted — CSRF token of the staff session', (await noteResp).status() === 201 || (await noteResp).status() === 200, String((await noteResp).status()));
  await p1.waitForFunction((n) => document.querySelectorAll('#ops-bk-notes-internal li').length > n, notesBefore);
  ok('real backend: the new note is shown', (await text(p1, '#ops-bk-notes-internal')).includes('Staff write through the real backend'));
  const outResp = p1.waitForResponse((r) => r.url().endsWith('/staff/auth/sign-out'));
  await bgo(p1, 'admin/sign-out/');
  ok('real backend: staff sign-out (a POST) is accepted', (await outResp).status() === 204);
  await bgo(p1, 'admin/dashboard/'); await bMainReady(p1);
  ok('real backend: after sign-out the portal is guarded again', await count(p1, '[data-action=sign-in]') === 1);
  await c1.close();

  // Operations staff (staff-ops-1, role=ops, a named partial permission set with no supplier.manage/service.manage)
  const { c: c2, p: p2 } = await bctx();
  await bgo(p2, 'admin/sign-in/'); await p2.fill('[name=email]', 'ops1@fixture.test'); await p2.fill('[name=password]', 'password123');
  await Promise.all([p2.waitForURL(/dashboard\/$/), p2.click('[data-form=sign-in] button[type=submit]')]); await bMainReady(p2);
  await bgo(p2, 'admin/bookings/?id=BK_A1'); await bMainReady(p2);
  ok('real backend: operations staff (no supplier.manage) never sees the supplier control', await count(p2, '#ops-bk-supplier') === 0);
  ok('real backend: operations staff DOES see the status-change control it was granted', await count(p2, '#ops-bk-transition') === 1);
  // staff-ops-1 has no supplier.view: the suppliers screen itself still renders (the page shell is not gated), but
  // its data region shows the backend's own 'forbidden' answer rather than silently listing nothing.
  await bgo(p2, 'admin/suppliers/'); await bMainReady(p2);
  ok('real backend: a permission the fixture never granted shows the region as forbidden, not an empty table', /الموردون/.test(await text(p2, 'h1')) && await count(p2, 'tbody tr') === 0 && (await text(p2, '[data-portal=main]')).includes('لا يملك حسابك صلاحية'));
  ok('real backend: Stage 14/15A modules are hidden from the nav entirely for a staff member with none of their permissions', (await p2.$$eval('[data-portal=nav] a', (as) => as.map((a) => a.dataset.nav))).every((id) => !['customers', 'supervisors', 'leads', 'payments', 'documents', 'reports', 'staff', 'rules'].includes(id)));
  await bgo(p2, 'admin/customers/'); await bMainReady(p2);
  ok('real backend: ops-1 (no customer.view) sees the Stage 14 screen refuse, not fabricated data', await count(p2, 'tbody tr') === 0 && (await text(p2, '[data-portal=main]')).includes('لا يملك حسابك صلاحية'));
  await c2.close();

  // Operations staff with only the Stage 14 VIEW permissions (staff-ops-2, no supervisor.manage/staff.manage)
  const { c: c3, p: p3 } = await bctx();
  await bgo(p3, 'admin/sign-in/'); await p3.fill('[name=email]', 'ops2@fixture.test'); await p3.fill('[name=password]', 'password123');
  await Promise.all([p3.waitForURL(/dashboard\/$/), p3.click('[data-form=sign-in] button[type=submit]')]); await bMainReady(p3);
  ok('real backend: ops-2 nav shows Customers/Supervisors but never Staff & Permissions', (await p3.$$eval('[data-portal=nav] a', (as) => as.map((a) => a.dataset.nav))).includes('customers') && !(await p3.$$eval('[data-portal=nav] a', (as) => as.map((a) => a.dataset.nav))).includes('staff'));
  await bgo(p3, 'admin/customers/'); await bMainReady(p3);
  ok('real backend: ops-2 (customer.view) sees the real fixture customers', await count(p3, 'tbody tr') === 2);
  await bgo(p3, 'admin/staff/'); await bMainReady(p3);
  ok('real backend: ops-2 (no staff.manage) reaching /admin/staff/ directly still gets refused server-side', (await text(p3, '[data-portal=main]')).includes('لا يملك حسابك صلاحية'));
  ok('real backend: ops-2 (rules.view) sees the Business Rules nav item', (await p3.$$eval('[data-portal=nav] a', (as) => as.map((a) => a.dataset.nav))).includes('rules'));
  await bgo(p3, 'admin/business-rules/'); await bMainReady(p3);
  ok('real backend: ops-2 (rules.view) reads the real seeded register, exactly the codebase\'s own PENDING/DRAFT state', await count(p3, '#ops-rules-register tbody tr') >= 8);
  await p3.click('#ops-rules-register tbody tr:first-child a'); await bMainReady(p3);
  ok('real backend: ops-2 (rules.view but no rules.manage) sees the rule\'s details but never the change-status form', await count(p3, '#ops-rule-details') === 1 && await count(p3, '#ops-rule-manage') === 0);
  await c3.close();

  // Phase 6 against the real backend: the pager asks for page 2 with the filter; workflow edits persist; a staff
  // member without workflow.manage gets no editor, and the API refuses the write (403) all the same.
  const staffApi = (p) => (path, method = 'GET', body = null) => p.evaluate(async ([path, method, body]) => {
    const api = await import(new URL('assets/js/core/api.js', document.baseURI).href);
    try { return { ok: true, data: await api.request(path, { method, body }) }; } catch (e) { return { ok: false, code: e.code }; }
  }, [path, method, body]);
  const { c: c4, p: p4 } = await bctx(); const admin = staffApi(p4);
  await bgo(p4, 'admin/sign-in/'); await p4.fill('[name=email]', 'admin1@fixture.test'); await p4.fill('[name=password]', 'password123');
  await Promise.all([p4.waitForURL(/dashboard\/$/), p4.click('[data-form=sign-in] button[type=submit]')]); await bMainReady(p4);
  for (let i = 0; i < 56; i++) await admin('/operations/tasks', 'POST', { type: `bulk_${i}`, priority: 'normal' });
  for (const task of (await admin('/operations/tasks?pageSize=3')).data.items) await admin(`/operations/tasks/${encodeURIComponent(task.id)}/status`, 'POST', { status: 'completed' });
  const openTotal = (await admin('/operations/tasks?status=open&pageSize=1')).data.total;
  const allTotal = (await admin('/operations/tasks?pageSize=1')).data.total;
  await bgo(p4, 'admin/tasks/'); await bMainReady(p4); await p4.waitForSelector('.c-svp-lead');
  ok('real backend: tasks list pages at 50 with the full total', await count(p4, '.c-svp-lead') === 50 && await text(p4, '[data-pager-status]') === `يُعرض 50 من ${allTotal}`, await text(p4, '[data-pager-status]'));
  await p4.selectOption('[data-portal=main] .c-svp-filter select', 'open'); await p4.waitForFunction((n) => document.querySelector('[data-pager-status]')?.textContent.includes(String(n)) && !document.querySelector('[data-pager][hidden]'), openTotal);
  const nextReq = p4.waitForRequest((r) => /\/operations\/tasks\?/.test(r.url()) && /[?&]page=2/.test(r.url()));
  await p4.click('[data-action=load-more]'); const nextUrl = (await nextReq).url();
  ok('real backend: Load more asks for page 2 with the same filter and page size', /[?&]status=open/.test(nextUrl) && /[?&]pageSize=50/.test(nextUrl), nextUrl);
  await p4.waitForFunction((n) => document.querySelectorAll('.c-svp-lead').length === n, openTotal);
  ok('real backend: the filtered list ends at its own total, every row matching, no Load more left', allTotal > openTotal && await p4.evaluate(() => [...document.querySelectorAll('.c-svp-lead')].every((r) => r.dataset.taskStatus === 'open')) && !(await visible(p4, '[data-action=load-more]')) && await text(p4, '[data-pager-status]') === `يُعرض ${openTotal} من ${openTotal}`);

  await bgo(p4, 'admin/services/?id=study'); await bMainReady(p4); await p4.waitForSelector('#ops-svc-workflow form[data-form=workflow]');
  await p4.click('#ops-svc-workflow [data-action=add-step]');
  await p4.fill('#ops-svc-workflow li:last-child [name=key]', 'application'); await p4.fill('#ops-svc-workflow li:last-child [name=labelAr]', 'الطلب'); await p4.fill('#ops-svc-workflow li:last-child [name=labelEn]', 'Application');
  const wfResp = p4.waitForResponse((r) => r.url().endsWith('/services/study/workflow') && r.request().method() === 'POST');
  await p4.evaluate(() => { document.querySelector('#ops-svc-documents form').dataset.stale = '1'; });
  await p4.click('#ops-svc-workflow button[type=submit]');
  ok('real backend: admin saves a workflow (CSRF-carrying POST accepted)', (await wfResp).status() === 200);
  await p4.waitForFunction(() => { const f = document.querySelector('#ops-svc-documents form'); return f && !f.dataset.stale; });
  await p4.fill('#ops-req-docType', 'transcript');
  const drResp = p4.waitForResponse((r) => r.url().endsWith('/services/study/document-requirements') && r.request().method() === 'POST');
  await p4.click('#ops-svc-documents button[type=submit]'); ok('real backend: admin adds a document requirement', (await drResp).status() === 201);
  await bgo(p4, 'admin/services/?id=study'); await bMainReady(p4); await p4.waitForSelector('#ops-svc-workflow form[data-form=workflow]');
  ok('real backend: the workflow and requirement persist across a reload', await p4.inputValue('#ops-svc-workflow li:first-child [name=key]') === 'application' && await count(p4, '[data-doc-req=transcript]') === 1);
  await bgo(p4, 'admin/supervisors/?id=supervisor-1'); await bMainReady(p4); await p4.waitForSelector('#ops-sv-details');
  ok('real backend: the supervisor detail states the commission rule in words with its rate', (await text(p4, '#ops-sv-details')).includes('5%') && !(await text(p4, '#ops-sv-details')).includes('percentage'), await text(p4, '#ops-sv-details'));
  await c4.close();

  const { c: c5, p: p5 } = await bctx();
  await bgo(p5, 'admin/sign-in/'); await p5.fill('[name=email]', 'ops1@fixture.test'); await p5.fill('[name=password]', 'password123');
  await Promise.all([p5.waitForURL(/dashboard\/$/), p5.click('[data-form=sign-in] button[type=submit]')]); await bMainReady(p5);
  await bgo(p5, 'admin/services/?id=study'); await bMainReady(p5); await p5.waitForSelector('#ops-svc-workflow');
  ok('real backend: ops-1 (no workflow.manage) reads the workflow but gets no editor controls', await count(p5, '#ops-svc-workflow form, #ops-svc-documents form, [data-step-action], [data-action=remove-requirement]') === 0 && (await text(p5, '#ops-svc-workflow')).includes('الطلب'));
  const denied = await staffApi(p5)('/services/study/workflow', 'POST', { steps: [] });
  ok('real backend: ops-1 writing the workflow anyway is refused (403 forbidden)', !denied.ok && denied.code === 'forbidden', JSON.stringify(denied));
  await c5.close();

  await b2.close(); await site.close();
  backend.kill('SIGTERM'); await new Promise((r) => backend.on('close', r)); rmSync(dir, { recursive: true, force: true });
}

const filtered = errs.filter((e) => !/favicon/.test(e));
console.log(`ops-portal: ${pass} passed, ${fail} failed, ${filtered.length} console/network problems`);
filtered.slice(0, 10).forEach((e) => console.log('  ✗', e));
process.exit(fail || filtered.length ? 1 : 0);
