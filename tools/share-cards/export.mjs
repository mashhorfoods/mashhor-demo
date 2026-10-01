// Pixora's social media kit, every format from one layout:
//
//   brand/kit/<group>/<name>.png   ready to upload
//   brand/kit/<group>/<name>.pdf   editable (live text, embedded fonts)
//   brand/kit/<group>/<name>.svg   editable: every text a <text> in Cairo /
//                                  Poppins (fonts embedded, so it shows right
//                                  anywhere), every photo its own image,
//                                  icons as vectors, the glow and grid one
//                                  background image
//   brand/canva/<group>/<name>.html + its layers   for Canva's import from
//                                  URL (raw.githubusercontent.com, REF=<sha>,
//                                  default main: commit and push first)
//
// Groups: profile (1080×1080), covers (Facebook, X, LinkedIn, YouTube),
// videos (the brand film's cover, 1080×1920),
// instagram-highlights (1080×1920), instagram-posts (1080×1350).
// Designs: social.html (?k=…) and instagram.html (?p=…).
//
//   node tools/share-cards/export.mjs   (CHROMIUM=/path/to/chrome if needed)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const REF = process.env.REF || 'main';
const RAW = `https://raw.githubusercontent.com/mashhorfoods/mashhor-demo/${REF}`;
const social = (k, w, h, title) => ({ source: 'social.html', q: `k=${k}`, w, h, title });
const DESIGNS = {
  profile: {
    'profile': social('profile', 1080, 1080, 'Profile picture'),
    'profile-yellow': social('profile-yellow', 1080, 1080, 'Profile picture (yellow)'),
  },
  covers: {
    'cover-facebook': social('facebook', 1640, 624, 'Facebook cover'),
    'cover-x': social('x', 1500, 500, 'X cover'),
    'cover-linkedin': social('linkedin', 1128, 191, 'LinkedIn cover'),
    'cover-youtube': social('youtube', 2560, 1440, 'YouTube banner'),
  },
  videos: {
    'reel-cover': social('reel-cover', 1080, 1920, 'Brand film cover'),
  },
  'instagram-highlights': Object.fromEntries(['work', 'branding', 'websites', 'social', 'ads', 'contact'].map((k) =>
    [`highlight-${k}`, social(`highlight-${k}`, 1080, 1920, `Instagram highlight — ${k}`)])),
  'instagram-posts': Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
    [`post-0${n}`, { source: 'instagram.html', q: `p=${n}`, w: 1080, h: 1350, title: `Instagram post 0${n}` }])),
};
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

const FONTS = [['Cairo', 500, 'Cairo-Medium'], ['Cairo', 700, 'Cairo-Bold'], ['Cairo', 800, 'Cairo-ExtraBold'],
  ['Poppins', 500, 'Poppins-Medium'], ['Poppins', 600, 'Poppins-SemiBold'], ['Poppins', 700, 'Poppins-Bold']];
const fontFaces = FONTS.map(([f, w, file]) =>
  `@font-face{font-family:${f};font-weight:${w};src:url(data:font/ttf;base64,${readFileSync(path.join(here, 'fonts', `${file}.ttf`)).toString('base64')}) format('truetype')}`).join('');
// Descent of each face (hhea, as a share of the size): the baseline sits that
// far above the bottom of a line's text box.
const DESCENT = { Cairo: 0.571, Poppins: 0.35 };

