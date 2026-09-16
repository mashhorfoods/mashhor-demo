// Stage 10.5 services page verification — structure, states, interaction,
// a11y, three widths, both directions, plus the homepage deep link. Exits 1 on any ✗.
import './env.mjs';
import { chromium } from 'playwright';
const URL = process.env.TEST_ORIGIN + '/mashhor-demo/services/';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let pass = 0, fail = 0;
const ok = (name, cond, note = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} ${note}`); } };
const errs = [];

async function open(width, height, locale, url = URL) {
  const p = await b.newPage({ viewport: { width, height } });
  p.on('pageerror', e => errs.push(`${width}/${locale} pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${width}/${locale} console: ${m.text()}`); });
  p.on('requestfailed', r => errs.push(`${width}/${locale} reqfail: ${r.url()}`));
  p.on('response', r => { if (r.status() >= 400) errs.push(`${width}/${locale} HTTP ${r.status()} ${r.url()}`); });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(async (l) => { const m = await import('./assets/js/foundation.js'); await m.setLocale(l); }, locale);
  await p.waitForTimeout(700);
  return p;
}
const inView = (p) => p.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });

// ---------------------------------------------------------------- structure × widths × locales
for (const [w, h, tag] of [[390, 844, 'mobile'], [834, 1100, 'tablet'], [1440, 1000, 'desktop']]) {
  for (const loc of ['ar', 'en']) {
    const p = await open(w, h, loc);
    const r = await p.evaluate(() => {
      const vis = (sel) => Array.from(document.querySelectorAll(sel)).filter((n) => n.checkVisibility());
      const headings = Array.from(document.querySelectorAll('h1,h2,h3')).map((h) => Number(h.tagName[1]));
      let jumps = 0; for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) jumps++;
      const small = Array.from(document.querySelectorAll('main p, main a, main button, main span')).filter((n) => n.checkVisibility() && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 12).length;
      const targets = vis('main a[href], main button').filter((n) => n.getBoundingClientRect().height < 40 && !n.classList.contains('c-card__link') && !n.classList.contains('c-service-card__details')).map((n) => n.className.split(' ')[0] + ':' + Math.round(n.getBoundingClientRect().height));
      const cards = Array.from(document.querySelectorAll('.c-service-card'));
      const groups = ['core', 'programmes', 'specialised', 'tickets'].map((id) => document.querySelectorAll(`[data-services="group-${id}"] .c-service-card`).length);
      const catnav = document.querySelector('.c-catnav');
      const navRect = catnav.getBoundingClientRect();
      return {
        dir: document.documentElement.dir, base: document.baseURI,
        hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        h1: document.querySelectorAll('h1').length, jumps,
        cards: cards.length, groups,
        kinds: cards.map((c) => c.querySelector('.c-service-card__kind')?.textContent.trim()).filter(Boolean).length,
        kindIcons: cards.every((c) => c.querySelector('.c-service-card__kind .c-icon')),
        ctas: cards.filter((c) => c.querySelector('.c-card__action.c-btn')).length,
        details: cards.filter((c) => c.querySelector('.c-service-card__details')).length,
        detailHrefs: cards.every((c) => /\/mashhor-demo\/services\/[a-z-]+\/$/.test(c.querySelector('.c-card__link').getAttribute('href'))),
        entryHrefs: cards.every((c) => /\/mashhor-demo\/book\/\?vertical=[a-z]+(&service=[a-z]+)?$/.test(c.querySelector('.c-card__action.c-btn').getAttribute('href'))),
        primaries: vis('.c-btn--primary').map((n) => n.textContent.trim()),
        chips: document.querySelectorAll('.c-catnav__chip').length,
        navFits: navRect.right <= innerWidth + 1 && navRect.left >= -1,
        chipRowScroll: getComputedStyle(document.querySelector('.c-catnav__row')).overflowX,
        legend: document.querySelectorAll('.c-kinds__item').length,
        help: document.querySelectorAll('.c-help__option').length,
        helpLinks: document.querySelectorAll('a.c-help__option').length, helpButtons: document.querySelectorAll('button.c-help__option').length,
        support: document.querySelectorAll('[data-services=support] .c-support__panel').length,
        placeholderContacts: document.querySelectorAll('a[href^="tel:"], a[href*="wa.me"], a[href^="mailto:"]').length,
        placeholderText: /\+249|wa\.me|XXXX/.test(document.body.innerText),
        header: !!document.querySelector('.c-gh'), footer: !!document.querySelector('.c-gf'),
        current: document.querySelector('.c-gh [aria-current="page"], .c-gh .is-current, .c-gh__nav-link[aria-current]')?.textContent.trim(),
        imgsNoAlt: document.querySelectorAll('img:not([alt])').length,
        decorative: Array.from(document.querySelectorAll('.c-hero__route, .c-help__arrow')).every((n) => n.getAttribute('aria-hidden') === 'true'),
        small, targets,
        heroH: Math.round(document.querySelector('.c-hero').getBoundingClientRect().height),
        title: document.title, desc: document.querySelector('meta[name=description]').content,
        canonical: document.querySelector('link[rel=canonical]').href,
        skipTarget: document.querySelector('[data-skip]').getAttribute('href'),
        menuServices: document.querySelectorAll('.c-gh a[href*="/services/"]').length,
      };
    });
    const T = `${tag}/${loc}`;
    ok(`${T} dir`, r.dir === (loc === 'ar' ? 'rtl' : 'ltr'));
    ok(`${T} base resolves to site root`, r.base.endsWith('/mashhor-demo/'), r.base);
    ok(`${T} no h-scroll`, !r.hScroll);
    ok(`${T} one h1, ordered headings`, r.h1 === 1 && r.jumps === 0, `${r.h1}/${r.jumps}`);
    ok(`${T} 13 services in 4 groups`, r.cards === 13 && r.groups.join() === '3,4,3,3', r.groups.join());
    ok(`${T} every card carries a kind badge with icon + word`, r.kinds === 13 && r.kindIcons);
    ok(`${T} every card has a CTA and a details link`, r.ctas === 13 && r.details === 13);
    ok(`${T} detail routes are future service pages`, r.detailHrefs);
    ok(`${T} CTAs deep-link into the booking entry`, r.entryHrefs);
    ok(`${T} one primary in hero (+ header)`, r.primaries.length <= 3 && r.primaries.length >= 1, r.primaries.join('|'));
    ok(`${T} category nav: 5 chips, fits viewport`, r.chips === 5 && r.navFits);
    if (tag === 'mobile') ok(`${T} chip row scrolls on phone`, r.chipRowScroll === 'auto');
    ok(`${T} kind legend (3)`, r.legend === 3);
    ok(`${T} help me choose: 5 options, 4 links + 1 in-page`, r.help === 5 && r.helpLinks === 4 && r.helpButtons === 1);
    ok(`${T} support panels, no placeholder contacts`, r.support === 2 && r.placeholderContacts === 0 && !r.placeholderText);
    ok(`${T} header + footer present`, r.header && r.footer);
    ok(`${T} header mega menu lists the 13 services`, r.menuServices >= 13, `${r.menuServices}`);
    ok(`${T} alt on images, decorative hidden`, r.imgsNoAlt === 0 && r.decorative);
    ok(`${T} no tiny text`, r.small === 0, `${r.small}`);
    ok(`${T} touch targets ≥40`, r.targets.length === 0, r.targets.slice(0, 4).join(' '));
    if (tag === 'mobile') ok(`${T} hero does not consume the screen`, r.heroH < 844, `${r.heroH}`);
    ok(`${T} title / description / canonical`, (loc === 'ar' ? /خدماتنا/.test(r.title) && /خدمات/.test(r.desc) : /services/i.test(r.title) && /service/i.test(r.desc)) && r.canonical.endsWith('/mashhor-demo/services/'), `${r.title} | ${r.desc.slice(0,30)} | ${r.canonical}`);
    await p.close();
  }
}

// ---------------------------------------------------------------- interaction + states (desktop ar)
{
  const p = await open(1440, 1000, 'ar');
  // category filter
  await p.click('.c-catnav__chip[data-category="tickets"]');
  await p.waitForTimeout(900);
  let r = await p.evaluate(() => ({
    hidden: ['core', 'programmes', 'specialised', 'tickets'].map((id) => document.querySelector(`[data-services="group-${id}"]`).hidden ? 1 : 0).join(''),
    pressed: document.querySelector('.c-catnav__chip[aria-pressed="true"]').dataset.category,
    top: document.querySelector('#group-tickets').getBoundingClientRect().top,
    current: window.no.services.current,
  }));
  ok('category chip filters to that group', r.hidden === '1110' && r.pressed === 'tickets' && r.current === 'tickets', JSON.stringify(r));
  ok('and scrolls it into view, clear of the sticky bars', r.top >= 60 && r.top < 320, `${r.top}`);
  await p.click('.c-catnav__chip[data-category="all"]');
  await p.waitForTimeout(500);
  r = await p.evaluate(() => ['core', 'programmes', 'specialised', 'tickets'].every((id) => !document.querySelector(`[data-services="group-${id}"]`).hidden));
  ok('"all" restores every group', r);

  // sticky nav
  await p.evaluate(() => window.scrollTo(0, 2500)); await p.waitForTimeout(300);
  r = await p.evaluate(() => { const n = document.querySelector('.c-catnav').getBoundingClientRect(); const h = document.querySelector('.c-gh').getBoundingClientRect(); return { navTop: Math.round(n.top), headerBottom: Math.round(h.bottom) }; });
  ok('category nav sticks under the header on desktop', Math.abs(r.navTop - r.headerBottom) <= 2, JSON.stringify(r));

  // help: in-page option scrolls to support
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('button.c-help__option'); await p.waitForTimeout(1000);
  r = await p.evaluate(() => document.querySelector('#support').getBoundingClientRect().top);
  ok('help option "need help choosing" moves to human support', r >= -5 && r < 200, `${r}`);

  // states on every group region
  for (const region of ['core', 'programmes', 'specialised', 'tickets']) {
    const s = await p.evaluate(async (region) => {
      const R = window.no.services.regions[region];
      const host = document.querySelector(`[data-services="group-${region}"] [data-services-grid]`);
      const out = {};
      R.loading(); out.loading = host.getAttribute('aria-busy') === 'true' && host.querySelectorAll('.c-skeleton').length > 0;
      R.empty();   out.empty = !!host.querySelector('.c-state--empty') && host.querySelectorAll('.c-state__actions .c-btn').length > 0;
      R.error();   out.error = !!host.querySelector('.c-state--error[role=alert]') && host.querySelectorAll('.c-state__actions .c-btn').length >= 1;
      await window.no.services.reload(); out.content = host.getAttribute('aria-busy') === 'false' && host.querySelectorAll('.c-service-card').length >= 3;
      return out;
    }, region);
    ok(`${region}: loading/empty/error/success`, s.loading && s.empty && s.error && s.content, JSON.stringify(s));
  }
  // empty-state action restores "all"
  await p.click('.c-catnav__chip[data-category="core"]'); await p.waitForTimeout(400);
  await p.evaluate(() => window.no.services.regions.core.empty());
  await p.click('[data-services="group-core"] .c-state__actions .c-btn'); await p.waitForTimeout(400);
  r = await p.evaluate(() => window.no.services.current);
  ok('empty state action shows all services', r === 'all', r);

  // locale switch: single header/footer/nav, content re-rendered
  await p.evaluate(async () => { const m = await import('./assets/js/foundation.js'); await m.setLocale('en'); });
  await p.waitForTimeout(700);
  r = await p.evaluate(() => ({ h: document.querySelectorAll('.c-gh').length, f: document.querySelectorAll('.c-gf').length, n: document.querySelectorAll('.c-catnav').length, cards: document.querySelectorAll('.c-service-card').length, h1: document.querySelector('h1').textContent }));
  ok('locale switch keeps one header, footer, nav; 13 cards', r.h === 1 && r.f === 1 && r.n === 1 && r.cards === 13, JSON.stringify(r));
  ok('locale switch: English hero', /Everything your trip needs/.test(r.h1));

  // skip link stays on this page (base would send it home)
  await p.goto(URL, { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  await p.keyboard.press('Tab');   // first tab stop on a fresh page is the skip link
  ok('first Tab reaches the skip link', await p.evaluate(() => document.activeElement.hasAttribute('data-skip')));
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  r = await p.evaluate(() => ({ path: location.pathname, focused: document.activeElement.id }));
  ok('skip link focuses main on this page', r.path.endsWith('/services/') && r.focused === 'main', JSON.stringify(r));
  await p.close();
}

// ---------------------------------------------------------------- service CTA → homepage booking entry
{
  const p = await open(1440, 1000, 'ar');
  const href = await p.getAttribute('[data-services="group-tickets"] .c-service-card .c-card__action.c-btn', 'href');
  await p.goto(process.env.TEST_ORIGIN + '' + href, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => ({
    tab: document.querySelector('.c-search__tab[aria-selected=true]')?.dataset.tabId,
    option: document.querySelector('.c-search__form:not([hidden]) select[name=service]')?.value,
    focused: document.activeElement?.tagName, path: location.pathname,
  }));
  ok('ticket CTA opens the booking entry on "other services" with the ticket preselected', r.path.endsWith('/mashhor-demo/book/') && r.tab === 'other' && r.option === 'issue', JSON.stringify(r));
  ok('and lands in the booking entry', r.focused === 'SELECT' || r.focused === 'INPUT', r.focused);
  const href2 = '/mashhor-demo/book/?vertical=hotels';
  await p.goto(process.env.TEST_ORIGIN + '' + href2, { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  const tab = await p.evaluate(() => document.querySelector('.c-search__tab[aria-selected=true]')?.dataset.tabId);
  ok('hotel CTA opens the hotels tab', tab === 'hotels', tab);
  await p.close();
}

// ---------------------------------------------------------------- keyboard (desktop ar)
{
  const p = await open(1440, 1000, 'ar');
  await p.focus('.c-catnav__chip[data-category="all"]');
  const seen = [];
  for (let i = 0; i < 8; i++) {
    await p.keyboard.press('Tab');
    seen.push(await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { name: a.className.split(' ')[0] || a.tagName, ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, text: a.textContent.trim().slice(0, 20) }; }));
  }
  ok('Tab moves through chips into the first card controls', seen.filter((s) => s.name === 'c-chip').length === 4 && seen.some((s) => s.name === 'c-card__link'), seen.map((s) => s.name).join('>'));
  ok('every focused control shows a focus ring', seen.every((s) => s.ring), seen.filter((s) => !s.ring).map((s) => s.name).join(','));
  // card CTA reachable and clickable above the stretched link
  await p.focus('.c-service-card .c-card__action.c-btn');
  const clickable = await p.evaluate(() => { const b = document.querySelector('.c-service-card .c-card__action.c-btn'); b.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return b.contains(hit) || hit === b; });
  ok('card CTA sits above the stretched title link', clickable);
  await p.keyboard.press('Enter'); await p.waitForTimeout(800);
  ok('Enter on a card CTA navigates to the booking entry', (await p.evaluate(() => location.pathname + location.search)).includes('/book/?vertical='));
  await p.close();
}

// ---------------------------------------------------------------- mobile menu still works here
{
  const p = await open(390, 844, 'ar');
  await p.click('.c-gh__mobile-only'); await p.waitForTimeout(400);
  const d = await p.evaluate(() => ({ open: document.querySelector('.c-gh__drawer')?.dataset.open, links: document.querySelectorAll('.c-gh__drawer a[href*="/services/"]').length }));
  ok('mobile drawer opens on the services page and lists the services', d.open === 'true' && d.links >= 13, JSON.stringify(d));
  await p.close();
}

await b.close();
console.log(`\n${pass}/${pass + fail} services checks passed`);
console.log('errors:', errs.length ? errs : 'none');
process.exit(fail || errs.length ? 1 : 0);
