const { chromium } = require('playwright-core');
(async()=>{
 const b=await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
 let n=0,f=0; const ok=(c,m)=>{n++;if(!c){f++;console.log('  FAIL '+m)}};
 const errs=[];
 for (const w of [1440,1280,1024,768,430,390,375]) {
  const wide=w>=1024;
  const p=await b.newPage({viewport:{width:w,height:900}});
  p.on('pageerror',e=>errs.push(w+': '+e.message));
  await p.goto('file://' + require('path').resolve(__dirname,'..','index.html'),{waitUntil:'load'});
  await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await p.evaluate(()=>document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-inview')));
  await p.waitForTimeout(600);
  const base=await p.evaluate(()=>{
   const R=e=>e.getBoundingClientRect();
   const j=document.querySelector('.hww__journey');
   const path=document.querySelector('.hww__path');
   const st=[...document.querySelectorAll('.hww__stage')];
   const cs=getComputedStyle(path);
   return {stages:st.length, h3:document.querySelectorAll('#how-we-work h3').length,
     pathAria:path.getAttribute('aria-hidden')==='true',
     pathW:Math.round(parseFloat(cs.inlineSize||cs.width)),
     pathLeft:Math.round(R(path).left), pathRight:Math.round(R(path).right),
     nodeCentres:st.map(e=>Math.round(R(e.querySelector('.hww__node')).left+R(e.querySelector('.hww__node')).width/2)),
     bodyCols:st.map(e=>getComputedStyle(e.querySelector('.hww__stage-body')).gridColumnStart),
     titles:st.map(e=>e.querySelector('.hww__stage-title').textContent.trim()),
     descs:st.map(e=>e.querySelector('.hww__stage-desc').textContent.trim().length),
     opacities:st.map(e=>parseFloat(getComputedStyle(e).opacity)),
     docOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     clipped:[...document.querySelectorAll('#how-we-work *')].filter(e=>{const c=getComputedStyle(e);
       return c.overflow==='hidden'&&e.scrollWidth>e.clientWidth+1&&!e.querySelector('svg')}).length};
  });
  ok(base.stages===3, `${w} three stages kept (${base.stages})`);
  ok(base.h3===3, `${w} three headings in the a11y tree`);
  ok(base.pathAria, `${w} the route is decorative`);
  ok(base.opacities.every(o=>o>0.99), `${w} no chapter is dimmed (${base.opacities.join('/')})`);
  ok(base.descs.every(d=>d>20), `${w} every description present`);
  ok(base.docOverflow<=0, `${w} no horizontal overflow (${base.docOverflow})`);
  ok(base.clipped===0, `${w} nothing clipped`);
  // every node sits ON the route
  const pathMid=(base.pathLeft+base.pathRight)/2;
  ok(base.nodeCentres.every(c=>Math.abs(c-pathMid)<=2),
     `${w} every node sits on the route (path ${pathMid}, nodes ${base.nodeCentres.join('/')})`);
  if (wide) ok(base.bodyCols.join('/')==='1/3/1',
     `${w} chapters alternate, first at the inline start (${base.bodyCols.join('/')})`);

  // scroll sweep: progress monotonic, one current, done accumulates
  const sweep=await p.evaluate(async ()=>{
   const sec=document.querySelector('#how-we-work');
   const j=document.querySelector('.hww__journey');
   const st=[...document.querySelectorAll('.hww__stage')];
   const out=[];
   const top=sec.getBoundingClientRect().top+window.scrollY;
   for(let y=top-700;y<top+sec.offsetHeight+700;y+=110){
     window.scrollTo(0,y);
     await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
     await new Promise(r=>setTimeout(r,30));
     const p=parseFloat(getComputedStyle(j).getPropertyValue('--hww-progress'))||0;
     const cur=st.map(e=>e.classList.contains('is-current'));
     const done=st.map(e=>e.classList.contains('is-done'));
     out.push({p, nCur:cur.filter(Boolean).length, ci:cur.indexOf(true),
       done:done.filter(Boolean).length});
   }
   window.scrollTo(0,0);
   return out;
  });
  const multi=sweep.filter(x=>x.nCur>1).length;
  const oob=sweep.filter(x=>x.p<0||x.p>1).length;
  let nonMono=0; for(let i=1;i<sweep.length;i++) if(sweep[i].p < sweep[i-1].p-0.001) nonMono++;
  const reached=new Set(sweep.filter(x=>x.ci>-1).map(x=>x.ci));
  const badDone=sweep.filter(x=>x.ci>-1 && x.done!==x.ci).length;
  const maxP=Math.max(...sweep.map(x=>x.p));
  ok(multi===0, `${w} never two current chapters (${multi})`);
  ok(oob===0, `${w} progress stays within 0..1 (${oob} out of range)`);
  ok(nonMono===0, `${w} progress only advances while scrolling down (${nonMono} reversals)`);
  ok(maxP>0.98, `${w} the route completes (max ${maxP.toFixed(2)})`);
  ok(reached.size===3, `${w} every chapter becomes current (${reached.size}/3)`);
  ok(badDone===0, `${w} completed count always matches position (${badDone} mismatches)`);
  console.log(`${w}  path@${pathMid} nodes ${base.nodeCentres.join('/')}  cols ${base.bodyCols.join('/')}  maxP ${maxP.toFixed(2)}`);
  await p.close();
 }
 // reduced motion: route drawn in full, no head, nothing dimmed
 const p2=await b.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 p2.on('pageerror',e=>errs.push('rm: '+e.message));
 await p2.goto('file://' + require('path').resolve(__dirname,'..','index.html'),{waitUntil:'load'});
 await p2.waitForTimeout(500);
 const rm=await p2.evaluate(()=>{
  const fill=document.querySelector('.hww__path-fill');
  const head=document.querySelector('.hww__path-head');
  const st=[...document.querySelectorAll('.hww__stage')];
  return {fillT:getComputedStyle(fill).transform, headDisp:getComputedStyle(head).display,
    dim:st.filter(e=>parseFloat(getComputedStyle(e).opacity)<0.99).length,
    texts:st.every(e=>e.querySelector('.hww__stage-desc').textContent.trim().length>20)};
 });
 ok(rm.headDisp==='none' && rm.dim===0 && rm.texts,
    `reduced motion: route drawn, no travelling head, nothing dimmed (${rm.headDisp}, ${rm.dim} dimmed)`);
 ok(!/matrix\(1, 0, 0, 0,/.test(rm.fillT), `reduced motion: route is not left empty (${rm.fillT})`);
 await p2.close();
 // no script
 const ctx=await b.newContext({javaScriptEnabled:false,viewport:{width:1440,height:900}});
 const p3=await ctx.newPage();
 await p3.goto('file://' + require('path').resolve(__dirname,'..','index.html'),{waitUntil:'load'});
 const nj=await p3.evaluate(()=>{
  const st=[...document.querySelectorAll('.hww__stage')];
  return {n:st.length, dim:st.filter(e=>parseFloat(getComputedStyle(e).opacity)<0.99).length};
 });
 ok(nj.n===3 && nj.dim===0, `no script: all three chapters readable (${nj.n}, ${nj.dim} dimmed)`);
 await ctx.close();
 ok(errs.length===0, `no page errors (${errs.join(' | ')})`);
 console.log(`\n${n-f}/${n} checks pass`);
 await b.close(); process.exit(f?1:0);
})();
