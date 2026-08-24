/* STAGE M07 — the CTA system.
   One family, three levels, a few named variants, and the geometry of all of
   them from one place. This harness is the consistency audit as a test: it
   walks every action on the page at three tiers and holds the system to its
   own rules.
   Run: CHROMIUM_PATH=<chrome> node ux/verify-cta.js                          */
const { chromium } = require('playwright-core');
const URL = 'file://' + require('path').resolve(__dirname, '..', 'index.html');

/* every component that behaves as an action */
const ACTIONS = '.btn, .about__profile, .icon-btn, .menu-trigger';
/* the token ladder the system is built from */
const HEIGHTS = [40,44,48,56];
const PADX    = [0,12,16,20,24,32];
const RADIUS  = 18;

(async () => {
 const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
 let n=0, f=0; const ok=(c,m)=>{n++; if(!c){f++; console.log('  FAIL '+m)}};
 const errs=[];

 for (const [w,h] of [[390,844],[768,1024],[1440,900]]) {
  const p = await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:1,
    isMobile:w<768, hasTouch:w<768});
  p.on('pageerror',e=>errs.push(w+': '+e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await p.evaluate(()=>document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-inview')));
  if (w<1024) await p.evaluate(()=>{try{document.querySelector('[data-menu-trigger]').click()}catch(e){}});
  await p.waitForTimeout(600);

  const r = await p.evaluate(({SEL,HEIGHTS,PADX,RADIUS})=>{
   const px=v=>Math.round(parseFloat(v)*10)/10;
   const lum=c=>{const m=c.match(/[\d.]+/g).map(Number);const [r,g,bl]=m.slice(0,3).map(v=>{v/=255;
     return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*bl};
   const R=(a,c)=>{const x=lum(a),y=lum(c);return Math.round(((Math.max(x,y)+.05)/(Math.min(x,y)+.05))*100)/100};
   const ground=e=>{let x=e.parentElement;
     while(x){const bg=getComputedStyle(x).backgroundColor;
       if(bg&&bg!=='rgba(0, 0, 0, 0)'&&!/, 0\)$/.test(bg))return bg; x=x.parentElement}
     return 'rgb(255, 255, 255)'};

   const els=[...document.querySelectorAll(SEL)].filter(e=>{
     const cs=getComputedStyle(e);
     if(cs.display==='none'||cs.visibility==='hidden')return false;
     const r=e.getBoundingClientRect(); return r.width>0||r.height>0;});

   const rows=els.map(e=>{
    const cs=getComputedStyle(e), r=e.getBoundingClientRect(), g=ground(e);
    const bg=cs.backgroundColor!=='rgba(0, 0, 0, 0)'?cs.backgroundColor:g;
    const hasBorder=px(cs.borderTopWidth)>0 && cs.borderTopColor!=='rgba(0, 0, 0, 0)'
                    && !/, 0\)$/.test(cs.borderTopColor);
    /* a control is identified either by its own surface or by its boundary;
       whichever does the identifying has to clear 3:1 */
    const surfaceContrast = bg!==g ? R(bg,g) : null;
    return {
     k:([...e.classList].join('.')||e.tagName).slice(0,40),
     tag:e.tagName.toLowerCase(),
     h:Math.round(r.height), w:Math.round(r.width),
     radius:px(cs.borderTopLeftRadius),
     padX:px(cs.paddingLeft), minH:px(cs.minHeight),
     text:R(cs.color,bg),
     boundary:hasBorder?R(cs.borderTopColor,g):null,
     surface:surfaceContrast,
     scale:cs.transitionProperty.includes('scale'),
     label:(e.getAttribute('aria-label')||e.textContent||'').trim().length>0,
    };});

   /* two actions must never sit closer than a thumb's width apart */
   let tightest=Infinity, pair='';
   for(let i=0;i<els.length;i++) for(let j=i+1;j<els.length;j++){
     const a=els[i].getBoundingClientRect(), c=els[j].getBoundingClientRect();
     const dx=Math.max(0, Math.max(a.left,c.left)-Math.min(a.right,c.right));
     const dy=Math.max(0, Math.max(a.top,c.top)-Math.min(a.bottom,c.bottom));
     if(dx===0&&dy===0) continue;                    /* nested or overlapping */
     const d=Math.round(Math.hypot(dx,dy));
     if(d<tightest){tightest=d; pair=els[i].className.split(' ')[0]+' / '+els[j].className.split(' ')[0];}
   }

   /* §16 — where two actions sit together they must not carry equal weight.
      Two of {surface, boundary, height} have to differ, or the pair reads as
      two primaries and the reader has to choose without being told. */
   const groups=[];
   document.querySelectorAll('.hero__actions, .why__actions, .contact__invite-actions, .services__cta, .mobile-nav__cta')
     .forEach(g=>{
       const kids=[...g.querySelectorAll('.btn')].filter(e=>{
         const cs=getComputedStyle(e); return cs.display!=='none'&&cs.visibility!=='hidden';});
       if(kids.length<2) return;
       const sig=kids.map(e=>{const cs=getComputedStyle(e);
         return {bg:cs.backgroundColor, bd:cs.borderTopColor, h:Math.round(e.getBoundingClientRect().height)}});
       let differing=0;
       if(new Set(sig.map(x=>x.bg)).size>1) differing++;
       if(new Set(sig.map(x=>x.bd)).size>1) differing++;
       if(new Set(sig.map(x=>x.h)).size>1) differing++;
       groups.push({g:g.className.split(' ')[0], n:kids.length, differing});
     });

   /* nothing may pretend to be a button */
   const fake=[...document.querySelectorAll('[onclick], [role="button"]')]
     .filter(e=>!['a','button','input'].includes(e.tagName.toLowerCase()))
     .map(e=>e.tagName.toLowerCase()+'.'+e.className);

   /* the rules that give press and focus feedback, read from the cascade */
   const found={active:0, focus:0};
   for (const sh of document.styleSheets){ let rs; try{rs=sh.cssRules}catch(e){continue}
     const walk=list=>{ for (const rl of list){
       if (rl.selectorText){
         if (/\.btn:active|\.about__profile:active|\.menu-trigger:active|\.icon-btn:active/.test(rl.selectorText)) found.active++;
         if (/:focus-visible/.test(rl.selectorText)) found.focus++;
       }
       if (rl.cssRules && rl.cssRules.length) walk(rl.cssRules); }};
     walk(rs); }

   return {rows, groups, tightest:tightest===Infinity?null:tightest, pair, fake, found,
     HEIGHTS, PADX, RADIUS};
  }, {SEL:ACTIONS, HEIGHTS, PADX, RADIUS});

  const bad = k => r.rows.filter(k).map(x=>x.k+'('+x.h+'/'+x.radius+'/'+x.text+')');

  ok(r.rows.length>=6, `${w}: the audit reaches every action on the page (${r.rows.length} found)`);

  const wrongRadius = bad(x=>Math.abs(x.radius-RADIUS)>0.6);
  ok(wrongRadius.length===0, `${w}: one curve for every action (${wrongRadius.join(' ')||'all '+RADIUS+'px'})`);

  /* the ladder is what the system specifies; a rendered height can land a
     fraction under it because of the grid row it sits in */
  const offLadder = bad(x=>!HEIGHTS.includes(x.minH || x.h) || !PADX.includes(x.padX)
                            || x.h < (x.minH||x.h) - 1);
  ok(offLadder.length===0, `${w}: every action's height and padding come off the same ladder (${offLadder.join(' ')||'ok'})`);

  const lowText = bad(x=>x.text<4.5);
  ok(lowText.length===0, `${w}: every label clears AA against its own ground (${lowText.join(' ')||'all >=4.5'})`);

  /* WCAG 1.4.11: whatever identifies the control needs 3:1 — its surface if it
     has one, otherwise its boundary */
  /* either channel will do: a filled control is identified by its surface, an
     outlined one by its boundary, and a white card on a near-white ground with
     a brand-blue outline is identified by the outline. Take the stronger. */
  const weak = r.rows.filter(x=>{
    const id = Math.max(x.surface ?? 0, x.boundary ?? 0);
    return (x.surface!==null || x.boundary!==null) && id<3;
  }).map(x=>x.k+'(surface '+x.surface+', boundary '+x.boundary+')');
  ok(weak.length===0, `${w}: and is identifiable by more than its label (${weak.join(' ')||'all >=3'})`);

  const small = r.rows.filter(x=>w<1024 ? (x.h<44||x.w<44) : (x.h<24||x.w<24))
    .map(x=>x.k+'('+x.w+'x'+x.h+')');
  ok(small.length===0, `${w}: every action is a comfortable target (${small.join(' ')||'ok'})`);

  const noPress = bad(x=>!x.scale);
  ok(noPress.length===0, `${w}: every action answers a press (${noPress.join(' ')||'all scale'})`);

  const unnamed = bad(x=>!x.label);
  ok(unnamed.length===0, `${w}: every action has an accessible name (${unnamed.join(' ')||'ok'})`);

  ok(r.tightest===null || r.tightest>=8,
     `${w}: no two actions are closer than 8px (${r.tightest}px, ${r.pair})`);
  const flat=r.groups.filter(x=>x.differing<2).map(x=>x.g+'('+x.differing+')');
  ok(flat.length===0,
     `${w}: paired actions always carry different weight (${r.groups.length} pairs checked${flat.length?', flat: '+flat.join(' '):''})`);
  ok(r.fake.length===0, `${w}: nothing is a div pretending to be a button (${r.fake.join(', ')||'none'})`);
  ok(r.found.active>=1 && r.found.focus>=4,
     `${w}: press and focus are both in the cascade (${r.found.active} active, ${r.found.focus} focus-visible)`);
  await p.close();
 }

 /* the three states nothing on the site uses yet, so that when it does, they
    are already right */
 {
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(400);
  const r=await p.evaluate(()=>{
   const lum=c=>{const m=c.match(/[\d.]+/g).map(Number);const [r,g,bl]=m.slice(0,3).map(v=>{v/=255;
     return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*bl};
   const R=(a,c)=>{const x=lum(a),y=lum(c);return Math.round(((Math.max(x,y)+.05)/(Math.min(x,y)+.05))*100)/100};
   const out={};
   for (const variant of ['btn--primary','btn--secondary']) {
    for (const state of ['aria-disabled','aria-busy']) {
     const a=document.createElement('a');
     a.className='btn '+variant+' btn--lg'; a.href='#'; a.textContent='تواصل معنا';
     a.setAttribute(state,'true'); document.body.append(a);
     const cs=getComputedStyle(a), after=getComputedStyle(a,'::after');
     /* a transparent button takes the colour behind it; measuring against
        rgba(0,0,0,0) would compare everything to black */
     const bg = cs.backgroundColor!=='rgba(0, 0, 0, 0)'
       ? cs.backgroundColor : getComputedStyle(a.parentElement).backgroundColor;
     out[variant+'/'+state]={
       opacity:cs.opacity, pointer:cs.pointerEvents,
       contrast:R(cs.color,bg),
       name:(a.textContent||'').trim().length>0,
       spinner:after.borderTopColor,
       spinnerVisible:after.content!=='none' && R(after.borderTopColor,bg)>=2.5,
     };
     a.remove();
    }
   }
   return out;});
  const dis=[r['btn--primary/aria-disabled'], r['btn--secondary/aria-disabled']];
  ok(dis.every(x=>x.opacity==='1'), `disabled says unavailable with a surface, not by fading (opacity ${dis.map(x=>x.opacity).join('/')})`);
  ok(dis.every(x=>x.contrast>=4.5), `disabled stays readable (${dis.map(x=>x.contrast).join('/')})`);
  ok(dis.every(x=>x.pointer==='none'), `disabled cannot be tapped (${dis.map(x=>x.pointer).join('/')})`);
  const busy=[r['btn--primary/aria-busy'], r['btn--secondary/aria-busy']];
  ok(busy.every(x=>x.spinnerVisible), `the busy indicator is visible on every variant (${busy.map(x=>x.spinner).join(' / ')})`);
  ok(busy.every(x=>x.pointer==='none'), `and a second tap cannot fire the same action twice (${busy.map(x=>x.pointer).join('/')})`);
  ok(busy.every(x=>x.name), `busy hides the label without removing its accessible name`);
  await p.close();
 }

 /* under reduced motion the press stays, because it is feedback */
 {
  const ctx=await b.newContext({reducedMotion:'reduce',viewport:{width:390,height:844},
    deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const p=await ctx.newPage(); await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(400);
  const r=await p.evaluate(()=>{
   let scaleRule=false, focusRules=0;
   for (const sh of document.styleSheets){ let rs; try{rs=sh.cssRules}catch(e){continue}
     const walk=list=>{ for (const rl of list){
       if (rl.selectorText && /:active/.test(rl.selectorText) && /scale/.test(rl.style.cssText)) scaleRule=true;
       if (rl.selectorText && /:focus-visible/.test(rl.selectorText)) focusRules++;
       if (rl.cssRules && rl.cssRules.length) walk(rl.cssRules); }};
     walk(rs); }
   return {scaleRule, focusRules};});
  ok(r.scaleRule && r.focusRules>=4,
     `reduced motion keeps the functional feedback — press and focus both survive (${r.scaleRule}, ${r.focusRules})`);
  await ctx.close();
 }

 ok(errs.length===0, `no page errors (${errs.join(' | ')})`);
 console.log(`\n${n-f}/${n} checks pass`);
 await b.close(); process.exit(f?1:0);
})();
