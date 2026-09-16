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

import { el, qs, qsa, uid, lockScroll, unlockScroll, trapFocus } from '../core/dom.js';
import { getLocale, setLocale, pick } from '../core/i18n.js';
import { route } from '../data/config.js';
import {
  NAV_PRIMARY, MENUS, SUPPORT_CHANNELS, liveChannels, ACCOUNT_GUEST, ACCOUNT_CUSTOMER,
  SEARCH_SCOPES, BOOK_CTA,
} from '../data/navigation.js';
import { icon } from './ui.js';

/* ---------------------------------------------------------------------------
   SESSION — §10 / §28.
   The header reads a session; it does not own one. Stage 12 calls setSession()
   and the account menu re-renders. Roles beyond `customer` do NOT add entries
   here: supervisor and admin navigation are separate systems (§28), and a
   supervisor profile page still shows the Number One header (§29).
   ------------------------------------------------------------------------ */
let session = { authenticated: false, name: '', role: 'guest' };
const sessionListeners = new Set();

export function setSession(next = {}) {
  session = { ...session, ...next };
  sessionListeners.forEach((fn) => fn(session));
}
export const getSession = () => ({ ...session });

const initials = (name) => (name || '')
  .trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('') || '؟';

/* ---------------------------------------------------------------------------
   MENU CONTROLLER — one open panel at a time, for the whole header.
   ------------------------------------------------------------------------ */
function createMenuController(scrim, { signal } = {}) {
  let open = null;   // { trigger, panel }

  const close = ({ restoreFocus = false } = {}) => {
    if (!open) return;
    const { trigger, panel } = open;
    panel.dataset.open = 'false';
    trigger.setAttribute('aria-expanded', 'false');
    // Wait out the fade before removing from the a11y tree.
    setTimeout(() => { if (panel.dataset.open !== 'true') panel.hidden = true; }, 180);
    if (scrim) { scrim.dataset.open = 'false'; setTimeout(() => { scrim.hidden = true; }, 180); }
    if (restoreFocus) trigger.focus();
    open = null;
  };

  const show = (trigger, panel) => {
    if (open && open.trigger === trigger) { close({ restoreFocus: true }); return; }
    close();
    panel.hidden = false;
    if (scrim) { scrim.hidden = false; requestAnimationFrame(() => { scrim.dataset.open = 'true'; }); }
    requestAnimationFrame(() => { panel.dataset.open = 'true'; });
    trigger.setAttribute('aria-expanded', 'true');
    open = { trigger, panel };
  };

  /** Wire a trigger/panel pair with the full §22 behaviour. */
  const register = (trigger, panel) => {
    if (!panel.id) panel.id = uid('gh-panel');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', panel.id);
    trigger.setAttribute('aria-haspopup', 'true');
    panel.hidden = true;

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      show(trigger, panel);
    });

    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        show(trigger, panel);
        requestAnimationFrame(() => {
          qs('a, button', panel)?.focus();
        });
      }
    });

    if (panel.dataset.ghWired) return;
    panel.dataset.ghWired = 'true';

    panel.addEventListener('click', (event) => {
      // Choosing an item closes the menu; clicking whitespace inside does not.
      if (event.target.closest('a, [data-menu-close]')) close();
      else event.stopPropagation();
    });

    // Tabbing past the last item closes and lets focus continue naturally.
    panel.addEventListener('focusout', (event) => {
      if (!panel.contains(event.relatedTarget) && event.relatedTarget !== open?.trigger) close();
    });
  };

  // Bound to the header's lifetime. Without the signal every re-mount (each
  // locale change) left another pair of these on document, forever.
  document.addEventListener('click', () => close(), { signal });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close({ restoreFocus: true });
  }, { signal });

  return { register, close, isOpen: () => Boolean(open) };
}

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
    has to be reachable from every page. Tablet and up it sits in the bar; on a
    phone it moves into the drawer, where §15 wants the extra controls. */
export function languageButton({ compact = true } = {}) {
  const isAr = getLocale() === 'ar';
  return el('button', {
    type: 'button',
    class: compact ? 'c-gh__action' : 'c-gh__m-link',
    // The control names the language it switches TO, in that language — so a
    // reader who cannot read the current one can still find it. lang= declares
    // that, so screen readers pronounce it right and audits don't flag it.
    lang: isAr ? 'en' : 'ar',
    'aria-label': isAr ? 'Switch to English' : 'التبديل إلى العربية',
    onclick: () => setLocale(isAr ? 'en' : 'ar'),
  }, compact
    ? [icon('no-language'), el('span', { class: 'c-gh__action-label' }, isAr ? 'EN' : 'ع')]
    : [el('span', {}, isAr ? 'English' : 'العربية'), icon('no-language', { size: 'sm' })]);
}

