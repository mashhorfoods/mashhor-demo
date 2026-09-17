/* ACCOUNT / UI / NOTIFICATIONS — unread / read, mark one or all. Stage 12 */
import { el, render } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { dateShort, time } from '../../core/format.js';
import { route } from '../../data/config.js';
import { icon, setButtonState } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { customer, unreadCount } from '../customer.js';
import { ENV } from '../../data/env.js';
import { isAuthenticated } from '../auth.js';
import { mountAccount, loadRegion, pageTitle } from './shell.js';

const KIND_ICON = { booking: 'no-booking', payment: 'no-payment', trip: 'no-location', document: 'no-documents', visa: 'no-visa', support: 'no-support' };

export function mountNotifications({ root = document } = {}) {
  return mountAccount({ root, id: 'notifs', head: 'page.account.notifications', paint: async ({ main }) => {
    const state = { list: null, filter: 'all' };
    const host = el('div', { dataset: { region: 'notifications' } });
    const markAll = el('button', { type: 'button', class: 'c-btn c-btn--secondary c-btn--sm', dataset: { action: 'mark-all' }, hidden: true }, [el('span', { class: 'c-btn__label' }, t('acct.ntf.markAll')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
    const summary = el('p', { class: 't-body-sm t-muted', role: 'status', 'aria-live': 'polite' });
    const chips = el('div', { class: 'c-acct-filters', role: 'group', 'aria-label': t('acct.trips.filter') });
    const paintChips = () => render(chips, ['all', 'unread'].map((f) => el('button', { type: 'button', class: 'c-chip', 'aria-pressed': String(state.filter === f), dataset: { filter: f }, onclick: () => { state.filter = f; paintChips(); paint(); } }, t(`acct.ntf.filter.${f}`))));
    const item = (n) => el('li', { class: `c-card c-acct-ntf${n.read ? '' : ' c-acct-ntf--unread'}`, dataset: { notification: n.id, read: String(n.read), kind: n.kind } }, [
      el('div', { class: 'c-acct-booking__icon' }, icon(KIND_ICON[n.kind] ?? 'no-notification', { size: 'lg' })),
      el('div', { class: 'c-acct-booking__body' }, [
        el('div', { class: 'c-acct-ntf__head' }, [el('h3', { class: 'c-acct-ntf__title' }, pick(n, 'title')), n.read ? null : el('span', { class: 'c-badge c-badge--brand' }, t('acct.ntf.unread')), el('span', { class: 'c-badge c-badge--outline' }, t(`acct.ntf.kind.${n.kind}`))]),
        el('p', { class: 't-body-sm' }, pick(n, 'text')),
        el('p', { class: 't-body-sm t-muted' }, `${dateShort(n.at)} · ${time(n.at)}`),
        el('div', { class: 'c-acct-ntf__actions' }, [
          n.href ? el('a', { class: 'c-btn c-btn--secondary c-btn--sm', href: route(n.href), onclick: () => { if (!n.read) customer.markRead([n.id]).catch(() => {}); } }, t('acct.ntf.open')) : null,
          n.read ? null : el('button', { type: 'button', class: 'c-btn c-btn--tertiary c-btn--sm', dataset: { action: 'mark-read' }, onclick: async (e) => { setButtonState(e.currentTarget, 'loading'); try { state.list = await customer.markRead([n.id]); paint(); } catch { setButtonState(e.currentTarget, 'idle'); } } }, [el('span', { class: 'c-btn__label' }, t('acct.ntf.markRead')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]),
        ]),
      ]),
    ]);
    const paint = () => {
      if (!state.list) return;
      const unread = unreadCount(state.list); markAll.hidden = unread === 0; summary.textContent = t('acct.dash.unread', unread);
      const visible = state.filter === 'unread' ? state.list.filter((n) => !n.read) : state.list;
      render(host, visible.length ? el('ul', { class: 'c-acct-list', role: 'list' }, visible.map(item)) : stateBlock({ variant: 'empty', iconName: 'no-notification', headingLevel: 2, title: t('acct.ntf.empty.title'), text: t('acct.ntf.empty.text'), actions: state.filter === 'unread' ? [{ id: 'all', label: t('acct.ntf.filter.all'), variant: 'c-btn--primary', onClick: () => { state.filter = 'all'; paintChips(); paint(); } }] : [{ label: t('acct.trips.title'), href: route('trips/') }] }));
    };
    markAll.addEventListener('click', async () => { setButtonState(markAll, 'loading'); try { state.list = await customer.markRead(null); paint(); } finally { setButtonState(markAll, 'idle'); } });
    main.replaceChildren(el('div', { class: 'c-acct-trip__head' }, [pageTitle('acct.ntf.title', 'acct.ntf.text'), markAll]), el('div', { class: 'c-acct-tools' }, [chips, summary]), host);
    paintChips();
    const region = loadRegion(host, () => customer.notifications(), { paint: (list) => { state.list = list; queueMicrotask(paint); return el('div'); } });
    await region.run();
    // Coming back to the tab refreshes quietly (no loading flash, no polling), at most once per refreshMinSeconds.
    let last = Date.now(); const minMs = (ENV.notifications?.refreshMinSeconds ?? 30) * 1000;
    const quiet = async () => { if (!isAuthenticated() || document.visibilityState !== 'visible' || Date.now() - last < minMs) return; last = Date.now(); try { state.list = await customer.notifications(); paint(); } catch { /* the list on screen stands; the next visit retries */ } };
    if (ENV.notifications?.refreshOnFocus !== false) { document.addEventListener('visibilitychange', quiet); window.addEventListener('focus', quiet); }
    return { state, refresh: region.run, quietRefresh: () => { last = 0; return quiet(); } };
  } });
}
