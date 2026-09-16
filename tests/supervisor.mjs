// Stage 10.10 supervisor profile verification — structure, every section,
// attribution hand-off into the booking entry and the homepage, contact
// actions, states (skeleton, unknown, inactive, error, empty, full record),
// a11y, three widths, both directions. Exits 1 on any ✗.
import './env.mjs';
import { chromium } from 'playwright';
const ORIGIN = process.env.TEST_ORIGIN + '';
const PAGE = '/mashhor-demo/supervisor/supervisor-1/';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let pass = 0, fail = 0;
const ok = (name, cond, note = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} ${note}`); } };
const errs = [];

async function open(url = PAGE, width = 1440, height = 1000, locale = 'ar') {
  const p = await b.newPage({ viewport: { width, height } });
  p.on('pageerror', e => errs.push(`${url}@${width}/${locale} pageerror: ${e.message}`));
  p.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('boom')) errs.push(`${url}@${width} console: ${m.text()}`); });
  p.on('requestfailed', r => errs.push(`${url}@${width} reqfail: ${r.url()}`));
  p.on('response', r => { if (r.status() >= 400) errs.push(`${url}@${width} HTTP ${r.status()} ${r.url()}`); });
  await p.goto(ORIGIN + url, { waitUntil: 'networkidle' });
  if (locale !== 'ar') await p.evaluate(async (l) => { const m = await import('./assets/js/foundation.js'); await m.setLocale(l); }, locale);
  await p.waitForTimeout(600);
  return p;
}
const FULL = {
  id: 'sup-x', slug: 'supervisor-1', status: 'active', placeholder: false,
  nameAr: 'اسم تجريبي', nameEn: 'Test Name', titleAr: 'مشرف السفر — الخليج', titleEn: 'Travel supervisor — Gulf',
  bioAr: 'نبذة تجريبية عن المشرف.', bioEn: 'A test bio for the supervisor.',
  image: { src: 'assets/brand/og-image.png', altAr: 'صورة الاسم التجريبي', altEn: 'Photo of Test Name' },
  languages: ['ar', 'en'], specialties: ['umrah', 'medical'], services: ['flights', 'umrah'],
  phone: '+249 12 345 6789', whatsapp: '+249123456789', email: 'test@example.com', createdAt: '2026-09-16',
};

// ---------------------------------------------------------------- structure × widths × locales
for (const [w, h, tag] of [[390, 844, 'mobile'], [834, 1100, 'tablet'], [1440, 1000, 'desktop']]) {
  for (const loc of ['ar', 'en']) {
    const p = await open(PAGE, w, h, loc);
    const r = await p.evaluate(() => {
      const vis = (sel) => Array.from(document.querySelectorAll(sel)).filter((n) => n.checkVisibility());
      const headings = Array.from(document.querySelectorAll('h1,h2,h3')).filter((x) => x.checkVisibility()).map((x) => Number(x.tagName[1]));
      let jumps = 0; for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) jumps++;
      const small = Array.from(document.querySelectorAll('main p, main a, main button, main span, main li, main dt, main dd')).filter((n) => n.checkVisibility() && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 12).length;
      const targets = vis('main a[href], main button').filter((n) => n.getBoundingClientRect().height < 40 && !n.classList.contains('c-card__link') && !n.classList.contains('c-btn--tertiary')).map((n) => n.className.split(' ')[0] + ':' + Math.round(n.getBoundingClientRect().height));
      const hero = document.querySelector('[data-profile=hero]');
      const photo = hero.querySelector('.c-profile__photo').getBoundingClientRect();
      const copy = hero.querySelector('.c-profile__copy').getBoundingClientRect();
      const primary = hero.querySelector('.c-btn--primary');
      const services = Array.from(document.querySelectorAll('[data-profile=services] .c-service-card'));
      return {
        dir: document.documentElement.dir, lang: document.documentElement.lang, hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        h1: document.querySelectorAll('h1').length, h1Text: document.querySelector('h1').textContent.trim(), jumps, small, targets, title: document.title,
        canonical: document.querySelector('link[rel=canonical]').href,
        sections: Array.from(document.querySelectorAll('main > section[data-profile]')).filter((s) => !s.hidden).map((s) => s.dataset.profile),
        brand: hero.querySelector('.c-profile__brand')?.textContent.trim(), logo: !!hero.querySelector('.c-profile__brand .c-logo img[alt]'),
        badge: hero.querySelector('.c-profile__badges')?.textContent.trim(), titleShown: !!hero.querySelector('.c-profile__title'),
        lead: hero.querySelector('.c-hero__lead')?.textContent.trim(),
        photoLabelled: hero.querySelector('.c-profile__photo [role=img]')?.getAttribute('aria-label'),
        stacked: photo.bottom <= copy.top + 1, sideBySide: Math.abs(photo.top - copy.top) < photo.height && (photo.right <= copy.left + 1 || copy.right <= photo.left + 1),
        primaryText: primary.textContent.trim(), primaryHref: primary.getAttribute('href'), primaryTop: primary.getBoundingClientRect().top, primaryH: primary.getBoundingClientRect().height,
        secondary: hero.querySelector('[data-profile-action=contact]')?.textContent.trim(),
        heroPrimaries: hero.querySelectorAll('.c-btn--primary').length, mainPrimaries: vis('main .c-btn--primary').length,
        emptyBlock: document.querySelector('[data-profile=about] .c-state')?.className, emptyTitle: document.querySelector('[data-profile=about] .c-state__title')?.textContent.trim(),
        facts: Array.from(document.querySelectorAll('.c-facts__row dt')).map((d) => d.textContent.trim()),
        servicesCount: document.querySelector('[data-profile-link=services]')?.textContent.trim(), url: document.querySelector('.c-facts__url input')?.value, urlReadonly: document.querySelector('.c-facts__url input')?.readOnly,
        services: services.length, attributedActions: services.every((c) => /supervisor=supervisor-1/.test(c.querySelector('.c-card__action')?.getAttribute('href') ?? '')), detailsLinks: services.every((c) => /\/services\/[a-z-]+\/$/.test(c.querySelector('.c-service-card__details')?.getAttribute('href') ?? '')),
        trust: Array.from(document.querySelectorAll('[data-profile=trust] .c-trust-item')).map((n) => n.textContent.trim()),
        channels: document.querySelectorAll('.c-channel').length, note: !!document.querySelector('[data-profile=contact] .c-note'), request: document.querySelector('[data-profile-action=request]')?.getAttribute('href'),
        disc: { dest: document.querySelectorAll('[data-profile=discovery] .c-destination-card, [data-profile=discovery] .c-dest').length, offers: document.querySelectorAll('[data-profile=discovery] .c-offer').length, cards: document.querySelectorAll('[data-profile=discovery] .c-card').length, attributed: Array.from(document.querySelectorAll('[data-profile=discovery] .c-card__action')).every((a) => /supervisor=supervisor-1/.test(a.getAttribute('href'))) },
        cta: document.querySelector('[data-profile=cta] .c-btn--primary')?.getAttribute('href'),
        placeholders: document.querySelectorAll('a[href^="tel:"], a[href*="wa.me"], a[href^="mailto:"]').length + (/\+249|wa\.me|XXXX|example\.com/.test(document.body.innerText) ? 1 : 0),
        claims: /\d+\s?(سنوات|years)|★|⭐|تقييم|rating|reviews|مراجعات|\d{3,}\s?(عميل|customers)/i.test(document.querySelector('main').innerText),
        headerVariant: document.querySelector('header')?.dataset.variant, footerPrimary: document.querySelectorAll('footer .c-btn--primary').length,
        bottomCurrent: document.querySelectorAll('.c-bottom-nav [aria-current]').length, skip: !!document.querySelector('[data-skip]'),
        imgsNoAlt: document.querySelectorAll('img:not([alt])').length,
        physical: !Array.from(document.styleSheets).some((s) => { try { return Array.from(s.cssRules).some((r) => /margin-left|margin-right|padding-left|padding-right|\bleft:|\bright:|text-align:\s*(left|right)/.test(r.cssText) && /c-profile|c-facts|c-channel|c-discovery/.test(r.cssText)); } catch { return false; } }),
      };
    });
    const T = `${tag}/${loc}`;
    const ar = loc === 'ar';
    ok(`${T} direction/lang`, r.dir === (ar ? 'rtl' : 'ltr') && r.lang === loc);
    ok(`${T} no horizontal scroll`, !r.hScroll);
    ok(`${T} one h1, no heading jumps`, r.h1 === 1 && r.jumps === 0, `${r.h1}/${r.jumps}`);
    ok(`${T} nothing under 12px, targets ≥ 40px`, r.small === 0 && r.targets.length === 0, `${r.small} ${r.targets.join(',')}`);
    ok(`${T} neutral name + title when the record has none`, r.h1Text === (ar ? 'مشرف نمبرون' : 'Number One supervisor') && r.title === `${r.h1Text} — ${ar ? 'نمبرون للسفر و السياحة' : 'Number One Travel & Tourism'}` && !r.titleShown, `${r.h1Text} | ${r.title}`);
    ok(`${T} canonical`, r.canonical.endsWith('/mashhor-demo/supervisor/supervisor-1/'));
    ok(`${T} every section present`, r.sections.join(',') === 'about,services,trust,contact,discovery,cta', r.sections.join(','));
    ok(`${T} Number One branding in the hero (logo + line)`, r.logo && r.brand.includes(ar ? 'نمبرون' : 'Number One'), r.brand);
    ok(`${T} verified badge from status`, r.badge === (ar ? 'مشرف معتمد' : 'Verified supervisor'), r.badge);
    ok(`${T} lead is the role line, not an invented bio`, r.lead === (ar ? 'يساعدك على اختيار الخيار المناسب، ويتابع حجزك مع فريق نمبرون من البداية إلى العودة.' : 'Helps you choose the right option and follows your booking with the Number One team, from the start until you are back.'), r.lead);
    ok(`${T} photo slot labelled`, r.photoLabelled === (ar ? 'لا توجد صورة بعد' : 'No photo yet'), r.photoLabelled);
    ok(`${T} hero layout ${w < 768 ? 'stacked' : 'side by side'}`, w < 768 ? r.stacked : r.sideBySide, JSON.stringify([r.stacked, r.sideBySide]));
    ok(`${T} primary "${ar ? 'ابدأ الحجز' : 'Start booking'}" attributed, one in the hero`, r.primaryText === (ar ? 'ابدأ الحجز' : 'Start booking') && r.primaryHref === '/mashhor-demo/book/?supervisor=supervisor-1' && r.heroPrimaries === 1, `${r.primaryText} ${r.primaryHref}`);
    ok(`${T} primary reachable (first screen, ≥ 48px)`, r.primaryTop < h && r.primaryH >= 44, `${Math.round(r.primaryTop)}/${r.primaryH}`);
    ok(`${T} secondary contact action`, r.secondary === (ar ? 'تواصل مع المشرف' : 'Contact the supervisor'), r.secondary);
    ok(`${T} red rationed in main: hero + final band`, r.mainPrimaries === 2, `${r.mainPrimaries}`);
    ok(`${T} empty state for missing optional details`, /c-state--info/.test(r.emptyBlock) && r.emptyTitle === (ar ? 'بيانات المشرف قيد الاستكمال' : 'Profile details are being completed'), `${r.emptyBlock} ${r.emptyTitle}`);
    ok(`${T} facts: only services + public link`, r.facts.join('|') === (ar ? 'الخدمات|رابط الملف العام' : 'Services|Public profile link') && r.servicesCount === (ar ? '8 خدمات' : '8 services') && r.url.endsWith('/mashhor-demo/supervisor/supervisor-1/') && r.urlReadonly, `${r.facts.join('|')} ${r.servicesCount} ${r.url}`);
    ok(`${T} 8 service cards, every action attributed, details links`, r.services === 8 && r.attributedActions && r.detailsLinks, JSON.stringify([r.services, r.attributedActions, r.detailsLinks]));
    ok(`${T} trust: 5 statements`, r.trust.length === 5 && (ar ? r.trust[0] === 'حجز وضمان باسم نمبرون للسفر و السياحة' : r.trust[0] === 'Booked and guaranteed under Number One Travel & Tourism'), r.trust.join('|'));
    ok(`${T} contact: no channels, note + attributed request`, r.channels === 0 && r.note && r.request === '/mashhor-demo/help/contact/?supervisor=supervisor-1', `${r.channels} ${r.note} ${r.request}`);
    ok(`${T} discovery: 3 destinations + 3 offers, attributed`, r.disc.cards === 6 && r.disc.offers === 3 && r.disc.attributed, JSON.stringify(r.disc));
    ok(`${T} final band attributed`, r.cta === '/mashhor-demo/book/?supervisor=supervisor-1', r.cta);
    ok(`${T} no placeholder contacts, no invented claims`, r.placeholders === 0 && !r.claims);
    ok(`${T} chrome: marketing header, footer CTA off, bottom nav neutral, skip link`, r.headerVariant === 'default' && r.footerPrimary === 0 && r.bottomCurrent === 0 && r.skip, JSON.stringify([r.headerVariant, r.footerPrimary, r.bottomCurrent]));
    ok(`${T} images have alt, logical CSS only`, r.imgsNoAlt === 0 && r.physical);
    await p.screenshot({ path: `sup-${tag}-${loc}.png`, fullPage: true });
    await p.close();
  }
}

// ---------------------------------------------------------------- interactions + states (ar)
{
  const p = await open();
  // secondary → contact section, focus inside
  await p.click('[data-profile-action=contact]'); await p.waitForTimeout(700);
  let r = await p.evaluate(() => { const s = document.querySelector('#contact'); const rect = s.getBoundingClientRect(); return { inView: rect.top >= -2 && rect.top < innerHeight / 2, focusInside: s.contains(document.activeElement) }; });
  ok('contact action scrolls to the contact section and focuses its first action', r.inView && r.focusInside, JSON.stringify(r));
  // copy link
  await p.evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (v) => { window.__copied = v; } }, configurable: true }); });
  await p.click('.c-facts__url button'); await p.waitForTimeout(300);
  r = await p.evaluate(() => ({ copied: window.__copied, toast: document.querySelector('.c-toast')?.textContent.trim() }));
  ok('copy link writes the public URL and confirms', r.copied?.endsWith('/supervisor/supervisor-1/') && /تم نسخ الرابط/.test(r.toast ?? ''), JSON.stringify(r));
  await p.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('boom'); } }, configurable: true }); });
  await p.click('.c-facts__url button'); await p.waitForTimeout(300);
  r = await p.evaluate(() => ({ selected: document.activeElement === document.querySelector('.c-facts__url input') && document.activeElement.selectionEnd > 0, toasts: Array.from(document.querySelectorAll('.c-toast')).map((t) => t.textContent.trim()) }));
  ok('copy failure selects the field and explains', r.selected && r.toasts.some((t) => /تعذر النسخ/.test(t)), JSON.stringify(r));

  // full record through the template
  await p.evaluate((rec) => window.no.supervisor.paint(rec), FULL);
  await p.waitForTimeout(200);
  r = await p.evaluate(() => {
    const hero = document.querySelector('[data-profile=hero]');
    return { h1: document.querySelector('h1').textContent.trim(), title: document.title, role: hero.querySelector('.c-profile__title')?.textContent.trim(), bio: hero.querySelector('.c-hero__lead')?.textContent.trim(),
      img: hero.querySelector('.c-profile__photo img')?.getAttribute('alt'), imgLoaded: hero.querySelector('.c-profile__photo img')?.complete,
      facts: Array.from(document.querySelectorAll('.c-facts__row dt')).map((d) => d.textContent.trim()), languages: Array.from(document.querySelectorAll('.c-facts__row:nth-child(1) .c-badge')).map((b) => b.textContent.trim()), specialties: Array.from(document.querySelectorAll('.c-facts__row:nth-child(2) .c-badge')).map((b) => b.textContent.trim()),
      empty: !!document.querySelector('[data-profile=about] .c-state'), services: document.querySelectorAll('[data-profile=services] .c-service-card').length,
      channels: Array.from(document.querySelectorAll('.c-channel')).map((c) => c.dataset.channel + '=' + c.getAttribute('href') + (c.target ? ':' + c.target : '')), note: !!document.querySelector('[data-profile=contact] .c-note'),
      desc: document.querySelector('meta[name=description]').content, servicesTitle: document.querySelector('#services-title').textContent.trim(), contactTitle: document.querySelector('#contact-title').textContent.trim() };
  });
  ok('full record: name, title, bio, photo with alt', r.h1 === 'اسم تجريبي' && r.title.startsWith('اسم تجريبي — ') && r.role === 'مشرف السفر — الخليج' && r.bio === 'نبذة تجريبية عن المشرف.' && r.img === 'صورة الاسم التجريبي' && r.desc === 'نبذة تجريبية عن المشرف.', JSON.stringify([r.h1, r.role, r.bio, r.img]));
  ok('full record: languages + expertise rows, no empty block', r.facts.join('|') === 'اللغات|مجالات الخبرة|الخدمات|رابط الملف العام' && r.languages.join('|') === 'العربية|الإنجليزية' && r.specialties.join('|') === 'علاج|عمرة' && !r.empty, JSON.stringify([r.facts, r.languages, r.specialties, r.empty]));
  ok('full record: only its services; name in section titles', r.services === 2 && r.servicesTitle === 'ما يساعدك اسم تجريبي فيه' && r.contactTitle === 'تواصل مع اسم تجريبي', JSON.stringify([r.services, r.servicesTitle]));
  ok('full record: three verified channels with correct hrefs', r.channels.join('|') === 'whatsapp=https://wa.me/249123456789:_blank|call=tel:+249123456789|email=mailto:test@example.com' && !r.note, r.channels.join('|'));

  // states through the QA handle
  await p.evaluate(() => window.no.supervisor.region.loading());
  r = await p.evaluate(() => ({ sk: document.querySelectorAll('[data-profile=hero] .c-skeleton').length, busy: document.querySelector('[data-profile=hero]').getAttribute('aria-busy') }));
  ok('loading: profile skeleton, region busy', r.sk >= 4 && r.busy === 'true', JSON.stringify(r));
  await p.evaluate(() => window.no.supervisor.render('nobody')); await p.waitForTimeout(200);
  r = await p.evaluate(() => ({ state: document.querySelector('[data-profile=hero] .c-state')?.className, title: document.querySelector('[data-profile=hero] .c-state__title')?.textContent, actions: Array.from(document.querySelectorAll('[data-profile=hero] .c-state .c-btn')).map((a) => a.textContent.trim() + '→' + a.getAttribute('href')), sections: Array.from(document.querySelectorAll('main > section[data-profile]')).filter((s) => !s.hidden).length, docTitle: document.title }));
  ok('unknown slug: empty state with booking + expert doors, sections hidden', /c-state--empty/.test(r.state) && r.title === 'هذا الملف غير موجود' && r.actions.join('|') === 'ابدأ الحجز→/mashhor-demo/book/|تحدث مع خبير→/mashhor-demo/help/contact/' && r.sections === 0 && r.docTitle.startsWith('هذا الملف غير موجود'), JSON.stringify(r));
  await p.evaluate(async () => { const m = await import('./assets/js/foundation.js'); window.no.supervisor = m.mountSupervisor({ slug: 'supervisor-1', load: async (s) => ({ ...m.supervisorBySlug(s), status: 'inactive' }) }); }); await p.waitForTimeout(200);
  r = await p.evaluate(() => ({ state: document.querySelector('[data-profile=hero] .c-state')?.className, title: document.querySelector('[data-profile=hero] .c-state__title')?.textContent, primary: document.querySelector('[data-profile=hero] .c-state .c-btn--primary')?.getAttribute('href'), sections: Array.from(document.querySelectorAll('main > section[data-profile]')).filter((s) => !s.hidden).length }));
  ok('inactive supervisor: unavailable state, sections hidden, plain booking door', /c-state--info/.test(r.state) && r.title === 'هذا المشرف غير متاح حالياً' && r.primary === '/mashhor-demo/book/' && r.sections === 0, JSON.stringify(r));
  await p.evaluate(async () => { const m = await import('./assets/js/foundation.js'); let n = 0; window.no.supervisor = m.mountSupervisor({ slug: 'supervisor-1', load: async (s) => { if (n++ === 0) throw new Error('boom'); return m.supervisorBySlug(s); } }); }); await p.waitForTimeout(200);
  r = await p.evaluate(() => ({ state: document.querySelector('[data-profile=hero] .c-state')?.className, role: document.querySelector('[data-profile=hero] .c-state')?.getAttribute('role'), title: document.querySelector('[data-profile=hero] .c-state__title')?.textContent, retry: document.querySelector('[data-profile=hero] .c-state .c-btn--primary')?.textContent.trim() }));
  ok('load failure: error state with retry', /c-state--error/.test(r.state) && r.role === 'alert' && r.title === 'تعذر تحميل الملف' && r.retry === 'إعادة المحاولة', JSON.stringify(r));
  await p.click('[data-profile=hero] .c-state .c-btn--primary'); await p.waitForTimeout(300);
  r = await p.evaluate(() => ({ h1: document.querySelector('h1')?.textContent.trim(), sections: Array.from(document.querySelectorAll('main > section[data-profile]')).filter((s) => !s.hidden).length }));
  ok('retry recovers the profile', r.h1 === 'مشرف نمبرون' && r.sections === 6, JSON.stringify(r));
  await p.close();
}

// ---------------------------------------------------------------- attribution hand-off (ar, then en)
for (const loc of ['ar', 'en']) {
  const p = await open(PAGE, 1440, 1000, loc);
  await p.evaluate(() => sessionStorage.clear());
  await p.click('[data-profile=hero] .c-btn--primary'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(600);
  let r = await p.evaluate(() => ({ path: location.pathname + location.search, chip: document.querySelector('.c-book__attribution')?.textContent.trim(), chipLink: document.querySelector('.c-book__attribution a')?.getAttribute('href'), checked: document.querySelector('.c-pick[aria-checked=true]')?.dataset.vertical, stored: JSON.parse(sessionStorage.getItem('no.attribution') ?? 'null'), focused: document.activeElement.tagName }));
  ok(`${loc} hero CTA lands on the booking entry with the attribution chip`, r.path === '/mashhor-demo/book/?supervisor=supervisor-1' && r.checked === 'flights' && r.chip.startsWith(loc === 'ar' ? 'تحجز بمساعدة المشرف مشرف نمبرون.' : 'You are booking with the help of supervisor Number One supervisor.') && r.chip.endsWith(loc === 'ar' ? 'الملف الشخصي' : 'Profile') && r.chipLink === '/mashhor-demo/supervisor/supervisor-1/' && r.stored?.supervisor === 'supervisor-1' && r.stored.source === 'link', JSON.stringify(r));
  const fill = (name, value) => p.evaluate(([n, v]) => { const c = document.querySelector(`.c-search__form:not([hidden]) [name="${n}"]:not([type=hidden])`); c.value = v; }, [name, value]);
  await fill('from', 'A'); await fill('to', 'B'); await fill('depart', '2026-12-10'); await fill('return', '2026-12-20');
  await p.click('.c-search__form:not([hidden]) button[type=submit]'); await p.waitForTimeout(400);
  r = await p.evaluate(() => { const ctx = JSON.parse(sessionStorage.getItem('no.booking.context')); const rows = Object.fromEntries(Array.from(document.querySelectorAll('.c-summary__row')).map((row) => [row.querySelector('dt').textContent, row.querySelector('dd').textContent])); return { attribution: ctx.attribution, href: document.querySelector('.c-summary a.c-btn--primary').getAttribute('href'), rows }; });
  ok(`${loc} context carries the attribution; summary shows the supervisor; continue URL too`, r.attribution?.supervisor === 'supervisor-1' && r.attribution.source === 'link' && /supervisor=supervisor-1/.test(r.href) && r.rows[loc === 'ar' ? 'المشرف' : 'Supervisor'] === (loc === 'ar' ? 'مشرف نمبرون' : 'Number One supervisor'), JSON.stringify(r));
  // the attribution persists across the site for the session: a plain /book/ visit and the homepage hero
  await p.goto(ORIGIN + '/mashhor-demo/book/', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  r = await p.evaluate(() => ({ chip: !!document.querySelector('.c-book__attribution[data-supervisor=supervisor-1]') }));
  ok(`${loc} plain /book/ in the same session keeps the attribution chip`, r.chip);
  await p.goto(ORIGIN + '/mashhor-demo/index.html', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  await p.evaluate(async () => { const m = await import('./assets/js/foundation.js'); window.no.home = m.mountHome({ onSearchSubmit: (v, params, ctx) => { window.__ctx = ctx; return false; } }); });
  await p.waitForTimeout(300);
  await p.fill('.c-search__form:not([hidden]) input[name=from]', 'A'); await p.fill('.c-search__form:not([hidden]) input[name=to]', 'B');
  await p.fill('.c-search__form:not([hidden]) input[name=depart]', '2026-11-12'); await p.fill('.c-search__form:not([hidden]) input[name=return]', '2026-11-20');
  await p.click('.c-search__form:not([hidden]) button[type=submit]'); await p.waitForTimeout(300);
  r = await p.evaluate(() => ({ sup: window.__ctx?.attribution?.supervisor, source: window.__ctx?.attribution?.source }));
  ok(`${loc} homepage hero context carries the session attribution`, r.sup === 'supervisor-1' && r.source === 'session', JSON.stringify(r));
  await p.close();
}

// ---------------------------------------------------------------- service card + unknown supervisor param + inactive not stored
{
  const p = await open();
  await p.evaluate(() => sessionStorage.clear());
  await p.click('[data-profile=services] .c-service-card:nth-child(2) .c-card__action, [data-profile=services] .l-grid > :nth-child(2) .c-card__action'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(500);
  let r = await p.evaluate(() => ({ path: location.pathname + location.search, checked: document.querySelector('.c-pick[aria-checked=true]')?.dataset.vertical, chip: !!document.querySelector('.c-book__attribution') }));
  ok('service card action opens the attributed booking entry on that service', r.path === '/mashhor-demo/book/?vertical=hotels&supervisor=supervisor-1' && r.checked === 'hotels' && r.chip, JSON.stringify(r));
  await p.goto(ORIGIN + '/mashhor-demo/book/?supervisor=nobody', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
  r = await p.evaluate(() => ({ chip: !!document.querySelector('.c-book__attribution'), stored: sessionStorage.getItem('no.attribution') }));
  ok('an unknown supervisor slug is ignored; the valid session attribution stays', r.chip && JSON.parse(r.stored).supervisor === 'supervisor-1', JSON.stringify(r));
  await p.evaluate(() => sessionStorage.clear());
  await p.goto(ORIGIN + '/mashhor-demo/book/?supervisor=nobody', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
  r = await p.evaluate(() => ({ chip: !!document.querySelector('.c-book__attribution'), stored: sessionStorage.getItem('no.attribution') }));
  ok('an unknown supervisor slug alone stores nothing and shows no chip', !r.chip && r.stored === null, JSON.stringify(r));
  await p.close();
}

// ---------------------------------------------------------------- keyboard + mobile ergonomics
{
  const p = await open();
  await p.keyboard.press('Tab');
  ok('first Tab is the skip link', await p.evaluate(() => document.activeElement.hasAttribute('data-skip')));
  const seen = [];
  for (let i = 0; i < 16; i++) { await p.keyboard.press('Tab'); seen.push(await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { name: a.className.split(' ')[0] || a.tagName, ring: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || !a.matches(':focus-visible') }; })); }
  ok('every focused control shows a focus ring', seen.every((s) => s.ring), seen.filter((s) => !s.ring).map((s) => s.name).join(','));
  await p.close();
  const m = await open(PAGE, 390, 844, 'ar');
  const r = await m.evaluate(() => {
    const primary = document.querySelector('[data-profile=hero] .c-btn--primary').getBoundingClientRect();
    const photo = document.querySelector('.c-profile__photo').getBoundingClientRect();
    const channels = document.querySelector('[data-profile-action=request]').getBoundingClientRect();
    return { primaryW: primary.width, primaryTop: primary.top, photoW: photo.width, requestH: channels.height, actionsWrap: document.querySelector('.c-profile__actions').getBoundingClientRect().height };
  });
  ok('mobile: photo prominent, CTA within reach, request button a full target', r.photoW >= 120 && r.primaryTop < 844 && r.primaryW >= 120 && r.requestH >= 44, JSON.stringify(r));
  await m.close();
}

await b.close();
console.log(`\n${pass}/${pass + fail} supervisor checks passed`);
console.log('errors:', errs.length ? errs : 'none');
process.exit(fail || errs.length ? 1 : 0);
