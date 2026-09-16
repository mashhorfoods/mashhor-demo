// Stage 10.6 service detail verification — every route, both locales, three
// widths on a sample, CTA logic, states, invalid route, a11y. Exits 1 on any ✗.
import './env.mjs';
import { chromium } from 'playwright';
const ORIGIN = process.env.TEST_ORIGIN + '';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let pass = 0, fail = 0;
const ok = (name, cond, note = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} ${note}`); } };
const errs = [];

async function open(url, width = 1440, height = 1000, locale = 'ar') {
  const p = await b.newPage({ viewport: { width, height } });
  p.on('pageerror', e => errs.push(`${url} pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${url} console: ${m.text()}`); });
  p.on('requestfailed', r => errs.push(`${url} reqfail: ${r.url()}`));
  p.on('response', r => { if (r.status() >= 400 && !url.includes('nonexistent')) errs.push(`${url} HTTP ${r.status()} ${r.url()}`); });
  await p.goto(ORIGIN + url, { waitUntil: 'networkidle' });
  await p.evaluate(async (l) => { const m = await import('./assets/js/foundation.js'); m.setLocale(l); }, locale);
  await p.waitForTimeout(700);
  return p;
}

// registry + expectations, read from the site itself
const seed = await open('/mashhor-demo/services/');
const services = await seed.evaluate(async () => {
  const m = await import('./assets/js/foundation.js');
  return m.SERVICE_REGISTRY.map((s) => ({ id: s.id, slug: s.slug, href: s.href, kind: s.kind, category: s.category,
    primary: m.SERVICE_DETAILS[s.id]?.primaryAction ?? null, hasDetail: !!m.SERVICE_DETAILS[s.id] }));
});
await seed.close();
ok('registry has 13 services with slugs', services.length === 13 && services.every((s) => s.slug), `${services.length}`);
ok('every service has detail content', services.every((s) => s.hasDetail), services.filter((s) => !s.hasDetail).map((s) => s.id).join(','));

// ---------------------------------------------------------------- every route, both locales (desktop)
const CTA = { ar: { book: 'احجز الآن', request: 'ابدأ طلبك', expert: 'تحدث مع خبير' }, en: { book: 'Book now', request: 'Start your request', expert: 'Talk to an expert' } };
for (const s of services) {
  for (const loc of ['ar', 'en']) {
    const p = await open('/mashhor-demo/' + s.href, 1440, 1000, loc);
    const r = await p.evaluate(() => {
      const vis = (sel) => Array.from(document.querySelectorAll(sel)).filter((n) => n.checkVisibility());
      const headings = Array.from(document.querySelectorAll('h1,h2,h3')).filter((h) => h.checkVisibility()).map((h) => Number(h.tagName[1]));
      let jumps = 0; for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) jumps++;
      const hero = document.querySelector('[data-detail=hero]');
      return {
        title: document.title, desc: document.querySelector('meta[name=description]').content,
        canonical: document.querySelector('link[rel=canonical]').href, lang: document.documentElement.lang,
        h1: document.querySelectorAll('h1').length, h1Text: document.querySelector('h1')?.textContent.trim(), jumps,
        hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        crumbs: Array.from(document.querySelectorAll('.c-breadcrumb li a, .c-breadcrumb li [aria-current]')).map((n) => n.textContent.trim()),
        crumbHrefs: Array.from(document.querySelectorAll('.c-breadcrumb a')).map((a) => a.getAttribute('href')),
        heroPrimary: hero.querySelector('.c-btn--primary')?.textContent.trim(), heroPrimaryHref: hero.querySelector('.c-btn--primary')?.getAttribute('href'),
        heroSecondary: hero.querySelector('.c-btn--tertiary')?.textContent.trim(),
        primaries: vis('.c-btn--primary').map((n) => n.textContent.trim()),
        visible: Array.from(document.querySelectorAll('main > section[data-detail]')).filter((x) => !x.hidden).map((x) => x.dataset.detail),
        emptySections: Array.from(document.querySelectorAll('main > section[data-detail]')).filter((x) => !x.hidden && !x.querySelector('[data-detail-body] *, [data-detail] > *')).length,
        features: document.querySelectorAll('[data-detail=features] .c-feature').length,
        benefits: document.querySelectorAll('[data-detail=benefits] .c-value').length,
        steps: document.querySelectorAll('[data-detail=steps] .c-journey__step').length,
        reqItems: document.querySelectorAll('[data-detail=requirements] .c-req__item').length,
        officialNote: !!document.querySelector('[data-detail=requirements] .c-note'),
        related: Array.from(document.querySelectorAll('[data-detail=related] .c-service-card .c-card__link')).map((a) => a.getAttribute('href')),
        support: document.querySelectorAll('[data-detail=support] .c-support__panel').length,
        placeholders: document.querySelectorAll('a[href^="tel:"], a[href*="wa.me"], a[href^="mailto:"]').length + (/\+249|wa\.me|XXXX/.test(document.body.innerText) ? 1 : 0),
        superlatives: /الأفضل|الأرخص|رقم واحد في|the best|cheapest|#1 in/i.test(document.querySelector('main').innerText),
        prices: /\d{3,}\s?(ج\.س|SDG|USD|\$)/.test(document.querySelector('main').innerText),
        imgsNoAlt: document.querySelectorAll('img:not([alt])').length,
        mediaAlt: document.querySelector('.c-hero__media [role=img]')?.getAttribute('aria-label'),
        decorative: Array.from(document.querySelectorAll('.c-hero__route, .u-numeral-watermark, .c-journey__num, .c-support__plus')).every((n) => n.getAttribute('aria-hidden') === 'true'),
        header: !!document.querySelector('.c-gh'), footer: !!document.querySelector('.c-gf'), footerCta: !!document.querySelector('.c-gf__cta'),
        bottomNav: document.querySelectorAll('.c-bottom-nav__item').length,
      };
    });
    const T = `${s.slug}/${loc}`;
    const expected = CTA[loc][s.primary ?? (s.kind === 'search' ? 'book' : 'request')];
    ok(`${T} lang + unique title/description/canonical`, r.lang === loc && r.title.includes(r.h1Text) && r.desc.length > 20 && r.canonical.endsWith('/mashhor-demo/' + s.href), `${r.title} | ${r.canonical}`);
    ok(`${T} one h1, ordered headings`, r.h1 === 1 && r.jumps === 0, `${r.h1}/${r.jumps}`);
    ok(`${T} no h-scroll`, !r.hScroll);
    ok(`${T} breadcrumb home › services › category › service`, r.crumbs.length === 4 && r.crumbHrefs[0].endsWith('/mashhor-demo/') && r.crumbHrefs[1].endsWith('/services/'), r.crumbs.join(' › '));
    ok(`${T} hero CTA follows the record (${expected})`, r.heroPrimary === expected, `${r.heroPrimary}`);
    ok(`${T} hero CTA destination`, (s.primary === 'expert') ? /\/help\/contact\/$/.test(r.heroPrimaryHref) : /\/mashhor-demo\/book\/\?vertical=[a-z]+(&service=[a-z]+)?$/.test(r.heroPrimaryHref), `${r.heroPrimaryHref}`);
    ok(`${T} secondary is subordinate and differs`, !!r.heroSecondary && r.heroSecondary !== r.heroPrimary);
    ok(`${T} one dominant action (hero + band repeat it; header global)`, r.primaries.length <= 3 && new Set(r.primaries.filter((x) => x !== r.primaries[0] || true)).size <= 2, r.primaries.join('|'));
    ok(`${T} no empty visual sections`, r.emptySections === 0, `${r.emptySections}`);
    ok(`${T} all content sections present`, ['overview', 'features', 'benefits', 'steps', 'requirements', 'related', 'support', 'cta'].every((x) => r.visible.includes(x)), r.visible.join(','));
    ok(`${T} features 3–4, benefits 3–4, steps 3–5`, r.features >= 3 && r.features <= 4 && r.benefits >= 3 && r.benefits <= 4 && r.steps >= 3 && r.steps <= 5, `${r.features}/${r.benefits}/${r.steps}`);
    ok(`${T} requirements: items are ours; official rules deferred`, r.reqItems >= 2 && (r.officialNote || ['flights', 'hotels', 'packages', 'transport', 'groups', 'issue', 'change', 'cancel'].includes(s.id)), `${r.reqItems}/${r.officialNote}`);
    ok(`${T} related: 1–3 other services, no self`, r.related.length >= 1 && r.related.length <= 3 && !r.related.some((h) => h.endsWith('/' + s.href)), r.related.join(','));
    ok(`${T} support block, no placeholder contacts`, r.support === 2 && r.placeholders === 0);
    ok(`${T} no superlatives, no prices`, !r.superlatives && !r.prices);
    ok(`${T} alt text, decorative hidden`, r.imgsNoAlt === 0 && !!r.mediaAlt && r.decorative, `${r.mediaAlt}`);
    ok(`${T} header, footer (CTA off), bottom nav`, r.header && r.footer && !r.footerCta && r.bottomNav >= 4);
    await p.close();
  }
}

// ---------------------------------------------------------------- widths (sample) + interaction
for (const [w, h, tag] of [[390, 844, 'mobile'], [834, 1100, 'tablet']]) {
  for (const slug of ['flights', 'umrah']) {
    const p = await open(`/mashhor-demo/services/${slug}/`, w, h, 'ar');
    const r = await p.evaluate(() => {
      const vis = (sel) => Array.from(document.querySelectorAll(sel)).filter((n) => n.checkVisibility());
      const small = Array.from(document.querySelectorAll('main p, main a, main button, main span, main li')).filter((n) => n.checkVisibility() && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 12).length;
      const targets = vis('main a[href], main button').filter((n) => n.getBoundingClientRect().height < 40 && !n.classList.contains('c-card__link') && !n.classList.contains('c-breadcrumb__link')).map((n) => n.className.split(' ')[0] + ':' + Math.round(n.getBoundingClientRect().height));
      const hero = document.querySelector('.c-hero').getBoundingClientRect();
      const media = document.querySelector('.c-hero__media').getBoundingClientRect();
      const cta = document.querySelector('[data-detail=hero] .c-btn--primary').getBoundingClientRect();
      return { hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth, small, targets,
        heroH: Math.round(hero.height), ctaTop: Math.round(cta.top), mediaRatio: +(media.width / media.height).toFixed(2),
        crumbFits: document.querySelector('.c-breadcrumb').getBoundingClientRect().right <= innerWidth + 1,
        singleColumn: innerWidth < 768 ? Math.abs(document.querySelector('.c-hero__copy').getBoundingClientRect().left - media.left) < 4 : true };
    });
    const T = `${tag}/${slug}`;
    ok(`${T} no h-scroll, no tiny text, targets ≥40`, !r.hScroll && r.small === 0 && r.targets.length === 0, `${r.small} ${r.targets.slice(0, 3).join(' ')}`);
    ok(`${T} breadcrumb fits`, r.crumbFits);
    if (tag === 'mobile') {
      ok(`${T} hero single column, CTA within first screen`, r.singleColumn && r.ctaTop < 800, `${r.ctaTop}`);
      ok(`${T} media keeps a ratio`, r.mediaRatio > 1.4 && r.mediaRatio < 1.8, `${r.mediaRatio}`);
    }
    await p.close();
  }
}

// ---------------------------------------------------------------- states, invalid route, missing data, CTA links, keyboard
{
  const p = await open('/mashhor-demo/services/flights/');
  // unknown slug → empty state with a way back; title updates
  let r = await p.evaluate(async () => { await window.no.detail.render('nonexistent'); return {
    empty: !!document.querySelector('[data-detail=hero] .c-state--empty'), actions: document.querySelectorAll('[data-detail=hero] .c-state__actions a').length,
    hidden: Array.from(document.querySelectorAll('main > section[data-detail]')).every((x) => x.hidden), title: document.title }; });
  ok('unknown service → empty state with actions, sections hidden', r.empty && r.actions === 2 && r.hidden, JSON.stringify(r));
  ok('unknown service → title says so', /غير موجودة/.test(r.title), r.title);
  // loading + error
  r = await p.evaluate(async () => {
    const R = window.no.detail.region; const host = document.querySelector('[data-detail=hero]');
    R.loading(); const loading = host.getAttribute('aria-busy') === 'true' && host.querySelectorAll('.c-skeleton').length > 0;
    R.error(); const error = !!host.querySelector('.c-state--error[role=alert]') && host.querySelectorAll('.c-state__actions .c-btn').length >= 1;
    await window.no.detail.reload(); const content = !!host.querySelector('h1') && host.getAttribute('aria-busy') === 'false';
    return { loading, error, content };
  });
  ok('hero region: loading / error / success', r.loading && r.error && r.content, JSON.stringify(r));
  // missing detail content → hero + note + CTA, other sections hidden
  r = await p.evaluate(async () => {
    const m = await import('./assets/js/foundation.js');
    const api = m.mountServiceDetail({ slug: 'flights', load: async () => ({ ...m.getServiceDetail('flights'), detail: null }) });
    await new Promise((res) => setTimeout(res, 50));
    return { h1: !!document.querySelector('h1'), note: !!document.querySelector('[data-detail=overview] .c-note'),
      hiddenFeatures: document.querySelector('[data-detail=features]').hidden, cta: !!document.querySelector('[data-detail=cta] .c-btn--primary'),
      related: document.querySelectorAll('[data-detail=related] .c-service-card').length };
  });
  ok('missing detail content → hero, neutral note, related by category, CTA; no empty sections', r.h1 && r.note && r.hiddenFeatures && r.cta && r.related >= 1, JSON.stringify(r));
  await p.evaluate(() => window.no.detail.reload()); await p.waitForTimeout(300);
  // locale switch keeps one of everything and translates the head
  await p.evaluate(async () => { const m = await import('./assets/js/foundation.js'); m.setLocale('en'); }); await p.waitForTimeout(800);
  r = await p.evaluate(() => ({ h: document.querySelectorAll('.c-gh').length, f: document.querySelectorAll('.c-gf').length, h1: document.querySelectorAll('h1').length, title: document.title, desc: document.querySelector('meta[name=description]').content }));
  ok('locale switch: one header/footer/h1, English title + description', r.h === 1 && r.f === 1 && r.h1 === 1 && /Flight tickets — Number One/.test(r.title) && /^We /.test(r.desc), JSON.stringify(r));
  await p.evaluate(async () => { const m = await import('./assets/js/foundation.js'); m.setLocale('ar'); }); await p.waitForTimeout(600);

  // CTA links resolve: hero primary → booking entry with the right tab; related card → detail route
  const primaryHref = await p.getAttribute('[data-detail=hero] .c-btn--primary', 'href');
  await p.goto(ORIGIN + primaryHref, { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  r = await p.evaluate(() => ({ tab: document.querySelector('.c-search__tab[aria-selected=true]')?.dataset.tabId, path: location.pathname }));
  ok('hero CTA lands on the booking entry with the flights tab', r.path.endsWith('/mashhor-demo/book/') && r.tab === 'flights', JSON.stringify(r));
  await p.goto(ORIGIN + '/mashhor-demo/services/flights/', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  const relatedHref = await p.getAttribute('[data-detail=related] .c-service-card .c-card__link', 'href');
  await p.goto(ORIGIN + relatedHref, { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  r = await p.evaluate(() => ({ h1: document.querySelector('h1')?.textContent.trim(), path: location.pathname }));
  ok('related card opens another detail page', /\/services\/[a-z-]+\/$/.test(r.path) && !!r.h1 && r.h1 !== 'تذاكر الطيران', JSON.stringify(r));
  // breadcrumb "services" link
  await p.goto(ORIGIN + '/mashhor-demo/services/flights/', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  await p.click('.c-breadcrumb li:nth-child(3) a'); await p.waitForTimeout(800);
  ok('breadcrumb "services" goes to the services page', p.url().endsWith('/mashhor-demo/services/'), p.url());

  // keyboard: skip link, focus rings through the hero
  await p.goto(ORIGIN + '/mashhor-demo/services/flights/', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  await p.keyboard.press('Tab');
  ok('first Tab is the skip link', await p.evaluate(() => document.activeElement.hasAttribute('data-skip')));
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ok('skip link focuses main on this page', await p.evaluate(() => document.activeElement.id === 'main' && location.pathname.endsWith('/services/flights/')));
  const seen = [];
  for (let i = 0; i < 7; i++) { await p.keyboard.press('Tab'); seen.push(await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { name: a.className.split(' ')[0] || a.tagName, ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 }; })); }
  ok('Tab reaches breadcrumb links then the hero CTAs', seen.some((s) => s.name === 'c-breadcrumb__link') && seen.some((s) => s.name === 'c-btn'), seen.map((s) => s.name).join('>'));
  ok('every focused control shows a focus ring', seen.every((s) => s.ring), seen.filter((s) => !s.ring).map((s) => s.name).join(','));
  await p.close();
}

// ---------------------------------------------------------------- invalid route → the branded 404 (GitHub serves it; locally the server's own 404)
{
  const p = await b.newPage();
  const resp = await p.goto(ORIGIN + '/mashhor-demo/services/nonexistent/', { waitUntil: 'load' });
  ok('invalid service URL returns 404 status', resp.status() === 404, `${resp.status()}`);
  // and the branded 404 page renders for that path when served as GitHub Pages does
  await p.goto(ORIGIN + '/mashhor-demo/404.html', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  const r = await p.evaluate(() => ({ h1: document.querySelector('h1')?.textContent.trim(), chips: document.querySelectorAll('#service-links a').length, base: document.baseURI }));
  ok('branded 404 offers the services and resolves the site root', !!r.h1 && r.chips >= 6 && r.base.endsWith('/mashhor-demo/'), JSON.stringify(r));
  await p.close();
}

await b.close();
console.log(`\n${pass}/${pass + fail} service-detail checks passed`);
console.log('errors:', errs.length ? errs : 'none');
process.exit(fail || errs.length ? 1 : 0);
