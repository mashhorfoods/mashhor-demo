/* ============================================================================
   ACCOUNT / UI / DOCUMENTS — what the booking system issued and what the
   customer uploaded; every view goes through a temporary link. Stage 12.1

   Viewing: customer.documentUrl(id) → { url, expiresAt } — the backend
   authorises and signs; the viewer shows the file until the link lapses,
   then offers a new one. Nothing here is a permanent URL. Uploading:
   client-side size/type checks for immediacy, the backend enforces them.
   ========================================================================= */

import { el, render, uid, lockScroll, unlockScroll, trapFocus } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { money, dateShort, time } from '../../core/format.js';
import { route } from '../../data/config.js';
import { ENV } from '../../data/env.js';
import { icon, setButtonState, toast } from '../../components/ui.js';
import { stateBlock, loadingBlock } from '../../components/states.js';
import { customer } from '../customer.js';
import { AuthError, signInHref } from '../auth.js';
import { track } from '../../core/diagnostics.js';
import { mountAccount, loadRegion, pageTitle, rows, serviceName, statusBadge, payBadge, errorText, here } from './shell.js';
import { setError, statusLine } from '../../core/portal-form.js';

const TYPE_ICON = { eticket: 'no-ticket', confirmation: 'no-check-circle', visa: 'no-visa', receipt: 'no-payment', customer: 'no-documents' };
const typeLabel = (d) => (d.type === 'customer' || d.kind === 'customer' ? (d.title || t('acct.docs.type.customer')) : t(`acct.docs.type.${d.type}`));
const mb = (bytes) => Math.round((bytes / 1048576) * 10) / 10;
const typeNames = (list) => list.map((m) => ({ 'application/pdf': 'PDF', 'image/jpeg': 'JPEG', 'image/png': 'PNG' }[m] ?? m)).join(', ');

/** An issued document rendered from booking data (what the development adapter "signs"). */
export function documentView(d) {
  const b = d.booking ?? {}; const det = b.detail ?? {};
  return el('article', { class: 'c-acct-docview', dataset: { document: d.id, type: d.type } }, [
    el('header', { class: 'c-acct-docview__head' }, [el('p', { class: 't-overline' }, 'Travel & Tourism'), el('h3', { class: 't-h3' }, typeLabel(d))]),
    d.dev ? el('p', { class: 'c-note c-note--warning', role: 'note', dataset: { dev: 'true' } }, [icon('no-alert', { size: 'sm' }), el('span', { class: 'c-note__text' }, t('acct.docs.devDoc'))]) : null,
    rows([
      [t('acct.reference'), el('bdi', { dir: 'ltr' }, b.id ?? '')], [t('acct.service'), serviceName(b.service)], [t('acct.trip'), d.trip ? pick(d.trip, 'title') : null],
      det.route ? [t('acct.booking.route'), el('bdi', { dir: 'ltr' }, det.route)] : null, det.dates ? [t('acct.dates'), det.dates.map(dateShort).join(' · ')] : null,
      det.carrierAr ? [t('acct.booking.carrier'), `${pick(det, 'carrier')} · ${det.flights}`] : null, det.travellers ? [t('acct.travellers'), String(det.travellers)] : null,
      d.type === 'receipt' && b.amount ? [t('acct.amount'), money(b.amount, b.currency)] : null,
      b.status ? [t('acct.status'), statusBadge(b.status)] : null, d.type === 'receipt' ? [t('acct.paymentStatus'), payBadge(b.paymentStatus)] : null,
      [t('acct.docs.issued'), d.issuedAt ? dateShort(d.issuedAt) : t('acct.docs.pending')],
    ].filter(Boolean)),
  ]);
}

