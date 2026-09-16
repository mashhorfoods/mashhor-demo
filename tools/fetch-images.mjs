// Fills the photography slots with freely licensed photographs from Wikimedia
// Commons and regenerates the image map. Stage 10.12
//
//   node tools/fetch-images.mjs            # every slot without a file yet
//   node tools/fetch-images.mjs --force    # re-resolve every slot
//   node tools/fetch-images.mjs destinations/jeddah offers/umrah   # only these
//
// For each slot in tools/images.manifest.json the tool searches Commons for
// the slot's terms, keeps only bitmaps under a licence the manifest allows
// (CC0, public domain, CC BY, CC BY-SA), downloads a 1280px rendition to
// assets/images/<key>.jpg, records the credit (title, author, licence, source
// page) in assets/images/CREDITS.md and writes assets/js/data/images.js so
// every surface picks the file up. A slot the search cannot satisfy stays
// absent and keeps its neutral placeholder — nothing is guessed.
//
// Needs network access to commons.wikimedia.org and upload.wikimedia.org
// (blocked in the build sandbox; run it from a workstation). Node 18+.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'tools/images.manifest.json'), 'utf8'));
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'NumberOneTravel-site-images/1.0 (static site build; contact via repository)';

const LICENCE_OK = (short = '') => {
  const s = short.toLowerCase();
  const allow = manifest.license;
  if (allow.includes('cc0') && /cc0/.test(s)) return true;
  if (allow.includes('pd') && /public domain|^pd/.test(s)) return true;
  if (allow.includes('cc-by-sa') && /cc by-sa|cc-by-sa/.test(s)) return true;
  if (allow.includes('cc-by') && /^cc by(?!-)|^cc-by(?!-)|cc by \d/.test(s)) return true;
  return false;
};
const strip = (html = '') => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function resolve(slot) {
  const url = `${API}?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=12&gsrsearch=${encodeURIComponent(`${slot.search} filetype:bitmap`)}&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=${manifest.width}&iiextmetadatafilter=LicenseShortName|Artist|ImageDescription|Credit`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Commons API ${res.status}`);
  const data = await res.json();
  const pages = Object.values(data.query?.pages ?? {});
  const candidates = pages
    .map((p) => ({ title: p.title, info: p.imageinfo?.[0] }))
    .filter((c) => c.info && /^image\/(jpeg|png)$/.test(c.info.mime) && c.info.width >= 1200 && c.info.width >= c.info.height)
    .map((c) => ({ ...c, licence: strip(c.info.extmetadata?.LicenseShortName?.value), artist: strip(c.info.extmetadata?.Artist?.value), description: strip(c.info.extmetadata?.ImageDescription?.value).slice(0, 160) }))
    .filter((c) => LICENCE_OK(c.licence));
  return candidates[0] ?? null;
}

async function download(url, file) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const creditsPath = join(ROOT, 'assets/images/CREDITS.md');
const credits = existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, 'utf8').match(/<!-- data:(.*?) -->/s)?.[1] ?? '{}') : {};

for (const slot of manifest.slots) {
  if (only.length && !only.includes(slot.key)) continue;
  const file = join(ROOT, 'assets/images', `${slot.key}.jpg`);
  if (existsSync(file) && credits[slot.key] && !force) { console.log(`kept     ${slot.key}`); continue; }
  try {
    const pick = await resolve(slot);
    if (!pick) { console.log(`no match ${slot.key} — placeholder stays`); continue; }
    await download(pick.info.thumburl ?? pick.info.url, file);
    credits[slot.key] = { title: pick.title, author: pick.artist, licence: pick.licence, source: pick.info.descriptionurl, subject: slot.subject };
    console.log(`fetched  ${slot.key} ← ${pick.title} (${pick.licence})`);
  } catch (error) {
    console.log(`failed   ${slot.key}: ${error.message}`);
  }
}

// ---- Write the credits and the map from what is on disk ------------------
const present = manifest.slots.filter((s) => existsSync(join(ROOT, 'assets/images', `${s.key}.jpg`)) && credits[s.key]);
const rows = present.map((s) => { const c = credits[s.key]; return `| \`${s.key}\` | [${c.title.replace(/^File:/, '')}](${c.source}) | ${c.author || '—'} | ${c.licence} |`; });
writeFileSync(creditsPath, `# Image credits

Photographs in this folder come from Wikimedia Commons under the licence
shown, fetched by \`tools/fetch-images.mjs\`; each is a stand-in until the
business supplies its own. Attribution below satisfies CC BY / CC BY-SA.

| Slot | File (source page) | Author | Licence |
| --- | --- | --- | --- |
${rows.join('\n')}

<!-- data:${JSON.stringify(Object.fromEntries(present.map((s) => [s.key, credits[s.key]])))} -->
`);
const map = Object.fromEntries(present.map((s) => [s.key, `assets/images/${s.key}.jpg`]));
const mapFile = join(ROOT, 'assets/js/data/images.js');
const header = readFileSync(mapFile, 'utf8').split('export const IMAGES')[0];
writeFileSync(mapFile, `${header}export const IMAGES = ${JSON.stringify(map, null, 2)};\n\nexport const imageSrc = (key) => IMAGES[key] ?? null;\n`);
console.log(`map      ${present.length}/${manifest.slots.length} slots have a photograph`);
