/* ACCOUNT / UI / PAYMENTS — history from the payment layer: no card data exists on this site. Stage 12 */
import { el } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { money, dateShort } from '../../core/format.js';
import { route } from '../../data/config.js';
import { icon } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { customer } from '../customer.js';
import { mountAccount, loadRegion, pageTitle, payBadge, serviceName } from './shell.js';

const row = (p) => el('article', { class: 'c-card c-acct-pay', dataset: { payment: p.id, payStatus: p.status } }, [
  el('div', { class: 'c-acct-booking__icon' }, icon('no-payment', { size: 'lg' })),
  el('div', { class: 'c-acct-booking__body' }, [
    el('h3', { class: 'c-acct-booking__title' }, [serviceName(p.booking?.service), ' · ', el('a', { class: 'c-card__link', href: route(`account/bookings/?id=${encodeURIComponent(p.bookingId)}`) }, el('bdi', { dir: 'ltr' }, p.bookingId))]),
    el('p', { class: 't-body-sm t-muted' }, [dateShort(p.at), ' · ', pick(p, 'method'), p.reference ? [' · ', t('acct.pays.txn'), ' ', el('bdi', { dir: 'ltr' }, p.reference)] : null].flat()),
    payBadge(p.status),
  ]),
  el('div', { class: 'c-acct-booking__amount' }, el('span', { class: 't-price', dataset: { amount: p.amount } }, `${p.amount < 0 ? '−' : ''}${money(Math.abs(p.amount), p.currency)}`)),
]);

export function mountPayments({ root = document } = {}) {
  return mountAccount({ root, id: 'payments', head: 'page.account.payments', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'payments' } });
    main.replaceChildren(pageTitle('acct.pays.title', 'acct.pays.text'), el('p', { class: 't-body-sm t-muted c-acct-inline' }, [icon('no-shield', { size: 'sm' }), t('bk.pay.secure')]), host);
    const region = loadRegion(host, () => customer.payments(), {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-payment', headingLevel: 2, title: t('acct.pays.empty.title'), text: t('acct.pays.empty.text'), actions: [{ label: t('acct.bookings.title'), href: route('account/bookings/'), variant: 'c-btn--primary' }] }),
      paint: (list) => el('div', { class: 'c-acct-list' }, [...list].sort((a, b) => String(b.at).localeCompare(String(a.at))).map(row)),
    });
    await region.run();
    return { refresh: region.run };
  } });
}
