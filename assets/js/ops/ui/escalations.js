/* OPS / UI / ESCALATIONS — raised issues that need attention beyond a normal task: list, filter, raise a new one,
   move through Open → Investigating/Waiting → Resolved/Closed. Severity and assigned team are shown as the backend
   set them; the SLA duration for any of this is one of the business decisions Stage 15 leaves unresolved (§21). Stage 15 */
import { el } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { icon, toast, setButtonState } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { opsData, ESCALATION_STATUSES } from '../data.js';
import { mountOpsPortal, loadRegion, pageTitle, escalationStatusBadge, dateTime, block } from './shell.js';

const SEVERITIES = ['low', 'normal', 'high', 'urgent'];

export function mountOpsEscalations({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'escalations', head: 'page.ops.escalations', paint: async ({ main, can }) => {
    const host = el('div', { dataset: { region: 'escalations' } });
    const filter = el('select', { class: 'c-field__control c-svp-filter__select', 'aria-label': t('ops.escalations.filterLabel') },
      [''].concat(ESCALATION_STATUSES).map((s) => el('option', { value: s }, s ? t(`ops.escalation.status.${s}`) : t('ops.escalations.filterAll'))));
    filter.addEventListener('change', () => region.run());

    const row = (esc) => {
      const statusSelect = el('select', { class: 'c-field__control c-field__control--sm', 'aria-label': t('ops.escalations.statusLabel'), ...(can('task.manage') ? {} : { disabled: true }) },
        ESCALATION_STATUSES.map((s) => el('option', { value: s, ...(s === esc.status ? { selected: true } : {}) }, t(`ops.escalation.status.${s}`))));
      statusSelect.addEventListener('change', async () => { const next = statusSelect.value; statusSelect.disabled = true; try { await opsData.updateEscalationStatus(esc.id, next); toast({ title: t('ops.escalations.updated'), variant: 'success', duration: 3000 }); } catch { toast({ title: t('ops.escalations.updateFailed'), variant: 'warning', duration: 5000 }); statusSelect.value = esc.status; } statusSelect.disabled = false; });
      return el('article', { class: 'c-card c-svp-lead', dataset: { escalation: esc.id, escalationStatus: esc.status } }, [
        el('div', { class: 'c-svp-lead__icon' }, icon('no-alert', { size: 'lg' })),
        el('div', { class: 'c-svp-lead__body' }, [
          el('h3', { class: 'c-acct-booking__title' }, esc.reason),
          el('p', { class: 't-body-sm t-muted' }, [esc.bookingId ? `${t('ops.bookings.col.id')}: ${esc.bookingId} · ` : '', esc.assignedTeam ? `${esc.assignedTeam} · ` : '', dateTime(esc.createdAt)]),
          el('div', { class: 'l-cluster l-cluster--8' }, [escalationStatusBadge(esc.status), el('span', { class: 'c-badge c-badge--outline', dataset: { severity: esc.severity } }, t(`ops.priority.${esc.severity}`) || esc.severity)]),
        ]),
        statusSelect,
      ]);
    };

    const createForm = can('task.manage') ? (() => {
      const bookingId = el('input', { name: 'bookingId', class: 'c-field__control', type: 'text', dir: 'ltr', 'aria-label': t('ops.escalations.create.bookingId'), placeholder: t('ops.escalations.create.bookingId') });
      const reason = el('textarea', { name: 'reason', class: 'c-field__control', rows: 2, required: true, 'aria-label': t('ops.escalations.create.reason'), placeholder: t('ops.escalations.create.reason') });
      const severity = el('select', { name: 'severity', class: 'c-field__control', 'aria-label': t('ops.priority.label') }, SEVERITIES.map((s) => el('option', { value: s, ...(s === 'normal' ? { selected: true } : {}) }, t(`ops.priority.${s}`))));
      const team = el('input', { name: 'assignedTeam', class: 'c-field__control', type: 'text', 'aria-label': t('ops.escalations.create.team'), placeholder: t('ops.escalations.create.team') });
      const btn = el('button', { type: 'submit', class: 'c-btn c-btn--primary c-btn--sm' }, [el('span', { class: 'c-btn__label' }, t('ops.escalations.create.action')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
      const form = el('form', { class: 'l-stack l-stack--8', onsubmit: async (e) => {
        e.preventDefault(); if (!reason.value.trim()) return; setButtonState(btn, 'loading');
        try { await opsData.createEscalation({ bookingId: bookingId.value || null, reason: reason.value.trim(), severity: severity.value, assignedTeam: team.value || null }); form.reset(); setButtonState(btn, 'success'); await region.run(); }
        catch { setButtonState(btn, 'error'); }
        setTimeout(() => setButtonState(btn, 'idle'), 1200);
      } }, [bookingId, reason, severity, team, btn]);
      return block(t('ops.escalations.create.title'), form, { id: 'ops-escalations-create' });
    })() : null;

    main.replaceChildren(pageTitle('ops.escalations.title', 'ops.escalations.text'), createForm, el('div', { class: 'c-svp-filter' }, [filter]), host);
    const region = loadRegion(host, async () => (await opsData.escalations({ status: filter.value || undefined, page: 1, pageSize: 50 })).items, {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-alert', headingLevel: 2, title: t('ops.escalations.empty.title'), text: t('ops.escalations.empty.text') }),
      paint: (items) => el('div', { class: 'c-acct-list' }, items.map(row)),
    });
    await region.run();
    return { refresh: region.run };
  } });
}
