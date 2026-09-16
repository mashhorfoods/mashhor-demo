/* ============================================================================
   NUMBER ONE — FOUNDATION ENTRY POINT
   نمبرون للسفر و السياحة — Stage 10.1

   The single module a page imports. It re-exports every public part of the
   system and provides `boot()`, which wires the behaviours present on the
   page and nothing else.

     import { boot } from './assets/js/foundation.js';
     boot({ sprite: 'assets/icons/sprite.svg' });

   Deliberately NOT here: routing, data fetching, booking logic. Stage 11
   onwards adds those around this layer, not inside it. §26 / §28 / §34
   ========================================================================= */

export * from './core/dom.js';
export * from './core/i18n.js';
export * from './core/format.js';
export * from './data/config.js';
export * from './data/services.js';
export * from './data/service-details.js';
export * from './data/destinations.js';
export * from './data/navigation.js';
export * from './data/footer.js';
export * from './data/home.js';
export * from './components/ui.js';
export * from './components/cards.js';
export * from './components/search.js';
export * from './components/states.js';
export * from './components/header.js';
export * from './components/footer.js';
export * from './components/home.js';
export * from './components/services.js';
export * from './components/service-detail.js';
export * from './components/destinations.js';

import { ready } from './core/dom.js';
import { initLocale, setLocale, applyTranslations, onLocaleChange } from './core/i18n.js';
import {
  setSpritePath, ensureSprite, initAccordions, initTabs, initModals,
  initOtp, initPopovers, initUploads,
} from './components/ui.js';

/**
 * Wire the page.
 * @param {object} options
 * @param {string} options.sprite      path to the icon sprite from this page
 * @param {boolean} options.locale     set false to manage language yourself
 * @param {function} options.onLocale  called after every language change, so a
 *                                     page can re-render its dynamic regions
 */
export function boot({ sprite = 'assets/icons/sprite.svg', locale = true, onLocale = null } = {}) {
  setSpritePath(sprite);
  // Start the sprite request immediately rather than waiting for DOMContentLoaded:
  // it is the one asset every component on the page depends on.
  ensureSprite(sprite);

  ready(() => {
    document.documentElement.classList.remove('no-js');
    document.documentElement.classList.add('js');

    if (locale) {
      initLocale();
      applyTranslations();
      onLocaleChange(() => {
        applyTranslations();
        onLocale?.();
      });
    }

    initAccordions();
    initTabs();
    initModals();
    initOtp();
    initPopovers();
    initUploads();
  });
}
