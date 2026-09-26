// Phase 6 (review 2026-09-25 §7) — the public destinations and offers pages read the Command Center CMS on a
// connected build. Against a REAL backend (backend/server.mjs, temporary database) with a staging build of the site:
// before anything is published the static registries still show; a publish reaches the listing, the detail page and
// the homepage; the CMS is authoritative (a static-only slug is not listed and its detail page is not found); an
// archive takes the record away again; and with the backend down every page falls back to the static registries.
// Exits 1 on any ✗.
import { launch, staticServer, stagingEnv, startEphemeralBackend, makeReq } from './env.mjs';
import { rmSync } from 'node:fs';

const P = '/mashhor-demo/';
let pass = 0, fail = 0;
const ok = (name, cond, note = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} ${note}`); } };
const errs = [];

const { dir, backend, origin: API } = await startEphemeralBackend({ prefix: 'no-content-backend-', portBase: 8991, portSpread: 8 });
const control = (path, body = {}) => fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
await control('/__test/reset');
const site = await staticServer({ prefix: P, env: stagingEnv(API) });
// The same staging build pointed at a backend that isn't there (nothing listens on the discard port).
const deadSite = await staticServer({ prefix: P, env: stagingEnv('http://127.0.0.1:9') });

const staff = makeReq(API, site.origin)(new Map(), 'no_ops_csrf');
const signIn = await staff('/staff/auth/sign-in', { method: 'POST', body: { email: 'admin1@fixture.test', password: 'password123' } });
ok('staff admin signs in to the real backend', signIn.status === 200, String(signIn.status));
const createDestination = async (body, patch) => { const r = await staff('/admin/destinations', { method: 'POST', body }); await staff(`/admin/destinations/${r.data.destination.id}`, { method: 'PATCH', body: patch }); return r.data.destination.id; };
const setDestination = (id, patch) => staff(`/admin/destinations/${id}`, { method: 'PATCH', body: patch });

const b = await launch();
/** A fresh browser context per visit, so no HTTP cache carries one visit's content into the next. */
async function visit(origin, url, ready) {
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await c.newPage(); p.setDefaultTimeout(15000);
  p.on('pageerror', (e) => errs.push(`${url} pageerror: ${e.message}`));
  p.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().startsWith('[no] ') && !/Failed to load resource|net::ERR_/.test(m.text())) errs.push(`${url} console: ${m.text().slice(0, 160)}`); });
  await p.goto(origin + P + url);
  await p.waitForFunction(ready);
  return { p, close: () => c.close() };
}
const listing = (kind, region) => new Function(`return !!document.documentElement.dataset.content${kind} && document.querySelector('[data-${region}]')?.getAttribute('aria-busy') === 'false'`);
const destinationsReady = listing('Destinations', 'destinations=popular');
const offersReady = listing('Offers', 'offers=grid');
const homeReady = () => document.querySelector('[data-home=destinations]')?.getAttribute('aria-busy') === 'false' && document.querySelector('[data-home=offers]')?.getAttribute('aria-busy') === 'false';
const destDetailReady = () => document.querySelector('[data-dest=hero]')?.getAttribute('aria-busy') === 'false';
const offerDetailReady = () => document.querySelector('[data-offer=hero]')?.getAttribute('aria-busy') === 'false';
const source = (p, kind) => p.evaluate((k) => document.documentElement.dataset[`content${k}`], kind);
const cardTitles = (p, sel) => p.$$eval(`${sel} .c-card__link`, (ns) => [...new Set(ns.map((n) => n.textContent.trim()))]);
const count = (p, sel) => p.locator(sel).count();
const text = (p, sel) => p.locator(sel).first().textContent().then((s) => (s ?? '').replace(/\s+/g, ' ').trim()).catch(() => '');

// ================================================================= 1. connected, nothing published yet → static registries
{
  const v = await visit(site.origin, 'destinations/', destinationsReady);
  ok('connected, CMS never published: destinations page keeps the static registry', await source(v.p, 'Destinations') === 'static' && (await cardTitles(v.p, '[data-destinations=popular]')).includes('دبي'));
  await v.close();
  const d = await visit(site.origin, 'destinations/dubai/', destDetailReady);
  ok('connected, CMS never published: a static detail page still renders', /دبي/.test(await text(d.p, '#dest-title')));
  await d.close();
}

// ================================================================= 2. publish → the public pages show it; the CMS is authoritative
const jeddah = await createDestination({ slug: 'jeddah', nameAr: 'جدة المنشورة', nameEn: 'Published Jeddah' },
  { region: 'middleEast', countryAr: 'السعودية', countryEn: 'Saudi Arabia', descAr: 'وصف من النظام', descEn: 'From the CMS', home: true, featured: true, purposes: ['umrah'], services: ['flights', 'hotels'] });
const zanzibar = await createDestination({ slug: 'zanzibar', nameAr: 'زنجبار', nameEn: 'Zanzibar' }, { region: 'africa', home: true, purposes: ['tourism'], services: ['flights'] });
{
  // still drafts: nothing public changes yet
  const v = await visit(site.origin, 'destinations/', destinationsReady);
  ok('drafts never reach the public page', await source(v.p, 'Destinations') === 'static' && !(await cardTitles(v.p, '[data-destinations=popular]')).includes('جدة المنشورة'));
  await v.close();
}
await setDestination(jeddah, { publishStatus: 'published' });
await setDestination(zanzibar, { publishStatus: 'published' });
{
  const v = await visit(site.origin, 'destinations/', destinationsReady);
  const titles = await cardTitles(v.p, '[data-destinations=popular]');
  ok('publish → the destinations page lists the CMS record', await source(v.p, 'Destinations') === 'cms' && titles.includes('جدة المنشورة') && titles.includes('زنجبار'), titles.join('|'));
  ok('the CMS is authoritative: static-only destinations are no longer listed', !titles.includes('دبي') && await count(v.p, '[data-destinations=popular] .c-dest') === 2, titles.join('|'));
  ok('region counts come from the CMS list', (await text(v.p, '[data-destinations=region-nav] [data-region=middleEast] .c-chip__count')) === '1' && (await text(v.p, '[data-destinations=region-nav] [data-region=europe] .c-chip__count')) === '0');
  const hrefJed = await v.p.getAttribute('[data-destinations=popular] .c-dest:has-text("جدة المنشورة") a.c-card__link', 'href');
  const hrefZan = await v.p.getAttribute('[data-destinations=popular] .c-dest:has-text("زنجبار") a.c-card__link', 'href');
  ok('a CMS record with a generated route shell links to its detail page; one without links to its booking entry', /destinations\/jeddah\/$/.test(hrefJed ?? '') && /book\/\?/.test(hrefZan ?? '') && !/destinations\/zanzibar/.test(hrefZan ?? ''), `${hrefJed} ${hrefZan}`);
  await v.close();

  const d = await visit(site.origin, 'destinations/jeddah/', destDetailReady);
  ok('publish → the detail page renders the CMS record', (await text(d.p, '#dest-title')).includes('جدة المنشورة') && (await d.p.title()).includes('جدة المنشورة'));
  await d.close();
  const d2 = await visit(site.origin, 'destinations/dubai/', destDetailReady);
  ok('a static slug the CMS does not publish shows the not-found state (backend reachable)', await count(d2.p, '[data-dest=hero] .c-state--empty') === 1 && await count(d2.p, '#dest-title') === 0);
  await d2.close();

  const h = await visit(site.origin, '', homeReady);
  const homeTitles = await cardTitles(h.p, '[data-home=destinations]');
  ok('publish → the homepage destinations section shows the CMS records (home flag)', homeTitles.includes('جدة المنشورة') && homeTitles.includes('زنجبار') && !homeTitles.includes('دبي'), homeTitles.join('|'));
  await h.close();
}

// ---- offers
const offer = await staff('/admin/offers', { method: 'POST', body: { slug: 'umrah', titleAr: 'عمرة من النظام', titleEn: 'CMS Umrah' } });
await staff(`/admin/offers/${offer.data.offer.id}`, { method: 'PATCH', body: { destinationId: jeddah, category: 'umrah', categories: ['umrah', 'packages'], shortAr: 'نص قصير', shortEn: 'Short', services: ['umrah', 'hotels'], featured: true, detail: { inclusions: [{ ar: 'تذكرة الطيران', en: 'Flight ticket' }] }, placeholder: false } });
{
  const v = await visit(site.origin, 'offers/', offersReady);
  ok('offers: a draft is not public — the static registry still shows (never published)', await source(v.p, 'Offers') === 'static' && await count(v.p, '[data-offers=grid] .c-offer') === 3);
  await v.close();
}
await staff(`/admin/offers/${offer.data.offer.id}`, { method: 'PATCH', body: { publishStatus: 'published' } });
{
  const v = await visit(site.origin, 'offers/', offersReady);
  const titles = await cardTitles(v.p, '[data-offers=grid]');
  ok('publish → the offers page lists only the CMS offer', await source(v.p, 'Offers') === 'cms' && titles.includes('عمرة من النظام') && await count(v.p, '[data-offers=grid] .c-offer') === 1, titles.join('|'));
  ok('offers: category counts and the destination filter come from the CMS list', (await text(v.p, '[data-offers=categories] [data-category=""] .c-chip__count')) === '1' && (await v.p.$$eval('select[name=destination] option', (os) => os.map((o) => o.value).filter(Boolean))).join() === 'jeddah');
  await v.close();
  const d = await visit(site.origin, 'offers/umrah/', offerDetailReady);
  ok('publish → the offer detail page renders the CMS record, with its CMS destination and inclusions', (await text(d.p, '#offer-title')).includes('عمرة من النظام') && (await text(d.p, '[data-offer=hero]')).includes('جدة المنشورة') && (await text(d.p, '[data-offer=included]')).includes('تذكرة الطيران'));
  await d.close();
  const d2 = await visit(site.origin, 'offers/dubai-break/', offerDetailReady);
  ok('offers: a static slug the CMS does not publish shows the not-found state', await count(d2.p, '[data-offer=hero] .c-state--empty') === 1 && await count(d2.p, '#offer-title') === 0);
  await d2.close();
  const dd = await visit(site.origin, 'destinations/jeddah/', destDetailReady);
  ok('the destination detail page lists the CMS offers that point at it', (await text(dd.p, '[data-dest=offers]')).includes('عمرة من النظام'));
  await dd.close();
}

// ---- an edit to a live record stays off the site until republished
await setDestination(jeddah, { nameAr: 'جدة بعد التعديل' });
{
  const d = await visit(site.origin, 'destinations/jeddah/', destDetailReady);
  ok('an edit to a published record is not public until it is republished', (await text(d.p, '#dest-title')).includes('جدة المنشورة'));
  await d.close();
}
await setDestination(jeddah, { publishStatus: 'published' });
{
  const d = await visit(site.origin, 'destinations/jeddah/', destDetailReady);
  ok('"publish changes" → the edit reaches the public page', (await text(d.p, '#dest-title')).includes('جدة بعد التعديل'));
  await d.close();
}

// ---- the same through the Command Center: a live record with edits offers "Publish changes"
await setDestination(zanzibar, { nameAr: 'زنجبار المعدلة' });
{
  const c = await b.newContext({ viewport: { width: 1440, height: 1000 } }); const p = await c.newPage(); p.setDefaultTimeout(15000);
  p.on('pageerror', (e) => errs.push(`admin pageerror: ${e.message}`));
  await p.goto(site.origin + P + 'admin/sign-in/'); await p.fill('[name=email]', 'admin1@fixture.test'); await p.fill('[name=password]', 'password123');
  await Promise.all([p.waitForURL(/dashboard\/$/), p.click('[data-form=sign-in] button[type=submit]')]);
  await p.goto(site.origin + P + `admin/destinations/?id=${zanzibar}`); await p.waitForSelector('#ops-dst-publishing');
  const publishChanges = p.locator('#ops-dst-publishing button:text-is("نشر التغييرات")');
  ok('Command Center: a published destination with edits offers "Publish changes"', await publishChanges.count() === 1);
  await publishChanges.click(); await p.waitForFunction(() => ![...document.querySelectorAll('#ops-dst-publishing button')].some((x) => x.textContent.trim() === 'نشر التغييرات'));
  ok('Command Center: after publishing the changes the button is gone and the record is still published', await count(p, '#ops-dst-publishing button:text-is("إلغاء النشر")') === 1);
  await c.close();
  const v = await visit(site.origin, 'destinations/', destinationsReady);
  ok('"Publish changes" in the Command Center → the public listing shows the edit', (await cardTitles(v.p, '[data-destinations=popular]')).includes('زنجبار المعدلة'));
  await v.close();
}

// ================================================================= 3. archive → it disappears
await setDestination(jeddah, { publishStatus: 'archived' });
{
  const v = await visit(site.origin, 'destinations/', destinationsReady);
  const titles = await cardTitles(v.p, '[data-destinations=popular]');
  ok('archive → the destination disappears from the listing (and the static one does not come back)', !titles.includes('جدة بعد التعديل') && !titles.some((x) => /^جدة$/.test(x)) && titles.includes('زنجبار المعدلة') && await count(v.p, '[data-destinations=popular] .c-dest') === 1, titles.join('|'));
  await v.close();
  const d = await visit(site.origin, 'destinations/jeddah/', destDetailReady);
  ok('archive → its detail page shows the not-found state', await count(d.p, '[data-dest=hero] .c-state--empty') === 1);
  await d.close();
}
await staff(`/admin/offers/${offer.data.offer.id}`, { method: 'PATCH', body: { publishStatus: 'archived' } });
{
  const v = await visit(site.origin, 'offers/', offersReady);
  ok('archive the last offer → the offers page is empty (the CMS stays authoritative)', await source(v.p, 'Offers') === 'cms' && await count(v.p, '[data-offers=grid] .c-offer') === 0 && await count(v.p, '[data-offers=grid] .c-state--empty') === 1);
  await v.close();
}

// ================================================================= 4. backend down → static fallback
for (const [label, origin] of [['unreachable backend', deadSite.origin]]) {
  const v = await visit(origin, 'destinations/', destinationsReady);
  ok(`${label}: destinations page falls back to the static registry`, await source(v.p, 'Destinations') === 'fallback' && (await cardTitles(v.p, '[data-destinations=popular]')).includes('دبي'));
  await v.close();
  const d = await visit(origin, 'destinations/dubai/', destDetailReady);
  ok(`${label}: a static detail page renders its static record`, /دبي/.test(await text(d.p, '#dest-title')));
  await d.close();
  const o = await visit(origin, 'offers/umrah/', offerDetailReady);
  ok(`${label}: a static offer detail page renders its static record`, /العمرة/.test(await text(o.p, '#offer-title')));
  await o.close();
  const h = await visit(origin, '', homeReady);
  ok(`${label}: the homepage destinations and offers show the static selections`, await count(h.p, '[data-home=destinations] .c-dest') >= 3 && await count(h.p, '[data-home=offers] .c-offer') === 3);
  await h.close();
}
// ...and the real backend going away mid-life behaves the same
backend.kill('SIGTERM'); await new Promise((r) => backend.on('close', r));
{
  const v = await visit(site.origin, 'offers/', offersReady);
  ok('backend stopped: offers page falls back to the static registry', await source(v.p, 'Offers') === 'fallback' && await count(v.p, '[data-offers=grid] .c-offer') === 3);
  await v.close();
}

await b.close(); await site.close(); await deadSite.close();
rmSync(dir, { recursive: true, force: true });
console.log(`public-content: ${pass} passed, ${fail} failed, ${errs.length} console/network problems`);
errs.slice(0, 10).forEach((e) => console.log('  ✗', e));
process.exit(fail || errs.length ? 1 : 0);