export function bookNowButton({ block = false } = {}) {
  return el('a', {
    class: `c-btn c-btn--primary c-gh__cta${block ? ' c-btn--block' : ''}`,
    href: route(BOOK_CTA.href),
    'data-gh-cta': '',
  }, pick(BOOK_CTA, 'label'));
}

/** A service / offer row: icon, title, optional one-line description. §05 */
function menuItem(item, { plain = false } = {}) {
  if (plain) {
    return el('a', { class: 'c-gh__item c-gh__item--plain', href: route(item.href) }, [
      el('span', { class: 'c-gh__item-title' }, pick(item, 'label')),
    ]);
  }
  const desc = pick(item, 'desc');
  return el('a', {
    class: 'c-gh__item',
    href: route(item.href),
    ...(item.external ? { target: '_blank', rel: 'noopener' } : {}),
  }, [
    item.icon ? el('span', { class: 'c-gh__item-icon' }, icon(item.icon, { size: 'sm' })) : null,
    el('span', {}, [
      el('span', { class: 'c-gh__item-title', style: 'display:block' }, pick(item, 'label')),
      desc ? el('span', { class: 'c-gh__item-desc' }, desc) : null,
    ]),
  ]);
}

function menuColumn(column, { plain = false } = {}) {
  return el('div', {}, [
    el('p', { class: 'c-gh__group-title' }, pick(column, 'title')),
    el('div', { class: 'c-gh__group-list' }, column.items.map((i) => menuItem(i, { plain }))),
  ]);
}

/** Returns the channel links as an ARRAY, so callers can place them in their
    own container. Returning an element and reading .children gave a live
    HTMLCollection, which el() cannot append. */
function supportChannelLinks(channels = SUPPORT_CHANNELS) {
  // A channel without an href is one the business has not supplied yet. §27
  return liveChannels(channels).map((c) =>
    el('a', { class: 'c-gh__channel', href: c.href, target: '_blank', rel: 'noopener' }, [
      icon(c.icon, { size: 'lg' }),
      el('span', {}, [
        el('span', { class: 'c-gh__channel-name', style: 'display:block' }, pick(c, 'label')),
        el('span', { class: 'c-gh__channel-meta' }, pick(c, 'meta')),
      ]),
    ]));
}

const supportChannels = (channels) =>
  el('div', { class: 'c-gh__channels' }, supportChannelLinks(channels));

/** A dropdown panel built from a MENUS entry. §05 §06 §07 §08 */
export function menuPanel(menu) {
  const isMega = menu.type === 'mega';
  const plain = menu.id === 'destinations';

  return el('div', {
    class: `c-gh__panel c-gh__panel--${isMega ? 'mega' : 'panel'}`,
    role: 'group',
    'aria-label': pick(menu, 'title'),
    style: isMega ? '' : `--panel-cols:${menu.columns.length}`,
    hidden: true,
  }, [
    menu.channels ? supportChannels(menu.channels) : null,
    el('div', { class: 'c-gh__panel-grid' }, menu.columns.map((c) => menuColumn(c, { plain }))),
    menu.footer
      ? el('div', { class: 'c-gh__panel-foot' }, menu.footer.ctaAr || menu.footer.ctaEn
          ? [
              el('div', {}, [
                el('p', { class: 'c-gh__item-title' }, pick(menu.footer, 'title')),
                el('p', { class: 'c-gh__item-desc' }, pick(menu.footer, 'text')),
              ]),
              el('a', { class: 'c-btn c-btn--secondary-brand c-btn--sm', href: route(menu.footer.href) }, [
                icon('no-chat', { size: 'sm' }),
                el('span', {}, pick(menu.footer, 'cta')),
              ]),
            ]
          : [
              el('span', {}),
              el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route(menu.footer.href) }, [
                el('span', {}, pick(menu.footer, 'link')),
                icon('no-arrow-end', { size: 'sm', flip: true }),
              ]),
            ])
      : null,
  ]);
}

/* ---------------------------------------------------------------------------
   ACCOUNT MENU — §10. Rebuilt whenever the session changes.
   ------------------------------------------------------------------------ */
