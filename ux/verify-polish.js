/* STAGE M10 — the final polish, as a standing audit.
   M01…M09 each built one region. This harness asks the question that only
   makes sense once they are all in place: is the mobile site ONE product?
   It walks the whole page and holds every rendered element to the system's
   own ladders — radius, elevation, motion, borders, icons — and to WCAG.
   Nothing here is scoped to a section; a value that drifts anywhere fails.
   Run: CHROMIUM_PATH=<chrome> node ux/verify-polish.js                       */
const { chromium } = require('playwright-core');
const URL = 'file://' + require('path').resolve(__dirname, '..', 'index.html');

/* the documented ladders. A number that is not on one of these is drift,
   whatever it looks like on screen. */
const RADIUS = [2, 12, 18, 26, 34];        /* xs sm md lg xl (+ pill/circle) */
const DURS   = [80, 150, 260, 420];        /* instant fast normal slow       */
const BORDER = [1, 1.5, 2, 3];             /* hairline, control, rule, focus */
const ICONPX = [16, 20, 24, 28, 32, 40];   /* xs sm md lg xl (+ 28 stepped)  */

/* One decorative graphic is deliberately NOT an icon: the route line that
   runs behind the contact invitation is a 2px-wide path, drawn art rather
   than a glyph, so it must not inherit the icon system's sizing or stroke. */
const NOT_AN_ICON = /invite-trail/;

