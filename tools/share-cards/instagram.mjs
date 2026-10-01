// Renders Pixora's first nine Instagram posts (instagram.html) into
// brand/instagram/: post-01.png … post-09.png (1080×1350), the same as
// editable PDFs in brand/instagram/pdf/, and grid-preview.png (the nine as
// the profile shows them: 3:4, newest first).
//   node tools/share-cards/instagram.mjs   (CHROMIUM=/path/to/chrome if needed)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', 'brand', 'instagram');
mkdirSync(path.join(out, 'pdf'), { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
for (let p = 1; p <= 9; p += 1) {
  await page.goto(`file://${path.join(here, 'instagram.html')}?p=${p}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
  await page.waitForTimeout(150);
  const name = `post-0${p}`;
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  await page.pdf({ path: path.join(out, 'pdf', `${name}.pdf`), width: '1080px', height: '1350px', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, pageRanges: '1' });
  console.log(`brand/instagram/${name}.png + pdf`);
}
// The grid as the profile shows it: newest (09) first, each cropped to 3:4.
const cells = [9, 8, 7, 6, 5, 4, 3, 2, 1].map((p) => `<div style="width:360px;height:480px;overflow:hidden"><img src="file://${out}/post-0${p}.png" style="width:384px;height:480px;margin-left:-12px;display:block"></div>`).join('');
writeFileSync(path.join(out, '.grid.html'), `<body style="margin:0;background:#fff;display:grid;grid-template-columns:repeat(3,360px);gap:4px;width:1088px">${cells}</body>`);
const gp = await browser.newPage({ viewport: { width: 1088, height: 1448 } });
await gp.goto(`file://${path.join(out, '.grid.html')}`);
await gp.waitForTimeout(400);
await gp.screenshot({ path: path.join(out, 'grid-preview.png') });
console.log('brand/instagram/grid-preview.png');
await browser.close();
