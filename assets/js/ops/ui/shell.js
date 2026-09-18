/* ============================================================================
   OPS / UI / SHELL — what every operations portal screen shares. Stage 15.
   Reuses the supervisor portal's grid, metric, table and filter classes
   (assets/css/23-supervisor-portal.css — generic operational-workspace
   styling, not supervisor-specific despite the file name) so the responsive
   behaviour already verified in Stage 13 carries over unchanged; Stage 15
   adds only what is new (permission-gated actions, a transition picker, a
   workflow step list, an audit timeline) in 24-ops-portal.css.
   ========================================================================= */
import { el, qs, render, setPageHead } from '../../core/dom.js';
import { t, pick, getLocale } from '../../core/i18n.js';
import { dateShort } from '../../core/format.js';
import { route } from '../../data/config.js';
import { icon } from '../../components/ui.js';
import { stateBlock, stateRegion, loadingBlock } from '../../components/states.js';
import { restoreOpsSession, OpsAuthError, hasOpsPermission } from '../auth.js';
import { opsDataAdapter } from '../data.js';

export const isAr = () => getLocale() === 'ar';
export const slot = (name, root = document) => qs(`[data-portal="${name}"]`, root);
export const put = (name, nodes, root = document) => { const s = slot(name, root); if (s) render(s, nodes); return s; };
export const setHead = (key) => setPageHead({ title: t(key), description: t('page.ops.description') });
export const here = () => location.pathname + location.search;

export const devNotice = () => (opsDataAdapter()?.dev ? el('p', { class: 'c-note c-note--warning', role: 'note', dataset: { dev: 'true' } }, [icon('no-alert', { size: 'sm' }), el('span', { class: 'c-note__text' }, [el('strong', {}, `${t('ops.dev.title')}: `), t('ops.dev.text')])]) : null);

const NAV = [
  { id: 'dashboard', icon: 'no-dashboard', href: 'admin/dashboard/', labelAr: 'اليوم', labelEn: 'Today' },
  { id: 'customers', icon: 'no-customer', href: 'admin/customers/', labelAr: 'العملاء', labelEn: 'Customers', permission: 'customer.view' },
  { id: 'supervisors', icon: 'no-supervisor', href: 'admin/supervisors/', labelAr: 'المشرفون', labelEn: 'Supervisors', permission: 'supervisor.view' },
  { id: 'leads', icon: 'no-lead', href: 'admin/leads/', labelAr: 'العملاء المحتملون والإسناد', labelEn: 'Leads / Attribution', permission: 'attribution.view' },
  { id: 'bookings', icon: 'no-ticket', href: 'admin/bookings/', labelAr: 'الحجوزات', labelEn: 'Bookings' },
  { id: 'tasks', icon: 'no-check', href: 'admin/tasks/', labelAr: 'المهام', labelEn: 'Tasks' },
  { id: 'escalations', icon: 'no-alert', href: 'admin/escalations/', labelAr: 'التصعيدات', labelEn: 'Escalations' },
  { id: 'services', icon: 'no-booking', href: 'admin/services/', labelAr: 'الخدمات', labelEn: 'Services' },
  { id: 'suppliers', icon: 'no-supervisor', href: 'admin/suppliers/', labelAr: 'الموردون', labelEn: 'Suppliers' },
  { id: 'payments', icon: 'no-payment', href: 'admin/payments/', labelAr: 'المدفوعات', labelEn: 'Payments', permission: 'payment.view' },
  { id: 'documents', icon: 'no-documents', href: 'admin/documents/', labelAr: 'المستندات', labelEn: 'Documents', permission: 'document.view' },
  { id: 'notifications', icon: 'no-notification', href: 'admin/notifications/', labelAr: 'الإشعارات', labelEn: 'Notifications' },
  { id: 'reports', icon: 'no-chart', href: 'admin/reports/', labelAr: 'التقارير', labelEn: 'Reports', permission: 'report.view' },
  { id: 'audit', icon: 'no-documents', href: 'admin/audit/', labelAr: 'سجل التدقيق', labelEn: 'Audit trail' },
  { id: 'staff', icon: 'no-shield', href: 'admin/staff/', labelAr: 'الموظفون والصلاحيات', labelEn: 'Staff & Permissions', permission: 'staff.manage' },
  { id: 'rules', icon: 'no-settings', href: 'admin/business-rules/', labelAr: 'قواعد العمل', labelEn: 'Business Rules', permission: 'rules.view' },
  { id: 'settings', icon: 'no-settings', href: 'admin/settings/', labelAr: 'الإعدادات', labelEn: 'Settings', divider: true },
  { id: 'sign-out', icon: 'no-logout', href: 'admin/sign-out/', labelAr: 'تسجيل الخروج', labelEn: 'Sign out' },
];
export function opsNav(current, staff = null) {
  const items = NAV.filter((item) => !item.permission || !staff || hasOpsPermission(staff, item.permission));
  return el('nav', { class: 'c-acct-nav c-svp-nav', 'aria-label': t('ops.nav.label') }, [
    el('ul', { class: 'c-acct-nav__list', role: 'list' }, items.map((item) => el('li', {}, el('a', {
      class: 'c-acct-nav__link', href: route(item.href), dataset: { nav: item.id },
      ...(item.id === current ? { 'aria-current': 'page' } : {}),
    }, [icon(item.icon, { size: 'sm' }), el('span', {}, pick(item, 'label'))])))),
  ]);
}

