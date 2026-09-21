/* ACCOUNT / UI / PAYMENTS — history from the payment layer: no card data exists on this site. Stage 12 */
import { el, render } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { dateShort } from '../../core/format.js';
import { route } from '../../data/config.js';
import { icon, setButtonState } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { customer } from '../customer.js';
import { mountAccount, loadRegion, pageTitle, payBadge, serviceName, errorText, amount } from './shell.js';
import { track } from '../../core/diagnostics.js';

const row = (p) => el('article', { class: 'c-card c-acct-pay', dataset: { payment: p.id, payStatus: p.status } }, [
  el('div', { class: 'c-acct-booking__icon' }, icon('no-payment', { size: 'lg' })),
  el('div', { class: 'c-acct-booking__body' }, [
    el('h3', { class: 'c-acct-booking__title' }, [serviceName(p.booking?.service), ' · ', el('a', { class: 'c-card__link', href: route(`account/bookings/?id=${encodeURIComponent(p.bookingId)}`) }, el('bdi', { dir: 'ltr' }, p.bookingId))]),
    el('p', { class: 't-body-sm t-muted' }, [dateShort(p.at), ' · ', pick(p, 'method'), p.reference ? [' · ', t('acct.pays.txn'), ' ', el('bdi', { dir: 'ltr' }, p.reference)] : null].flat()),
    payBadge(p.status),
  ]),
  el('div', { class: 'c-acct-booking__amount' }, el('span', { class: 't-price', dataset: { amount: p.amount } }, amount(p.amount, p.currency))),
]);

export function mountPayments({ root = document } = {}) {
  return mountAccount({ root, id: 'payments', head: 'page.account.payments', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'payments' } });
    const state = { items: [], page: 0, total: null, nextPage: null };
    const list = el('div', { class: 'c-acct-list' });
    const count = el('p', { class: 't-body-sm t-muted', role: 'status', 'aria-live': 'polite', dataset: { shown: '' } });
    const more = el('button', { type: 'button', class: 'c-btn c-btn--secondary', dataset: { action: 'more' }, hidden: true }, [el('span', { class: 'c-btn__label' }, t('acct.pays.more')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
    const moreErr = el('p', { class: 'c-field__error', role: 'alert', hidden: true });
    main.replaceChildren(pageTitle('acct.pays.title', 'acct.pays.text'), el('p', { class: 't-body-sm t-muted c-acct-inline' }, [icon('no-shield', { size: 'sm' }), t('bk.pay.secure')]), host);
    const paint = () => { render(list, state.items.map(row)); more.hidden = !state.nextPage; count.textContent = state.total != null ? t('acct.pays.shown', state.items.length, state.total) : ''; };
    const region = loadRegion(host, async () => { const page = await customer.payments({ page: 1 }); state.items = page.items; state.page = page.page; state.total = page.total; state.nextPage = page.nextPage; return page.items; }, {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-payment', headingLevel: 2, title: t('acct.pays.empty.title'), text: t('acct.pays.empty.text'), actions: [{ label: t('acct.bookings.title'), href: route('account/bookings/'), variant: 'c-btn--primary' }] }),
      paint: () => { paint(); return el('div', { class: 'l-stack l-stack--16' }, [list, count, more, moreErr]); },
    });
    more.addEventListener('click', async () => {
      setButtonState(more, 'loading'); moreErr.hidden = true;
      try { const page = await customer.payments({ page: state.nextPage }); state.items = [...state.items, ...page.items]; state.page = page.page; state.total = page.total; state.nextPage = page.nextPage; paint(); }
      catch (error) { track('payments.failure', { code: error?.code ?? 'failed', page: state.nextPage }); moreErr.hidden = false; moreErr.replaceChildren(icon('no-alert', { size: 'sm' }), el('span', {}, errorText(error?.code))); }
      setButtonState(more, 'idle');
    });
    await region.run();
    return { refresh: region.run, state, more: () => more.click() };
  } });
}
