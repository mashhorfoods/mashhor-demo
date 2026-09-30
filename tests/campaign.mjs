// End-to-end check of the campaign landing (/go) and the pages around it.
//
//   php -S 127.0.0.1:8099 -t site &
//   BASE=http://127.0.0.1:8099 node tests/campaign.mjs
//
// Needs Playwright (the repo's devDependency). lead.php runs for real under
// PHP's built-in server; mail() is expected to fail there, so the lead is
// proven by the CSV row instead.
import { chromium } from 'playwright';
import { readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const here = path.dirname(fileURLToPath(import.meta.url));
const WHATSAPP = JSON.parse(readFileSync(path.join(here, '..', 'tools', 'config.json'), 'utf8')).whatsapp;
const csvCandidates = [path.join(here, '..', 'pixora-leads', 'leads.csv'), path.join(here, '..', 'site', '_leads', 'leads.csv')];
csvCandidates.forEach((file) => { if (existsSync(file)) rmSync(file); });
[path.join(here, '..', 'pixora-leads', 'rate.json'), path.join(here, '..', 'site', '_leads', 'rate.json')]
  .forEach((file) => { if (existsSync(file)) rmSync(file); });

let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  — ${extra}` : ''}`);
  if (!ok) failures += 1;
};

const VIEWPORTS = {
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  tablet: { viewport: { width: 820, height: 1180 }, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
  desktop: { viewport: { width: 1440, height: 900 } },
};

// A browser context on the site: analytics stubbed (it is external), and the
// page's language chosen up front when a test needs one.
// The case studies, as tools/cases.py lists them.
const CASES = [...readFileSync(path.join(here, '..', 'tools', 'cases.py'), 'utf8').matchAll(/"slug": "([^"]+)"/g)].map((m) => m[1]);

async function siteContext(browser, options, lang) {
  const context = await browser.newContext(options);
  await context.route('https://plausible.io/**', (route) => route.fulfill({ status: 200, body: '' }));
  if (lang) await context.addInitScript((l) => { try { localStorage.setItem('site-lang', l); } catch {} }, lang);
  return context;
}

async function open(browser, kind, url) {
  const context = await siteContext(browser, VIEWPORTS[kind]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Analytics events, recorded on the page instead of sent.
  await page.addInitScript(() => {
    window.__events = [];
    document.addEventListener('pixora:event', (e) => window.__events.push(e.detail));
  });
  await page.goto(`${BASE}${url}`);
  await page.waitForLoadState('load');
  await page.waitForTimeout(150);
  return { context, page, errors };
}
const active = (page) => page.evaluate(() => document.querySelector('.g-view.is-active')?.dataset.view);
const events = (page) => page.evaluate(() => window.__events);
const waText = async (page, selector) => {
  const href = await page.locator(selector).first().getAttribute('href');
  const url = new URL(href);
  return { host: url.host, path: url.pathname, text: url.searchParams.get('text') || '' };
};

// CHROMIUM=/path lets a pinned Playwright use an already-installed browser.
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

/* ---- 1. Landing, tracking capture, URL tidy — per device ----------------- */
for (const kind of Object.keys(VIEWPORTS)) {
  const { context, page, errors } = await open(browser, kind,
    '/go?utm_source=snapchat&utm_medium=paid&utm_campaign=launch-q4&utm_content=video-a');
  check(await active(page) === 'home', `[${kind}] lands on the hero`);
  check(await page.locator('#hero-title').isVisible(), `[${kind}] hero headline visible`);
  const lpView = (await events(page)).find((e) => e.name === 'lp_view');
  check(lpView?.source === 'snapchat' && lpView?.campaign === 'launch-q4' && lpView?.device === kind && lpView?.entry === 'home',
    `[${kind}] lp_view carries source/campaign/device/entry`, JSON.stringify(lpView));
  await page.waitForTimeout(100);
  check(!page.url().includes('utm_'), `[${kind}] tracking parameters removed from the address bar`, page.url());
  // Both CTAs above the fold.
  const fold = VIEWPORTS[kind].viewport.height;
  for (const name of ['شوف أعمالنا', 'تواصل معنا']) {
    const box = await page.locator('#top .c-hero__actions a', { hasText: name }).boundingBox();
    check(box && box.y + box.height <= fold, `[${kind}] "${name}" above the fold`);
  }
  const radii = await page.$$eval('.c-btn', (els) => [...new Set(els.filter((e) => e.offsetParent).map((e) => getComputedStyle(e).borderRadius))]);
  check(radii.length === 1 && parseFloat(radii[0]) >= 100, `[${kind}] every visible button is a pill`, radii.join(','));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `[${kind}] no horizontal scroll`, String(overflow));

  // Portfolio path.
  await page.locator('#top a[data-cta="work"]').click();
  await page.waitForTimeout(100);
  check(await active(page) === 'work' && page.url().endsWith('#work'), `[${kind}] "شوف أعمالنا" opens the portfolio`);
  const projects = await page.locator('#work .g-project').count();
  check(projects >= 4 && projects <= 6, `[${kind}] 4–6 projects`, String(projects));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  const contactReachable = kind === 'desktop'
    ? await page.locator('.g-header__cta').isVisible()
    : await page.locator('.g-dock a[data-cta="contact"]').isVisible();
  check(contactReachable, `[${kind}] contact CTA stays on screen while browsing work`);
  check(await page.locator('[data-header] a[data-wa]').isVisible(), `[${kind}] WhatsApp one tap away in the header`);
  const imgs = await page.$$eval('#work img', (list) => list.map((i) => i.getAttribute('src')));
  for (const src of new Set(imgs)) {
    const res = await page.request.get(`${BASE}/${src.replace('./', '')}`);
    if (!res.ok()) check(false, `[${kind}] image ${src} loads`);
  }

  // Contact path from the portfolio.
  await page.locator('#work .g-next a[data-cta="contact"]').click();
  await page.waitForTimeout(100);
  check(await active(page) === 'contact', `[${kind}] portfolio → contact`);
  check(/مهلب بشير/.test(await page.locator('.g-trust').textContent()) && /مصمم المحتوى البصري/.test(await page.locator('.g-trust').textContent()),
    `[${kind}] profile reads مهلب بشير, مصمم المحتوى البصري`);
  const wa = await waText(page, '#contact a[data-wa]');
  check(wa.host === 'wa.me' && wa.path === `/${WHATSAPP}`, `[${kind}] WhatsApp link targets the approved number`);
  check(/سناب شات/.test(wa.text) && /اطّلعت على أعمالكم/.test(wa.text) && /PX-[A-Z0-9]{5}/.test(wa.text),
    `[${kind}] WhatsApp message carries platform, path and reference`, wa.text.replace(/\n/g, ' | '));
  check(!/utm|launch-q4|snapchat/i.test(wa.text), `[${kind}] no technical tracking in the message`);
  const path1 = (await events(page)).filter((e) => e.name === 'lp_step').map((e) => e.path).pop();
  check(path1 === 'portfolio>contact', `[${kind}] path recorded as portfolio>contact`, path1);

  // Back button returns through the views.
  await page.goBack(); await page.waitForTimeout(100);
  check(await active(page) === 'work', `[${kind}] Back returns to the portfolio`);
  await page.goBack(); await page.waitForTimeout(100);
  check(await active(page) === 'home', `[${kind}] Back again returns to the hero`);

  const popup = context.waitForEvent('page', { timeout: 3000 }).catch(() => null);
  await context.route('https://wa.me/**', (route) => route.fulfill({ status: 200, body: 'wa' }));
  await page.locator('[data-header] a[data-wa]').click();
  await popup;
  const tap = (await events(page)).find((e) => e.name === 'channel_tap');
  check(tap?.channel === 'whatsapp' && tap?.placement === 'header', `[${kind}] WhatsApp tap tracked with placement`);
  check(errors.length === 0, `[${kind}] no script errors`, errors.join('; '));
  await context.close();
}

/* ---- 2. Deep links and the entry point ----------------------------------- */
{
  const { context, page } = await open(browser, 'mobile', '/go.html?utm_source=instagram&v=contact');
  check(await active(page) === 'contact', 'deep link ?v=contact opens contact');
  const view = (await events(page)).find((e) => e.name === 'lp_view');
  check(view?.entry === 'contact' && view?.source === 'instagram', 'entry point recorded as contact');
  check(page.url().endsWith('/go.html#contact'), '?v= replaced by a fragment', page.url());
  const wa = await waText(page, '#contact a[data-wa]');
  check(/إنستغرام/.test(wa.text) && !/اطّلعت/.test(wa.text), 'message names Instagram, no portfolio line');
  await context.close();
}
{
  const { context, page } = await open(browser, 'desktop', '/go.html#sent');
  check(await active(page) === 'contact', '#sent without a submission falls back to contact');
  await context.close();
}
{
  const { context, page } = await open(browser, 'desktop', '/go.html?fbclid=abc123#work');
  const view = (await events(page)).find((e) => e.name === 'lp_view');
  check(view?.source === 'meta' && view?.entry === 'work', 'click id without utm → source meta, entry work');
  await context.close();
}
{
  const { context, page } = await open(browser, 'desktop', '/go.html');
  const wa = await waText(page, '#contact a[data-wa]');
  check(/من موقعكم/.test(wa.text) && !/إعلانكم/.test(wa.text), 'organic visit is not described as an ad click');
  await context.close();
}

/* ---- 3. Form: validation, submission, confirmation ----------------------- */
{
  const { context, page, errors } = await open(browser, 'mobile', '/go?utm_source=tiktok&utm_campaign=q4#contact');
  const form = page.locator('[data-lead-form]');
  await form.locator('[data-submit]').click();
  const invalid = await page.$$eval('[data-lead-form] [aria-invalid="true"]', (els) => els.map((e) => e.name));
  check(['name', 'whatsapp', 'location', 'service'].every((n) => invalid.includes(n)) && !invalid.includes('note'),
    'empty submit flags the four required fields, not the note', invalid.join(','));
  check(await page.evaluate(() => document.activeElement?.name) === 'name', 'focus moves to the first invalid field');
  check(await active(page) === 'contact', 'invalid form does not submit');

  await form.locator('#f-name').fill('سارة');
  await form.locator('#f-name').press('Enter');
  check(await page.evaluate(() => document.activeElement?.name) === 'whatsapp' && await active(page) === 'contact',
    'Enter moves to the next field instead of submitting');
  await form.locator('#f-wa').fill('12');
  await form.locator('#f-wa').blur();
  check(await form.locator('#f-wa-err').textContent().then((t) => /رمز الدولة/.test(t)), 'short number rejected with a helpful message');
  await form.locator('#f-wa').fill('٠٠٩٦٦ ٥٠ ١٢٣ ٤٥٦٧');
  check(await form.locator('#f-wa').inputValue() === '00966 50 123 4567', 'Arabic-Indic digits converted as typed');
  await form.locator('#f-city').fill('السعودية — الرياض');
  await form.locator('.g-chip', { hasText: 'موقع إلكتروني' }).click();
  await form.locator('#f-note').fill('نحتاج موقع لمتجر عطور');
  const started = (await events(page)).some((e) => e.name === 'enquiry_started');
  check(started, 'enquiry_started tracked');

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('lead.php')),
    form.locator('[data-submit]').click(),
  ]);
  check(response.status() === 200, 'lead.php accepts the request', String(response.status()));
  await page.waitForTimeout(250);
  check(await active(page) === 'sent', 'confirmation view shown');
  check(await page.locator('#sent-title').textContent() === 'تم استلام طلبك', 'confirmation says "تم استلام طلبك"');
  check(/سارة/.test(await page.locator('[data-sent-name]').textContent()), 'confirmation greets by name');
  const wa = await waText(page, '#sent a[data-wa]');
  check(/أرسلت طلبي الآن/.test(wa.text) && /سارة/.test(wa.text) && /المواقع الإلكترونية/.test(wa.text),
    'post-submission WhatsApp message continues the request');
  const sent = (await events(page)).find((e) => e.name === 'enquiry_sent');
  check(sent?.service === 'websites' && sent?.source === 'tiktok', 'enquiry_sent tracked with service and source');
  check(!(await events(page)).some((e) => JSON.stringify(e).includes('سارة') || JSON.stringify(e).includes('966501234567')),
    'nothing typed into the form reaches analytics');
  await page.goBack(); await page.waitForTimeout(100);
  check(await active(page) !== 'contact' || (await page.locator('#f-name').inputValue()) === '', 'Back from confirmation does not show a filled, unsent form');

  const csv = csvCandidates.find((f) => existsSync(f));
  const content = csv ? readFileSync(csv, 'utf8') : '';
  check(Boolean(csv), 'lead stored', csv || 'no CSV');
  check(/سارة/.test(content) && /\+966501234567/.test(content) && /tiktok/.test(content) && /q4/.test(content) && /PX-/.test(content),
    'stored lead has the normalised number and campaign context');
  check(errors.length === 0, 'no script errors in the form flow', errors.join('; '));
  await context.close();
}

