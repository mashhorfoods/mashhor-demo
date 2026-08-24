/* STAGE M03 · M04 · M05 — the mobile sections.
   «من نحن», «ما يميزنا» and «خدماتنا» on a phone. Split out of
   verify-mobile.js, which holds the global architecture and the hero.
   Run: CHROMIUM_PATH=<chrome> node ux/verify-mobile-sections.js              */
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
 /* ---- 9 · STAGE M03 · «من نحن» ------------------------------------------- */
 for (const [w,h] of [[360,640],[375,667],[390,844],[412,915],[430,932],[768,1024],[1440,900]]) {
  const p = w<768 ? await phone(w,h) : await b.newPage({viewport:{width:w,height:h}});
  p.on('pageerror',e=>errs.push('about '+w+': '+e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.evaluate(()=>document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-inview')));
  await p.waitForTimeout(400);
  const r=await p.evaluate(()=>{
   const q=s=>document.querySelector(s);
   const px=v=>parseFloat(v);
   const SEL=['.about__head','.about__lead','.about__media','.about__body','.about__facts','.about__profile'];
   const tops=SEL.map(s=>({s,t:Math.round(q(s).getBoundingClientRect().top+scrollY)}));
   /* the order the markup is in — a screen reader reads this one */
   const grid=q('.about__grid');
   const dom=[...grid.children].filter(e=>SEL.some(s=>e.matches(s))).map(e=>e.className.split(' ')[0]);
   const img=q('.about__media img'), frame=q('.about__media-frame');
   const declared=[+img.getAttribute('width'), +img.getAttribute('height')];
   const ar=getComputedStyle(frame).aspectRatio;
   const facts=q('.about__facts'), fc=getComputedStyle(facts);
   const prof=q('.about__profile'), pc=getComputedStyle(prof), pr=prof.getBoundingClientRect();
   /* line length of the lead, counted from real glyph positions */
   const t=q('.about__lead').firstChild, str=t.textContent, rng=document.createRange(), rows=new Set();
   for (let i=0;i<str.length;i++){rng.setStart(t,i);rng.setEnd(t,i+1);
     const rr=rng.getBoundingClientRect(); if(rr.height) rows.add(Math.round(rr.top));}
   /* contrast of the section's two text roles against the ground it sits on */
   const lum=c=>{const [r,g,bl]=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;
     return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*bl};
   const ratio=(f,g)=>{const a=lum(f),c=lum(g);return Math.round(((Math.max(a,c)+.05)/(Math.min(a,c)+.05))*100)/100};
   const ground=getComputedStyle(q('#about')).backgroundColor==='rgba(0, 0, 0, 0)'
     ? getComputedStyle(document.body).backgroundColor : getComputedStyle(q('#about')).backgroundColor;
   /* the press state, read from the cascade rather than guessed */
   let activeRule=null;
   for (const sh of document.styleSheets){ let rs; try{rs=sh.cssRules}catch(e){continue}
     /* CSS nesting gave every CSSStyleRule a cssRules list of its own, so a
        `if (rl.cssRules) recurse` walker never reaches a leaf. Take the
        declarations wherever they are, and recurse only into groups that
        actually hold rules. */
     const walk=list=>{ for (const rl of list){
       if (rl.selectorText && rl.selectorText.includes('.about__profile:active'))
         activeRule=(activeRule||'')+rl.style.cssText+';';
       if (rl.cssRules && rl.cssRules.length) walk(rl.cssRules); }};
     walk(rs); }
   return {
    tops, dom,
    declaredAR: Math.round(declared[0]/declared[1]*1000)/1000,
    frameAR: ar==='auto'?null:Math.round(eval(ar.replace('/','/'))*1000)/1000,
    factsBg: fc.backgroundColor, factsShadow: fc.boxShadow, factsBorderTop: px(fc.borderTopWidth),
    factsBorderAll: px(fc.borderBottomWidth),
    profTarget: prof.target, profRel: prof.rel,
    profHidden: !!prof.querySelector('.u-visually-hidden'),
    profHiddenText: (prof.querySelector('.u-visually-hidden')||{}).textContent||'',
    profIconPaths: prof.querySelectorAll('svg path').length,
    profH: Math.round(pr.height), profW: Math.round(pr.width),
    colW: Math.round(q('.about__lead').getBoundingClientRect().width),
    profTrans: pc.transitionProperty, activeRule,
    leadPerLine: Math.round(str.trim().length/rows.size), leadLines: rows.size,
    crLead: ratio(getComputedStyle(q('.about__lead')).color, ground),
    crPoint: ratio(getComputedStyle(q('.about__point p')).color, ground),
    steps: SEL.map(s=>q(s).getAttribute('data-reveal-step')||(q(s).hasAttribute('data-reveal')?'1':null)),
    mediaCol: (()=>{const m=q('.about__media').getBoundingClientRect(),
      l=q('.about__lead').getBoundingClientRect();
      return (m.left>=l.right-2||m.right<=l.left+2)?2:1})(),
    delays: SEL.map(s=>Math.round((parseFloat(getComputedStyle(q(s)).transitionDelay)||0)*1000)),
   };
  });

  /* Above 1024 the photograph moves into a second column and sits BESIDE the
     text, so its top is meaningless in a single-file reading order — the
     column order is what has to hold there. */
  const seq = w>=1024 ? r.tops.filter(v=>v.s!=='.about__media') : r.tops;
  const asc = seq.every((v,i)=>i===0||v.t>=seq[i-1].t);
  ok(asc, `${w}: من نحن reads label > lead > ${w>=1024?'':'photograph > '}detail > facts > profile (${seq.map(v=>v.s.slice(8)+':'+v.t).join(' ')})`);
  if (w>=1024) ok(r.mediaCol>1, `${w}: the photograph sits beside the text, not in the reading column (column ${r.mediaCol})`);
  ok(r.dom.join('>')==='about__head>about__lead>about__media>about__body>about__facts>about__profile',
     `${w}: the markup is in that same order, so a screen reader gets it too (${r.dom.join('>')})`);
  ok(r.frameAR!==null && Math.abs(r.frameAR-r.declaredAR)<0.01,
     `${w}: the photograph is shown at its own ratio, so nothing is cropped (frame ${r.frameAR} vs source ${r.declaredAR})`);
  ok(r.profTarget==='_blank' && r.profRel.includes('noopener') && r.profRel.includes('noreferrer'),
     `${w}: the profile opens in a new tab, safely (${r.profTarget} "${r.profRel}")`);
  ok(r.profHidden && r.profHiddenText.includes('صفحة جديدة'),
     `${w}: and says so to a screen reader ("${r.profHiddenText.trim()}")`);
  ok(r.profIconPaths===2, `${w}: it carries the external-link mark, not the internal arrow (${r.profIconPaths} paths)`);
  ok(r.profH>=44, `${w}: the doorway is comfortably tappable (${r.profH}px)`);
  ok(r.profTrans.includes('transform') && r.profTrans.includes('background'),
     `${w}: press feedback moves surface and scale together (${r.profTrans})`);
  ok(r.activeRule && /background/.test(r.activeRule) && /box-shadow/.test(r.activeRule),
     `${w}: there is a real :active state, not just :hover`);
  ok(r.crLead>=4.5 && r.crPoint>=4.5, `${w}: both text roles clear AA on the section ground (${r.crLead}, ${r.crPoint})`);
  const d=r.delays;
  ok(d.every((v,i)=>i===0||v>=d[i-1]) && Math.max(...d)<=380,
     `${w}: the section arrives in reading order and is done by 380ms (${d.join('/')}ms)`);
  if (w<=767) {
   ok(r.leadPerLine>=24 && r.leadPerLine<=45,
      `${w}: the lead runs a comfortable Arabic measure (${r.leadPerLine} per line over ${r.leadLines})`);
   ok(Math.abs(r.profW-r.colW)<=2, `${w}: the doorway spans the text column (${r.profW} of ${r.colW})`);
  }
  if (w<=1023) {
   ok(r.factsBg==='rgba(0, 0, 0, 0)' && r.factsShadow==='none' && r.factsBorderAll===0 && r.factsBorderTop>0,
      `${w}: the facts are editorial, not a card (bg ${r.factsBg}, shadow ${r.factsShadow}, box border ${r.factsBorderAll}, rule ${r.factsBorderTop})`);
  } else {
   ok(r.factsBg!=='rgba(0, 0, 0, 0)' && r.factsShadow!=='none',
      `${w}: the desktop fact card is untouched (bg ${r.factsBg})`);
  }
  await p.close();
 }

 /* reduced motion clears the section's entrance */
 {
  const p=await phone(390,844,{reducedMotion:'reduce'});
  await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(500);
  const r=await p.evaluate(()=>['.about__head','.about__lead','.about__media','.about__body','.about__facts','.about__profile']
    .map(s=>({d:parseFloat(getComputedStyle(document.querySelector(s)).transitionDelay)||0,
              o:parseFloat(getComputedStyle(document.querySelector(s)).opacity)})));
  ok(r.every(x=>x.d===0 && x.o>0.95),
     `reduced motion: من نحن arrives at once (${r.map(x=>x.d+'/'+x.o).join(' ')})`);
  await p.close();
 }

 /* ---- 10 · STAGE M04 · «ما يميزنا» --------------------------------------- */
 for (const [w,h] of [[360,640],[375,667],[390,844],[412,915],[430,932],[768,1024],[1440,900]]) {
  const p = w<768 ? await phone(w,h) : await b.newPage({viewport:{width:w,height:h}});
  p.on('pageerror',e=>errs.push('why '+w+': '+e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await p.evaluate(()=>document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-inview')));
  await p.waitForTimeout(400);
  const r=await p.evaluate(()=>{
   const px=v=>Math.round(parseFloat(v)*10)/10;
   const items=[...document.querySelectorAll('.why__item')];
   const nodes=items.map(it=>{const n=it.querySelector('.why__node').getBoundingClientRect();
     return {cx:(n.left+n.right)/2, top:n.top, bot:n.bottom};});
   /* every connector must sit on the node centre and touch the node at each
      end — the two ways a route drawn from a typed offset goes wrong */
   const segs=items.slice(0,-1).map((it,i)=>{
     const cs=getComputedStyle(it,'::after');
     if (cs.content==='none' || cs.display==='none') return null;
     const ir=it.getBoundingClientRect();
     const x  = ir.right - parseFloat(cs.insetInlineStart) - parseFloat(cs.width)/2;
     const top= ir.top + parseFloat(cs.top);
     const bot= top + parseFloat(cs.height);
     return {dx:Math.round(x-nodes[i].cx),
             gapTop:Math.round(top-nodes[i].bot),
             gapBot:Math.round(nodes[i+1].top-bot)};
   }).filter(Boolean);
   const list=document.querySelector('.why__list'), lc=getComputedStyle(list,'::before');
   let lineDx=null;
   if (lc.display!=='none') { const lr=list.getBoundingClientRect();
     lineDx=Math.round(lr.right-parseFloat(lc.insetInlineStart)-parseFloat(lc.width)/2-nodes[0].cx); }
   const img=document.querySelector('.why__media img'), ic=getComputedStyle(img);
   const fig=document.querySelector('.why__media'), fc=getComputedStyle(fig);
   const lum=c=>{const [r,g,bl]=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;
     return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*bl};
   const ratio=(f,g)=>{const a=lum(f),c=lum(g);return Math.round(((Math.max(a,c)+.05)/(Math.min(a,c)+.05))*100)/100};
   const ground=getComputedStyle(document.querySelector('#why-us')).backgroundColor;
   return {
    n:items.length,
    segs, segCount:segs.length, lineDx,
    ruleBetween: items.slice(1).filter(e=>px(getComputedStyle(e).borderTopWidth)>0).length,
    imgFit:ic.objectFit, imgBlock:ic.blockSize, imgAR:ic.aspectRatio,
    figBg:fc.backgroundColor, figShadow:fc.boxShadow!=='none', figRadius:px(fc.borderRadius),
    crTitle:ratio(getComputedStyle(document.querySelector('.why__item-title')).color, ground),
    crDesc:ratio(getComputedStyle(document.querySelector('.why__desc')).color, ground),
    hOver:document.documentElement.scrollWidth-document.documentElement.clientWidth,
   };
  });
  ok(r.n===6, `${w}: all six approved chapters are present (${r.n})`);
  ok(r.hOver===0, `${w}: ما يميزنا adds no horizontal scroll (${r.hOver}px)`);
  ok(r.crTitle>=4.5 && r.crDesc>=4.5, `${w}: chapter title and text clear AA (${r.crTitle}, ${r.crDesc})`);
  if (w<=1023) {
   ok(r.imgFit==='contain' && r.imgAR==='auto' && parseFloat(r.imgBlock)>0,
      `${w}: the photograph is neither cropped nor stretched, in a reserved box (${r.imgFit}, ${r.imgBlock})`);
   ok(r.figBg!=='rgba(0, 0, 0, 0)' && r.figShadow && r.figRadius>=20,
      `${w}: its frame has the surface, shadow and radius the language uses (${r.figBg}, shadow ${r.figShadow}, r${r.figRadius})`);
   ok(r.ruleBetween===0, `${w}: no hard rule between chapters — it reads as one story (${r.ruleBetween} rules)`);
   ok(r.segCount===5, `${w}: one route segment per gap (${r.segCount} of 5)`);
   ok(r.segs.every(s=>Math.abs(s.dx)<=1), `${w}: every segment sits on the node centre (${r.segs.map(s=>s.dx).join(',')})`);
   ok(r.segs.every(s=>Math.abs(s.gapTop)<=1 && Math.abs(s.gapBot)<=1),
      `${w}: and meets the node at both ends, so it cannot overshoot (${r.segs.map(s=>s.gapTop+'/'+s.gapBot).join(' ')})`);
  } else {
   ok(r.lineDx!==null && Math.abs(r.lineDx)<=1,
      `${w}: the desktop route runs through the nodes, not beside them (${r.lineDx}px off)`);
  }
  await p.close();
 }

 /* the story follows the reader: one chapter at a time, forwards, no gaps */
 for (const [w,h] of [[360,640],[390,844],[430,932]]) {
  const p=await phone(w,h); p.on('pageerror',e=>errs.push('why scroll '+w+': '+e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await p.waitForTimeout(350);
  const box=await p.evaluate(()=>{const s=document.querySelector('#why-us');
    const r=s.getBoundingClientRect();return {t:Math.round(r.top+scrollY),h:Math.round(s.offsetHeight)}});
  const seq=[]; let multi=0, mismatch=0;
  for (let i=0;i<=30;i++) {
   await p.evaluate(v=>scrollTo(0,v), Math.round(box.t-h*0.4+(box.h+h*0.8)*i/30));
   await p.waitForTimeout(130);
   const s=await p.evaluate(()=>{const it=[...document.querySelectorAll('.why__item')];
     return {c:it.findIndex(e=>e.classList.contains('is-current')),
             n:it.filter(e=>e.classList.contains('is-current')).length,
             past:it.filter(e=>e.classList.contains('is-past')).length}});
   if (s.n>1) multi++;
   if (s.c>-1 && s.past!==s.c) mismatch++;
   seq.push(s.c);
  }
  const live=seq.filter(v=>v>-1);
  const first=seq.indexOf(live[0]), last=seq.lastIndexOf(live[live.length-1]);
  const gaps=seq.slice(first,last+1).filter(v=>v===-1).length;
  const backwards=live.filter((v,i)=>i>0 && v<live[i-1]).length;
  ok(multi===0, `${w}x${h}: never two chapters lit at once (${multi} of 31)`);
  ok(gaps===0, `${w}x${h}: once the story starts it never goes blank (${gaps} gaps)`);
  ok(backwards===0, `${w}x${h}: it only ever moves forward (${backwards})`);
  ok(mismatch===0, `${w}x${h}: the filled route always matches the chapter reached (${mismatch})`);
  ok(live.length && live[live.length-1]===5, `${w}x${h}: the story reaches its last chapter (${live[live.length-1]})`);
  await p.close();
 }

 /* without script, and under reduced motion, the whole story is simply there */
 for (const mode of ['reduce','nojs']) {
  const ctx = mode==='nojs'
    ? await b.newContext({javaScriptEnabled:false,viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true})
    : await b.newContext({reducedMotion:'reduce',viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const p=await ctx.newPage(); await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(550);
  const r=await p.evaluate(()=>{const it=[...document.querySelectorAll('.why__item')];
    return {n:it.length,
      state:it.filter(e=>e.classList.contains('is-current')||e.classList.contains('is-past')).length,
      faded:it.filter(e=>parseFloat(getComputedStyle(e).opacity)<0.95).length,
      titles:it.filter(e=>e.querySelector('.why__item-title')).length,
      over:document.documentElement.scrollWidth-document.documentElement.clientWidth}});
  ok(r.n===6 && r.state===0 && r.faded===0 && r.titles===6 && r.over===0,
     `${mode}: all six chapters render at full strength with no route state (${r.n}/${r.state}/${r.faded}/${r.over})`);
  await ctx.close();
 }

 /* ---- 11 · STAGE M05 · «خدماتنا» ------------------------------------------ */
 for (const [w,h] of [[360,640],[375,667],[390,844],[412,915],[430,932],[768,1024]]) {
  const p = w<768 ? await phone(w,h) : await b.newPage({viewport:{width:w,height:h}});
  p.on('pageerror',e=>errs.push('services '+w+': '+e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await p.evaluate(()=>document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-inview')));
  await p.waitForTimeout(450);
  const r=await p.evaluate(()=>{
   const px=v=>Math.round(parseFloat(v)*10)/10;
   const cards=[...document.querySelectorAll('.services__slides > .service')];
   const c0=cards[0], cs=getComputedStyle(c0);
   const key=e=>e.className.split(' ')[0]||e.tagName.toLowerCase();
   const visual=[...c0.children].map(e=>({k:key(e),t:e.getBoundingClientRect().top}))
     .sort((a,b)=>a.t-b.t).map(x=>x.k);
   const dom=[...c0.children].map(key);
   const gaps=[]; for(let i=1;i<cards.length;i++)
     gaps.push(Math.round(cards[i].getBoundingClientRect().top-cards[i-1].getBoundingClientRect().bottom));
   /* the photograph must reach the card's own edges, inside its border */
   const media=c0.querySelector('.service__media').getBoundingClientRect();
   const cardBox=c0.getBoundingClientRect();
   const bw=px(cs.borderLeftWidth);
   const bleed=Math.round(media.width-(cardBox.width-bw*2));
   const ratios=cards.map(c=>getComputedStyle(c.querySelector('.service__media img')).aspectRatio);
   const cta=c0.querySelector('.service__cta'), cr=cta.getBoundingClientRect();
   const inner=cardBox.width-bw*2-px(cs.paddingLeft)*2;
   const lum=c=>{const [r,g,bl]=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;
     return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*bl};
   const ratio=(f,g)=>{const a=lum(f),c=lum(g);return Math.round(((Math.max(a,c)+.05)/(Math.min(a,c)+.05))*100)/100};
   const delays=['.service__media','.service__head','.service__title','.service__desc','.service__cta']
     .map(sel=>Math.round((parseFloat(getComputedStyle(c0.querySelector(sel)).transitionDelay)||0)*1000));
   return {
    n:cards.length, visual, dom, gaps, bleed,
    ratios, fits:cards.map(c=>getComputedStyle(c.querySelector('.service__media img')).objectFit),
    ctaW:Math.round(cr.width), ctaH:Math.round(cr.height), inner:Math.round(inner),
    ctaTrans:getComputedStyle(cta).transitionProperty,
    links:cards.filter(c=>c.querySelector('a[href]')).length,
    crTitle:ratio(getComputedStyle(c0.querySelector('.service__title')).color, cs.backgroundColor),
    crDesc:ratio(getComputedStyle(c0.querySelector('.service__desc')).color, cs.backgroundColor),
    delays,
    hOver:document.documentElement.scrollWidth-document.documentElement.clientWidth,
   };
  });
  ok(r.n===7, `${w}: all seven approved services are present (${r.n})`);
  ok(r.links===7, `${w}: every one keeps its action (${r.links})`);
  ok(r.hOver===0, `${w}: خدماتنا adds no horizontal scroll (${r.hOver}px)`);
  ok(r.gaps.every(g=>g>=20), `${w}: the cards never touch (gaps ${r.gaps.join(',')})`);
  ok(r.visual.join('>')==='service__media>service__head>service__title>service__desc>btn',
     `${w}: the photograph leads the card (${r.visual.join('>')})`);
  ok(r.dom.join('>')==='service__head>service__title>service__media>service__desc>btn',
     `${w}: and the markup is untouched, so reading and tab order are (${r.dom.join('>')})`);
  ok(r.dom[r.dom.length-1]==='btn' && r.visual[r.visual.length-1]==='btn',
     `${w}: the action is last both in the markup and on screen`);
  ok(Math.abs(r.bleed)<=1, `${w}: the photograph reaches the card's edges (${r.bleed}px off)`);
  ok(new Set(r.ratios).size===1, `${w}: one ratio across all seven photographs (${[...new Set(r.ratios)].join(', ')})`);
  ok(r.fits.every(f=>f==='cover'), `${w}: and one fit (${[...new Set(r.fits)].join(', ')})`);
  /* Full width is a phone decision. At 768 the card is 646px wide and a
     button spanning it would be the oversized CTA the brief rules out, so
     there it is sized to its label and only has to clear the touch target. */
  ok(w<=767 ? (r.ctaH>=44 && Math.abs(r.ctaW-r.inner)<=2) : (r.ctaH>=44 && r.ctaW>=88),
     `${w}: the action is ${w<=767?'full width and ':''}comfortably tappable (${r.ctaW}x${r.ctaH} of ${r.inner})`);
  ok(r.ctaTrans.includes('transform'), `${w}: it answers a press (${r.ctaTrans.slice(0,50)})`);
  ok(r.crTitle>=4.5 && r.crDesc>=4.5, `${w}: title and description clear AA (${r.crTitle}, ${r.crDesc})`);
  if (w<=1023) ok(r.delays.join('/')==='0/60/120/180/240',
     `${w}: the card assembles photograph > chip > title > text > action (${r.delays.join('/')}ms)`);
  await p.close();
 }

 /* the catalogue follows the reader, and says so without using opacity */
 for (const [w,h] of [[360,640],[390,844],[430,932]]) {
  const p=await phone(w,h); p.on('pageerror',e=>errs.push('services scroll '+w+': '+e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await p.waitForTimeout(350);
  const box=await p.evaluate(()=>{const s=document.querySelector('#services');
    const r=s.getBoundingClientRect();return {t:Math.round(r.top+scrollY),h:Math.round(s.offsetHeight)}});
  const seq=[]; let multi=0, opacity=0, moved=0;
  for (let i=0;i<=34;i++) {
   await p.evaluate(v=>scrollTo(0,v), Math.round(box.t-h*0.4+(box.h+h*0.8)*i/34));
   /* long enough for the entrance fade (--dur-slow, 420ms) to finish: the
      opacity check below is about the active state, and a card caught
      mid-arrival would report a dimming that is not the one being tested */
   await p.waitForTimeout(470);
   const s=await p.evaluate(()=>{
     const c=[...document.querySelectorAll('.services__slides > .service')];
     const near=c.filter(e=>e.classList.contains('is-near'));
     /* the state must never be told by fading its neighbours, and the card
        itself must never resize — a card that grows moves the one below it */
     /* Only cards that have finished arriving count: every section on this
        site fades its blocks in on entry, and that global entrance is not
        what this assertion is about. What must never happen is one settled
        card being dimmed to say a different one is active. */
     const settled=c.filter(e=>e.classList.contains('is-inview'));
     const anyFaded=settled.some(e=>parseFloat(getComputedStyle(e).opacity)<0.99);
     const scaled=c.some(e=>{const t=getComputedStyle(e).scale;return t!=='none'&&parseFloat(t)!==1});
     return {i:c.findIndex(e=>e.classList.contains('is-near')), n:near.length, anyFaded, scaled};});
   if (s.n>1) multi++;
   if (s.anyFaded) opacity++;
   if (s.scaled) moved++;
   seq.push(s.i);
  }
  const live=seq.filter(v=>v>-1);
  const first=seq.indexOf(live[0]), last=seq.lastIndexOf(live[live.length-1]);
  const gaps=seq.slice(first,last+1).filter(v=>v===-1).length;
  const back=live.filter((v,i)=>i>0 && v<live[i-1]).length;
  ok(multi===0, `${w}x${h}: never two services lit at once (${multi} of 35)`);
  ok(gaps===0, `${w}x${h}: once the catalogue starts it never goes blank (${gaps})`);
  ok(back===0, `${w}x${h}: it only moves forward (${back})`);
  ok(live[live.length-1]===6, `${w}x${h}: it reaches the seventh service (${live[live.length-1]})`);
  ok(opacity===0, `${w}x${h}: no card is ever dimmed to say another is active (${opacity})`);
  ok(moved===0, `${w}x${h}: and no card resizes, so nothing below it moves (${moved})`);
  await p.close();
 }

 /* the active state must be carried by depth and border, not by fading */
 {
  const p=await phone(390,844);
  await p.goto(URL,{waitUntil:'load'});
  await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await p.waitForTimeout(350);
  await p.evaluate(()=>{const c=document.querySelectorAll('.services__slides > .service')[2];
    c.scrollIntoView({block:'center'})});
  await p.waitForTimeout(500);
  const r=await p.evaluate(()=>{
    const c=[...document.querySelectorAll('.services__slides > .service')];
    const on=c.find(e=>e.classList.contains('is-near'));
    const off=c.find(e=>!e.classList.contains('is-near') && !e.classList.contains('service--feature'));
    if(!on||!off) return null;
    const a=getComputedStyle(on), b=getComputedStyle(off);
    return {border:a.borderTopColor!==b.borderTopColor, shadow:a.boxShadow!==b.boxShadow,
      chip:getComputedStyle(on.querySelector('.service__icon')).backgroundColor
         !==getComputedStyle(off.querySelector('.service__icon')).backgroundColor,
      op:[a.opacity,b.opacity]};});
  ok(r && r.border && r.shadow && r.chip,
     `390: the active service is told by border, depth and chip together (${r?[r.border,r.shadow,r.chip].join('/'):'n/a'})`);
  ok(r && r.op[0]==='1' && r.op[1]==='1', `390: and both are fully opaque (${r?r.op.join('/'):'n/a'})`);
  await p.close();
 }

 /* without script, and under reduced motion, it is simply a catalogue */
 for (const mode of ['reduce','nojs']) {
  const ctx = mode==='nojs'
    ? await b.newContext({javaScriptEnabled:false,viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true})
    : await b.newContext({reducedMotion:'reduce',viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const p=await ctx.newPage(); await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(550);
  const r=await p.evaluate(()=>{const c=[...document.querySelectorAll('.services__slides > .service')];
    const kids=[].concat(...c.map(x=>[...x.children]));
    return {cards:c.length, near:c.filter(e=>e.classList.contains('is-near')).length,
      faded:kids.filter(e=>parseFloat(getComputedStyle(e).opacity)<0.95).length,
      links:c.filter(e=>e.querySelector('a[href]')).length,
      over:document.documentElement.scrollWidth-document.documentElement.clientWidth}});
  ok(r.cards===7 && r.near===0 && r.faded===0 && r.links===7 && r.over===0,
     `${mode}: all seven services render complete, with no active state (${r.cards}/${r.near}/${r.faded}/${r.links}/${r.over})`);
  await ctx.close();
 }

 /* the pinned stage above 1024 never sees the phone's state */
 {
  const p=await b.newPage({viewport:{width:1440,height:900}});
  await p.goto(URL,{waitUntil:'load'});
  await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await p.evaluate(()=>{document.querySelector('#services').scrollIntoView()});
  await p.waitForTimeout(600);
  const r=await p.evaluate(()=>{const c=[...document.querySelectorAll('.services__slides > .service')];
    return {near:c.filter(e=>e.classList.contains('is-near')).length,
      active:c.filter(e=>e.classList.contains('is-active')).length,
      stage:getComputedStyle(document.querySelector('.services__stage')).position}});
  ok(r.near===0 && r.active===1 && r.stage==='sticky',
     `1440: the desktop showcase is untouched (${r.near} near, ${r.active} on stage, ${r.stage})`);
  await p.close();
 }

 ok(errs.length===0, `no page errors (${errs.join(' | ')})`);
 console.log(`\n${n-f}/${n} checks pass`);
 await b.close(); process.exit(f?1:0);
})();
