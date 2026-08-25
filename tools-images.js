#!/usr/bin/env node
/* STAGE M13 — responsive image variants, generated in-browser.
   There is no ImageMagick, sharp or PIL in this environment, but Chromium
   decodes WebP and PNG and re-encodes WebP through a canvas, which is all that
   is needed. Each source is resized to the widths its own slot actually uses —
   measured from the live layout, not guessed — at 1x and 2x.

   The hero is a cut-out with a transparent background, so alpha is preserved
   and it is never flattened onto a colour.

   Usage:  node tools-images.js            (writes img/<name>-<width>.webp)   */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');

const SRC = path.join(__dirname, 'img');

/* Each slot carries the ladder of widths the browser should be able to choose
   between, taken from what the layout actually paints at 360 / 390 / 768 /
   1024 / 1440 / 1920 / 2560 and then doubled for retina. A single wide variant
   is not "responsive": it makes a 390px phone download a 1024px file, which is
   exactly what the first pass here did to the hero. */
const SLOTS = {
  /* hero paints 390 -> 1280 CSS px; it is the LCP element, so the small end of
     this ladder matters more than any other image on the site */
  'h001.webp'    : { out:'h001',   widths:[400, 560, 780, 1024], alpha:true, quality:0.78 },
  /* why-us paints 350 -> 590 */
  '03.webp'      : { out:'03',     widths:[380, 600, 860, 1122] },
  /* about paints 350 -> 475 */
  '10.webp'      : { out:'10',     widths:[360, 480, 720, 950] },
  /* the seven service cards all paint 348 -> 689 */
  'chair1.webp'  : { out:'chair1', widths:[360, 520, 690, 1040, 1378] },
  '05.webp'      : { out:'05',     widths:[360, 520, 690, 1040, 1378] },
  '11.webp'      : { out:'11',     widths:[360, 520, 690, 1040, 1378] },
  '12.webp'      : { out:'12',     widths:[360, 520, 690, 1040, 1378] },
  '14.webp'      : { out:'14',     widths:[360, 520, 690, 1040, 1378] },
  '15.webp'      : { out:'15',     widths:[360, 520, 690, 1040, 1378] },
  '15 (1).webp'  : { out:'15-1',   widths:[360, 520, 690, 1040, 1378] },
};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const p = await b.newPage();
  const manifest = {};
  let before = 0, after = 0;

  for (const [file, spec] of Object.entries(SLOTS)) {
    const full = path.join(SRC, file);
    if (!fs.existsSync(full)) { console.warn('  ! missing ' + file); continue; }
    const buf = fs.readFileSync(full);
    before += buf.length;
    const mime = file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/webp';
    const uri  = 'data:' + mime + ';base64,' + buf.toString('base64');

    /* never upscale: a variant wider than the source is fake detail and pure
       bytes, so the ladder is clipped to what the file actually contains */
    const want = spec.widths;
    const made = await p.evaluate(async ([uri, want, quality]) => {
      const img = await new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = uri; });
      const out = [];
      const widths = [...new Set(want.map(w => Math.min(w, img.naturalWidth)))].sort((a,b)=>a-b);
      for (const w of widths) {
        const h = Math.round(img.naturalHeight * (w / img.naturalWidth));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, w, h);
        out.push({ w, h, data: c.toDataURL('image/webp', quality) });
      }
      return { srcW: img.naturalWidth, srcH: img.naturalHeight, out };
    }, [uri, want, spec.quality || 0.82]);

    manifest[spec.out] = { source:file, srcW:made.srcW, srcH:made.srcH, variants:[] };
    for (const v of made.out) {
      const name = spec.out + '-' + v.w + '.webp';
      const bytes = Buffer.from(v.data.split(',')[1], 'base64');
      fs.writeFileSync(path.join(SRC, name), bytes);
      after += bytes.length;
      manifest[spec.out].variants.push({ file:name, w:v.w, h:v.h, bytes:bytes.length });
    }
    const vs = manifest[spec.out].variants;
    const short = made.srcW < Math.max.apply(null, spec.widths);
    console.log(('  ' + spec.out).padEnd(10)
      + String(made.srcW + 'x' + made.srcH).padEnd(11)
      + (buf.length/1024).toFixed(0).padStart(5) + 'KB  ->  '
      + vs.map(v => v.w + 'w ' + (v.bytes/1024).toFixed(0) + 'KB').join(' , ')
      + (short ? '   << source caps at ' + made.srcW + 'w' : ''));
  }

  fs.writeFileSync(path.join(SRC, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\n  originals ' + (before/1024/1024).toFixed(2) + 'MB  ->  variants '
    + (after/1024/1024).toFixed(2) + 'MB');
  await b.close();
})();
