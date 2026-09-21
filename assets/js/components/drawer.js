/* ============================================================================
   COMPONENTS / DRAWER — the phone menu (§16 §17 §18): built on first open,
   focus-trapped, scroll-locked, closed by Escape, scrim or a choice.
   Stage 10.12 split out of header.js
   ========================================================================= */

import { el, qs, qsa, uid, lockScroll, unlockScroll, trapFocus } from '../core/dom.js';
import { getLocale, pick } from '../core/i18n.js';
import { route } from '../data/config.js';
import { NAV_PRIMARY, MENUS } from '../data/navigation.js';
import { icon } from './ui.js';
import { logo, bookNowButton } from './brand.js';
import { supportChannelLinks } from './menus.js';

/* ---------------------------------------------------------------------------
   MOBILE DRAWER — §16 §17 §18
   ------------------------------------------------------------------------ */
export function mobileDrawer({ signal } = {}) {
  const isAr = getLocale() === 'ar';
  let release = null;

  const accordion = (menu) => {
    const panelId = uid('gh-macc');
    const trigger = el('button', {
      type: 'button', class: 'c-gh__m-trigger',
      'aria-expanded': 'false', 'aria-controls': panelId,
    }, [
      el('span', {}, pick(menu, 'title')),
      icon('no-chevron-down', { size: 'sm', className: 'c-gh__chev' }),
    ]);

    const inner = el('div', { class: 'c-gh__m-sub' }, [
      menu.channels ? el('div', { class: 'c-gh__m-channels' }, supportChannelLinks(menu.channels)) : null,
      ...menu.columns.map((column) => el('div', {}, [
        menu.columns.length > 1 ? el('p', { class: 'c-gh__m-group-title' }, pick(column, 'title')) : null,
        ...column.items.map((item) => el('a', { class: 'c-gh__m-sublink', href: route(item.href) }, [
          item.icon ? icon(item.icon, { size: 'sm' }) : null,
          el('span', {}, pick(item, 'label')),
        ])),
      ])),
      menu.footer?.href
        ? el('a', { class: 'c-gh__m-sublink', href: route(menu.footer.href) }, [
            icon('no-arrow-end', { size: 'sm', flip: true }),
            el('span', {}, pick(menu.footer, 'link') || pick(menu.footer, 'cta')),
          ])
        : null,
    ]);

    // Collapsed by default — §17 forbids opening every category on arrival.
    const panel = el('div', { class: 'c-gh__m-panel', id: panelId, dataset: { collapsed: 'true' } },
      el('div', { class: 'c-gh__m-panel-inner' }, inner));

    trigger.addEventListener('click', () => {
      const open = trigger.getAttribute('aria-expanded') === 'true';
      trigger.setAttribute('aria-expanded', String(!open));
      panel.dataset.collapsed = String(open);
    });

    return el('div', { class: 'c-gh__m-item' }, [trigger, panel]);
  };

  const buildBody = () => el('div', { class: 'c-gh__drawer-body' }, [
    el('nav', { 'aria-label': isAr ? 'القائمة الرئيسية' : 'Main menu' }, NAV_PRIMARY.map((item) => {
      const menu = item.menu && MENUS[item.menu];
      if (menu) return accordion({ ...menu, titleAr: item.labelAr, titleEn: item.labelEn });
      return el('div', { class: 'c-gh__m-item' }, [
        el('a', { class: 'c-gh__m-link', href: route(item.href) }, [
          el('span', {}, pick(item, 'label')),
          icon('no-chevron-end', { size: 'sm', flip: true, className: 'c-gh__chev' }),
        ]),
      ]);
    })),
    el('div', { class: 'c-gh__m-item' }, [
      el('a', { class: 'c-gh__m-link', href: route('account/') }, [
        el('span', {}, isAr ? 'حسابي' : 'My account'),
        icon('no-chevron-end', { size: 'sm', flip: true, className: 'c-gh__chev' }),
      ]),
    ]),
    el('div', { class: 'c-gh__m-channels' }, supportChannelLinks()),
  ]);

  /* The shell exists from the start so the burger's aria-controls points at a
     real element. The 200-odd nodes inside are built on the first open: on a
     desktop the burger is display:none and this can never open, so those
     nodes were 38% of the header's DOM shipped to viewports that cannot use
     them (§25/§26). */
  const drawer = el('div', { class: 'c-gh__drawer', hidden: true });
  let built = false;
  const build = () => {
    if (built) return;
    built = true;
    const closeBtn = el('button', {
      type: 'button', class: 'c-btn c-btn--utility',
      'aria-label': isAr ? 'إغلاق القائمة' : 'Close menu',
      'data-gh-drawer-close': '',
    }, icon('no-close'));
    drawer.append(
      el('div', { class: 'c-gh__drawer-scrim', 'data-gh-drawer-close': '' }),
      el('div', { class: 'c-gh__drawer-panel', role: 'dialog', 'aria-modal': 'true',
                  'aria-label': isAr ? 'القائمة' : 'Menu' }, [
        el('div', { class: 'c-gh__drawer-head' }, [logo({ size: 'c-logo--sm' }), closeBtn]),
        buildBody(),
        el('div', { class: 'c-gh__drawer-foot' }, bookNowButton({ block: true })),
      ]),
    );
  };

  const open = () => {
    build();
    drawer.hidden = false;
    requestAnimationFrame(() => { drawer.dataset.open = 'true'; });
    lockScroll();
    release = trapFocus(drawer);
    qsa(`[aria-controls="${drawer.id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'true'));
  };
  const close = () => {
    if (drawer.hidden) return;
    drawer.dataset.open = 'false';
    unlockScroll();
    release?.(); release = null;
    qsa(`[aria-controls="${drawer.id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'false'));
    const panel = qs('.c-gh__drawer-panel', drawer);
    const done = () => { drawer.hidden = true; };
    panel.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 400);
  };

  drawer.addEventListener('click', (event) => {
    if (event.target.closest('[data-gh-drawer-close]') || event.target.closest('a')) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawer.dataset.open === 'true') close();
  }, { signal });

  drawer.no = { open, close };
  return drawer;
}
