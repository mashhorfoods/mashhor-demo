// Renders the link-preview cards (1200×630) into overlay/assets, one design
// for all of them (base.css):
//   share-home.jpg, share-go.jpg, share-story.jpg, share-about.jpg, share-work.jpg
//                                    from home.html / go.html / story.html / about.html / work.html
//   share-pricing.jpg                from pricing.html, its price tiles filled
//                                    from the built pricing page
//   share-<service>.jpg              from service.html, one per service, filled
//                                    with the service's cover, name, headline
//                                    and starting price as they appear on the
//                                    built site
//   share-case-<slug>.jpg            from service.html too, one per case study,
//                                    with its cover, category, title and (English) summary
// It also renders the Pixora identity board (board.html, 1800×1200) to
// tools/share-cards/out/pixora-board.png; `python3 tools/images.py board`
// encodes it for the site (the campaign page's hero) — do that before this
// script's cards, since share-go.jpg shows the encoded board.
// Run the build first (the prices and headlines are read from site/).
//   node tools/share-cards/render.mjs [board]   (CHROMIUM=/path/to/chrome if needed;
//                                               "board"/"covers" render the board
//                                               and case covers only)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const out = path.join(root, 'overlay', 'assets');
const site = (p) => `file://${path.join(root, 'site', p)}`;
const SERVICES = { branding: 'center', websites: 'center', social: '40% 50%', marketing: 'center', integrated: 'center' };
// The studies, in /work's order: tools/cases.py lists them as ("slug", "kinds").
const CASES = [...readFileSync(path.join(here, '..', 'cases.py'), 'utf8').split('CASES = [')[1].split(']]')[0]
  .matchAll(/\("([a-z-]+)", "[a-z ]+"\)/g)].map((m) => m[1]);
if (CASES.length < 2) throw new Error('render: could not read the studies from tools/cases.py');
const BILLING = { billingOnce: 'مرة واحدة', billingMonthly: 'شهريًا' };
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const shoot = async (file) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, file), type: 'jpeg', quality: 86 });
  console.log(file);
};

// The identity board.
{
  const bp = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  await bp.goto(`file://${path.join(here, 'board.html')}`);
  await bp.evaluate(() => document.fonts.ready);
  await bp.waitForTimeout(300);
  await bp.screenshot({ path: path.join(here, 'out', 'pixora-board.png') });
  await bp.close();
  console.log('out/pixora-board.png');
}

// The case study covers (case-cover.html?s=<slug>, 1600×1000), one per study in
// tools/cases.py; `python3 tools/images.py cases` encodes them.
{
  const cp = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  for (const slug of CASES) {
    await cp.goto(`file://${path.join(here, 'case-cover.html')}?s=${slug}`);
    await cp.evaluate(() => document.fonts.ready);
    await cp.waitForTimeout(200);
    await cp.screenshot({ path: path.join(here, 'out', `case-${slug}.png`) });
    console.log(`out/case-${slug}.png`);
  }
  await cp.close();
}
if (['board', 'covers'].includes(process.argv[2])) { await browser.close(); process.exit(0); }

// "From" prices, per service, as the pricing page lists them.
const reader = await browser.newPage();
await reader.route(/^https?:/, (r) => r.abort());
await reader.goto(site('pricing.html'), { waitUntil: 'domcontentloaded' });
const prices = await reader.$$eval('.c-index__link', (links) => links.filter((a) => a.querySelector('.c-index__amount')).map((a) => ({
  id: a.getAttribute('href').split('/').pop(),
  name: a.querySelector('.c-index__name [data-lang-copy="ar"]').textContent.trim(),
  amount: a.querySelector('.c-index__amount').textContent.trim(),
  currency: a.querySelector('.c-index__currency').textContent.trim(),
  billing: a.querySelector('.c-index__billing').dataset.i18n,
})));
if (prices.length < 4) throw new Error(`pricing: expected the service index, found ${prices.length} entries`);

// The hub's prints are the first four studies' covers, as the built hub shows them.
await reader.goto(site('work.html'), { waitUntil: 'domcontentloaded' });
const covers = await reader.$$eval('.c-case-card:not(.c-case-card--featured) .c-case-card__media img',
  (imgs) => imgs.map((i) => i.getAttribute('src').split('/').pop().replace(/\.webp$/, '-800.webp')));