export function guardState(status, code = null) {
  const expired = status === 'expired';
  if (status === 'unavailable') return [
    el('h1', { class: 't-h1' }, t(code === 'notConfigured' ? 'ops.state.notConnected.title' : 'ops.guard.unavailableTitle')),
    stateBlock({ variant: 'warning', iconName: 'no-alert', headingLevel: 2, title: code === 'notConfigured' ? errorText('notConfigured') : t('ops.guard.unavailable'),
      actions: code === 'notConfigured' ? [{ label: t('brand.name'), href: route('') }] : [{ id: 'retry', label: t('acct.retry'), variant: 'c-btn--primary', onClick: () => location.reload() }] }),
  ];
  return [
    el('h1', { class: 't-h1' }, t(expired ? 'ops.guard.expiredTitle' : 'ops.guard.title')),
    stateBlock({ variant: expired ? 'warning' : 'info', iconName: expired ? 'no-expired' : 'no-shield', headingLevel: 2, title: t(expired ? 'ops.guard.expired' : 'ops.guard.text'),
      actions: [{ label: t('ops.auth.signIn.action'), href: route('admin/sign-in/') + `?next=${encodeURIComponent(here())}`, variant: 'c-btn--primary', id: 'sign-in' }] }),
  ];
}

export const errorText = (code) => t(['unavailable', 'network', 'timeout', 'forbidden', 'notFound', 'rateLimited', 'notConfigured', 'invalid', 'conflict'].includes(code) ? `acct.err.${code === 'conflict' ? 'failed' : code}` : 'acct.err.failed');
export const errorState = (retry, code = null) => stateBlock({
  variant: code === 'notConfigured' ? 'warning' : 'error', iconName: code === 'notConfigured' ? 'no-info' : undefined, headingLevel: 2,
  title: t(code === 'notConfigured' ? 'ops.state.notConnected.title' : 'ops.state.error.title'), text: code ? errorText(code) : t('ops.state.error.text'),
  actions: code === 'notConfigured' || code === 'forbidden' ? [] : [{ id: 'retry', label: t('acct.retry'), variant: 'c-btn--primary', onClick: retry }],
});
export const notFoundState = (backHref, backLabel) => [el('h1', { class: 't-h1' }, t('ops.state.notFound.title')), stateBlock({ variant: 'empty', headingLevel: 2, title: t('ops.state.notFound.text'), actions: [{ label: backLabel, href: backHref, variant: 'c-btn--primary' }] })];
export const forbiddenNote = () => el('p', { class: 'c-note c-note--warning', role: 'note' }, [icon('no-shield', { size: 'sm' }), el('span', { class: 'c-note__text' }, t('ops.forbidden.text'))]);

