/* Stage 03 - hero regression harness.
   Usage: CHROMIUM_PATH=<chrome> node aun-aldrb/verify-hero.js
   Covers the SS26 viewport list plus fold budget, hierarchy and a11y. */
const { chromium } = require('playwright');
const URL = 'file://' + require('path').resolve(__dirname, 'index.html');
const ok = (c,m)=>console.log(`  ${c?'PASS':'**FAIL**'}  ${m}`);
const VP = [[1440,900],[1280,800],[1024,768],[768,1024],[430,932],[390,844],[375,667]];

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage();
  // external hosts are unreachable in this sandbox and stall `load`; abort them
  // so measurements are fast and deterministic (layout is unaffected: the media
  // box is reserved by aspect-ratio, not by the bitmap).
  const offline = pg => pg.route('**', r => /^file:/.test(r.request().url()) ? r.continue() : r.abort());
  await offline(p);

  console.log('### §26 viewport sweep — fold budget & composition');
  for (const [w,h] of VP) {
    await p.setViewportSize({width:w,height:h});
    await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      const box = s => { const e=document.querySelector(s); if(!e) return null;
        const b=e.getBoundingClientRect(); return {top:Math.round(b.top),bot:Math.round(b.bottom),h:Math.round(b.height),w:Math.round(b.width)}; };
      const cs = s => getComputedStyle(document.querySelector(s));
      const hero = document.querySelector('#home');
      return {
        heroH: Math.round(hero.getBoundingClientRect().height),
        eyebrow: box('.hero__eyebrow'), h1: box('.hero__title'), lead: box('.hero__lead'),
        aud: box('.hero__aud'), acts: box('.hero__actions'),
        media: box('.hero__media-frame'), trust: box('.hero__trustbar'),
        primary: box('.hero__actions .btn--primary'), secondary: box('.hero__actions .btn--secondary'),
        h1px: parseFloat(cs('.hero__title').fontSize),
        ratio: cs('.hero__media-frame').aspectRatio,
        audCols: cs('.hero__aud').gridTemplateColumns.split(' ').length,
        trustCols: cs('.hero__trustbar-inner').gridTemplateColumns.split(' ').length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        headerH: Math.round(document.querySelector('.site-header').getBoundingClientRect().height),
      };
    });
    const fold = h;
    const inFold = x => x && x.bot <= fold;
    console.log(`\n-- ${w}x${h} --  hero ${r.heroH}px (${(r.heroH/(fold-r.headerH)).toFixed(2)} screens)`);
    console.log(`   H1 ${r.h1px}px | media ${r.ratio} ${r.media.w}x${r.media.h} | aud ${r.audCols}col | trust ${r.trustCols}col | hOverflow ${r.overflow}px`);
    console.log(`   above fold(${fold}): eyebrow:${inFold(r.eyebrow)} h1:${inFold(r.h1)} lead:${inFold(r.lead)} audience:${inFold(r.aud)} CTA:${inFold(r.acts)} media-starts:${r.media.top<fold}`);
    ok(r.overflow === 0, 'no horizontal overflow');
    ok(inFold(r.h1) && inFold(r.lead) && inFold(r.primary), `§16 headline + statement + primary CTA above the fold (primary ends ${r.primary.bot}, group ends ${r.acts.bot}, fold ${fold})`);
    ok(r.primary.h >= 44 && r.secondary.h >= 44, `tap targets ${r.primary.h}/${r.secondary.h}px`);
    // primary must outrank secondary
    const rank = await p.evaluate(() => {
      const pr = getComputedStyle(document.querySelector('.hero__actions .btn--primary'));
      const se = getComputedStyle(document.querySelector('.hero__actions .btn--secondary'));
      return { pBg: pr.backgroundColor, sBg: se.backgroundColor, pC: pr.color, sC: se.color };
    });
    ok(rank.pBg !== rank.sBg, `§08 primary filled (${rank.pBg}) vs secondary (${rank.sBg})`);
  }

  console.log('\n### hierarchy & content integrity');
  await p.setViewportSize({width:1440,height:900}); await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
  const r2 = await p.evaluate(() => {
    const f = s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
    return {
      h1: f('.hero__title'), lead: f('.hero__lead'), audT: f('.hero__aud-title'), trustB: f('.hero__trust b'),
      h1Count: document.querySelectorAll('h1').length,
      h1Text: document.querySelector('h1').textContent.replace(/\s+/g,' ').trim(),
      eyebrowText: document.querySelector('.hero__eyebrow').textContent.trim(),
      alt: document.querySelector('.hero__media img').getAttribute('alt'),
      fetchpri: document.querySelector('.hero__media img').getAttribute('fetchpriority'),
      dims: document.querySelector('.hero__media img').getAttribute('width')+'x'+document.querySelector('.hero__media img').getAttribute('height'),
      trustItems: [...document.querySelectorAll('.hero__trust b')].map(e=>e.textContent.trim()),
      audItems: [...document.querySelectorAll('.hero__aud-title')].map(e=>e.textContent.trim()),
      audClickable: [...document.querySelectorAll('.hero__aud-card')].some(e=>e.matches('a,button')||e.onclick||getComputedStyle(e).cursor==='pointer'),
      accentColor: getComputedStyle(document.querySelector('.hero__title-accent')).color,
      baseColor: getComputedStyle(document.querySelector('.hero__title')).color,
    };
  });
  ok(r2.h1 > r2.lead && r2.lead >= r2.audT && r2.audT >= r2.trustB,
     `§03 type scale descends: H1 ${r2.h1} > lead ${r2.lead} >= audience ${r2.audT} >= trust ${r2.trustB}`);
  ok(r2.h1Count === 1, 'exactly one h1');
  ok(r2.h1Text === 'نُعين ونُعاون', `h1 reads exactly "${r2.h1Text}" despite the two-tone split`);
  ok(r2.eyebrowText === 'رعاية متخصصة وآمنة', `eyebrow unchanged: "${r2.eyebrowText}"`);
  ok(!!r2.alt && r2.alt.length > 30, 'image alt is meaningful');
  ok(r2.fetchpri === 'high' && r2.dims === '1200x1200', `loading strategy preserved (${r2.fetchpri}, ${r2.dims})`);
  ok(!r2.audClickable, '§22 audience cues are not fake-interactive');
  console.log(`   audience: ${r2.audItems.join(' · ')}`);
  console.log(`   trust:    ${r2.trustItems.join(' · ')}`);
  console.log(`   H1 tones: ${r2.baseColor} + ${r2.accentColor}`);

  console.log('\n### no-JS / reduced motion');
  const c = await b.newContext({ javaScriptEnabled:false, viewport:{width:390,height:844} });
  const p2 = await c.newPage(); await offline(p2); await p2.goto(URL,{waitUntil:'domcontentloaded'}); await p2.waitForTimeout(300);
  const nj = await p2.evaluate(() => ({
    h1: getComputedStyle(document.querySelector('.hero__title')).opacity,
    hidden: [...document.querySelectorAll('#home [data-reveal]')].filter(e=>parseFloat(getComputedStyle(e).opacity)<0.9).length,
  }));
  ok(nj.h1 === '1' && nj.hidden === 0, `§26.8 hero works without animation (0 hidden, h1 opacity ${nj.h1})`);
  await c.close();

  const c2 = await b.newContext({ reducedMotion:'reduce', viewport:{width:1440,height:900} });
  const p3 = await c2.newPage(); await offline(p3); await p3.goto(URL,{waitUntil:'domcontentloaded'}); await p3.waitForTimeout(400);
  ok(await p3.evaluate(()=>getComputedStyle(document.querySelector('.hero__title')).opacity)==='1', 'reduced-motion: hero renders immediately');
  await c2.close();
  await b.close();
})();
