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
import { icon, channelList, setButtonState } from './ui.js';
import { supportPanels } from './home.js';
import { attributionChip } from './booking.js';
import { stateBlock } from './states.js';
import { attributionFrom } from '../core/booking.js';
import { field, applyErrors, statusLine, submitButton } from '../core/portal-form.js';
import { contactAvailable, sendContact } from '../core/leads.js';

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
    // supportPanels() titles its two panels with <h3>s (elsewhere they sit under a section's <h2>): give them
    // their <h2> here too, for screen readers only, so the outline doesn't jump from the page's <h1>.
    el('h2', { class: 'u-visually-hidden' }, t('home.support.title')),
    supportPanels(HOME_SUPPORT, liveChannels()),
  ]);
  return {};
}

/** help/contact/ — reads ?supervisor=<slug> the same way book/ does, and
    keeps that coordinator attached to the booking CTA below. */
export function mountHelpContact({ root = document } = {}) {
  const host = qs('[data-help-contact="main"]', root);
  const attribution = attributionFrom(new URLSearchParams(location.search));
  const form = contactAvailable() ? contactForm(attribution) : null;
  render(host, [
    pageHead({ id: 'help-contact-title', overline: t('help.contact.overline'), title: t('help.contact.title'), text: t('help.contact.lead') }),
    attributionChip(attribution),
    channelList(liveChannels()),
    form,
    el('div', { class: 'l-cluster l-cluster--12' }, [
      // The form's submit is the page's one red action when the form is offered; the booking door steps back.
      el('a', { class: `c-btn ${form ? 'c-btn--secondary' : 'c-btn--primary'}`, href: route(bookingEntry({ supervisor: attribution?.supervisor })) }, t('sup.cta.book')),
    ]),
  ]);
  return { attribution, form };
}

/* The contact form (Phase 6): a message becomes a lead — for the visitor's attributed supervisor when there is one,
   otherwise for operations (core/leads.js decides where it goes: the backend, or the dev store). */
const textareaField = ({ id, name, labelKey }) => el('div', { class: 'c-field', dataset: { field: name } }, [
  el('label', { class: 'c-field__label', for: id }, [t(labelKey), el('span', { class: 'c-field__required', 'aria-hidden': 'true' }, '*')]),
  el('textarea', { class: 'c-field__control', id, name, rows: 5, maxlength: 2000, required: true }),
  el('p', { class: 'c-field__error', id: `${id}-err`, role: 'alert', hidden: true }),
]);
function contactForm(attribution) {
  const status = statusLine();
  const button = submitButton('help.contact.form.send');
  const section = el('section', { class: 'c-card l-stack l-stack--16', 'aria-labelledby': 'contact-form-title', dataset: { contactForm: '' } });
  const form = el('form', { class: 'l-stack l-stack--16', novalidate: true, dataset: { form: 'contact' } }, [
    field({ id: 'contact-name', name: 'name', labelKey: 'help.contact.form.name', autocomplete: 'name', attrs: { maxlength: 120 } }),
    field({ id: 'contact-email', name: 'email', labelKey: 'help.contact.form.email', type: 'email', autocomplete: 'email', dir: 'ltr', required: false, help: 'help.contact.form.reachHelp' }),
    field({ id: 'contact-phone', name: 'phone', labelKey: 'help.contact.form.phone', type: 'tel', autocomplete: 'tel', dir: 'ltr', inputmode: 'tel', required: false }),
    textareaField({ id: 'contact-message', name: 'message', labelKey: 'help.contact.form.message' }),
    status, button,
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(['name', 'email', 'phone', 'message'].map((k) => [k, String(form.elements[k].value ?? '').trim()]));
    const errors = {};
    if (!v.name) errors.name = t('bk.err.required');
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) errors.email = t('bk.err.email');
    if (v.phone && !/^\+?[\d\s()-]{7,20}$/.test(v.phone)) errors.phone = t('bk.err.phone');
    if (!v.email && !v.phone) errors.email = t('help.contact.form.reachRequired');
    if (!v.message) errors.message = t('bk.err.required');
    if (applyErrors(form, errors, status)) return;
    status.textContent = ''; delete status.dataset.tone; setButtonState(button, 'loading');
    try {
      await sendContact({ ...v, supervisor: attribution?.supervisor ?? null });
      section.replaceChildren(stateBlock({ variant: 'success', headingLevel: 2, title: t('help.contact.form.sent.title'), text: t('help.contact.form.sent.text') }));
      section.dataset.contactSent = 'true';
    } catch {
      setButtonState(button, 'idle'); status.dataset.tone = 'error'; status.textContent = t('help.contact.form.failed');
    }
  });
  section.append(
    el('div', { class: 'l-stack l-stack--8' }, [el('h2', { class: 't-h3', id: 'contact-form-title' }, t('help.contact.form.title')), el('p', { class: 't-body t-muted' }, t('help.contact.form.text'))]),
    form,
  );
  return section;
}