/* ---- 4. Server unavailable → WhatsApp fallback --------------------------- */
{
  const { context, page } = await open(browser, 'mobile', '/go#contact');
  await page.route('**/lead.php', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' }));
  await page.fill('#f-name', 'Omar');
  await page.fill('#f-wa', '+971 50 123 4567');
  await page.fill('#f-city', 'دبي');
  await page.click('.g-chip:has(input[value="social"])');
  await page.click('[data-submit]');
  await page.waitForTimeout(250);
  check(await active(page) === 'contact', 'failed submission never claims success');
  check(await page.locator('[data-form-status]').isVisible(), 'failure explains and offers WhatsApp');
  const wa = await waText(page, '[data-form-status] a[data-wa]');
  check(/Omar/.test(wa.text) && /دبي/.test(wa.text) && /إدارة وسائل التواصل/.test(wa.text), 'fallback WhatsApp message carries the request');
  check((await events(page)).some((e) => e.name === 'enquiry_failed'), 'enquiry_failed tracked');
  await context.close();
}

/* ---- 5. Server-side validation and spam trap ----------------------------- */
{
  const post = (form) => fetch(`${BASE}/lead.php`, { method: 'POST', body: new URLSearchParams(form), headers: { Accept: 'application/json' } });
  let r = await post({ name: 'x', whatsapp: 'abc', location: '', service: 'nope' });
  const body = await r.json();
  check(r.status === 422 && Object.keys(body.errors).length === 4, 'server rejects invalid input', JSON.stringify(body));
  r = await post({ name: 'Bot', whatsapp: '+966501234567', location: 'x y', service: 'social', company: 'spam inc' });
  check(r.status === 200, 'honeypot answered quietly');
  const csv = csvCandidates.find((f) => existsSync(f));
  check(!readFileSync(csv, 'utf8').includes('Bot'), 'honeypot submission not stored');
  r = await fetch(`${BASE}/lead.php`);
  check(r.status === 405, 'GET is refused');
  r = await fetch(`${BASE}/lead.php`, { method: 'POST', body: new URLSearchParams({ name: 'NoJS', whatsapp: '+97455512345', location: 'الدوحة', service: 'branding' }), redirect: 'manual' });
  check(r.status === 303 && /\/go#sent$/.test(r.headers.get('location') || ''), 'no-JS post redirects to the confirmation', r.headers.get('location'));
}

/* ---- 6. The existing site is untouched and still works ------------------- */
for (const page of ['index.html', 'pricing.html', 'about.html', 'story.html', 'privacy.html', 'terms.html', 'accessibility.html', '404.html']) {
  const context = await siteContext(browser, VIEWPORTS.desktop);
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const res = await p.goto(`${BASE}/${page}`);
  await p.waitForTimeout(150);
  const ok = res.ok() || page === '404.html';
  check(ok && errors.length === 0 && await p.locator('.c-header').count() === 1, `${page} loads without errors`, errors.join('; '));
  await context.close();
}

/* ---- 7. Main-site refinements -------------------------------------------- */
for (const kind of ['mobile', 'desktop']) {
  const context = await siteContext(browser, VIEWPORTS[kind], 'ar');
  const p = await context.newPage();
  for (const page of ['index.html', 'pricing.html', 'about.html', 'services/branding', 'services/integrated']) {
    await p.goto(`${BASE}/${page}`);
    await p.waitForTimeout(150);
    const shapes = await p.$$eval('.c-btn', (els) => [...new Set(els.filter((e) => e.offsetParent)
      .map((e) => `${getComputedStyle(e).borderRadius}/${getComputedStyle(e).minHeight}`))]);
    check(shapes.length === 1 && shapes[0] === '999px/52px', `[${kind}] ${page}: every button is a 52px pill`, shapes.join(','));
  }
  await p.goto(`${BASE}/index.html`);
  await p.waitForTimeout(150);
  check(await p.locator('.c-verify__name').innerText() === 'مهلب بشير', `[${kind}] profile name reads in Arabic when the page is Arabic`);
  const fab = p.locator('.c-wa-fab');
  // Phones: present, but aside while the hero (and its own button) is on screen;
  // it arrives once the visitor scrolls on (checked below). Desktop: none.
  check(kind === 'mobile' ? (await fab.count() === 1 && !(await fab.isVisible())) : !(await fab.isVisible()),
    `[${kind}] floating WhatsApp button ${kind === 'mobile' ? 'waits past the hero' : 'hidden'}`);
  if (kind === 'mobile') {
    const href = await fab.getAttribute('href');
    check(href.includes(`wa.me/${WHATSAPP}`) && decodeURIComponent(href).includes('مرحبًا بيكسورا'), 'floating WhatsApp message follows the Arabic language choice');
    await p.evaluate(() => window.scrollTo(0, 1600));
    await p.waitForTimeout(600);
    check(await p.locator('.c-phone-cta').count() === 0 && await fab.isVisible(), 'phones: WhatsApp is the only floating button, still there after scrolling');
  }
  await context.close();
}

/* ---- 8. Links: clean, root-based, and every one of them lands -------------- */
{
  const context = await siteContext(browser, VIEWPORTS.desktop);
  const p = await context.newPage();
  const internal = new Map(); // href → first page it was seen on
  const pages = ['/', '/pricing', '/services/branding', '/services/websites', '/services/social', '/services/marketing', '/services/integrated', '/about', '/story', '/privacy', '/terms', '/accessibility', '/go', '/404.html'];
  for (const url of pages) {
    const res = await p.goto(`${BASE}${url}`);
    await p.waitForTimeout(150);
    check(res.ok() || url === '/404.html', `${url} is served at its clean address`);
    // After the site script has rendered the menus, so its links count too.
    const hrefs = await p.$$eval('a[href], link[rel=canonical], meta[property="og:url"]', (els) => els.map((e) => e.getAttribute('href') || e.getAttribute('content')));
    for (const href of hrefs) {
      if (/^(https?:|mailto:|tel:)/.test(href) && !href.includes('zaokalyamamah.online')) continue;
      if (href === '#') continue; // script-handled controls (e.g. the quiz's share link)
      if (href.startsWith('#')) {
        const id = decodeURIComponent(href.slice(1));
        const ok = await p.evaluate((i) => Boolean(document.getElementById(i)), id);
        if (!ok) check(false, `${url}: in-page link ${href} has a target`);
        continue;
      }
      if (!internal.has(href)) internal.set(href, url);
    }
  }
  const unclean = [...internal.keys()].filter((h) => /\.html\b/.test(h) || h.startsWith('./'));
  check(unclean.length === 0, 'no link ends in .html or is relative', unclean.join(' '));
  for (const [href, from] of internal) {
    const target = new URL(href, `${BASE}/`);
    const path = target.pathname.replace('https://zaokalyamamah.online', '');
    const res = await p.goto(`${BASE}${path}`);
    let ok = res.ok();
    if (ok && target.hash.length > 1) {
      await p.waitForTimeout(50);
      ok = await p.evaluate((i) => Boolean(document.getElementById(i)), decodeURIComponent(target.hash.slice(1)));
    }
    check(ok, `link ${href} (from ${from}) lands`);
  }
  const sitemap = readFileSync(path.join(here, '..', 'site', 'sitemap.xml'), 'utf8');
  check(!sitemap.includes('.html'), 'sitemap lists clean addresses');
  await context.close();
}

/* ---- 9. Services: one card each on the home page, one page each ---------- */
{
  const context = await siteContext(browser, VIEWPORTS.desktop);
  const p = await context.newPage();
  // Every file a page asks for exists — fonts, images and scripts included.
  const missing = new Set();
  p.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() >= 400 && !r.url().includes('/nope')) missing.add(`${r.status()} ${r.url().replace(BASE, '')}`); });
  for (const path of ['/', '/go', '/pricing', '/about', '/story', '/privacy', '/terms', '/accessibility', '/services/branding', '/services/websites', '/services/social', '/services/marketing', '/services/integrated', '/work', ...CASES.map((c) => `/work/${c}`)]) {
    await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  }
  check(missing.size === 0, 'every page: no request for a missing file', [...missing].join(', '));
  await p.goto(`${BASE}/`);
  const cards = await p.$$eval('#services .c-svc-card__link', (els) => els.map((e) => e.getAttribute('href')));
  check(cards.join() === '/services/branding,/services/websites,/services/social,/services/marketing,/services/integrated', 'home: one card per service, linking to its page', cards.join());
  check(await p.locator('#branding, #websites, #social, #marketing, #add-ons, .c-tier').count() === 0, 'home: no duplicated service details or packages');
  const covers = await p.$$eval('#services .c-svc-card__media', (els) => els.map((e) => [e.style.viewTransitionName, e.querySelector('img')?.getAttribute('src')]));
  check(covers.length === 5 && covers.every(([n, src]) => src === `/assets/${n}.webp`), 'home: every service card carries its cover, named for the transition', JSON.stringify(covers));
  // Home: the five services in one sideways rail; its buttons step through it.
  for (const [kind, lang] of [['desktop', 'ar'], ['mobile', 'en']]) {
    const rc = await siteContext(browser, VIEWPORTS[kind], lang);
    const rp = await rc.newPage();
    await rp.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await rp.evaluate(() => document.getElementById('services').scrollIntoView());
    await rp.waitForTimeout(1500);
    const rail = await rp.$eval('[data-rail-track]', (t) => ({ cards: t.children.length, flex: getComputedStyle(t).display, overflow: getComputedStyle(t).overflowX,
      oneRow: new Set([...t.children].map((c) => Math.round(c.getBoundingClientRect().top))).size === 1, scrolls: t.scrollWidth > t.clientWidth,
      bar: !t.parentElement.querySelector('[data-rail-bar]').hidden, prevOff: t.parentElement.querySelector('[data-rail-prev]').disabled }));
    check(rail.cards === 5 && rail.flex === 'flex' && rail.overflow === 'auto' && rail.oneRow && rail.scrolls && rail.bar && rail.prevOff,
      `[${kind}] home: the five services sit in one row that scrolls sideways, with its bar`, JSON.stringify(rail));
    const before = await rp.$eval('[data-rail-track]', (t) => Math.abs(t.scrollLeft));
    await rp.click('[data-rail-next]');
    await rp.waitForTimeout(900);
    const after = await rp.$eval('[data-rail-track]', (t) => ({ at: Math.abs(t.scrollLeft), seen: parseFloat(t.parentElement.querySelector('.c-rail__progress i').style.getPropertyValue('--seen')) }));
    check(after.at > before + 100 && after.seen > 0 && after.seen <= 1, `[${kind}] home: "next" moves the rail a card on, and the gold line follows`, JSON.stringify({ before, ...after }));
    const wide = await rp.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(wide <= 0, `[${kind}] home: the rail does not widen the page`, String(wide));
    // Recent work: a sideways rail on every screen.
    const proof = await rp.$eval('.c-rail--proof [data-rail-track]', (t) => ({ scrolls: t.scrollWidth > t.clientWidth,
      oneRow: new Set([...t.children].map((c) => Math.round(c.getBoundingClientRect().top))).size === 1,
      bar: !t.parentElement.querySelector('[data-rail-bar]').hidden }));
    check(proof.scrolls && proof.oneRow && proof.bar, `[${kind}] home: recent work runs sideways`, JSON.stringify(proof));
    // The doors to the case studies and About.
    await rp.evaluate(() => document.querySelector('.c-doors').scrollIntoView());
    await rp.waitForTimeout(1200);
    const doors = await rp.$$eval('.c-doors .c-door', (ds) => ds.map((d) => [d.getAttribute('href'), [...d.querySelectorAll('img')].every((i) => i.complete && i.naturalWidth > 0)]));
    check(JSON.stringify(doors.map((d) => d[0])) === '["/work","/about"]' && doors.every((d) => d[1]), `[${kind}] home: doors to the case studies and About, their previews loaded`, JSON.stringify(doors));
    await rc.close();
  }
  // Every page's link preview is its own card (or the homepage's), and it is on the site.
  for (const [page, card] of [['/', 'home'], ['/go', 'go'], ['/story', 'story'], ['/about', 'about'], ['/pricing', 'pricing'], ['/work', 'work'], ...CASES.map((c) => [`/work/${c}`, `case-${c}`]), ['/privacy', 'home'], ['/terms', 'home'], ['/accessibility', 'home']]) {
    const html = await (await fetch(`${BASE}${page}`)).text();
    const og = (html.match(/property="og:image" content="([^"]+)"/) || [])[1];
    const tw = (html.match(/name="twitter:image" content="([^"]+)"/) || [])[1];
    const file = await fetch(`${BASE}/assets/share-${card}.jpg`);
    check(og === `https://zaokalyamamah.online/assets/share-${card}.jpg` && tw === og && file.ok && (await file.arrayBuffer()).byteLength > 20000,
      `${page}: link preview is share-${card}.jpg`, String(og));
  }
  for (const [sid, tiers] of [['branding', 3], ['websites', 3], ['social', 3], ['marketing', 3], ['integrated', 0]]) {
    await p.goto(`${BASE}/services/${sid}`);
    await p.waitForTimeout(100);
    check(await p.locator('h1').count() === 1 && await p.locator('.c-crumbs').count() === 0, `/services/${sid}: one heading, no links above it`);
    check(await p.locator('.c-tier').count() === tiers, `/services/${sid}: ${tiers} packages`);
    const hero = await p.$eval('.c-svc-hero', (s) => { const m = s.querySelector('.c-svc-hero__media'); const img = m.querySelector('img'); const r = s.getBoundingClientRect();
      return { name: m.style.viewTransitionName, src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0, h1: !!s.querySelector('h1'), tall: r.height >= innerHeight * 0.6 }; });
    const og = await p.$eval('meta[property="og:image"]', (m) => m.content);
    const card = await fetch(`${BASE}/assets/share-${sid}.jpg`);
    check(og === `https://zaokalyamamah.online/assets/share-${sid}.jpg` && card.ok && (await card.arrayBuffer()).byteLength > 20000,
      `/services/${sid}: its own link-preview card, present on the site`, og);
    check(hero.name === `svc-${sid}` && hero.src === `/assets/svc-${sid}.webp` && hero.loaded && hero.h1 && hero.tall,
      `/services/${sid}: a hero with its cover (same transition name as its card) and heading`, JSON.stringify(hero));
    check(await p.locator('.c-svc-cards .c-svc-card').count() === 4, `/services/${sid}: links to the other four services`);
    const current = await p.$eval('[data-nav-link][aria-current="page"]', (e) => e.getAttribute('href')).catch(() => null);
    check(current === `/services/${sid}` || current === null, `/services/${sid}: menu marks the page`, String(current));
  }
  // Branding: a slideshow of real portfolio work in place of the sample boards.
  await p.goto(`${BASE}/services/branding`, { waitUntil: 'networkidle' });
  const show = await p.$eval('[data-slides]', (box) => ({
    srcs: [...box.querySelectorAll('.c-slides__frame img')].map((i) => i.getAttribute('src').split('/').pop()),
    sizes: [...new Set([...box.querySelectorAll('.c-slides__frame')].map((f) => { const r = f.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; }))],
    bar: !box.querySelector('[data-slides-bar]').hidden,
    boards: document.querySelectorAll('.c-brandboard').length,
  }));
  check(show.srcs.length === 8 && show.srcs.every((s) => /^(work-\d|al-mada-identity)\.webp$/.test(s)) && show.boards === 0,
    '/services/branding: slideshow of portfolio work replaces the sample boards', show.srcs.join(', '));
  check(show.sizes.length === 1 && show.bar, '/services/branding: every slide frame the same size, controls shown', show.sizes.join(' '));
  const at = () => p.$eval('.c-slides__track', (tr) => Math.round(Math.abs(tr.scrollLeft)));
  // Arrive the way people do — the wheel, with the cursor resting mid-screen —
  // and keep scrolling the page over it: it must start soon and not stop.
  await p.evaluate(() => scrollTo(0, 0)); await p.mouse.move(720, 450);
  const target = await p.$eval('.c-slides__track', (tr) => tr.getBoundingClientRect().top + scrollY - 300);
  for (let y = 0; y < target; y += 200) { await p.mouse.wheel(0, 200); await p.waitForTimeout(30); }
  const s0 = await at(); await p.waitForTimeout(2000); const s1 = await at();
  check(s1 > s0, '/services/branding: slideshow starts within 2 s of arriving', `${s0} → ${s1}`);
  for (let i = 0; i < 25; i++) { await p.mouse.wheel(0, i % 2 ? 40 : -40); await p.waitForTimeout(200); }
  check(await at() > s1, '/services/branding: slideshow keeps going while the page scrolls over it');
  await p.click('[data-slides-next]'); await p.waitForTimeout(800);
  check(await at() > s1, '/services/branding: next arrow moves one slide');
  for (const sid of ['websites', 'social', 'marketing', 'integrated']) {
    await p.goto(`${BASE}/services/${sid}`, { waitUntil: 'networkidle' });
    const first = await p.$eval('.c-svc__body .l-container', (c) => c.firstElementChild.matches('.c-slides') || c.children[0]?.matches?.('.c-slides'));
    const n = await p.locator('.c-slides__slide').count();
    check(first && n >= 4, `/services/${sid}: opens with the same work slideshow`, `${n} slides`);
  }
  // No sequence numbering ("01", "02/07") shown anywhere.
  const numbered = [];
  for (const path of ['/', '/pricing', '/about', '/story', '/go', '/services/branding', '/services/websites', '/services/social', '/services/marketing', '/services/integrated']) {
    await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    const r = await p.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /^\s*0\d(\s*\/\s*\d+)?\s*$/.test(e.textContent) && e.getClientRects().length).map((e) => e.className));
    if (r.length) numbered.push(`${path}: ${r.join(', ')}`);
  }
  check(numbered.length === 0, 'no sequence numbering on any page', numbered.join(' | '));

  // Image viewer: open, zoom, pan, next, Escape back to the thumbnail.
  await p.goto(`${BASE}/services/branding`, { waitUntil: 'networkidle' });
  await p.$eval('.c-slides', (e) => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(400);
  await p.click('.c-slides__slide:nth-child(2) img'); await p.waitForTimeout(700);
  const v = () => p.evaluate(() => ({ open: document.querySelector('.c-viewer')?.open, src: document.querySelector('.c-viewer__img')?.src.split('/').pop(), tf: document.querySelector('.c-viewer__img')?.style.transform, cap: document.querySelector('.c-viewer__caption')?.textContent }));
  const v1 = await v();
  check(v1.open && v1.src === 'work-1.webp' && ['Monogram, embossed', 'شعار مطبوع بارزًا'].includes(v1.cap), 'viewer: a slideshow image opens full screen with its caption', JSON.stringify(v1));
  await p.click('.c-viewer [data-v="in"]'); await p.waitForTimeout(400);
  check(/scale\(1\.6\)/.test((await v()).tf), 'viewer: zoom in');
  const fwd = (await p.evaluate(() => document.documentElement.dir)) === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  await p.keyboard.press('0'); await p.keyboard.press(fwd); await p.waitForTimeout(700);
  check((await v()).src === 'work-2.webp', 'viewer: next image with the arrow key (mirrored in Arabic)');
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  const back = await p.evaluate(() => ({ open: document.querySelector('.c-viewer').open, focus: document.activeElement.getAttribute('src') }));
  check(!back.open && back.focus === '/assets/work-2.webp', 'viewer: Escape closes it and focus returns to the image', JSON.stringify(back));
  check(await p.$$eval('a img.is-zoomable', (els) => els.length) === 0, 'viewer: images that are links stay links');

  // /go shows one view even when every inline script is blocked (a CDN that
  // rewrites them breaks their CSP hashes): its own script sets html.js.
  const strict = await browser.newContext(VIEWPORTS.desktop);
  await strict.route(`${BASE}/go`, async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': "script-src 'self'" } });
  });
  const sp = await strict.newPage();
  await sp.goto(`${BASE}/go`, { waitUntil: 'networkidle' });
  const shown = await sp.$$eval('[data-view]', (vs) => vs.filter((v) => getComputedStyle(v).display !== 'none').map((v) => v.dataset.view));
  check(shown.join() === 'home', '/go: one view at a time even with inline scripts blocked', shown.join());
  await strict.close();
  // Without JavaScript every page is still readable (the story's chapters too).
  const nojs = await browser.newContext({ ...VIEWPORTS.desktop, javaScriptEnabled: false });
  const np = await nojs.newPage();
  await np.goto(`${BASE}/story`);
  const hiddenChapters = await np.$$eval('.c-chapter__text > *', (els) => els.filter((e) => +getComputedStyle(e).opacity < 0.95).length);
  check(hiddenChapters === 0, '/story: chapter text shows without JavaScript', String(hiddenChapters));
  await nojs.close();
  // The case study's hero: its four surfaces, each a link down to its chapter.
  {
    const hc = await browser.newContext({ ...VIEWPORTS.desktop });
    const hp = await hc.newPage();
    await hp.goto(`${BASE}/story`, { waitUntil: 'networkidle' });
    const cards = await hp.$$eval('.c-story-hero__card', (as) => as.map((a) => {
      const img = a.querySelector('img'), r = a.getBoundingClientRect();
      return { target: !!document.querySelector(a.hash), loaded: img.complete && img.naturalWidth > 0, name: a.textContent.trim(), inView: r.top < innerHeight && r.bottom > 0 };
    }));
    check(cards.length === 4 && cards.every((c) => c.target && c.loaded && c.name && c.inView), '/story: hero shows the four surfaces, each linking to its chapter', JSON.stringify(cards));
    await hp.click('.c-story-hero__card--website', { force: true }); // it drifts, so never "stable"
    await hp.waitForTimeout(1500);
    const top = await hp.$eval('#story-transformation', (e) => Math.round(e.getBoundingClientRect().top));
    check(top >= 0 && top < 400, '/story: a hero card scrolls to its chapter', String(top));
    await hc.close();
  }
  // About speaks as Pixora: no founder anywhere; the contact card's name follows the language.
  {
    const ac = await browser.newContext({ ...VIEWPORTS.desktop });
    const ap = await ac.newPage();
    await ap.goto(`${BASE}/about`, { waitUntil: 'networkidle' });
    const about = await ap.evaluate(() => ({
      values: document.querySelectorAll('.c-about-value').length,
      stages: document.querySelectorAll('.c-about-stage').length,
      cards: document.querySelectorAll('.c-about .c-svc-card').length,
      person: /Muhalab|مهلب|founder|المؤسس/i.test(document.querySelector('main').textContent),
      hero: !!document.querySelector('.c-about-hero h1') && document.querySelector('.c-about-hero img').complete,
    }));
    check(about.values === 4 && about.stages === 6 && about.cards === 5 && !about.person && about.hero,
      '/about: hero, principles, process and services — about Pixora, no founder', JSON.stringify(about));
    const card = () => ap.$eval('.c-verify', (s) => [...s.querySelectorAll('.c-verify__name, .c-verify__role')].map((e) => e.innerText.trim()).join(' | '));
    const en = await card();
    await ap.locator('button[data-lang="ar"]:visible').first().click();
    await ap.waitForTimeout(300);
    const ar = await card();
    check(en === 'Muhalab Basheir | Visual Communications Designer' && ar === 'مهلب بشير | مصمم المحتوى البصري',
      'contact card: name and role switch to Arabic with the language', `${en} → ${ar}`);
    await ac.close();
    const founder = [];
    for (const f of readdirSync(path.join(here, '..', 'site'), { recursive: true }).map(String).filter((f) => /\.(html|js)$/.test(f) && !f.startsWith('admin'))) {
      const s = readFileSync(path.join(here, '..', 'site', f), 'utf8');
      if (/Founder's portfolio|Founder&#39;s|أعمال المؤسس|موقع المؤسس|muhalabsalah\.github\.io|"founder"/.test(s)) founder.push(f);
    }
    check(founder.length === 0, 'no page or script points to a founder', founder.join());
  }
  // UX pass: fixes that must stay fixed.
  {
    const uc = await siteContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, 'ar');
    const up = await uc.newPage();
    for (const path of ['/about', '/story', '/services/branding', '/404.html']) {
      await up.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await up.evaluate(() => scrollTo(0, document.body.scrollHeight)); await up.waitForTimeout(300);
      await up.locator('.c-footer__top-link').click(); await up.waitForTimeout(1200);
      const at = new URL(up.url()).pathname;
      check(at === path && await up.evaluate(() => scrollY) < 5, `${path}: "Back to top" stays on the page and scrolls up`, `${at} ${await up.evaluate(() => Math.round(scrollY))}`);
    }
    await up.goto(`${BASE}/services/websites`, { waitUntil: 'networkidle' }); await up.waitForTimeout(2000);
    const deal = await up.$eval('.c-svc__deal', (e) => ({ top: Math.round(e.getBoundingClientRect().top), revealed: e.classList.contains('is-revealed') }));
    check(deal.revealed || deal.top > 844 * 0.92, 'a block already at the fold on load is revealed, not left blurred', JSON.stringify(deal));
    await up.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const q = up.locator('.c-faq__q').first(); await q.scrollIntoViewIfNeeded(); await up.waitForTimeout(600);
    const mark = await q.evaluate((s) => { const m = s.querySelector('.c-faq__mark').getBoundingClientRect(); const bar = getComputedStyle(s.querySelector('.c-faq__mark'), '::before'); return { markLeft: m.left, markRight: m.right, left: bar.left, width: bar.width }; });
    check(Math.abs(parseFloat(mark.left) - (mark.markRight - mark.markLeft) / 2) < 1, 'FAQ +/− mark stays inside its box in Arabic', JSON.stringify(mark));
    const form = up.locator('[data-contact-form]'); await form.scrollIntoViewIfNeeded();
    await form.locator('.c-btn--primary').first().click(); await up.waitForTimeout(300);
    check(await form.locator('input[name=name]').evaluate((e) => e.validationMessage) === 'هذا الحقل مطلوب.', 'contact form: validation messages in the page language');
    await up.waitForTimeout(500);
    check(await up.$eval('.c-wa-fab', (e) => e.classList.contains('is-aside') && getComputedStyle(e).visibility === 'hidden'), 'floating WhatsApp steps aside over the contact section');
    const fade = await up.$eval('.c-wa-fab', (e) => getComputedStyle(e).transitionProperty);
    check(/opacity/.test(fade) && /visibility/.test(fade), 'floating WhatsApp fades as it steps aside (one transition rule)', fade);
    await uc.close();
  }
  // UI pass: one system — gold section labels with their rule, bold headings.
  {
    const vc = await siteContext(browser, { ...VIEWPORTS.desktop });
    const vp = await vc.newPage();
    for (const path of ['/', '/pricing', '/story', '/about', '/services/branding', '/privacy']) {
      await vp.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      const off = await vp.evaluate(() => {
        const bad = [];
        document.querySelectorAll('main :is(.c-hero__eyebrow,.c-services__eyebrow,.c-proof__eyebrow,.c-showcase__eyebrow,.c-detail__eyebrow,.c-story__eyebrow,.c-page__eyebrow)').forEach((e) => {
          if (!e.getClientRects().length) return;
          const line = getComputedStyle(e, '::after').content;
          if (line === 'none' || getComputedStyle(e).color !== 'rgb(244, 209, 63)') bad.push('label ' + e.className);
        });
        document.querySelectorAll('main h1, main h2:not(.t-label)').forEach((h) => { if (h.getClientRects().length && +getComputedStyle(h).fontWeight < 700) bad.push('heading ' + h.textContent.trim().slice(0, 30)); });
        return bad;
      });
      check(off.length === 0, `${path}: section labels and headings follow the one system`, off.join(' | '));
    }
    await vc.close();
  }
  // Phones: sideways, the first screen holds the main button; the floating
  // WhatsApp button never sits on the hero's own button.
  {
    const lc = await siteContext(browser, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    const lp = await lc.newPage();
    for (const [path, sel] of [['/', '.c-hero__action'], ['/go', '.c-hero__action'], ['/about', '.c-about-hero .c-btn--primary']]) {
      await lp.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }); await lp.waitForTimeout(600);
      const bottom = await lp.$eval(sel, (e) => Math.round(e.getBoundingClientRect().bottom));
      check(bottom <= 390, `landscape phone ${path}: the main button is on the first screen`, String(bottom));
    }
    await lc.close();
    const sc = await siteContext(browser, { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
    const sp2 = await sc.newPage();
    await sp2.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await sp2.waitForTimeout(800);
    const clash = await sp2.evaluate(() => {
      const f = document.querySelector('.c-wa-fab'), c = document.querySelector('.c-hero__action');
      if (getComputedStyle(f).visibility === 'hidden') return false;
      const a = f.getBoundingClientRect(), b = c.getBoundingClientRect();
      return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    });
    check(!clash, '320px phone: the floating WhatsApp button does not cover the hero button');
    await sc.close();
  }
  // The campaign page's hero shows Pixora's own identity board, and it opens up close.
  {
    const bc = await siteContext(browser, VIEWPORTS.mobile);
    const bp = await bc.newPage();
    await bp.goto(`${BASE}/go`, { waitUntil: 'networkidle' });
    const hero = await bp.$eval('.g-hero__frame img', (i) => ({ src: i.currentSrc.split('/').pop(), ok: i.complete && i.naturalWidth > 0, zoom: i.classList.contains('is-zoomable') }));
    check(/^pixora-board(-900)?\.webp$/.test(hero.src) && hero.ok && hero.zoom, '/go: hero is the Pixora identity board, zoomable', JSON.stringify(hero));
    await bc.close();
  }
  // Case studies: a hub that filters by discipline without reloading, and a
  // page per study that reads in the same order every time.
  for (const [kind, lang] of [['desktop', 'en'], ['mobile', 'ar']]) {
    const cc = await siteContext(browser, VIEWPORTS[kind], lang);
    const cp = await cc.newPage();
    const errs = [];
    cp.on('pageerror', (e) => errs.push(e.message));
    await cp.goto(`${BASE}/work`, { waitUntil: 'networkidle' });
    const shown = () => cp.$$eval('.c-case-card', (els) => els.filter((e) => e.offsetParent).length);
    check(await cp.locator('h1').count() === 1 && await shown() === CASES.length + 1, `[${kind}] /work: every study, and the Al Mada story, as a card`, String(await shown()));
    const hrefs = await cp.$$eval('.c-case-card a', (els) => els.map((a) => a.getAttribute('href')));
    check(hrefs.includes('/story') && CASES.every((c) => hrefs.includes(`/work/${c}`)), `[${kind}] /work: cards link to each study`, hrefs.join());
    // Each card says what its study holds; each filter says how many studies it shows.
    const inside = await cp.$$eval('.c-case-card', (els) => els.map((e) => e.querySelectorAll('.c-case-card__piece').length > 0 && !!e.querySelector('.c-case-card__meta')));
    check(inside.every(Boolean), `[${kind}] /work: every card lists its pieces of work`, JSON.stringify(inside));
    const counts = await cp.$$eval('.c-cases__chip', (els) => els.map((l) => {
      const k = l.getAttribute('for').replace('kind-', '');
      const n = [...document.querySelectorAll('.c-case-card')].filter((c) => k === 'all' || c.dataset.kinds.split(' ').includes(k)).length;
      return +l.querySelector('.c-cases__count').textContent === n;
    }));
    check(counts.every(Boolean), `[${kind}] /work: each filter's count matches its cards`, JSON.stringify(counts));
    check(!/talk-about-sudan|Talk About Sudan/i.test(await cp.content()), `[${kind}] /work: Talk About Sudan is gone`);
    await cp.click('label[for="kind-editorial"]');
    const editorial = await cp.$$eval('.c-case-card', (els) => els.filter((e) => e.offsetParent).map((e) => e.dataset.kinds));
    check(editorial.length >= 1 && editorial.length < CASES.length && editorial.every((k) => k.split(' ').includes('editorial')), `[${kind}] /work: a discipline shows only its studies`, editorial.join('|'));
    await cp.click('label[for="kind-all"]');
    check(await shown() === CASES.length + 1, `[${kind}] /work: "All work" brings every card back`);
    check(await cp.locator('.c-crumbs').count() === 0, `[${kind}] /work: no links above its heading`);
    const width = await cp.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(width <= 0, `[${kind}] /work: no horizontal scroll`, String(width));
    const menu = await cp.$$eval('[data-nav-link]', (els) => els.map((a) => [a.getAttribute('href'), a.getAttribute('aria-current'), a.textContent.trim()]));
    const entry = menu.find(([h]) => h === '/work');
    check(entry && entry[1] === 'page' && entry[2] === (lang === 'ar' ? 'دراسات الحالة' : 'Case studies'), `[${kind}] the menu's "Case studies" leads to /work and marks it`, JSON.stringify(entry));
    for (const slug of CASES) {
      await cp.goto(`${BASE}/work/${slug}`, { waitUntil: 'domcontentloaded' });
      const page = await cp.evaluate(() => ({
        h1: document.querySelectorAll('h1').length,
        crumbs: document.querySelectorAll('.c-crumbs').length,
        prints: [...document.querySelectorAll('.c-story-hero__card')].map((a) => a.getAttribute('href')),
        chapters: [...document.querySelectorAll('.c-chapter')].map((c) => c.id),
        drawings: document.querySelectorAll('.c-chapter__figure svg.c-sketch title').length,
        frames: [...document.querySelectorAll('.c-case-work')].map((f) => { const m = f.querySelector('.c-ph, img'); const r = m.getBoundingClientRect(); return m.width || r.width > 0; }),
        more: document.querySelectorAll('.c-case__more .c-case-card').length,
        wide: document.documentElement.scrollWidth - innerWidth,
      }));
      const linked = page.prints.every((h) => page.chapters.includes(h.slice(1)));
      check(page.h1 === 1 && page.crumbs === 0 && page.prints.length === 4 && linked && page.chapters.length === 5 && page.drawings === 5
        && page.frames.length >= 4 && page.frames.every(Boolean) && page.more === CASES.length && page.wide <= 0,
        `[${kind}] /work/${slug}: told like the story — four prints linked to their chapters, five drawn chapters, the work framed, a rail of every other study and the story`, JSON.stringify(page));
    }
    // Chapters draw themselves as they arrive, like the story's.
    await cp.goto(`${BASE}/work/${CASES[3]}`, { waitUntil: 'networkidle' });
    await cp.evaluate(() => document.querySelector('.c-chapter:last-of-type').scrollIntoView());
    await cp.waitForTimeout(800);
    check(await cp.$eval('.c-chapter:last-of-type', (c) => c.classList.contains('is-drawing')), `[${kind}] a study's chapters draw themselves in`);
    check(errs.length === 0, `[${kind}] case studies: no script errors`, errs.join('; '));
    await cc.close();
  }
  // The code lead.php and /admin/ share is never served; the admin page links
  // the same stylesheet as every other page (written in by the build).
  {
    const lib = await fetch(`${BASE}/_lib/storage.php`);
    const deny = readFileSync(path.join(here, '..', 'site', '_lib', '.htaccess'), 'utf8');
    check(lib.status === 403 && /Require all denied/.test(deny), '_lib/ (shared PHP) is closed to the web', String(lib.status));
    const css = readdirSync(path.join(here, '..', 'site', 'assets')).find((f) => /^site\.[a-f0-9]+\.css$/.test(f));
    const adminSrc = readFileSync(path.join(here, '..', 'site', 'admin', 'index.php'), 'utf8');
    check(adminSrc.includes(`href="/assets/${css}"`), '/admin/ links the current shared stylesheet', css);
  }
  // Every inline script is covered by a hash in the CSP the server sends.
  {
    const { createHash } = await import('node:crypto');
    const csp = readFileSync(path.join(here, '..', 'site', '.htaccess'), 'utf8').match(/Content-Security-Policy "[^"]*?script-src ([^;"]+)/)[1];
    const missing = [];
    for (const f of readdirSync(path.join(here, '..', 'site'), { recursive: true }).map(String).filter((f) => f.endsWith('.html') && !f.startsWith('admin'))) {
      const html = readFileSync(path.join(here, '..', 'site', f), 'utf8');
      for (const [, attrs, body] of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (/application\/ld\+json/.test(attrs)) continue;
        const h = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
        if (!csp.includes(h)) missing.push(f);
      }
    }
    check(missing.length === 0, 'CSP: every inline script is allowed by its hash', [...new Set(missing)].join(', '));
  }

  await p.goto(`${BASE}/pricing`);
  check(await p.locator('.c-tier').count() === 0 && await p.locator('#add-ons .c-addon').count() >= 11 && await p.locator('#build').count() === 1,
    'pricing: no duplicated packages; every add-on and the builder are here');
  const index = await p.$$eval('.c-index__link', (els) => els.map((e) => e.getAttribute('href')));
  check(index.slice(0, 4).every((h) => h.startsWith('/services/')), 'pricing: service index opens the service pages', index.join());
  await context.close();
}

/* ---- 10. Quiet luxury: the motion layer ------------------------------------ */
{
  for (const reduced of [false, true]) {
    const context = await siteContext(browser, { ...VIEWPORTS.desktop, reducedMotion: reduced ? 'reduce' : 'no-preference' }, 'ar');
    const p = await context.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    const tag = reduced ? 'reduced motion' : 'motion';
    for (const page of ['/', '/pricing', '/services/social', '/about', '/go']) {
      await p.goto(`${BASE}${page}`);
      await p.waitForTimeout(150);
      check(await p.locator('script[src^="/assets/motion."]').count() === 1, `[${tag}] ${page}: motion layer loaded once`);
    }
    await p.goto(`${BASE}/`);
    await p.waitForTimeout(1400);
    const lines = await p.$$eval('.c-hero__headline [lang="ar"] .m-line', (els) => els.length);
    check(reduced ? lines === 0 : lines === 3, `[${tag}] hero headline ${reduced ? 'stays whole' : 'rises in 3 lines'}`, String(lines));
    check(await p.$eval('.c-hero__headline', (e) => getComputedStyle(e).opacity) === '1', `[${tag}] hero headline visible`);
    if (!reduced) {
      await p.waitForSelector('html[data-motion="ready"]', { timeout: 5000 });
      await p.evaluate(() => document.querySelector('#work').scrollIntoView({ block: 'center' }));
      // It glides only while on screen, after the 1.8 s pause it keeps at each end.
      await p.waitForTimeout(2200);
      const a = await p.$eval('.c-gallery', (g) => g.scrollLeft);
      await p.waitForTimeout(1500);
      const b = await p.$eval('.c-gallery', (g) => g.scrollLeft);
      check(Math.abs(b - a) > 10, '[motion] work gallery glides on its own', `${a} → ${b}`);
      await p.hover('.c-gallery');
      await p.waitForTimeout(300);
      const c = await p.$eval('.c-gallery', (g) => g.scrollLeft);
      await p.waitForTimeout(800);
      check(Math.abs((await p.$eval('.c-gallery', (g) => g.scrollLeft)) - c) < 1, '[motion] gallery stops under the pointer');
    }
    for (let y = 0; y < 14000; y += 500) { await p.evaluate((v) => window.scrollTo(0, v), y); await p.waitForTimeout(40); }
    await p.waitForTimeout(1200);
    const hidden = await p.$$eval('[data-reveal], [data-reveal-group] > *', (els) => els.filter((e) => e.offsetParent && parseFloat(getComputedStyle(e).opacity) < 0.99).length);
    check(hidden === 0, `[${tag}] nothing left hidden after scrolling the homepage`, String(hidden));
    check(errors.length === 0, `[${tag}] no script errors`, errors.join('; '));
    await context.close();
  }
}

/* ---- Touch screens: reveals that keep up with a flick -------------------- */
// Phones and tablets reveal sooner, shorter and without blur; desktop keeps
// its slower rhythm. Long reads carry a progress line bound to the scroll.
for (const [kind, touch] of [['mobile', true], ['desktop', false]]) {
  const context = await siteContext(browser, { ...VIEWPORTS[kind], ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  const p = await context.newPage();
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const pending = await p.evaluate(() => {
    const el = [...document.querySelectorAll('[data-reveal-group]:not(.is-revealed) > *, [data-reveal]:not(.is-revealed)')].at(-1);
    const cs = getComputedStyle(el);
    return { ms: parseFloat(cs.transitionDuration) * 1000, blur: cs.filter !== 'none' };
  });
  check(touch ? pending.ms <= 600 && !pending.blur : pending.ms >= 800 && pending.blur,
    `[${kind}] reveals: ${touch ? 'short and sharp on touch screens' : 'the slower, blurred rhythm on desktop'}`, JSON.stringify(pending));
  if (touch) {
    // The next block below the fold is already revealing before it arrives.
    const early = await p.evaluate(async () => {
      const el = [...document.querySelectorAll('[data-reveal], [data-reveal-group]')].find((e) => e.getBoundingClientRect().top > innerHeight * 1.2);
      scrollBy(0, el.getBoundingClientRect().top - innerHeight * 1.05);
      await new Promise((r) => setTimeout(r, 200));
      return el.classList.contains('is-revealed') && el.getBoundingClientRect().top > innerHeight;
    });
    check(early, `[${kind}] reveals start just before the fold on touch screens`);
    await p.goto(`${BASE}/work/information-design`, { waitUntil: 'networkidle' });
    const fill = async (k) => { await p.evaluate((k) => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * k), k); await p.waitForTimeout(200);
      return p.evaluate(() => getComputedStyle(document.body, '::before').scale); };
    const seen = [await fill(0), await fill(0.5), await fill(1)];
    check(seen[0].startsWith('0') && seen[1].startsWith('0.5') && seen[2] === '1', `[${kind}] case study: the progress line fills with the scroll`, seen.join(' | '));
  }
  await context.close();
}

/* ---- Large screens: the page grows with the screen --------------------- */
// From 1680 px the base size and the page's width grow in steps; below it
// nothing changes. The featured card's image never runs into its text.
for (const [w, root] of [[1440, 16], [1920, 18], [2560, 20]]) {
  const context = await siteContext(browser, { viewport: { width: w, height: 1100 } });
  const p = await context.newPage();
  await p.goto(`${BASE}/work`, { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => {
    const L = document.querySelector('.c-case-card--featured .c-case-card__link');
    const gap = L.querySelector('.c-case-card__kind').getBoundingClientRect().left - L.querySelector('.c-case-card__media').getBoundingClientRect().right;
    const box = document.querySelector('.c-cases .l-container').getBoundingClientRect();
    return { root: parseFloat(getComputedStyle(document.documentElement).fontSize), gap: Math.round(gap), share: box.width / innerWidth, overflow: document.documentElement.scrollWidth - innerWidth };
  });
  check(r.root === root, `[${w}px] base size ${root}px`, String(r.root));
  check(r.gap >= 24, `[${w}px] /work: the featured card's image stays clear of its text`, `${r.gap}px`);
  check(w < 1680 || r.share >= 0.7, `[${w}px] /work: the page uses the width of a large screen`, r.share.toFixed(2));
  check(r.overflow <= 0, `[${w}px] /work: no horizontal scroll`, String(r.overflow));
  await context.close();
}

/* ---- Sideways and scroll-bound presentation ------------------------------ */
{
  // Phones: a service's packages in a rail that opens on the recommended one.
  const phone = await siteContext(browser, VIEWPORTS.mobile);
  const p = await phone.newPage();
  await p.goto(`${BASE}/services/branding`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const tiers = await p.evaluate(() => {
    const t = document.querySelector('.c-rail--tiers .c-tiers'); const f = t.querySelector('.c-tier--featured').getBoundingClientRect(); const b = t.getBoundingClientRect();
    return { rail: t.scrollWidth > t.clientWidth, centred: Math.abs(f.left + f.width / 2 - (b.left + b.width / 2)) < 4 };
  });
  check(tiers.rail && tiers.centred, '[mobile] service packages: a rail that opens on the recommended package', JSON.stringify(tiers));
  // About on a phone: the six stages swipe sideways; the principles stack.
  await p.goto(`${BASE}/about`, { waitUntil: 'networkidle' });
  const stagesRail = await p.$eval('.c-about-stages', (o) => o.scrollWidth > o.clientWidth + 100);
  check(stagesRail, '[mobile] /about: the six stages swipe sideways');
  // Home: the brands strip names only brands the site's own images show.
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const brands = await p.evaluate(() => {
    const names = [...document.querySelectorAll('.c-brands__item:not([aria-hidden]) [data-lang-copy="en"]')].map((e) => e.textContent.replace(/ &.*| Travel.*/, '').trim());
    const alts = [...document.querySelectorAll('img[alt]')].map((i) => i.dataset.altEn || i.alt).join(' ');
    return { names, shown: names.every((n) => alts.includes(n)), copies: document.querySelectorAll('.c-brands__item[aria-hidden="true"]').length };
  });
  check(brands.names.length >= 4 && brands.shown && brands.copies === brands.names.length, 'home: the brands strip names only brands shown in the work, looped once for assistive tech', JSON.stringify(brands));
  // The Al Mada story ends like every study: all the others, in a rail whose
  // buttons stay clear of the floating WhatsApp button.
  await p.goto(`${BASE}/story`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const end = await p.evaluate(async () => {
    const bar = document.querySelector('.c-case__more [data-rail-bar]'); bar.scrollIntoView({ block: 'end', behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 600));
    const f = document.querySelector('.c-wa-fab').getBoundingClientRect();
    return { cards: document.querySelectorAll('.c-case__more .c-case-card').length, bar: !bar.hidden,
      covered: [...bar.querySelectorAll('button')].some((x) => { x = x.getBoundingClientRect(); return x.right > f.left && x.left < f.right && x.bottom > f.top && x.top < f.bottom; }) };
  });
  check(end.cards === CASES.length && end.bar && !end.covered, '[mobile] /story: ends in a rail of every study, its buttons clear of WhatsApp', JSON.stringify(end));
  await phone.close();

  const desk = await siteContext(browser, VIEWPORTS.desktop);
  const d = await desk.newPage();
  // About on a computer: the stages pin and travel with the scroll, start to end.
  await d.goto(`${BASE}/about`, { waitUntil: 'networkidle' });
  const pin = await d.evaluate(async () => {
    const pin = document.querySelector('.c-about-pin'); const ol = document.querySelector('.c-about-stages');
    const at = async (k) => { const top = pin.getBoundingClientRect().top + scrollY; scrollTo({ top: top + (pin.offsetHeight - innerHeight) * k, behavior: 'instant' });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const s = [...ol.children].map((c) => c.getBoundingClientRect()); const box = document.querySelector('.c-about-pin__stick').getBoundingClientRect();
      return { stuck: Math.abs(box.top) < 2, first: Math.round(s[0].left), last: Math.round(s.at(-1).right) }; };
    return [await at(0), await at(0.5), await at(1)];
  });
  const edge = await d.evaluate(() => { const c = document.querySelector('.c-about-process .l-container'); const r = c.getBoundingClientRect(); const pad = parseFloat(getComputedStyle(c).paddingLeft); return [Math.round(r.left + pad), Math.round(r.right - pad)]; });
  check(pin.every((x) => x.stuck) && Math.abs(pin[0].first - edge[0]) < 3 && pin[1].first < pin[0].first && Math.abs(pin[2].last - edge[1]) < 3,
    '[desktop] /about: the stages pin and travel with the scroll, first card to last', JSON.stringify({ pin, edge }));
  // The principles stack: scrolled past, each holds a step below the one before.
  const stack = await d.evaluate(async () => {
    const g = document.querySelector('.c-about-values__grid'); scrollTo({ top: g.getBoundingClientRect().top + scrollY + g.offsetHeight - innerHeight * 0.9, behavior: 'instant' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const t = [...g.children].map((c) => Math.round(c.getBoundingClientRect().top)); return t;
  });
  check(stack[1] > stack[0] && stack[1] - stack[0] < 40 && stack[2] > stack[1], '[desktop] /about: the principles stack, each a step below the last', stack.join(','));
  // Case studies on a computer: a chapter's text holds while its work passes.
  await d.goto(`${BASE}/work/brand-identity-systems`, { waitUntil: 'networkidle' });
  const scrolly = await d.evaluate(async () => {
    const ch = document.querySelector('#ch-test'); const text = ch.querySelector('.c-chapter__text'); const work = ch.querySelector('.c-case-work');
    const at = async (dy) => { scrollTo({ top: ch.getBoundingClientRect().top + scrollY + dy, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 300)); return [Math.round(text.getBoundingClientRect().top), Math.round(work.getBoundingClientRect().top)]; };
    return [await at(200), await at(600)];
  });
  check(scrolly[0][0] === scrolly[1][0] && scrolly[1][1] < scrolly[0][1] - 300, '[desktop] case study: a chapter\'s text holds while its work passes', JSON.stringify(scrolly));
  await desk.close();
}

/* ---- Layout across screens: aligned, filled, evenly spaced --------------- */
{
  // Tablets: a chapter's text sits beside its drawing; the closing box stacks.
  const tab = await siteContext(browser, VIEWPORTS.tablet);
  const t = await tab.newPage();
  await t.goto(`${BASE}/story`, { waitUntil: 'networkidle' });
  const side = await t.evaluate(() => [...document.querySelectorAll('.c-chapter')].map((c) => {
    const a = c.querySelector('.c-chapter__text').getBoundingClientRect(); const f = c.querySelector('.c-chapter__figure').getBoundingClientRect();
    return Math.abs((a.top + a.bottom) / 2 - (f.top + f.bottom) / 2) < a.height && (a.right <= f.left + 1 || f.right <= a.left + 1);
  }));
  check(side.every(Boolean), '[tablet] /story: each chapter\'s text sits beside its drawing', JSON.stringify(side));
  await t.goto(`${BASE}/work`, { waitUntil: 'networkidle' });
  const quote = await t.evaluate(() => { const q = document.querySelector('.c-quote'); const h = q.querySelector('.c-quote__title').getBoundingClientRect(); return h.width / (q.getBoundingClientRect().width - 80); });
  check(quote > 0.6, '[tablet] the closing box: its heading across the width, buttons below', quote.toFixed(2));
  await tab.close();

  for (const w of [1440, 1920]) {
    const d = await siteContext(browser, { viewport: { width: w, height: 900 } });
    const p = await d.newPage();
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const r = await p.evaluate(() => {
      const x = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().left);
      const head = document.querySelector('.c-faq__head').getBoundingClientRect(); const list = document.querySelector('.c-faq__list').getBoundingClientRect();
      return { hero: x('.c-hero__headline'), logo: x('.c-header__logo, .c-header a'), faqSide: list.left > head.right };
    });
    check(r.hero === r.logo, `[${w}px] home: the hero lines up with the logo`, JSON.stringify(r));
    check(r.faqSide, `[${w}px] home: the questions sit beside their heading`);
    // No stretch of empty page taller than a third of the screen between sections.
    for (const url of ['/', '/about', '/work/digital-campaigns', '/services/websites', '/pricing']) {
      await p.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
      const gap = await p.evaluate(() => {
        const main = document.querySelector('main'); const H = document.documentElement.scrollHeight; const band = new Uint8Array(Math.ceil(H / 4));
        for (const el of main.querySelectorAll('*')) {
          const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          // The pinned stages' height is scroll travel, filled on screen as it pins.
          const inked = el.matches('img, svg, video, input, textarea, select, button, .c-about-pin') || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || (cs.borderTopStyle !== 'none' && cs.borderTopWidth !== '0px') || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && !el.matches('section, main'));
          if (!inked) continue; const r = el.getBoundingClientRect(); if (r.width < 4) continue;
          for (let y = Math.max(0, Math.floor((r.top + scrollY) / 4)); y < Math.min(band.length, Math.ceil((r.bottom + scrollY) / 4)); y++) band[y] = 1;
        }
        const m = main.getBoundingClientRect(); let run = 0, worst = 0;
        for (let y = Math.floor((m.top + scrollY) / 4); y < Math.ceil((m.bottom + scrollY) / 4); y++) { run = band[y] ? 0 : run + 4; worst = Math.max(worst, run); }
        return worst / (parseFloat(getComputedStyle(document.documentElement).fontSize) / 16);
      });
      // In 16 px units: the page scales up with the base size on large screens.
      check(gap <= 300, `[${w}px] ${url}: no empty stretch over 300 px (at a 16 px base) between sections`, `${Math.round(gap)}px`);
    }
    await d.close();
  }
}

/* ---- Search and link previews ----------------------------------------------- */
{
  const ctx = await siteContext(browser, VIEWPORTS.desktop);
  const p = await ctx.newPage();
  const indexable = ['/', '/about', '/story', '/work', '/pricing', '/privacy', '/terms', '/accessibility',
    ...['branding', 'websites', 'social', 'marketing', 'integrated'].map((s) => `/services/${s}`), ...CASES.map((c) => `/work/${c}`)];
  const bad = [];
  for (const url of indexable) {
    await p.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
    const r = await p.evaluate(() => {
      const m = (sel) => document.querySelector(sel)?.getAttribute('content');
      let ld = [];
      try { ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)); } catch (e) { ld = null; }
      const shown = [...document.querySelectorAll('.c-tier__amount')].map((e) => e.textContent.replace(/,/g, '').trim());
      return { title: document.title, desc: m('meta[name="description"]'), og: m('meta[property="og:description"]'), canon: document.querySelector('link[rel="canonical"]')?.href, ld, shown, hreflang: document.querySelectorAll('[hreflang]').length };
    });
    const problems = [];
    if (!r.title || r.title.length > 65) problems.push(`title ${r.title?.length}`);
    if (!r.desc || r.desc.length < 50 || r.desc.length > 160) problems.push(`description ${r.desc?.length}`);
    // Previews: Arabic first, then the page's own English description.
    if (!r.og || !/^[\u0600-\u06FF]/.test(r.og) || (url !== '/story' && !r.og.endsWith(` | ${r.desc}`))) problems.push('preview text is not the page\'s, Arabic first');
    if (!r.canon) problems.push('no canonical');
    if (r.ld === null) problems.push('structured data does not parse');
    if (r.hreflang) problems.push('hreflang on a one-address bilingual page');
    const types = (r.ld || []).map((x) => x['@type']);
    if (url.startsWith('/services/')) {
      const svc = (r.ld || []).find((x) => x['@type'] === 'Service');
      const prices = (svc?.offers || []).map((o) => o.price);
      if (!svc || JSON.stringify(prices) !== JSON.stringify(r.shown)) problems.push(`service data ${JSON.stringify(prices)} vs shown ${JSON.stringify(r.shown)}`);
    }
    if ((url.startsWith('/work/') || url === '/story') && !types.includes('CreativeWork')) problems.push('no CreativeWork');
    if (url === '/' && !(types.includes('Organization') && types.includes('WebSite'))) problems.push('no Organization/WebSite');
    if (problems.length) bad.push(`${url}: ${problems.join(', ')}`);
  }
  check(bad.length === 0, 'search: every page has its own title, description, preview and valid structured data; prices match the page', bad.join(' | '));
  const sitemap = await (await p.request.get(`${BASE}/sitemap.xml`)).text();
  const entries = sitemap.split('<url>').slice(1);
  check(entries.length === indexable.length && entries.every((e) => /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(e)), 'sitemap: every indexable page, each with a date', `${entries.length} entries`);
  await ctx.close();
}

/* ---- Arabic first for Arabic speakers --------------------------------------- */
// A first visit takes the device's language (the first of Arabic or English it
// lists), set before anything is painted; a choice once made always wins.
for (const [label, locale, stored, want] of [['an Arabic phone', 'ar-SA', null, 'ar'], ['an English phone', 'en-US', null, 'en'],
  ['an Arabic phone whose owner chose English', 'ar-EG', 'en', 'en'], ['an English phone whose owner chose Arabic', 'en-GB', 'ar', 'ar']]) {
  const ctx = await browser.newContext({ ...VIEWPORTS.mobile, locale });
  await ctx.route(/plausible\.io/, (r) => r.abort());
  if (stored) await ctx.addInitScript((v) => { try { localStorage.setItem('site-lang', v); } catch {} }, stored);
  await ctx.addInitScript(() => { document.addEventListener('readystatechange', () => { if (document.readyState === 'interactive') window.__first = document.documentElement.lang + '/' + document.documentElement.dir; }, { once: true }); });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${BASE}/services/branding`, { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => ({ first: window.__first, lang: document.documentElement.lang, title: document.title, pressed: document.querySelector('button[data-lang][aria-pressed="true"]')?.dataset.lang }));
  const dir = want === 'ar' ? 'rtl' : 'ltr';
  check(r.first === `${want}/${dir}` && r.lang === want && r.pressed === want && (want === 'en' || /[\u0600-\u06FF]/.test(r.title)) && errs.length === 0,
    `language: ${label} opens in ${want === 'ar' ? 'Arabic' : 'English'}, from the first paint`, JSON.stringify(r));
  await ctx.close();
}

/* ---- The contact path --------------------------------------------------------- */
{
  // The homepage form sends to the team and says so only once it is held; with
  // no server it falls back to the mail app, with WhatsApp beside it.
  for (const mode of ['held', 'no server']) {
    const ctx = await browser.newContext({ ...VIEWPORTS.mobile, locale: 'ar-SA' });
    await ctx.route(/plausible\.io/, (r) => r.abort());
    if (mode === 'no server') await ctx.route('**/lead.php', (r) => r.fulfill({ status: 404, body: '' }));
    await ctx.addInitScript(() => { window.__events = []; window.plausible = (e) => window.__events.push(e); });
    const p = await ctx.newPage();
    let mailApp = false; p.on('request', (r) => { if (r.url().startsWith('mailto:')) mailApp = true; });
    await p.goto(`${BASE}/#contact`, { waitUntil: 'networkidle' });
    await p.selectOption('#contact-about', 'websites:web-business');
    await p.fill('#contact-name', 'اختبار');
    await p.fill('#contact-email', 'test@example.com');
    await p.fill('#contact-whatsapp', '+971 50 123 4567');
    await p.fill('#contact-message', 'موقع لمخبز');
    await p.click('[data-contact-form] [type="submit"]');
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => ({ status: document.querySelector('[data-contact-status]').textContent, fallback: !document.querySelector('[data-contact-fallback]').hidden, events: window.__events, kept: document.querySelector('#contact-name').value }));
    if (mode === 'held') check(/وصلتنا رسالتك/.test(r.status) && !r.fallback && !mailApp && r.events.includes('enquiry_sent') && !r.events.includes('enquiry_failed') && r.kept === '',
      'contact form: sent to the team, confirmed only once held, counted as sent', JSON.stringify(r));
    else check(r.fallback && mailApp && r.events.includes('enquiry_failed') && !r.events.includes('enquiry_sent') && r.kept === 'اختبار',
      'contact form: with no server, the mail app and WhatsApp take over; counted as failed, the text kept', JSON.stringify(r));
    await ctx.close();
  }
  // After a study, WhatsApp opens with the study's name; the floating button
  // on a service or a study carries its topic.
  const ctx = await browser.newContext({ ...VIEWPORTS.mobile, locale: 'ar-SA' });
  await ctx.route(/plausible\.io/, (r) => r.abort());
  const p = await ctx.newPage();
  const topic = [];
  for (const [url, want] of [['/work/information-design', 'تصميم المعلومات'], ['/story', 'المدى'], ['/services/social', 'إدارة وسائل التواصل']]) {
    await p.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
    const r = await p.evaluate(() => ({ close: decodeURIComponent(document.querySelector('.c-svc__next a[data-wa]')?.href || ''), fab: decodeURIComponent(document.querySelector('.c-wa-fab').href) }));
    topic.push(`${url}: ${(url.startsWith('/services') || r.close.includes(want)) && r.fab.includes(want)}`);
  }
  check(topic.every((t) => t.endsWith('true')), 'WhatsApp from a study or a service names what the visitor was reading', topic.join(' | '));
  await ctx.close();
}

await browser.close();

// The built site ships only what it uses, and every placeholder is filled.
{
  const site = path.join(here, '..', 'site');
  const files = readdirSync(site, { recursive: true }).map(String).filter((f) => !f.startsWith('_leads'));
  const text = files.filter((f) => /\.(html|css|js|php|xml|txt)$|\.htaccess$/.test(f))
    .map((f) => [f, readFileSync(path.join(site, f), 'utf8')]);
  const unused = files.filter((f) => f.startsWith('assets' + path.sep) && /\.\w+$/.test(f))
    .filter((f) => !text.some(([name, body]) => name !== f && body.includes(path.basename(f))));
  check(unused.length === 0, '[build] every file in site/assets is used', unused.join(', '));
  const unfilled = text.filter(([, body]) => body.includes('{{WHATSAPP}}')).map(([name]) => name);
  check(unfilled.length === 0, '[build] WhatsApp number filled in everywhere', unfilled.join(', '));
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
