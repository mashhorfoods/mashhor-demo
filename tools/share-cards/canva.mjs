// Canva versions of the social media designs (social.html → brand/canva/)
// and of the Instagram posts (SET=instagram: instagram.html →
// brand/canva/instagram/), one HTML page per design, for Canva's "import from URL": every text a
// real, editable text box (Arabic stays Arabic), every work image its own
// image, and the glow and grid behind them one background image. Canva has
// Cairo and Poppins, so the type comes through as it is.
//
//   [SET=instagram] node tools/share-cards/canva.mjs   (CHROMIUM=/path/to/chrome if needed)
//
// The pages name their images by public URL (raw.githubusercontent.com at
// the commit given as REF=<sha>, default main), so commit and push first.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const SETS = {
  social: { source: 'social.html', query: 'k', dir: 'brand/canva',
    kinds: { profile: [1080, 1080], 'profile-yellow': [1080, 1080], facebook: [1640, 624], x: [1500, 500], linkedin: [1128, 191], youtube: [2560, 1440] },
    titles: { profile: 'Profile', 'profile-yellow': 'Profile (yellow)', facebook: 'Facebook cover', x: 'X cover', linkedin: 'LinkedIn cover', youtube: 'YouTube banner' } },
  instagram: { source: 'instagram.html', query: 'p', dir: 'brand/canva/instagram',
    kinds: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), [1080, 1350]])),
    titles: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), `Instagram post 0${n}`])) },
};
const SET = SETS[process.env.SET || 'social'];
const out = path.join(here, '..', '..', SET.dir);
mkdirSync(out, { recursive: true });
const REF = process.env.REF || 'main';
const RAW = `https://raw.githubusercontent.com/mashhorfoods/mashhor-demo/${REF}`;
const KINDS = SET.kinds;
const TITLES = SET.titles;
const fileOf = (k) => (SET.query === 'p' ? `post-0${k}` : k);

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
for (const [k, [width, height]] of Object.entries(KINDS)) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`file://${path.join(here, SET.source)}?${SET.query}=${k}`);
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
    const lines = (el) => { const r = document.createRange(); r.selectNodeContents(el);
      return new Set([...r.getClientRects()].filter((c) => c.width > 1).map((c) => Math.round(c.top + c.height / 2) >> 3)).size; };
    const add = (el, html) => el && texts.push({ ...box(el), ...css(el), lines: lines(el), html: html ?? el.innerHTML });
    document.querySelectorAll('.word, .sub, .promise, .en, .x, .t:not(.services)').forEach((el) => add(el));
    // The badge: just its words, where they sit inside the pill.
    document.querySelectorAll('.badge').forEach((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      texts.push({ x: px(r.left), y: px(r.top), w: px(r.width), h: px(r.height), ...css(el), lines: 1, html: el.textContent });
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
    // A rule inside the text (LinkedIn's divider) moves with it; other rules stay in the background.
    const rule = document.querySelector('.text .rule');
    const pills = [...document.querySelectorAll('.badge')].map(box);
    return { texts, prints, pills, rule: rule ? box(rule) : null, bg: getComputedStyle(document.body).backgroundColor };
  });

  // The background: the glow and grid, without the texts, prints and pills.
  // A .t only loses its letters, so lines it draws itself (the eyebrow's) stay.
  await page.addStyleTag({ content: '.text,.print,.x,.badge,.services i{visibility:hidden!important}.t,.t *{color:transparent!important}' });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(out, `${fileOf(k)}-background.png`) });
  // Each badge's pill as its own transparent image (it may sit over a
  // photo); its words are text. A fresh load, with only the pills showing.
  if (parts.pills.length) {
    await page.goto(`file://${path.join(here, SET.source)}?${SET.query}=${k}`);
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: 'html,body{background:transparent!important}body *{visibility:hidden!important}.badge{visibility:visible!important;color:transparent!important}' });
    await page.waitForTimeout(100);
    for (const [i, b] of parts.pills.entries()) {
      await page.screenshot({ path: path.join(out, `${fileOf(k)}-pill-${i + 1}.png`), omitBackground: true, clip: { x: b.x - 2, y: b.y - 2, width: b.w + 4, height: b.h + 4 } });
    }
  }

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  // Canva keeps a line at least as tall as its type, so a tight line (the
  // wordmark's .9) would drop. Single lines get a standard 1.2, placed so the
  // line's centre stays where it was.
  const norm = (t) => (t.lines > 1 ? t : { ...t, y: Math.round((t.y + t.h / 2 - t.size * 0.6) * 10) / 10, line: `${Math.round(t.size * 1.2 * 10) / 10}px` });
  const textEl = (t0) => { const t = norm(t0); return `    <p style="position:absolute;z-index:10;left:${t.x - 2}px;top:${t.y}px;width:${t.w + 4}px;margin:0;white-space:nowrap;font-family:'${t.font}';font-size:${t.size}px;font-weight:${t.weight};color:${t.color};letter-spacing:${t.spacing};line-height:${t.line};direction:${t.dir};text-align:${t.align === 'start' ? (t.dir === 'rtl' ? 'right' : 'left') : t.align}">${t.html.replace(/<b>|<span>/g, '<span style="color:#f4d13f">').replace(/<\/b>/g, '</span>')}</p>`; };
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
    <img src="${RAW}/${SET.dir}/${fileOf(k)}-background.png" alt="" style="position:absolute;left:0;top:0;width:${width}px;height:${height}px">
${parts.prints.map(imgEl).join('\n')}
${parts.pills.map((b, i) => `    <img src="${RAW}/${SET.dir}/${fileOf(k)}-pill-${i + 1}.png" alt="" style="position:absolute;left:${b.x - 2}px;top:${b.y - 2}px;width:${b.w + 4}px;height:${b.h + 4}px;z-index:9">`).join('\n')}
${parts.rule ? `    <div style="position:absolute;left:${parts.rule.x}px;top:${parts.rule.y}px;width:${parts.rule.w}px;height:${parts.rule.h}px;background:rgba(244,209,63,.45)"></div>\n` : ''}${parts.texts.map(textEl).join('\n')}
  </div>
</body>
</html>
`;
  writeFileSync(path.join(out, `${fileOf(k)}.html`), html);
  console.log(`${SET.dir}/${fileOf(k)}.html (+ background): ${parts.texts.length} texts, ${parts.prints.length} images`);
  await page.close();
}
await browser.close();