export function accountPanel() {
  const panel = el('div', {
    class: 'c-gh__panel c-gh__panel--panel c-gh__panel--end',
    role: 'group',
    style: '--panel-cols:1; min-inline-size: 17rem',
    hidden: true,
  });

  const paint = () => {
    const isAr = getLocale() === 'ar';
    const items = session.authenticated ? ACCOUNT_CUSTOMER : ACCOUNT_GUEST;
    panel.replaceChildren();

    if (session.authenticated) {
      panel.append(el('div', { class: 'c-gh__menu-head' }, [
        el('p', { class: 'c-gh__item-title' }, session.name || (isAr ? 'حسابي' : 'My account')),
        el('p', { class: 'c-gh__item-desc' }, isAr ? 'عميل نمبرون' : 'Number One customer'),
      ]));
    } else {
      panel.append(el('div', { class: 'c-gh__menu-head' }, [
        el('p', { class: 'c-gh__item-title' }, isAr ? 'حسابك في نمبرون' : 'Your Number One account'),
        el('p', { class: 'c-gh__item-desc' },
          isAr ? 'تابع حجوزاتك ومستنداتك في مكان واحد.' : 'Track bookings and documents in one place.'),
      ]));
    }

    panel.append(el('div', { class: 'c-gh__menu-list' }, items.map((item) =>
      el('a', {
        class: `c-gh__menu-row${item.divider ? ' c-gh__menu-row--divided' : ''}`,
        href: route(item.href),
      }, [icon(item.icon, { size: 'sm' }), el('span', {}, pick(item, 'label'))]))));

    if (!session.authenticated) {
      panel.append(el('div', { style: 'padding:var(--space-12) var(--space-12) 0' }, [
        el('a', { class: 'c-btn c-btn--primary c-btn--sm c-btn--block', href: route('account/sign-in/') },
          isAr ? 'تسجيل الدخول' : 'Sign in'),
      ]));
    }
  };

  paint();
  sessionListeners.add(paint);
  panel.no = { paint, destroy: () => sessionListeners.delete(paint) };
  return panel;
}

/* ---------------------------------------------------------------------------
   GLOBAL SEARCH — §09. A focused sheet; the header keeps no standing field.
   ------------------------------------------------------------------------ */
export function searchPanel({ onSubmit } = {}) {
  const isAr = getLocale() === 'ar';
  const inputId = uid('gh-search');

  const input = el('input', {
    class: 'c-gh__search-input', id: inputId, type: 'search',
    name: 'q', autocomplete: 'off',
    placeholder: isAr ? 'ابحث عن رحلة، فندق، وجهة أو خدمة' : 'Search flights, hotels, destinations or services',
  });

  const panel = el('div', { class: 'c-gh__search', hidden: true }, [
    el('div', { class: 'l-container' }, [
      el('form', {
        role: 'search',
        onsubmit: (e) => { e.preventDefault(); onSubmit?.(input.value); },
      }, [
        el('label', { class: 'u-visually-hidden', for: inputId }, isAr ? 'بحث' : 'Search'),
        el('div', { class: 'c-gh__search-field' }, [
          icon('no-search', { size: 'lg' }),
          input,
          el('button', { type: 'submit', class: 'c-btn c-btn--primary c-btn--sm' }, isAr ? 'ابحث' : 'Search'),
        ]),
        el('div', { class: 'c-gh__scopes' }, SEARCH_SCOPES.map((s) =>
          el('a', { class: 'c-chip', href: route(`search/?scope=${s.id}`) }, [
            icon(s.icon, { size: 'sm' }), el('span', {}, pick(s, 'label')),
          ]))),
      ]),
    ]),
  ]);

  panel.no = { focus: () => input.focus(), input };
  return panel;
}

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
    el('div', { class: 'c-gh__m-item' }, languageButton({ compact: false })),
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
  const search = searchPanel({ onSubmit: onSearch });
  const searchTrigger = el('button', {
    type: 'button', class: 'c-gh__action',
    'aria-label': isAr ? 'بحث' : 'Search',
  }, [icon('no-search'), el('span', { class: 'c-gh__action-label' }, isAr ? 'بحث' : 'Search')]);
  menus.register(searchTrigger, search);
  searchTrigger.addEventListener('click', () => {
    if (searchTrigger.getAttribute('aria-expanded') === 'true') {
      requestAnimationFrame(() => search.no.focus());
    }
  });

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
      search,
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
