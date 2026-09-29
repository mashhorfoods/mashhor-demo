// End-to-end check of the campaign landing (/go) and the pages around it.
//
//   php -S 127.0.0.1:8099 -t pixora/site &
//   BASE=http://127.0.0.1:8099 node pixora/tests/campaign.mjs
//
// Needs Playwright (the repo's devDependency). lead.php runs for real under
// PHP's built-in server; mail() is expected to fail there, so the lead is
// proven by the CSV row instead.
import { chromium } from 'playwright';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const here = path.dirname(fileURLToPath(import.meta.url));
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
  check(wa.host === 'wa.me' && wa.path === '/249962672192', `[${kind}] WhatsApp link targets the approved number`);
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
for (const page of ['index.html', 'pricing.html', 'about.html', 'story.html', 'privacy.html', '404.html']) {
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
  for (const page of ['index.html', 'pricing.html', 'about.html']) {
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
    check(/wa\.me\/249962672192/.test(href) && decodeURIComponent(href).includes('مرحبًا بيكسورا'), 'floating WhatsApp message follows the Arabic language choice');
  }
  await context.close();
}

/* ---- 8. Links: clean, root-based, and every one of them lands -------------- */
{
  const context = await browser.newContext(VIEWPORTS.desktop);
  await context.route('https://plausible.io/**', (route) => route.fulfill({ status: 200, body: '' }));
  const p = await context.newPage();
  const internal = new Map(); // href → first page it was seen on
  const pages = ['/', '/pricing', '/about', '/story', '/privacy', '/go', '/404.html'];
  for (const url of pages) {
    const res = await p.goto(`${BASE}${url}`);
    await p.waitForTimeout(150);
    check(res.ok() || url === '/404.html', `${url} is served at its clean address`);
    // After the site script has rendered the menus, so its links count too.
    const hrefs = await p.$$eval('a[href], link[rel=canonical], meta[property="og:url"]', (els) => els.map((e) => e.getAttribute('href') || e.getAttribute('content')));
    for (const href of hrefs) {
      if (/^(https?:|mailto:|tel:)/.test(href) && !href.includes('zaokalyamamah.online')) continue;
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

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
