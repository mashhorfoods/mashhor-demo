// Generates the thin route shells that make each registry record a real
// directory on the static host — services/<slug>/ and offers/<slug>/ — and
// refreshes their blocks in sitemap.xml.
//
// There is no build step for the site; this is a content tool, run once
// after a service or offer is added, renamed or retired:
//
//   node tools/build-routes.mjs
//
// Every shell is identical apart from the slug and its static <title>,
// description and canonical (so search engines see them without script);
// the page itself is drawn at runtime by one template module per
// collection. Do not edit a generated shell by hand — change the template.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SERVICE_REGISTRY } from '../assets/js/data/services.js';
import { OFFER_REGISTRY } from '../assets/js/data/offers.js';
import { DESTINATION_REGISTRY } from '../assets/js/data/destinations.js';
import { SUPERVISOR_REGISTRY, RESERVED_SUPERVISOR_SLUGS } from '../assets/js/data/supervisors.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://mashhorfoods.github.io/mashhor-demo/';
const TODAY = new Date().toISOString().slice(0, 10);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/* One collection = one directory, one template module, one set of mount
   points. `sections` is the list of [data-<attr>="…"] sections the template
   fills; a section without content is hidden by the template. */
const COLLECTIONS = [
  {
    dir: 'services', records: SERVICE_REGISTRY, attr: 'detail', mount: 'mountServiceDetail', module: 'service-detail', handle: 'detail',
    title: (s) => s.titleAr, description: (s) => s.descAr, og: (s) => s.shortAr, heroLabel: 'service-title', current: 'services',
    sections: ['overview', 'features', 'benefits', 'steps', 'requirements', 'related', 'support'],
    noindex: false,
  },
  {
    dir: 'offers', records: OFFER_REGISTRY, attr: 'offer', mount: 'mountOfferDetail', module: 'offers', handle: 'offer',
    title: (o) => o.titleAr, description: (o) => o.shortAr, og: (o) => o.shortAr, heroLabel: 'offer-title', current: 'offers',
    // Full-bleed photo hero with the header tracked transparent over it —
    // the header/hero update brief §03-05. .c-hero--photo alone (no --full)
    // would keep the boxed-card hero height instead of the ~100vh treatment.
    heroClass: 'c-hero--photo c-hero--full',
    sections: ['overview', 'included', 'excluded', 'itinerary', 'important', 'terms', 'faq', 'flow', 'related', 'support'],
    noindex: false,
  },
  {
    // header/hero update brief §01-02/§19 — one reusable destination detail
    // template, generated the same way services/offers already are.
    // DESTINATION_REGISTRY stays the single source; nothing here is a
    // hand-authored per-destination page.
    dir: 'destinations', records: DESTINATION_REGISTRY, attr: 'dest', mount: 'mountDestinationDetail', module: 'destination-detail', handle: 'destination',
    title: (d) => d.nameAr, description: (d) => d.descAr, og: (d) => d.descAr, heroLabel: 'dest-title', current: 'destinations',
    heroClass: 'c-hero--photo c-hero--full',
    sections: ['overview', 'travel', 'services', 'offers', 'support'],
    noindex: false,
  },
  {
    // Stage 10.10 — one public profile per Number One Travel Coordinator (the
    // customer-facing role; internal dir/route/attribution naming stays
    // `supervisor`, unchanged by the coordinator-update task). The static
    // title is neutral until the business supplies the name; the template
    // sets the real one at runtime. Every door on the page carries
    // ?supervisor=<slug>.
    // noindex: false since the five launch profiles (assets/js/data/supervisors.js) now carry real content —
    // DEMO / PLACEHOLDER COORDINATOR DATA, not real employees, but genuinely public per the supervisor-profiles
    // brief §12; do not flip back to true without a reason, and re-check whether the registry still needs it if a
    // future record ever ships genuinely blank again (name/bio null).
    dir: 'supervisor', records: SUPERVISOR_REGISTRY, attr: 'profile', mount: 'mountSupervisor', module: 'supervisor', handle: 'supervisor',
    title: (s) => s.nameAr ?? 'منسق نمبرون', description: (s) => s.bioAr ?? 'منسق رحلات من نمبرون للسفر و السياحة يساعدك على اختيار الخيار المناسب ويتابع حجزك مع فريق نمبرون.',
    og: (s) => s.bioAr ?? 'منسق رحلات من نمبرون للسفر و السياحة.', heroLabel: 'profile-title', current: null,
    search: (s) => `book/?supervisor=${s.slug}`,
    sections: ['about', 'services', 'trust', 'contact', 'discovery'],
    noindex: false,
  },
];

