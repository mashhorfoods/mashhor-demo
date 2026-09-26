#!/usr/bin/env node
/* Renders the logo-free brand images with headless Chromium:
     assets/brand/share-card.jpg   1200x630 link-preview card (og:image / twitter:image)
     assets/brand/icon-32.png      browser-tab icon
     assets/brand/icon-180.png     home-screen (apple-touch) icon
   The card is the home hero photo with the site name set as plain text; the
   icons are a red tile with the plane glyph from the icon sprite. Nothing here
   is a logo, so a buyer only has to edit the text below (or swap the files).

   node tools/build-brand-images.mjs   (CHROMIUM=/path/to/chromium optional) */
import { launch, renderTo } from './lib/browser.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const b64 = (p) => readFileSync(join(ROOT, p)).toString('base64');

const RED = '#E00000';
const PLANE = '<path d="M10.5 19.5 12 21l1.5-1.5"/><path d="M21 13.5v-2l-7-4V4a2 2 0 1 0-4 0v3.5l-7 4v2l7-2v4l-2 1.5v1.5l4-1 4 1V17l-2-1.5v-4Z"/>';
const fonts = [400, 600, 700].map((w) => `
  @font-face { font-family: Plex; font-weight: ${w};
    src: url(data:font/woff2;base64,${b64(`assets/fonts/ibm-plex-sans-arabic-arabic-${w}.woff2`)}) format('woff2');
    unicode-range: U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF; }
  @font-face { font-family: Plex; font-weight: ${w};
    src: url(data:font/woff2;base64,${b64(`assets/fonts/ibm-plex-sans-arabic-latin-${w}.woff2`)}) format('woff2'); }`).join('');

const card = `<!doctype html><meta charset="utf-8"><style>${fonts}
  * { margin: 0; box-sizing: border-box; }
  body { inline-size: 1200px; block-size: 630px; overflow: hidden; font-family: Plex, sans-serif; color: #fff;
    background: #111 url(data:image/webp;base64,${b64('assets/images/home/hero.webp')}) center / cover; }
  .shade { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center;
    padding: 0 88px; gap: 18px;
    background: linear-gradient(90deg, rgba(10,10,14,.86) 0%, rgba(10,10,14,.66) 48%, rgba(10,10,14,.12) 100%); }
  .bar { inline-size: 72px; block-size: 6px; background: ${RED}; border-radius: 3px; }
  .ar { font-size: 78px; font-weight: 700; line-height: 1.15; direction: rtl; align-self: flex-start; }
  .en { font-size: 44px; font-weight: 600; letter-spacing: .01em; }
  .tag { font-size: 28px; font-weight: 400; opacity: .9; margin-block-start: 10px; }
  .tag-ar { font-size: 28px; font-weight: 400; opacity: .9; direction: rtl; align-self: flex-start; }
</style><div class="shade">
  <div class="bar"></div>
  <div class="ar">السفر والسياحة</div>
  <div class="en">Travel &amp; Tourism</div>
  <div class="tag">Flights · Visas · Hotels · Packages — wherever you are</div>
  <div class="tag-ar">طيران · تأشيرات · فنادق · باقات — أينما كنت</div>
</div>`;

const icon = (size) => `<!doctype html><style>* { margin: 0; }
  body { inline-size: ${size}px; block-size: ${size}px; background: transparent; }
  div { inline-size: 100%; block-size: 100%; background: ${RED}; border-radius: ${size >= 64 ? 0 : Math.round(size * 0.22)}px;
    display: grid; place-items: center; }
  svg { inline-size: ${Math.round(size * 0.66)}px; block-size: ${Math.round(size * 0.66)}px; }
</style><div><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="${size >= 64 ? 1.6 : 2.2}"
  stroke-linecap="round" stroke-linejoin="round">${PLANE}</svg></div>`;

const browser = await launch();
await renderTo(browser, card, 1200, 630, join(ROOT, 'assets/brand/share-card.jpg'), 'jpeg', 86);
await renderTo(browser, icon(32), 32, 32, join(ROOT, 'assets/brand/icon-32.png'), 'png');
await renderTo(browser, icon(180), 180, 180, join(ROOT, 'assets/brand/icon-180.png'), 'png');
await browser.close();
