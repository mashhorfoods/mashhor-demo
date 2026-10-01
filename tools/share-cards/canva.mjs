// Canva versions of the social media designs (social.html), one HTML page
// per design in brand/canva/, for Canva's "import from URL": every text a
// real, editable text box (Arabic stays Arabic), every work image its own
// image, and the glow and grid behind them one background image. Canva has
// Cairo and Poppins, so the type comes through as it is.
//
//   node tools/share-cards/canva.mjs   (CHROMIUM=/path/to/chrome if needed)
//
// The pages name their images by public URL (raw.githubusercontent.com at
// the commit given as REF=<sha>, default main), so commit and push first.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', 'brand', 'canva');
mkdirSync(out, { recursive: true });
const REF = process.env.REF || 'main';
const RAW = `https://raw.githubusercontent.com/mashhorfoods/mashhor-demo/${REF}`;
const KINDS = { profile: [1080, 1080], 'profile-yellow': [1080, 1080], facebook: [1640, 624], x: [1500, 500], linkedin: [1128, 191], youtube: [2560, 1440] };
const TITLES = { profile: 'Profile', 'profile-yellow': 'Profile (yellow)', facebook: 'Facebook cover', x: 'X cover', linkedin: 'LinkedIn cover', youtube: 'YouTube banner' };

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
for (const [k, [width, height]] of Object.entries(KINDS)) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`file://${path.join(here, 'social.html')}?k=${k}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));

  // Everything that becomes its own Canva element, read from the layout.
  const parts = await page.evaluate(() => {
    const px = (v) => Math.round(v * 10) / 10;
    const css = (el, extra = {}) => {
      const s = getComputedStyle(el);
      return { font: s.fontFamily.split(',')[0].replace(/"/g, ''), size: parseFloat(s.fontSize), weight: s.fontWeight, color: s.color,
        spacing: s.letterSpacing, line: s.lineHeight, dir: s.direction, align: s.textAlign, ...extra };
    };
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: px(r.left), y: px(r.top), w: px(r.width), h: px(r.height) }; };
    const texts = [];
    const add = (el, html) => el && texts.push({ ...box(el), ...css(el), html: html ?? el.innerHTML });
    for (const sel of ['.word', '.sub', '.promise', '.en', '.x']) document.querySelectorAll(sel).forEach((el) => add(el));
    // The badge: just its words, where they sit inside the pill.
    document.querySelectorAll('.badge').forEach((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      texts.push({ x: px(r.left), y: px(r.top), w: px(r.width), h: px(r.height), ...css(el), html: el.textContent });
    });
    // The services line: one text, the dots as yellow bullets.
    document.querySelectorAll('.services').forEach((el) =>
      add(el, [...el.childNodes].map((n) => (n.nodeType === 3 ? n.textContent : '<span style="color:#f4d13f">&nbsp;&nbsp;•&nbsp;&nbsp;</span>')).join('')));
    // The prints: their unrotated box (layout offsets) and their rotation.
    const prints = [...document.querySelectorAll('.print')].map((f) => {
      const parent = f.offsetParent.getBoundingClientRect();
      const s = getComputedStyle(f);
      return { x: px(parent.left + f.offsetLeft), y: px(parent.top + f.offsetTop), w: px(f.offsetWidth), h: px(f.offsetHeight),
        rotate: s.rotate === 'none' ? '0deg' : s.rotate, radius: s.borderRadius, z: s.zIndex, src: f.querySelector('img').getAttribute('src'),
        pos: getComputedStyle(f.querySelector('img')).objectPosition };
    });
    const rule = document.querySelector('.rule');
    return { texts, prints, rule: rule ? box(rule) : null, bg: getComputedStyle(document.body).backgroundColor };
  });

  // The background: the same page with the texts and prints hidden.
  // The badge keeps its pill there; only its words become text.
  await page.addStyleTag({ content: '.text,.print,.x{visibility:hidden!important}.badge{color:transparent!important}' });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(out, `${k}-background.png`) });

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  // Canva keeps a line at least as tall as its type, so a tight line (the
  // wordmark's .9) would drop. Single lines get a standard 1.2, placed so the
  // line's centre stays where it was.
  const norm = (t) => (t.html.includes('<br>') ? t : { ...t, y: Math.round((t.y + t.h / 2 - t.size * 0.6) * 10) / 10, line: `${Math.round(t.size * 1.2 * 10) / 10}px` });
  const textEl = (t0) => { const t = norm(t0); return `    <p style="position:absolute;left:${t.x - 2}px;top:${t.y}px;width:${t.w + 4}px;margin:0;white-space:nowrap;font-family:'${t.font}';font-size:${t.size}px;font-weight:${t.weight};color:${t.color};letter-spacing:${t.spacing};line-height:${t.line};direction:${t.dir};text-align:${t.align === 'start' ? (t.dir === 'rtl' ? 'right' : 'left') : t.align}">${t.html.replace(/<b>|<span>/g, '<span style="color:#f4d13f">').replace(/<\/b>/g, '</span>')}</p>`; };
  const imgEl = (p) => `    <img src="${RAW}/${p.src.replace(/^\.\.\/\.\.\//, '')}" alt="" style="position:absolute;left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px;object-fit:cover;object-position:${p.pos};border-radius:${p.radius};transform:rotate(${p.rotate});z-index:${p.z === 'auto' ? 1 : p.z}">`;
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>Pixora — ${TITLES[k]}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800&family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}body{margin:0;background:#555}</style>
</head>
<body>
  <div data-document-role="page" data-label="Pixora — ${esc(TITLES[k])}" style="position:relative;width:${width}px;height:${height}px;overflow:hidden;background:${parts.bg}">
    <img src="${RAW}/brand/canva/${k}-background.png" alt="" style="position:absolute;left:0;top:0;width:${width}px;height:${height}px">
${parts.prints.map(imgEl).join('\n')}
${parts.rule ? `    <div style="position:absolute;left:${parts.rule.x}px;top:${parts.rule.y}px;width:${parts.rule.w}px;height:${parts.rule.h}px;background:rgba(244,209,63,.45)"></div>\n` : ''}${parts.texts.map(textEl).join('\n')}
  </div>
</body>
</html>
`;
  writeFileSync(path.join(out, `${k}.html`), html);
  console.log(`brand/canva/${k}.html (+ ${k}-background.png): ${parts.texts.length} texts, ${parts.prints.length} images`);
  await page.close();
}
await browser.close();
