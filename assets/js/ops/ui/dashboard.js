/* OPS / UI / DASHBOARD — "Today": open tasks, open escalations, recent bookings needing attention. Stage 15 */
import { el } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, block, metricCard, opsStatusBadge, taskStatusBadge, escalationStatusBadge, dateTime } from './shell.js';

export function mountOpsDashboard({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'dashboard', head: 'page.ops.dashboard', paint: async ({ staff, main }) => {
    const tasksHost = el('div', { dataset: { region: 'tasks' } });
    const escHost = el('div', { dataset: { region: 'escalations' } });
    const bkHost = el('div', { dataset: { region: 'bookings' } });
    main.replaceChildren(
      el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('ops.dash.welcome', pick(staff, 'name') || staff.email)), el('p', { class: 't-body t-muted' }, t('ops.dash.text'))]),
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
    const [t1, t2] = await Promise.all([tasks.run(), esc.run()]);
    await bk.run();
    return {
      metrics: el('div', { class: 'c-svp-metrics' }, [
        metricCard('ops.metrics.openTasks', (t1 ?? []).length, { icon: 'no-check' }),
        metricCard('ops.metrics.openEscalations', (t2 ?? []).length, { icon: 'no-alert' }),
      ]),
      regions: { tasks, esc, bk },
    };
  } });
}
