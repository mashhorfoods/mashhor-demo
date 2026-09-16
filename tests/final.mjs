import './env.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const errs = [];
let checks = 0, fails = 0;
const ok = (name, cond, extra='') => { checks++; if(!cond){fails++; console.log('  ✗', name, extra);} };

for (const page of ['index.html','styleguide.html']) {
  for (const [vp,w,h] of [['mobile',390,844],['tablet',834,1100],['desktop',1440,1000]]) {
    const p = await b.newPage({ viewport:{width:w,height:h} });
    p.on('pageerror', e=>errs.push(`${page}/${vp} ${e.message}`));
    p.on('console', m=>{ if(m.type()==='error') errs.push(`${page}/${vp} ${m.text()}`); });
    p.on('requestfailed', r=>errs.push(`${page}/${vp} REQFAIL ${r.url()}`));
    await p.goto(`${process.env.TEST_ORIGIN}/${page}`, {waitUntil:'networkidle'});
    await p.waitForTimeout(800);

    for (const dir of ['rtl','ltr']) {
      if (dir==='ltr') { await p.evaluate(async () => {
        const m = await import('./assets/js/foundation.js');
        m.setLocale(m.getLocale() === 'ar' ? 'en' : 'ar');
      }); await p.waitForTimeout(700); }
      const r = await p.evaluate(() => ({
        dir: document.documentElement.dir,
        hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth+1,
        spriteInjected: !!document.getElementById('no-sprite'),
        brokenUse: Array.from(document.querySelectorAll('use')).filter(u=>{
          const id=u.getAttribute('href'); return id?.startsWith('#') && !document.getElementById(id.slice(1)); }).length,
        emptyIcons: Array.from(document.querySelectorAll(".c-icon")).filter(s=>s.checkVisibility()&&s.getBoundingClientRect().width===0).length,
        noAltImgs: document.querySelectorAll('img:not([alt])').length,
        h1: document.querySelectorAll('h1').length,
        unlabelledIconBtns: Array.from(document.querySelectorAll('button')).filter(btn =>
          !btn.textContent.trim() && !btn.getAttribute('aria-label') && !btn.querySelector('[class*=visually-hidden]')).length,
        focusRing: (()=>{ const el=document.querySelector('.c-btn--primary'); el?.focus();
          return getComputedStyle(el,':focus-visible').outlineStyle !== undefined; })(),
      }));
      const tag = `${page.replace('.html','')}/${vp}/${dir}`;
      ok(`${tag} no h-scroll`, !r.hScroll);
      ok(`${tag} sprite injected`, r.spriteInjected);
      ok(`${tag} no broken <use>`, r.brokenUse===0, `broken=${r.brokenUse}`);
      ok(`${tag} no zero-size icons`, r.emptyIcons===0, `empty=${r.emptyIcons}`);
      ok(`${tag} all img have alt`, r.noAltImgs===0, `missing=${r.noAltImgs}`);
      ok(`${tag} exactly one h1`, r.h1===1, `h1=${r.h1}`);
      ok(`${tag} icon buttons labelled`, r.unlabelledIconBtns===0, `bare=${r.unlabelledIconBtns}`);
      ok(`${tag} dir applied`, r.dir===dir);
    }
    await p.close();
  }
}
console.log(`\n${checks-fails}/${checks} checks passed`);
console.log('ERRORS:', errs.length? [...new Set(errs)].join('\n') : 'none');
await b.close();