const esc = (s) => s.replace(/&(?!amp;|lt;|gt;|quot;|nbsp;|#)/g, '&amp;');
const b64 = (file) => readFileSync(file).toString('base64');

// ---------------------------------------------------------------------------
// Read the layout: every text (by line, with its colours), photo, pill and
// icon, where the browser put it.
function readLayout() {
  const px = (v) => Math.round(v * 10) / 10;
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: px(r.left), y: px(r.top), w: px(r.width), h: px(r.height) }; };
  const style = (el) => {
    const s = getComputedStyle(el);
    return { font: s.fontFamily.split(',')[0].replace(/"/g, '').trim(), size: parseFloat(s.fontSize), weight: s.fontWeight, color: s.color,
      spacing: s.letterSpacing === 'normal' ? 0 : parseFloat(s.letterSpacing), line: s.lineHeight, dir: s.direction,
      align: s.textAlign === 'start' ? (s.direction === 'rtl' ? 'right' : 'left') : s.textAlign };
  };
  // The text's lines: client rects of its text, grouped by line.
  const linesOf = (el, nodes) => {
    const rects = [];
    for (const n of nodes) {
      const r = document.createRange(); r.selectNodeContents(n);
      for (const c of r.getClientRects()) if (c.width > 0.5) rects.push(c);
    }
    const groups = [];
    for (const c of rects.sort((a, b) => a.top - b.top)) {
      const g = groups.find((g) => Math.abs(g.mid - (c.top + c.height / 2)) < c.height / 3);
      if (g) { g.rects.push(c); } else groups.push({ mid: c.top + c.height / 2, rects: [c] });
    }
    return groups.map((g) => ({ left: px(Math.min(...g.rects.map((r) => r.left))), right: px(Math.max(...g.rects.map((r) => r.right))),
      bottom: px(Math.max(...g.rects.map((r) => r.bottom))), top: px(Math.min(...g.rects.map((r) => r.top))) }));
  };
  const texts = [];
  const add = (el, html, nodes) => {
    const segments = html.split(/<br\s*\/?>/i);
    const lines = linesOf(el, nodes || [el]);
    texts.push({ ...box(el), ...style(el), html, segments, lines });
  };
  document.querySelectorAll('.word, .sub, .promise, .en, .x, .t:not(.services)').forEach((el) => add(el, el.innerHTML.trim()));
  // The services line: its words, with the yellow dots between them.
  const services = [];
  document.querySelectorAll('.services').forEach((el) => {
    const words = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    services.push({ ...box(el), ...style(el),
      html: words.map((n) => n.textContent).join('<span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>'),
      words: words.map((n) => ({ text: n.textContent, line: linesOf(el, [n])[0] })),
      lines: linesOf(el, words),
      dots: [...el.querySelectorAll('i')].map((i) => { const b = box(i); return { cx: px(b.x + b.w / 2), cy: px(b.y + b.h / 2), r: px(b.w / 2) }; }) });
  });
  // A badge: its words are text; its pill is a layer.
  document.querySelectorAll('.badge').forEach((el) => {
    const nodes = [...el.childNodes].filter((n) => n.nodeType === 3);
    texts.push({ ...style(el), ...box(el), html: el.textContent.trim(), segments: [el.textContent.trim()], lines: linesOf(el, nodes), badge: true });
  });
  const prints = [...document.querySelectorAll('.print')].map((f) => {
    const parent = f.offsetParent.getBoundingClientRect();
    const s = getComputedStyle(f);
    const img = f.querySelector('img');
    // Embedded at twice the size it is shown: sharp, and a fraction of the file.
    const scale = Math.min(1, (2 * f.offsetWidth) / img.naturalWidth);
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { x: px(parent.left + f.offsetLeft), y: px(parent.top + f.offsetTop), w: px(f.offsetWidth), h: px(f.offsetHeight),
      rotate: s.rotate === 'none' ? 0 : parseFloat(s.rotate), radius: parseFloat(s.borderRadius), z: s.zIndex === 'auto' ? 1 : +s.zIndex,
      src: img.getAttribute('src'), pos: getComputedStyle(img).objectPosition, jpeg: c.toDataURL('image/jpeg', 0.9) };
  });
  const pills = [...document.querySelectorAll('.badge')].map(box);
  const icons = [...document.querySelectorAll('svg.icon')].map((el) => ({ ...box(el), d: el.querySelector('path').getAttribute('d'),
    stroke: getComputedStyle(el).stroke, width: getComputedStyle(el).strokeWidth }));
  const rule = document.querySelector('.text .rule');
  return { texts, services, prints, pills, icons, rule: rule ? box(rule) : null, bg: getComputedStyle(document.body).backgroundColor };
}

// ---------------------------------------------------------------------------
// SVG.
const colourSpans = (html) => {
  // Text and its yellow runs (<span>, <b>), as tspans.
  const out = [];
  const re = /<(span|b)[^>]*>(.*?)<\/\1>/gi;
  let at = 0, m;
  while ((m = re.exec(html))) {
    if (m.index > at) out.push({ text: html.slice(at, m.index), accent: false });
    out.push({ text: m[2], accent: true });
    at = m.index + m[0].length;
  }
  if (at < html.length) out.push({ text: html.slice(at), accent: false });
  return out.filter((r) => r.text.length);
};
const anchorOf = (t, line) => (t.align === 'right' ? { x: line.right, anchor: t.dir === 'rtl' ? 'start' : 'end' }
  : t.align === 'center' ? { x: (line.left + line.right) / 2, anchor: 'middle' }
  : { x: line.left, anchor: t.dir === 'rtl' ? 'end' : 'start' });
const svgText = (t, segment, line) => {
  const baseline = Math.round((line.bottom - (DESCENT[t.font] ?? 0.4) * t.size) * 10) / 10;
  const { x, anchor } = anchorOf(t, line);
  const runs = colourSpans(segment.trim()).map((r) => r.accent ? `<tspan fill="#f4d13f">${esc(r.text)}</tspan>` : esc(r.text)).join('');
  return `  <text x="${x}" y="${baseline}" direction="${t.dir}" text-anchor="${anchor}" font-family="${t.font}, ${t.font === 'Cairo' ? 'Poppins' : 'Cairo'}" font-size="${t.size}" font-weight="${t.weight}" fill="${t.color}"${t.spacing ? ` letter-spacing="${t.spacing}"` : ''} xml:space="preserve">${runs}</text>`;
};
function buildSvg(d, layout, files) {
  const { w, h } = d;
  const parts = [];
  parts.push(`  <image href="data:image/png;base64,${b64(files.background)}" x="0" y="0" width="${w}" height="${h}"/>`);
  for (const [i, p] of [...layout.prints].sort((a, b) => a.z - b.z).entries()) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    parts.push(`  <g transform="rotate(${p.rotate} ${cx} ${cy})" filter="url(#shadow)">
    <clipPath id="print-${i}"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.radius}"/></clipPath>
    <image href="${p.jpeg}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#print-${i})"/>
  </g>`);
  }
  for (const [i, b] of layout.pills.entries()) {
    parts.push(`  <image href="data:image/png;base64,${b64(files.pills[i])}" x="${b.x - 2}" y="${b.y - 2}" width="${b.w + 4}" height="${b.h + 4}"/>`);
  }
  for (const ic of layout.icons) {
    parts.push(`  <svg x="${ic.x}" y="${ic.y}" width="${ic.w}" height="${ic.h}" viewBox="0 0 24 24"><path d="${ic.d}" fill="none" stroke="${ic.stroke}" stroke-width="${parseFloat(ic.width)}" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
  }
  if (layout.rule) parts.push(`  <rect x="${layout.rule.x}" y="${layout.rule.y}" width="${layout.rule.w}" height="${layout.rule.h}" fill="rgba(244,209,63,.45)"/>`);
  for (const t of layout.texts) {
    if (t.segments.length !== t.lines.length) throw new Error(`${d.title}: "${t.html.slice(0, 40)}" has ${t.segments.length} parts but ${t.lines.length} lines`);
    t.segments.forEach((s, i) => parts.push(svgText(t, s, t.lines[i])));
  }
  for (const s of layout.services) {
    s.words.forEach((wd) => parts.push(svgText(s, wd.text, wd.line)));
    s.dots.forEach((dt) => parts.push(`  <circle cx="${dt.cx}" cy="${dt.cy}" r="${dt.r}" fill="#f4d13f"/>`));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <title>Pixora — ${d.title}</title>
  <defs>
    <style>${fontFaces}</style>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="${Math.round(h * 0.03)}" stdDeviation="${Math.round(h * 0.025)}" flood-color="#000" flood-opacity=".6"/></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="${layout.bg}"/>
${parts.join('\n')}
</svg>
`;
}

// ---------------------------------------------------------------------------
// Canva: each text whole (its lines kept), at a standard line height where
// it is one line (Canva keeps a line at least as tall as its type).
function buildCanva(d, group, name, layout) {
  const { w, h } = d;
  const url = (f) => `${RAW}/brand/canva/${group}/${f}`;
  const textEl = (t) => {
    const one = t.lines.length <= 1;
    const y = one ? Math.round((t.y + t.h / 2 - t.size * 0.6) * 10) / 10 : t.y;
    const line = one ? `${Math.round(t.size * 1.2 * 10) / 10}px` : t.line;
    const html = t.html.replace(/<b>|<span>/g, '<span style="color:#f4d13f">').replace(/<\/b>/g, '</span>');
    const x = t.badge ? Math.min(...t.lines.map((l) => l.left)) : t.x;
    const width = t.badge ? Math.max(...t.lines.map((l) => l.right)) - x : t.w;
    const top = t.badge ? Math.round(((t.lines[0].top + t.lines[0].bottom) / 2 - t.size * 0.6) * 10) / 10 : y;
    return `    <p style="position:absolute;z-index:10;left:${x - 2}px;top:${top}px;width:${width + 4}px;margin:0;white-space:nowrap;font-family:'${t.font}';font-size:${t.size}px;font-weight:${t.weight};color:${t.color};letter-spacing:${t.spacing}px;line-height:${line};direction:${t.dir};text-align:${t.align}">${html}</p>`;
  };
  const imgs = [...layout.prints].sort((a, b) => a.z - b.z).map((p) => `    <img src="${RAW}/${p.src.replace(/^\.\.\/\.\.\//, '')}" alt="" style="position:absolute;left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px;object-fit:cover;object-position:${p.pos};border-radius:${p.radius}px;transform:rotate(${p.rotate}deg);z-index:${p.z}">`);
  const layers = [...layout.pills.map((b, i) => ({ ...b, file: `${name}-pill-${i + 1}.png`, pad: 2 })),
    ...layout.icons.map((b, i) => ({ ...b, file: `${name}-icon-${i + 1}.png`, pad: 0 }))]
    .map((b) => `    <img src="${url(b.file)}" alt="" style="position:absolute;left:${b.x - b.pad}px;top:${b.y - b.pad}px;width:${b.w + 2 * b.pad}px;height:${b.h + 2 * b.pad}px;z-index:9">`);
  const rule = layout.rule ? [`    <div style="position:absolute;left:${layout.rule.x}px;top:${layout.rule.y}px;width:${layout.rule.w}px;height:${layout.rule.h}px;background:rgba(244,209,63,.45)"></div>`] : [];
  const texts = [...layout.texts, ...layout.services].map(textEl);
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>Pixora — ${d.title}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800&family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}body{margin:0;background:#555}</style>
</head>
<body>
  <div data-document-role="page" data-label="Pixora — ${d.title}" style="position:relative;width:${w}px;height:${h}px;overflow:hidden;background:${layout.bg}">
    <img src="${url(`${name}-background.png`)}" alt="" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px">
${[...imgs, ...layers, ...rule, ...texts].join('\n')}
  </div>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
const browser = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}), args: ['--allow-file-access-from-files'] });
for (const [group, designs] of Object.entries(DESIGNS)) {
  const kit = path.join(root, 'brand', 'kit', group);
  const canva = path.join(root, 'brand', 'canva', group);
  mkdirSync(kit, { recursive: true });
  mkdirSync(canva, { recursive: true });
  for (const [name, d] of Object.entries(designs)) {
    if (only && !only.has(name)) continue;
    const page = await browser.newPage({ viewport: { width: d.w, height: d.h } });
    const load = async () => {
      await page.goto(`file://${path.join(here, d.source)}?${d.q}`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
      await page.waitForTimeout(150);
    };
    await load();
    await page.screenshot({ path: path.join(kit, `${name}.png`) });
    const layout = await page.evaluate(readLayout);
    // For the PDF, each photo as a JPEG at twice its shown size (Chromium would
    // otherwise embed the full image, uncompressed). The PNG above is untouched.
    await page.evaluate(() => Promise.all([...document.images].map((img) => {
      const scale = Math.min(1, (2 * img.getBoundingClientRect().width) / img.naturalWidth);
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return new Promise((r) => { img.onload = r; img.src = c.toDataURL('image/jpeg', 0.88); });
    })));
    await page.pdf({ path: path.join(kit, `${name}.pdf`), width: `${d.w}px`, height: `${d.h}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, pageRanges: '1' });
    await load();

    // The background: the glow, grid and guides, nothing else. A .t only
    // loses its letters, so lines it draws itself (the eyebrow's) stay.
    await page.addStyleTag({ content: '.text,.print,.x,.badge,.icon,.services i,.text .rule{visibility:hidden!important}.t,.t *{color:transparent!important}' });
    await page.waitForTimeout(80);
    const files = { background: path.join(canva, `${name}-background.png`), pills: [] };
    await page.screenshot({ path: files.background });
    // Layers on a transparent page: each pill, each icon.
    if (layout.pills.length || layout.icons.length) {
      await load();
      await page.addStyleTag({ content: 'html,body{background:transparent!important}body *{visibility:hidden!important}.badge{visibility:visible!important;color:transparent!important}' });
      for (const [i, b] of layout.pills.entries()) {
        const f = path.join(canva, `${name}-pill-${i + 1}.png`);
        await page.screenshot({ path: f, omitBackground: true, clip: { x: b.x - 2, y: b.y - 2, width: b.w + 4, height: b.h + 4 } });
        files.pills.push(f);
      }
      await load();
      await page.addStyleTag({ content: 'html,body{background:transparent!important}body *{visibility:hidden!important}.icon,.icon *{visibility:visible!important}' });
      for (const [i, b] of layout.icons.entries()) {
        await page.screenshot({ path: path.join(canva, `${name}-icon-${i + 1}.png`), omitBackground: true, clip: { x: b.x, y: b.y, width: b.w, height: b.h } });
      }
    }
    writeFileSync(path.join(kit, `${name}.svg`), buildSvg(d, layout, files));
    writeFileSync(path.join(canva, `${name}.html`), buildCanva(d, group, name, layout));
    console.log(`${group}/${name}: png pdf svg canva — ${layout.texts.length + layout.services.length} texts, ${layout.prints.length} photos`);
    await page.close();
  }
}
// The Instagram grid as the profile shows it: newest (09) first, each post
// cropped to 3:4.
if (!only) {
  const posts = path.join(root, 'brand', 'kit', 'instagram-posts');
  const cells = [9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => `<div style="width:360px;height:480px;overflow:hidden"><img src="file://${posts}/post-0${n}.png" style="width:384px;height:480px;margin-left:-12px;display:block"></div>`).join('');
  const grid = path.join(posts, '.grid.html');
  writeFileSync(grid, `<body style="margin:0;background:#fff;display:grid;grid-template-columns:repeat(3,360px);gap:4px;width:1088px">${cells}</body>`);
  const gp = await browser.newPage({ viewport: { width: 1088, height: 1448 } });
  await gp.goto(`file://${grid}`);
  await gp.waitForTimeout(400);
  await gp.screenshot({ path: path.join(posts, 'grid-preview.png') });
  rmSync(grid);
  console.log('instagram-posts/grid-preview.png');
}
await browser.close();
