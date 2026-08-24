/* STAGE M01 — mobile global UX architecture.
   Every assertion here is a measurement that failed, or could regress, on a
   phone. Run: CHROMIUM_PATH=<chrome> node ux/verify-mobile.js               */
const { chromium } = require('playwright-core');
const URL = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
const PHONES = [[320,568],[360,640],[375,667],[390,844],[412,915],[430,932]];
/* 320x568 and 360x640 are the short screens the hero's height rules exist for. */

(async () => {
 const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
 let n=0, f=0; const ok=(c,m)=>{n++; if(!c){f++; console.log('  FAIL '+m)}};
 const errs=[];
 const phone=(w,h,extra)=>b.newPage(Object.assign({viewport:{width:w,height:h},
   deviceScaleFactor:2,isMobile:true,hasTouch:true},extra||{}));

 /* ---- 1 · no page-level horizontal scrolling, anywhere, ever ------------- */
 for (const [w,h] of PHONES.concat([[844,390],[768,1024]])) {
  const p=await phone(w,h); p.on('pageerror',e=>errs.push(w+': '+e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await p.evaluate(()=>document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-inview')));
  await p.waitForTimeout(350);
  const H=await p.evaluate(()=>document.documentElement.scrollHeight);
  let worst=0, who='';
  for (let y=0;y<H;y+=h) {
   await p.evaluate(v=>scrollTo(0,v),y); await p.waitForTimeout(50);
   const r=await p.evaluate(()=>{const de=document.documentElement;
    const m=de.scrollWidth-de.clientWidth; let t='';
    if(m>0) for(const e of document.querySelectorAll('body *')){const r=e.getBoundingClientRect();
     if(r.width&&(r.right>de.clientWidth+1||r.left<-1)){t=e.tagName+'.'+[...e.classList].slice(0,2).join('.');break}}
    return {m,t}});
   if(r.m>worst){worst=r.m; who=r.t}
  }
  ok(worst===0, `${w}x${h}: the page never scrolls sideways (${worst}px over${who?', '+who:''})`);

  /* ---- 2 · the header compacts once the page moves --------------------- */
  await p.evaluate(()=>scrollTo(0,900)); await p.waitForTimeout(450);
  const hd=await p.evaluate(()=>({
    scrolled:document.querySelector('.site-header').classList.contains('is-scrolled'),
    h:Math.round(document.querySelector('.site-header').getBoundingClientRect().height)}));
  ok(hd.scrolled && hd.h<=60, `${w}x${h}: header compacts on scroll (${hd.h}px, ${hd.scrolled?'is-scrolled':'not scrolled'})`);
  await p.close();
 }

 /* ---- 3 · touch targets, type, gutters, grounds -------------------------- */
 for (const [w,h] of PHONES) {
  const p=await phone(w,h); p.on('pageerror',e=>errs.push(w+': '+e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.evaluate(()=>document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-inview')));
  await p.waitForTimeout(350);
  const r=await p.evaluate(()=>{
   const px=v=>Math.round(parseFloat(v)*10)/10;
   const small=[];
   document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])').forEach(e=>{
    const c=getComputedStyle(e); if(c.display==='none'||c.visibility==='hidden') return;
    const b=e.getBoundingClientRect(); if(!b.width&&!b.height) return;
    if(b.height<44||b.width<44) small.push(e.tagName+'.'+[...e.classList].slice(0,2).join('.')+
      ' "'+(e.textContent||'').trim().slice(0,14)+'" '+Math.round(b.width)+'x'+Math.round(b.height));
   });
   const body=getComputedStyle(document.body);
   const h2=document.querySelector('.about__title')||document.querySelector('h2');
   const h2c=getComputedStyle(h2);
   const svc=document.querySelector('.service__media img');
   const lum=c=>{const [r,g,bl]=c.match(/\d+/g).slice(0,3).map(Number).map(v=>{v/=255;
     return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return .2126*r+.7152*bl+.0722*g};
   const grounds=[...document.querySelectorAll('main section[id]')].map(s=>{
    const bg=getComputedStyle(s).backgroundColor;
    return bg==='rgba(0, 0, 0, 0)'?getComputedStyle(document.body).backgroundColor:bg;});
   let same=0; for(let i=1;i<grounds.length;i++) if(grounds[i]===grounds[i-1]) same++;
   // the hero's primary action must be reachable without scrolling
   const cta=document.querySelector('.hero__actions .btn--primary');
   return {small, pad:px(getComputedStyle(document.querySelector('.container')).paddingInlineStart),
    fsBody:px(body.fontSize), lhBody:px(body.lineHeight)/px(body.fontSize),
    lhH2:Math.round(px(h2c.lineHeight)/px(h2c.fontSize)*100)/100,
    svcAR:svc?getComputedStyle(svc).aspectRatio:null,
    same, ctaBottom:cta?Math.round(cta.getBoundingClientRect().bottom):null, vh:innerHeight};
  });
  ok(r.small.length===0, `${w}: every target is at least 44x44 (${r.small.length}${r.small.length?': '+r.small.slice(0,4).join(' | '):''})`);
  ok(r.pad>=16 && r.pad<=24, `${w}: container gutter is 16-24px (${r.pad})`);
  ok(r.fsBody>=16, `${w}: body type is at least 16px (${r.fsBody})`);
  ok(r.lhBody>=1.6, `${w}: Arabic body leading is at least 1.6 (${Math.round(r.lhBody*100)/100})`);
  ok(r.lhH2>=1.28, `${w}: Arabic headings get phone leading, not display leading (${r.lhH2})`);
  ok(r.svcAR==='3 / 2', `${w}: the service photograph takes the phone ratio (${r.svcAR})`);
  ok(r.same===0, `${w}: no two neighbouring sections share a ground (${r.same} pairs)`);
  ok(r.ctaBottom!==null && r.ctaBottom<=r.vh, `${w}: the hero's primary action is reachable without scrolling (bottom ${r.ctaBottom} of ${r.vh})`);
  await p.close();
 }

 /* ---- 4 · the drawer ----------------------------------------------------- */
 for (const [w,h] of [[390,844],[360,640],[844,390]]) {
  const p=await phone(w,h); p.on('pageerror',e=>errs.push('drawer '+w+': '+e.message));
  await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(350);
  await p.click('[data-menu-trigger]'); await p.waitForTimeout(450);
  const d=await p.evaluate(()=>{
   const n=document.querySelector('.mobile-nav'), r=n.getBoundingClientRect();
   const hh=document.querySelector('.site-header').getBoundingClientRect().height;
   return {top:Math.round(r.top), headerH:Math.round(hh), bottom:Math.round(r.bottom), vh:innerHeight,
    right:Math.round(r.right), cw:document.documentElement.clientWidth,
    pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    bodyLocked:getComputedStyle(document.body).overflow==='hidden',
    overscroll:getComputedStyle(n).overscrollBehaviorY,
    small:[...n.querySelectorAll('a')].filter(a=>{const b=a.getBoundingClientRect();
      return b.height<44||b.width<44}).length,
    expanded:document.querySelector('[data-menu-trigger]').getAttribute('aria-expanded'),
    direct:n.querySelectorAll('.mobile-nav__direct a').length};
  });
  ok(Math.abs(d.top-d.headerH)<=1, `${w}x${h} drawer: opens flush under the header (${d.top} vs ${d.headerH})`);
  ok(d.right<=d.cw+1 && d.pageOverflow===0, `${w}x${h} drawer: never widens the page (${d.pageOverflow}px)`);
  ok(d.bodyLocked, `${w}x${h} drawer: the page behind it cannot scroll`);
  ok(d.overscroll==='contain', `${w}x${h} drawer: its own scroll does not chain to the page (${d.overscroll})`);
  ok(d.small===0, `${w}x${h} drawer: every link is at least 44x44 (${d.small} under)`);
  ok(d.expanded==='true', `${w}x${h} drawer: the trigger reports expanded`);
  ok(d.direct===2, `${w}x${h} drawer: both direct-contact actions are present (${d.direct})`);
  // Esc closes and returns focus
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const c=await p.evaluate(()=>({exp:document.querySelector('[data-menu-trigger]').getAttribute('aria-expanded'),
    focused:document.activeElement===document.querySelector('[data-menu-trigger]'),
    locked:getComputedStyle(document.body).overflow==='hidden'}));
  ok(c.exp==='false' && !c.locked, `${w}x${h} drawer: Escape closes it and releases the page`);
  ok(c.focused, `${w}x${h} drawer: Escape returns focus to the trigger`);
  await p.close();
 }

 /* ---- 5 · safe areas are actually consumed ------------------------------- */
 {
  const p=await phone(390,844); await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(250);
  const s=await p.evaluate(()=>{
   let hits=0, txt=[];
   for(const sheet of document.styleSheets){ let rules; try{rules=sheet.cssRules}catch(e){continue}
    for(const r of rules){ if(!r.style) continue;
     const v=r.style.getPropertyValue('padding-inline')+r.style.getPropertyValue('padding-block-end');
     if(v.includes('env(safe-area-inset')){hits++; txt.push(r.selectorText)} } }
   return {hits,txt};});
  ok(s.hits>=3, `safe-area insets are consumed by the gutter, the drawer and the footer (${s.hits}: ${s.txt.join(', ')})`);
  const t=await p.evaluate(()=>getComputedStyle(document.querySelector('.site-nav__link, a[href]')).touchAction);
  ok(t==='manipulation', `coarse pointers get touch-action:manipulation, so a tap is not held for a double-tap (${t})`);
  await p.close();
 }

 /* ---- 6 · reduced motion and no script ----------------------------------- */
 {
  const p=await phone(390,844,{reducedMotion:'reduce'});
  await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(550);
  const r=await p.evaluate(()=>({
   faded:[...document.querySelectorAll('[data-reveal]')].filter(e=>parseFloat(getComputedStyle(e).opacity)<0.95).length,
   smooth:getComputedStyle(document.documentElement).scrollBehavior,
   over:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
  ok(r.faded===0 && r.smooth==='auto' && r.over===0,
     `reduced motion: everything is visible, scrolling is not smoothed, nothing overflows (${r.faded} faded, ${r.smooth}, ${r.over}px)`);
  await p.close();
  const ctx=await b.newContext({javaScriptEnabled:false,viewport:{width:390,height:844},
    deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const p2=await ctx.newPage(); await p2.goto(URL,{waitUntil:'load'});
  const nj=await p2.evaluate(()=>({
   faded:[...document.querySelectorAll('[data-reveal]')].filter(e=>parseFloat(getComputedStyle(e).opacity)<0.95).length,
   over:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
  ok(nj.faded===0 && nj.over===0, `no script: the whole page renders and nothing overflows (${nj.faded} faded, ${nj.over}px)`);
  await ctx.close();
 }

 /* ---- 7 · the tablet tier is not dragged into the phone rules ------------
    768 is the last width that still renders the service GRID; from 1024 the
    pinned showcase takes over and its slide image is deliberately
    aspect-ratio:auto, so the card ratio can only be read below that. */
 {
  const p=await b.newPage({viewport:{width:768,height:1024}});
  await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(300);
  const r=await p.evaluate(()=>{
   const px=v=>parseFloat(v);
   const h2=document.querySelector('.about__title'), c=getComputedStyle(h2);
   return {lh:Math.round(px(c.lineHeight)/px(c.fontSize)*100)/100,
    ar:getComputedStyle(document.querySelector('.service__media img')).aspectRatio};});
  ok(r.lh<1.28, `768: display leading is untouched above the phone tier (${r.lh})`);
  ok(r.ar==='4 / 3', `768: the service photograph keeps its desktop ratio (${r.ar})`);
  await p.close();
 }

 ok(errs.length===0, `no page errors (${errs.join(' | ')})`);
 console.log(`\n${n-f}/${n} checks pass`);
 await b.close(); process.exit(f?1:0);
})();
