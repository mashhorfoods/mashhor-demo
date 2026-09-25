/* OPS / UI / NOTIFICATIONS — the communication centre: templates (create/update, sanitized server-side, §14) and
   delivery history. History reuses the same outbox the customer-facing send path writes to — never claiming a
   message was delivered beyond what that record says (§16). Stage 15 */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { toast } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, pageTitle, actionForm, dataTable, dateTime, block } from './shell.js';

const CHANNELS = ['email', 'sms', 'push'];

export function mountOpsNotifications({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'notifications', head: 'page.ops.notifications', paint: async ({ main, can }) => {
    const tmplHost = el('div', { dataset: { region: 'templates' } });
    const histHost = el('div', { dataset: { region: 'history' } });

    const createForm = can('notification.manage') || can('notification.send') ? (() => {
      const event = el('input', { name: 'event', class: 'c-field__control', type: 'text', dir: 'ltr', required: true, 'aria-label': t('ops.notifications.create.event'), placeholder: t('ops.notifications.create.event') });
      const channel = el('select', { name: 'channel', class: 'c-field__control', 'aria-label': t('ops.notifications.col.channel') }, CHANNELS.map((c) => el('option', { value: c }, c)));
      const subjectAr = el('input', { name: 'subjectAr', class: 'c-field__control', type: 'text', 'aria-label': t('ops.notifications.create.subjectAr'), placeholder: t('ops.notifications.create.subjectAr') });
      const subjectEn = el('input', { name: 'subjectEn', class: 'c-field__control', type: 'text', dir: 'ltr', 'aria-label': t('ops.notifications.create.subjectEn'), placeholder: t('ops.notifications.create.subjectEn') });
      const bodyAr = el('textarea', { name: 'bodyAr', class: 'c-field__control', rows: 3, 'aria-label': t('ops.notifications.create.bodyAr'), placeholder: t('ops.notifications.create.bodyAr') });
      const bodyEn = el('textarea', { name: 'bodyEn', class: 'c-field__control', rows: 3, dir: 'ltr', 'aria-label': t('ops.notifications.create.bodyEn'), placeholder: t('ops.notifications.create.bodyEn') });
      const help = el('p', { class: 't-body-sm t-muted' }, t('ops.notifications.create.help'));
      const form = actionForm({
        submitLabel: t('ops.notifications.create.action'),
        onSubmit: async (fd, formEl) => {
          await opsData.upsertTemplate({ event: fd.get('event'), channel: fd.get('channel'), subjectAr: fd.get('subjectAr'), subjectEn: fd.get('subjectEn'), bodyAr: fd.get('bodyAr'), bodyEn: fd.get('bodyEn'), active: true });
          formEl.reset(); toast({ title: t('ops.notifications.saved'), variant: 'success', duration: 3000 }); await tmpl.run();
        },
        children: [event, channel, subjectAr, subjectEn, bodyAr, bodyEn, help],
      });
      return block(t('ops.notifications.create.title'), form, { id: 'ops-notifications-create' });
    })() : null;

    main.replaceChildren(
      pageTitle('ops.notifications.title', 'ops.notifications.text'),
      createForm,
      block(t('ops.notifications.templates.title'), tmplHost, { id: 'ops-notifications-templates' }),
      block(t('ops.notifications.history.title'), histHost, { id: 'ops-notifications-history' }),
    );
    const tmpl = loadRegion(tmplHost, () => opsData.templates(), {
      empty: () => stateBlock({ variant: 'empty', headingLevel: 3, title: t('ops.notifications.templates.empty') }),
      paint: (items) => dataTable({ columns: [
        { labelKey: 'ops.notifications.col.event', render: (m) => el('bdi', { dir: 'ltr' }, m.event) },
        { labelKey: 'ops.notifications.col.channel', render: (m) => m.channel },
        { labelKey: 'ops.notifications.col.active', render: (m) => t(m.active ? 'ops.services.yes' : 'ops.services.no') },
        { labelKey: 'ops.notifications.col.version', render: (m) => String(m.version) },
      ], rows: items, rowKey: (m) => m.id }),
    });
    const hist = loadRegion(histHost, async () => (await opsData.notificationHistory({ page: 1, pageSize: 50 })).items, {
      empty: () => stateBlock({ variant: 'empty', headingLevel: 3, title: t('ops.notifications.history.empty') }),
      paint: (items) => dataTable({ columns: [
        { labelKey: 'ops.notifications.col.event', render: (m) => m.event },
        { labelKey: 'ops.notifications.col.channel', render: (m) => m.channel },
        { labelKey: 'ops.notifications.col.status', render: (m) => m.status },
        { labelKey: 'ops.bookings.col.date', render: (m) => dateTime(m.at) },
      ], rows: items, rowKey: (m) => m.id }),
    });
    await Promise.all([tmpl.run(), hist.run()]);
    return { refresh: () => Promise.all([tmpl.run(), hist.run()]) };
  } });
}