export async function mountOpsPortal({ root = document, id, head, paint }) {
  setHead(head);
  const { status, staff, code } = await restoreOpsSession();
  if (status !== 'staff') {
    put('notice', null, root); put('nav', null, root); put('main', guardState(status, code), root);
    document.documentElement.dataset.opsPortal = status;
    return { blocked: status, staff: null };
  }
  document.documentElement.dataset.opsPortal = 'staff';
  put('notice', devNotice(), root);
  put('nav', opsNav(id, staff), root);
  const main = slot('main', root);
  render(main, loadingBlock(t('acct.state.loading')));
  let handle = null;
  try { handle = await paint({ staff, main, root, can: (p) => hasOpsPermission(staff, p) }); }
  catch (error) {
    if (error instanceof OpsAuthError) { put('main', guardState('expired'), root); return { blocked: 'expired', staff: null }; }
    if (error?.code === 'forbidden') { render(main, [el('h1', { class: 't-h1' }, t('ops.forbidden.title')), forbiddenNote()]); return { blocked: 'forbidden', staff }; }
    console.warn('[no] ops portal screen failed', error?.code ?? error?.name);
    render(main, errorState(() => mountOpsPortal({ root, id, head, paint }), error?.code ?? null));
  }
  return { staff, ...(handle ?? {}) };
}

export function loadRegion(host, load, { empty, paint, minHeight = '12rem' } = {}) {
  const region = stateRegion(host, { loading: () => loadingBlock(t('acct.state.loading')), minHeight });
  const run = async () => {
    region.loading();
    try {
      const data = await load();
      if (empty && (!data || (Array.isArray(data) && !data.length))) { region.content(empty()); return data; }
      region.content(paint(data)); return data;
    } catch (error) {
      if (error instanceof OpsAuthError) { location.assign(route('admin/sign-in/') + `?next=${encodeURIComponent(here())}`); return null; }
      if (error?.code === 'forbidden') { region.content(forbiddenNote()); return null; }
      console.warn('[no] ops data failed', error?.code ?? error?.name); region.content(errorState(run, error?.code ?? null)); return null;
    }
  };
  return { region, run };
}

