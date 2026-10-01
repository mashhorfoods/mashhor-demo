// Renders the portfolio's websites in Pixora's frame (site-mockup.html) and
// encodes them for the site: overlay/assets/site-<site>.webp (the desktop
// page with its phone version) and site-<site>-phones.webp (three phone
// screens), each 1200×900 with an 800×600 copy (-800) for phones.
// The screenshots they are made from are in sites/ (see site-mockup.html).
//   node tools/share-cards/sites.mjs   (needs ffmpeg; CHROMIUM=/path/to/chrome if needed)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, '..', '..', 'overlay', 'assets');
const SITES = ['travel', 'aun'];
const tmp = mkdtempSync(path.join(tmpdir(), 'pixora-sites-'));
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
for (const s of SITES) {
  for (const k of ['hero', 'phones']) {
    await page.goto(`file://${path.join(here, 'site-mockup.html')}?s=${s}&k=${k}`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
    await page.waitForTimeout(150);
    const png = path.join(tmp, `${s}-${k}.png`);
    await page.screenshot({ path: png });
    const name = k === 'hero' ? `site-${s}` : `site-${s}-phones`;
    for (const [w, suffix] of [[1200, ''], [800, '-800']]) {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-vf', `scale=${w}:-2:flags=lanczos`, '-c:v', 'libwebp', '-quality', '84', '-compression_level', '6',
        path.join(assets, `${name}${suffix}.webp`)]);
    }
    console.log(`overlay/assets/${name}.webp (+ -800)`);
  }
}
await browser.close();
rmSync(tmp, { recursive: true, force: true });
