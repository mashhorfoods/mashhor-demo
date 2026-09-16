/* ============================================================================
   BOOKING / UI / CONFIRMATION — the end of the journey. Stage 11
   Reference, status, customer, service, trip, date, payment, total, ticket
   status (never "issued" unless the system said so), next steps, actions.
   ========================================================================= */

import { el } from '../../core/dom.js';
import { t, pick, getLocale } from '../../core/i18n.js';
import { money, dateShort } from '../../core/format.js';
import { route } from '../../data/config.js';
import { supervisorBySlug } from '../../data/supervisors.js';
import { icon } from '../../components/ui.js';
import { loadJourney, stepUrl, guard, attributionOf } from '../journey.js';
import { devNotice, progress, tripCard, recoveryState, legSummary, put, setHead, carrierName, isAr } from './shared.js';

export function mountConfirmation({ root = document } = {}) {
  setHead('page.booking.confirmation');
  const j = loadJourney();
  const mode = j.context?.mode === 'request' ? 'request' : 'search';
  const blocked = guard('confirmation', j);
  put('progress', progress('confirmation', { mode }), root);
  if (blocked) { put('main', recoveryState(blocked), root); put('aside', null, root); return { blocked }; }
  const b = j.booking; const ctx = j.context; const offer = j.selection?.offer ?? null;
  const request = b.status === 'received';
  put('notice', j.search?.meta?.dev ? devNotice() : null, root);
  put('summary', tripCard({ journey: j, editHref: null }), root);
  const lead = Object.values(j.travellers ?? {})[0];
  const sup = attributionOf(j); const supRec = sup ? supervisorBySlug(sup.supervisor) : null;
  const row = (k, v) => (v ? el('div', { class: 'c-rules__row' }, [el('dt', {}, t(k)), el('dd', {}, v)]) : null);
  const titleKey = request ? 'bk.confirm.requestTitle' : b.status === 'confirmed' ? 'bk.confirm.title' : 'bk.confirm.processingTitle';
  put('main', el('div', { class: 'c-confirm' }, [
    el('div', { class: 'c-confirm__head' }, [
      el('span', { class: 'c-confirm__icon' }, icon('no-check-circle', { size: 'xl' })),
      el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1', id: 'confirm-title' }, t(titleKey)), el('p', { class: 't-body t-muted' }, t(request ? 'bk.confirm.requestText' : 'bk.confirm.text')),
        el('p', {}, [el('span', { class: 't-overline' }, t('bk.confirm.reference')), el('br'), el('bdi', { class: 'c-confirm__ref', dir: 'ltr', dataset: { reference: b.reference } }, b.reference)]),
        b.messageAr ? el('p', { class: 'c-note', role: 'note' }, [icon('no-info', { size: 'sm' }), el('span', { class: 'c-note__text' }, isAr() ? b.messageAr : b.messageEn)]) : null]),
    ]),
    el('section', { class: 'c-review-block', 'aria-label': t('bk.confirm.trip') }, el('dl', { class: 'c-rules' }, [
      row('bk.confirm.customer', lead ? `${lead.firstName} ${lead.lastName}` : ''),
      row('bk.confirm.service', t(`search.${ctx.service}`)),
      row('bk.confirm.trip', offer ? `${carrierName(offer.carrier)} · ${offer.legs.map((l) => `${dateShort(l.departAt)} ${legSummary(l)}`).join(' / ')}` : [ctx.origin, ctx.destination].filter(Boolean).join(' → ')),
      row('bk.confirm.date', dateShort(b.at)),
      row('bk.confirm.paymentStatus', request || !b.total ? t('bk.confirm.notCharged') : `${t('bk.confirm.paid')} · ${money(b.total, b.currency)}`),
      offer ? row('bk.confirm.ticket', b.ticketed ? t('status.confirmed') : t('bk.confirm.ticketPending')) : null,
      supRec ? row('bk.summary.supervisor', pick(supRec, 'name') || t('sup.name.fallback')) : null,
    ])),
    el('section', { class: 'l-stack l-stack--8', 'aria-labelledby': 'next-title' }, [el('h2', { class: 't-h3', id: 'next-title' }, t('bk.confirm.next')),
      el('ol', { class: 'c-inclusions', role: 'list' }, ['bk.confirm.next1', 'bk.confirm.next2', 'bk.confirm.next3'].map((k) => el('li', {}, [icon('no-check', { size: 'sm' }), el('span', {}, t(k))])))]),
    el('div', { class: 'c-journey__actions c-confirm__actions' }, [
      el('div', { class: 'l-cluster l-cluster--8' }, [
        el('a', { class: 'c-btn c-btn--primary', href: route(`trips/${encodeURIComponent(b.reference)}/`), title: t('bk.confirm.viewTripSoon') }, t('bk.confirm.viewTrip')),
        el('button', { type: 'button', class: 'c-btn c-btn--secondary', onclick: () => window.print() }, [icon('no-documents', { size: 'sm' }), el('span', {}, t('bk.confirm.download'))]),
        el('a', { class: 'c-btn c-btn--secondary', href: route('help/contact/') }, t('bk.confirm.support')),
      ]),
      el('a', { class: 'c-btn c-btn--tertiary', href: route('book/') }, t('bk.confirm.newSearch')),
    ]),
  ]), root);
  return { booking: b };
}
