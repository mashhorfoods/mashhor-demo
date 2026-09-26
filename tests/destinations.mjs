// Stage 10.7 destinations page verification — structure, search states,
// region nav, featured, purposes, help, CTA, a11y, three widths, both
// directions, plus the homepage deep link. Exits 1 on any ✗.
import { launch, makeCtx } from './env.mjs';
const URL = process.env.TEST_ORIGIN + '/mashhor-demo/destinations/';
const b = await launch();
let pass = 0, fail = 0;
const ok = (name, cond, note = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} ${note}`); } };
const errs = [];

// The failing-search test throws "boom" on purpose; the page logs it as it should.
const ctx = makeCtx(b, errs, { ignore: /boom/, requestFailed: true });
// Loads in Arabic, then switches language at runtime (what the header's language control does).
async function open(width, height, locale, url = URL) {
  const { p } = await ctx(width, height);
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(async (l) => { const m = await import('./assets/js/foundation.js'); await m.setLocale(l); }, locale);
  await p.waitForTimeout(700);
  return p;
}

// ---------------------------------------------------------------- structure × widths × locales
for (const [w, h, tag] of [[390, 844, 'mobile'], [834, 1100, 'tablet'], [1440, 1000, 'desktop']]) {
  for (const loc of ['ar', 'en']) {
    const p = await open(w, h, loc);
    const r = await p.evaluate(() => {
      const vis = (sel) => Array.from(document.querySelectorAll(sel)).filter((n) => n.checkVisibility());
      const headings = Array.from(document.querySelectorAll('h1,h2,h3')).filter((x) => x.checkVisibility()).map((x) => Number(x.tagName[1]));
      let jumps = 0; for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) jumps++;
      const small = Array.from(document.querySelectorAll('main p, main a, main button, main span, main li')).filter((n) => n.checkVisibility() && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 12).length;
      const targets = vis('main a[href], main button').filter((n) => n.getBoundingClientRect().height < 40 && !n.classList.contains('c-card__link')).map((n) => n.className.split(' ')[0] + ':' + Math.round(n.getBoundingClientRect().height));
      const cards = Array.from(document.querySelectorAll('[data-destinations=popular] .c-dest'));
      const media = cards.map((c) => c.querySelector('.c-card__media').getBoundingClientRect()).map((x) => +(x.width / x.height).toFixed(2));
      const regionChips = Array.from(document.querySelectorAll('[data-destinations=region-nav] .c-chip'));
      return {
        dir: document.documentElement.dir, base: document.baseURI,
        hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        h1: document.querySelectorAll('h1').length, jumps,
        title: document.title, desc: document.querySelector('meta[name=description]').content, canonical: document.querySelector('link[rel=canonical]').href,
        heroPrimary: document.querySelector('[data-destinations=hero] .c-btn--primary')?.textContent.trim(),
        heroSecondary: document.querySelector('[data-destinations=hero] .c-btn--tertiary')?.textContent.trim(),
        primaries: vis('.c-btn--primary').map((n) => n.textContent.trim()),
        searchTabs: Array.from(document.querySelectorAll('.c-search__tabs')).filter((n) => n.checkVisibility()).length,
        searchFields: Array.from(document.querySelectorAll('.c-search__form .c-field__label')).map((l) => l.textContent.trim()),
        optionalMarks: document.querySelectorAll('.c-search__form .c-field__optional').length,
        regionOptions: document.querySelectorAll('.c-search__form select[name=region] option').length,
        purposeOptions: document.querySelectorAll('.c-search__form select[name=purpose] option').length,
        submitClass: document.querySelector('.c-search__form button[type=submit]').className,
        resultsHidden: document.querySelector('[data-destinations=results]').hidden,
        cards: cards.length, mediaRatios: media,
        cardBits: cards.every((c) => c.querySelector('.c-dest__country') && c.querySelector('.c-dest__name a') && c.querySelector('.c-dest__desc') && c.querySelectorAll('.c-dest__service').length >= 1 && c.querySelector('.c-card__action')),
        cardCta: cards[0]?.querySelector('.c-card__action')?.textContent.trim(),
        cardHrefs: cards.every((c) => /\/mashhor-demo\/destinations\/[a-z-]+\/$/.test(c.querySelector('.c-dest__name a').getAttribute('href'))),
        entryHrefs: cards.every((c) => /\/mashhor-demo\/book\/\?vertical=flights&to=[a-z-]+$/.test(c.querySelector('.c-card__action').getAttribute('href'))),
        disclose: !!document.querySelector('[data-destinations=popular] .c-disclose button'),
        regionChips: regionChips.length, regionCounts: regionChips.map((c) => c.querySelector('.c-chip__count').textContent),
        regionPressed: regionChips.find((c) => c.getAttribute('aria-pressed') === 'true')?.dataset.region,
        regionCards: document.querySelectorAll('[data-destinations=region-grid] .c-dest').length,
        featured: document.querySelectorAll('[data-destinations=featured] .c-dest').length,
        featuredLead: !!document.querySelector('[data-destinations=featured] .c-featured__lead .c-dest--large'),
        purposes: document.querySelectorAll('[data-destinations=purposes] .c-help__option').length,
        helpCta: document.querySelector('[data-destinations=help] a.c-btn')?.getAttribute('href'),
        placeholders: document.querySelectorAll('a[href^="tel:"], a[href*="wa.me"], a[href^="mailto:"]').length + (/\+249|wa\.me|XXXX/.test(document.body.innerText) ? 1 : 0),
        claims: /الأكثر طلباً|الأفضل|الأرخص|most popular|best|cheapest|\d+\s?(ج\.س|SDG|USD)/i.test(document.querySelector('main').innerText),
        imgsNoAlt: document.querySelectorAll('img:not([alt])').length,
        mediaLabelled: Array.from(document.querySelectorAll('.c-card__media [role=img]')).every((n) => n.getAttribute('aria-label')),
        decorative: Array.from(document.querySelectorAll('.c-hero__route, .c-help__arrow')).every((n) => n.getAttribute('aria-hidden') === 'true'),
        header: !!document.querySelector('.c-gh'), footer: !!document.querySelector('.c-gf'), footerCta: !!document.querySelector('.c-gf__cta'),
        menuDest: document.querySelectorAll('.c-gh a[href*="/destinations/"]').length,
        menuClaim: /الأكثر طلباً|Most popular/.test(document.querySelector('.c-gh').innerText),
        small, targets,
        chipRowScroll: getComputedStyle(document.querySelector('[data-destinations=region-nav] .c-catnav__row')).overflowX,
        heroH: Math.round(document.querySelector('.c-hero').getBoundingClientRect().height),
      };
    });
    const T = `${tag}/${loc}`;
    ok(`${T} dir + base`, r.dir === (loc === 'ar' ? 'rtl' : 'ltr') && r.base.endsWith('/mashhor-demo/'));
    ok(`${T} no h-scroll`, !r.hScroll);
    ok(`${T} one h1, ordered headings`, r.h1 === 1 && r.jumps === 0, `${r.h1}/${r.jumps}`);
    ok(`${T} title / description / canonical`, (loc === 'ar' ? /الوجهات/.test(r.title) && /وجهت/.test(r.desc) : /Destinations/.test(r.title) && /destination/i.test(r.desc)) && r.canonical.endsWith('/mashhor-demo/destinations/'), `${r.title}`);
    ok(`${T} hero CTAs`, r.heroPrimary === (loc === 'ar' ? 'استكشف الوجهات' : 'Explore destinations') && r.heroSecondary === (loc === 'ar' ? 'ساعدني في الاختيار' : 'Help me choose'), `${r.heroPrimary}|${r.heroSecondary}`);
    ok(`${T} red rationed: hero + footer (+ header)`, r.primaries.length <= 3, r.primaries.join('|'));
    ok(`${T} search: no tab strip, 4 fields, no optional noise, quiet submit`, r.searchTabs === 0 && r.searchFields.length === 4 && r.optionalMarks === 0 && /secondary-brand/.test(r.submitClass), `${r.searchFields.join('|')} ${r.optionalMarks}`);
    ok(`${T} search selects come from the registry (6 regions + any, 6 purposes + any)`, r.regionOptions === 7 && r.purposeOptions === 7, `${r.regionOptions}/${r.purposeOptions}`);
    ok(`${T} results hidden by default`, r.resultsHidden);
    ok(`${T} 6 cards first, show-all present`, r.cards === 6 && r.disclose, `${r.cards}`);
    ok(`${T} card anatomy: country, name link, desc, service chips, CTA "${loc === 'ar' ? 'استكشف' : 'Explore'}"`, r.cardBits && r.cardCta === (loc === 'ar' ? 'استكشف' : 'Explore'), `${r.cardCta}`);
    ok(`${T} card routes: title → detail slug, CTA → booking entry with "to"`, r.cardHrefs && r.entryHrefs);
    ok(`${T} card images keep one ratio`, r.mediaRatios.every((x) => Math.abs(x - r.mediaRatios[0]) < 0.05), r.mediaRatios.join(','));
    ok(`${T} region nav: 6 structural regions with counts, first populated pressed`, r.regionChips === 6 && r.regionCounts.join(',') === '4,3,2,2,0,0' && r.regionPressed === 'middleEast', `${r.regionCounts.join(',')} ${r.regionPressed}`);
    if (tag === 'mobile') ok(`${T} region chips scroll on phone`, r.chipRowScroll === 'auto');
    ok(`${T} region grid shows that region`, r.regionCards === 4, `${r.regionCards}`);
    ok(`${T} featured: large lead + 2 supporting`, r.featured === 3 && r.featuredLead, `${r.featured}`);
    ok(`${T} 6 purposes`, r.purposes === 6);
    ok(`${T} help entry → services help section`, /\/services\/#help$/.test(r.helpCta), `${r.helpCta}`);
    ok(`${T} no placeholder contacts, no claims or prices`, r.placeholders === 0 && !r.claims);
    ok(`${T} alt / labelled media / decorative hidden`, r.imgsNoAlt === 0 && r.mediaLabelled && r.decorative);
    ok(`${T} header (menu lists 11 destinations, no "most popular"), footer with its own CTA`, r.header && r.footer && r.footerCta && r.menuDest >= 11 && !r.menuClaim, `${r.menuDest} ${r.menuClaim}`);
    ok(`${T} no tiny text, targets ≥40`, r.small === 0 && r.targets.length === 0, `${r.small} ${r.targets.slice(0, 3).join(' ')}`);
    if (tag === 'mobile') ok(`${T} hero does not consume the screen`, r.heroH < 844, `${r.heroH}`);
    await p.close();
  }
}

// ---------------------------------------------------------------- search + states + interaction (desktop ar)
{
  const p = await open(1440, 1000, 'ar');
  // search by name → results
  await p.fill('.c-search__form input[name=destination]', 'دبي');
  await p.click('.c-search__form button[type=submit]'); await p.waitForTimeout(900);
  let r = await p.evaluate(() => ({ hidden: document.querySelector('[data-destinations=results]').hidden, n: document.querySelectorAll('[data-destinations=results] .c-dest').length, title: document.querySelector('[data-destinations-results-title]').textContent, top: document.querySelector('#results').getBoundingClientRect().top }));
  ok('search by name shows matching results', !r.hidden && r.n === 1 && /واحدة/.test(r.title), JSON.stringify(r));
  // English name matches too
  await p.fill('.c-search__form input[name=destination]', 'lon');
  await p.click('.c-search__form button[type=submit]'); await p.waitForTimeout(600);
  r = await p.evaluate(() => document.querySelectorAll('[data-destinations=results] .c-dest').length);
  ok('search matches the other language too', r === 1, `${r}`);
  // region + purpose filters
  await p.fill('.c-search__form input[name=destination]', '');
  await p.selectOption('.c-search__form select[name=region]', 'africa');
  await p.selectOption('.c-search__form select[name=purpose]', 'medical');
  await p.click('.c-search__form button[type=submit]'); await p.waitForTimeout(600);
  r = await p.evaluate(() => Array.from(document.querySelectorAll('[data-destinations=results] .c-dest .c-dest__name')).map((n) => n.textContent.trim()));
  ok('region + purpose filter combine', r.length === 1 && r[0] === 'القاهرة', r.join(','));
  // empty with actions; reset restores
  await p.fill('.c-search__form input[name=destination]', 'zzz');
  await p.click('.c-search__form button[type=submit]'); await p.waitForTimeout(600);
  r = await p.evaluate(() => ({ empty: !!document.querySelector('[data-destinations=results] .c-state--empty'), actions: document.querySelectorAll('[data-destinations=results] .c-state__actions .c-btn').length }));
  ok('no match → empty state with reset + expert actions', r.empty && r.actions === 2, JSON.stringify(r));
  await p.click('[data-destinations=results] .c-state__actions .c-btn--primary'); await p.waitForTimeout(500);
  r = await p.evaluate(() => ({ hidden: document.querySelector('[data-destinations=results]').hidden, q: document.querySelector('.c-search__form input[name=destination]').value, region: document.querySelector('.c-search__form select[name=region]').value }));
  ok('reset clears the form and hides results', r.hidden && r.q === '' && r.region === '', JSON.stringify(r));
  // loading + error on results (via a failing search)
  r = await p.evaluate(async () => {
    const m = await import('./assets/js/foundation.js');
    const api = m.mountDestinations({ search: async () => { throw new Error('boom'); } });
    await new Promise((res) => setTimeout(res, 100));
    await api.search({ q: 'x' });
    const host = document.querySelector('[data-destinations=results] [data-destinations-body]');
    return { error: !!host.querySelector('.c-state--error[role=alert]'), actions: host.querySelectorAll('.c-state__actions .c-btn').length };
  });
  ok('search failure → error state with actions', r.error && r.actions >= 1, JSON.stringify(r));
  await p.evaluate(async () => { const m = await import('./assets/js/foundation.js'); window.no.destinations = m.mountDestinations(); await new Promise((res) => setTimeout(res, 100)); });
  // region chips: empty region → empty state; back to populated
  await p.click('[data-destinations=region-nav] .c-chip[data-region=americas]'); await p.waitForTimeout(300);
  r = await p.evaluate(() => ({ empty: !!document.querySelector('[data-destinations=region-grid] .c-state--empty'), actions: document.querySelectorAll('[data-destinations=region-grid] .c-state__actions .c-btn').length, pressed: document.querySelector('[data-destinations=region-nav] .c-chip[aria-pressed=true]').dataset.region }));
  ok('empty region → empty state with next actions', r.empty && r.actions === 2 && r.pressed === 'americas', JSON.stringify(r));
  await p.click('[data-destinations=region-nav] .c-chip[data-region=asia]'); await p.waitForTimeout(300);
  r = await p.evaluate(() => Array.from(document.querySelectorAll('[data-destinations=region-grid] .c-dest .c-dest__name')).map((n) => n.textContent.trim()));
  ok('asia shows its two destinations', r.length === 2, r.join(','));
  // states on every region
  for (const region of ['popular', 'region', 'featured']) {
    const s = await p.evaluate(async (region) => {
      const R = window.no.destinations.regions[region];
      const host = document.querySelector(region === 'region' ? '[data-destinations=region-grid]' : `[data-destinations=${region}]`);
      const out = {};
      R.loading(); out.loading = host.getAttribute('aria-busy') === 'true' && host.querySelectorAll('.c-skeleton').length > 0;
      R.empty();   out.empty = !!host.querySelector('.c-state--empty') && host.querySelectorAll('.c-state__actions .c-btn').length > 0;
      R.error();   out.error = !!host.querySelector('.c-state--error[role=alert]') && host.querySelectorAll('.c-state__actions .c-btn').length >= 1;
      await window.no.destinations.reload(); out.content = host.getAttribute('aria-busy') === 'false' && host.querySelectorAll('.c-dest').length >= 1;
      return out;
    }, region);
    ok(`${region}: loading/empty/error/success`, s.loading && s.empty && s.error && s.content, JSON.stringify(s));
  }
  // featured degrades: one record → lead only
  r = await p.evaluate(async () => {
    const m = await import('./assets/js/foundation.js');
    const one = m.featuredBlock([m.DESTINATION_REGISTRY[0]]); const two = m.featuredBlock(m.DESTINATION_REGISTRY.slice(0, 2)); const none = m.featuredBlock([]);
    return { one: one.dataset.count === '1' && !one.querySelector('.c-featured__side'), two: two.dataset.count === '2' && two.querySelectorAll('.c-featured__side .c-dest').length === 1, none: none === null };
  });
  ok('featured block degrades by count (1, 2, 0)', r.one && r.two && r.none, JSON.stringify(r));
  // show all
  await p.click('[data-destinations=popular] .c-disclose button'); await p.waitForTimeout(300);
  r = await p.evaluate(() => document.querySelectorAll('[data-destinations=popular] .c-dest').length);
  ok('show all reveals every destination (11)', r === 11, `${r}`);
  // purpose tile → search on that purpose
  await p.click('[data-destinations=purposes] .c-help__option[data-purpose=umrah]'); await p.waitForTimeout(900);
  r = await p.evaluate(() => ({ hidden: document.querySelector('[data-destinations=results]').hidden, n: document.querySelectorAll('[data-destinations=results] .c-dest').length, select: document.querySelector('.c-search__form select[name=purpose]').value }));
  ok('purpose tile runs a purpose search and syncs the select', !r.hidden && r.n === 2 && r.select === 'umrah', JSON.stringify(r));
  // hero buttons scroll
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('[data-destinations=hero] .c-btn--tertiary'); await p.waitForTimeout(1000);
  r = await p.evaluate(() => document.querySelector('#help').getBoundingClientRect().top);
  ok('hero "help me choose" moves to the help band', r >= -5 && r < 300, `${r}`);
  // locale switch: one of everything, English strings, registry-driven selects translated
  await p.evaluate(async () => { const m = await import('./assets/js/foundation.js'); await m.setLocale('en'); }); await p.waitForTimeout(800);
  r = await p.evaluate(() => ({ h: document.querySelectorAll('.c-gh').length, f: document.querySelectorAll('.c-gf').length, s: document.querySelectorAll('.c-search').length, h1: document.querySelector('h1').textContent, opt: document.querySelector('.c-search__form select[name=region] option[value=africa]').textContent, chip: document.querySelector('[data-destinations=region-nav] .c-chip[data-region=middleEast]').textContent }));
  ok('locale switch: single header/footer/search, English hero, selects and chips', r.h === 1 && r.f === 1 && r.s === 1 && /Discover/.test(r.h1) && r.opt === 'Africa' && /Middle East/.test(r.chip), JSON.stringify(r));
  await p.close();
}

// ---------------------------------------------------------------- deep links: card CTA → homepage "to" prefilled; ?purpose= on arrival
{
  const p = await open(1440, 1000, 'ar');
  const href = await p.getAttribute('[data-destinations=popular] .c-dest .c-card__action', 'href');
  await p.goto(process.env.TEST_ORIGIN + '' + href, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  let r = await p.evaluate(() => ({ tab: document.querySelector('.c-search__tab[aria-selected=true]')?.dataset.tabId, to: document.querySelector('.c-search__form:not([hidden]) input[name=to]')?.value, path: location.pathname }));
  ok('card "explore" opens the booking entry on flights with the destination prefilled', r.path.endsWith('/mashhor-demo/book/') && r.tab === 'flights' && r.to === 'جدة', JSON.stringify(r));
  await p.goto(URL + '?purpose=medical', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  r = await p.evaluate(() => ({ hidden: document.querySelector('[data-destinations=results]').hidden, n: document.querySelectorAll('[data-destinations=results] .c-dest').length }));
  ok('?purpose= runs that search on arrival', !r.hidden && r.n === 4, JSON.stringify(r));
  await p.close();
}

// ---------------------------------------------------------------- keyboard + mobile menu
{
  const p = await open(1440, 1000, 'ar');
  await p.keyboard.press('Tab');
  ok('first Tab is the skip link', await p.evaluate(() => document.activeElement.hasAttribute('data-skip')));
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ok('skip link focuses main on this page', await p.evaluate(() => document.activeElement.id === 'main' && location.pathname.endsWith('/destinations/')));
  const seen = [];
  for (let i = 0; i < 8; i++) { await p.keyboard.press('Tab'); seen.push(await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { name: a.className.split(' ')[0] || a.tagName, ring: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || !a.matches(':focus') }; })); }
  ok('Tab reaches the hero CTAs then the search fields', seen.some((s) => s.name === 'c-btn') && seen.some((s) => s.name === 'c-field__control'), seen.map((s) => s.name).join('>'));
  ok('every focused control shows a focus ring', seen.every((s) => s.ring), seen.filter((s) => !s.ring).map((s) => s.name).join(','));
  await p.close();
  const m = await open(390, 844, 'ar');
  await m.click('.c-gh__mobile-only'); await m.waitForTimeout(400);
  const d = await m.evaluate(() => ({ open: document.querySelector('.c-gh__drawer')?.dataset.open, links: document.querySelectorAll('.c-gh__drawer a[href*="/destinations/"]').length }));
  ok('mobile drawer opens here and lists the destinations', d.open === 'true' && d.links >= 11, JSON.stringify(d));
  await m.close();
}

// ---------------------------------------------------------------- destination card → destination detail page (header/hero update brief §01/§21)
{
  const p = await open(1440, 1000, 'ar');
  const href = await p.getAttribute('[data-destinations=popular] .c-dest .c-card__link', 'href');
  ok('card links to the destination detail route', /\/destinations\/[a-z-]+\/$/.test(href), href);
  await p.click('[data-destinations=popular] .c-dest .c-card__link'); await p.waitForTimeout(1200);
  const path = await p.evaluate(() => location.pathname);
  ok('clicking the card opens the destination detail page', href.endsWith(path) || path.endsWith(href.replace(/^https?:\/\/[^/]+/, '')), `${href} -> ${path}`);
  await p.close();
}

// ---------------------------------------------------------------- destination detail — every route, both locales
const DEST = process.env.TEST_ORIGIN + '/mashhor-demo/destinations/';
const seedD = await open(1440, 1000, 'ar');
const destSlugs = await seedD.evaluate(async () => { const m = await import('./assets/js/foundation.js'); return m.DESTINATION_REGISTRY.map((d) => d.slug); });
await seedD.close();
ok('registry: 11 launch destinations, all with a slug', destSlugs.length === 11 && destSlugs.every(Boolean), destSlugs.length);
for (const slug of destSlugs) {
  const p = await open(1440, 1000, 'ar', `${DEST}${slug}/`);
  const r = await p.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('h1,h2,h3')).filter((x) => x.checkVisibility()).map((x) => Number(x.tagName[1]));
    let jumps = 0; for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) jumps++;
    const hero = document.querySelector('[data-dest=hero]');
    return {
      title: document.title, h1: document.querySelector('h1')?.textContent.trim(), h1s: document.querySelectorAll('h1').length, jumps,
      canonical: document.querySelector('link[rel=canonical]').href, hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      crumbs: document.querySelectorAll('.c-breadcrumb li a, .c-breadcrumb li [aria-current]').length,
      primary: hero.querySelector('.c-btn--primary')?.textContent.trim(), primaryHref: hero.querySelector('.c-btn--primary')?.getAttribute('href'),
      secondary: hero.querySelector('.c-btn--tertiary')?.textContent.trim(), secondaryHref: hero.querySelector('.c-btn--tertiary')?.getAttribute('href'),
      visible: Array.from(document.querySelectorAll('main > section[data-dest]')).filter((x) => !x.hidden).map((x) => x.dataset.dest),
      emptySections: Array.from(document.querySelectorAll('main > section[data-dest]')).filter((x) => !x.hidden && !x.querySelector('[data-dest-body] *, [data-dest] > *')).length,
      services: document.querySelectorAll('[data-dest=services] .c-service-card').length,
      offers: document.querySelectorAll('[data-dest=offers] .c-offer').length,
      support: document.querySelectorAll('[data-dest=support] .c-support__panel').length,
      why: document.querySelectorAll('[data-dest=why] .c-detail__point').length,
      travelFacts: document.querySelectorAll('[data-dest=travel] .c-detail__point').length,
      overviewHasNoFacts: !document.querySelector('[data-dest=overview] .c-detail__points'),
      placeholders: document.querySelectorAll('a[href^="tel:"], a[href*="wa.me"], a[href^="mailto:"]').length,
      numbers: /\d{3,}\s?(ج\.س|SDG|USD)/.test(document.querySelector('main').innerText),
      mediaAlt: document.querySelector('.c-hero__media img')?.getAttribute('alt'),
      surface: document.querySelector('.c-gh').dataset.surface, ghHeight: getComputedStyle(document.documentElement).getPropertyValue('--gh-height').trim(),
      heroFull: hero.closest('.c-hero').classList.contains('c-hero--full'),
    };
  });
  const T = `dest/${slug}`;
  ok(`${T} title, canonical, one h1, ordered headings, no h-scroll`, r.title.includes(r.h1) && r.canonical.endsWith(`/destinations/${slug}/`) && r.h1s === 1 && r.jumps === 0 && !r.hScroll, `${r.title} jumps=${r.jumps}`);
  ok(`${T} breadcrumb (home › destinations › name), full-bleed hero`, r.crumbs === 3 && r.heroFull);
  ok(`${T} primary books this destination, secondary talks to the coordinator`, /\/book\/\?vertical=flights&to=/.test(r.primaryHref) && r.secondaryHref?.endsWith('/supervisors/'), JSON.stringify({ p: r.primaryHref, s: r.secondaryHref }));
  ok(`${T} no empty sections, relevant services shown, no invented price/number`, r.emptySections === 0 && r.services > 0 && r.placeholders === 0 && !r.numbers && !!r.mediaAlt, r.visible.join(','));
  ok(`${T} why/what-to-know (travel purposes) and travel information (facts incl. status) are distinct sections`, r.why > 0 && r.travelFacts > 0 && r.overviewHasNoFacts, JSON.stringify({ why: r.why, travel: r.travelFacts, ov: r.overviewHasNoFacts }));
  ok(`${T} header measured its own live height for the hero to pull up behind`, /^\d+px$/.test(r.ghHeight), r.ghHeight);
  await p.close();
}
{
  // jeddah has no linked offer (data/offers.js); dubai has exactly one — the conditional section, both ways.
  const noOffers = await open(1440, 1000, 'ar', `${DEST}jeddah/`);
  const a = await noOffers.evaluate(() => document.querySelector('[data-dest=offers]').hidden);
  ok('destination with no linked offer: the related-offers section stays hidden, not empty', a);
  await noOffers.close();
  const withOffers = await open(1440, 1000, 'ar', `${DEST}dubai/`);
  const b2 = await withOffers.evaluate(() => ({ hidden: document.querySelector('[data-dest=offers]').hidden, n: document.querySelectorAll('[data-dest=offers] .c-offer').length }));
  ok('destination with a linked offer: related offers section shows it', !b2.hidden && b2.n === 1, JSON.stringify(b2));
  await withOffers.close();
}

// ---------------------------------------------------------------- unrecognised slug (window.no.destination, like every other detail template's states) — not-found state, no invented destination
{
  const p = await open(1440, 1000, 'ar', `${DEST}jeddah/`);
  const r = await p.evaluate(async () => {
    await window.no.destination.render('nonexistent');
    return {
      empty: !!document.querySelector('.c-state--empty'),
      allHidden: Array.from(document.querySelectorAll('main > section[data-dest]')).every((x) => x.hidden),
      title: document.title,
      surface: document.querySelector('.c-gh').dataset.surface,
    };
  });
  ok('unknown destination slug: not-found state, every section hidden, no fabricated page', r.empty && r.allHidden, JSON.stringify(r));
  ok('unknown slug: header stops tracking the (now empty) hero', r.surface === undefined || r.surface === '', r.surface);
  await p.close();
}

// ---------------------------------------------------------------- header: transparent over the hero, solid once past it, auto-hide still works
{
  const p = await open(1440, 1000, 'ar', `${DEST}jeddah/`);
  const top = await p.evaluate(() => document.querySelector('.c-gh').dataset.surface);
  ok('detail page loads with the header transparent over the hero', top === 'transparent', top);
  await p.evaluate(() => window.scrollTo(0, 1400)); await p.waitForTimeout(500);
  const past = await p.evaluate(() => document.querySelector('.c-gh').dataset.surface);
  ok('header turns solid once the hero has fully scrolled past', past === 'solid', past);
  await p.evaluate(() => window.scrollTo(0, 1300)); await p.waitForTimeout(500);
  const shown = await p.evaluate(() => ({ hidden: document.querySelector('.c-gh').dataset.hidden, surface: document.querySelector('.c-gh').dataset.surface }));
  ok('scrolling up past the hero still reveals a SOLID header (not the transparent hero look)', shown.hidden === 'false' && shown.surface === 'solid', JSON.stringify(shown));
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(500);
  const home = await p.evaluate(() => document.querySelector('.c-gh').dataset.surface);
  ok('back at the top, the header is transparent over the hero again', home === 'transparent', home);
  await p.close();
}

// ---------------------------------------------------------------- mobile detail page
{
  const p = await open(390, 844, 'ar', `${DEST}jeddah/`);
  const r = await p.evaluate(() => ({
    hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    heroTop: document.querySelector('.c-hero').getBoundingClientRect().top,
    navUsable: getComputedStyle(document.querySelector('.c-gh__mobile-only')).display !== 'none',
  }));
  ok('mobile: full-bleed hero starts at the true top, no h-scroll, menu button usable', !r.hScroll && r.heroTop <= 0 && r.navUsable, JSON.stringify(r));
  await p.click('.c-gh__mobile-only'); await p.waitForTimeout(400);
  const d = await p.evaluate(() => document.querySelector('.c-gh__drawer')?.dataset.open);
  ok('mobile drawer still opens over a transparent-hero header', d === 'true');
  await p.close();
}

await b.close();
console.log(`\n${pass}/${pass + fail} destinations checks passed`);
console.log('errors:', errs.length ? errs : 'none');
process.exit(fail || errs.length ? 1 : 0);
