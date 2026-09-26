/* SUPERVISOR / UI / NOTIFICATIONS — this supervisor's own feed, isolated from the customer notifications table
   entirely (a different backend endpoint, a different UI, §20). Quiet refresh on focus, no polling. Stage 13 */
import { el } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { icon } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { supervisorData } from '../data.js';
import { mountSupervisorPortal, loadRegion, pageTitle, dateTime, unreadCount } from './shell.js';

const MIN_REFRESH_MS = 30000;

export function mountSupervisorNotifications({ root = document } = {}) {
  return mountSupervisorPortal({ root, id: 'notifications', head: 'page.supervisor.notifications', paint: async ({ main }) => {
    const host = el('div', { dataset: { region: 'notifications' } });
    const markAll = el('button', { type: 'button', class: 'c-btn c-btn--secondary c-btn--sm', dataset: { action: 'markAll' } }, t('acct.ntf.markAll'));
    main.replaceChildren(pageTitle('svp.notifications.title', 'svp.notifications.text'), el('p', {}, markAll), host);
    const row = (n) => el('li', { class: `c-acct-ntf c-svp-ntf${n.read ? '' : ' c-acct-ntf--unread'}`, dataset: { notification: n.id } }, [
      el('span', { class: 'c-acct-ntf__title' }, pick(n, 'title')),
      el('span', { class: 't-body-sm t-muted' }, pick(n, 'text')),
      el('span', { class: 't-body-sm t-muted' }, dateTime(n.at)),
    ]);
    const region = loadRegion(host, () => supervisorData.notifications(), {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-notification', headingLevel: 2, title: t('svp.notifications.empty.title'), text: t('svp.notifications.empty.text') }),
      paint: (list) => [el('p', { class: 't-body-sm c-acct-inline', dataset: { unread: unreadCount(list) } }, [icon('no-notification', { size: 'sm' }), t('acct.dash.unread', unreadCount(list))]), el('ul', { class: 'c-acct-ntf-list', role: 'list' }, list.map(row))],
    });
    markAll.addEventListener('click', async () => { markAll.disabled = true; try { await supervisorData.markRead(null); } catch { /* the retry in the region covers a real failure */ } await region.run(); markAll.disabled = false; });
    await region.run();
    let lastRefresh = Date.now();
    const onFocus = () => { if (Date.now() - lastRefresh > MIN_REFRESH_MS) { lastRefresh = Date.now(); region.run(); } };
    window.addEventListener('focus', onFocus);
    return { refresh: region.run, _stop: () => window.removeEventListener('focus', onFocus) };
  } });
}
