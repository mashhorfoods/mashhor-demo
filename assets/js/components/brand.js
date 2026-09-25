/* ============================================================================
   COMPONENTS / BRAND — the logo lockups, the language switch and the one
   red "book now" action. Header, drawer, footer and the supervisor profile
   all draw from here. Stage 10.12 split out of header.js
   ========================================================================= */

import { el } from '../core/dom.js';
import { getLocale, setLocale, t, pick } from '../core/i18n.js';
import { route } from '../data/config.js';
import { BOOK_CTA } from '../data/navigation.js';
import { icon } from './ui.js';

/* ---------------------------------------------------------------------------
   SMALL BUILDERS
   ------------------------------------------------------------------------ */
/**
 * A plain text wordmark — no logo mark, no image asset. Demo-template brand:
 * customisable later without touching this component (just brand.name in
 * strings/*.js). `variant` ('primary'|'lockup') is kept for call-site
 * compatibility but no longer changes what renders — both showed the same
 * name, one with an image-only descriptor line that text doesn't need.
 *
 * @param {object} o
 * @param {string|null} o.href     null renders a <span> instead of a link
 * @param {boolean} o.inverse      opt into swapping to light-on-dark text,
 *                                 same surfaces the old image swap used
 */
export function logo({ variant = 'primary', size = '', href = '', inverse = false, className = '' } = {}) {
  const text = el('span', { class: `c-logo__text${inverse ? ' c-logo__text--swaps' : ''}` }, t('brand.name'));
  const cls = `c-logo ${size} ${className}`.replace(/\s+/g, ' ').trim();
  return href === null ? el('span', { class: cls }, [text]) : el('a', { class: cls, href: route(href) }, [text]);
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
