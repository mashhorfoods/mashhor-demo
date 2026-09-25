/* ============================================================================
   COMPONENTS / BRAND — the language switch and the one red "book now"
   action. Header, drawer and footer all draw from here. Stage 10.12 split
   out of header.js. There is no logo component: the demo ships with no
   mark or wordmark at all, so a buyer's own brand never has to be undone.
   ========================================================================= */

import { el } from '../core/dom.js';
import { getLocale, setLocale, pick } from '../core/i18n.js';
import { route } from '../data/config.js';
import { BOOK_CTA } from '../data/navigation.js';
import { icon } from './ui.js';

/* ---------------------------------------------------------------------------
   SMALL BUILDERS
   ------------------------------------------------------------------------ */
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
