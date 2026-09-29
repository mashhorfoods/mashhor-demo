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

async function open(browser, kind, url) {
  const context = await browser.newContext(VIEWPORTS[kind]);
  // Plausible is external; stub it and record every event instead.
  await context.route('https://plausible.io/**', (route) => route.fulfill({ status: 200, body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
  check(/Muhalab Basheir/.test(await page.locator('.g-trust').textContent()) && /Visual Communications Designer/.test(await page.locator('.g-trust').textContent()),
    `[${kind}] profile reads Muhalab Basheir, Visual Communications Designer`);
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
  const context = await browser.newContext(VIEWPORTS.desktop);
  await context.route('https://plausible.io/**', (route) => route.fulfill({ status: 200, body: '' }));
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
  const context = await browser.newContext(VIEWPORTS[kind]);
  await context.route('https://plausible.io/**', (route) => route.fulfill({ status: 200, body: '' }));
  await context.addInitScript(() => { try { localStorage.setItem('site-lang', 'ar'); } catch {} });
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
  check(await p.locator('.c-verify__name').textContent() === 'Muhalab Basheir', `[${kind}] profile name is Muhalab Basheir`);
  const fab = p.locator('.c-wa-fab');
  check(await fab.isVisible() === (kind === 'mobile'), `[${kind}] floating WhatsApp button ${kind === 'mobile' ? 'shown' : 'hidden'}`);
  if (kind === 'mobile') {
    const href = await fab.getAttribute('href');
    check(href.includes(`wa.me/${WHATSAPP}`) && decodeURIComponent(href).includes('مرحبًا بيكسورا'), 'floating WhatsApp message follows the Arabic language choice');
    await p.evaluate(() => window.scrollTo(0, 1600));
    await p.waitForTimeout(600);
    const clash = await p.evaluate(() => { const bar = document.querySelector('.c-phone-cta.is-on .c-btn'); if (!bar) return 'no bar';
      const a = bar.getBoundingClientRect(), f = document.querySelector('.c-wa-fab').getBoundingClientRect(); return f.bottom > a.top && f.top < a.bottom; });
    check(clash === false, 'floating WhatsApp button sits above the phone "Start your project" bar', String(clash));
  }
  await context.close();
}

/* ---- 8. Links: clean, root-based, and every one of them lands -------------- */
{
  const context = await browser.newContext(VIEWPORTS.desktop);
  await context.route('https://plausible.io/**', (route) => route.fulfill({ status: 200, body: '' }));
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
  const context = await browser.newContext(VIEWPORTS.desktop);
  await context.route('https://plausible.io/**', (route) => route.fulfill({ status: 200, body: '' }));
  const p = await context.newPage();
  // Every file a page asks for exists — fonts, images and scripts included.
  const missing = new Set();
  p.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() >= 400 && !r.url().includes('/nope')) missing.add(`${r.status()} ${r.url().replace(BASE, '')}`); });
  for (const path of ['/', '/go', '/pricing', '/about', '/story', '/privacy', '/terms', '/accessibility', '/services/branding', '/services/websites', '/services/social', '/services/marketing', '/services/integrated']) {
    await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  }
  check(missing.size === 0, 'every page: no request for a missing file', [...missing].join(', '));
  await p.goto(`${BASE}/`);
  const cards = await p.$$eval('#services .c-svc-card__link', (els) => els.map((e) => e.getAttribute('href')));
  check(cards.join() === '/services/branding,/services/websites,/services/social,/services/marketing,/services/integrated', 'home: one card per service, linking to its page', cards.join());
  check(await p.locator('#branding, #websites, #social, #marketing, #add-ons, .c-tier').count() === 0, 'home: no duplicated service details or packages');
  const covers = await p.$$eval('#services .c-svc-card__media', (els) => els.map((e) => [e.style.viewTransitionName, e.querySelector('img')?.getAttribute('src')]));
  check(covers.length === 5 && covers.every(([n, src]) => src === `/assets/${n}.webp`), 'home: every service card carries its cover, named for the transition', JSON.stringify(covers));
  for (const [sid, tiers] of [['branding', 3], ['websites', 3], ['social', 3], ['marketing', 3], ['integrated', 0]]) {
    await p.goto(`${BASE}/services/${sid}`);
    await p.waitForTimeout(100);
    check(await p.locator('h1').count() === 1 && await p.locator('.c-crumbs [aria-current]').count() === 1, `/services/${sid}: one heading and a breadcrumb`);
    check(await p.locator('.c-tier').count() === tiers, `/services/${sid}: ${tiers} packages`);
    const hero = await p.$eval('.c-svc-hero', (s) => { const m = s.querySelector('.c-svc-hero__media'); const img = m.querySelector('img'); const r = s.getBoundingClientRect();
      return { name: m.style.viewTransitionName, src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0, h1: !!s.querySelector('h1'), crumbs: !!s.querySelector('.c-crumbs'), tall: r.height >= innerHeight * 0.6 }; });
    const og = await p.$eval('meta[property="og:image"]', (m) => m.content);
    const card = await fetch(`${BASE}/assets/share-${sid}.jpg`);
    check(og === `https://zaokalyamamah.online/assets/share-${sid}.jpg` && card.ok && (await card.arrayBuffer()).byteLength > 20000,
      `/services/${sid}: its own link-preview card, present on the site`, og);
    check(hero.name === `svc-${sid}` && hero.src === `/assets/svc-${sid}.webp` && hero.loaded && hero.h1 && hero.crumbs && hero.tall,
      `/services/${sid}: a hero with its cover (same transition name as its card), breadcrumb and heading`, JSON.stringify(hero));
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
  await p.mouse.move(2, 2);
  await p.evaluate(() => document.querySelector('.c-slides').scrollIntoView({ block: 'center' }));
  const at = () => p.$eval('.c-slides__track', (tr) => Math.round(Math.abs(tr.scrollLeft)));
  const s0 = await at(); await p.waitForTimeout(5200); const s1 = await at();
  check(s1 > s0, '/services/branding: slideshow advances on its own', `${s0} → ${s1}`);
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
    const context = await browser.newContext({ ...VIEWPORTS.desktop, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await context.route('https://plausible.io/**', (route) => route.fulfill({ status: 200, body: '' }));
    await context.addInitScript(() => { try { localStorage.setItem('site-lang', 'ar'); } catch {} });
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