/* ---- Shared display pieces ------------------------------------------------ */
export function bookingStatusBadge(status) {
  const tone = { confirmed: 'success', completed: 'success', cancelled: 'error', pending: 'warning', processing: 'info', failed: 'error', expired: 'warning' }[status] ?? 'outline';
  return el('span', { class: `c-badge c-badge--${tone}`, dataset: { status } }, t(`acct.status.${status}`) || status);
}
export function opsStatusBadge(status) {
  if (!status) return el('span', { class: 'c-badge c-badge--outline' }, t('ops.status.none'));
  const tone = { submitted: 'brand', pending_review: 'info', awaiting_payment: 'warning', payment_received: 'info', processing: 'info', supplier_pending: 'warning', confirmed: 'success', ticketed: 'success', service_in_progress: 'success', completed: 'success', cancelled: 'error', failed: 'error', refunded: 'outline' }[status] ?? 'outline';
  return el('span', { class: `c-badge c-badge--${tone}`, dataset: { opsStatus: status } }, t(`ops.lifecycle.${status}`));
}
export const payBadge = (status) => el('span', { class: `c-badge c-badge--${{ paid: 'success', refunded: 'info', pending: 'warning', failed: 'error', unpaid: 'outline' }[status] ?? 'outline'}`, dataset: { pay: status } }, t(`acct.pay.${status}`));
export function supplierStatusBadge(status) {
  const tone = { not_required: 'outline', pending: 'warning', submitted: 'info', processing: 'info', confirmed: 'success', rejected: 'error', failed: 'error', cancelled: 'outline' }[status] ?? 'outline';
  return el('span', { class: `c-badge c-badge--${tone}`, dataset: { supplierStatus: status } }, t(`ops.supplierStatus.${status}`));
}
export function taskStatusBadge(status) {
  const tone = { open: 'brand', in_progress: 'info', waiting: 'warning', completed: 'success', cancelled: 'outline' }[status] ?? 'outline';
  return el('span', { class: `c-badge c-badge--${tone}`, dataset: { taskStatus: status } }, t(`ops.task.status.${status}`));
}
export function escalationStatusBadge(status) {
  const tone = { open: 'error', investigating: 'warning', waiting: 'warning', resolved: 'success', closed: 'outline' }[status] ?? 'outline';
  return el('span', { class: `c-badge c-badge--${tone}`, dataset: { escalationStatus: status } }, t(`ops.escalation.status.${status}`));
}
export function ruleStatusBadge(status) {
  const tone = { DRAFT: 'outline', PENDING: 'warning', APPROVED: 'info', ACTIVE: 'success', DISABLED: 'outline', SUPERSEDED: 'outline' }[status] ?? 'outline';
  return el('span', { class: `c-badge c-badge--${tone}`, dataset: { ruleStatus: status } }, t(`ops.rules.status.${status}`) || status);
}
export function priorityBadge(priority) {
  const tone = { low: 'outline', normal: 'brand', high: 'warning', urgent: 'error' }[priority] ?? 'outline';
  return el('span', { class: `c-badge c-badge--${tone}`, dataset: { priority } }, t(`ops.priority.${priority}`) || priority);
}
export const amount = (n, c) => `${n < 0 ? '−' : ''}${n} ${c ?? ''}`.trim();
export const pageTitle = (titleKey, textKey) => el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t(titleKey)), textKey ? el('p', { class: 't-body t-muted' }, t(textKey)) : null]);
export const block = (title, body, { id = null, action = null } = {}) => el('section', { class: 'c-review-block', ...(id ? { id, 'aria-labelledby': `${id}-title` } : {}) }, [
  el('div', { class: 'c-review-block__head' }, [el('h2', { class: 'c-review-block__title', ...(id ? { id: `${id}-title` } : {}) }, title), action]), body,
]);
export const rows = (pairs) => el('dl', { class: 'c-tripcard__rows' }, pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => el('div', { class: 'c-tripcard__row' }, [el('dt', {}, k), el('dd', {}, v)])));
export const dateTime = (iso) => (iso ? dateShort(iso) : '—');
export function metricCard(labelKey, value, { icon: iconName = 'no-info', tone = null, sub = null } = {}) {
  return el('article', { class: `c-svp-metric${tone ? ` c-svp-metric--${tone}` : ''}` }, [
    el('span', { class: 'c-svp-metric__icon' }, icon(iconName, { size: 'md' })),
    el('div', {}, [el('p', { class: 'c-svp-metric__value' }, String(value)), el('p', { class: 'c-svp-metric__label' }, t(labelKey)), sub ? el('p', { class: 't-body-sm t-muted' }, sub) : null]),
  ]);
}
export function dataTable({ columns, rows: dataRows, rowKey, emptyKey = 'ops.table.empty' }) {
  if (!dataRows.length) return el('p', { class: 't-body-sm t-muted' }, t(emptyKey));
  return el('div', { class: 'c-svp-table-wrap' }, el('table', { class: 'c-svp-table' }, [
    el('thead', {}, el('tr', {}, columns.map((c) => el('th', { scope: 'col' }, t(c.labelKey))))),
    el('tbody', {}, dataRows.map((row) => el('tr', { dataset: { row: rowKey(row) } }, columns.map((c) => el('td', { 'data-label': t(c.labelKey) }, c.render(row)))))),
  ]));
}
