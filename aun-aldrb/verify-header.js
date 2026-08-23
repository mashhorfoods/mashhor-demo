/* Stage 02 - header & navigation regression harness.
   Usage: npm i -D playwright && node aun-aldrb/verify-header.js
   Covers the SS23 quality checklist: scroll states, anchor offset, active-state
   continuity, drawer behaviour, focus management and keyboard order. */
const { chromium } = require('playwright');
const URL = 'file://' + require('path').resolve(__dirname, 'index.html');
const ok = (c, m) => console.log(`  ${c ? 'PASS' : '**FAIL**'}  ${m}`);

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

  // ---------------- header scroll states ----------------
  console.log('\n### Header scroll states (§05/§16)');
  let p = await b.newPage(); await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(URL); await p.waitForTimeout(200);
  const s0 = await p.evaluate(() => ({
    h: document.querySelector('.site-header').getBoundingClientRect().height,
    cls: document.querySelector('.site-header').className,
    root: document.documentElement.classList.contains('has-scrolled'),
    heroTop: document.querySelector('#home').getBoundingClientRect().top,
    docH: document.documentElement.scrollHeight,
  }));
  await p.evaluate(() => window.scrollTo(0, 600)); await p.waitForTimeout(500);
  const s1 = await p.evaluate(() => ({
    h: document.querySelector('.site-header').getBoundingClientRect().height,
    scrolled: document.querySelector('.site-header').classList.contains('is-scrolled'),
    root: document.documentElement.classList.contains('has-scrolled'),
    docH: document.documentElement.scrollHeight,
    shadow: getComputedStyle(document.querySelector('.site-header')).boxShadow !== 'none',
    blur: getComputedStyle(document.querySelector('.site-header')).backdropFilter,
  }));
  ok(s0.h === 80 && !s0.root, `STATE 01 top: ${s0.h}px, no scroll class`);
  ok(s1.scrolled && s1.root, 'STATE 02 sets is-scrolled on header AND has-scrolled on :root');
  ok(s1.h < s0.h && s0.h - s1.h <= 16, `compacts ${s0.h} -> ${s1.h}px (subtle, ${s0.h - s1.h}px)`);
  ok(s1.h >= 64 && s0.h <= 80, `both states inside the 64-80px band (§06)`);
  ok(s1.shadow, 'restrained shadow appears when scrolled');
  ok(s1.blur === 'none', 'backdrop blur dropped when opaque (§21)');
  ok(s0.docH === s1.docH, `document height unchanged: ${s0.docH} === ${s1.docH} (no content jump, §05)`);

  // ---------------- anchor offset ----------------
  console.log('\n### Anchor offset (§17)');
  await p.evaluate(() => { document.querySelector('.site-nav__link[href="#services"]').click(); });
  await p.waitForTimeout(900);
  const anch = await p.evaluate(() => {
    const h = document.querySelector('.site-header').getBoundingClientRect().height;
    const head = document.querySelector('#services-h').getBoundingClientRect().top;
    return { h, head, hash: location.hash };
  });
  ok(anch.head > anch.h, `#services heading at ${Math.round(anch.head)}px clears the ${Math.round(anch.h)}px header`);
  ok(anch.hash === '#services', `history updated: ${anch.hash}`);

  // ---------------- scroll-spy parent mapping ----------------
  console.log('\n### Active state never blanks (§04)');
  for (const [id, expect] of [['how-we-work','#services'],['vision-mission','#about'],['values','#about'],['cta','#contact'],['about','#about']]) {
    await p.evaluate(i => document.getElementById(i).scrollIntoView(), id);
    await p.waitForTimeout(450);
    const r = await p.evaluate(() => {
      const a = [...document.querySelectorAll('.site-nav__link.is-active')];
      const cur = [...document.querySelectorAll('.site-nav__link[aria-current]')];
      return { n: a.length, href: a[0] && a[0].getAttribute('href'), aria: cur.length };
    });
    ok(r.n === 1 && r.href === expect && r.aria >= 1, `#${id} -> ${r.href} (expected ${expect}), aria-current present`);
  }
  await p.close();

  // ---------------- mobile drawer ----------------
  console.log('\n### Mobile drawer (§12)');
  p = await b.newPage(); await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(URL); await p.waitForTimeout(250);
  const before = await p.evaluate(() => document.activeElement.tagName);
  await p.click('[data-menu-trigger]'); await p.waitForTimeout(400);
  const open = await p.evaluate(() => ({
    hidden: document.querySelector('[data-mobile-nav]').hidden,
    expanded: document.querySelector('[data-menu-trigger]').getAttribute('aria-expanded'),
    label: document.querySelector('[data-menu-trigger]').getAttribute('aria-label'),
    focusIn: document.querySelector('[data-mobile-nav]').contains(document.activeElement),
    htmlOv: document.documentElement.style.overflow, bodyOv: document.body.style.overflow,
    headerState: document.querySelector('.site-header').classList.contains('is-menu-open'),
    top: Math.round(document.querySelector('[data-mobile-nav]').getBoundingClientRect().top),
    headerH: Math.round(document.querySelector('.site-header').getBoundingClientRect().height),
    ctaVisible: (() => { const e=document.querySelector('.mobile-nav__cta .btn'); const r=e.getBoundingClientRect();
      return r.height>0 && r.top < window.innerHeight; })(),
    activeMarker: (() => { const a=document.querySelector('.mobile-nav__link.is-active');
      const s=getComputedStyle(a,'::before'); return { op:s.opacity, tr:s.transform, w:s.width }; })(),
  }));
  ok(!open.hidden && open.expanded === 'true', 'opens, aria-expanded=true');
  ok(open.label.includes('إغلاق'), `trigger label switches to close: ${open.label}`);
  ok(open.focusIn, 'focus moves into the drawer');
  ok(open.htmlOv === 'hidden' && open.bodyOv === 'hidden', 'background scroll locked on html AND body');
  ok(open.headerState, 'STATE 03 applied to header');
  ok(open.top === open.headerH, `drawer top ${open.top} meets header bottom ${open.headerH}`);
  ok(open.ctaVisible, 'تواصل معنا reachable inside the drawer');
  ok(open.activeMarker.op === '1' && open.activeMarker.w === '3px', `active marker is a shape, not colour: w=${open.activeMarker.w} opacity=${open.activeMarker.op}`);

  // escape
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const esc = await p.evaluate(() => ({
    hidden: document.querySelector('[data-mobile-nav]').hidden,
    expanded: document.querySelector('[data-menu-trigger]').getAttribute('aria-expanded'),
    focusBack: document.activeElement === document.querySelector('[data-menu-trigger]'),
    htmlOv: document.documentElement.style.overflow, bodyOv: document.body.style.overflow,
    headerState: document.querySelector('.site-header').classList.contains('is-menu-open'),
  }));
  ok(esc.hidden && esc.expanded === 'false', 'Escape closes it');
  ok(esc.focusBack, 'focus returns to the trigger');
  ok(esc.htmlOv === '' && esc.bodyOv === '', 'scroll lock released');
  ok(!esc.headerState, 'STATE 03 cleared');

  // click a link closes
  await p.click('[data-menu-trigger]'); await p.waitForTimeout(350);
  await p.click('.mobile-nav__link[href="#services"]'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => document.querySelector('[data-mobile-nav]').hidden), 'tapping a nav item closes the drawer');

  // focus trap
  await p.click('[data-menu-trigger]'); await p.waitForTimeout(350);
  for (let i = 0; i < 12; i++) await p.keyboard.press('Tab');
  ok(await p.evaluate(() => document.querySelector('[data-mobile-nav]').contains(document.activeElement)),
     'focus stays trapped after 12 Tabs');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // ---------------- keyboard on desktop ----------------
  console.log('\n### Keyboard (§09)');
  await p.close();
  p = await b.newPage(); await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(URL); await p.waitForTimeout(200);
  const order = [];
  for (let i = 0; i < 8; i++) {
    await p.keyboard.press('Tab');
    order.push(await p.evaluate(() => {
      const a = document.activeElement;
      const r = a.getBoundingClientRect();
      return { t: (a.textContent || a.getAttribute('aria-label') || a.tagName).trim().slice(0, 22),
               ring: getComputedStyle(a).boxShadow.slice(0, 40), onScreen: r.top >= 0 && r.bottom <= window.innerHeight };
    }));
  }
  order.forEach((o, i) => console.log(`   ${i + 1}. ${o.t}  | visible:${o.onScreen} | ring:${o.ring || 'none'}`));
  ok(order.slice(0, 7).every(o => o.onScreen), 'every focused header control stays on screen');

  await b.close();
})();
