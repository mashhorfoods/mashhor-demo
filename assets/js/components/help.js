/* ============================================================================
   COMPONENTS / HELP — the public help centre (help/) and contact door
   (help/contact/). Both reuse existing pieces rather than inventing new
   ones: supportPanels() (home.js) for "what kind of help", channelList()
   (ui.js) for the live channels, the shared attributionChip() (booking.js) for "who brought you here", and the
   MENU_HELP/BOOK_CTA data records (navigation.js) for the quick-link
   cards — one source of truth for labels, shared with the header menu
   and footer that already point here.
   ========================================================================= */

import { el, qs, render } from '../core/dom.js';
import { t, pick } from '../core/i18n.js';
import { route, bookingEntry } from '../data/config.js';
import { BOOK_CTA, MENU_HELP, liveChannels } from '../data/navigation.js';
import { HOME_SUPPORT } from '../data/home.js';
import { icon, channelList } from './ui.js';
import { supportPanels } from './home.js';
import { attributionChip } from './booking.js';
import { attributionFrom } from '../core/booking.js';

/* Quick links: "start a booking" plus the two help-centre doors that are
   not this page itself — contact and manage-my-booking. Labels/icons come
   from the same data the header's Help menu and footer already draw from,
   so this list can never say something different than they do. */
/* The page's own <h1> — sectionHead() (ui.js) renders an <h2>, meant for a
   subsection under a page that already carries its own h1 (a hero, a listing
   header). These are standalone pages with nothing else to hold that role,
   so the title needs its own h1, same as legal.js's terms/privacy pages. */
const pageHead = ({ id, overline, title, text }) => el('div', { class: 'l-stack l-stack--12' }, [
  overline ? el('p', { class: 't-overline' }, overline) : null,
  el('h1', { class: 't-h1 u-mark', id }, title),
  text ? el('p', { class: 't-body t-muted' }, text) : null,
]);

const quickLinks = () => {
  const items = [BOOK_CTA, ...MENU_HELP.columns[0].items.filter((i) => i.id === 'contact' || i.id === 'manage')];
  return el('div', { class: 'l-auto-grid', style: '--min-col:14rem' }, items.map((item) =>
    el('a', { class: 'c-card c-card--interactive c-help-link', href: route(item.href) }, [
      el('span', { class: 'c-help-link__icon' }, icon(item.icon, { size: 'md' })),
      el('span', { class: 'c-help-link__label' }, pick(item, 'label')),
    ])));
};

/** help/ — the help centre landing. */
export function mountHelp({ root = document } = {}) {
  const host = qs('[data-help="main"]', root);
  render(host, [
    pageHead({ id: 'help-title', overline: t('help.overline'), title: t('help.title'), text: t('help.lead') }),
    quickLinks(),
    supportPanels(HOME_SUPPORT, liveChannels()),
  ]);
  return {};
}

/** help/contact/ — reads ?supervisor=<slug> the same way book/ does, and
    keeps that coordinator attached to the booking CTA below. */
export function mountHelpContact({ root = document } = {}) {
  const host = qs('[data-help-contact="main"]', root);
  const attribution = attributionFrom(new URLSearchParams(location.search));
  render(host, [
    pageHead({ id: 'help-contact-title', overline: t('help.contact.overline'), title: t('help.contact.title'), text: t('help.contact.lead') }),
    attributionChip(attribution),
    channelList(liveChannels()),
    el('div', { class: 'l-cluster l-cluster--12' }, [
      el('a', { class: 'c-btn c-btn--primary', href: route(bookingEntry({ supervisor: attribution?.supervisor })) }, t('sup.cta.book')),
    ]),
  ]);
  return { attribution };
}