for (const name of ['home', 'go', 'story', 'about', 'work']) {
  await page.goto(`file://${path.join(here, `${name}.html`)}`);
  if (name === 'work') {
    await page.evaluate(({ covers, out }) => document.querySelectorAll('.print img').forEach((img, i) => { img.src = `file://${out}/${covers[i]}`; }),
      { covers: [covers[0], covers[2], covers[1], covers[3]], out });
  }
  await shoot(`share-${name}.jpg`);
}

await page.goto(`file://${path.join(here, 'pricing.html')}`);
await page.evaluate(({ prices, BILLING }) => {
  document.getElementById('tiles').innerHTML = prices.slice(0, 4).map((p) => `
    <div class="tile"><span class="tile__name">${p.name}</span><span class="tile__from">تبدأ من</span>
    <span class="tile__price">${p.amount}<small>${p.currency}</small></span><span class="tile__billing">${BILLING[p.billing] || ''}</span></div>`).join('');
}, { prices, BILLING });
await shoot('share-pricing.jpg');

for (const [id, focus] of Object.entries(SERVICES)) {
  await reader.goto(site(`services/${id}.html`), { waitUntil: 'domcontentloaded' });
  const t = await reader.evaluate(() => {
    const hero = document.querySelector('.c-svc-hero');
    return {
      name: hero.querySelector('.c-detail__eyebrow [data-lang-copy="ar"]').textContent.trim(),
      h1: hero.querySelector('h1 [data-lang-copy="ar"]').innerHTML,
      en: hero.querySelector('h1 [data-lang-copy="en"]').textContent.replace(/\s+/g, ' ').trim(),
    };
  });
  const p = prices.find((x) => x.id === id);
  await page.goto(`file://${path.join(here, 'service.html')}`);
  await page.evaluate(({ t, id, focus, img, from }) => {
    document.getElementById('img').src = img;
    document.documentElement.style.setProperty('--focus', focus);
    document.getElementById('name').textContent = t.name;
    document.getElementById('h1').innerHTML = t.h1;
    document.getElementById('en').textContent = t.en;
    document.getElementById('from').textContent = from;
    document.getElementById('path').textContent = `/services/${id}`;
  }, { t, id, focus, img: `file://${path.join(out, `svc-${id}.webp`)}`,
       from: p ? `تبدأ من ${p.amount} ${p.currency}` : 'الباقات والأسعار' });
  await shoot(`share-${id}.jpg`);
}

for (const slug of CASES) {
  await reader.goto(site(`work/${slug}.html`), { waitUntil: 'domcontentloaded' });
  const t = await reader.evaluate(() => {
    const ar = (sel) => document.querySelector(`${sel} [data-lang-copy="ar"]`).textContent.trim();
    // The study's first print, once it is real work (else its drawn cover).
    const first = document.querySelector('.c-story-hero__card img');
    return { name: ar('.c-story__eyebrow'), h1: document.querySelector('meta[name="title-ar"]').content.replace(/ — بيكسورا$/, ''), en: document.querySelector('meta[name="description"]').content,
      img: first ? first.getAttribute('src').split('/').pop() : null };
  });
  await page.goto(`file://${path.join(here, 'service.html')}`);
  await page.evaluate(({ t, slug, img }) => {
    document.getElementById('img').src = img;
    document.body.classList.toggle('is-light', Boolean(t.img && !t.img.startsWith(`case-${slug}.`)));
    document.getElementById('name').textContent = t.name;
    document.getElementById('h1').textContent = t.h1;
    document.getElementById('en').textContent = t.en;
    document.querySelector('.foot').innerHTML = '<span>دراسة حالة</span><span>من المشكلة إلى النتيجة</span><span>عربي / English</span>';
    document.getElementById('path').textContent = `/work/${slug}`;
  }, { t, slug, img: `file://${path.join(out, t.img || `case-${slug}.webp`)}` });
  await shoot(`share-case-${slug}.jpg`);
}
await browser.close();
