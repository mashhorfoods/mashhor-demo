/* ============================================================================
   OPS / UI / SHELL — what every operations portal screen shares. Stage 15.
   Reuses the supervisor portal's grid, metric, table and filter classes
   (assets/css/23-supervisor-portal.css — generic operational-workspace
   styling, not supervisor-specific despite the file name) so the responsive
   behaviour already verified in Stage 13 carries over unchanged; Stage 15
   adds only what is new (permission-gated actions, a transition picker, a
   workflow step list, an audit timeline) in 24-ops-portal.css.
   ========================================================================= */
import { el } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { icon, setButtonState } from '../../components/ui.js';
import { createStaffPortal } from '../../core/portal-ui.js';
import { restoreOpsSession, OpsAuthError, hasOpsPermission } from '../auth.js';
import { opsDataAdapter } from '../data.js';

export { pageTitle, block, rows, payBadge, bookingStatusBadge, dateTime, amount, metricCard } from '../../core/portal-ui.js';

/* Grouped to match the Command Center's information architecture — Command
   Center / Website / Business / Operations / Insights / Control. Only
   modules that already exist are listed here; the brief's fuller taxonomy
   (Media Library, Content Health) has no backend yet, so no dead nav
   entries were added for it. */
const NAV = [
  { id: 'dashboard', group: 'command', icon: 'no-dashboard', href: 'admin/dashboard/', labelAr: 'نظرة عامة', labelEn: 'Overview' },
  { id: 'services', group: 'website', icon: 'no-booking', href: 'admin/services/', labelAr: 'الخدمات', labelEn: 'Services' },
  { id: 'destinations', group: 'website', icon: 'no-location', href: 'admin/destinations/', labelAr: 'الوجهات', labelEn: 'Destinations' },
  { id: 'offers', group: 'website', icon: 'no-price-tag', href: 'admin/offers/', labelAr: 'العروض والباقات', labelEn: 'Offers & Packages' },
  { id: 'publishing', group: 'website', icon: 'no-publish', href: 'admin/publishing/', labelAr: 'مركز النشر', labelEn: 'Publishing Center' },
  { id: 'supervisors', group: 'operations', icon: 'no-supervisor', href: 'admin/supervisors/', labelAr: 'المنسقون', labelEn: 'Coordinators', permission: 'supervisor.view' },
  { id: 'customers', group: 'business', icon: 'no-customer', href: 'admin/customers/', labelAr: 'العملاء', labelEn: 'Customers', permission: 'customer.view' },
  { id: 'leads', group: 'business', icon: 'no-lead', href: 'admin/leads/', labelAr: 'العملاء المحتملون والإسناد', labelEn: 'Leads / Attribution', permission: 'attribution.view' },
  { id: 'bookings', group: 'business', icon: 'no-ticket', href: 'admin/bookings/', labelAr: 'الحجوزات', labelEn: 'Bookings' },
  { id: 'payments', group: 'business', icon: 'no-payment', href: 'admin/payments/', labelAr: 'المدفوعات', labelEn: 'Payments', permission: 'payment.view' },
  { id: 'documents', group: 'business', icon: 'no-documents', href: 'admin/documents/', labelAr: 'المستندات', labelEn: 'Documents', permission: 'document.view' },
  { id: 'tasks', group: 'operations', icon: 'no-check', href: 'admin/tasks/', labelAr: 'المهام', labelEn: 'Tasks' },
  { id: 'escalations', group: 'operations', icon: 'no-alert', href: 'admin/escalations/', labelAr: 'التصعيدات', labelEn: 'Escalations' },
  { id: 'suppliers', group: 'operations', icon: 'no-supervisor', href: 'admin/suppliers/', labelAr: 'الموردون', labelEn: 'Suppliers' },
  { id: 'notifications', group: 'operations', icon: 'no-notification', href: 'admin/notifications/', labelAr: 'الإشعارات', labelEn: 'Notifications' },
  { id: 'reports', group: 'insights', icon: 'no-chart', href: 'admin/reports/', labelAr: 'التقارير', labelEn: 'Reports', permission: 'report.view' },
  { id: 'audit', group: 'insights', icon: 'no-documents', href: 'admin/audit/', labelAr: 'النشاط', labelEn: 'Activity' },
  { id: 'staff', group: 'system', icon: 'no-shield', href: 'admin/staff/', labelAr: 'الموظفون والصلاحيات', labelEn: 'Staff & Permissions', permission: 'staff.manage' },
  { id: 'rules', group: 'system', icon: 'no-settings', href: 'admin/business-rules/', labelAr: 'قواعد العمل', labelEn: 'Business Rules', permission: 'rules.view' },
  { id: 'settings', group: 'system', icon: 'no-settings', href: 'admin/settings/', labelAr: 'الإعدادات', labelEn: 'Settings' },
  { id: 'sign-out', group: 'system', icon: 'no-logout', href: 'admin/sign-out/', labelAr: 'تسجيل الخروج', labelEn: 'Sign out' },
];
const NAV_GROUP_LABEL = { command: 'ops.navGroup.command', website: 'ops.navGroup.website', business: 'ops.navGroup.business', operations: 'ops.navGroup.operations', insights: 'ops.navGroup.insights', system: 'ops.navGroup.system' };
function opsNav(current, staff = null) {
  const items = NAV.filter((item) => !item.permission || !staff || hasOpsPermission(staff, item.permission));
  let lastGroup = null;
  const rows = items.flatMap((item) => {
    const header = item.group !== lastGroup
      ? [el('li', { class: 'c-acct-nav__group', role: 'presentation' }, el('span', { 'aria-hidden': 'true' }, t(NAV_GROUP_LABEL[item.group])))]
      : [];
    lastGroup = item.group;
    return [...header, el('li', {}, el('a', {
      class: 'c-acct-nav__link', href: route(item.href), dataset: { nav: item.id },
      ...(item.id === current ? { 'aria-current': 'page' } : {}),
    }, [icon(item.icon, { size: 'sm' }), el('span', {}, pick(item, 'label'))]))];
  });
  return el('nav', { class: 'c-acct-nav c-svp-nav', 'aria-label': t('ops.nav.label') }, [
    el('ul', { class: 'c-acct-nav__list', role: 'list' }, rows),
  ]);
}

