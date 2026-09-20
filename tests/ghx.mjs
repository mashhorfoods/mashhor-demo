import './env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const errs=[]; let pass=0, fail=0;
const ok=(n,c,x='')=>{ if(c){pass++;} else {fail++; console.log('  ✗',n,x);} };
const p = await b.newPage({ viewport:{width:1440,height:1000} });
p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.goto(process.env.TEST_ORIGIN + '/index.html',{waitUntil:'networkidle'});
await p.waitForTimeout(1000);

const svc = p.locator('.c-gh__link[aria-haspopup]').first();
// §22 open on CLICK, not hover
await svc.hover(); await p.waitForTimeout(350);
ok('hover does NOT open', await svc.getAttribute('aria-expanded')==='false');
await svc.click(); await p.waitForTimeout(300);
ok('click opens', await svc.getAttribute('aria-expanded')==='true');
ok('mega has 4 groups', await p.locator('.c-gh__panel--mega[data-open="true"] .c-gh__group-title').count()===4);
ok('mega items rendered', await p.locator('.c-gh__panel--mega[data-open="true"] .c-gh__item').count()===13);
// Escape closes + restores focus
await p.keyboard.press('Escape'); await p.waitForTimeout(250);
ok('Escape closes', await svc.getAttribute('aria-expanded')==='false');
ok('Escape restores focus', await p.evaluate(()=>document.activeElement?.textContent?.includes('خدمات')));
// outside click closes
await svc.click(); await p.waitForTimeout(250);
await p.mouse.click(700, 600); await p.waitForTimeout(250);
ok('outside click closes', await svc.getAttribute('aria-expanded')==='false');
// only one panel open at a time
await svc.click(); await p.waitForTimeout(200);
const dest = p.locator('.c-gh__link[aria-haspopup]').nth(1);
await dest.click(); await p.waitForTimeout(250);
ok('opening another closes the first', await svc.getAttribute('aria-expanded')==='false' && await dest.getAttribute('aria-expanded')==='true');
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
// ArrowDown opens and focuses first item
await svc.focus(); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(300);
ok('ArrowDown opens', await svc.getAttribute('aria-expanded')==='true');
ok('ArrowDown focuses first item', await p.evaluate(()=>!!document.activeElement.closest('.c-gh__panel')));
await p.keyboard.press('Escape');

// search
const st = p.locator('.c-gh__action[aria-label="بحث"], .c-gh__action[aria-label="Search"]').first();
await st.click(); await p.waitForTimeout(350);
ok('search is a plain action (no sheet, no aria-expanded)', await p.evaluate(()=>!document.querySelector('.c-gh__search') && !document.querySelector('.c-gh__action[aria-label="بحث"], .c-gh__action[aria-label="Search"]').hasAttribute('aria-expanded')));
ok('search hands over to the page (index → hero form)', await p.evaluate(()=>document.activeElement?.name==='from'));
await p.waitForTimeout(900); await p.evaluate(()=>{ document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); }); await p.waitForTimeout(400);

// account guest -> authenticated
const acc = p.locator('.c-gh__action[aria-label="حسابي"], .c-gh__action[aria-label="My account"]').first();
await acc.click(); await p.waitForTimeout(300);
ok('guest menu has 2 entries', await p.locator('.c-gh__panel[data-open="true"] .c-gh__menu-row').count()===2);
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
await p.evaluate(()=>window.__setSession?.({authenticated:true,name:'أحمد عبد الرحمن',role:'customer'}));

// smart auto-hide header (§14): visible at load, hides on scroll down, reappears on scroll up,
// always visible at the very top, permanent shadow throughout.
const hidden = () => p.evaluate(()=>document.querySelector('.c-gh').dataset.hidden);
const headerTop = () => p.evaluate(()=>Math.round(document.querySelector('.c-gh').getBoundingClientRect().top));
ok('header has a shadow', await p.evaluate(()=>getComputedStyle(document.querySelector('.c-gh')).boxShadow !== 'none'));
ok('header visible on load', await hidden() === 'false');
await p.evaluate(()=>window.scrollTo(0,150)); await p.waitForTimeout(150);
await p.evaluate(()=>window.scrollTo(0,900)); await p.waitForTimeout(500);
ok('header hides on scroll down', await hidden() === 'true');
ok('hidden header slides off the top of the viewport', await headerTop() < 0);
ok('header keeps its shadow while hidden', await p.evaluate(()=>getComputedStyle(document.querySelector('.c-gh')).boxShadow !== 'none'));
await p.evaluate(()=>window.scrollTo(0,850)); await p.waitForTimeout(500);
ok('header reappears on scroll up', await hidden() === 'false');
ok('reappeared header sits back at the top', await headerTop() === 0, `${await headerTop()}`);
await p.evaluate(()=>window.scrollTo(0,900)); await p.waitForTimeout(500);
ok('header hides again on scroll down', await hidden() === 'true');
await p.evaluate(()=>window.scrollTo(0,0)); await p.waitForTimeout(500);
ok('header always visible at the very top', await hidden() === 'false');

console.log(`\n${pass}/${pass+fail} interaction checks passed`);
console.log('errors:', errs.length?errs:'none');
await b.close();
