// Renders Pixora's social media profile pictures and covers (social.html)
// into brand/social/, at each platform's own size:
//   profile.png, profile-yellow.png   1080×1080 (every platform; shown in a circle)
//   cover-facebook.png                1640×624
//   cover-x.png                       1500×500  (X / Twitter header)
//   cover-linkedin.png                1128×191  (LinkedIn company page)
//   cover-youtube.png                 2560×1440 (YouTube banner)
// Each also as an editable PDF in brand/social/pdf/ (same size, the text live
// and selectable, the work images embedded), to open in Illustrator or Acrobat.
//   node tools/share-cards/social.mjs   (CHROMIUM=/path/to/chrome if needed)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', 'brand', 'social');
mkdirSync(path.join(out, 'pdf'), { recursive: true });
const KINDS = { profile: [1080, 1080], 'profile-yellow': [1080, 1080], facebook: [1640, 624], x: [1500, 500], linkedin: [1128, 191], youtube: [2560, 1440] };
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
for (const [k, [width, height]] of Object.entries(KINDS)) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`file://${path.join(here, 'social.html')}?k=${k}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
  await page.waitForTimeout(200);
  const file = k.startsWith('profile') ? `${k}.png` : `cover-${k}.png`;
  await page.screenshot({ path: path.join(out, file) });
  const pdf = file.replace(/\.png$/, '.pdf');
  await page.emulateMedia({ media: 'screen' });
  await page.pdf({ path: path.join(out, 'pdf', pdf), width: `${width}px`, height: `${height}px`, printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }, pageRanges: '1' });
  console.log(`brand/social/${file} + pdf/${pdf}`);
  await page.close();
}
await browser.close();
