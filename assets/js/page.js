/* ============================================================================
   PAGE RUNTIME — what a page imports. Stage 10.12 cleanup

   One import per page: the chrome (header, footer, phone nav), the skip
   link, the static-link resolver, the language switch and the QA handle,
   wired once here instead of in every shell.

     import { mountPage } from './assets/js/page.js';
     import { mountHome } from './assets/js/components/home.js';
     mountPage({
       handle: 'home',
       header: { current: 'home', onSearch: (home) => home.scrollToSearch() },
       footer: { cta: false },
       paint: () => mountHome(),
     });

   `paint` runs after boot and again after every language change; whatever
   it returns is exposed as window.no.<handle> for the browser suites.
   ========================================================================= */

import { qs, qsa, render, el, ready } from './core/dom.js';
import { initLocale, applyTranslations, onLocaleChange, pick } from './core/i18n.js';
import { route } from './data/config.js';
import { NAV_BOTTOM } from './data/navigation.js';
import { setSpritePath, ensureSprite, initAccordions, initTabs, initModals, initPopovers, icon } from './components/ui.js';
import { mountHeader } from './components/header.js';
import { mountFooter } from './components/footer.js';
import './account/adapters/installed.js';
import { restoreSession } from './account/auth.js';
// Stage 13 — the supervisor portal's own adapter registry, registered the same way and gated by the same ENV; a
// customer-facing page never calls restoreSupervisorSession() itself, so registering it here costs nothing there.
import './supervisor/adapters/installed.js';
// Stage 15 — the operations portal's own adapter registry, same pattern again.
import './ops/adapters/installed.js';

/**
 * Wire the document: sprite, language, and the behaviours every page shares.
 * Resolves once the strings for the saved language are loaded and applied,
 * which is also when `.no-js` gives way to `.js` and the page paints.
 */
export async function boot({ sprite = 'assets/icons/sprite.svg', locale = true, onLocale = null } = {}) {
  setSpritePath(sprite);
  ensureSprite(sprite);
  await new Promise((resolve) => ready(resolve));
  if (locale) {
    await initLocale();
    applyTranslations();
    onLocaleChange(() => { applyTranslations(); onLocale?.(); });
  }
  // The customer session, if any, before the header paints: the account menu reads it.
  await restoreSession();
  document.documentElement.classList.remove('no-js');
  document.documentElement.classList.add('js');
  initAccordions(); initTabs(); initModals(); initPopovers();
}

/** The phone nav, from data; `current` marks one item. */
export function bottomNav(current = null) {
  return NAV_BOTTOM.map((item) => el('a', {
    class: 'c-bottom-nav__item', href: route(item.href),
    ...(item.id === current ? { 'aria-current': 'page' } : {}),
  }, [icon(item.icon, { size: 'sm' }), el('span', {}, pick(item, 'label'))]));
}

/**
 * @param {object} o
 * @param {string}   o.handle       window.no.<handle> for QA
 * @param {object}   o.header       mountHeader options; `onSearch(handle)` gets the page handle
 * @param {object}   o.footer       mountFooter options
 * @param {string}   o.bottom       NAV_BOTTOM id to mark current
 * @param {function} o.paint        () → page handle; runs after boot and on every language change
 */
export function mountPage({ handle = 'page', header = {}, footer = {}, bottom = null, paint = () => null } = {}) {
  const target = qs('.l-page');
  const api = { current: null };

  // <base> would send href="#main" to the homepage; the skip link scrolls here.
  qs('[data-skip]')?.addEventListener('click', (e) => { e.preventDefault(); const m = qs('#main'); if (!m) return; m.tabIndex = -1; m.focus(); m.scrollIntoView(); });
  // Static links resolve through route(); data-query and data-hash ride along.
  qsa('[data-route]').forEach((a) => { a.href = route(a.dataset.route) + (a.dataset.query ? `?${a.dataset.query}` : '') + (a.dataset.hash ? `#${a.dataset.hash}` : ''); });

  const chrome = () => {
    mountFooter({ target, variant: 'marketing', ...footer });
    // The handle may have been re-mounted from the console (the suites do); read the live one.
    mountHeader({ target, ...header, onSearch: () => header.onSearch?.(window.no?.[handle] ?? api.current) });
  };
  const repaint = () => {
    const nav = qs('#bottom-nav');
    if (nav) render(nav, bottomNav(bottom));
    // An async paint (a screen that must fetch first) exposes its handle once it resolves.
    const expose = (value) => { api.current = value ?? null; window.no = { ...(window.no ?? {}), [handle]: api.current }; };
    const painted = paint(api);
    if (painted?.then) { expose(null); painted.then(expose); } else expose(painted);
  };
  api.repaint = repaint;
  boot({ onLocale: () => { chrome(); repaint(); } }).then(() => { chrome(); repaint(); });
  return api;
}
