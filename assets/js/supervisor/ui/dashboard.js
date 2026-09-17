/* SUPERVISOR / UI / DASHBOARD — the overview: key counts, revenue summary, recent leads/bookings, notifications. Stage 13 */
import { el } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { icon } from '../../components/ui.js';
import { supervisorData, unreadCount } from '../data.js';
import { mountSupervisorPortal, loadRegion, block, metricCard, amount, dateTime, leadStatusBadge } from './shell.js';

export function mountSupervisorDashboard({ root = document } = {}) {
  return mountSupervisorPortal({ root, id: 'dashboard', head: 'page.supervisor.dashboard', paint: async ({ supervisor, main }) => {
    const perfHost = el('div', { dataset: { region: 'performance' } }); const revHost = el('div', { dataset: { region: 'revenue' } });
    const leadsHost = el('div', { dataset: { region: 'leads' } }); const ntfHost = el('div', { dataset: { region: 'notifications' } });
    main.replaceChildren(
      el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('svp.dash.welcome', pick(supervisor, 'name') || supervisor.email)), el('p', { class: 't-body t-muted' }, t('svp.dash.text'))]),
      perfHost,
      el('div', { class: 'c-acct-grid' }, [
        block(t('svp.dash.revenue'), revHost, { id: 'dash-rev', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('supervisor/revenue/') }, t('acct.viewAll')) }),
        block(t('svp.leads.title'), leadsHost, { id: 'dash-leads', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('supervisor/leads/') }, t('acct.viewAll')) }),
      ]),
      block(t('svp.dash.notifications'), ntfHost, { id: 'dash-ntf', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('supervisor/notifications/') }, t('acct.viewAll')) }),
    );
    const perf = loadRegion(perfHost, () => supervisorData.performance(), {
      paint: (p) => el('div', { class: 'c-svp-metrics' }, [
        metricCard('svp.metrics.customers', p.customers, { icon: 'no-customer' }),
        metricCard('svp.metrics.leads', p.leads, { icon: 'no-lead', sub: p.leadsConverted ? t('svp.metrics.converted', p.leadsConverted) : null }),
        metricCard('svp.metrics.bookings', p.bookings, { icon: 'no-ticket', sub: p.bookingsConfirmed ? t('svp.metrics.confirmed', p.bookingsConfirmed) : null }),
      ]),
    });
    const rev = loadRegion(revHost, () => supervisorData.revenue(), {
      paint: (r) => el('div', { class: 'l-stack l-stack--8' }, [
        el('p', { class: 't-price' }, amount(r.gross, r.currency)),
        el('p', { class: 't-body-sm t-muted' }, t('svp.revenue.commissionPending')),
      ]),
    });
    const leads = loadRegion(leadsHost, () => supervisorData.leads({ page: 1, pageSize: 3 }), {
      paint: (page) => page.items.length
        ? el('ul', { class: 'c-svp-mini-list', role: 'list' }, page.items.map((l) => el('li', {}, [el('span', {}, l.name || l.contact), leadStatusBadge(l.status)])))
        : el('p', { class: 't-body-sm t-muted' }, t('svp.leads.empty.title')),
    });
    const ntf = loadRegion(ntfHost, () => supervisorData.notifications(), {
      paint: (list) => { const unread = unreadCount(list); const top = list.slice(0, 3); return [
        el('p', { class: 't-body-sm c-acct-inline', dataset: { unread } }, [icon('no-notification', { size: 'sm' }), t('acct.dash.unread', unread)]),
        top.length ? el('ul', { class: 'c-acct-ntf-list', role: 'list' }, top.map((n) => el('li', { class: `c-acct-ntf${n.read ? '' : ' c-acct-ntf--unread'}` }, [el('span', { class: 'c-acct-ntf__title' }, pick(n, 'title')), el('span', { class: 't-body-sm t-muted' }, dateTime(n.at))]))) : null,
      ]; },
    });
    await Promise.all([perf.run(), rev.run(), leads.run(), ntf.run()]);
    return { regions: { perf, rev, leads, ntf } };
  } });
}
