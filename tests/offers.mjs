// Stage 10.8 offers verification — listing (filters, sort, categories, sheet,
// states, help chips), every detail route, CTA logic, a full-record template
// render, deep links, a11y, three widths, both directions. Exits 1 on any ✗.
import './env.mjs';
import { chromium } from 'playwright';
const ORIGIN = process.env.TEST_ORIGIN + '';
const LIST = '/mashhor-demo/offers/';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let pass = 0, fail = 0;
const ok = (name, cond, note = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} ${note}`); } };
const errs = [];

async function open(url, width = 1440, height = 1000, locale = 'ar') {
  const p = await b.newPage({ viewport: { width, height } });
  p.on('pageerror', e => errs.push(`${url}@${width}/${locale} pageerror: ${e.message}`));
  p.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('boom')) errs.push(`${url}@${width} console: ${m.text()}`); });
  p.on('requestfailed', r => errs.push(`${url}@${width} reqfail: ${r.url()}`));
  p.on('response', r => { if (r.status() >= 400) errs.push(`${url}@${width} HTTP ${r.status()} ${r.url()}`); });
  await p.goto(ORIGIN + url, { waitUntil: 'networkidle' });
  await p.evaluate(async (l) => { const m = await import('./assets/js/foundation.js'); m.setLocale(l); }, locale);
  await p.waitForTimeout(700);
  return p;
}

// ---------------------------------------------------------------- listing: structure × widths × locales
for (const [w, h, tag] of [[390, 844, 'mobile'], [834, 1100, 'tablet'], [1440, 1000, 'desktop']]) {
  for (const loc of ['ar', 'en']) {
    const p = await open(LIST, w, h, loc);
    const r = await p.evaluate(() => {
      const vis = (sel) => Array.from(document.querySelectorAll(sel)).filter((n) => n.checkVisibility());
      const headings = Array.from(document.querySelectorAll('h1,h2,h3')).filter((x) => x.checkVisibility()).map((x) => Number(x.tagName[1]));
      let jumps = 0; for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) jumps++;
      const small = Array.from(document.querySelectorAll('main p, main a, main button, main span, main li')).filter((n) => n.checkVisibility() && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 12).length;
      const targets = vis('main a[href], main button').filter((n) => n.getBoundingClientRect().height < 40 && !n.classList.contains('c-card__link')).map((n) => n.className.split(' ')[0] + ':' + Math.round(n.getBoundingClientRect().height));
      const cards = Array.from(document.querySelectorAll('[data-offers=grid] .c-offer'));
      return {
        dir: document.documentElement.dir, hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        h1: document.querySelectorAll('h1').length, jumps, title: document.title, canonical: document.querySelector('link[rel=canonical]').href,
        primaries: vis('.c-btn--primary').map((n) => n.textContent.trim()),
        chips: document.querySelectorAll('[data-offers=categories] .c-chip').length,
        chipCounts: Array.from(document.querySelectorAll('[data-offers=categories] .c-chip .c-chip__count')).map((n) => n.textContent).join(','),
        forms: document.querySelectorAll('form.c-filters').length,
        inlineForm: !!document.querySelector('[data-offers=filters] form.c-filters')?.checkVisibility(),
        openButton: !!document.querySelector('.c-filters__open')?.checkVisibility(),
        filterNames: Array.from(document.querySelectorAll('form.c-filters select')).map((s) => s.name),
        cards: cards.length,
        cardBits: cards.every((c) => c.querySelector('.c-card__badges .c-badge') && c.querySelector('.c-card__title a') && c.querySelector('.c-offer__meta') && c.querySelector('.c-inclusions') && c.querySelector('.c-price') && c.querySelector('.c-card__action')),
        priceRequest: cards.every((c) => c.querySelector('.c-price--request')),
        priceText: cards[0]?.querySelector('.c-price__value')?.textContent.trim(),
        ctaText: cards[0]?.querySelector('.c-card__action')?.textContent.trim(),
        cardHrefs: cards.every((c) => /\/mashhor-demo\/offers\/[a-z-]+\/$/.test(c.querySelector('.c-card__title a').getAttribute('href'))),
        entryHrefs: cards.every((c) => /\/mashhor-demo\/book\/\?vertical=(packages|umrah)&offer=[a-z-]+&to=[a-z]+$/.test(c.querySelector('.c-card__action').getAttribute('href'))),
        featured: document.querySelectorAll('[data-offers=featured] .c-offer--large').length,
        count: document.querySelector('[data-offers-count]').textContent,
        guides: document.querySelectorAll('[data-offers=help] .c-chip').length,
        guideClaims: /الأفضل|best|cheapest|الأرخص/i.test(document.querySelector('[data-offers=help]').innerText),
        finalPrimary: document.querySelector('.c-cta-band .c-btn--primary')?.getAttribute('href'),
        placeholders: document.querySelectorAll('a[href^="tel:"], a[href*="wa.me"], a[href^="mailto:"]').length + (/\+249|wa\.me|XXXX/.test(document.body.innerText) ? 1 : 0),
        numbers: /\d{3,}\s?(ج\.س|SDG|USD|\$)|خصم|%/.test(document.querySelector('main').innerText),
        imgsNoAlt: document.querySelectorAll('img:not([alt])').length,
        mediaLabelled: Array.from(document.querySelectorAll('.c-card__media [role=img]')).every((n) => n.getAttribute('aria-label')),
        header: !!document.querySelector('.c-gh'), footer: !!document.querySelector('.c-gf'), footerCta: !!document.querySelector('.c-gf__cta'),
        menuOffers: document.querySelectorAll('.c-gh a[href*="/offers/?category="]').length,
        small, targets,
      };
    });
    const T = `list/${tag}/${loc}`;
    ok(`${T} dir, no h-scroll, one h1, ordered headings`, r.dir === (loc === 'ar' ? 'rtl' : 'ltr') && !r.hScroll && r.h1 === 1 && r.jumps === 0, `${r.jumps}`);
    ok(`${T} title + canonical`, (loc === 'ar' ? /العروض/.test(r.title) : /Offers/.test(r.title)) && r.canonical.endsWith('/offers/'), r.title);
    ok(`${T} red rationed (hero + final, + header)`, r.primaries.length <= 3, r.primaries.join('|'));
    ok(`${T} 7 category chips with counts`, r.chips === 7 && r.chipCounts === '3,3,2,1,1,0,0', r.chipCounts);
    ok(`${T} one filter form, placed by width`, r.forms === 1 && (tag === 'mobile' ? (r.openButton && !r.inlineForm) : (r.inlineForm && !r.openButton)), `${r.forms} ${r.inlineForm} ${r.openButton}`);
    ok(`${T} only data-backed filters (destination, service, sort)`, r.filterNames.join() === 'destination,service,sort', r.filterNames.join());
    ok(`${T} 3 offer cards + 1 featured`, r.cards === 3 && r.featured === 1, `${r.cards}/${r.featured}`);
    ok(`${T} card anatomy complete`, r.cardBits);
    ok(`${T} no price invented: "${loc === 'ar' ? 'اطلب السعر' : 'Request price'}"`, r.priceRequest && r.priceText === (loc === 'ar' ? 'اطلب السعر' : 'Request price'), `${r.priceText}`);
    ok(`${T} CTA "${loc === 'ar' ? 'اطلب العرض' : 'Request this offer'}"`, r.ctaText === (loc === 'ar' ? 'اطلب العرض' : 'Request this offer'), `${r.ctaText}`);
    ok(`${T} routes: title → offer detail, CTA → booking entry with offer + destination`, r.cardHrefs && r.entryHrefs);
    ok(`${T} count line`, /3|٣/.test(r.count) || /offers|عروض/.test(r.count), r.count);
    ok(`${T} 7 guide chips, no claims`, r.guides === 7 && !r.guideClaims);
    ok(`${T} final CTA → packages request`, /\/mashhor-demo\/book\/\?vertical=packages$/.test(r.finalPrimary), `${r.finalPrimary}`);
    ok(`${T} no placeholder contacts, prices or discounts`, r.placeholders === 0 && !r.numbers);
    ok(`${T} alt / labelled media`, r.imgsNoAlt === 0 && r.mediaLabelled);
    ok(`${T} header (menu lists categories), footer CTA off`, r.header && r.footer && !r.footerCta && r.menuOffers === 6, `${r.menuOffers}`);
    ok(`${T} no tiny text, targets ≥40`, r.small === 0 && r.targets.length === 0, `${r.small} ${r.targets.slice(0, 3).join(' ')}`);
    await p.close();
  }
}

// ---------------------------------------------------------------- listing interaction + states (desktop ar)
{
  const p = await open(LIST);
  // category chip filters
  await p.click('[data-offers=categories] .c-chip[data-category=umrah]'); await p.waitForTimeout(400);
  let r = await p.evaluate(() => ({ n: document.querySelectorAll('[data-offers=grid] .c-offer').length, pressed: document.querySelector('[data-offers=categories] .c-chip[aria-pressed=true]').dataset.category, count: document.querySelector('[data-offers-count]').textContent }));
  ok('category chip filters the grid', r.n === 1 && r.pressed === 'umrah', JSON.stringify(r));
  // empty category → empty state with reset + expert
  await p.click('[data-offers=categories] .c-chip[data-category=deals]'); await p.waitForTimeout(400);
  r = await p.evaluate(() => ({ empty: !!document.querySelector('[data-offers=grid] .c-state--empty'), text: document.querySelector('[data-offers=grid] .c-state__title')?.textContent, actions: document.querySelectorAll('[data-offers=grid] .c-state__actions .c-btn').length }));
  ok('empty category → "لا توجد عروض متاحة حالياً." with actions', r.empty && /لا توجد عروض متاحة حالياً/.test(r.text) && r.actions === 2, JSON.stringify(r));
  await p.click('[data-offers=grid] .c-state__actions .c-btn--primary'); await p.waitForTimeout(400);
  r = await p.evaluate(() => ({ n: document.querySelectorAll('[data-offers=grid] .c-offer').length, pressed: document.querySelector('[data-offers=categories] .c-chip[aria-pressed=true]').dataset.category, dest: document.querySelector('form.c-filters select[name=destination]').value }));
  ok('reset restores all offers and the "all" chip', r.n === 3 && r.pressed === '' && r.dest === '', JSON.stringify(r));
  // filters apply live on desktop
  await p.selectOption('form.c-filters select[name=destination]', 'dxb'); await p.waitForTimeout(400);
  r = await p.evaluate(() => Array.from(document.querySelectorAll('[data-offers=grid] .c-offer .c-card__title')).map((n) => n.textContent.trim()));
  ok('destination filter applies live', r.length === 1 && /دبي/.test(r[0]), r.join(','));
  await p.selectOption('form.c-filters select[name=destination]', ''); await p.selectOption('form.c-filters select[name=service]', 'umrah'); await p.waitForTimeout(400);
  r = await p.evaluate(() => document.querySelectorAll('[data-offers=grid] .c-offer').length);
  ok('service filter applies', r === 1, `${r}`);
  await p.selectOption('form.c-filters select[name=service]', '');
  // sorting: recommended puts featured first; latest/price/duration keep stable order with unknowns last
  await p.selectOption('form.c-filters select[name=sort]', 'price'); await p.waitForTimeout(400);
  r = await p.evaluate(() => document.querySelectorAll('[data-offers=grid] .c-offer').length);
  ok('sort by price keeps every unpriced offer (unknown last, never dropped)', r === 3, `${r}`);
  r = await p.evaluate(async () => { const m = await import('./assets/js/foundation.js');
    const priced = [{ ...m.OFFER_REGISTRY[2], price: { amount: 900, currency: 'SDG', type: 'from' } }, { ...m.OFFER_REGISTRY[0], price: { amount: 100, currency: 'SDG', type: 'from' } }, m.OFFER_REGISTRY[1]];
    return { price: m.queryOffers({ sort: 'price' }, priced).map((o) => o.id).join(','), rec: m.queryOffers({ sort: 'recommended' }, priced).map((o) => o.featured).join(','), dur: m.queryOffers({ duration: 'short' }, priced).length }; });
  ok('queryOffers: price ascending with unknown last; featured first; duration bucket excludes unknown', r.price === 'istanbul-family,dubai-break,umrah' && r.rec === 'true,true,false' && r.dur === 0, JSON.stringify(r));
  await p.selectOption('form.c-filters select[name=sort]', 'recommended');
  // guide chip applies filter and scrolls
  await p.click('[data-offers=help] .c-chip[data-guide=family]'); await p.waitForTimeout(900);
  r = await p.evaluate(() => ({ n: document.querySelectorAll('[data-offers=grid] .c-offer').length, pressed: document.querySelector('[data-offers=categories] .c-chip[aria-pressed=true]').dataset.category, top: document.querySelector('#offers').getBoundingClientRect().top }));
  ok('help chip "for families" filters to the family category and moves to the grid', r.n === 1 && r.pressed === 'family' && r.top >= -5 && r.top < 400, JSON.stringify(r));
  // states
  for (const region of ['grid', 'featured']) {
    const s = await p.evaluate(async (region) => {
      const R = window.no.offers.regions[region]; const host = document.querySelector(`[data-offers=${region}]`); const out = {};
      R.loading(); out.loading = host.getAttribute('aria-busy') === 'true' && host.querySelectorAll('.c-skeleton').length > 0;
      R.empty();   out.empty = !!host.querySelector('.c-state--empty') && host.querySelectorAll('.c-state__actions .c-btn').length > 0;
      R.error();   out.error = !!host.querySelector('.c-state--error[role=alert]') && host.querySelectorAll('.c-state__actions .c-btn').length >= 1;
      await window.no.offers.reload(); out.content = host.getAttribute('aria-busy') === 'false' && host.querySelectorAll('.c-offer').length >= 1;
      return out;
    }, region);
    ok(`${region}: loading/empty/error/success`, s.loading && s.empty && s.error && s.content, JSON.stringify(s));
  }
  r = await p.evaluate(async () => { const m = await import('./assets/js/foundation.js'); window.no.offers.destroy(); const api = m.mountOffers({ query: async () => { throw new Error('boom'); } }); await new Promise((res) => setTimeout(res, 150)); const host = document.querySelector('[data-offers=grid]'); const out = { error: !!host.querySelector('.c-state--error'), forms: document.querySelectorAll('form.c-filters').length }; api.destroy(); window.no.offers = m.mountOffers(); await new Promise((res) => setTimeout(res, 150)); return out; });
  ok('query failure → error state; re-mount keeps one filter form', r.error && r.forms === 1, JSON.stringify(r));
  // ?category= deep link
  await p.goto(ORIGIN + LIST + '?category=umrah', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  r = await p.evaluate(() => ({ n: document.querySelectorAll('[data-offers=grid] .c-offer').length, pressed: document.querySelector('[data-offers=categories] .c-chip[aria-pressed=true]').dataset.category }));
  ok('?category= opens the listing filtered', r.n === 1 && r.pressed === 'umrah', JSON.stringify(r));
  // locale switch: one form, English labels
  await p.evaluate(async () => { const m = await import('./assets/js/foundation.js'); m.setLocale('en'); }); await p.waitForTimeout(800);
  r = await p.evaluate(() => ({ forms: document.querySelectorAll('form.c-filters').length, sheets: document.querySelectorAll('dialog.c-filters__sheet').length, label: document.querySelector('form.c-filters label').textContent, h1: document.querySelector('h1').textContent }));
  ok('locale switch: one form, one sheet, English', r.forms === 1 && r.sheets === 1 && r.label === 'Destination' && /Packages built/.test(r.h1), JSON.stringify(r));
  await p.close();
}

// ---------------------------------------------------------------- mobile filter sheet
{
  const p = await open(LIST, 390, 844, 'ar');
  await p.click('.c-filters__open'); await p.waitForTimeout(400);
  let r = await p.evaluate(() => ({ open: document.querySelector('#offers-filters').open, formInSheet: !!document.querySelector('#offers-filters form.c-filters'), apply: !!document.querySelector('#offers-filters .c-filters__apply')?.checkVisibility(), focusInside: document.querySelector('#offers-filters').contains(document.activeElement) }));
  ok('filter button opens the sheet with the form and an apply button', r.open && r.formInSheet && r.apply, JSON.stringify(r));
  await p.selectOption('#offers-filters select[name=destination]', 'ist');
  await p.click('#offers-filters .c-filters__apply'); await p.waitForTimeout(500);
  r = await p.evaluate(() => ({ open: document.querySelector('#offers-filters').open, n: document.querySelectorAll('[data-offers=grid] .c-offer').length, bodyOverflow: document.body.style.overflow }));
  ok('apply closes the sheet, filters the grid and unlocks scroll', !r.open && r.n === 1 && r.bodyOverflow === '', JSON.stringify(r));
  await p.click('.c-filters__open'); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok('Escape closes the sheet', !(await p.evaluate(() => document.querySelector('#offers-filters').open)));
  await p.close();
}

// ---------------------------------------------------------------- every offer route, both locales
const seedPage = await open(LIST);
const offers = await seedPage.evaluate(async () => { const m = await import('./assets/js/foundation.js'); return m.OFFER_REGISTRY.map((o) => ({ slug: o.slug, status: o.status, mode: o.bookingMode, placeholder: o.placeholder })); });
await seedPage.close();
ok('registry: 3 launch records, all placeholders on request', offers.length === 3 && offers.every((o) => o.placeholder && o.status === 'request'));
for (const o of offers) {
  for (const loc of ['ar', 'en']) {
    const p = await open(`/mashhor-demo/offers/${o.slug}/`, 1440, 1000, loc);
    const r = await p.evaluate(() => {
      const vis = (sel) => Array.from(document.querySelectorAll(sel)).filter((n) => n.checkVisibility());
      const headings = Array.from(document.querySelectorAll('h1,h2,h3')).filter((x) => x.checkVisibility()).map((x) => Number(x.tagName[1]));
      let jumps = 0; for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) jumps++;
      const hero = document.querySelector('[data-offer=hero]');
      return {
        lang: document.documentElement.lang, title: document.title, h1: document.querySelector('h1')?.textContent.trim(), h1s: document.querySelectorAll('h1').length, jumps,
        canonical: document.querySelector('link[rel=canonical]').href, hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        crumbs: document.querySelectorAll('.c-breadcrumb li a, .c-breadcrumb li [aria-current]').length,
        badges: hero.querySelectorAll('.c-badge').length, meta: hero.querySelectorAll('.c-offer__meta-item').length,
        price: hero.querySelector('.c-price__value')?.textContent.trim(), priceLarge: !!hero.querySelector('.c-price--large'),
        primary: hero.querySelector('.c-btn--primary')?.textContent.trim(), primaryHref: hero.querySelector('.c-btn--primary')?.getAttribute('href'),
        secondary: hero.querySelector('.c-btn--tertiary')?.textContent.trim(),
        primaries: vis('.c-btn--primary').map((n) => n.textContent.trim()),
        visible: Array.from(document.querySelectorAll('main > section[data-offer]')).filter((x) => !x.hidden).map((x) => x.dataset.offer),
        emptySections: Array.from(document.querySelectorAll('main > section[data-offer]')).filter((x) => !x.hidden && !x.querySelector('[data-offer-body] *, [data-offer] > *')).length,
        note: !!document.querySelector('[data-offer=overview] .c-note'),
        builtAround: document.querySelectorAll('[data-offer=included] .c-inclusions__item').length,
        steps: document.querySelectorAll('[data-offer=flow] .c-journey__step').length,
        related: document.querySelectorAll('[data-offer=related] .c-offer').length,
        support: document.querySelectorAll('[data-offer=support] .c-support__panel').length,
        placeholders: document.querySelectorAll('a[href^="tel:"], a[href*="wa.me"], a[href^="mailto:"]').length,
        numbers: /\d{3,}\s?(ج\.س|SDG|USD)|خصم|%/.test(document.querySelector('main').innerText),
        mediaAlt: document.querySelector('.c-hero__media [role=img]')?.getAttribute('aria-label'),
      };
    });
    const T = `${o.slug}/${loc}`;
    ok(`${T} lang, title, canonical, one h1, ordered`, r.lang === loc && r.title.includes(r.h1) && r.canonical.endsWith(`/offers/${o.slug}/`) && r.h1s === 1 && r.jumps === 0 && !r.hScroll, `${r.title} ${r.jumps}`);
    ok(`${T} hero: breadcrumb, status + category badges, destination + duration meta, large "request price"`, r.crumbs === 4 && r.badges >= 2 && r.meta === 2 && r.priceLarge && r.price === (loc === 'ar' ? 'اطلب السعر' : 'Request price'), JSON.stringify({ c: r.crumbs, b: r.badges, m: r.meta, p: r.price }));
    ok(`${T} CTA "${loc === 'ar' ? 'اطلب العرض' : 'Request this offer'}" → booking entry with offer`, r.primary === (loc === 'ar' ? 'اطلب العرض' : 'Request this offer') && new RegExp(`/book/\\?vertical=(packages|umrah)&offer=${o.slug}&to=`).test(r.primaryHref), `${r.primary} ${r.primaryHref}`);
    ok(`${T} secondary subordinate; one dominant action (+ header)`, !!r.secondary && r.secondary !== r.primary && r.primaries.length <= 3, r.primaries.join('|'));
    ok(`${T} placeholder record: note shown, built-around list, flow, related, support; no empty or unapproved sections`, r.note && r.builtAround >= 3 && r.steps === 4 && r.related === 2 && r.support === 2 && r.emptySections === 0 && !['excluded', 'itinerary', 'important', 'terms', 'faq'].some((s) => r.visible.includes(s)), r.visible.join(','));
    ok(`${T} no placeholder contacts, prices or discounts; media labelled`, r.placeholders === 0 && !r.numbers && !!r.mediaAlt);
    await p.close();
  }
}

// ---------------------------------------------------------------- the template with a FULL record (synthetic, in-browser only), + states
{
  const p = await open('/mashhor-demo/offers/istanbul-family/');
  const r = await p.evaluate(async () => {
    const m = await import('./assets/js/foundation.js');
    const full = { ...m.getOffer('istanbul-family'), placeholder: false, bookingMode: 'online', status: 'available',
      duration: { nights: 7 }, price: { amount: 1450000, currency: 'SDG', type: 'from', basisAr: 'لشخصين', basisEn: 'for two' },
      travelPeriod: { from: '2026-12-01', to: '2027-01-31' },
      inclusions: [{ ar: 'أ', en: 'a' }, { ar: 'ب', en: 'b' }], exclusions: [{ ar: 'ج', en: 'c' }],
      itinerary: [{ dayAr: 'اليوم 1', dayEn: 'Day 1', titleAr: 'وصول', titleEn: 'Arrival', textAr: 'نص', textEn: 'text' }],
      important: [{ ar: 'مهم', en: 'important' }], terms: [{ ar: 'شرط', en: 'term' }], faq: [{ qAr: 'س؟', qEn: 'Q?', aAr: 'ج', aEn: 'A' }, { qAr: 'س2؟', qEn: 'Q2?', aAr: 'ج2', aEn: 'A2' }],
      statusRecord: m.OFFER_STATUSES.available };
    const api = m.mountOfferDetail({ slug: 'istanbul-family', load: async (s) => (s === 'istanbul-family' ? full : null) });
    await new Promise((res) => setTimeout(res, 150));
    const vis = Array.from(document.querySelectorAll('main > section[data-offer]')).filter((x) => !x.hidden).map((x) => x.dataset.offer);
    const hero = document.querySelector('[data-offer=hero]');
    const out = {
      vis, price: hero.querySelector('.c-price__value')?.textContent, basis: hero.querySelector('.c-price__basis')?.textContent,
      meta: hero.querySelectorAll('.c-offer__meta-item').length, primary: hero.querySelector('.c-btn--primary')?.textContent.trim(),
      status: hero.querySelector('.c-badge')?.textContent.trim(), note: !!document.querySelector('[data-offer=overview] .c-note'),
      included: document.querySelectorAll('[data-offer=included] .c-inclusions__item').length, excluded: document.querySelectorAll('[data-offer=excluded] .c-inclusions__item').length,
      days: document.querySelectorAll('[data-offer=itinerary] .c-itinerary__day').length, faq: document.querySelectorAll('[data-offer=faq] .c-accordion__trigger').length,
      steps: document.querySelectorAll('[data-offer=flow] .c-journey__step').length,
    };
    // accordion works
    const second = document.querySelectorAll('[data-offer=faq] .c-accordion__trigger')[1]; second.click();
    out.faqOpen = second.getAttribute('aria-expanded') === 'true' && second.nextElementSibling.dataset.collapsed === 'false';
    // states
    const R = api.region; const host = hero;
    R.loading(); out.loading = host.getAttribute('aria-busy') === 'true' && host.querySelectorAll('.c-skeleton').length > 0;
    R.error(); out.error = !!host.querySelector('.c-state--error[role=alert]');
    await api.render('nonexistent'); out.unknown = !!host.querySelector('.c-state--empty') && Array.from(document.querySelectorAll('main > section[data-offer]')).every((x) => x.hidden) && /غير موجود/.test(document.title);
    await api.render('istanbul-family'); out.back = !!host.querySelector('h1');
    return out;
  });
  ok('full record: every section renders (included, excluded, itinerary, important, terms, faq, flow, related, support, cta)', ['overview', 'included', 'excluded', 'itinerary', 'important', 'terms', 'faq', 'flow', 'related', 'support', 'cta'].every((s) => r.vis.includes(s)), r.vis.join(','));
  ok('full record: real price with basis, 3 meta items, "احجز الآن", bookable badge, no placeholder note', /1,450,000/.test(r.price) && r.basis === 'لشخصين' && r.meta === 3 && r.primary === 'احجز الآن' && r.status === 'متاح للحجز' && !r.note, JSON.stringify({ p: r.price, m: r.meta, c: r.primary, s: r.status }));
  ok('full record: lists and counts', r.included === 2 && r.excluded === 1 && r.days === 1 && r.faq === 2 && r.steps === 5, JSON.stringify(r));
  ok('FAQ accordion toggles', r.faqOpen);
  ok('detail states: loading / error / unknown slug / back to content', r.loading && r.error && r.unknown && r.back, JSON.stringify({ l: r.loading, e: r.error, u: r.unknown, b: r.back }));
  await p.close();
}

// ---------------------------------------------------------------- deep link into the booking entry
{
  const p = await open('/mashhor-demo/offers/umrah/');
  const href = await p.getAttribute('[data-offer=hero] .c-btn--primary', 'href');
  await p.goto(ORIGIN + href, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  const r = await p.evaluate(() => ({ tab: document.querySelector('.c-search__tab[aria-selected=true]')?.dataset.tabId, path: location.pathname, focused: document.activeElement?.tagName }));
  ok('offer CTA opens the booking entry on the umrah vertical', r.path.endsWith('/mashhor-demo/book/') && r.tab === 'umrah' && ['INPUT', 'SELECT'].includes(r.focused), JSON.stringify(r));
  await p.close();
}

// ---------------------------------------------------------------- mobile detail + keyboard
{
  const p = await open('/mashhor-demo/offers/istanbul-family/', 390, 844, 'ar');
  const r = await p.evaluate(() => { const cta = document.querySelector('[data-offer=hero] .c-btn--primary').getBoundingClientRect(); const media = document.querySelector('.c-hero__media').getBoundingClientRect(); return { hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth, ctaTop: Math.round(cta.top), ratio: +(media.width / media.height).toFixed(2), priceSize: parseFloat(getComputedStyle(document.querySelector('.c-price__value')).fontSize) }; });
  ok('mobile detail: CTA within the first screen, media ratio kept, price readable', !r.hScroll && r.ctaTop < 800 && r.ratio > 1.4 && r.ratio < 1.8 && r.priceSize >= 18, JSON.stringify(r));
  await p.keyboard.press('Tab');
  ok('first Tab is the skip link', await p.evaluate(() => document.activeElement.hasAttribute('data-skip')));
  const seen = [];
  for (let i = 0; i < 8; i++) { await p.keyboard.press('Tab'); seen.push(await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { name: a.className.split(' ')[0] || a.tagName, ring: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || !a.matches(':focus') }; })); }
  ok('every focused control shows a focus ring', seen.every((s) => s.ring), seen.filter((s) => !s.ring).map((s) => s.name).join(','));
  await p.close();
}

await b.close();
console.log(`\n${pass}/${pass + fail} offers checks passed`);
console.log('errors:', errs.length ? errs : 'none');
process.exit(fail || errs.length ? 1 : 0);
