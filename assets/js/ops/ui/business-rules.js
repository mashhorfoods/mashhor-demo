/* OPS / UI / BUSINESS RULES — Stage 15A. The formalized Business Rules Register (backed by `business_config`,
   Stage 13/15's own "explicitly NOT decided yet" table): every rule's current value exactly as the codebase already
   had it — nothing here fabricates a commission percentage, SLA duration, refund value or any other unresolved
   figure. Viewing is `rules.view`; changing a rule's status/value/notes is the separate `rules.manage` permission,
   and every change is versioned (the prior value survives in history) and audited server-side. Also hosts the
   Pending Decision Center (§19) and the Final Business Rule Matrix (§27), both computed reads — no second registry
   is created for services/suppliers, which already have their own tables (§30). */
import { el, render } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { icon, toast, setButtonState } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { opsData, RULE_STATUSES } from '../data.js';
import { mountOpsPortal, loadRegion, pageTitle, notFoundState, dataTable, ruleStatusBadge, dateTime, block, rows } from './shell.js';

const columns = [
  { labelKey: 'ops.rules.col.name', render: (r) => el('a', { class: 'c-svp-link', href: route(`admin/business-rules/?id=${encodeURIComponent(r.ruleId)}`) }, r.name) },
  { labelKey: 'ops.rules.col.category', render: (r) => r.category },
  { labelKey: 'ops.rules.col.status', render: (r) => ruleStatusBadge(r.status) },
  { labelKey: 'ops.rules.col.updated', render: (r) => dateTime(r.updatedAt) },
];

export function mountOpsBusinessRules({ root = document, params = new URLSearchParams(location.search) } = {}) {
  const id = params.get('id');
  if (id) return mountRuleDetail({ root, id });
  return mountOpsPortal({ root, id: 'rules', head: 'page.ops.rules', paint: async ({ main }) => {
    const registerHost = el('div', { dataset: { region: 'rules' } });
    const pendingHost = el('div', { dataset: { region: 'pending' } });
    const matrixHost = el('div', { dataset: { region: 'matrix' } });
    main.replaceChildren(
      pageTitle('ops.rules.title', 'ops.rules.text'),
      block(t('ops.rules.register.title'), registerHost, { id: 'ops-rules-register' }),
      block(t('ops.rules.pending.title'), pendingHost, { id: 'ops-rules-pending' }),
      block(t('ops.rules.matrix.title'), matrixHost, { id: 'ops-rules-matrix' }),
    );
    const register = loadRegion(registerHost, async () => (await opsData.rules()).items, {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-settings', headingLevel: 2, title: t('ops.rules.empty.title') }),
      paint: (items) => dataTable({ columns, rows: items, rowKey: (r) => r.ruleId, emptyKey: 'ops.rules.empty.title' }),
    });
    const pending = loadRegion(pendingHost, async () => (await opsData.pendingDecisions()).items, {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-check-circle', headingLevel: 2, title: t('ops.rules.pending.empty') }),
      paint: (items) => el('ul', { class: 'c-svp-mini-list', role: 'list' }, items.map((d) => el('li', {}, [
        el('span', {}, d.name), el('span', { class: 't-body-sm t-muted' }, d.status), el('span', { class: 't-body-sm t-muted' }, d.reason),
      ]))),
    });
    const matrix = loadRegion(matrixHost, async () => (await opsData.ruleMatrix()).items, {
      paint: (items) => dataTable({
        columns: [
          { labelKey: 'ops.rules.col.category', render: (r) => r.category },
          { labelKey: 'ops.rules.matrix.col.rule', render: (r) => r.rule },
          { labelKey: 'ops.rules.col.status', render: (r) => r.status },
          { labelKey: 'ops.rules.matrix.col.impact', render: (r) => r.impact },
        ], rows: items, rowKey: (r) => `${r.category}-${r.rule}`,
      }),
    });
    await Promise.all([register.run(), pending.run(), matrix.run()]);
    return { refresh: async () => { await Promise.all([register.run(), pending.run(), matrix.run()]); } };
  } });
}

