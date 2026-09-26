/* OPS / UI / TASKS — the operational task queue: list, filter by status, create, assign, reassign, complete/reopen.
   Every reassignment and status change goes straight to the backend, which is what actually writes the audit event
   (§07) — this screen only calls the same task.manage-gated endpoints twice, not a client-side log. Stage 15 */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { icon, toast } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { statusSelect } from '../../core/portal-ui.js';
import { opsData, TASK_STATUSES } from '../data.js';
import { mountOpsPortal, loadRegion, pagedRegion, pageTitle, actionForm, statusFilterSelect, taskStatusBadge, priorityBadge, dateTime, block } from './shell.js';

export function mountOpsTasks({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'tasks', head: 'page.ops.tasks', paint: async ({ main, can }) => {
    const host = el('div', { dataset: { region: 'tasks' } });
    const filter = statusFilterSelect('ops.tasks.filterLabel', TASK_STATUSES, 'ops.task.status', () => region.run());

    const row = (task) => {
      const assignInput = el('input', { class: 'c-field__control c-field__control--sm', type: 'text', dir: 'ltr', value: task.assignedTo ?? '', 'aria-label': t('ops.tasks.assignLabel'), ...(can('task.manage') ? {} : { disabled: true }) });
      const assignBtn = el('button', { type: 'button', class: 'c-btn c-btn--tertiary c-btn--sm', ...(can('task.manage') ? {} : { disabled: true }) }, t('ops.tasks.reassign'));
      assignBtn.addEventListener('click', async () => { assignBtn.disabled = true; try { await opsData.assignTask(task.id, assignInput.value.trim() || null); toast({ title: t('ops.tasks.reassigned'), variant: 'success', duration: 3000 }); } catch { toast({ title: t('ops.tasks.updateFailed'), variant: 'warning', duration: 5000 }); } assignBtn.disabled = false; });
      const status = statusSelect({ statuses: TASK_STATUSES, current: task.status, optionKey: (s) => `ops.task.status.${s}`, labelKey: 'ops.tasks.statusLabel', disabled: !can('task.manage'),
        save: (next) => opsData.updateTaskStatus(task.id, next), doneKey: 'ops.tasks.updated', failKey: 'ops.tasks.updateFailed' });
      return el('article', { class: 'c-card c-svp-lead', dataset: { task: task.id, taskStatus: task.status } }, [
        el('div', { class: 'c-svp-lead__icon' }, icon('no-check', { size: 'lg' })),
        el('div', { class: 'c-svp-lead__body' }, [
          el('h3', { class: 'c-acct-booking__title' }, task.type),
          el('p', { class: 't-body-sm t-muted' }, [task.bookingId ? `${t('ops.bookings.col.id')}: ${task.bookingId} · ` : '', dateTime(task.createdAt)]),
          el('div', { class: 'l-cluster l-cluster--8' }, [taskStatusBadge(task.status), priorityBadge(task.priority)]),
          task.notes ? el('p', { class: 't-body-sm' }, task.notes) : null,
        ]),
        el('div', { class: 'l-stack l-stack--8' }, [assignInput, assignBtn, status]),
      ]);
    };

    const createForm = can('task.manage') ? (() => {
      const type = el('input', { name: 'type', class: 'c-field__control', type: 'text', required: true, 'aria-label': t('ops.tasks.create.type'), placeholder: t('ops.tasks.create.type') });
      const bookingId = el('input', { name: 'bookingId', class: 'c-field__control', type: 'text', dir: 'ltr', 'aria-label': t('ops.tasks.create.bookingId'), placeholder: t('ops.tasks.create.bookingId') });
      const priority = el('select', { name: 'priority', class: 'c-field__control', 'aria-label': t('ops.priority.label') }, ['normal', 'low', 'high', 'urgent'].map((p) => el('option', { value: p }, t(`ops.priority.${p}`))));
      const notes = el('textarea', { name: 'notes', class: 'c-field__control', rows: 2, 'aria-label': t('ops.tasks.create.title') });
      const form = actionForm({
        submitLabel: t('ops.tasks.create.action'),
        onSubmit: async (fd, formEl) => {
          await opsData.createTask({ type: fd.get('type'), bookingId: fd.get('bookingId') || null, priority: fd.get('priority'), notes: fd.get('notes') || null });
          formEl.reset(); await region.run();
        },
        children: [type, bookingId, priority, notes],
      });
      return block(t('ops.tasks.create.title'), form, { id: 'ops-tasks-create' });
    })() : null;

    main.replaceChildren(pageTitle('ops.tasks.title', 'ops.tasks.text'), createForm, el('div', { class: 'c-svp-filter' }, [filter]), host);
    const region = pagedRegion(host, (q) => opsData.tasks(q), {
      filters: () => ({ status: filter.value || undefined }),
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-check', headingLevel: 2, title: t('ops.tasks.empty.title'), text: t('ops.tasks.empty.text') }),
      paint: (items) => el('div', { class: 'c-acct-list' }, items.map(row)),
    });
    await region.run();
    return { refresh: region.run };
  } });
}
