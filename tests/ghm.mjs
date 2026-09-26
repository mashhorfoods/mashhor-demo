import { shot, launch } from './env.mjs';
const b = await launch();
const errs=[]; let pass=0, fail=0;
const ok=(n,c,x='')=>{ if(c) pass++; else { fail++; console.log('  ✗',n,x); } };

for (const [name,w,h] of [['mobile',390,844],['tablet',834,1100],['desktop',1440,1000]]) {
  const p = await b.newPage({ viewport:{width:w,height:h} });
  p.on('pageerror',e=>errs.push(`${name}: ${e.message}`));
  p.on('console',m=>{if(m.type()==='error')errs.push(`${name}: ${m.text()}`);});
  await p.goto(process.env.TEST_ORIGIN + '/index.html',{waitUntil:'networkidle'});
  await p.waitForTimeout(900);

  for (const dir of ['rtl','ltr']) {
    if (dir==='ltr'){ await p.evaluate(async () => {
        const m = await import('./assets/js/foundation.js');
        await m.setLocale(m.getLocale() === 'ar' ? 'en' : 'ar');
      }); await p.waitForTimeout(700); }
    const r = await p.evaluate(()=>({
      dir: document.documentElement.dir,
      navVisible: getComputedStyle(document.querySelector('.c-gh__nav')||document.body).display,
      burgerVisible: (()=>{const el=document.querySelector('.c-gh__mobile-only');return el?getComputedStyle(el).display:'none';})(),
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth+1,
      // §24 no tiny targets in the header
      small: Array.from(document.querySelectorAll('.c-gh a, .c-gh button'))
        .filter(n=>{const b=n.getBoundingClientRect();return b.width>0&&b.height>0&&b.height<44;}).length,
      ctaCount: Array.from(document.querySelectorAll('.c-gh .c-btn--primary')).filter(n=>n.checkVisibility()).length,
      labelledTriggers: Array.from(document.querySelectorAll('.c-gh button'))
        .every(bn=>bn.textContent.trim()||bn.getAttribute('aria-label')),
    }));
    const tag=`${name}/${dir}`;
    ok(`${tag} dir`, r.dir===dir);
    ok(`${tag} no h-scroll`, !r.hScroll);
    ok(`${tag} touch targets >=44`, r.small===0, `${r.small} small`);
    ok(`${tag} every button labelled`, r.labelledTriggers);
    if (name==='mobile') {
      ok(`${tag} desktop nav hidden`, r.navVisible==='none');
      ok(`${tag} burger shown`, r.burgerVisible!=='none');
    }
    if (name==='desktop') {
      ok(`${tag} desktop nav shown`, r.navVisible!=='none');
      ok(`${tag} burger hidden`, r.burgerVisible==='none');
      ok(`${tag} exactly one red CTA`, r.ctaCount===1, `${r.ctaCount}`);
    }
  }

  if (name==='mobile') {

    await p.evaluate(async()=>{ const m=await import('./assets/js/foundation.js'); window.__live=m.liveChannels().length; });
    await p.click('.c-gh__mobile-only'); await p.waitForTimeout(500);
    const d = await p.evaluate(()=>{
      const dr=document.querySelector('.c-gh__drawer');
      return { open: dr.dataset.open,
        accordions: dr.querySelectorAll('.c-gh__m-trigger').length,
        collapsed: Array.from(dr.querySelectorAll('.c-gh__m-panel')).every(x=>x.dataset.collapsed==='true'),
        channels: dr.querySelectorAll('.c-gh__channel').length,
        liveChannels: window.__live ?? -1,
        cta: !!dr.querySelector('.c-gh__drawer-foot .c-btn--primary'),
        panelX: Math.round(dr.querySelector('.c-gh__drawer-panel').getBoundingClientRect().x) };
    });
    ok('drawer opens', d.open==='true');
    ok('drawer accordions present', d.accordions===4, `${d.accordions}`);
    ok('§17 all collapsed by default', d.collapsed);
    ok('§18 drawer renders exactly the live support channels', d.channels===d.liveChannels, `${d.channels} vs ${d.liveChannels} live`);
    ok('drawer has Book Now', d.cta);
    ok('drawer slides from the end edge (LTR)', d.panelX>0, `x=${d.panelX}`);  // RTL verified separately in drawerdir.mjs
    // accordion expands
    await p.click('.c-gh__m-trigger'); await p.waitForTimeout(400);
    ok('accordion expands', await p.evaluate(()=>document.querySelector('.c-gh__m-panel').dataset.collapsed)==='false');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    ok('Escape closes drawer', await p.evaluate(()=>document.querySelector('.c-gh__drawer').dataset.open)==='false');
    await p.screenshot({ path: shot('gh-mobile.png') });
  }
  await p.close();
}
console.log(`\n${pass}/${pass+fail} responsive checks passed`);
console.log('errors:', errs.length?[...new Set(errs)]:'none');
await b.close();