/** The viewer: asks for a temporary link, shows the file, renews the link when it lapses. */
export function openDocument(d, { onDeleted = null } = {}) {
  const id = uid('doc'); let timer = null;
  const body = el('div', { class: 'c-modal__body', dataset: { viewer: d.id } });
  const openLink = el('a', { class: 'c-btn c-btn--secondary', target: '_blank', rel: 'noopener', hidden: true, dataset: { action: 'open' } }, [icon('no-arrow-end', { size: 'sm', flip: true }), el('span', {}, t('acct.docs.open'))]);
  const expiry = el('p', { class: 't-body-sm t-muted', role: 'status', 'aria-live': 'polite', dataset: { expiry: '' } });
  const dialog = el('dialog', { class: 'c-modal c-modal--wide', 'aria-labelledby': `${id}-title`, dataset: { dialog: 'document', state: 'loading' } }, [
    el('div', { class: 'c-modal__head' }, [el('h2', { class: 't-h3', id: `${id}-title` }, [typeLabel(d), d.booking?.id ? [' · ', el('bdi', { dir: 'ltr' }, d.booking.id)] : null].flat()), el('button', { type: 'button', class: 'c-btn c-btn--utility', 'aria-label': t('acct.docs.close'), onclick: () => dialog.close() }, icon('no-close'))]),
    body,
    el('div', { class: 'c-modal__foot' }, [expiry, el('button', { type: 'button', class: 'c-btn c-btn--secondary', onclick: () => dialog.close() }, t('acct.docs.close')), openLink, el('button', { type: 'button', class: 'c-btn c-btn--primary', dataset: { action: 'print' }, onclick: () => window.print() }, [icon('no-documents', { size: 'sm' }), el('span', {}, t('acct.docs.print'))])]),
  ]);
  const expired = () => { dialog.dataset.state = 'expired'; openLink.hidden = true; expiry.textContent = ''; render(body, stateBlock({ variant: 'warning', iconName: 'no-expired', headingLevel: 3, title: t('acct.docs.linkExpired.title'), text: t('acct.docs.linkExpired.text'), actions: [{ id: 'renew', label: t('acct.docs.renew'), variant: 'c-btn--primary', onClick: load }] })); };
  const load = async () => {
    clearTimeout(timer); dialog.dataset.state = 'loading'; openLink.hidden = true; expiry.textContent = t('acct.docs.preparing'); render(body, loadingBlock(t('acct.docs.preparing')));
    try {
      const link = await customer.documentUrl(d.id);
      if (link.expiresAt && Date.parse(link.expiresAt) <= Date.now()) { expired(); return; }
      dialog.dataset.state = 'ready';
      if (link.rendered || !link.url) { render(body, documentView(d)); }
      else {
        const ct = d.contentType ?? ''; openLink.href = link.url; openLink.hidden = false;
        render(body, ct.startsWith('image/') ? el('img', { class: 'c-acct-docview__img', src: link.url, alt: typeLabel(d) })
          : ct === 'application/pdf' ? el('iframe', { class: 'c-acct-docview__frame', src: link.url, title: typeLabel(d) })
          : stateBlock({ variant: 'info', headingLevel: 3, title: t('acct.docs.noPreview'), actions: [{ label: t('acct.docs.open'), href: link.url, variant: 'c-btn--primary' }] }));
      }
      if (link.expiresAt) { expiry.textContent = `${t('acct.docs.linkExpires')} ${time(link.expiresAt)}`; timer = setTimeout(expired, Math.max(0, Date.parse(link.expiresAt) - Date.now())); } else expiry.textContent = '';
    } catch (error) {
      if (error instanceof AuthError) { location.assign(signInHref(here())); return; }
      const code = error?.code ?? 'failed'; track('document.failure', { code, action: 'url' }); dialog.dataset.state = 'error'; expiry.textContent = '';
      render(body, code === 'notFound' || code === 'forbidden'
        ? stateBlock({ variant: 'empty', headingLevel: 3, title: t('acct.docs.gone.title'), text: t('acct.docs.gone.text'), actions: [{ label: t('acct.docs.close'), variant: 'c-btn--primary', onClick: () => dialog.close() }] })
        : code === 'expired' ? null : stateBlock({ variant: 'error', headingLevel: 3, title: t('acct.state.error.title'), text: errorText(code), actions: [{ id: 'retry', label: t('acct.retry'), variant: 'c-btn--primary', onClick: load }, { label: t('acct.support.open'), href: route('account/support/') }] }));
      if (code === 'expired') expired();
    }
  };
  dialog.addEventListener('close', () => { clearTimeout(timer); unlockScroll(); dialog.remove(); document.body.classList.remove('is-printing-doc'); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog); dialog.showModal(); lockScroll(); document.body.classList.add('is-printing-doc'); const release = trapFocus(dialog); dialog.addEventListener('close', () => release?.());
  load();
  return { dialog, reload: load };
}

/** The upload dialog. Resolves with the created document or null. */
export function uploadDialog() {
  return new Promise((resolve) => {
    const p = uid('up'); const limit = ENV.documentService?.maxBytes ?? 5 * 1048576; const accept = ENV.documentService?.accept ?? [];
    const status = statusLine();
    const save = el('button', { type: 'submit', class: 'c-btn c-btn--primary' }, [el('span', { class: 'c-btn__label' }, t('acct.docs.uploadAction')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
    const file = el('input', { class: 'c-field__control', type: 'file', id: `${p}-file`, name: 'file', accept: accept.join(','), required: true, 'aria-describedby': `${p}-file-help` });
    const title = el('input', { class: 'c-field__control', type: 'text', id: `${p}-title`, name: 'title', maxlength: 120, autocomplete: 'off' });
    const err = (name, message) => { const c = setError(form, name, message); if (message) c?.focus(); };
    const form = el('form', { class: 'c-modal__form', method: 'dialog', novalidate: true, dataset: { form: 'upload' } }, [
      el('div', { class: 'c-modal__head' }, [el('h2', { class: 't-h3', id: `${p}-title-h` }, t('acct.docs.upload')), el('button', { type: 'button', class: 'c-btn c-btn--utility', 'aria-label': t('acct.trv.cancel'), onclick: () => dialog.close('cancel') }, icon('no-close'))]),
      el('div', { class: 'c-modal__body l-stack l-stack--16' }, [
        el('div', { class: 'c-field', dataset: { field: 'file' } }, [el('label', { class: 'c-field__label', for: `${p}-file` }, [t('acct.docs.uploadFile'), el('span', { class: 'c-field__required', 'aria-hidden': 'true' }, '*')]), file, el('p', { class: 'c-field__help', id: `${p}-file-help` }, t('acct.docs.uploadHint', mb(limit), typeNames(accept))), el('p', { class: 'c-field__error', id: `${p}-file-err`, role: 'alert', hidden: true })]),
        el('div', { class: 'c-field', dataset: { field: 'title' } }, [el('label', { class: 'c-field__label', for: `${p}-title` }, t('acct.docs.uploadTitle')), title, el('p', { class: 'c-field__error', id: `${p}-title-err`, role: 'alert', hidden: true })]),
        el('p', { class: 't-body-sm t-muted' }, t('acct.trv.privacy')), status,
      ]),
      el('div', { class: 'c-modal__foot' }, [el('button', { type: 'button', class: 'c-btn c-btn--secondary', onclick: () => dialog.close('cancel') }, t('acct.trv.cancel')), save]),
    ]);
    const dialog = el('dialog', { class: 'c-modal', 'aria-labelledby': `${p}-title-h`, dataset: { dialog: 'upload' } }, form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err('file', null); err('title', null);
      const f = file.files?.[0];
      if (!f) { err('file', t('auth.err.required')); return; }
      if (f.size > limit) { err('file', t('acct.err.tooLarge')); return; }
      if (accept.length && !accept.includes(f.type)) { err('file', t('acct.err.unsupported')); return; }
      setButtonState(save, 'loading'); status.dataset.tone = ''; status.textContent = t('acct.docs.uploading');
      try { const doc = await customer.uploadDocument({ file: f, title: title.value.trim() || f.name, type: 'customer' }); dialog.close('saved'); resolve(doc); }
      catch (error) { setButtonState(save, 'idle'); const code = error?.code ?? 'failed'; track('document.failure', { code, action: 'upload' }); status.dataset.tone = 'error'; status.textContent = code === 'tooLarge' || code === 'unsupported' ? '' : `${errorText(code)} ${t('acct.err.support')}`; if (code === 'tooLarge' || code === 'unsupported') err('file', errorText(code)); if (error instanceof AuthError) location.assign(signInHref(here())); }
    });
    dialog.addEventListener('close', () => { unlockScroll(); dialog.remove(); if (dialog.returnValue !== 'saved') resolve(null); });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close('cancel'); });
    document.body.append(dialog); dialog.showModal(); lockScroll(); const release = trapFocus(dialog); dialog.addEventListener('close', () => release?.()); file.focus();
  });
}

const row = (d, { onDelete }) => el('article', { class: 'c-card c-acct-docrow', dataset: { doc: d.id, docStatus: d.status, type: d.type, kind: d.kind ?? 'issued' } }, [
  el('div', { class: 'c-acct-booking__icon' }, icon(TYPE_ICON[d.type] ?? 'no-documents', { size: 'lg' })),
  el('div', { class: 'c-acct-booking__body' }, [
    el('h3', { class: 'c-acct-booking__title' }, typeLabel(d)),
    el('p', { class: 't-body-sm t-muted' }, [d.trip ? pick(d.trip, 'title') : d.booking ? serviceName(d.booking.service) : (d.kind === 'customer' ? t('acct.docs.byYou') : ''), d.bookingId ? [' · ', el('bdi', { dir: 'ltr' }, d.bookingId)] : null, d.issuedAt ? [' · ', dateShort(d.issuedAt)] : null, d.size ? [' · ', `${mb(d.size)} MB`] : null].flat().filter(Boolean)),
    el('div', { class: 'c-acct-booking__badges' }, [el('span', { class: `c-badge ${d.status === 'available' ? 'c-badge--success' : 'c-badge--warning'}` }, t(d.status === 'available' ? 'acct.docs.available' : 'acct.docs.pending')), d.kind === 'customer' ? el('span', { class: 'c-badge c-badge--outline' }, t('acct.docs.byYou')) : null]),
  ]),
  el('div', { class: 'c-acct-trv__actions' }, [
    d.status === 'available' ? el('button', { type: 'button', class: 'c-btn c-btn--secondary c-btn--sm', dataset: { action: 'view' }, onclick: () => openDocument(d) }, t('acct.docs.view')) : null,
    d.deletable ? el('button', { type: 'button', class: 'c-btn c-btn--tertiary c-btn--sm', dataset: { action: 'delete' }, onclick: () => onDelete(d) }, t('acct.docs.delete')) : null,
  ]),
]);

export function mountDocuments({ root = document, params = new URLSearchParams(location.search) } = {}) {
  return mountAccount({ root, id: 'documents', head: 'page.account.documents', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'documents' } });
    const uploadBtn = el('button', { type: 'button', class: 'c-btn c-btn--primary', dataset: { action: 'upload' } }, [icon('no-plus', { size: 'sm' }), el('span', {}, t('acct.docs.upload'))]);
    main.replaceChildren(el('div', { class: 'c-acct-trip__head' }, [pageTitle('acct.docs.title', 'acct.docs.text'), uploadBtn]), host);
    const onDelete = async (d) => { if (!confirm(t('acct.docs.deleteConfirm'))) return; try { await customer.deleteDocument(d.id); toast({ title: t('acct.docs.deleted'), variant: 'success' }); region.run(); } catch (error) { track('document.failure', { code: error?.code ?? 'failed', action: 'delete' }); toast({ title: errorText(error?.code), variant: 'error' }); } };
    const region = loadRegion(host, () => customer.documents(), {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-documents', headingLevel: 2, title: t('acct.docs.empty.title'), text: t('acct.docs.empty.text'), actions: [{ id: 'upload', label: t('acct.docs.upload'), variant: 'c-btn--primary', onClick: () => uploadBtn.click() }, { label: t('acct.bookings.title'), href: route('account/bookings/') }] }),
      paint: (list) => { const wanted = params.get('id'); const hit = wanted && list.find((d) => d.id === wanted && d.status === 'available'); if (hit) queueMicrotask(() => openDocument(hit)); return el('div', { class: 'c-acct-list' }, [...list].sort((a, b) => String(b.issuedAt ?? '').localeCompare(String(a.issuedAt ?? ''))).map((d) => row(d, { onDelete }))); },
    });
    uploadBtn.addEventListener('click', async () => { const doc = await uploadDialog(); if (doc) { toast({ title: t('acct.docs.uploaded'), variant: 'success' }); region.run(); } });
    await region.run();
    return { refresh: region.run, open: openDocument, upload: () => uploadBtn.click() };
  } });
}
