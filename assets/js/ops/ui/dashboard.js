/* OPS / UI / DASHBOARD — "Today": open tasks, open escalations, recent bookings needing attention. Stage 15 */
import { el, render } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, block, metricCard, opsStatusBadge, taskStatusBadge, escalationStatusBadge, dateTime } from './shell.js';

export function mountOpsDashboard({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'dashboard', head: 'page.ops.dashboard', paint: async ({ staff, main }) => {
    const tasksHost = el('div', { dataset: { region: 'tasks' } });
    const escHost = el('div', { dataset: { region: 'escalations' } });
    const bkHost = el('div', { dataset: { region: 'bookings' } });
    // Dashboard-refinement brief §7: page context, then key operational
    // metrics, then the priority-item regions below — metricsHost used to be
    // built (see the returned `metrics` handle) but never mounted anywhere,
    // so the tiles never actually appeared on screen. Filled in once the
    // counts resolve, same async-region shape as tasks/esc/bk below.
    const metricsHost = el('div', { class: 'c-svp-metrics' });
    main.replaceChildren(
      el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('ops.dash.welcome', pick(staff, 'name') || staff.email)), el('p', { class: 't-body t-muted' }, t('ops.dash.text'))]),
      metricsHost,
      el('div', { class: 'c-acct-grid' }, [
        block(t('ops.tasks.title'), tasksHost, { id: 'dash-tasks', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('admin/tasks/') }, t('acct.viewAll')) }),
        block(t('ops.escalations.title'), escHost, { id: 'dash-esc', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('admin/escalations/') }, t('acct.viewAll')) }),
      ]),
      block(t('ops.bookings.title'), bkHost, { id: 'dash-bookings', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('admin/bookings/') }, t('acct.viewAll')) }),
    );
    const tasks = loadRegion(tasksHost, async () => (await opsData.tasks({ status: 'open', page: 1, pageSize: 5 })).items, {
      paint: (items) => items.length
        ? el('ul', { class: 'c-svp-mini-list', role: 'list' }, items.map((task) => el('li', {}, [el('span', {}, task.type), taskStatusBadge(task.status)])))
        : el('p', { class: 't-body-sm t-muted' }, t('ops.tasks.empty.title')),
    });
    const esc = loadRegion(escHost, async () => (await opsData.escalations({ status: 'open', page: 1, pageSize: 5 })).items, {
      paint: (items) => items.length
        ? el('ul', { class: 'c-svp-mini-list', role: 'list' }, items.map((e) => el('li', {}, [el('span', {}, e.reason), escalationStatusBadge(e.status)])))
        : el('p', { class: 't-body-sm t-muted' }, t('ops.escalations.empty.title')),
    });
    const bk = loadRegion(bkHost, async () => (await opsData.bookings({ page: 1, pageSize: 5 })).items, {
      paint: (items) => items.length
        ? el('ul', { class: 'c-svp-mini-list', role: 'list' }, items.map((b) => el('li', {}, [el('a', { class: 'c-svp-link', href: route(`admin/bookings/?id=${encodeURIComponent(b.id)}`) }, el('bdi', { dir: 'ltr' }, b.id)), opsStatusBadge(b.opsStatus), el('span', { class: 't-body-sm t-muted' }, dateTime(b.createdAt))])))
        : el('p', { class: 't-body-sm t-muted' }, t('ops.bookings.empty.title')),
    });
    const [t1, t2, overview] = await Promise.all([
      tasks.run(), esc.run(),
      // opsData.overview() gives the true open counts (this list is capped
      // at pageSize:5 above, so its own .length would silently under-report
      // past 5) — overview() is gated on customer.view, a permission the
      // ungated dashboard nav entry doesn't require, so a staff member
      // without it falls back to the capped list length rather than
      // breaking the page, same as every other region here degrades.
      opsData.overview().catch(() => null),
    ]);
    await bk.run();
    const metrics = [
      metricCard('ops.metrics.openTasks', overview?.tasksOpen ?? (t1 ?? []).length, { icon: 'no-check' }),
      // Escalations are exceptions, not routine work — the warning tone
      // (already defined in 23-supervisor-portal.css, unused until now)
      // gives the two cards visual hierarchy instead of two identical
      // brand-red tiles.
      metricCard('ops.metrics.openEscalations', overview?.escalationsOpen ?? (t2 ?? []).length, { icon: 'no-alert', tone: 'warning' }),
    ];
    render(metricsHost, metrics);
    return {
      metrics,
      regions: { tasks, esc, bk },
    };
  } });
}
