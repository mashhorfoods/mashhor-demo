/* Project terminology standard.
   Approved: ذوي الاحتياجات الخاصة
   Forbidden: الإعاقة / ذوي الإعاقة / معاق / معاقين and near variants.

   Checks the source of every HTML file in the project AND the rendered DOM of
   the site — visible text, alt, aria-label, title, placeholder, and the meta
   tags search engines and social cards read, none of which a source grep alone
   would prove are actually reaching a reader.
   Run: CHROMIUM_PATH=<chrome> node ux/verify-terminology.js                  */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
/* SITE_URL lets the same assertions run against dist/ as well as source (M12 §55). */
const URL = process.env.SITE_URL || ('file://' + path.join(ROOT, 'index.html'));

/* Written as escapes so this file itself never contains the forbidden strings
   and can never be the thing that trips its own grep. */
const FORBIDDEN = [
  'إعاقة',              // إعاقة
  'اعاقة',              // اعاقة (no hamza)
  'معاق',                    // معاق / معاقين
  'معوق',                    // معوق / معوقين
];
const APPROVED = 'الاحتياجات الخاصة';

(async () => {
 let n=0, f=0; const ok=(c,m)=>{n++; if(!c){f++; console.log('  FAIL '+m)}};

 /* ---- 1 · source ---------------------------------------------------------- */
 const files=[];
 (function walk(d){
   for (const e of fs.readdirSync(d,{withFileTypes:true})) {
     if (e.name==='node_modules' || e.name==='.git') continue;
     const p=path.join(d,e.name);
     if (e.isDirectory()) walk(p);
     else if (/\.(html|md|js|json|css|svg)$/.test(e.name)) files.push(p);
   }
 })(ROOT);
 const hits=[];
 for (const p of files) {
   if (path.resolve(p)===path.resolve(__filename)) continue;
   const src=fs.readFileSync(p,'utf8');
   for (const term of FORBIDDEN) {
     let i=src.indexOf(term);
     while (i!==-1) {
       hits.push(path.relative(ROOT,p)+':'+(src.slice(0,i).split('\n').length)+' '+term);
       i=src.indexOf(term,i+1);
     }
   }
 }
 ok(hits.length===0, `no forbidden term in any source file (${hits.length}${hits.length?': '+hits.slice(0,6).join(' | '):''})`);
 console.log(`  scanned ${files.length} files`);

 /* ---- 2 · rendered ------------------------------------------------------- */
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
 for (const [w,h] of [[390,844],[768,1024],[1440,900]]) {
  const p=await b.newPage({viewport:{width:w,height:h}});
  await p.goto(URL,{waitUntil:'load'});
  await p.evaluate(()=>document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-inview')));
  await p.waitForTimeout(300);
  const r=await p.evaluate(bad=>{
   const found=[];
   const scan=(where,text)=>{ if(!text) return;
     for (const t of bad) if (text.includes(t)) found.push(where+': '+text.trim().slice(0,60)); };
   /* every text node that renders */
   const tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
   let node; while((node=tw.nextNode())) {
     const el=node.parentElement;
     if (!el || el.tagName==='SCRIPT' || el.tagName==='STYLE') continue;
     scan('text', node.nodeValue);
   }
   /* everything a reader can be given that is not a text node */
   for (const e of document.querySelectorAll('*')) {
     for (const a of ['alt','aria-label','title','placeholder','aria-description','value','content'])
       if (e.hasAttribute(a)) scan(e.tagName.toLowerCase()+'['+a+']', e.getAttribute(a));
   }
   for (const m of document.querySelectorAll('meta[content]')) scan('meta', m.content);
   return found;
  }, FORBIDDEN);
  ok(r.length===0, `${w}: nothing forbidden reaches a reader (${r.length}${r.length?': '+r.slice(0,4).join(' | '):''})`);
  await p.close();
 }

 /* ---- 3 · the approved term is actually present and laid out ------------- */
 for (const [w,h] of [[320,568],[360,640],[390,844],[430,932],[768,1024],[1024,900],[1280,900],[1440,900]]) {
  const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2,
    isMobile:w<768,hasTouch:w<768});
  await p.goto(URL,{waitUntil:'load'});
  await p.evaluate(()=>document.querySelectorAll('[data-reveal]').forEach(e=>e.classList.add('is-inview')));
  await p.waitForTimeout(350);
  const r=await p.evaluate(term=>{
   const leaves=[...document.querySelectorAll('body *')]
     .filter(e=>!e.children.length && (e.textContent||'').includes(term));
   const overflowing=leaves.filter(e=>e.scrollWidth>e.clientWidth+1)
     .map(e=>(e.className||e.tagName)+' '+e.scrollWidth+'>'+e.clientWidth);
   /* the hero cues are a row of three: every description must start on the
      same line, or the longer label has staggered the row */
   const cards=[...document.querySelectorAll('.hero__aud-card')];
   const tops=cards.map(c=>Math.round(c.querySelector('.hero__aud-desc').getBoundingClientRect().top));
   const stacked=cards.length>1 &&
     Math.abs(cards[0].getBoundingClientRect().top-cards[1].getBoundingClientRect().top)>4;
   return {count:leaves.length, overflowing, tops, stacked,
     alts:[...document.querySelectorAll('img[alt]')].filter(i=>i.alt.includes(term)).length,
     metas:[...document.querySelectorAll('meta[content]')].filter(m=>m.content.includes(term)).length,
     hOver:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  }, APPROVED);
  ok(r.count>=5, `${w}: the approved term renders in the page (${r.count} elements)`);
  ok(r.alts>=1 && r.metas>=3, `${w}: it reaches alt text and the meta tags too (${r.alts} alt, ${r.metas} meta)`);
  ok(r.overflowing.length===0, `${w}: the longer term overflows nothing (${r.overflowing.join(' | ')})`);
  ok(r.hOver===0, `${w}: and adds no horizontal scroll (${r.hOver}px)`);
  const aligned = r.stacked || new Set(r.tops).size===1;
  ok(aligned, `${w}: the three hero cues line up — ${r.stacked?'stacked rows':'descriptions at '+r.tops.join('/')}`);
  await p.close();
 }

 console.log(`\n${n-f}/${n} checks pass`);
 await b.close(); process.exit(f?1:0);
})();
