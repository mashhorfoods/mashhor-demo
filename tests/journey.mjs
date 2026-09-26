// Stage 11 booking journey verification — search request building, results
// (labels, sort, filters, compare, states), details, family traveller forms,
// extras, review (re-quote, price change, unavailable), payment (processing,
// failure, retry, change method), confirmation, request-mode services, the
// location combobox, session recovery, back/refresh persistence, attribution,
// three widths × both languages, zero console errors. Exits 1 on any ✗.
import { shot, makeCtx, launch } from './env.mjs';
const ORIGIN = process.env.TEST_ORIGIN + '';
const P = '/mashhor-demo/';
const b = await launch();
let pass = 0, fail = 0;
const ok = (name, cond, note = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} ${note}`); } };
const errs = [];
const SEARCH = 'search/?vertical=flights&tripType=return&from=KRT&to=JED&fromCode=KRT&toCode=JED&depart=2026-10-16&return=2026-10-23&adults=2&children=1&infants=1&cabin=economy&supervisor=ahmed-mohamed';
const DOB = { adult: '1990-01-01', child: '2019-01-01', infant: '2025-06-01' };
const AR = /[؀-ۿ]/;

const ctx = makeCtx(b, errs);
const go = async (p, url, handle) => { await p.goto(ORIGIN + P + url); if (handle) await p.waitForFunction((h) => window.no?.[h], handle); };
const text = (p, sel) => p.locator(sel).first().textContent().then((s) => (s ?? '').replace(/\s+/g, ' ').trim()).catch(() => '');
const count = (p, sel) => p.locator(sel).count();
const visible = (p, sel) => p.locator(sel).first().isVisible().catch(() => false);
const results = async (p) => { await go(p, SEARCH, 'results'); await p.waitForSelector('.c-flight[data-offer]'); };
const fillTravellers = async (p) => {
  const forms = p.locator('form.c-traveller[data-traveller]'); const n = await forms.count();
  for (let i = 0; i < n; i++) {
    const f = forms.nth(i); const type = await f.getAttribute('data-type');
    await f.locator('[name=firstName]').fill('Test'); await f.locator('[name=lastName]').fill('Traveller');
    if (await f.locator('[name=dob]').count()) {
      await f.locator('[name=dob]').fill(DOB[type]); await f.locator('select[name=gender]').selectOption({ index: 1 }); await f.locator('select[name=nationality]').selectOption({ index: 1 });
      await f.locator('[name=passport]').fill(`P${1000000 + i}`); await f.locator('[name=passportExpiry]').fill('2030-01-01');
    }
  }
  await p.fill('[name=email]', 'test@example.com'); await p.fill('[name=phone]', '+249912345678');
};
const next = async (p, re) => { await Promise.all([p.waitForURL(re), p.click('.c-journey__actions .c-btn--primary')]); };
const dev = (p, key, value) => p.evaluate(([k, v]) => { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); }, [key, value]);
const journey = (p) => p.evaluate(() => JSON.parse(sessionStorage.getItem('no.journey') ?? 'null'));
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

// ================================================================= 1. domain (in-browser modules)
{
  const { c, p } = await ctx(); await go(p, 'book/', 'booking');
  const r = await p.evaluate(async () => {
    const S = await import('./assets/js/booking/search.js'); const R = await import('./assets/js/booking/rank.js'); const Pr = await import('./assets/js/booking/pricing.js');
    const T = await import('./assets/js/booking/travellers.js'); const L = await import('./assets/js/booking/locations.js'); const B = await import('./assets/js/core/booking.js');
    const A = await import('./assets/js/booking/adapters/index.js'); const J = await import('./assets/js/booking/journey.js');
    const base = { service: 'flights', tripType: 'return', origin: 'Khartoum', destination: 'جدة (JED)', dates: { depart: '2026-10-16', return: '2026-10-23' }, travellers: { adults: 2, children: 1, infants: 1 }, cabin: 'economy', locale: 'ar' };
    const rt = S.toSearchRequest(base); const ow = S.toSearchRequest({ ...base, tripType: 'oneway' });
    const mc = S.toSearchRequest({ service: 'flights', tripType: 'multi', legs: [{ from: 'KRT', to: 'DXB', date: '2026-10-16' }, { from: 'DXB', to: 'IST', date: '2026-10-20' }, { from: 'IST', to: 'KRT', date: '2026-10-25' }], travellers: { adults: 1 } });
    const bad = S.toSearchRequest({ ...base, origin: 'Atlantis', destination: '' });
    const v = (patch) => B.validate('flights', { ...base, ...patch }).map((e) => e.field);
    const adapter = A.adapterFor('flights'); const found = await adapter.search(rt.request);
    const labels = R.labelOffers(found.offers); const byPrice = R.sortOffers(found.offers, 'price'); const byDur = R.sortOffers(found.offers, 'duration');
    const direct = R.applyFilters(found.offers, { ...R.EMPTY_FILTERS, stops: [0] });
    const cheap = found.offers.reduce((m, o) => (o.price.total < m.price.total ? o : m));
    const extras = await adapter.extras(found.meta.searchId, found.offers[0].id);
    const bag = extras.find((e) => e.id === 'bag'); const bagPrice = bag?.price ?? 0;
    const bd = Pr.breakdown(found.offers[0], base.travellers, [{ ...bag, qty: 2 }]);
    const fields = T.travellerFields('adult', 'flights'); const childF = T.travellerFields('child', 'flights');
    const valid = { firstName: 'Ahmed', lastName: 'Ali', dob: '1990-01-01', gender: 'M', nationality: 'SD', passport: 'A1234567', passportExpiry: '2030-01-01' };
    return {
      rtLegs: rt.request.legs.map((l) => `${l.from}-${l.to}`), rtErr: rt.errors.length, owLegs: ow.request.legs.length, mcLegs: mc.request.legs.map((l) => `${l.from}-${l.to}`), mcErr: mc.errors.length,
      badErr: bad.errors.map((e) => e.field), badKey: bad.errors[0]?.key,
      vDates: v({ dates: { depart: '2020-01-01', return: '2019-01-01' } }), vTrav: v({ travellers: { adults: 0, children: 0, infants: 0 } }), vInfants: v({ travellers: { adults: 1, children: 0, infants: 2 } }), vPlaces: v({ origin: '', destination: '' }),
      adapterId: adapter.id, adapterDev: adapter.dev, mode: adapter.mode, hotels: A.adapterFor('hotels').mode, n: found.offers.length, currency: found.offers[0].price.currency,
      labelled: [...labels.values()].flat().map((l) => l.id), cheapestId: [...labels.entries()].find(([, ls]) => ls.some((l) => l.id === 'cheapest'))?.[0] === cheap.id,
      priceSorted: byPrice.every((o, i) => !i || o.price.total >= byPrice[i - 1].price.total), durSorted: byDur.every((o, i) => !i || R.totalDuration(o) >= R.totalDuration(byDur[i - 1])),
      directOnly: direct.every((o) => R.totalStops(o) === 0) && direct.length > 0,
      bdTotal: Math.abs(bd.base + bd.taxes + bd.fees + bd.extrasTotal - bd.total) < 0.01, bdBase: Math.abs(bd.lines.reduce((s, l) => s + l.amount, 0) - bd.base) < 0.01, bdQty: bd.lines.map((l) => `${l.type}:${l.qty}`), bdExtras: bd.extrasTotal === bagPrice * 2,
      names: fields.map((f) => f.id), childHasPassport: childF.some((f) => f.id === 'passport'), requestNames: T.travellerFields('adult', 'hotels', 'request').map((f) => f.id),
      okAdult: T.validateTraveller('adult', valid, fields, '2026-10-16').length, badChild: T.validateTraveller('child', { ...valid }, childF, '2026-10-16').map((e) => e.key),
      badPassport: T.validateTraveller('adult', { ...valid, passport: 'ابجد', passportExpiry: '2026-10-01' }, fields, '2026-10-16').map((e) => e.field), empty: T.validateTraveller('adult', {}, fields, '2026-10-16').length,
      contact: T.validateContact({ email: 'nope', phone: '12' }).map((e) => e.field),
      loc: L.resolveLocation('jeddah')?.code, locAr: L.resolveLocation('الخرطوم')?.code, locCode: L.resolveLocation('krt')?.code, locNone: L.resolveLocation('Atlantis'),
      search: (await L.searchLocations('kha')).items.map((l) => l.code), searchShort: (await L.searchLocations('k')).items.length,
      guardNone: J.guard('travellers', { version: 1 })?.reason, steps: J.STEPS.map((s) => s.id),
      reference: A.bookingReference('X'), providers: (await import('./assets/js/booking/payment.js')).paymentProviders().map((x) => x.id),
    };
  });
  ok('round trip → 2 legs', r.rtLegs.join(',') === 'KRT-JED,JED-KRT' && r.rtErr === 0, r.rtLegs.join(','));
  ok('one way → 1 leg', r.owLegs === 1);
  ok('multi-city → 3 legs resolved', r.mcLegs.join(',') === 'KRT-DXB,DXB-IST,IST-KRT' && r.mcErr === 0, r.mcLegs.join(','));
  ok('unknown / missing place → field errors', r.badErr.includes('from') && r.badErr.includes('to') && r.badKey === 'bk.err.unknownPlace', r.badErr.join());
  ok('invalid dates rejected', r.vDates.includes('depart') || r.vDates.includes('return'), r.vDates.join());
  ok('no travellers rejected', r.vTrav.length > 0); ok('more infants than adults rejected', r.vInfants.length > 0); ok('missing locations rejected', r.vPlaces.includes('from') && r.vPlaces.includes('to'));
  ok('flights adapter is the labelled dev adapter', r.adapterId === 'dev-flights' && r.adapterDev === true && r.mode === 'search');
  ok('hotels fall back to request mode', r.hotels === 'request');
  ok('dev search returns offers in one currency', r.n >= 5 && r.currency === 'USD', `${r.n} ${r.currency}`);
  ok('labels: cheapest/fastest/fewestStops/recommended', ['cheapest', 'fastest', 'fewestStops', 'recommended'].every((l) => r.labelled.includes(l)), r.labelled.join());
  ok('cheapest label sits on the lowest total', r.cheapestId);
  ok('sort by price ascending', r.priceSorted); ok('sort by duration ascending', r.durSorted); ok('stops filter keeps direct only', r.directOnly);
  ok('price breakdown: base+taxes+fees+extras = total', r.bdTotal && r.bdBase, r.bdQty.join());
  ok('breakdown lines per traveller type', r.bdQty.join() === 'adult:2,child:1,infant:1', r.bdQty.join());
  ok('extras priced by quantity', r.bdExtras);
  ok('flight traveller fields (no unnecessary info)', r.names.join() === 'firstName,lastName,dob,gender,nationality,passport,passportExpiry', r.names.join());
  ok('request-mode traveller fields are names only', r.requestNames.join() === 'firstName,lastName', r.requestNames.join());
  ok('valid adult passes', r.okAdult === 0); ok('adult DOB on a child slot → childAge', r.badChild.includes('bk.err.childAge'), r.badChild.join());
  ok('non-latin passport + expiry before travel rejected', r.badPassport.includes('passport') && r.badPassport.includes('passportExpiry'), r.badPassport.join());
  ok('empty traveller → every required field', r.empty === 7, String(r.empty)); ok('contact validation', r.contact.join() === 'email,phone', r.contact.join());
  ok('resolve by name/arabic/code; unknown null', r.loc === 'JED' && r.locAr === 'KRT' && r.locCode === 'KRT' && r.locNone === null);
  ok('location search matches prefix, needs 2 chars', r.search.includes('KRT') && r.searchShort === 0, r.search.join());
  ok('guard without context', r.guardNone === 'noContext'); ok('journey steps', r.steps.join() === 'search,details,travellers,extras,review,payment,confirmation', r.steps.join());
  ok('dev reference format', /^X-DEV-[A-Z0-9]{6}$/.test(r.reference), r.reference);
  ok('development registers the development payment provider', r.providers.join() === 'dev', r.providers.join());
  await c.close();
}

// ================================================================= 2. location combobox (booking entry)
{
  const { c, p } = await ctx(); await go(p, 'book/?vertical=flights', 'booking');
  const F = 'form.c-search__form:not([hidden]) ';
  const from = p.locator(F + 'input[name=from]');
  ok('combobox semantics', await from.getAttribute('role') === 'combobox' && await from.getAttribute('aria-expanded') === 'false' && !!(await from.getAttribute('aria-controls')));
  await from.fill('k'); await p.waitForTimeout(400);
  ok('one letter → hint, no options', await count(p, '.c-loc__option:visible') === 0 && (await text(p, '.c-loc__status:visible')).length > 0);
  await from.fill('kha'); await p.waitForSelector('.c-loc__option:visible');
  ok('typing opens matches with highlighted text', await count(p, '.c-loc__option:visible') >= 1 && await count(p, '.c-loc__option:visible mark') >= 1 && await from.getAttribute('aria-expanded') === 'true');
  await from.press('ArrowDown');
  ok('ArrowDown highlights and sets aria-activedescendant', !!(await from.getAttribute('aria-activedescendant')) && await count(p, '.c-loc__option[aria-selected=true]') === 1);
  await from.press('Enter');
  ok('Enter picks the option: label + hidden code', /KRT/.test(await from.inputValue()) && await p.inputValue(F + 'input[name=fromCode]') === 'KRT' && await from.getAttribute('aria-expanded') === 'false', await from.inputValue());
  await p.click(F + '.c-loc__clear'); await p.waitForTimeout(100);
  ok('clear empties value and code, keeps focus', await from.inputValue() === '' && await p.inputValue(F + 'input[name=fromCode]') === '' && await p.evaluate(() => document.activeElement?.name === 'from'));
  await from.fill('zzq'); await p.waitForTimeout(500);
  ok('no match → empty status', (await text(p, '.c-loc__status:visible')).length > 0 && await count(p, '.c-loc__option:visible') === 0);
  await from.fill('__fail__'); await p.waitForTimeout(500);
  ok('provider failure → error with retry', (await text(p, '.c-loc__status:visible')).length > 0 && await count(p, '.c-loc__status:visible button') === 1);
  await from.fill('jed'); await p.waitForSelector('.c-loc__option:visible'); await from.press('Escape');
  ok('Escape closes the list', await from.getAttribute('aria-expanded') === 'false');
  ok('no hard-coded airport list in the component', !(await p.evaluate(async () => (await (await fetch('./assets/js/booking/ui/location-field.js')).text()).includes('KRT'))));
  await c.close();
}

// ================================================================= 3. entry → search → results (URL context, attribution)
{
  const { c, p } = await ctx(); await go(p, 'book/?vertical=flights&supervisor=mohamed-abdullah', 'booking');
  const F = 'form.c-search__form:not([hidden]) ';
  await p.fill(F + 'input[name=from]', 'KRT'); await p.locator('.c-loc__option:visible').first().click();
  await p.fill(F + 'input[name=to]', 'Jeddah'); await p.locator('.c-loc__option:visible').first().click();
  await p.fill(F + 'input[name=depart]', '2026-11-10'); await p.fill(F + 'input[name=return]', '2026-11-17');
  await p.click(F + 'button[type=submit]'); await p.waitForSelector('.c-summary__actions a.c-btn--primary');
  const href = await p.getAttribute('.c-summary__actions a.c-btn--primary', 'href');
  ok('entry continues to search/ with codes + supervisor', /\/search\/\?/.test(href) && /fromCode=KRT/.test(href) && /toCode=JED/.test(href) && /supervisor=mohamed-abdullah/.test(href), href);
  await Promise.all([p.waitForURL(/search\//), p.click('.c-summary__actions a.c-btn--primary')]);
  await p.waitForFunction(() => window.no?.results);
  ok('loading feedback appears immediately', await count(p, '[data-state-region][aria-busy=true], .c-skeleton, .c-loading-block') >= 1 || await count(p, '.c-flight[data-offer]') > 0);
  await p.waitForSelector('.c-flight[data-offer]');
  const j = await journey(p);
  ok('journey context saved with attribution', j?.context?.originCode === 'KRT' && j?.context?.attribution?.supervisor === 'mohamed-abdullah' && Array.isArray(j?.search?.results));
  ok('summary shows the supervisor', /supervisor\//.test(await p.locator('[data-journey=summary] a[href*="supervisor/"]').first().getAttribute('href').catch(() => '')));
  ok('dev data notice visible', await visible(p, '[data-dev=true]'));
  ok('progress marks search current', await text(p, '.c-steps__item[aria-current=step]') !== '' && await count(p, '.c-steps__item') === 7);
  const n1 = await count(p, '.c-flight[data-offer]');
  await p.reload(); await p.waitForFunction(() => window.no?.results); await p.waitForSelector('.c-flight[data-offer]');
  ok('refresh reuses fresh results (no second search)', (await journey(p)).search.at === j.search.at && await count(p, '.c-flight[data-offer]') === n1);
  await c.close();
}

// ================================================================= 4. results: labels, sort, priorities, filters, compare, states
{
  const { c, p } = await ctx(); await results(p);
  const n = await count(p, '.c-flight[data-offer]');
  ok('results count matches status', new RegExp(String(n)).test(await text(p, '.c-results-bar')), await text(p, '.c-results-bar'));
  ok('labels on cards', await count(p, '[data-label=cheapest]') === 1 && await count(p, '[data-label=fastest]') >= 1 && await count(p, '[data-label=recommended]') >= 1);
  ok('card shows baggage + fare rule + party total', await count(p, '.c-flight__meta-item') >= 2 && /4/.test(await text(p, '.c-flight__price-note')));
  ok('no "objectively best" wording', !/objectively|الأفضل مطلقاً/i.test(await text(p, '[data-journey=main]')));
  const totals = async () => p.$$eval('.c-flight[data-offer] .c-flight__price', (els) => els.map((e) => Number(e.textContent.replace(/[^\d.]/g, ''))));
  await p.selectOption('#results-sort', 'price'); let t = await totals();
  ok('sort: price ascending', t.every((v, i) => !i || v >= t[i - 1]), t.join());
  await p.selectOption('#results-sort', 'departure');
  const deps = await p.$$eval('.c-flight[data-offer]', (els) => els.map((e) => e.querySelector('.c-leg__time').textContent.trim()));
  ok('sort: departure ascending', deps.every((v, i) => !i || v >= deps[i - 1]), deps.join());
  await p.click('.c-chip[data-priority=stops]');
  ok('priority chip pressed + reason box on cards', await p.getAttribute('.c-chip[data-priority=stops]', 'aria-pressed') === 'true' && await count(p, '.c-flight__why') >= 1 && await p.inputValue('#results-sort') === 'stops');
  ok('reason text is data-driven, not hidden scoring', /توقف|stop/i.test(await text(p, '.c-flight__why')));
  await p.click('.c-chip[data-priority=stops]');
  ok('priority toggles off (only the balanced pick keeps its reason)', await p.getAttribute('.c-chip[data-priority=stops]', 'aria-pressed') === 'false' && await count(p, '.c-flight__why') === await count(p, '[data-label=recommended]'));
  ok('filters panel in the aside on desktop, sheet button hidden', await visible(p, '.c-journey__aside--filters .c-filters-panel') && !(await visible(p, '.c-filters-open')));
  const zeroBadge = await text(p, '.c-results-bar [data-count]');
  await p.locator('.c-filters-panel input[name=stops][value="0"]').check();
  ok('stops=direct filter narrows to direct flights', await count(p, '.c-flight[data-offer]') < n && await p.$$eval('.c-flight[data-offer]', (els) => els.every((e) => e.querySelectorAll('.c-leg__stops[data-direct=true]').length === e.querySelectorAll('.c-leg__stops').length)));
  ok('active filter count shown', (await text(p, '.c-results-bar [data-count]')) !== '' && (await text(p, '.c-results-bar [data-count]')) !== zeroBadge);
  await p.evaluate(() => window.no.results.setFilters({ maxPrice: 1 }));
  ok('impossible filters → filtered-empty state with reset', await count(p, '.c-flight[data-offer]') === 0 && await visible(p, '[data-state-region] .c-state--empty') && await count(p, '[data-state-region] .c-state__actions .c-btn') >= 1);
  await p.locator('.c-filters-panel button', { hasText: /إعادة الضبط|Reset/ }).first().click();
  ok('reset restores all results', await count(p, '.c-flight[data-offer]') === n);
  const boxes = p.locator('.c-flight input[type=checkbox]');
  await boxes.nth(0).check(); await boxes.nth(1).check();
  ok('compare tray shows with 2 picked', await visible(p, '.c-compare-tray') && /2/.test(await text(p, '.c-compare-tray')));
  await p.locator('.c-compare-tray .c-btn--primary').click(); await p.waitForSelector('#compare-dialog[open]');
  const rows = await p.$$eval('#compare-dialog tbody tr, #compare-dialog tr', (trs) => trs.map((r) => r.querySelector('th')?.textContent.trim()).filter(Boolean));
  ok('compare table: price, duration, stops, departure, arrival, baggage, fare rules', rows.length >= 7, rows.join('|'));
  ok('compare dialog has a select action', await count(p, '#compare-dialog [data-action=select]') === 2);
  await p.keyboard.press('Escape'); ok('compare closes on Escape', !(await p.evaluate(() => document.querySelector('#compare-dialog').open)));
  await boxes.nth(2).check(); await p.waitForTimeout(100);
  ok('compare caps at 3: the rest are disabled', await count(p, '.c-flight input[type=checkbox]:checked') === 3 && await boxes.nth(3).isDisabled() && (await text(p, '.c-compare-tray')).length > 0);
  // states
  await dev(p, 'no.dev.search', 'empty'); await p.reload(); await p.waitForFunction(() => window.no?.results); await p.waitForTimeout(600);
  await p.evaluate(() => window.no.results.run({ force: true })); await p.waitForSelector('[data-state-region] .c-state--empty');
  ok('empty state with edit search', await count(p, '[data-state-region] .c-state--empty .c-btn') >= 1);
  await dev(p, 'no.dev.search', 'error'); await p.evaluate(() => window.no.results.run({ force: true })); await p.waitForSelector('[data-state-region] .c-state--error');
  ok('error state with retry', await count(p, '[data-state-region] .c-state--error .c-btn') >= 1);
  await dev(p, 'no.dev.search', 'slow'); const run = p.evaluate(() => window.no.results.run({ force: true })); await p.waitForTimeout(150);
  ok('slow search → skeleton + aria-busy', await p.getAttribute('[data-state-region]', 'aria-busy') === 'true' && await count(p, '.c-skeleton, .c-skeleton-card, [class*=skeleton]') >= 1);
  await run; await dev(p, 'no.dev.search', null); await p.waitForSelector('.c-flight[data-offer]');
  await p.evaluate(() => { const j = JSON.parse(sessionStorage.getItem('no.journey')); j.search.at = Date.now() - 30 * 60 * 1000; sessionStorage.setItem('no.journey', JSON.stringify(j)); });
  await p.reload(); await p.waitForFunction(() => window.no?.results); await p.waitForSelector('[data-state-region] .c-state');
  ok('expired results → expired state with search again', /انتهت|expired/i.test(await text(p, '[data-state-region] .c-state__title')) && await count(p, '[data-state-region] .c-state__actions .c-btn') >= 1);
  await go(p, 'search/?vertical=flights&tripType=oneway&from=Atlantis&to=JED&depart=2026-10-16&adults=1', 'results'); await p.waitForSelector('[data-state-region] .c-state');
  ok('unknown place → warning state, no raw URL text injected as HTML', /Atlantis/.test(await text(p, '[data-state-region] .c-state__text')) && await count(p, '[data-state-region] script') === 0);
  await p.evaluate(() => sessionStorage.clear()); await go(p, 'search/', 'results');
  ok('no context → recovery to booking entry', await visible(p, '[data-journey=main] .c-state') && /book\/$/.test(await p.locator('[data-journey=main] .c-state a.c-btn').first().getAttribute('href')));
  await c.close();
}

// ================================================================= 5. details → family travellers → extras → review → payment → confirmation
{
  const { c, p } = await ctx(); await results(p);
  const firstId = await p.locator('.c-flight[data-offer]').first().getAttribute('data-offer');
  await Promise.all([p.waitForURL(/booking\/details/), p.locator('[data-action=details]').first().click()]);
  await p.waitForFunction(() => window.no?.details); await p.waitForSelector('.c-segment');
  ok('details url carries the id, noindex', new URL(p.url()).searchParams.get('id') === firstId && await p.getAttribute('meta[name=robots]', 'content') === 'noindex, nofollow');
  ok('details: segments, layover or direct, baggage, fare rules, included, price', await count(p, '.c-segment') >= 2 && await count(p, '.c-rules__row') >= 4 && await count(p, '.c-price-rows') >= 1 && await count(p, '.c-inclusions li, .c-inclusions') >= 1);
  ok('details primary CTA = select flight', /اختيار الرحلة/.test(await text(p, '[data-action=select]')) && await count(p, '[data-journey=main] .c-btn--primary:visible') === 1);
  ok('details shows reasons as text, no overflow', await count(p, '.c-flight__labels--why li') >= 1 && await noHScroll(p));
  await go(p, 'booking/details/?id=nope', 'details');
  ok('unknown id → recovery back to results', await visible(p, '[data-journey=main] .c-state') && /search\//.test(await p.locator('[data-journey=main] .c-state a.c-btn').first().getAttribute('href')));
  await go(p, `booking/details/?id=${encodeURIComponent(firstId)}`, 'details');
  await Promise.all([p.waitForURL(/booking\/travellers/), p.click('[data-action=select]')]);
  await p.waitForFunction(() => window.no?.travellers);
  const types = await p.$$eval('form.c-traveller[data-traveller]', (fs) => fs.map((f) => f.dataset.type));
  ok('family: one form per traveller (2 adults, 1 child, 1 infant)', types.join() === 'adult,adult,child,infant', types.join());
  ok('traveller forms labelled with age rule', /12|١٢/.test(await text(p, 'form.c-traveller[data-type=adult] .c-traveller__head, form.c-traveller[data-type=adult] h2')) && (await text(p, 'form.c-traveller[data-type=infant] .c-traveller__head, form.c-traveller[data-type=infant] h2')).length > 5);
  ok('every control labelled', await p.$$eval('form.c-traveller input, form.c-traveller select', (cs) => cs.every((c) => c.id && document.querySelector(`label[for="${c.id}"]`))));
  await p.click('.c-journey__actions .c-btn--primary'); await p.waitForTimeout(200);
  ok('empty submit → errors, aria-invalid, focus on first invalid, count status', await count(p, '.c-field__error:visible') >= 20 && await p.evaluate(() => document.activeElement?.getAttribute('aria-invalid') === 'true') && /\d/.test(await text(p, '[data-journey=main] [role=status]')));
  ok('still on travellers', /travellers/.test(p.url()));
  const child = p.locator('form.c-traveller[data-type=child]');
  await fillTravellers(p); await child.locator('[name=dob]').fill('1990-01-01');
  await p.click('.c-journey__actions .c-btn--primary'); await p.waitForTimeout(200);
  ok('child with adult DOB → age error only', await count(p, '.c-field__error:visible') === 1 && await child.locator('[name=dob]').getAttribute('aria-invalid') === 'true');
  await child.locator('[name=dob]').fill(DOB.child);
  await next(p, /booking\/extras/); await p.waitForFunction(() => window.no?.extras);
  const j1 = await journey(p);
  ok('travellers + contact persisted', Object.keys(j1.travellers ?? {}).length === 4 && j1.contact?.email === 'test@example.com' && j1.travellers['adult-1']?.firstName === 'Test');
  await p.goBack(); await p.waitForFunction(() => window.no?.travellers);
  ok('back to travellers keeps entered values', await p.locator('form.c-traveller[data-traveller]').first().locator('[name=firstName]').inputValue() === 'Test');
  await next(p, /booking\/extras/); await p.waitForFunction(() => window.no?.extras);
  ok('extras: included badge + optional with price + stepper', await count(p, '.c-extra[data-extra]') >= 2 && await count(p, '.c-extra .c-stepper, .c-extra [data-action=inc], .c-extra button') >= 1);
  const totalBefore = await text(p, '.c-price-row--total .c-price-row__value');
  await p.locator('.c-extra[data-extra] button').filter({ hasText: /\+|زيادة|Add|More/ }).first().click().catch(async () => p.locator('.c-extra[data-extra] button').nth(1).click());
  await p.waitForTimeout(150);
  ok('adding an extra updates the live total', await text(p, '.c-price-row--total .c-price-row__value') !== totalBefore, totalBefore);
  await next(p, /booking\/review/); await p.waitForFunction(() => window.no?.review); await p.waitForSelector('#review-terms');
  ok('review blocks: trip, travellers, price, contact, supervisor, each editable', await count(p, '.c-review-block') >= 5 && await count(p, '.c-review-block a[href*="booking/"], .c-review-block a[href*="search/"]') >= 3 && /الخرطوم|Khartoum|KRT/.test(await text(p, '#rv-trip, [aria-labelledby=rv-trip]')));
  const review = await journey(p); const expected = await p.evaluate(async (j) => { const Pr = await import('./assets/js/booking/pricing.js'); return Pr.breakdown(j.selection.offer, j.context.travellers, j.extras, j.quote?.price ?? j.selection.offer.price).total; }, review);
  ok('review total = pricing.breakdown (base + taxes + fees + extras)', Number((await text(p, '.c-review-block .c-price-row--total .c-price-row__value')).replace(/[^\d.]/g, '')) === Math.round(expected), `${expected}`);
  ok('supervisor named on review', /supervisor|coordinator|مشرف|منسق/i.test(await text(p, '[data-journey=main]')));
  await p.click('.c-journey__actions .c-btn--primary'); await p.waitForTimeout(150);
  ok('terms required before payment', await visible(p, '.c-field__error') && /review/.test(p.url()));
  await p.check('#review-terms'); await next(p, /booking\/payment/); await p.waitForFunction(() => window.no?.payment);
  ok('payment: dev notice, amount, methods, no raw card fields', await visible(p, '[data-dev=true]') && await count(p, '.c-pay-amount') === 1 && await count(p, 'input[name=method]') === 2 && await count(p, 'input[autocomplete^=cc-], input[name*=card]') === 0);
  ok('pay button carries the amount', /\d/.test(await text(p, '[data-action=pay]')));
  ok('development: no pay-later step while the dev provider is registered', await count(p, '[data-pay-later], [data-action=pay-later]') === 0);
  await p.check('#pm-dev-failure'); await p.click('[data-action=pay]');
  ok('processing state (button loading, inputs disabled)', await p.evaluate(() => document.querySelector('[data-action=pay]')?.getAttribute('data-state') === 'loading' || document.querySelector('[data-action=pay]')?.disabled) && await count(p, 'input[name=method]:disabled') === 2);
  await p.waitForSelector('.c-state--error');
  ok('failure: nothing lost, retry / change method / back to review', await count(p, '[data-action=retry]') === 1 && await count(p, '[data-action=change-method]') === 1 && await count(p, '.c-state--error a[href*="review"]') === 1 && Object.keys((await journey(p)).travellers ?? {}).length === 4);
  await p.click('[data-action=retry]'); await p.waitForSelector('.c-loading-block'); await p.waitForSelector('.c-state--error');
  ok('retry counts the attempt', /2|٢/.test(await text(p, '.c-state__text')) && (await journey(p)).payment.attempts === 2);
  await p.click('[data-action=change-method]'); await p.check('#pm-dev-success'); await p.click('[data-action=pay]');
  await p.waitForURL(/booking\/confirmation/); await p.waitForFunction(() => window.no?.confirmation);
  const ref = await text(p, '[data-reference]');
  ok('confirmation: reference, status title, rows', /^NO-DEV-[A-Z0-9]{6}$/.test(ref) && /تم تأكيد|confirmed/i.test(await text(p, 'h1')) && await count(p, '.c-confirm__rows dt, .c-confirm dt, dt') >= 6, ref);
  const body = await text(p, '[data-journey=main]');
  ok('never claims a ticket was issued', !/تم إصدار التذكرة|ticket issued|e-ticket sent/i.test(body) && /التذكرة|Ticket/i.test(body));
  ok('supervisor attribution reaches confirmation', /supervisor\//.test(await p.locator('[data-journey=main] a[href*="supervisor/"], [data-journey=summary] a[href*="supervisor/"]').first().getAttribute('href').catch(() => '')));
  ok('actions: view trip, print/download, support, new booking', await count(p, '.c-confirm__actions .c-btn') >= 3);
  ok('booking persisted with payment paid', (await journey(p)).booking?.reference === ref && (await journey(p)).payment.status === 'paid');
  await p.reload(); await p.waitForFunction(() => window.no?.confirmation);
  ok('refresh keeps the confirmation', await text(p, '[data-reference]') === ref);
  await go(p, 'booking/payment/', 'payment');
  ok('payment after booking → not charged twice (recovery to confirmation, no pay button)', await count(p, '[data-action=pay]') === 0 && /confirmation\//.test(await p.locator('[data-journey=main] .c-state a.c-btn').first().getAttribute('href')));
  await p.evaluate(() => sessionStorage.clear()); await go(p, 'booking/confirmation/', 'confirmation');
  ok('no booking → recovery state', await visible(p, '[data-journey=main] .c-state'));
  await c.close();
}

// ================================================================= 6. price change, unavailable, booking failure after payment
{
  const { c, p } = await ctx(); await results(p);
  await Promise.all([p.waitForURL(/travellers/), p.locator('[data-action=select]').first().click()]); await p.waitForFunction(() => window.no?.travellers);
  await fillTravellers(p); await next(p, /extras/); await p.waitForFunction(() => window.no?.extras); await next(p, /review/); await p.waitForFunction(() => window.no?.review); await p.waitForSelector('#review-terms');
  await dev(p, 'no.dev.quote', 'changed'); await p.reload(); await p.waitForFunction(() => window.no?.review); await p.waitForSelector('.c-review-block [role=alert]');
  ok('price change shown as alert with old and new price, CTA re-labelled', (await text(p, '.c-review-block [role=alert]')).replace(/\D/g, '').length >= 4 && /الجديد|new price/i.test(await text(p, '.c-journey__actions .c-btn--primary')));
  ok('summary total follows the new price', (await journey(p)).quote?.changed === true);
  await dev(p, 'no.dev.quote', 'unavailable'); await p.reload(); await p.waitForFunction(() => window.no?.review); await p.waitForSelector('.c-review-block .c-state');
  ok('unavailable → state with back to results, CTA disabled', /search\//.test(await p.locator('.c-review-block .c-state a.c-btn').first().getAttribute('href')) && await p.locator('.c-journey__actions .c-btn--primary').isDisabled());
  await dev(p, 'no.dev.quote', null); await dev(p, 'no.dev.book', 'error'); await p.reload(); await p.waitForFunction(() => window.no?.review); await p.waitForSelector('#review-terms');
  await p.check('#review-terms'); await next(p, /payment/); await p.waitForFunction(() => window.no?.payment);
  await p.check('#pm-dev-success'); await p.click('[data-action=pay]'); await p.waitForSelector('.c-state--warning');
  ok('booking failure after payment → warning with support + back, not a confirmation', /payment/.test(p.url()) && await count(p, '.c-state--warning a[href*="account/support"]') === 1 && !(await journey(p)).booking);
  await c.close();
}

// ================================================================= 7. request-mode journey (hotels) — no inventory, no payment
{
  const { c, p } = await ctx(); await go(p, 'search/?vertical=hotels&destination=Jeddah&checkin=2026-10-16&checkout=2026-10-20&adults=2&rooms=1', 'results');
  await p.waitForSelector('[data-journey=main] .c-state');
  ok('request mode: explains no instant booking, continue to travellers', await count(p, '[data-journey=main] .c-state .c-btn--primary') === 1 && await count(p, '.c-steps__item') === 4);
  await Promise.all([p.waitForURL(/travellers/), p.click('[data-journey=main] .c-state .c-btn--primary')]); await p.waitForFunction(() => window.no?.travellers);
  ok('request travellers: names only', await count(p, 'form.c-traveller[data-traveller] [name=passport]') === 0 && await count(p, 'form.c-traveller[data-traveller]') === 2);
  await fillTravellers(p); await next(p, /booking\/review/); await p.waitForFunction(() => window.no?.review);
  ok('request review: no price rows, submit request CTA', await count(p, '.c-price-rows') === 0 && await p.locator('.c-journey__actions .c-btn--primary').isEnabled());
  await p.check('#review-terms'); await next(p, /confirmation/); await p.waitForFunction(() => window.no?.confirmation);
  ok('request confirmation: received status, nothing charged, reference', /استلام|received/i.test(await text(p, 'h1')) && /^RQ-DEV-/.test(await text(p, '[data-reference]')) && /لم يُحصَّل|Nothing charged/i.test(await text(p, '[data-journey=main]')));
  // Phase 6: a request is a lead. In development it is mirrored into the browser's dev lead store (core/leads.js),
  // which the dev supervisor/ops portals read; with a backend it becomes one when the booking is claimed.
  const ref = await text(p, '[data-reference]');
  const lead = await p.evaluate((r) => JSON.parse(localStorage.getItem('no.dev.leads') ?? '[]').find((l) => l.bookingId === r) ?? null, ref);
  ok('request booking → one lead (source request, service, contact, traveller name), unassigned without a supervisor', lead?.source === 'request' && lead.serviceInterest === 'hotels' && /test@example\.com/.test(lead.contact) && lead.name === 'Test Traveller' && lead.supervisorId === null && lead.status === 'new', JSON.stringify(lead));
  await c.close();
}

// ================================================================= 7b. the contact form (help/contact/) → a lead (development store)
for (const loc of ['ar', 'en']) {
  const { c, p } = await ctx(390, 844, loc); await go(p, 'help/contact/?supervisor=ahmed-mohamed', 'helpContact');
  ok(`${loc} contact: form offered, one dominant CTA, no horizontal scroll at 390px`, await count(p, '[data-form=contact]') === 1 && await count(p, 'main .c-btn--primary') === 1 && await noHScroll(p));
  if (loc === 'en') ok('en contact: form fully English', !AR.test(await text(p, '[data-contact-form]')), (await text(p, '[data-contact-form]')).slice(0, 80));
  await p.click('[data-form=contact] button[type=submit]');
  ok(`${loc} contact: empty submit → name, reach and message errors, nothing sent`, await count(p, '[data-form=contact] [data-state=error]') === 3 && (await p.evaluate(() => localStorage.getItem('no.dev.leads'))) === null);
  await p.fill('#contact-name', 'Test Visitor'); await p.fill('#contact-phone', '+249 912 345 678'); await p.fill('#contact-message', 'Please call me about Umrah.');
  await p.click('[data-form=contact] button[type=submit]'); await p.waitForSelector('[data-contact-sent=true]');
  const lead = await p.evaluate(() => JSON.parse(localStorage.getItem('no.dev.leads') ?? '[]')[0] ?? null);
  ok(`${loc} contact: sent → confirmation state, one lead attributed to the page's supervisor`, await count(p, '[data-contact-form] .c-state--success') === 1 && lead?.source === 'contact' && lead.supervisorId === 'ahmed-mohamed' && lead.message === 'Please call me about Umrah.' && /249/.test(lead.contact), JSON.stringify(lead));
  await c.close();
}