const forbiddenNote = () => el('p', { class: 'c-note c-note--warning', role: 'note' }, [icon('no-shield', { size: 'sm' }), el('span', { class: 'c-note__text' }, t('ops.forbidden.text'))]);

export const { put, setHead, devNotice, errorText, notFoundState, loadRegion, dataTable, mount: mountOpsPortal } = createStaffPortal({
  attr: 'portal', page: 'ops', prefix: 'ops', label: 'ops', area: 'admin/', entity: 'staff', datasetKey: 'opsPortal',
  isDev: () => !!opsDataAdapter()?.dev, ErrorClass: OpsAuthError, restore: restoreOpsSession, nav: opsNav,
  homeLabelKey: 'brand.name', guardIcon: 'no-shield',
  paintExtras: (staff) => ({ can: (p) => hasOpsPermission(staff, p) }),
  forbidden: forbiddenNote, forbiddenMain: () => [el('h1', { class: 't-h1' }, t('ops.forbidden.title')), forbiddenNote()],
});

/** A submit button with a loading/success/error spinner state, an inline error line, and a FormData-based
    onSubmit — the create/edit/action form shape every ops screen needs. `conflictMessage` overrides the generic
    error text for a 409 (e.g. a booking's payment gate); `onSubmit` may reject with `{ displayMessage }` to show
    a specific inline message (e.g. client-side validation) instead of the generic one; every other error code
    falls back to `errorText`. */
