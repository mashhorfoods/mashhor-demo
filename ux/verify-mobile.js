/* STAGE M01 · M02 — the mobile foundation and the hero.
   Global architecture: no horizontal scrolling, touch targets, Arabic type,
   safe areas, the drawer, reduced motion, no-script — plus the mobile hero.
   Section work lives in verify-mobile-sections.js, which was split out when
   one file passed ten minutes a run.
   Run: CHROMIUM_PATH=<chrome> node ux/verify-mobile.js                       */
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

 /* ---- 8 · STAGE M02 · the mobile hero ------------------------------------ */
 for (const [w,h] of [[360,640],[375,667],[390,844],[412,915],[430,932]]) {
  const p=await phone(w,h); p.on('pageerror',e=>errs.push('hero '+w+': '+e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.evaluate(()=>document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-inview')));
  await p.waitForTimeout(400);
  const r=await p.evaluate(()=>{
   const q=s=>document.querySelector(s);
   const top=s=>{const e=q(s);return e?Math.round(e.getBoundingClientRect().top+scrollY):null};
   const box=s=>{const e=q(s);if(!e)return null;const b=e.getBoundingClientRect();
     return {t:Math.round(b.top+scrollY),b:Math.round(b.bottom+scrollY),w:Math.round(b.width),h:Math.round(b.height)}};
   /* the DOM order the assistive-technology reading order and the tab order
      both come from — it must NOT have been reshuffled to get the visual one */
   const stage=q('.hero__stage');
   const domOrder=[...stage.querySelectorAll('.hero__eyebrow,.hero__title,.hero__lead,.hero__aud,.hero__actions,.hero__media')]
     .map(e=>e.className.split(' ')[0]);
   const img=q('.hero__media img'), ic=getComputedStyle(img);
   const prim=q('.hero__actions .btn--primary'), sec=q('.hero__actions .btn--secondary');
   return {
    domOrder,
    visual:['.hero__eyebrow','.hero__title','.hero__lead','.hero__actions','.hero__media','.hero__aud']
      .map(s=>({s,t:top(s)})),
    media:box('.hero__media'), vh:innerHeight,
    imgH:ic.blockSize, imgFit:ic.objectFit, imgPos:ic.objectPosition,
    panelDisplay:getComputedStyle(q('.hero__panel')).display,
    contentDisplay:getComputedStyle(q('.hero__content')).display,
    prim:box('.hero__actions .btn--primary'), sec:box('.hero__actions .btn--secondary'),
    stageW:Math.round(stage.getBoundingClientRect().width),
    stagePadStart:Math.round(parseFloat(getComputedStyle(stage).paddingInlineStart)),
    eyebrowW:box('.hero__eyebrow').w,
    ctaEvents:getComputedStyle(prim).pointerEvents,
    delays:['.hero__eyebrow','.hero__title','.hero__lead','.hero__actions']
      .map(s=>parseFloat(getComputedStyle(q(s)).transitionDelay)||0),
    press:(()=>{const t=getComputedStyle(q('.btn')).transitionProperty;return t.includes('transform')})(),
    /* WCAG 1.3.2: the visual order differs from the DOM order, so the tab
       order must not. It only can if nothing that moved is focusable. */
    focusables:[...stage.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')]
      .map(e=>({t:Math.round(e.getBoundingClientRect().top+scrollY),
                l:(e.textContent||'').trim().slice(0,12)}))
   };
  });
  ok(r.domOrder.join('>')==='hero__eyebrow>hero__title>hero__lead>hero__aud>hero__actions>hero__media',
     `${w}: source order is untouched, so reading and tab order are (${r.domOrder.join('>')})`);
  const asc=r.visual.every((v,i)=>i===0||v.t>=r.visual[i-1].t);
  ok(asc, `${w}: on screen it reads label > headline > lead > action > photograph > cues (${r.visual.map(v=>v.s.slice(7)+':'+v.t).join(' ')})`);
  ok(r.media.b<=r.vh, `${w}x${h}: the photograph is inside the first screen (ends ${r.media.b} of ${r.vh})`);
  ok(r.imgH!=='auto' && parseFloat(r.imgH)>0, `${w}: the photograph reserves its box before it loads (${r.imgH})`);
  ok(r.imgFit==='contain', `${w}: contain, so an unknown ratio cannot crop the subject (${r.imgFit})`);
  ok(r.panelDisplay==='contents' && r.contentDisplay==='contents',
     `${w}: the white-on-white panel is gone (${r.panelDisplay}/${r.contentDisplay})`);
  ok(Math.abs(r.prim.w - (r.stageW - r.stagePadStart*2)) <= 2,
     `${w}: the primary action runs the full content width (${r.prim.w} of ${r.stageW - r.stagePadStart*2})`);
  ok(r.sec.w < r.prim.w && r.sec.h < r.prim.h,
     `${w}: the secondary is visibly secondary — narrower and shorter (${r.sec.w}x${r.sec.h} vs ${r.prim.w}x${r.prim.h})`);
  ok(r.sec.w>=44 && r.sec.h>=44, `${w}: the secondary is still comfortably tappable (${r.sec.w}x${r.sec.h})`);
  ok(r.eyebrowW < r.stageW - r.stagePadStart*2 - 8,
     `${w}: the label hugs its text instead of stretching (${r.eyebrowW} of ${r.stageW - r.stagePadStart*2})`);
  ok(r.ctaEvents!=='none', `${w}: the primary action is never made unclickable by the entrance (${r.ctaEvents})`);
  ok(Math.max(...r.delays)<=0.28, `${w}: the entrance finishes starting within 280ms (${r.delays.map(d=>Math.round(d*1000)).join('/')}ms)`);
  ok(r.press, `${w}: the press state is a transform, so it costs no layout (${r.press})`);
  const tabAsc=r.focusables.every((x,i)=>i===0||x.t>=r.focusables[i-1].t);
  ok(tabAsc, `${w}: tab order still runs down the screen — nothing reordered is focusable (${r.focusables.map(x=>x.l+':'+x.t).join(' ')})`);
  await p.close();
 }

 /* the photograph's box must not depend on the bitmap arriving */
 {
  const p=await phone(390,844);
  await p.route('**://i.ibb.co/**', route=>route.abort());
  await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(500);
  const blocked=await p.evaluate(()=>({doc:document.documentElement.scrollHeight,
    media:Math.round(document.querySelector('.hero__media').getBoundingClientRect().height)}));
  await p.close();
  const p2=await phone(390,844);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAB7RTuqAAAAHElEQVQI12P8//8/AzbAxIAHDDvJ/xEAAP//AwCzSAV1nGr6QAAAAABJRU5ErkJggg==','base64');
  await p2.route('**://i.ibb.co/**', route=>route.fulfill({status:200,contentType:'image/png',body:png}));
  await p2.goto(URL,{waitUntil:'load'}); await p2.waitForTimeout(500);
  const loaded=await p2.evaluate(()=>({doc:document.documentElement.scrollHeight,
    media:Math.round(document.querySelector('.hero__media').getBoundingClientRect().height)}));
  await p2.close();
  ok(blocked.media===loaded.media && blocked.doc===loaded.doc,
     `390: the hero photograph shifts nothing when it arrives (media ${blocked.media}/${loaded.media}, doc ${blocked.doc}/${loaded.doc})`);
 }

 /* tablet keeps the composition but not the phone's full-width action */
 {
  const p=await b.newPage({viewport:{width:768,height:1024}});
  await p.goto(URL,{waitUntil:'load'});
  await p.evaluate(()=>document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-inview')));
  await p.waitForTimeout(350);
  const r=await p.evaluate(()=>{
   const a=document.querySelector('.hero__actions');
   const prim=document.querySelector('.hero__actions .btn--primary').getBoundingClientRect();
   const sec=document.querySelector('.hero__actions .btn--secondary').getBoundingClientRect();
   return {dir:getComputedStyle(a).flexDirection, primW:Math.round(prim.width),
     /* they are centred on each other, not top-aligned: the primary is the
        large control and the secondary the standard one, so compare middles */
     sameRow:Math.abs((prim.top+prim.bottom)/2-(sec.top+sec.bottom)/2)<2,
     stageW:Math.round(a.getBoundingClientRect().width),
     order:[...document.querySelectorAll('.hero__actions,.hero__media')]
       .map(e=>Math.round(e.getBoundingClientRect().top))};});
  ok(r.dir==='row' && r.sameRow, `768: both actions sit on one row (${r.dir}, same row ${r.sameRow})`);
  ok(r.primW < r.stageW * 0.7, `768: the primary is an action, not a banner (${r.primW} of ${r.stageW})`);
  ok(r.order[0] < r.order[1], `768: the action still comes before the photograph`);
  await p.close();
 }

 /* reduced motion clears the hero's entrance delays */
 {
  const p=await phone(390,844,{reducedMotion:'reduce'});
  await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(500);
  const r=await p.evaluate(()=>['.hero__eyebrow','.hero__title','.hero__lead','.hero__actions']
    .map(s=>({d:getComputedStyle(document.querySelector(s)).transitionDelay,
              o:getComputedStyle(document.querySelector(s)).opacity})));
  ok(r.every(x=>parseFloat(x.d)===0 && parseFloat(x.o)>0.95),
     `reduced motion: the hero arrives at once, with no delay (${r.map(x=>x.d+'/'+x.o).join(' ')})`);
  await p.close();
 }


 /* ---- 7b · nothing stays invisible after a jump -------------------------- */
 for (const target of ['#values','#contact','#services']) {
  const p=await phone(390,844); p.on('pageerror',e=>errs.push('jump '+target+': '+e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await p.waitForTimeout(400);
  await p.evaluate(t=>{document.querySelector(t).scrollIntoView()}, target);
  await p.waitForTimeout(700);
  const r=await p.evaluate(()=>{
   const all=[...document.querySelectorAll('[data-reveal]')];
   const above=all.filter(e=>e.getBoundingClientRect().bottom<0);
   const hidden=above.filter(e=>parseFloat(getComputedStyle(e).opacity)<0.95);
   return {above:above.length, hidden:hidden.length,
     which:hidden.slice(0,5).map(e=>e.className.split(' ')[0]||e.tagName)};});
  ok(r.hidden===0,
     `jump to ${target}: nothing the reader has already gone past is left invisible (${r.hidden} of ${r.above}${r.which.length?': '+r.which.join(', '):''})`);
  await p.close();
 }
 /* and the ordinary downward contract is untouched: what is below the fold
    still waits its turn rather than all arriving at once */
 {
  const p=await phone(390,844);
  await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(700);
  const r=await p.evaluate(()=>{
   const all=[...document.querySelectorAll('[data-reveal]')];
   const below=all.filter(e=>e.getBoundingClientRect().top>innerHeight);
   return {below:below.length, waiting:below.filter(e=>parseFloat(getComputedStyle(e).opacity)<0.95).length};});
  ok(r.below>0 && r.waiting===r.below,
     `at the top: everything below the fold still arrives on its own (${r.waiting} of ${r.below})`);
  await p.close();
 }

 /* ---- 14 · STAGE M09 · the footer ---------------------------------------- */
 for (const [w,h] of [[360,640],[375,667],[390,844],[412,915],[430,932],[640,900],[768,1024],[1440,900]]) {
  const p = w<768 ? await phone(w,h) : await b.newPage({viewport:{width:w,height:h}});
  p.on('pageerror',e=>errs.push('footer '+w+': '+e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await p.evaluate(()=>document.querySelector('.site-footer').scrollIntoView());
  await p.waitForTimeout(400);
  const r=await p.evaluate(()=>{
   const px=v=>Math.round(parseFloat(v)*10)/10;
   const parse=c=>{const m=(c||'').match(/[\d.]+/g); if(!m)return null;
     return {r:+m[0],g:+m[1],b:+m[2],a:m.length>3?+m[3]:1};};
   const over=(f,g)=>({r:f.a*f.r+(1-f.a)*g.r,g:f.a*f.g+(1-f.a)*g.g,b:f.a*f.b+(1-f.a)*g.b,a:1});
   const lum=c=>{const t=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};
     return .2126*t(c.r)+.7152*t(c.g)+.0722*t(c.b)};
   const R=(a,c)=>{const A=typeof a==='string'?parse(a):a, C=typeof c==='string'?parse(c):c;
     if(!A||!C)return null; const top=A.a<1?over(A,C):A;
     const x=lum(top),y=lum(C);
     return Math.round(((Math.max(x,y)+.05)/(Math.min(x,y)+.05))*100)/100};
   const ground=e=>{const st=[]; let x=e.parentElement;
     while(x){const c=parse(getComputedStyle(x).backgroundColor);
       if(c&&c.a>0){st.push(c); if(c.a===1)break;} x=x.parentElement;}
     let base={r:255,g:255,b:255,a:1};
     for(let i=st.length-1;i>=0;i--) base = st[i].a<1?over(st[i],base):st[i];
     return base;};

   const f=document.querySelector('.site-footer');
   const links=[...f.querySelectorAll('a')].map(e=>{
     const cs=getComputedStyle(e), b=e.getBoundingClientRect();
     return {w:Math.round(b.width), h:Math.round(b.height), fs:px(cs.fontSize),
       fw:+cs.fontWeight, contrast:R(cs.color,ground(e)),
       press:cs.transitionProperty.includes('scale'),
       named:((e.getAttribute('aria-label')||e.textContent||'').trim().length>0),
       href:e.getAttribute('href')};});

   const size=s=>{const e=f.querySelector(s); if(!e)return null;
     const cs=getComputedStyle(e); return {fs:px(cs.fontSize), fw:+cs.fontWeight,
       contrast:R(cs.color,ground(e))};};

   /* the sequence, read off the page rather than assumed */
   const top=s=>{const e=f.querySelector(s); return e?Math.round(e.getBoundingClientRect().top):null};
   const seq=[['logo','.site-footer__logo'],['brand','.site-footer__brand-note'],
     ['nav','nav'],['contact','.link-icon'],['address','.site-footer__address'],
     ['legal','.site-footer__legal']]
     .map(([k,s])=>({k,t:top(s)})).filter(x=>x.t!==null)
     .sort((a,b)=>a.t-b.t).map(x=>x.k).join('>');

   /* one grid, and no row left half empty */
   const g=f.querySelector('.site-footer__grid');
   const kids=[...g.children].map(e=>{const b=e.getBoundingClientRect();
     return {t:Math.round(b.top), w:Math.round(b.width)};});
   const rowTops=[...new Set(kids.map(k=>k.t))];
   const rows=rowTops.map(t=>kids.filter(k=>k.t===t));
   const cols=getComputedStyle(g).gridTemplateColumns.split(' ').length;
   /* a row is "full" if its cells span the grid: either it is one full-width
      cell or it has as many cells as the grid has columns */
   const gw=Math.round(g.getBoundingClientRect().width);
   const ragged=rows.filter(row=>{
     if(row.length===cols) return false;
     const spanned=row.reduce((a,c)=>a+c.w,0);
     return spanned < gw - 40;}).length;

   const bordered=[...f.querySelectorAll('*')].filter(e=>{
     const cs=getComputedStyle(e);
     return px(cs.borderTopWidth)>0||px(cs.borderBottomWidth)>0;}).length;

   return {
    links, cols, rows:rowTops.length, perRow:rows.map(r=>r.length).join('+'), ragged, bordered, seq,
    brandFirst: g.children[0].contains(f.querySelector('.site-footer__brand-note')),
    legalLast: (()=>{const bar=f.querySelector('.site-footer__bottom');
      return !!bar && bar.getBoundingClientRect().top >= g.getBoundingClientRect().bottom - 1;})(),
    title:size('.site-footer__col-title'), brand:size('.site-footer__brand-note'),
    address:size('.site-footer__address'), legal:size('.site-footer__legal'),
    social:f.querySelectorAll('[href*="twitter"],[href*="instagram"],[href*="linkedin"],[href*="facebook"],[href*="x.com"],[href*="snapchat"],[href*="tiktok"]').length,
    buttons:f.querySelectorAll('.btn').length,
    semantic:{tag:f.tagName.toLowerCase(),
      navs:[...f.querySelectorAll('nav')].filter(n=>n.getAttribute('aria-label')).length,
      allNavs:f.querySelectorAll('nav').length},
    hOver:document.documentElement.scrollWidth-document.documentElement.clientWidth,
   };
  });

  ok(r.hOver===0, `${w}: the footer adds no horizontal scroll (${r.hOver}px)`);
  /* The sequence is a single-column idea. Once the footer is a grid, the
     groups sit side by side and their tops say nothing about reading order —
     the brand paragraph is lower than a column title only because the logo
     above it is taller. Below 640 the order is the layout; from 640 what has
     to hold is that the brand opens the grid and the legal bar closes the
     footer. */
  if (r.cols===1) {
   ok(r.seq==='logo>brand>nav>contact>address>legal',
      `${w}: brand, navigation, contact, then legal (${r.seq})`);
  } else {
   ok(r.brandFirst && r.legalLast,
      `${w}: the brand opens the grid and the legal bar closes the footer (${r.brandFirst}/${r.legalLast})`);
  }

  const small=r.links.filter(l=>w<1024 ? (l.h<44) : (l.h<24)).length;
  ok(small===0, `${w}: every footer link is a comfortable target (${small} of ${r.links.length} under)`);
  ok(r.links.every(l=>l.press), `${w}: and every one answers a press (${r.links.filter(l=>!l.press).length} silent)`);
  ok(r.links.every(l=>l.named), `${w}: and has an accessible name`);
  const low=r.links.filter(l=>l.contrast<4.5).length;
  ok(low===0, `${w}: every link clears AA on the navy (${low} under, worst ${Math.min(...r.links.map(l=>l.contrast))})`);
  ok([r.brand,r.address,r.legal,r.title].every(x=>x && x.contrast>=4.5),
     `${w}: so does every line of text (${[r.brand,r.address,r.legal,r.title].map(x=>x&&x.contrast).join('/')})`);

  /* four jobs, four voices — the address is the one item you cannot tap and
     must not read like the links above it */
  const linkFs = r.links[0].fs;
  ok(r.address.fs < linkFs && r.legal.fs < linkFs && r.title.fs < linkFs,
     `${w}: supporting text is quieter than the links (title ${r.title.fs}, link ${linkFs}, address ${r.address.fs}, legal ${r.legal.fs})`);
  ok(r.title.fw > r.links[0].fw,
     `${w}: and the column titles carry their own weight (${r.title.fw} vs ${r.links[0].fw})`);

  ok(r.ragged===0, `${w}: no group is left orphaned on a half-empty row (${r.cols} cols, rows ${r.perRow})`);
  ok(r.bordered<=1, `${w}: grouping is done with space, not rules (${r.bordered} bordered)`);

  /* nothing invented: the brief lists social, a footer CTA and legal pages,
     and this project has none of the three */
  ok(r.social===0 && r.buttons===0,
     `${w}: no social account or footer CTA was invented (${r.social} social, ${r.buttons} buttons)`);
  ok(r.links.every(l=>/^#|tel:\+966535544352|wa\.me\/966535544352|aunaldrb\.com/.test(l.href)),
     `${w}: every destination is one the site already had`);
  ok(r.semantic.tag==='footer' && r.semantic.navs===r.semantic.allNavs && r.semantic.allNavs>=1,
     `${w}: a real footer with labelled navigation (${r.semantic.tag}, ${r.semantic.navs}/${r.semantic.allNavs} labelled)`);
  await p.close();
 }

 /* reduced motion keeps the press, drops the movement */
 {
  const ctx=await b.newContext({reducedMotion:'reduce',viewport:{width:390,height:844},
    deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const p=await ctx.newPage(); await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(400);
  const r=await p.evaluate(()=>{
   let pressRule=false;
   for (const sh of document.styleSheets){ let rs; try{rs=sh.cssRules}catch(e){continue}
     const walk=list=>{ for (const rl of list){
       if (rl.selectorText && /\.site-footer a:active/.test(rl.selectorText)) pressRule=true;
       if (rl.cssRules && rl.cssRules.length) walk(rl.cssRules); }};
     walk(rs); }
   const links=[...document.querySelectorAll('.site-footer a')];
   return {pressRule, faded:links.filter(e=>parseFloat(getComputedStyle(e).opacity)<0.95).length,
     n:links.length};});
  ok(r.pressRule && r.faded===0,
     `reduced motion: the footer is complete and still answers a press (${r.n} links, ${r.faded} faded)`);
  await ctx.close();
 }

 ok(errs.length===0, `no page errors (${errs.join(' | ')})`);
 console.log(`\n${n-f}/${n} checks pass`);
 await b.close(); process.exit(f?1:0);
})();
