// Stage 10.11 — reduced motion + keyboard traps + Escape/focus return on every overlay.
import './env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let pass = 0, fail = 0; const ok = (n, c, note = '') => { if (c) pass++; else { fail++; console.log(`  ✗ ${n} ${note}`); } };
const errs = [];
const open = async (url, w, h, reduce, loc = 'ar') => { const p = await b.newPage({ viewport: { width: w, height: h }, reducedMotion: reduce ? 'reduce' : 'no-preference' }); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); await p.goto(process.env.TEST_ORIGIN + '/mashhor-demo/' + url, { waitUntil: 'networkidle' }); if (loc !== 'ar') await p.evaluate(async (l) => { const m = await import('./assets/js/foundation.js'); m.setLocale(l); }, loc); await p.waitForTimeout(500); return p; };

for (const reduce of [false, true]) {
  const T = reduce ? 'reduced-motion' : 'motion';
  // mobile drawer: opens, traps focus, Escape closes, focus returns
  let p = await open('index.html', 390, 844, reduce);
  await p.click('.c-gh__mobile-only'); await p.waitForTimeout(400);
  let r = await p.evaluate(() => ({ open: document.querySelector('.c-gh__drawer')?.dataset.open, inside: document.querySelector('.c-gh__drawer').contains(document.activeElement), scrollLocked: getComputedStyle(document.body).overflow === 'hidden' }));
  ok(`${T} drawer opens with focus inside`, r.open === 'true' && r.inside, JSON.stringify(r));
  const stays = [];
  for (let i = 0; i < 40; i++) { await p.keyboard.press('Tab'); stays.push(await p.evaluate(() => document.querySelector('.c-gh__drawer').contains(document.activeElement))); }
  ok(`${T} Tab cycles inside the drawer (no escape, no trap on the page)`, stays.every(Boolean));
  for (let i = 0; i < 5; i++) await p.keyboard.press('Shift+Tab');
  ok(`${T} Shift+Tab stays inside the drawer`, await p.evaluate(() => document.querySelector('.c-gh__drawer').contains(document.activeElement)));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  r = await p.evaluate(() => ({ open: document.querySelector('.c-gh__drawer')?.dataset.open, focused: document.activeElement.className, unlocked: getComputedStyle(document.body).overflow !== 'hidden' }));
  ok(`${T} Escape closes the drawer and returns focus to the burger`, r.open !== 'true' && /c-gh__mobile-only|c-gh__action/.test(r.focused) && r.unlocked, JSON.stringify(r));
  // header search overlay
  await p.click('header .c-gh__action[aria-label="بحث"]'); await p.waitForTimeout(300);
  r = await p.evaluate(() => ({ expanded: document.querySelector('header .c-gh__action[aria-label="بحث"]').getAttribute('aria-expanded'), focusedTag: document.activeElement.tagName, inSearch: !!document.activeElement.closest('.c-gh__search') }));
  ok(`${T} header search opens and focuses its input`, r.expanded === 'true' && r.focusedTag === 'INPUT' && r.inSearch, JSON.stringify(r));
  await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  r = await p.evaluate(() => ({ expanded: document.querySelector('header .c-gh__action[aria-label="بحث"]').getAttribute('aria-expanded'), focused: document.activeElement.getAttribute('aria-label') }));
  ok(`${T} Escape closes the search and returns focus`, r.expanded === 'false' && r.focused === 'بحث', JSON.stringify(r));
  // footer accordion on mobile
  const acc = await p.evaluate(() => { const t = document.querySelector('.c-gf__acc-trigger'); if (!t) return null; t.focus(); return t.getAttribute('aria-expanded'); });
  if (acc !== null) {
    await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    r = await p.evaluate(() => { const t = document.querySelector('.c-gf__acc-trigger'); const panel = document.getElementById(t.getAttribute('aria-controls')); const link = panel?.querySelector('a'); return { expanded: t.getAttribute('aria-expanded'), linkVisible: link ? link.getBoundingClientRect().height > 0 && getComputedStyle(panel).gridTemplateRows !== '0px' : null }; });
    ok(`${T} footer accordion toggles with Enter and reveals its links`, r.expanded !== acc && (r.linkVisible ?? true), JSON.stringify(r));
  }
  await p.close();

  // desktop mega menu: opens with Enter, arrows optional, Escape returns focus; no scroll jump
  p = await open('index.html', 1440, 1000, reduce, 'en');
  await p.focus('.c-gh__link[aria-haspopup], .c-gh__link[aria-expanded]');
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  r = await p.evaluate(() => ({ expanded: document.activeElement.getAttribute('aria-expanded') ?? document.querySelector('header [aria-expanded="true"]')?.getAttribute('aria-expanded'), panel: !!document.querySelector('header .c-gh__panel:not([hidden])') }));
  ok(`${T} mega menu opens from the keyboard`, r.expanded === 'true' && r.panel, JSON.stringify(r));
  await p.keyboard.press('Tab'); await p.waitForTimeout(100);
  ok(`${T} Tab moves into the open panel`, await p.evaluate(() => !!document.activeElement.closest('.c-gh__panel')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  r = await p.evaluate(() => ({ panel: !!document.querySelector('header .c-gh__panel:not([hidden])'), focusedTrigger: document.activeElement.matches('.c-gh__link') }));
  ok(`${T} Escape closes the panel and returns focus to its trigger`, !r.panel && r.focusedTrigger, JSON.stringify(r));
  // help-me-choose + smooth scroll respects the preference: scrolling still lands
  await p.click('.c-choose__option[data-sort="stops"]'); await p.click('.c-choose .c-btn--secondary-brand'); await p.waitForTimeout(reduce ? 200 : 900);
  r = await p.evaluate(() => { const rect = document.querySelector('#booking').getBoundingClientRect(); return { top: Math.round(rect.top), focused: document.activeElement.name }; });
  ok(`${T} "go" lands on the booking entry and focuses the form`, r.top > -120 && r.top < 200 && r.focused === 'from', JSON.stringify(r));
  await p.close();

  // offers phone sheet (modal): focus in, Escape, focus return
  p = await open('offers/', 390, 844, reduce);
  await p.click('.c-filters__open'); await p.waitForTimeout(400);
  r = await p.evaluate(() => ({ open: document.querySelector('#offers-filters').open, inside: document.querySelector('#offers-filters').contains(document.activeElement) }));
  ok(`${T} offers sheet opens with focus inside`, r.open && r.inside, JSON.stringify(r));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  r = await p.evaluate(() => ({ open: document.querySelector('#offers-filters').open, focused: document.activeElement.classList.contains('c-filters__open') }));
  ok(`${T} Escape closes the sheet and returns focus`, !r.open && r.focused, JSON.stringify(r));
  await p.close();

  // booking travellers popover: Escape closes + focus return
  p = await open('book/', 390, 844, reduce);
  await p.click('.c-search__form:not([hidden]) .c-pax__trigger'); await p.waitForTimeout(200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  r = await p.evaluate(() => ({ hidden: document.querySelector('.c-search__form:not([hidden]) .c-popover').hidden, focused: document.activeElement.classList.contains('c-pax__trigger') }));
  ok(`${T} travellers popover: Escape closes and returns focus`, r.hidden && r.focused, JSON.stringify(r));
  if (reduce) {
    const d = await p.evaluate(() => Array.from(document.querySelectorAll('.c-btn, .c-card, .c-pick, .c-gh__drawer, .c-search__advanced')).map((n) => parseFloat(getComputedStyle(n).transitionDuration) * 1000).filter((v) => v > 20).length);
    ok('reduced motion: no transition longer than 20ms on interactive parts', d === 0, `${d}`);
  }
  await p.close();
}
await b.close();
console.log(`\n${pass}/${pass + fail} motion/keyboard checks passed`);
console.log('errors:', errs.length ? errs : 'none');
process.exit(fail || errs.length ? 1 : 0);
