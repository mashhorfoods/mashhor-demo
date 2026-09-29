// Interim covers for the five services (2400×1500, 16:10): each service's own
// line drawing from the supplied site, large, in the site's charcoal and gold,
// under one warm light. They hold the design until the real cover images
// arrive — drop those in as overlay/assets/svc-<id>.webp and do not re-run this.
//
//   node tools/service-covers/render.mjs      (CHROMIUM=/path/to/chrome if needed)
//
// Writes PNGs to tools/service-covers/out/; tools/service-covers/encode.sh
// turns them into overlay/assets/svc-<id>.webp.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, '..', '..', 'source', 'index.html'), 'utf8');
const SERVICES = ['branding', 'websites', 'social', 'marketing', 'integrated'];
const out = path.join(here, 'out');
mkdirSync(out, { recursive: true });

const svgOf = (id) => {
  const at = source.indexOf(`id="service-${id}"`);
  const from = source.indexOf('<svg', source.indexOf('c-service__visual', at));
  return source.slice(from, source.indexOf('</svg>', from) + 6);
};

const page = (svg) => `<!doctype html><html><head><meta charset="utf-8"><style>
  :root { --color-accent: #f4d13f; }
  html, body { margin: 0; width: 2400px; height: 1500px; overflow: hidden; background: #141414; }
  .stage { position: relative; width: 100%; height: 100%; color: #d9d4c7;
    background:
      radial-gradient(60% 70% at 50% 42%, rgba(244, 209, 63, 0.16), rgba(244, 209, 63, 0) 60%),
      radial-gradient(90% 90% at 50% 50%, #262626 0%, #1a1a1a 55%, #111 100%); }
  .grid { position: absolute; inset: 0; opacity: 0.07;
    background-image: linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px);
    background-size: 120px 120px; mask-image: radial-gradient(55% 60% at 50% 48%, #000, transparent); }
  .beam { position: absolute; left: 50%; top: -10%; width: 900px; height: 120%; translate: -50% 0;
    background: linear-gradient(180deg, rgba(255, 236, 170, 0.12), rgba(255, 236, 170, 0) 70%);
    clip-path: polygon(42% 0, 58% 0, 100% 100%, 0 100%); filter: blur(30px); }
  .art { position: absolute; left: 50%; top: 47%; width: 1040px; translate: -50% -50%;
    filter: drop-shadow(0 0 28px rgba(244, 209, 63, 0.22)) drop-shadow(0 40px 60px rgba(0, 0, 0, 0.6)); }
  .art svg { width: 100%; height: auto; overflow: visible; fill: none; }
  .floor { position: absolute; left: 50%; top: 80%; width: 1300px; height: 120px; translate: -50% -50%;
    background: radial-gradient(50% 50% at 50% 50%, rgba(244, 209, 63, 0.18), transparent 70%); filter: blur(12px); }
  .grain { position: absolute; inset: 0; opacity: 0.09; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
  .vignette { position: absolute; inset: 0; background: radial-gradient(80% 80% at 50% 50%, transparent 55%, rgba(0, 0, 0, 0.55)); }
</style></head><body><div class="stage"><div class="grid"></div><div class="beam"></div><div class="floor"></div>
<div class="art">${svg}</div><div class="grain"></div><div class="vignette"></div></div></body></html>`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await browser.newPage({ viewport: { width: 2400, height: 1500 } });
for (const id of SERVICES) {
  await p.setContent(page(svgOf(id)));
  await p.screenshot({ path: path.join(out, `svc-${id}.png`) });
  console.log(`svc-${id}.png`);
}
await browser.close();
