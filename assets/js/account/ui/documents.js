/* ACCOUNT / UI / DOCUMENTS — what the booking system issued, each tied to its booking and trip. Stage 12 */
import { el, render, uid, lockScroll, unlockScroll, trapFocus } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { money, dateShort } from '../../core/format.js';
import { route } from '../../data/config.js';
import { icon } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { customer } from '../customer.js';
import { mountAccount, loadRegion, pageTitle, rows, serviceName, statusBadge, payBadge } from './shell.js';

const TYPE_ICON = { eticket: 'no-ticket', confirmation: 'no-check-circle', visa: 'no-visa', receipt: 'no-payment' };

/** The document itself, rendered from booking data (a development document while the dev adapter is registered). */
export function documentView(d) {
  const b = d.booking ?? {}; const det = b.detail ?? {};
  return el('article', { class: 'c-acct-docview', dataset: { document: d.id, type: d.type } }, [
    el('header', { class: 'c-acct-docview__head' }, [el('p', { class: 't-overline' }, 'Number One Travel & Tourism'), el('h3', { class: 't-h3' }, t(`acct.docs.type.${d.type}`))]),
    d.dev ? el('p', { class: 'c-note c-note--warning', role: 'note', dataset: { dev: 'true' } }, [icon('no-alert', { size: 'sm' }), el('span', { class: 'c-note__text' }, t('acct.docs.devDoc'))]) : null,
    rows([
      [t('acct.reference'), el('bdi', { dir: 'ltr' }, b.id ?? '')], [t('acct.service'), serviceName(b.service)], [t('acct.trip'), d.trip ? pick(d.trip, 'title') : null],
      det.route ? [t('acct.booking.route'), el('bdi', { dir: 'ltr' }, det.route)] : null, det.dates ? [t('acct.dates'), det.dates.map(dateShort).join(' · ')] : null,
      det.carrierAr ? [t('acct.booking.carrier'), `${pick(det, 'carrier')} · ${det.flights}`] : null, det.travellers ? [t('acct.travellers'), String(det.travellers)] : null,
      d.type === 'receipt' && b.amount ? [t('acct.amount'), money(b.amount, b.currency)] : null,
      [t('acct.status'), statusBadge(b.status)], d.type === 'receipt' ? [t('acct.paymentStatus'), payBadge(b.paymentStatus)] : null,
      [t('acct.docs.issued'), d.issuedAt ? dateShort(d.issuedAt) : t('acct.docs.pending')],
    ].filter(Boolean)),
  ]);
}
export function openDocument(d) {
  const id = uid('doc');
  const dialog = el('dialog', { class: 'c-modal c-modal--wide', 'aria-labelledby': `${id}-title`, dataset: { dialog: 'document' } }, [
    el('div', { class: 'c-modal__head' }, [el('h2', { class: 't-h3', id: `${id}-title` }, [t(`acct.docs.type.${d.type}`), ' · ', el('bdi', { dir: 'ltr' }, d.booking?.id ?? '')]), el('button', { type: 'button', class: 'c-btn c-btn--utility', 'aria-label': t('acct.docs.close'), onclick: () => dialog.close() }, icon('no-close'))]),
    el('div', { class: 'c-modal__body' }, documentView(d)),
    el('div', { class: 'c-modal__foot' }, [el('button', { type: 'button', class: 'c-btn c-btn--secondary', onclick: () => dialog.close() }, t('acct.docs.close')), el('button', { type: 'button', class: 'c-btn c-btn--primary', dataset: { action: 'print' }, onclick: () => window.print() }, [icon('no-documents', { size: 'sm' }), el('span', {}, t('acct.docs.print'))])]),
  ]);
  dialog.addEventListener('close', () => { unlockScroll(); dialog.remove(); document.body.classList.remove('is-printing-doc'); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog); dialog.showModal(); lockScroll(); document.body.classList.add('is-printing-doc'); const release = trapFocus(dialog); dialog.addEventListener('close', () => release?.());
  return dialog;
}

const row = (d) => el('article', { class: 'c-card c-acct-docrow', dataset: { doc: d.id, docStatus: d.status, type: d.type } }, [
  el('div', { class: 'c-acct-booking__icon' }, icon(TYPE_ICON[d.type] ?? 'no-documents', { size: 'lg' })),
  el('div', { class: 'c-acct-booking__body' }, [
    el('h3', { class: 'c-acct-booking__title' }, t(`acct.docs.type.${d.type}`)),
    el('p', { class: 't-body-sm t-muted' }, [d.trip ? pick(d.trip, 'title') : serviceName(d.booking?.service), ' · ', el('bdi', { dir: 'ltr' }, d.bookingId), d.issuedAt ? [' · ', dateShort(d.issuedAt)] : null].flat()),
    el('span', { class: `c-badge ${d.status === 'available' ? 'c-badge--success' : 'c-badge--warning'}` }, t(d.status === 'available' ? 'acct.docs.available' : 'acct.docs.pending')),
  ]),
  d.status === 'available' ? el('button', { type: 'button', class: 'c-btn c-btn--secondary c-btn--sm', dataset: { action: 'view' }, onclick: () => openDocument(d) }, t('acct.docs.view')) : null,
]);

export function mountDocuments({ root = document, params = new URLSearchParams(location.search) } = {}) {
  return mountAccount({ root, id: 'documents', head: 'page.account.documents', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'documents' } });
    main.replaceChildren(pageTitle('acct.docs.title', 'acct.docs.text'), host);
    const region = loadRegion(host, () => customer.documents(), {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-documents', headingLevel: 2, title: t('acct.docs.empty.title'), text: t('acct.docs.empty.text'), actions: [{ label: t('acct.bookings.title'), href: route('account/bookings/'), variant: 'c-btn--primary' }] }),
      paint: (list) => { const wanted = params.get('id'); const hit = wanted && list.find((d) => d.id === wanted && d.status === 'available'); if (hit) queueMicrotask(() => openDocument(hit)); return el('div', { class: 'c-acct-list' }, [...list].sort((a, b) => String(b.issuedAt ?? '').localeCompare(String(a.issuedAt ?? ''))).map(row)); },
    });
    await region.run();
    return { refresh: region.run, open: openDocument };
  } });
}
