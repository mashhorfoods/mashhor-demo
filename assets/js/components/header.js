/* ============================================================================
   COMPONENTS / GLOBAL HEADER — Stage 10.2
   نمبرون للسفر و السياحة — Number One Travel & Tourism

   One header for the whole platform. Everything it renders comes from
   data/navigation.js; nothing here knows a label or a route.

   Composition (§27): globalHeader() assembles desktopBar + mobileBar + the
   panels + the drawer. Each builder below is usable on its own.

   Behaviour contract (§22):
     open      on CLICK only — never on hover, so a cursor crossing the bar
               cannot fire a menu
     close     on outside click, on Escape, on choosing an item, and whenever
               another menu opens
     keyboard  ArrowDown opens and lands on the first item; Escape closes and
               returns focus to the trigger; Tab walks out and closes

   §33: this module has no network dependency. If anything dynamic is layered
   on later it must degrade to the static IA rendered here.
   ========================================================================= */

import { el, qsa, uid } from '../core/dom.js';
import { getLocale, pick } from '../core/i18n.js';
import { route } from '../data/config.js';
import { NAV_PRIMARY, MENUS } from '../data/navigation.js';
import { icon } from './ui.js';
import { session, sessionListeners, initials, setSession } from './session.js';
import { logo, languageButton, bookNowButton } from './brand.js';
import { createMenuController, menuPanel, accountPanel } from './menus.js';
import { mobileDrawer } from './drawer.js';
export { setSession, getSession } from './session.js';

/* ---------------------------------------------------------------------------
   GLOBAL HEADER — the assembly. §27
   @param {object} options
   @param {string} options.current   id of the active primary nav item (§19)
   @param {'default'|'booking'} options.variant  §32
   @param {function} options.onSearch
   ------------------------------------------------------------------------ */