// ================================================================= 8. widths × languages: every screen, no overflow, one primary CTA, language complete
for (const [w, h, tag] of [[390, 844, 'mobile'], [834, 1100, 'tablet'], [1440, 1000, 'desktop']]) for (const loc of ['ar', 'en']) {
  const { c, p } = await ctx(w, h, loc);
  const screen = async (name, extra = {}) => {
    const r = await p.evaluate(() => ({
      lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title,
      h1: Array.from(document.querySelectorAll('h1')).filter((x) => x.checkVisibility()).length, hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      primaries: Array.from(document.querySelectorAll('main .c-btn--primary')).filter((n) => n.checkVisibility() && !n.closest('.c-flight') && !n.closest('dialog')).length,
      mainText: document.querySelector('main').innerText, robots: document.querySelector('meta[name=robots]')?.content,
      small: Array.from(document.querySelectorAll('main p, main a, main button, main span, main li, main label, main dt, main dd')).filter((n) => n.checkVisibility() && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 12).length,
      unlabelled: Array.from(document.querySelectorAll('main input:not([type=hidden]), main select')).filter((c) => c.checkVisibility() && !(c.id && document.querySelector(`label[for="${c.id}"]`)) && !c.getAttribute('aria-label') && !c.getAttribute('aria-labelledby')).length,
    }));
    const L = `${tag}/${loc}/${name}`;
    ok(`${L} lang/dir`, r.lang === loc && r.dir === (loc === 'ar' ? 'rtl' : 'ltr'));
    ok(`${L} one visible h1`, r.h1 === 1, String(r.h1)); ok(`${L} no horizontal scroll`, !r.hScroll);
    ok(`${L} ≤1 dominant primary CTA`, r.primaries <= 1, String(r.primaries)); ok(`${L} noindex`, /noindex/.test(r.robots));
    ok(`${L} no tiny text`, r.small === 0, String(r.small)); ok(`${L} controls labelled`, r.unlabelled === 0, String(r.unlabelled));
    if (loc === 'en') ok(`${L} fully English`, !AR.test(r.mainText) && !AR.test(r.title), (r.mainText.match(/[^\n]*[؀-ۿ][^\n]*/) ?? [''])[0].slice(0, 80));
    else ok(`${L} Arabic title`, AR.test(r.title));
    if (extra.shot) await p.screenshot({ path: shot(`journey-${name}-${tag}-${loc}.png`), fullPage: true });
  };
  await results(p); await screen('results', { shot: true });
  if (w < 1024) { await p.click('.c-filters-open'); await p.waitForSelector('#filters-sheet[open]'); ok(`${tag}/${loc} filters open as a sheet`, await visible(p, '#filters-sheet .c-filters-panel')); await p.keyboard.press('Escape'); }
  const boxes = p.locator('.c-flight input[type=checkbox]'); await boxes.nth(0).check(); await boxes.nth(1).check(); await p.locator('.c-compare-tray .c-btn--primary').click(); await p.waitForSelector('#compare-dialog[open]');
  ok(`${tag}/${loc} compare usable (no dialog overflow)`, await p.evaluate(() => { const d = document.querySelector('#compare-dialog'); return d.getBoundingClientRect().width <= innerWidth && !!d.querySelector('.c-compare-scroll, table'); }));
  await p.keyboard.press('Escape');
  await Promise.all([p.waitForURL(/details/), p.locator('[data-action=details]').first().click()]); await p.waitForSelector('.c-segment'); await screen('details');
  await Promise.all([p.waitForURL(/travellers/), p.click('[data-action=select]')]); await p.waitForFunction(() => window.no?.travellers); await screen('travellers');
  await fillTravellers(p); await next(p, /extras/); await p.waitForFunction(() => window.no?.extras); await screen('extras');
  await next(p, /review/); await p.waitForFunction(() => window.no?.review); await p.waitForSelector('#review-terms'); await screen('review', { shot: true });
  await p.check('#review-terms'); await next(p, /payment/); await p.waitForFunction(() => window.no?.payment); await screen('payment');
  await p.check('#pm-dev-failure'); await p.click('[data-action=pay]'); await p.waitForSelector('.c-state--error'); await screen('payment-failed');
  await p.click('[data-action=change-method]'); await p.check('#pm-dev-success'); await p.click('[data-action=pay]'); await p.waitForURL(/confirmation/); await p.waitForFunction(() => window.no?.confirmation); await screen('confirmation', { shot: true });
  if (w === 1440) {
    ok(`${loc} summary sticky on desktop`, await p.evaluate(() => getComputedStyle(document.querySelector('.c-journey__aside')).position === 'sticky'));
    // keyboard: tab reaches the primary action on the results page
    await results(p); await p.keyboard.press('Tab'); let hops = 0; let hit = false;
    while (hops++ < 80) { hit = await p.evaluate(() => document.activeElement?.matches('[data-action=select]')); if (hit) break; await p.keyboard.press('Tab'); }
    ok(`${loc} keyboard reaches select flight`, hit, String(hops));
  }
  await c.close();
}

// ================================================================= 9. language switch mid-journey keeps state
{
  const { c, p } = await ctx(); await results(p);
  await p.click('[data-action=select]'); await p.waitForURL(/travellers/); await p.waitForFunction(() => window.no?.travellers);
  await p.locator('form.c-traveller[data-traveller]').first().locator('[name=firstName]').fill('Keep');
  await p.evaluate(async () => { const m = await import('./assets/js/core/i18n.js'); await m.setLocale('en'); }); await p.waitForTimeout(300);
  ok('language switch keeps the journey and the typed values', await p.evaluate(() => document.documentElement.lang === 'en') && await p.locator('form.c-traveller[data-traveller]').first().locator('[name=firstName]').inputValue() === 'Keep' && !AR.test(await text(p, 'h1')));
  await c.close();
}

await b.close();
const filtered = errs.filter((e) => !/favicon/.test(e));
console.log(`journey: ${pass} passed, ${fail} failed, ${filtered.length} console/network problems`);
filtered.slice(0, 10).forEach((e) => console.log('  ✗', e));
process.exit(fail || filtered.length ? 1 : 0);