const shell = (c, r) => `<!doctype html>
<html lang="ar" dir="rtl" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- GENERATED by tools/build-routes.mjs — do not edit by hand. Two levels
     down, so <base> points every relative URL at the site root; in-page
     moves go through script, never href="#…". -->
<base href="../../">
<title>${esc(c.title(r))} — نمبرون للسفر و السياحة</title>
<meta name="description" content="${esc(c.description(r))}">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#FE0002">
${c.noindex ? '<meta name="robots" content="noindex">\n' : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Number One Travel &amp; Tourism">
<meta property="og:title" content="${esc(c.title(r))} — نمبرون للسفر و السياحة">
<meta property="og:description" content="${esc(c.og(r))}">
<meta property="og:locale" content="ar_SD">
<meta property="og:locale:alternate" content="en_GB">
<meta property="og:url" content="${SITE}${c.dir}/${r.slug}/">
<link rel="canonical" href="${SITE}${c.dir}/${r.slug}/">
<meta property="og:image" content="${SITE}assets/brand/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Number One Travel &amp; Tourism">
<meta name="twitter:card" content="summary_large_image">

<link rel="icon" href="assets/brand/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="assets/brand/apple-touch-icon.png">
<link rel="preload" href="assets/fonts/ibm-plex-sans-arabic-arabic-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/ibm-plex-sans-arabic-arabic-700.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/css/foundation.css">
</head>

<body>
<a class="c-skip-link" href="#main" data-i18n="a11y.skip" data-skip>تخطَّ إلى المحتوى</a>

<div class="l-page">
  <!-- Global header: mounted by the script below (the placeholder holds its space). Stage 10.2 -->
  <div class="c-gh c-gh--placeholder" aria-hidden="true"></div>

  <main id="main" class="l-page__main">
    <section class="l-section c-hero${c.heroClass ? ` ${c.heroClass}` : ''}" aria-labelledby="${c.heroLabel}">
      <div class="l-container"><div class="${c.attr === 'profile' ? 'c-profile-hero' : 'c-hero__grid'}" data-${c.attr}="hero"></div></div>
    </section>
${c.sections.map((s, i) => `    <section class="l-section${i % 2 === 0 ? ' l-section--subtle' : ''}" data-${c.attr}="${s}" aria-labelledby="${s}-title" id="${s}" hidden><div class="l-container" data-${c.attr}-body></div></section>`).join('\n')}
    <section class="l-section l-section--inverse c-cta-band" data-${c.attr}="cta" aria-labelledby="cta-title" hidden>
      <span class="u-numeral-watermark" aria-hidden="true">1</span>
      <div class="l-container" data-${c.attr}-body></div>
    </section>
  </main>

  <!-- Global footer: mounted by the script below. Stage 10.3 -->

  <nav class="c-bottom-nav" aria-label="التنقل السريع" data-i18n-label="nav.quick"><div id="bottom-nav" style="display:contents"></div></nav>
</div>

<script type="module">
  import { mountPage } from './assets/js/page.js';
  import { route } from './assets/js/data/config.js';
  import { ${c.mount} } from './assets/js/components/${c.module}.js';

  mountPage({
    handle: ${JSON.stringify(c.handle)},
    header: { current: ${JSON.stringify(c.current)}, onSearch: () => location.assign(route(${JSON.stringify(c.search ? c.search(r) : 'book/')})) },
    footer: { cta: false },   // the page carries its own final CTA
    paint: () => ${c.mount}({ slug: ${JSON.stringify(r.slug)} }),   // QA handle: no.${c.handle}.render('unknown')
  });
</script>
</body>
</html>
`;

let sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
for (const c of COLLECTIONS) {
  const dir = join(ROOT, c.dir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const wanted = new Set(c.records.map((r) => r.slug));
  // supervisor/ also carries the hand-authored portal pages (dashboard, customers, …) — never generated, never
  // removed here; RESERVED_SUPERVISOR_SLUGS is exactly the set a real slug can never take, so there is no ambiguity.
  const reserved = c.dir === 'supervisor' ? new Set(RESERVED_SUPERVISOR_SLUGS) : new Set();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !wanted.has(entry.name) && !reserved.has(entry.name)) { rmSync(join(dir, entry.name), { recursive: true }); console.log(`removed  ${c.dir}/${entry.name}/`); }
  }
  for (const r of c.records) {
    const out = join(dir, r.slug);
    if (!existsSync(out)) mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'index.html'), shell(c, r));
    console.log(`written  ${c.dir}/${r.slug}/`);
  }
  // A noindexed collection is never listed in the sitemap — advertising a
  // URL for indexing while the page itself refuses it is a contradiction
  // search engines flag, so the block stays empty until noindex is lifted.
  const block = c.noindex ? '' : c.records.map((r) => `  <url>\n    <loc>${SITE}${c.dir}/${r.slug}/</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`).join('\n');
  const start = `  <!-- ${c.dir}: generated by tools/build-routes.mjs -->`;
  const end = `  <!-- /${c.dir} -->`;
  // migrate the older marker name once
  sitemap = sitemap.replace(`  <!-- ${c.dir}: generated by tools/build-service-pages.mjs -->`, start);
  if (!sitemap.includes(start)) sitemap = sitemap.replace('</urlset>', `${start}\n${end}\n</urlset>`);
  sitemap = sitemap.replace(new RegExp(`${start.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}[\\s\\S]*?${end.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`), `${start}\n${block}\n${end}`);
  console.log(`sitemap  ${c.noindex ? 0 : c.records.length} ${c.dir} URLs${c.noindex ? ' (noindex — omitted)' : ''}`);
}
writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);