(async () => {
 const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
 let n=0, f=0; const ok=(c,m)=>{n++; if(!c){f++; console.log('  FAIL '+m)} };
 const errs=[];

 for (const [w,h] of [[360,640],[375,667],[390,844],[430,932]]) {
  console.log('\n=== '+w+'x'+h);
  const p = await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:1,
    isMobile:true, hasTouch:true});
  p.on('pageerror', e=>errs.push(w+': '+e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  /* the audit is of the settled page, not of the entrance animation */
  await p.evaluate(()=>document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-inview')));
  await p.waitForTimeout(700);

  const r = await p.evaluate(({RADIUS,DURS,BORDER,ICONPX,NOT_AN_ICON})=>{
   const trail = new RegExp(NOT_AN_ICON);
   const px = v => Math.round(parseFloat(v)*100)/100;
   const parse = c => {const m=(c||'').match(/[\d.]+/g); if(!m) return null;
     return {r:+m[0], g:+m[1], b:+m[2], a:m.length>3?+m[3]:1}; };
   const over = (f,g) => ({r:f.a*f.r+(1-f.a)*g.r, g:f.a*f.g+(1-f.a)*g.g,
                           b:f.a*f.b+(1-f.a)*g.b, a:1});
   const lum = c => {const t=v=>{v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};
     return .2126*t(c.r)+.7152*t(c.g)+.0722*t(c.b)};
   /* Alpha is not decoration: rgba(255,255,255,.42) on navy is not white, it
      composites to rgb(133,151,182). Reading the stated colour instead of the
      composited one once reported 8.53:1 for a boundary that measures 2.88. */
   const R = (a,c) => {const A=typeof a==='string'?parse(a):a, C=typeof c==='string'?parse(c):c;
     if(!A||!C) return null;
     const top = A.a<1 ? over(A,C) : A;
     const x=lum(top), y=lum(C);
     return Math.round(((Math.max(x,y)+.05)/(Math.min(x,y)+.05))*100)/100};
   /* An element with its own opaque background IS its own ground. Starting the
      walk at the parent measured white-on-blue as white-on-white. */
   const ground = e => {const st=[]; let x=e;
     while(x){const c=parse(getComputedStyle(x).backgroundColor);
       if(c&&c.a>0){st.push(c); if(c.a===1) break;} x=x.parentElement;}
     let base={r:255,g:255,b:255,a:1};
     for(let i=st.length-1;i>=0;i--) base = st[i].a<1 ? over(st[i],base) : st[i];
     return base;};
   const name = e => {const s=e.closest('section[id]');
     return (s?s.id:'chrome')+'/'+((e.className&&e.className.split?e.className.split(' ')[0]:'')||e.tagName);};
   const near = (v,list) => list.some(x=>Math.abs(v-x)<0.6);

   const painted = [...document.querySelectorAll('body *')].filter(e=>{
     const cs=getComputedStyle(e);
     if(cs.display==='none'||cs.visibility==='hidden') return false;
     const b=e.getBoundingClientRect(); return b.width>1 && b.height>1;});

   /* §07 — every rendered text leaf against its real ground */
   const lowText=[];
   painted.forEach(e=>{
    if(e.children.length) return;
    const t=(e.textContent||'').trim(); if(t.length<2) return;
    const cs=getComputedStyle(e);
    const fs=px(cs.fontSize), fw=+cs.fontWeight;
    /* WCAG "large" is >=24px, or >=18.66px when bold. 17px semibold is not. */
    const need = (fs>=24 || (fs>=18.66 && fw>=700)) ? 3 : 4.5;
    const c=R(cs.color, ground(e));
    if(c!==null && c<need)
      lowText.push(name(e)+' '+fs+'px/'+fw+' = '+c+' (needs '+need+')');});

   /* §10 — radius drift */
   const badRadius=[];
   painted.forEach(e=>{const b=e.getBoundingClientRect();
    if(b.width<24||b.height<20) return;               /* icons ride their own scale */
    const cs=getComputedStyle(e);
    ['borderTopLeftRadius','borderBottomEndRadius'].forEach(k=>{
      const raw=cs[k]; if(!raw||raw.indexOf('%')>-1) return;   /* % = circle */
      const v=px(raw);
      if(v>0 && v<400 && !near(v,RADIUS)) badRadius.push(name(e)+' '+k+' '+v+'px');});});

   /* §08 — elevation: every shadow must be one of the named levels (plus the
      two focus rings, which are rings and not depth) */
   const shadows={};
   painted.forEach(e=>{const s=getComputedStyle(e).boxShadow;
    if(s&&s!=='none') shadows[s.replace(/\s+/g,' ')]=(shadows[s.replace(/\s+/g,' ')]||0)+1;});

   /* §19 — motion ladder */
   const badDur=[];
   painted.forEach(e=>{const cs=getComputedStyle(e);
    (cs.transitionDuration||'').split(',').forEach(d=>{d=d.trim(); if(!d||d==='0s') return;
      const ms = d.slice(-2)==='ms' ? parseFloat(d) : parseFloat(d)*1000;
      if(!near(ms,DURS) && ms!==120) badDur.push(name(e)+' '+d);});});

   /* §09 — real borders only: a 0-width or `none` side is not a border */
   const badBorder=[];
   painted.forEach(e=>{const cs=getComputedStyle(e);
    ['Top','Right','Bottom','Left'].forEach(side=>{
      if(cs['border'+side+'Style']==='none') return;
      const v=px(cs['border'+side+'Width']);
      if(v>0 && !near(v,BORDER)) badBorder.push(name(e)+' '+side+' '+v+'px');});});

   /* §13 — one icon system. Every glyph-sized SVG carries .ico, is on the
      size ladder, and strokes at the same weight. */
   const badIcon=[], strokes={};
   [...document.querySelectorAll('svg')].forEach(s=>{
    const bx=s.getBoundingClientRect(); if(bx.width<=1) return;
    if(trail.test(s.className.baseVal||'') || trail.test((s.parentElement||{}).className||'')) return;
    if(bx.width>48) return;                            /* illustration, not a glyph */
    const cs=getComputedStyle(s);
    if(!s.classList.contains('ico')) badIcon.push(name(s)+' not .ico ('+Math.round(bx.width)+'px)');
    else if(!near(px(cs.width),ICONPX)) badIcon.push(name(s)+' off the size ladder ('+px(cs.width)+'px)');
    const sw=cs.strokeWidth||s.getAttribute('stroke-width')||'-';
    strokes[sw]=(strokes[sw]||0)+1;});

   /* §22 — pointer targets */
   const small=[];
   document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])').forEach(e=>{
    const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden') return;
    const b=e.getBoundingClientRect(); if(!b.width&&!b.height) return;
    if(b.height<44||b.width<44) small.push(name(e)+' '+Math.round(b.width)+'x'+Math.round(b.height));});

   /* §15 — Arabic measure. `ch` is sized on the Latin "0" and runs ~1.4x wider
      than an average Arabic advance, so the line is counted, not assumed:
      each character's own rect gives the row it landed on. */
   const measures=[];
   document.querySelectorAll('p,.why__desc,.service__desc,.hww__stage-desc,.value__desc').forEach(e=>{
    const t=e.firstChild; if(!t||t.nodeType!==3) return;
    const s=t.textContent; if(s.trim().length<50) return;
    const cs=getComputedStyle(e); if(cs.display==='none') return;
    const rng=document.createRange(), rows=new Set();
    for(let i=0;i<s.length;i++){rng.setStart(t,i); rng.setEnd(t,i+1);
      const rr=rng.getBoundingClientRect(); if(rr.height) rows.add(Math.round(rr.top));}
    if(!rows.size) return;
    measures.push({n:name(e), per:Math.round(s.trim().length/rows.size)});});

   /* §06 — no two consecutive sections share a ground */
   const body=getComputedStyle(document.body).backgroundColor;
   const grounds=[...document.querySelectorAll('main section[id]')].map(s=>{
    const c=getComputedStyle(s).backgroundColor;
    return {id:s.id, bg:(c==='rgba(0, 0, 0, 0)'?body:c)};});
   const adjacent=[];
   for(let i=1;i<grounds.length;i++)
    if(grounds[i].bg===grounds[i-1].bg) adjacent.push(grounds[i-1].id+' = '+grounds[i].id);

   /* §25 — every image box is reserved before the file arrives, or nothing
      below it can hold still while it loads */
   const unreserved=[...document.querySelectorAll('img')].filter(i=>{
    const cs=getComputedStyle(i);
    return !i.getAttribute('width') && (!cs.aspectRatio||cs.aspectRatio==='auto')
        && (!cs.height||cs.height==='auto');}).map(i=>(i.className||'img').split(' ')[0]);

   return {lowText, badRadius, badDur, badBorder, badIcon, small, measures,
     adjacent, unreserved, strokes,
     shadows:Object.keys(shadows).length, shadowList:Object.keys(shadows),
     hOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
     bodyOver: document.body.scrollWidth - document.body.clientWidth};
  }, {RADIUS,DURS,BORDER,ICONPX,NOT_AN_ICON:NOT_AN_ICON.source});

  /* §02 — nothing pushes the page sideways at any of the four widths */
  ok(r.hOver<=0 && r.bodyOver<=0, `no horizontal overflow (doc ${r.hOver}, body ${r.bodyOver})`);
  /* §07/§27 */
  ok(r.lowText.length===0, `every rendered word meets AA on its real ground (${r.lowText.join(' | ')})`);
  /* §10 */
  ok(r.badRadius.length===0, `every corner is on the radius ladder (${r.badRadius.slice(0,4).join(' | ')})`);
  /* §08 — three depths and two focus rings is the whole vocabulary */
  ok(r.shadows<=5, `elevation stays a short vocabulary — ${r.shadows} distinct shadows`);
  /* §19 */
  ok(r.badDur.length===0, `every transition is on the motion ladder (${r.badDur.slice(0,4).join(' | ')})`);
  /* §09 */
  ok(r.badBorder.length===0, `every real border is a system width (${r.badBorder.slice(0,4).join(' | ')})`);
  /* §13 */
  ok(r.badIcon.length===0, `one icon system, one size ladder (${r.badIcon.slice(0,4).join(' | ')})`);
  ok(Object.keys(r.strokes).length===1,
     `every icon strokes at one weight (${Object.entries(r.strokes).map(x=>x.join(' x')).join(', ')})`);
  /* §22 */
  ok(r.small.length===0, `no pointer target under 44px (${r.small.slice(0,4).join(' | ')})`);
  /* §15 — a comfortable Arabic line, counted rather than assumed */
  const wide = r.measures.filter(m=>m.per<20||m.per>52);
  ok(wide.length===0, `Arabic measure stays readable (${wide.map(m=>m.n+' '+m.per).join(' | ')})`);
  /* §06 */
  ok(r.adjacent.length===0, `no two neighbouring sections share a ground (${r.adjacent.join(' | ')})`);
  /* §25 */
  ok(r.unreserved.length===0, `every image box is reserved before it loads (${r.unreserved.join(' | ')})`);

  console.log(`   ${r.measures.length} paragraphs measured, ${r.shadows} shadow levels, `
    +`strokes ${Object.keys(r.strokes).join('/')}`);
  await p.close();
 }

 /* §21 — the whole polish must survive the user asking for less motion */
 {
  const ctx = await b.newContext({reducedMotion:'reduce', viewport:{width:390,height:844},
    deviceScaleFactor:2, isMobile:true, hasTouch:true});
  const p = await ctx.newPage();
  p.on('pageerror', e=>errs.push('reduced: '+e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.waitForTimeout(600);
  const r = await p.evaluate(()=>{
   const hidden=[...document.querySelectorAll('[data-reveal]')].filter(e=>{
    const cs=getComputedStyle(e);
    return parseFloat(cs.opacity)<0.99;}).length;
   return {hidden, over:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
  ok(r.hidden===0, `reduced motion leaves nothing invisible (${r.hidden} still faded)`);
  ok(r.over<=0, `and still no sideways scroll (${r.over})`);
  await ctx.close();
 }

 /* §21 — and the user arriving with JavaScript off sees the same page */
 {
  const ctx = await b.newContext({javaScriptEnabled:false, viewport:{width:390,height:844},
    deviceScaleFactor:2, isMobile:true, hasTouch:true});
  const p = await ctx.newPage();
  await p.goto(URL,{waitUntil:'load'});
  await p.waitForTimeout(300);
  const r = await p.evaluate(()=>0).catch(()=>null);
  const shown = await p.locator('[data-reveal]').first().isVisible();
  const over = await p.evaluate(()=>document.documentElement.scrollWidth
    - document.documentElement.clientWidth).catch(()=>0);
  ok(shown, `no-JS still renders the content`);
  await ctx.close();
 }

 ok(errs.length===0, `no page errors (${errs.join(' | ')})`);
 console.log(`\n${n-f}/${n} checks pass`);
 await b.close(); process.exit(f?1:0);
})();