export function actionForm({ submitLabel, disabled, onSubmit, children, conflictMessage = null, size = 'c-btn--sm', stackGap = 8 }) {
  const btn = el('button', { type: 'submit', class: `c-btn c-btn--primary ${size}`.trim(), ...(disabled ? { disabled: true } : {}) }, [el('span', { class: 'c-btn__label' }, submitLabel), el('span', { class: 'c-btn__spinner', 'aria-hidden': 'true' })]);
  const err = el('p', { class: 'c-field__error', role: 'alert', hidden: true });
  const form = el('form', { class: `l-stack l-stack--${stackGap}`, onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true; setButtonState(btn, 'loading');
    try { await onSubmit(new FormData(form), form); setButtonState(btn, 'success'); }
    catch (error) {
      err.hidden = false;
      const message = error?.displayMessage ?? (error?.code === 'conflict' && conflictMessage ? conflictMessage : errorText(error?.code));
      err.replaceChildren(icon('no-alert', { size: 'sm' }), el('span', {}, message));
      setButtonState(btn, 'error');
    }
    setTimeout(() => setButtonState(btn, 'idle'), 1200);
  } }, [...children, err, btn]);
  return form;
}

/** Wires a debounced `input` listener onto a search/filter field — the same 300ms-by-default pattern every
    searchable list screen needs. */
export function debouncedRun(input, run, ms = 300) {
  let timer = null;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, ms); });
}

/** A `<select>` over a status enum plus an "All" option, with i18n keyed `${prefix}.${status}` and change wired to
    `run` — the status-filter dropdown every list screen builds. `labelKey` sets the field's aria-label. */
export function statusFilterSelect(labelKey, statuses, prefix, run) {
  const select = el('select', { class: 'c-field__control c-svp-filter__select', 'aria-label': t(labelKey) },
    [''].concat(statuses).map((s) => el('option', { value: s }, s ? t(`${prefix}.${s}`) : t('ops.filter.all'))));
  select.addEventListener('change', run);
  return select;
}

/** A muted empty-state line for a sub-list inside a detail block (distinct from `loadRegion`'s own top-level
    `empty` option). */
export const emptyNote = (key) => el('p', { class: 't-body-sm t-muted' }, t(key));

/** A standalone action button (not part of a form) that disables itself while `onClick` runs and re-enables only
    on failure — the row-action idiom (activate/deactivate, approve/reject) list and detail screens reuse. With
    `reusable`, it re-enables after success too (an action that can be repeated, e.g. saving a list again). */
export function busyButton(label, variant, onClick, { reusable = false } = {}) {
  const btn = el('button', { type: 'button', class: `c-btn c-btn--${variant} c-btn--sm` }, label);
  btn.addEventListener('click', async () => { btn.disabled = true; try { await onClick(); if (reusable) btn.disabled = false; } catch { btn.disabled = false; } });
  return btn;
}

/* ---- Shared display pieces ------------------------------------------------ */
export function opsStatusBadge(status) {
  if (!status) return el('span', { class: 'c-badge c-badge--outline' }, t('ops.status.none'));
  const tone = { submitted: 'brand', pending_review: 'info', awaiting_payment: 'warning', payment_received: 'info', processing: 'info', supplier_pending: 'warning', confirmed: 'success', ticketed: 'success', service_in_progress: 'success', completed: 'success', cancelled: 'error', failed: 'error', refunded: 'outline' }[status] ?? 'outline';
  return el('span', { class: `c-badge c-badge--${tone}`, dataset: { opsStatus: status } }, t(`ops.lifecycle.${status}`));
}
/** The Command Center CMS's draft/published/archived lifecycle (backend/content.mjs) — shared by destinations and
    offers, and any future content type, so a status reads the same way everywhere in the portal. */
export function publishStatusBadge(status) {
  const tone = { draft: 'outline', published: 'success', archived: 'outline' }[status] ?? 'outline';
  return el('span', { class: `c-badge c-badge--${tone}`, dataset: { publishStatus: status } }, t(`ops.content.publishStatus.${status}`));
}
export const unpublishedChangesNote = () => el('span', { class: 'c-badge c-badge--warning' }, t('ops.content.hasUnpublishedChanges'));
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