function mountRuleDetail({ root, id }) {
  return mountOpsPortal({ root, id: 'rules', head: 'page.ops.ruleDetail', paint: async ({ main, can }) => {
    const r = await opsData.rule(id);
    if (!r) { render(main, notFoundState(route('admin/business-rules/'), t('ops.rules.title'))); return { rule: null }; }
    const refresh = async () => render(main, await view());

    async function view() {
      const [fresh, history] = await Promise.all([opsData.rule(id), opsData.ruleHistory(id)]);
      const nodes = [
        el('p', {}, el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('admin/business-rules/') }, [icon('no-arrow-end', { size: 'xs', className: 'c-icon--start' }), el('span', {}, t('ops.rules.title'))])),
        el('div', { class: 'l-stack l-stack--4' }, [el('h1', { class: 't-h1' }, fresh.name), el('p', { class: 't-body t-muted' }, fresh.description)]),
        el('div', { class: 'c-acct-booking__badges' }, [ruleStatusBadge(fresh.status)]),
        block(t('ops.rules.detail.title'), rows([
          [t('ops.rules.col.category'), fresh.category],
          [t('ops.rules.detail.source'), fresh.source],
          [t('ops.rules.col.updated'), dateTime(fresh.updatedAt)],
          [t('ops.rules.detail.updatedBy'), fresh.updatedBy || '—'],
          [t('ops.rules.detail.effectiveFrom'), dateTime(fresh.effectiveFrom)],
        ]), { id: 'ops-rule-details' }),
        block(t('ops.rules.detail.currentValue'), el('pre', { class: 'c-svp-table-wrap', style: 'white-space:pre-wrap;word-break:break-word;padding:.75rem' }, JSON.stringify(fresh.currentValue, null, 2)), { id: 'ops-rule-value' }),
      ];

      if (can('rules.manage')) {
        const status = el('select', { name: 'status', class: 'c-field__control', 'aria-label': t('ops.rules.col.status') }, RULE_STATUSES.map((s) => el('option', { value: s, ...(s === fresh.status ? { selected: true } : {}) }, t(`ops.rules.status.${s}`))));
        const value = el('textarea', { name: 'value', class: 'c-field__control', rows: 8, dir: 'ltr', 'aria-label': t('ops.rules.detail.currentValue') }, JSON.stringify(fresh.currentValue, null, 2));
        const notes = el('textarea', { name: 'notes', class: 'c-field__control', rows: 3, 'aria-label': t('ops.rules.detail.notes'), placeholder: t('ops.rules.detail.notes') }, fresh.notes ?? '');
        const err = el('p', { class: 'c-field__error', role: 'alert', hidden: true });
        const btn = el('button', { type: 'submit', class: 'c-btn c-btn--primary c-btn--sm' }, [el('span', { class: 'c-btn__label' }, t('ops.rules.save')), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
        const form = el('form', { class: 'l-stack l-stack--8', onsubmit: async (e) => {
          e.preventDefault(); err.hidden = true;
          let parsedValue;
          try { parsedValue = JSON.parse(value.value); }
          catch { err.hidden = false; err.replaceChildren(icon('no-alert', { size: 'sm' }), el('span', {}, t('ops.rules.invalidValue'))); return; }
          setButtonState(btn, 'loading');
          try { await opsData.updateRule(id, { status: status.value, value: parsedValue, notes: notes.value || null }); toast({ title: t('ops.rules.updated'), variant: 'success', duration: 3000 }); setButtonState(btn, 'success'); await refresh(); }
          catch { setButtonState(btn, 'error'); }
          setTimeout(() => setButtonState(btn, 'idle'), 1200);
        } }, [
          el('label', { class: 'l-stack l-stack--4' }, [el('span', {}, t('ops.rules.col.status')), status]),
          el('label', { class: 'l-stack l-stack--4' }, [el('span', {}, t('ops.rules.detail.currentValue')), value]),
          el('label', { class: 'l-stack l-stack--4' }, [el('span', {}, t('ops.rules.detail.notes')), notes]),
          err, btn,
        ]);
        nodes.push(block(t('ops.rules.manage.title'), form, { id: 'ops-rule-manage' }));
      }

      nodes.push(block(t('ops.rules.history.title'), history.length
        ? el('ol', { class: 'c-svp-mini-list', role: 'list' }, history.map((h) => el('li', {}, [el('span', {}, `${h.status} → ${dateTime(h.effectiveTo)}`), el('span', { class: 't-body-sm t-muted' }, h.updatedBy || '—')])))
        : el('p', { class: 't-body-sm t-muted' }, t('ops.table.empty')), { id: 'ops-rule-history' }));

      return nodes;
    }

    render(main, await view());
    return { rule: r, refresh };
  } });
}
