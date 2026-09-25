/* ============================================================================
   COMPONENTS / PROVIDERS — the airline-providers trust band.

   Static, always-available data (see data/providers.js) — no loading/empty/
   error states needed, unlike the homepage's API-backed regions.
   ========================================================================= */

import { el } from '../core/dom.js';
import { pick } from '../core/i18n.js';
import { AIRLINE_PROVIDERS } from '../data/providers.js';

/* A fixed max-height alone does not make logos "the same size": a wide
   wordmark (Turkish Airlines) and a compact badge-plus-text mark (Qatar Airways) can share a
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

/* A period is the raw list repeated this many times — wide enough that one
   period never runs shorter than the widest supported container (1280px,
   --container-max), so the seamless loop (below) never exposes a gap. Card
   width depends on each logo's own aspect ratio (equal-area sizing, above)
   and is not viewport-dependent, so a fixed repeat count holds at every
   breakpoint; there's nothing to measure at runtime. */
const MARQUEE_REPEATS = 3;

/**
 * The continuous right-to-left marquee (§04 of the update brief): the track
 * is the period duplicated once more, animated by exactly one period-width
 * (translate3d, -50% of the doubled track) so the loop never jumps or gaps.
 * Only the first pass of the raw list is exposed to assistive tech; every
 * repeat that exists purely to fill the track is `aria-hidden`, so a screen
 * reader hears the seven airlines once, not six times over.
 */
export function providerMarquee(list = AIRLINE_PROVIDERS) {
  const perPeriod = list.length * MARQUEE_REPEATS;
  const items = Array.from({ length: perPeriod * 2 }, (_, i) => {
    const provider = list[i % list.length];
    const canonical = i < list.length;
    return el('div', {
      class: `c-provider-marquee__item${canonical ? '' : ' c-provider-marquee__item--dup'}`,
      ...(canonical ? {} : { 'aria-hidden': 'true' }),
    }, providerCard(provider));
  });
  return el('div', { class: 'c-provider-marquee' },
    el('div', { class: 'c-provider-marquee__track' }, items));
}
