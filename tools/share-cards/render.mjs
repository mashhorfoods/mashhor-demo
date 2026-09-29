// Renders the link-preview cards (1200×630) into overlay/assets, one design
// for all of them (base.css):
//   share-home.jpg, share-go.jpg, share-story.jpg, share-about.jpg
//                                    from home.html / go.html / story.html / about.html
//   share-pricing.jpg                from pricing.html, its price tiles filled
//                                    from the built pricing page
//   share-<service>.jpg              from service.html, one per service, filled
//                                    with the service's cover, name, headline
//                                    and starting price as they appear on the
//                                    built site
// Run the build first (the prices and headlines are read from site/).
//   node tools/share-cards/render.mjs     (CHROMIUM=/path/to/chrome if needed)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const out = path.join(root, 'overlay', 'assets');
const site = (p) => `file://${path.join(root, 'site', p)}`;
const SERVICES = { branding: 'center', websites: 'center', social: '40% 50%', marketing: 'center', integrated: 'center' };
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

for (const name of ['home', 'go', 'story', 'about']) {
  await page.goto(`file://${path.join(here, `${name}.html`)}`);
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
await browser.close();
