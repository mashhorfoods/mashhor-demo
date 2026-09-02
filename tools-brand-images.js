#!/usr/bin/env node
/* STAGE M13 §08/§10 — the social card and the touch icon.
   -------------------------------------------------------------------------
   Two raster assets that the site needs and did not have, both generated from
   brand/aun-aldrb-logo.svg so neither can drift from the identity.

   1 · brand/og-image.png — 1200x630, the size Open Graph and Twitter cards
       are laid out for.
       The page was pointing og:image at brand/aun-aldrb-logo.png. That file
       is 5041x3577 and 217KB, which is a lot to send for a 1200x630 slot, and
       — the part that actually breaks — it has a transparent background.
       Social clients composite a transparent PNG onto their own surface, and
       on the ones that use a dark surface the blue wordmark lands on black.
       Flattening it here onto the brand's own light ground (--aun-mist) makes
       the card look the same everywhere.

   2 · brand/apple-touch-icon.png — 180x180, for iOS home screens. Without one
       iOS saves a screenshot of the page instead.
       It carries the MARK alone, not the lockup: the wordmark is a wide
       horizontal lockup and at 180px square it would be four illegible
       letters. brand/BRAND-IDENTITY.md names the road form "the mark", and
       the mark on white is the identity, cropped, not reinterpreted.

   3 · brand/favicon-32.png — the PNG fallback for browsers that do not take
       an SVG favicon. The SVG stays the primary.

   4 · brand/logo.png — the raster the structured data points at. Schema.org's
       `logo` has to be a crawlable raster, and the only one in the project
       was brand/aun-aldrb-logo.png: 5041x3577 and transparent. This is the
       same lockup at 1000px on white, 200x smaller and composited, so what a
       search result shows is what the brand book draws. The 5041px original
       stays in brand/ as the master and is not uploaded.

   Nothing is redrawn, recoloured or recomposed. Every pixel comes out of the
   approved vector.

   Usage:  node tools-brand-images.js
   Requires: sharp (build-time only).  npm install
*/
const sharp = require('sharp');
const fs = require('fs'), path = require('path');

const BRAND = path.join(__dirname, 'brand');
const SVG = fs.readFileSync(path.join(BRAND, 'aun-aldrb-logo.svg'));

const MIST = '#EEF3FA';   /* --aun-mist, the light supporting surface */
const WHITE = '#FFFFFF';  /* --aun-white */

/* the ink, and the gap between the mark and the wordmark, measured off the
   rendered vector rather than guessed from the viewBox */
async function geometry(density) {
  const png = await sharp(SVG, { density }).png().toBuffer();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const opaque = (x, y) => data[(y * W + x) * 4 + 3] > 16;

  let minx = W, maxx = 0, miny = H, maxy = 0;
  const cols = new Array(W).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (opaque(x, y)) {
    cols[x]++;
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  /* the widest empty column run inside the ink separates mark from wordmark */
  let gap = null, run = 0;
  for (let x = minx; x <= maxx; x++) {
    if (!cols[x]) run++;
    else { if (run > (gap ? gap.run : 0)) gap = { end: x - 1, run }; run = 0; }
  }
  if (!gap) throw new Error('could not find the gap between mark and wordmark');
  const markRight = gap.end - gap.run + 1;

  /* the mark's own vertical extent, not the lockup's */
  let my0 = H, my1 = 0;
  for (let y = 0; y < H; y++) for (let x = minx; x < markRight; x++) if (opaque(x, y)) {
    if (y < my0) my0 = y; if (y > my1) my1 = y; break;
  }
  return { png, W, H,
           ink:  { left: minx, top: miny, width: maxx - minx + 1, height: maxy - miny + 1 },
           mark: { left: minx, top: my0,  width: markRight - minx, height: my1 - my0 + 1 } };
}

(async () => {
  /* --- 1 · the social card --------------------------------------------- */
  {
    const OW = 1200, OH = 630;
    const g = await geometry(600);
    const logo = await sharp(g.png).extract(g.ink).toBuffer();
    /* the lockup fills 62% of the card's width — clear space on every side is
       well past the "height of the ع" the brand book asks for */
    const w = Math.round(OW * 0.62);
    const scaled = await sharp(logo).resize({ width: w }).toBuffer();
    const meta = await sharp(scaled).metadata();
    const out = path.join(BRAND, 'og-image.png');
    await sharp({ create: { width: OW, height: OH, channels: 3, background: MIST } })
      .composite([{ input: scaled, left: Math.round((OW - w) / 2), top: Math.round((OH - meta.height) / 2) }])
      .png({ compressionLevel: 9, palette: true })
      .toFile(out);
    console.log('  brand/og-image.png          1200x630   ' + (fs.statSync(out).size / 1024).toFixed(1) + 'KB');
  }

  /* --- 2 · the raster logo for structured data -------------------------- */
  {
    const g = await geometry(600);
    const logo = await sharp(g.png).extract(g.ink).resize({ width: 1000 })
                       .flatten({ background: WHITE }).toBuffer();
    const out = path.join(BRAND, 'logo.png');
    await sharp(logo).png({ compressionLevel: 9, palette: true }).toFile(out);
    const m = await sharp(out).metadata();
    console.log(('  brand/logo.png').padEnd(30) + (m.width + 'x' + m.height).padEnd(11)
      + (fs.statSync(out).size / 1024).toFixed(1) + 'KB');
  }

  /* --- 3 · the touch icon, and the favicon fallback --------------------- */
  {
    const g = await geometry(900);
    const mark = await sharp(g.png).extract(g.mark).toBuffer();
    for (const [size, file, fill] of [[180, 'apple-touch-icon.png', 0.62], [32, 'favicon-32.png', 0.86]]) {
      const inner = Math.round(size * fill);
      const scaled = await sharp(mark).resize({ width: inner, height: inner, fit: 'contain',
                       background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
      const out = path.join(BRAND, file);
      await sharp({ create: { width: size, height: size, channels: 3, background: WHITE } })
        .composite([{ input: scaled, gravity: 'center' }])
        .png({ compressionLevel: 9, palette: true })
        .toFile(out);
      console.log(('  brand/' + file).padEnd(30) + (size + 'x' + size).padEnd(11)
        + (fs.statSync(out).size / 1024).toFixed(1) + 'KB');
    }
  }
})();
