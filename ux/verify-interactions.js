/* STAGE M11 — the micro-interaction system.
   Feedback is the one layer you cannot audit by reading the stylesheet: what
   an element does when touched is decided by cascade, media queries, inline
   styles written by script, and whichever of several press systems happens to
   win. So this harness asks the browser instead. It forces :active and :hover
   one element at a time through CDP, waits for the transition to SETTLE, and
   reads the result.
   (Reading on the first frame reports each value's start rather than its end.
   That mistake made an early pass report the press scale as 1 everywhere.)
   Run: CHROMIUM_PATH=<chrome> node ux/verify-interactions.js                 */
const { chromium } = require('playwright-core');
/* SITE_URL lets the same assertions run against the production build in
   dist/ as well as the source. Development success is not production
   success (M12 §55), so the suite has to be able to test what ships. */
const URL = process.env.SITE_URL ||
  ('file://' + require('path').resolve(__dirname, '..', 'index.html'));

const INTERACTIVE = 'a[href],button,[tabindex]:not([tabindex="-1"])';
const PRESS_SCALE = 0.985;      /* one depth, everywhere */
const PRESS_MAX   = 180;        /* §33 — a touch response is 120-180ms */
const REVEAL_MAX  = 350;        /* §33 — a noticeable transition tops out here */
const ARRIVAL_MAX = 480;        /* §27 — delay + duration before content is readable */

const rgb = c => {const m=(c||'').match(/[\d.]+/g); if(!m) return null;
  return {r:+m[0], g:+m[1], b:+m[2], a:m.length>3?+m[3]:1};};
const over = (f,g) => ({r:f.a*f.r+(1-f.a)*g.r, g:f.a*f.g+(1-f.a)*g.g,
                        b:f.a*f.b+(1-f.a)*g.b, a:1});
const lum = c => {const t=v=>{v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};
  return .2126*t(c.r)+.7152*t(c.g)+.0722*t(c.b)};
const ratio = (fg,bg) => {const A=rgb(fg), B=rgb(bg); if(!A||!B) return null;
  const top=A.a<1?over(A,B):A, x=lum(top), y=lum(B);
  return Math.round(((Math.max(x,y)+.05)/(Math.min(x,y)+.05))*100)/100;};

