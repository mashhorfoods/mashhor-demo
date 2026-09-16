/* ============================================================================
   COMPONENTS / MENUS — the one-open-at-a-time controller (§22 keyboard
   model) and the panels it opens: mega and dropdown menus from MENUS, the
   account menu from the session. Stage 10.12 split out of header.js
   ========================================================================= */

import { el, qs, uid } from '../core/dom.js';
import { getLocale, pick } from '../core/i18n.js';
import { route } from '../data/config.js';
import { SUPPORT_CHANNELS, liveChannels, ACCOUNT_GUEST, ACCOUNT_CUSTOMER } from '../data/navigation.js';
import { icon } from './ui.js';
import { session, sessionListeners } from './session.js';

/* ---------------------------------------------------------------------------
   MENU CONTROLLER — one open panel at a time, for the whole header.
   ------------------------------------------------------------------------ */
export function createMenuController(scrim, { signal } = {}) {
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
      // An open panel is the next thing in reading order: Tab enters it
      // rather than skipping to the next trigger and leaving it open. Stage 10.11
      if (event.key === 'Tab' && !event.shiftKey && open?.trigger === trigger && !panel.hidden) {
        const first = qs('a, button, input, select, textarea', panel);
        if (first) { event.preventDefault(); first.focus(); }
      }
    });
    // Leaving the trigger for anything but its panel closes it.
    trigger.addEventListener('focusout', (event) => {
      if (open?.trigger === trigger && event.relatedTarget && !panel.contains(event.relatedTarget)) close();
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
export function supportChannelLinks(channels = SUPPORT_CHANNELS) {
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
