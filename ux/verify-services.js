const { chromium } = require('playwright-core');
/* SITE_URL lets the same assertions run against the production build in
   dist/ as well as the source (M12 §55). */
const SITE = process.env.SITE_URL ||
  ('file://' + require('path').resolve(__dirname, '..', 'index.html'));
(async()=>{
 const b=await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
 let n=0,f=0; const ok=(c,m)=>{n++;if(!c){f++;console.log('  FAIL '+m)}};
 const errs=[];
 for (const w of [1440,1280,1024,768,430,390,375]) {
  const pinned = w>=1024;
  const p=await b.newPage({viewport:{width:w,height:900}});
  p.on('pageerror',e=>errs.push(w+': '+e.message));
  await p.goto(SITE,{waitUntil:'load'});
  await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await p.evaluate(()=>document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-inview')));
  await p.waitForTimeout(700);
  const base=await p.evaluate(()=>{
   const R=e=>e.getBoundingClientRect();
   const sc=document.querySelector('.services__showcase');
   const stage=document.querySelector('.services__stage');
   const slides=[...document.querySelectorAll('.services__slides > .service')];
   const steps=[...document.querySelectorAll('.services__step')];
   const prog=document.querySelector('.services__progress');
   return {slides:slides.length, steps:steps.length,
     stagePos:getComputedStyle(stage).position,
     trackShown:getComputedStyle(document.querySelector('.services__track')).display!=='none',
     progShown:getComputedStyle(prog).display!=='none',
     progAria:prog.getAttribute('aria-hidden')==='true',
     titles:slides.map(e=>e.querySelector('.service__title').textContent.trim()),
     ctas:slides.map(e=>e.querySelector('a').textContent.replace(/\s+/g,' ').trim()),
     h3:document.querySelectorAll('#services h3').length,
     allVisibleWhenFlat: slides.every(e=>getComputedStyle(e).visibility!=='hidden'),
     inAT: slides.every(e=>getComputedStyle(e).visibility!=='hidden'),
     stageH: Math.round(R(stage).height),
     docOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  ok(base.slides===7, `${w} seven services kept (${base.slides})`);
  ok(base.h3===7, `${w} seven h3 headings in the a11y tree (${base.h3})`);
  ok(base.inAT, `${w} no slide is visibility:hidden — all stay readable to AT`);
  ok(base.progAria, `${w} progress run is decorative`);
  ok(base.ctas.every(c=>c==='تواصل معنا'), `${w} CTA copy unchanged`);
  ok(base.docOverflow<=0, `${w} no horizontal overflow (${base.docOverflow})`);
  ok(pinned ? base.stagePos==='sticky' : base.stagePos==='static', `${w} stage ${pinned?'pinned':'static'} (${base.stagePos})`);
  ok(pinned ? base.trackShown : !base.trackShown, `${w} track ${pinned?'drives scroll':'collapsed'}`);
  ok(pinned ? base.progShown : !base.progShown, `${w} progress ${pinned?'shown':'hidden'}`);

  if (pinned) {
    ok(base.stageH <= 900-80, `${w} stage fits the viewport (${base.stageH})`);
    // the stage is a two-track composition, not the stacked card: grid-template-columns
    // does nothing to a flex container, which is exactly how this broke once
    const lay = await p.evaluate(() => {
      const s=document.querySelector('.services__slides > .service');
      const cs=getComputedStyle(s);
      const R=e=>e.getBoundingClientRect();
      const media=R(s.querySelector('.service__media'));
      const title=R(s.querySelector('.service__title'));
      const cta=R(s.querySelector('.service__cta'));
      return {display:cs.display, tracks:cs.gridTemplateColumns.split(' ').length,
        sideBySide: media.right <= title.left + 2,
        mediaWider: media.width > title.width,
        ctaCompact: cta.width < R(s).width * 0.45};
    });
    ok(lay.display==='grid' && lay.tracks===2, `${w} stage slide is a two-track grid (${lay.display}, ${lay.tracks} tracks)`);
    ok(lay.sideBySide, `${w} image and information sit side by side, not stacked`);
    ok(lay.mediaWider, `${w} the image carries the greater weight`);
    ok(lay.ctaCompact, `${w} the CTA does not span its column`);
    const sweep = await p.evaluate(async () => {
      const sc=document.querySelector('.services__showcase');
      const slides=[...document.querySelectorAll('.services__slides > .service')];
      const dots=[...document.querySelectorAll('.services__progress-step')];
      const out=[];
      const top=sc.getBoundingClientRect().top+window.scrollY;
      const end=top+sc.offsetHeight;
      for(let y=top-300;y<end+300;y+=140){
        window.scrollTo(0,y);
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        await new Promise(r=>setTimeout(r,40));
        const act=slides.map(e=>e.classList.contains('is-active'));
        const ai=act.indexOf(true);
        const di=dots.findIndex(d=>d.classList.contains('is-current'));
        const tabbable=slides.filter(e=>{const a=e.querySelector('a');return a && a.getAttribute('tabindex')!=='-1'}).length;
        out.push({count:act.filter(Boolean).length, ai, di, tabbable});
      }
      window.scrollTo(0,0);
      return out;
    });
    const multi=sweep.filter(x=>x.count>1).length;
    const mism=sweep.filter(x=>x.ai!==x.di).length;
    const seen=new Set(sweep.filter(x=>x.ai>-1).map(x=>x.ai));
    const tabBad=sweep.filter(x=>x.ai>-1 && x.tabbable!==1).length;
    ok(multi===0, `${w} exactly one service on stage (${multi} frames with more)`);
    ok(mism===0, `${w} progress node tracks the stage (${mism} mismatches)`);
    ok(seen.size===7, `${w} every service reaches the stage (${seen.size}/7)`);
    ok(tabBad===0, `${w} only the on-stage CTA is tabbable (${tabBad} frames otherwise)`);
    console.log(`${w}  stage ${base.stageH}px sticky  reached ${seen.size}/7`);
  } else {
    console.log(`${w}  stage static, grid fallback`);
  }
  await p.close();
 }
 // reduced motion: the grid, everything visible and tabbable
 const p2=await b.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 p2.on('pageerror',e=>errs.push('rm: '+e.message));
 await p2.goto(SITE,{waitUntil:'load'});
 await p2.waitForTimeout(600);
 const rm=await p2.evaluate(()=>{
  const slides=[...document.querySelectorAll('.services__slides > .service')];
  return {pos:getComputedStyle(document.querySelector('.services__stage')).position,
   hidden:slides.filter(e=>parseFloat(getComputedStyle(e).opacity)<0.95).length,
   untabbable:slides.filter(e=>{const a=e.querySelector('a');return a&&a.getAttribute('tabindex')==='-1'}).length};
 });
 ok(rm.pos==='static' && rm.hidden===0 && rm.untabbable===0,
    `reduced motion: grid fallback, all seven visible and tabbable (pos ${rm.pos}, ${rm.hidden} faded, ${rm.untabbable} untabbable)`);
 await p2.close();
 // no script at all
 const ctx=await b.newContext({javaScriptEnabled:false,viewport:{width:1440,height:900}});
 const p3=await ctx.newPage();
 await p3.goto(SITE,{waitUntil:'load'});
 const nj=await p3.evaluate(()=>{
  const slides=[...document.querySelectorAll('.services__slides > .service')];
  return {n:slides.length, faded:slides.filter(e=>parseFloat(getComputedStyle(e).opacity)<0.95).length,
   track:getComputedStyle(document.querySelector('.services__track')).display};
 }).catch(()=>null);
 ok(nj && nj.n===7 && nj.faded===0 && nj.track==='none',
    `no script: all seven render as the grid (${nj?nj.n+' slides, '+nj.faded+' faded, track '+nj.track:'n/a'})`);
 await ctx.close();
 // freeze regression: pinned scroll must stay modest, and the settled stage
 // must never be blank and never show two services at once
 for (const w of [1440,1280,1024]) {
  const p4=await b.newPage({viewport:{width:w,height:900}});
  p4.on('pageerror',e=>errs.push('freeze '+w+': '+e.message));
  await p4.goto(SITE,{waitUntil:'load'});
  await p4.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await p4.waitForTimeout(400);
  const box=await p4.evaluate(()=>{const s=document.querySelector('.services__showcase');
   const r=s.getBoundingClientRect();return {top:r.top+scrollY,h:s.offsetHeight};});
  ok(box.h<3400, `${w}: pinned scroll stays under ~3.4k (${box.h}px)`);
  let blank=0, multi=0;
  for (let i=0;i<=18;i++) {
   const y=Math.round(box.top - 200 + (box.h + 400) * i / 18);
   await p4.evaluate(v=>scrollTo(0,v), y);
   await p4.waitForTimeout(430);
   const s=await p4.evaluate(()=>{
    const st=document.querySelector('.services__stage').getBoundingClientRect();
    const on=st.bottom>0 && st.top<innerHeight;
    const vis=[...document.querySelectorAll('.services__slides > .service')]
      .filter(e=>parseFloat(getComputedStyle(e).opacity)>0.05).length;
    return {on,vis};
   });
   if (s.on && s.vis===0) blank++;
   if (s.vis>1) multi++;
  }
  ok(blank===0, `${w}: the settled stage is never blank while on screen (${blank} of 19)`);
  ok(multi===0, `${w}: never two services at once (${multi} of 19)`);
  console.log(`${w}  showcase ${box.h}px  blank ${blank}  multi ${multi}`);
  await p4.close();
 }
 ok(errs.length===0, `no page errors (${errs.join(' | ')})`);
 console.log(`\n${n-f}/${n} checks pass`);
 await b.close(); process.exit(f?1:0);
})();
