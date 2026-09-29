// Renders the link-preview cards (1200×630) into overlay/assets:
//   share-home.jpg, share-go.jpg     from home.html / go.html
//   share-<service>.jpg              from service.html, one per service, filled
//                                    with the service's cover, name and headline
//                                    as they appear on its built page (run the
//                                    build first).
//   node tools/share-cards/render.mjs     (CHROMIUM=/path/to/chrome if needed)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const out = path.join(root, 'overlay', 'assets');
const SERVICES = { branding: 'center', websites: 'center', social: '40% 50%', marketing: 'center', integrated: 'center' };
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const shoot = async (file) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, file), type: 'jpeg', quality: 86 });
  console.log(file);
};
for (const name of ['home', 'go']) {
  await page.goto(`file://${path.join(here, `${name}.html`)}`);
  await shoot(`share-${name}.jpg`);
}
const reader = await browser.newPage();
for (const [id, focus] of Object.entries(SERVICES)) {
  await reader.goto(`file://${path.join(root, 'site', 'services', `${id}.html`)}`, { waitUntil: 'domcontentloaded' });
  const t = await reader.evaluate(() => {
    const hero = document.querySelector('.c-svc-hero');
    return {
      name: hero.querySelector('.c-detail__eyebrow [data-lang-copy="ar"]').textContent.trim(),
      h1: hero.querySelector('h1 [data-lang-copy="ar"]').innerHTML,
      en: hero.querySelector('h1 [data-lang-copy="en"]').textContent.replace(/\s+/g, ' ').trim(),
    };
  });
  await page.goto(`file://${path.join(here, 'service.html')}`);
  await page.evaluate(({ t, id, focus, img }) => {
    document.getElementById('img').src = img;
    document.documentElement.style.setProperty('--focus', focus);
    document.getElementById('name').textContent = t.name;
    document.getElementById('h1').innerHTML = t.h1;
    document.getElementById('en').textContent = t.en;
  }, { t, id, focus, img: `file://${path.join(out, `svc-${id}.webp`)}` });
  await shoot(`share-${id}.jpg`);
}
await browser.close();
