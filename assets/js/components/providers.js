/* ============================================================================
   COMPONENTS / PROVIDERS — the airline-providers trust band.

   Static, always-available data (see data/providers.js) — no loading/empty/
   error states needed, unlike the homepage's API-backed regions.
   ========================================================================= */

import { el } from '../core/dom.js';
import { pick } from '../core/i18n.js';
import { AIRLINE_PROVIDERS } from '../data/providers.js';

/* A fixed max-height alone does not make logos "the same size": a wide
   wordmark (EgyptAir) and a compact badge-plus-text mark (Badr) can share a
   height and still read as wildly different sizes, because one fills far
   more of the row than the other. Sizing every logo to the same on-screen
   AREA instead — height = sqrt(area / aspectRatio) — is what actually reads
   as consistent. Bounded so no single logo's own aspect ratio can make it
   look tiny or oversized against the others. */
const LOGO_AREA_REM2 = 28;
const LOGO_MIN_H_REM = 2.5;
const LOGO_MAX_H_REM = 4.75;

function sizeLogo(img) {
  const { naturalWidth: w, naturalHeight: h } = img;
  if (!w || !h) return;
  const ratio = w / h;
  const height = Math.min(LOGO_MAX_H_REM, Math.max(LOGO_MIN_H_REM, Math.sqrt(LOGO_AREA_REM2 / ratio)));
  img.style.blockSize = `${height.toFixed(2)}rem`;
  img.style.inlineSize = `${(height * ratio).toFixed(2)}rem`;
}

export function providerCard(provider) {
  if (!provider.logo) return el('div', { class: 'c-card c-provider-card' }, el('span', { class: 'c-provider-card__wordmark' }, pick(provider, 'name')));
  const img = el('img', {
    src: provider.logo, alt: pick(provider, 'name'),
    class: 'c-provider-card__logo', loading: 'lazy', decoding: 'async',
  });
  if (img.complete) sizeLogo(img); else img.addEventListener('load', () => sizeLogo(img), { once: true });
  return el('div', { class: 'c-card c-provider-card' }, img);
}

export function providerGrid(list = AIRLINE_PROVIDERS) {
  return el('div', { class: 'l-grid' }, list.map((provider) =>
    el('div', { class: 'l-span-4@md l-span-4@lg' }, providerCard(provider))));
}