(async () => {
 const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
 let n=0, f=0; const ok=(c,m)=>{n++; if(!c){f++; console.log('  FAIL '+m)}};
 const errs=[];

 for (const [w,h] of [[360,640],[375,667],[390,844],[412,915],[430,932]]) {
  console.log('\n=== '+w+'x'+h);
  const p = await b.newPage({viewport:{width:w,height:h}, deviceScaleFactor:1,
    isMobile:true, hasTouch:true});
  p.on('pageerror', e=>errs.push(w+': '+e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  await p.evaluate(()=>document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-inview')));
  await p.waitForTimeout(900);

  const cdp = await p.context().newCDPSession(p);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const {root} = await cdp.send('DOM.getDocument',{depth:-1});

  /* one representative of each distinct interactive component */
  const targets = await p.evaluate(SEL=>{
   const seen={}, out=[];
   document.querySelectorAll(SEL).forEach(e=>{
    const cs=getComputedStyle(e);
    if(cs.display==='none'||cs.visibility==='hidden') return;
    if(e.getBoundingClientRect().width<4) return;
    const s=e.closest('section[id]');
    const key=(s?s.id:'chrome')+'/'+((e.className&&e.className.split?e.className.split(' ')[0]:'')||e.tagName);
    if(seen[key]) return; seen[key]=1;
    e.setAttribute('data-m11', key.replace(/\W/g,'_'));
    out.push({key, sel:'[data-m11="'+key.replace(/\W/g,'_')+'"]'});});
   return out;}, INTERACTIVE);

  const read = sel => p.evaluate(s=>{const e=document.querySelector(s); if(!e)return null;
   const cs=getComputedStyle(e), r=e.getBoundingClientRect();
   /* an element with its own opaque background is its own ground */
   const par=c=>{const m=(c||'').match(/[\d.]+/g); return m?{a:m.length>3?+m[3]:1, c:c}:null;};
   let g=e, bg=null;
   while(g){const c=getComputedStyle(g).backgroundColor, q=par(c);
     if(q&&q.a===1){bg=c; break;} g=g.parentElement;}
   /* colour only means something where the element actually paints words. The
      header logo is an anchor around an <img>: it has a computed `color` and
      renders no text, and checking it reported a contrast failure against a
      label that does not exist. */
   const text=(e.textContent||'').trim().length>0;
   return {text, scale:cs.scale, transform:cs.transform, bg:cs.backgroundColor, color:cs.color,
     border:cs.borderTopColor, shadow:(cs.boxShadow||'none').replace(/\s+/g,' ').slice(0,40),
     ground:bg||'rgb(255,255,255)', fs:parseFloat(cs.fontSize), fw:+cs.fontWeight,
     dur:cs.transitionDuration, ease:cs.transitionTimingFunction,
     box:Math.round(r.width)+'x'+Math.round(r.height),
     docH:document.documentElement.scrollHeight,
     over:document.documentElement.scrollWidth-document.documentElement.clientWidth};}, sel);

  const force = async (nodeId, pseudo) => {
   await cdp.send('CSS.forcePseudoState',{nodeId, forcedPseudoClasses:pseudo});
   await p.waitForTimeout(pseudo.length?360:120);};

  const noPress=[], badScale=[], slowPress=[], badEase=[], shifted=[], lowHover=[], lowPress=[];
  const baseDoc = (await read(targets[0].sel)).docH;

  for (const t of targets){
   const {nodeId} = await cdp.send('DOM.querySelector',{nodeId:root.nodeId, selector:t.sel});
   if(!nodeId) continue;
   const rest = await read(t.sel);

   await force(nodeId, ['active']);
   const act = await read(t.sel);
   /* what the pressed state promises, read while it is actually pressed */
   const ms = (act.dur||'').split(',').map(x=>{x=x.trim();
     return x.slice(-2)==='ms'?parseFloat(x):parseFloat(x)*1000;});
   const worst = ms.length?Math.max.apply(null,ms):0;
   await force(nodeId, []);

   await force(nodeId, ['hover']);
   const hov = await read(t.sel);
   await force(nodeId, []);

   /* §05/§20 — something must change, or the touch went unanswered */
   const moved = ['scale','transform','bg','color','border','shadow']
     .some(k=>rest[k]!==act[k]);
   if(!moved) noPress.push(t.key);

   /* §05/§41 — one depth. `scale` carries it; `transform` must contribute none,
      or the two press systems multiply (.985 x .985 = .970). */
   const sc = act.scale==='none' ? 1 : parseFloat(act.scale);
   const tm = (act.transform||'none').match(/matrix\(([\d.-]+)/);
   const tScale = tm ? parseFloat(tm[1]) : 1;
   if(Math.abs(sc*tScale - PRESS_SCALE) > 0.002 && moved)
     badScale.push(t.key+' '+Math.round(sc*tScale*1000)/1000);

   /* §33/§34 — a press answers fast, on an ease-out */
   if(moved && worst > PRESS_MAX) slowPress.push(t.key+' '+worst+'ms');
   if(moved && /cubic-bezier\(0\.4, 0, 0\.2, 1\)/.test(act.ease||''))
     badEase.push(t.key+' ease-in-out');

   /* §38 — a press must not move the document */
   if(act.docH !== baseDoc) shifted.push(t.key+' doc '+baseDoc+'->'+act.docH);
   if(act.over>0 || hov.over>0) shifted.push(t.key+' overflow');

   /* §36 — the label stays readable in every state. This is the assertion the
      invisible primary CTA would have failed: its hover colour and its hover
      background were the same value, 1:1. */
   [['hover',hov],['press',act]].forEach(([label,st])=>{
    const need = (st.fs>=24 || (st.fs>=18.66 && st.fw>=700)) ? 3 : 4.5;
    const own = rgb(st.bg);
    const ground = (own && own.a===1) ? st.bg : st.ground;
    const c = st.text ? ratio(st.color, ground) : null;
    if(c!==null && c<need)
      (label==='hover'?lowHover:lowPress).push(t.key+' '+label+' '+c+' (needs '+need+')');});
  }

  ok(noPress.length===0, `every interactive element answers a press (${noPress.join(' | ')})`);
  ok(badScale.length===0, `one press depth everywhere — ${PRESS_SCALE} (${badScale.join(' | ')})`);
  ok(slowPress.length===0, `every press answers within ${PRESS_MAX}ms (${slowPress.join(' | ')})`);
  ok(badEase.length===0, `no user-triggered state eases in (${badEase.join(' | ')})`);
  ok(shifted.length===0, `no press moves the document or overflows it (${shifted.join(' | ')})`);
  ok(lowHover.length===0, `every label stays readable while hovered (${lowHover.join(' | ')})`);
  ok(lowPress.length===0, `every label stays readable while pressed (${lowPress.join(' | ')})`);

  /* §26/§27 — the arrival budget, and one ladder behind it */
  const rev = await p.evaluate(()=>{
   const ms=d=>{d=d.trim(); return d.slice(-2)==='ms'?parseFloat(d):parseFloat(d)*1000;};
   const step=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stagger'));
   const out=[], inline=[];
   document.querySelectorAll('[data-reveal]').forEach(e=>{
    const cs=getComputedStyle(e);
    const props=(cs.transitionProperty||'').split(',').map(s=>s.trim());
    const durs=(cs.transitionDuration||'').split(',').map(ms);
    const dels=(cs.transitionDelay||'').split(',').map(ms);
    const i=props.indexOf('opacity');
    const d=i>-1?durs[i%durs.length]:durs[0], dl=i>-1?dels[i%dels.length]:dels[0];
    const s=e.closest('section[id]');
    const nm=(s?s.id:'chrome')+'/'+((e.className&&e.className.split?e.className.split(' ')[0]:'')||e.tagName);
    out.push({nm, d, dl, total:d+dl});
    if(e.style.transitionDelay) inline.push(nm+' '+e.style.transitionDelay);});
   return {out, inline, step};});

  const slowRev = rev.out.filter(x=>x.d>REVEAL_MAX);
  const lateRev = rev.out.filter(x=>x.total>ARRIVAL_MAX);
  const offLadder = rev.out.filter(x=>x.dl>0 && Math.abs(x.dl/rev.step - Math.round(x.dl/rev.step))>0.01);
  ok(rev.step>0, `the stagger is a token, not a number in four places (--stagger: ${rev.step}ms)`);
  ok(slowRev.length===0, `no reveal runs longer than ${REVEAL_MAX}ms (${slowRev.map(x=>x.nm+' '+x.d).slice(0,4).join(' | ')})`);
  ok(lateRev.length===0, `nothing is readable later than ${ARRIVAL_MAX}ms (${lateRev.map(x=>x.nm+' '+x.total).slice(0,4).join(' | ')})`);
  ok(offLadder.length===0, `every delay is a whole number of steps (${offLadder.map(x=>x.nm+' '+x.dl).slice(0,4).join(' | ')})`);
  /* the script writes an inline delay to stagger what is already on screen at
     load; an inline delay that survives would ride along into the element's
     next transition — its press included */
  ok(rev.inline.length===0, `no inline transition-delay outlives the entrance (${rev.inline.slice(0,3).join(' | ')})`);

  /* §05 — a :hover rule that is not gated sticks after a tap on a phone */
  const unguarded = await p.evaluate(()=>{
   const bad=[];
   const walk=(rules, guarded)=>{
    for(const r of rules){
     let g=guarded;
     if(r.media) g = guarded || /hover\s*:\s*hover/.test(r.conditionText||r.media.mediaText||'');
     if(r.selectorText && /:hover/.test(r.selectorText) && !g) bad.push(r.selectorText.slice(0,60));
     if(r.cssRules && r.cssRules.length) walk(r.cssRules, g);}};
   for(const sh of document.styleSheets){let rs; try{rs=sh.cssRules}catch(e){continue} walk(rs,false);}
   return bad;});
  ok(unguarded.length===0, `every :hover is gated on a device that has one (${unguarded.slice(0,4).join(' | ')})`);

  console.log(`   ${targets.length} components pressed, ${rev.out.length} reveals, `
    +`worst arrival ${Math.max.apply(null,rev.out.map(x=>x.total))}ms`);
  await p.close();
 }

 /* §07 — the directional icon answers a touch, not only a mouse */
 {
  const p = await b.newPage({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
  await p.goto(URL,{waitUntil:'load'});
  await p.evaluate(()=>document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-inview')));
  await p.waitForTimeout(700);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const {root} = await cdp.send('DOM.getDocument',{depth:-1});
  const {nodeId} = await cdp.send('DOM.querySelector',{nodeId:root.nodeId, selector:'.service__cta'});
  const get = ()=>p.evaluate(()=>getComputedStyle(document.querySelector('.service__cta svg')).transform);
  const rest = await get();
  await cdp.send('CSS.forcePseudoState',{nodeId, forcedPseudoClasses:['active']});
  await p.waitForTimeout(300);
  const act = await get();
  ok(rest!==act && /matrix/.test(act), `the CTA arrow moves on press, not only on hover (${rest} -> ${act})`);
  const m=(act.match(/matrix\(([^)]+)\)/)||[])[1];
  const dx = m ? Math.abs(parseFloat(m.split(',')[4])) : 0;
  ok(dx>0 && dx<=4, `and the movement stays a nudge (${dx}px)`);
  await p.close();
 }

 /* §35 — reduced motion keeps the state and drops the movement */
 {
  const ctx = await b.newContext({reducedMotion:'reduce', viewport:{width:390,height:844},
    deviceScaleFactor:2, isMobile:true, hasTouch:true});
  const p = await ctx.newPage();
  p.on('pageerror', e=>errs.push('reduced: '+e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.waitForTimeout(700);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const {root} = await cdp.send('DOM.getDocument',{depth:-1});
  const probe = async (sel)=>{
   const {nodeId} = await cdp.send('DOM.querySelector',{nodeId:root.nodeId, selector:sel});
   if(!nodeId) return null;
   await cdp.send('CSS.forcePseudoState',{nodeId, forcedPseudoClasses:['active']});
   await p.waitForTimeout(180);
   const v = await p.evaluate(s=>{const e=document.querySelector(s), cs=getComputedStyle(e);
     return {scale:cs.scale, bg:cs.backgroundColor};}, sel);
   await cdp.send('CSS.forcePseudoState',{nodeId, forcedPseudoClasses:[]});
   return v;};
  const prim = await probe('.hero__actions .btn--primary');
  const skip = await probe('.skip-link');
  const logo = await probe('.site-header__logo');
  ok([prim,skip,logo].every(x=>!x || x.scale==='none' || parseFloat(x.scale)===1),
     `reduced motion removes the press movement (${[prim,skip,logo].map(x=>x&&x.scale).join('/')})`);
  ok(prim && prim.bg!=='rgb(73, 117, 186)',
     `but keeps the pressed state itself (${prim&&prim.bg})`);
  const hidden = await p.evaluate(()=>[...document.querySelectorAll('[data-reveal]')]
    .filter(e=>parseFloat(getComputedStyle(e).opacity)<0.99).length);
  ok(hidden===0, `and nothing stays invisible (${hidden})`);
  await ctx.close();
 }

 ok(errs.length===0, `no page errors (${errs.join(' | ')})`);
 console.log(`\n${n-f}/${n} checks pass`);
 await b.close(); process.exit(f?1:0);
})();
