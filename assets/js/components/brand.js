/* ============================================================================
   COMPONENTS / BRAND — the logo lockups, the language switch and the one
   red "book now" action. Header, drawer, footer and the supervisor profile
   all draw from here. Stage 10.12 split out of header.js
   ========================================================================= */

import { el } from '../core/dom.js';
import { getLocale, setLocale, pick } from '../core/i18n.js';
import { route } from '../data/config.js';
import { BOOK_CTA } from '../data/navigation.js';
import { icon } from './ui.js';

/* ---------------------------------------------------------------------------
   SMALL BUILDERS
   ------------------------------------------------------------------------ */
/* The two lockup variants and their reversed twins, in one place. Header,
   drawer and footer all draw from this; before, the footer rebuilt the same
   <img> contract by hand in two places, so a size or alt change had to be made
   three times. */
const LOGO_ART = {
  primary: { light: 'assets/brand/logo-primary.png', inverse: 'assets/brand/logo-primary-inverse.png', w: 640, h: 444 },
  lockup:  { light: 'assets/brand/logo-lockup.png',  inverse: 'assets/brand/logo-lockup-inverse.png',  w: 640, h: 498 },
};

/**
 * @param {object} o
 * @param {'primary'|'lockup'} o.variant  without / with the descriptor line
 * @param {string|null} o.href            null renders a <span> instead of a link
 * @param {boolean} o.inverse             also emit the reversed image, which
 *                                        .c-logo swaps in on dark surfaces
 */
export function logo({ variant = 'primary', size = '', href = '', inverse = false, className = '' } = {}) {
  const art = LOGO_ART[variant] ?? LOGO_ART.primary;
  const alt = 'نمبرون للسفر و السياحة — Number One Travel & Tourism';
  const imgs = [
    el('img', { class: 'c-logo__img c-logo__img--light', src: route(art.light), alt, width: art.w, height: art.h }),
    inverse ? el('img', { class: 'c-logo__img c-logo__img--inverse', src: route(art.inverse),
                          alt: '', 'aria-hidden': 'true', width: art.w, height: art.h }) : null,
  ];
  const cls = `c-logo ${size} ${className}`.replace(/\s+/g, ' ').trim();
  return href === null ? el('span', { class: cls }, imgs) : el('a', { class: cls, href: route(href) }, imgs);
}

/** §06 of Stage 10.1 — Arabic and English are both first-class, so the switch
    has to be reachable from every page. Reference mockup: a single "<other
    language name> ⌄" control that lives in the bar itself at every width,
    including phone — it no longer moves into the drawer, so the bar is its
    only home now. */
export function languageButton() {
  const isAr = getLocale() === 'ar';
  return el('button', {
    type: 'button',
    class: 'c-gh__action',
    // The control names the language it switches TO, in that language — so a
    // reader who cannot read the current one can still find it. lang= declares
    // that, so screen readers pronounce it right and audits don't flag it.
    lang: isAr ? 'en' : 'ar',
    'aria-label': isAr ? 'Switch to English' : 'التبديل إلى العربية',
    onclick: () => setLocale(isAr ? 'en' : 'ar'),
  }, [
    // c-gh__lang-label, not c-gh__action-label: search/support keep their
    // text hidden until 80em, but the language name is always visible here,
    // matching the mockup at every breakpoint.
    el('span', { class: 'c-gh__lang-label' }, isAr ? 'English' : 'العربية'),
    icon('no-chevron-down', { size: 'sm' }),
  ]);
}

export function bookNowButton({ block = false } = {}) {
  return el('a', {
    class: `c-btn c-btn--primary c-gh__cta${block ? ' c-btn--block' : ''}`,
    href: route(BOOK_CTA.href),
    'data-gh-cta': '',
  }, pick(BOOK_CTA, 'label'));
}
