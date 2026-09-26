/* ============================================================================
   SUPERVISOR / UI / SHELL — what every supervisor portal screen shares.
   Stage 13. A SEPARATE workspace from the customer account (assets/js/
   account/ui/shell.js): its own navigation, its own guard, its own error
   copy. The Travel & Tourism global header/footer still wrap every page (the
   supervisor is part of the Travel & Tourism brand, never a separate one).
   ========================================================================= */
import { el } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { icon } from '../../components/ui.js';
import { createStaffPortal } from '../../core/portal-ui.js';
// The portal's adapters and strings register here, not in page.js, so public pages never load them. Phase 5
import '../adapters/installed.js';
import '../strings.js';
import { restoreSupervisorSession, SupervisorAuthError } from '../auth.js';
import { supervisorDataAdapter } from '../data.js';

export { pageTitle, block, rows, payBadge, bookingStatusBadge, dateTime, amount, metricCard, revenueGroups, unreadCount } from '../../core/portal-ui.js';

const NAV = [
  { id: 'dashboard', icon: 'no-dashboard', href: 'supervisor/dashboard/', labelAr: 'نظرة عامة', labelEn: 'Overview' },
  { id: 'customers', icon: 'no-customer', href: 'supervisor/customers/', labelAr: 'عملائي', labelEn: 'My customers' },
  { id: 'leads', icon: 'no-lead', href: 'supervisor/leads/', labelAr: 'العملاء المحتملون', labelEn: 'Leads' },
  { id: 'bookings', icon: 'no-ticket', href: 'supervisor/bookings/', labelAr: 'الحجوزات', labelEn: 'Bookings' },
  { id: 'revenue', icon: 'no-payment', href: 'supervisor/revenue/', labelAr: 'الإيرادات', labelEn: 'Revenue' },
  { id: 'performance', icon: 'no-chart', href: 'supervisor/performance/', labelAr: 'الأداء', labelEn: 'Performance' },
  { id: 'notifications', icon: 'no-notification', href: 'supervisor/notifications/', labelAr: 'الإشعارات', labelEn: 'Notifications' },
  { id: 'settings', icon: 'no-settings', href: 'supervisor/settings/', labelAr: 'الإعدادات', labelEn: 'Settings', divider: true },
  { id: 'sign-out', icon: 'no-logout', href: 'supervisor/sign-out/', labelAr: 'تسجيل الخروج', labelEn: 'Sign out' },
];
function portalNav(current) {
  return el('nav', { class: 'c-acct-nav c-svp-nav', 'aria-label': t('svp.nav.label') }, [
    el('ul', { class: 'c-acct-nav__list', role: 'list' }, NAV.map((item) => el('li', {}, el('a', {
      class: 'c-acct-nav__link', href: route(item.href), dataset: { nav: item.id },
      ...(item.id === current ? { 'aria-current': 'page' } : {}),
    }, [icon(item.icon, { size: 'sm' }), el('span', {}, pick(item, 'label'))])))),
  ]);
}

/**
 * mountSupervisorPortal({ root, id, head, paint }): `id` marks the nav, `head` is the page.* key, and
 * `paint({ supervisor, main })` renders the screen into the main slot.
 */
export const { put, setHead, devNotice, errorText, notFoundState, loadRegion, dataTable, mount: mountSupervisorPortal } = createStaffPortal({
  attr: 'portal', page: 'supervisor', prefix: 'svp', label: 'supervisor', area: 'supervisor/', entity: 'supervisor', datasetKey: 'supervisorPortal',
  isDev: () => !!supervisorDataAdapter()?.dev, ErrorClass: SupervisorAuthError, restore: restoreSupervisorSession, nav: portalNav,
  homeLabelKey: 'notFound.home', guardIcon: 'no-supervisor',
});

/* ---- Shared display pieces ------------------------------------------------ */
export function leadStatusBadge(status) {
  const tone = { new: 'brand', contacted: 'info', in_progress: 'warning', converted: 'success', closed: 'outline' }[status] ?? 'outline';
  return el('span', { class: `c-badge c-badge--${tone}`, dataset: { leadStatus: status } }, t(`svp.leads.status.${status}`));
}

/** The commission rule in one sentence: the configured rate, or "not configured" (Phase 6). */
export const commissionText = (model) => (model?.model === 'percentage' && Number.isFinite(Number(model.rate))
  ? t('svp.revenue.commissionRate', `${Math.round(Number(model.rate) * 1000) / 10}%`)
  : t('svp.revenue.commissionPending'));
export function commissionStatusBadge(status) {
  const tone = { earned: 'success', reversed: 'outline' }[status] ?? 'warning';
  return el('span', { class: `c-badge c-badge--${tone}`, dataset: { commissionStatus: status } }, t(`svp.revenue.commissions.status.${status === 'earned' || status === 'reversed' ? status : 'pending'}`));
}

const PERIODS = [['', 'svp.period.all'], ['today', 'svp.period.today'], ['week', 'svp.period.week'], ['month', 'svp.period.month']];
/** The revenue/performance period filter; `run` re-loads on change. */
export function periodSelect(run) {
  const select = el('select', { class: 'c-field__control c-svp-filter__select', 'aria-label': t('svp.period.label') }, PERIODS.map(([v, k]) => el('option', { value: v }, t(k))));
  select.addEventListener('change', run);
  return select;
}
