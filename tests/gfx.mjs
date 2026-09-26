import { shot, launch } from './env.mjs';
const b = await launch();
const errs=[]; let pass=0, fail=0;
const ok=(n,c,x='')=>{ if(c) pass++; else { fail++; console.log('  ✗',n,x); } };
const SWITCH = async (p) => p.evaluate(async () => {
  const m = await import('./assets/js/foundation.js');
  await m.setLocale(m.getLocale() === 'ar' ? 'en' : 'ar');
});

for (const [name,w,h] of [['mobile',390,844],['tablet',834,1100],['desktop',1440,1000]]) {
  const p = await b.newPage({ viewport:{width:w,height:h} });
  p.on('pageerror',e=>errs.push(`${name}: ${e.message}`));
  p.on('console',m=>{if(m.type()==='error')errs.push(`${name}: ${m.text()}`);});
  await p.goto(process.env.TEST_ORIGIN + '/index.html',{waitUntil:'networkidle'});
  await p.waitForTimeout(1000);

  for (const dir of ['rtl','ltr']) {
    if (dir==='ltr') { await SWITCH(p); await p.waitForTimeout(800); }
    const r = await p.evaluate(()=>{
      const f=document.querySelector('.c-gf');
      const vis=(sel)=>Array.from(f.querySelectorAll(sel)).filter(n=>n.checkVisibility()).length;
      const trig=f.querySelector('.c-gf__acc-trigger');
      return {
        dir: document.documentElement.dir,
        hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth+1,
        small: Array.from(f.querySelectorAll('a,button')).filter(n=>{const b=n.getBoundingClientRect();return b.width>0&&b.height>0&&b.height<44;}).length,
        cta: vis('.c-btn--primary'),
        triggerTag: trig ? trig.tagName : 'NONE', focusableHeadings: Array.from(f.querySelectorAll('.c-gf__group > *')).filter(n=>n.tabIndex>=0 && getComputedStyle(n).pointerEvents==='none').length,
        panelCollapsed: f.querySelector('.c-gf__acc-panel')?.dataset.collapsed ?? 'n/a',
        panelH: Math.round((f.querySelector('.c-gf__acc-panel')||f.querySelector('.c-gf__links')).getBoundingClientRect().height),
        copyYear: f.querySelector('.c-gf__copy').textContent.includes(String(new Date().getFullYear())),
        landmark: f.tagName==='FOOTER',
        navLabels: Array.from(f.querySelectorAll('nav')).every(n=>n.getAttribute('aria-label')),
      };
    });
    const tag=`${name}/${dir}`;
    ok(`${tag} dir`, r.dir===dir);
    ok(`${tag} no h-scroll`, !r.hScroll);
    ok(`${tag} touch targets >=44`, r.small===0, `${r.small} small`);
    ok(`${tag} at most one CTA`, r.cta<=1, `${r.cta}`);
    ok(`${tag} dynamic year`, r.copyYear);
    ok(`${tag} semantic footer`, r.landmark);
    ok(`${tag} nav landmarks labelled`, r.navLabels);
    if (name==='mobile') {
      ok(`${tag} §17 accordion collapsed`, r.panelCollapsed==='true');
      ok(`${tag} collapsed clips links`, r.panelH===0, `panelH=${r.panelH}`);
      ok(`${tag} trigger is a button`, r.triggerTag==='BUTTON');
    } else {
      ok(`${tag} desktop column open`, r.panelH>0, `panelH=${r.panelH}`);
      ok(`${tag} desktop renders a heading, not a button`, r.triggerTag==='NONE');
    ok(`${tag} no focusable dead controls`, r.focusableHeadings===0, `${r.focusableHeadings}`);
    }
  }

  if (name==='mobile') {
    await SWITCH(p); await p.waitForTimeout(800);   // back to AR
    await p.locator('.c-gf__acc-trigger').first().click(); await p.waitForTimeout(450);
    const e = await p.evaluate(()=>{
      const f=document.querySelector('.c-gf');
      return { expanded: f.querySelector('.c-gf__acc-trigger').getAttribute('aria-expanded'),
               collapsed: f.querySelector('.c-gf__acc-panel').dataset.collapsed,
               links: Array.from(f.querySelectorAll('.c-gf__acc-panel .c-gf__link')).filter(n=>n.checkVisibility()).length };
    });
    ok('accordion expands', e.expanded==='true' && e.collapsed==='false');
    ok('expanded reveals links', e.links>0, `${e.links}`);
    await p.screenshot({ path: shot('gf-mobile.png'), fullPage: false });
  }
  await p.close();
}
console.log(`\n${pass}/${pass+fail} footer checks passed`);
console.log('errors:', errs.length?[...new Set(errs)]:'none');
{ // the CTA is on by default and off only when a page asks (homepage carries its own)
  const p = await b.newPage({ viewport:{width:1440,height:1000} });
  await p.goto(process.env.TEST_ORIGIN + '/index.html',{waitUntil:'networkidle'});
  const r = await p.evaluate(async()=>{
    const m=await import('./assets/js/foundation.js'); const t=document.querySelector('.l-page');
    m.mountFooter({target:t, variant:'marketing'}); const on=document.querySelectorAll('.c-gf .c-btn--primary').length;
    m.mountFooter({target:t, variant:'marketing', cta:false}); const off=document.querySelectorAll('.c-gf .c-btn--primary').length;
    return {on, off};
  });
  ok('footer CTA on by default', r.on===1, `${r.on}`);
  ok('footer CTA off when the page carries its own', r.off===0, `${r.off}`);
  await p.close();
}
await b.close();
