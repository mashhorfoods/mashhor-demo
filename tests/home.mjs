// Stage 10.4 homepage verification — structure, states, interaction, a11y,
// three widths, both directions. Exits 1 on any ✗.
import './env.mjs';
import { chromium } from 'playwright';
const URL = process.env.TEST_ORIGIN + '/mashhor-demo/index.html';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let pass = 0, fail = 0;
const ok = (name, cond, note = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} ${note}`); } };
const errs = [];

async function open(width, height, locale) {
  const p = await b.newPage({ viewport: { width, height } });
  p.on('pageerror', e => errs.push(`${width}/${locale} pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${width}/${locale} console: ${m.text()}`); });
  p.on('requestfailed', r => errs.push(`${width}/${locale} reqfail: ${r.url()}`));
  await p.goto(URL, { waitUntil: 'networkidle' });
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
      const order = Array.from(document.querySelectorAll('main > section')).map((s) => s.getAttribute('aria-labelledby'));
      const headings = Array.from(document.querySelectorAll('h1,h2,h3')).map((h) => Number(h.tagName[1]));
      let jumps = 0; for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) jumps++;
      const small = Array.from(document.querySelectorAll('main p, main a, main button, main span')).filter((n) => n.checkVisibility() && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 12).length;
      const targets = vis('main a[href], main button').filter((n) => { const r = n.getBoundingClientRect(); return r.height < 40 && !n.closest('.c-search__tabs') && !n.classList.contains('c-card__link') && !n.classList.contains('c-btn--tertiary'); }).map((n) => n.className + ':' + Math.round(n.getBoundingClientRect().height));
      return {
        dir: document.documentElement.dir, lang: document.documentElement.lang,
        hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        h1: document.querySelectorAll('h1').length, jumps,
        order,
        primaries: vis('.c-btn--primary').length,
        primaryTexts: vis('.c-btn--primary').map((n) => n.textContent.trim()),
        tabs: document.querySelectorAll('.c-search__tab').length,
        segmented: document.querySelectorAll('.c-segmented__input').length,
        fields: Array.from(document.querySelectorAll('.c-search__form:not([hidden]) .c-field__label')).map((l) => l.textContent.trim()),
        services: document.querySelectorAll('[data-home=services] .c-service-card').length,
        priorities: document.querySelectorAll('[data-home=choose] .c-choose__option').length,
        dests: document.querySelectorAll('[data-home=destinations] .c-dest').length,
        offers: document.querySelectorAll('[data-home=offers] .c-offer').length,
        offerPrices: document.querySelectorAll('[data-home=offers] .t-price').length,
        providers: document.querySelectorAll('[data-home=providers] .c-provider-marquee__item:not(.c-provider-marquee__item--dup) .c-provider-card').length,
        providersMarqueeLooping: !!document.querySelector('[data-home=providers] .c-provider-marquee__track'),
        supportPanels: document.querySelectorAll('[data-home=support] .c-support__panel').length,
        placeholderContacts: document.querySelectorAll('a[href^="tel:"], a[href*="wa.me"], a[href^="mailto:"]').length,
        placeholderText: /\+249|wa\.me|XXXX/.test(document.body.innerText),
        footer: !!document.querySelector('.c-gf'), footerCta: !!document.querySelector('.c-gf__cta'),
        header: !!document.querySelector('.c-gh'),
        imgsNoAlt: document.querySelectorAll('img:not([alt])').length,
        decorativeHidden: Array.from(document.querySelectorAll('.c-hero__route, .c-support__plus')).every((n) => n.getAttribute('aria-hidden') === 'true'),
        small, targets,
        searchTop: Math.round(document.querySelector('#booking').getBoundingClientRect().top),
        mediaRatio: (() => { const m = document.querySelector('.c-hero__media'); const r = m.getBoundingClientRect(); return +(r.width / r.height).toFixed(2); })(),
        title: document.title, desc: document.querySelector('meta[name=description]').content,
      };
    });
    const T = `${tag}/${loc}`;
    ok(`${T} dir`, r.dir === (loc === 'ar' ? 'rtl' : 'ltr'));
    ok(`${T} no h-scroll`, !r.hScroll);
    ok(`${T} one h1`, r.h1 === 1);
    ok(`${T} heading order`, r.jumps === 0, `${r.jumps}`);
    ok(`${T} section order`, r.order.join(',') === 'hero-title,destinations-title,services-title,team-title,choose-title,providers-title,offers-title,newsletter-title,support-title', r.order.join(','));
    ok(`${T} header + footer present, footer CTA on`, r.header && r.footer && r.footerCta);
    ok(`${T} 8 search categories`, r.tabs === 8, `${r.tabs}`);
    ok(`${T} trip type control`, r.segmented === 3);
    ok(`${T} flight fields`, r.fields.length >= 6, r.fields.join('|'));
    ok(`${T} 6 featured services`, r.services === 6, `${r.services}`);
    ok(`${T} 5 priorities`, r.priorities === 5);
    ok(`${T} 6 destinations`, r.dests === 6);
    ok(`${T} 3 offers, no invented price`, r.offers === 3 && r.offerPrices === 0);
    ok(`${T} 7 airline providers`, r.providers === 7, `${r.providers}`);
    ok(`${T} providers render as a marquee track`, r.providersMarqueeLooping);
    ok(`${T} support panels`, r.supportPanels === 2);
    ok(`${T} no placeholder contact info`, r.placeholderContacts === 0 && !r.placeholderText);
    ok(`${T} alt on every img`, r.imgsNoAlt === 0);
    ok(`${T} decorative hidden from AT`, r.decorativeHidden);
    ok(`${T} no tiny text`, r.small === 0, `${r.small}`);
    ok(`${T} touch targets ≥40`, r.targets.length === 0, r.targets.slice(0, 4).join(' '));
    ok(`${T} primaries ≤ 3 (header, search)`, r.primaries <= 3, r.primaryTexts.join('|'));
    if (tag === 'mobile') ok(`${T} search within first screen`, r.searchTop < 700, `${r.searchTop}`);
    ok(`${T} title/description localised`, loc === 'ar' ? /نمبرون/.test(r.title) && /نمبرون/.test(r.desc) : /Number One/.test(r.title) && /Number One/.test(r.desc));
    await p.close();
  }
}

// ---------------------------------------------------------------- interaction (desktop, ar) + states
{
  const p = await open(1440, 1000, 'ar');
  // Re-mount with a submit hook that records the outgoing query and cancels
  // the navigation, so the page stays inspectable.
  await p.evaluate(async () => {
    const m = await import('./assets/js/foundation.js');
    window.no.home = m.mountHome({ onSearchSubmit: (v, params) => {
      window.__submitted = { url: params.toString(), busy: !!document.querySelector('button[type=submit][aria-busy=true]') };
      return false;
    } });
  });
  await p.waitForTimeout(400);
  // search tabs switch panels and CTA label
  await p.click('.c-search__tab[data-tab-id="visa"]');
  let r = await p.evaluate(() => ({
    visible: document.querySelector('.c-search__form:not([hidden])').id.endsWith('visa'),
    cta: document.querySelector('.c-search__form:not([hidden]) button[type=submit]').textContent.trim(),
  }));
  ok('tab switch shows visa panel', r.visible);
  ok('request-type vertical uses request CTA', r.cta === 'اطلب عرضاً', r.cta);
  await p.click('.c-search__tab[data-tab-id="flights"]');

  // required validation: submit empty → errors, focus on first missing
  await p.click('.c-search__form:not([hidden]) button[type=submit]');
  r = await p.evaluate(() => ({
    errors: document.querySelectorAll('.c-search__form:not([hidden]) .c-field__error').length,
    invalid: document.querySelectorAll('.c-search__form:not([hidden]) [aria-invalid=true]').length,
    focusedName: document.activeElement?.name, url: location.href,
  }));
  ok('empty submit marks required fields', r.errors === 4 && r.invalid === 4, `${r.errors}/${r.invalid}`);
  ok('focus moves to first missing field', r.focusedName === 'from', `${r.focusedName}`);
  ok('did not navigate on invalid', r.url.endsWith('index.html'));

  // help-me-choose: pick priority → go → flights selected, search focused; submit carries sort
  await p.evaluate(() => { window.__nav = null; window.no.home.search.no.select('flights'); });
  await p.click('.c-choose__option[data-sort="stops"]');
  r = await p.evaluate(() => ({
    pressed: document.querySelector('.c-choose__option[data-sort="stops"]').getAttribute('aria-pressed'),
    status: document.querySelector('.c-choose__selected').textContent,
    goEnabled: !document.querySelector('.c-choose .c-btn--secondary-brand').disabled,
  }));
  ok('priority chip pressed', r.pressed === 'true');
  ok('status announces selection', /أقل عدد من التوقفات/.test(r.status), r.status);
  ok('go enabled after pick', r.goEnabled);
  await p.click('.c-choose .c-btn--secondary-brand');
  await p.waitForTimeout(1200);
  const inView = () => p.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
  r = await p.evaluate(() => ({ focusedName: document.activeElement?.name }));
  ok('go scrolls to search and focuses first field', r.focusedName === 'from' && await inView(), JSON.stringify(r));


  await p.fill('.c-search__form:not([hidden]) input[name=from]', 'الخرطوم');
  await p.fill('.c-search__form:not([hidden]) input[name=to]', 'جدة');
  await p.fill('.c-search__form:not([hidden]) input[name=depart]', '2026-11-12');
  await p.fill('.c-search__form:not([hidden]) input[name=return]', '2026-11-20');
  await p.click('.c-search__form:not([hidden]) button[type=submit]');
  await p.waitForTimeout(200);
  await p.waitForTimeout(300);
  r = await p.evaluate(() => ({ url: window.__submitted?.url, busy: window.__submitted?.busy ? 'true' : 'false', stayed: location.pathname.endsWith('index.html') }));
  ok('valid submit hands the query to the booking entry and stays when cancelled', !!r.url && r.stayed, `${r.url}`);
  ok('query carries vertical, fields, trip type and sort', !!r.url && /vertical=flights/.test(r.url) && /tripType=return/.test(r.url) && /sort=stops/.test(r.url) && /depart=2026-11-12/.test(r.url), `${r.url}`);
  ok('submit button shows loading state', r.busy === 'true', `${r.busy}`);

  // services: show all / show fewer
  await p.click('[data-home=services] .c-disclose button');
  r = await p.evaluate(() => ({ n: document.querySelectorAll('[data-home=services] .c-service-card').length, exp: document.querySelector('[data-home=services] .c-disclose button').getAttribute('aria-expanded') }));
  ok('show all reveals 13 services', r.n === 13 && r.exp === 'true', `${r.n}`);
  await p.click('[data-home=services] .c-disclose button');
  r = await p.evaluate(() => document.querySelectorAll('[data-home=services] .c-service-card').length);
  ok('show fewer collapses to 6', r === 6);

  // states on every dynamic region
  for (const region of ['services', 'destinations', 'offers', 'support']) {
    const s = await p.evaluate(async (region) => {
      const R = window.no.home.regions[region];
      const host = document.querySelector(`[data-home=${region}]`);
      const out = {};
      R.loading(); out.loading = host.getAttribute('aria-busy') === 'true' && host.querySelectorAll('.c-skeleton').length > 0;
      R.empty();   out.empty = !!host.querySelector('.c-state--empty, .c-state--info') && host.querySelectorAll('.c-state__actions .c-btn').length > 0;
      R.error();   out.error = !!host.querySelector('.c-state--error[role=alert]') && host.querySelectorAll('.c-state__actions .c-btn').length >= 1;
      await window.no.home.reload(); out.content = host.getAttribute('aria-busy') === 'false' && !host.querySelector('.c-state, .c-skeleton');
      return out;
    }, region);
    ok(`${region}: loading/empty/error/success states`, s.loading && s.empty && s.error && s.content, JSON.stringify(s));
  }

  // the header's search action lands on the hero form
  await p.evaluate(() => window.scrollTo(0, 3000));
  await p.click('.c-gh__action[aria-label="بحث"]'); await p.waitForTimeout(900);
  ok('header search hands off to the booking entry', (await p.evaluate(() => document.activeElement?.name)) === 'from' && await inView());

  // locale switch keeps everything painted (no duplicate sections/headers)
  await p.evaluate(async () => { const m = await import('./assets/js/foundation.js'); await m.setLocale('en'); });
  await p.waitForTimeout(700);
  r = await p.evaluate(() => ({
    headers: document.querySelectorAll('.c-gh').length, footers: document.querySelectorAll('.c-gf').length,
    searches: document.querySelectorAll('.c-search').length, h1: document.querySelector('h1').textContent,
    services: document.querySelectorAll('[data-home=services] .c-service-card').length,
  }));
  ok('locale switch: one header, one footer, one search', r.headers === 1 && r.footers === 1 && r.searches === 1, JSON.stringify(r));
  ok('locale switch: English hero', /Your journey from Egypt starts with Number One/.test(r.h1), r.h1);
  ok('locale switch: regions re-rendered', r.services === 6);
  await p.close();
}

// ---------------------------------------------------------------- keyboard
{
  const p = await open(1440, 1000, 'ar');
  await p.focus('.c-search__tab[aria-selected=true]');
  const seen = [];
  for (let i = 0; i < 14; i++) {
    await p.keyboard.press('Tab');
    seen.push(await p.evaluate(() => {
      const a = document.activeElement; const cs = getComputedStyle(a);
      const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 || (a.closest('.c-segmented__option') && getComputedStyle(a.closest('.c-segmented__option')).outlineStyle !== 'none');
      // A date input's native picker button is a shadow-DOM stop: the host no
      // longer matches :focus and the platform draws that indicator itself.
      const platformStop = !a.matches(':focus');
      return { tag: a.tagName, name: a.name || a.className.split(' ')[0], ring: ring || platformStop };
    }));
  }
  const reachedSubmit = seen.some((s) => s.name === 'c-btn' || s.tag === 'BUTTON' && s.name.includes('c-btn'));
  ok('keyboard reaches through the search form', seen.some((s) => s.name === 'from') && seen.some((s) => s.name === 'depart'), seen.map((s) => s.name).join('>'));
  ok('every focused control shows a focus ring', seen.every((s) => s.ring), seen.filter((s) => !s.ring).map((s) => s.name).join(','));
  // chips are buttons with aria-pressed; segmented radios move with arrows
  await p.focus('.c-segmented__input:checked');
  await p.keyboard.press('ArrowRight');
  const seg = await p.evaluate(() => document.querySelector('.c-segmented__input:checked').value);
  ok('segmented control moves with arrow keys', seg !== 'return', seg);
  await p.close();
}

// ---------------------------------------------------------------- mobile menu + bottom nav
{
  const p = await open(390, 844, 'ar');
  await p.click('.c-gh__mobile-only');
  await p.waitForTimeout(400);
  const d = await p.evaluate(() => ({ open: document.querySelector('.c-gh__drawer')?.dataset.open, channels: document.querySelectorAll('.c-gh__channel').length, bottomNav: document.querySelectorAll('.c-bottom-nav__item').length }));
  ok('mobile drawer opens on the homepage', d.open === 'true');
  ok('drawer shows no placeholder channels', d.channels === 0, `${d.channels}`);
  ok('bottom nav present', d.bottomNav >= 4);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok('Escape closes drawer', (await p.evaluate(() => document.querySelector('.c-gh__drawer')?.dataset.open)) !== 'true');
  await p.close();
}

// ---------------------------------------------------------------- providers marquee (§04-06 of the header/menu/providers brief)
for (const [w, h, tag] of [[390, 844, 'mobile'], [834, 1100, 'tablet'], [1440, 1000, 'desktop']]) {
  const p = await open(w, h, 'ar');
  const r = await p.evaluate(() => {
    const track = document.querySelector('[data-home=providers] .c-provider-marquee__track');
    const wrap = document.querySelector('[data-home=providers] .c-provider-marquee');
    const cs = getComputedStyle(track);
    return {
      animName: cs.animationName,
      animDuration: cs.animationDuration,
      animIteration: cs.animationIterationCount,
      trackWiderThanWrap: track.scrollWidth > wrap.getBoundingClientRect().width,
      wrapClips: getComputedStyle(wrap).overflow === 'hidden',
    };
  });
  const T = `providers/${tag}`;
  ok(`${T} track animates`, r.animName !== 'none' && r.animDuration !== '0s');
  ok(`${T} loops forever`, r.animIteration === 'infinite');
  ok(`${T} track is wider than the viewport (room to loop)`, r.trackWiderThanWrap);
  ok(`${T} wrapper clips the strip`, r.wrapClips);
  const x1 = await p.evaluate(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-home=providers] .c-provider-marquee__track')).transform).m41);
  await p.waitForTimeout(600);
  const x2 = await p.evaluate(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-home=providers] .c-provider-marquee__track')).transform).m41);
  ok(`${T} moves right-to-left over time`, x2 < x1, `${x1} -> ${x2}`);
  const hScroll = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  ok(`${T} no page horizontal scroll from the marquee`, !hScroll);
  await p.close();
}

// reduced motion: static, non-animating, only the real (non-duplicate) logos
{
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const track = document.querySelector('[data-home=providers] .c-provider-marquee__track');
    return {
      animName: getComputedStyle(track).animationName,
      visibleDups: Array.from(document.querySelectorAll('[data-home=providers] .c-provider-marquee__item--dup')).some((n) => n.checkVisibility()),
    };
  });
  ok('reduced motion: marquee animation is off', r.animName === 'none', r.animName);
  ok('reduced motion: duplicate fill logos are hidden', !r.visibleDups);
  await p.close();
}

await b.close();
console.log(`\n${pass}/${pass + fail} homepage checks passed`);
console.log('errors:', errs.length ? errs : 'none');
process.exit(fail || errs.length ? 1 : 0);