export function globalHeader({ current = null, variant = 'default', onSearch = null } = {}) {
  const isAr = getLocale() === 'ar';
  const scrim = el('div', { class: 'c-gh__scrim', hidden: true });
  // Everything this header attaches outside itself — document listeners,
  // session subscriptions — is released by one abort. See header.no.destroy.
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const menus = createMenuController(scrim, { signal });
  const isBooking = variant === 'booking';

  /* ---- primary navigation ----
     A mega panel spans the whole container, so it cannot live inside its <li>:
     `inset-inline: 0` there resolves against the button's own width and the
     panel collapses to a ~110px strip. Mega panels are therefore siblings of
     the bar inside .c-gh__inner, while the narrow dropdowns stay anchored to
     their trigger's <li>. */
  const megaPanels = [];
  const sharedPanels = {};
  const navItems = NAV_PRIMARY.map((item) => {
    const menu = item.menu && MENUS[item.menu];
    const active = item.id === current;

    if (!menu) {
      return el('li', {}, el('a', {
        class: 'c-gh__link', href: route(item.href),
        ...(active ? { 'aria-current': 'page' } : {}),
      }, pick(item, 'label')));
    }

    const trigger = el('button', {
      type: 'button', class: 'c-gh__link',
      ...(active ? { 'aria-current': 'page' } : {}),
    }, [
      el('span', {}, pick(item, 'label')),
      icon('no-chevron-down', { size: 'sm', className: 'c-gh__chev' }),
    ]);
    const panel = menuPanel(menu);
    menus.register(trigger, panel);
    if (menu.placement === 'end') { panel.classList.add('c-gh__panel--end'); sharedPanels[menu.id] = panel; }

    // Mega and end-anchored panels live at the bar level, not in the <li>:
    // a mega spans the container, and an end-anchored one is shared with an
    // action button on the far side of the bar.
    if (menu.type === 'mega' || menu.placement === 'end') {
      megaPanels.push(panel);
      return el('li', {}, trigger);
    }
    return el('li', { class: 'u-relative' }, [trigger, panel]);
  });

  /* ---- actions ---- */
  // Search is a door, not a sheet: the page decides where it leads — the
  // homepage and the booking entry focus their own form, every other page
  // opens the booking entry. (The interim search sheet of 10.2 duplicated
  // the booking entry and was removed in the 10.12 cleanup.)
  const searchTrigger = el('button', {
    type: 'button', class: 'c-gh__action',
    'aria-label': isAr ? 'بحث' : 'Search',
    onclick: () => { menus.close(); onSearch?.(); },
  }, [icon('no-search'), el('span', { class: 'c-gh__action-label' }, isAr ? 'بحث' : 'Search')]);

  // The Support action opens the SAME help panel the primary nav built — the
  // page used to carry two byte-identical copies of it, 41 nodes each.
  const helpMenu = sharedPanels.help ?? menuPanel({ ...MENUS.help, placement: 'end' });
  if (!sharedPanels.help) { helpMenu.classList.add('c-gh__panel--end'); megaPanels.push(helpMenu); }
  const helpTrigger = el('button', {
    type: 'button', class: 'c-gh__action',
    'aria-label': isAr ? 'المساعدة والدعم' : 'Help and support',
  }, [icon('no-support'), el('span', { class: 'c-gh__action-label' }, isAr ? 'الدعم' : 'Support')]);
  menus.register(helpTrigger, helpMenu);

  const account = accountPanel();
  const accountTrigger = el('button', {
    type: 'button', class: 'c-gh__action',
    'aria-label': isAr ? 'حسابي' : 'My account',
  });
  const paintAccountTrigger = () => {
    accountTrigger.replaceChildren(
      session.authenticated
        ? el('span', { class: 'c-gh__avatar', 'aria-hidden': 'true' }, initials(session.name))
        : icon('no-customer'),
      el('span', { class: 'c-gh__action-label' },
        session.authenticated ? (session.name || (isAr ? 'حسابي' : 'Account')) : (isAr ? 'حسابي' : 'Account')),
    );
  };
  paintAccountTrigger();
  sessionListeners.add(paintAccountTrigger);
  menus.register(accountTrigger, account);

  const burger = el('button', {
    type: 'button', class: 'c-btn c-btn--utility c-gh__mobile-only',
    'aria-label': isAr ? 'فتح القائمة' : 'Open menu',
    'aria-expanded': 'false',
  }, icon('no-menu'));

  const drawer = mobileDrawer({ signal });
  drawer.id = uid('gh-drawer');
  burger.setAttribute('aria-controls', drawer.id);
  burger.addEventListener('click', () => {
    menus.close();
    (drawer.dataset.open === 'true' ? drawer.no.close : drawer.no.open)();
  });

  /* ---- the bar ---- */
  const header = el('header', {
    class: 'c-gh',
    'data-variant': variant,
    'data-scrolled': 'false',
  }, [
    el('div', { class: 'l-container c-gh__inner' }, [
      el('div', { class: 'c-gh__bar' }, [
        logo({ className: 'c-gh__brand' }),

        isBooking
          ? el('p', { class: 'c-gh__secure' }, [
              icon('no-shield', { size: 'sm' }),
              el('span', {}, isAr ? 'حجز آمن — بياناتك محمية' : 'Secure booking — your details are protected'),
            ])
          : el('nav', { class: 'c-gh__nav', 'aria-label': isAr ? 'التنقل الرئيسي' : 'Main navigation' }, [
              el('ul', { class: 'c-gh__list', role: 'list' }, navItems),
            ]),

        el('div', { class: 'c-gh__actions' }, [
          el('span', { class: 'c-gh__tablet-up' }, languageButton()),
          searchTrigger,
          // Each dropdown trigger needs a positioned parent, or its panel
          // anchors to the whole bar instead of to the control.
          el('span', { class: 'c-gh__desktop-only' }, helpTrigger),
          el('span', { class: 'u-relative' }, [accountTrigger, account]),
          // §11 — exactly one red action. The booking variant drops it, because
          // on a booking page the page itself is the call to action. §32
          isBooking ? null : el('span', { class: 'c-gh__desktop-only' }, bookNowButton()),
          burger,
        ]),
      ]),
      ...megaPanels,
    ]),
  ]);

  header.append(scrim, drawer);

  header.no = {
    menus,
    drawer: drawer.no,
    setSession,
    /** Release every listener this header holds. mountHeader calls it before
        replacing a header; call it yourself if you place the header manually. */
    destroy() {
      lifetime.abort();
      account.no.destroy();
      sessionListeners.delete(paintAccountTrigger);
      header.remove();
    },
    /** Mark the active item without re-rendering the header. §19 */
    setCurrent(id) {
      qsa('.c-gh__link[aria-current]', header).forEach((n) => n.removeAttribute('aria-current'));
      const match = NAV_PRIMARY.findIndex((i) => i.id === id);
      if (match >= 0) qsa('.c-gh__list > li', header)[match]
        ?.querySelector('.c-gh__link')?.setAttribute('aria-current', 'page');
    },
  };

  return header;
}

/* ---------------------------------------------------------------------------
   SCROLL STATE — §13.
   A sentinel above the header, watched by IntersectionObserver. No scroll
   handler runs on the main thread, which matters for a component present on
   every page (§26).
   ------------------------------------------------------------------------ */
export function initHeaderScrollState(header) {
  if (!header) return;
  const sentinel = el('div', { 'aria-hidden': 'true', style: 'position:absolute;inset-block-start:0;block-size:1px;inline-size:1px' });
  header.parentNode.insertBefore(sentinel, header);

  if (!('IntersectionObserver' in window)) return;
  new IntersectionObserver(([entry]) => {
    header.dataset.scrolled = String(!entry.isIntersecting);
  }, { threshold: 0 }).observe(sentinel);
}

/** Mount the header as the first element of a page and wire its scroll state. */
export function mountHeader(options = {}) {
  const target = options.target ?? document.body;
  qsa('.c-gh', target).forEach((old) => (old.no?.destroy ?? old.remove).call(old.no ?? old));
  const header = globalHeader(options);
  target.prepend(header);
  initHeaderScrollState(header);
  return header;
}
