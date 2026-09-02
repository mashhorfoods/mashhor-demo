#!/usr/bin/env node
/* STAGE M13 — responsive image variants.
   -------------------------------------------------------------------------
   Every photograph on the site is served through `srcset`, and this is what
   builds the ladder. Each source is resized to the widths its own slot
   actually paints — measured from the live layout at 360 / 390 / 768 / 1024 /
   1440 / 1920 / 2560, then doubled for retina — and encoded once per width.

   A single wide variant is not "responsive": it makes a 390px phone download
   a 1024px file, which is what the first pass here did to the hero.

   ENCODER.  This ran through a Chromium canvas, because the environment had
   no image library. It does now, and the difference is not marginal: at equal
   measured quality (PSNR against the master, alpha masked out) libwebp writes
   the hero's 780w variant at 87KB where the canvas wrote 116KB, and the
   canvas's alpha channel was 17dB worse on top of that. Across the ten photos
   the ladder went from 3.04MB to about two thirds of that for the same or
   better fidelity — on the LCP element and on every card below it.

   Quality 80 is not a guess: it is the lowest setting at which every variant
   measures at least as good as the canvas output it replaces. The hero also
   asks for alphaQuality 90, because it is a cut-out and its alpha edge is the
   silhouette of a person against the page.

   AVIF, for the hero only.  The hero is the Largest Contentful Paint element
   at every width, so its bytes are the ones that are actually on the critical
   path; the other nine photographs are below the fold and lazy-loaded, where
   halving a file buys nothing a visitor can feel and costs a second copy of
   every rung. At q65 the hero's 780w AVIF measures BETTER than its WebP
   (39.3dB against 38.4dB) at 46KB against 87KB. Its alpha is softer — 52dB
   against 64 — which is far above where an alpha matte shows an edge.
   The markup serves it through <picture>, so a browser without AVIF (Safari
   before 16.4) gets exactly the WebP ladder it got before.

   The masters in img/*.webp are source and are never uploaded — build.js
   ships only the variants the built markup actually references.

   Usage:  node tools-images.js            (writes img/<name>-<width>.webp)
   Requires: sharp (a build-time dependency only — nothing at runtime).
             npm install
*/
const sharp = require('sharp');
const fs = require('fs'), path = require('path');

const SRC = path.join(__dirname, 'img');

/* Each slot carries the ladder of widths the browser should be able to choose
   between, and `alpha` marks the cut-outs whose transparency must survive.
   The variant files take their master's name, so what a search result and a
   server log show is what the photograph is of — M13 renamed the masters from
   h001 / 03 / 10 / chair1 / 12 / 14 / 15 / 05 / 11 / "15 (1)", which named
   nothing and, in the last case, put a space and brackets in a URL. */
const SLOTS = {
  /* hero paints 390 -> 1280 CSS px; it is the LCP element, so the small end of
     this ladder matters more than any other image on the site, and it is the
     only one that also gets an AVIF ladder */
  'wheelchair-ramp-boarding'   : { widths:[400, 560, 780, 1024], alpha:true, avif:true },
  /* why-us paints 350 -> 590 */
  'wheelchair-passenger-vehicle': { widths:[380, 600, 860, 1122] },
  /* about paints 350 -> 475 */
  'equipped-vehicle-fleet'     : { widths:[360, 480, 720, 950] },
  /* the seven service cards all paint 348 -> 689 */
  'wheelchair-transport'       : { widths:[360, 520, 690, 1040, 1378] },
  'power-wheelchair-transport' : { widths:[360, 520, 690, 1040, 1378] },
  'medical-bed-transport'      : { widths:[360, 520, 690, 1040, 1378] },
  'driver-assistant-escort'    : { widths:[360, 520, 690, 1040, 1378] },
  'daily-transport-elderly'    : { widths:[360, 520, 690, 1040, 1378] },
  'hospital-medical-centre'    : { widths:[360, 520, 690, 1040, 1378] },
  'riyadh-social-mobility'     : { widths:[360, 520, 690, 1040, 1378] },
};

const QUALITY = 80;
const AVIF_QUALITY = 65;

(async () => {
  const manifest = {};
  let before = 0, after = 0;

  /* start clean: a width that leaves a ladder must not linger in img/ and be
     picked up by the next build */
  for (const f of fs.readdirSync(SRC)) {
    if (/-\d+\.(webp|avif)$/.test(f)) fs.unlinkSync(path.join(SRC, f));
  }

  for (const [stem, spec] of Object.entries(SLOTS)) {
    const file = stem + '.webp';
    const full = path.join(SRC, file);
    if (!fs.existsSync(full)) { console.warn('  ! missing ' + file); continue; }
    const srcBytes = fs.statSync(full).size;
    before += srcBytes;
    const meta = await sharp(full).metadata();

    /* never upscale: a variant wider than the source is invented detail and
       pure bytes, so the ladder is clipped to what the file actually holds */
    const widths = [...new Set(spec.widths.map(w => Math.min(w, meta.width)))].sort((a, b) => a - b);

    manifest[stem] = { source: file, srcW: meta.width, srcH: meta.height, variants: [] };
    const line = [];
    for (const w of widths) {
      const opts = { quality: QUALITY, effort: 6 };
      if (spec.alpha) opts.alphaQuality = 90;
      const buf = await sharp(full).resize({ width: w, withoutEnlargement: true })
                        .webp(opts).toBuffer();
      const name = stem + '-' + w + '.webp';
      fs.writeFileSync(path.join(SRC, name), buf);
      after += buf.length;
      const h = Math.round(meta.height * (w / meta.width));
      manifest[stem].variants.push({ file: name, w, h, bytes: buf.length });
      line.push(w + 'w ' + (buf.length / 1024).toFixed(0) + 'KB');

      if (spec.avif) {
        const av = await sharp(full).resize({ width: w, withoutEnlargement: true })
                         .avif({ quality: AVIF_QUALITY, effort: 4 }).toBuffer();
        const avName = stem + '-' + w + '.avif';
        fs.writeFileSync(path.join(SRC, avName), av);
        after += av.length;
        manifest[stem].variants.push({ file: avName, w, h, bytes: av.length });
        line[line.length - 1] += '/' + (av.length / 1024).toFixed(0) + 'KB avif';
      }
    }
    console.log(('  ' + stem).padEnd(30)
      + String(meta.width + 'x' + meta.height).padEnd(11)
      + (srcBytes / 1024).toFixed(0).padStart(5) + 'KB  ->  ' + line.join(' , ')
      + (meta.width < Math.max.apply(null, spec.widths) ? '   << source caps at ' + meta.width + 'w' : ''));
  }

  fs.writeFileSync(path.join(SRC, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\n  masters ' + (before / 1024 / 1024).toFixed(2) + 'MB  ->  variants '
    + (after / 1024 / 1024).toFixed(2) + 'MB   (masters are not uploaded)');
})();
