// Renders the two link-preview cards (1200×630) into pixora/overlay/assets.
//   node pixora/tools/share-cards/render.mjs     (CHROMIUM=/path/to/chrome if needed)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', 'overlay', 'assets');
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const name of ['home', 'go']) {
  await page.goto(`file://${path.join(here, `${name}.html`)}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, `share-${name}.jpg`), type: 'jpeg', quality: 86 });
  console.log(`share-${name}.jpg`);
}
await browser.close();
