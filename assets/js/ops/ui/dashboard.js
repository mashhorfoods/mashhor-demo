/* OPS / UI / DASHBOARD — the Command Center's Overview: "what is happening right now" across bookings, customers,
   coordinators and the day's operations. Stage 15; expanded for the Command Center repositioning brief (§2/§10/
   §12/§14/§15) — same real counts and lists the rest of the portal already reads, no invented metric. */
import { el, render } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { icon } from '../../components/ui.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, debouncedRun, block, metricCard, opsStatusBadge, taskStatusBadge, escalationStatusBadge, dateTime, rows } from './shell.js';
import { related as auditRelated } from './audit.js';

const QUICK_ACTIONS = [
  { key: 'services', href: 'admin/services/', icon: 'no-booking', titleKey: 'ops.services.title' },
  { key: 'bookings', href: 'admin/bookings/', icon: 'no-ticket', titleKey: 'ops.bookings.title' },
  { key: 'tasks', href: 'admin/tasks/', icon: 'no-check', titleKey: 'ops.tasks.title' },
  { key: 'escalations', href: 'admin/escalations/', icon: 'no-alert', titleKey: 'ops.escalations.title' },
  { key: 'supervisors', href: 'admin/supervisors/', icon: 'no-supervisor', titleKey: 'ops.supervisors.title', permission: 'supervisor.view' },
  { key: 'reports', href: 'admin/reports/', icon: 'no-chart', titleKey: 'ops.reports.title', permission: 'report.view' },
];

/* §14 — one search box across every entity the backend's adminSearch already covers; the backend itself drops
   categories the requesting staff member's permissions don't allow, so nothing extra to gate here client-side. */
const SEARCH_RESULT_ROUTE = {
  customers: (r) => route(`admin/customers/?id=${encodeURIComponent(r.id)}`),
  bookings: (r) => route(`admin/bookings/?id=${encodeURIComponent(r.id)}`),
  supervisors: (r) => route(`admin/supervisors/?id=${encodeURIComponent(r.id)}`),
  suppliers: () => route('admin/suppliers/'),
  tasks: () => route('admin/tasks/'),
  escalations: () => route('admin/escalations/'),
};
const SEARCH_RESULT_LABEL = {
  customers: (r) => r.name || r.email || r.id,
  bookings: (r) => r.id,
  supervisors: (r) => r.nameEn || r.nameAr || r.id,
  suppliers: (r) => r.name,
  tasks: (r) => r.type || r.id,
  escalations: (r) => r.reason || r.id,
};
function globalSearch() {
  const input = el('input', { type: 'search', class: 'c-field__control', 'aria-label': t('ops.dash.search.label'), placeholder: t('ops.dash.search.placeholder') });
  const results = el('div', { class: 'l-stack l-stack--8' }, el('p', { class: 't-body-sm t-muted' }, t('ops.dash.search.hint')));
  const run = async () => {
    const q = input.value.trim();
    if (!q) { render(results, el('p', { class: 't-body-sm t-muted' }, t('ops.dash.search.hint'))); return; }
    const found = await opsData.search(q).catch(() => ({}));
    const groups = Object.entries(found).filter(([, rows]) => rows?.length);
    render(results, groups.length
      ? groups.map(([category, rowsFound]) => el('div', {}, [
          el('p', { class: 'c-field__label' }, t(`ops.dash.search.group.${category}`)),
          el('ul', { class: 'c-svp-mini-list', role: 'list' }, rowsFound.map((r) => el('li', {}, el('a', { class: 'c-svp-link', href: SEARCH_RESULT_ROUTE[category](r) }, SEARCH_RESULT_LABEL[category](r))))),
        ]))
      : el('p', { class: 't-body-sm t-muted' }, t('ops.dash.search.empty')));
  };
  debouncedRun(input, run);
  return el('div', { class: 'l-stack l-stack--12' }, [input, results]);
}

export function mountOpsDashboard({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'dashboard', head: 'page.ops.dashboard', paint: async ({ staff, main, can }) => {
    const tasksHost = el('div', { dataset: { region: 'tasks' } });
    const escHost = el('div', { dataset: { region: 'escalations' } });
    const bkHost = el('div', { dataset: { region: 'bookings' } });
    const coordHost = el('div', { dataset: { region: 'coordinator-activity' } });
    const webHost = el('div', { dataset: { region: 'website-activity' } });
    const recentHost = el('div', { dataset: { region: 'recent-activity' } });
    // Dashboard-refinement brief §7: page context, then key operational
    // metrics, then the priority-item regions below — metricsHost used to be
    // built (see the returned `metrics` handle) but never mounted anywhere,
    // so the tiles never actually appeared on screen. Filled in once the
    // counts resolve, same async-region shape as tasks/esc/bk below.
    const metricsHost = el('div', { class: 'c-svp-metrics' });
    const quickActions = QUICK_ACTIONS.filter((a) => !a.permission || can(a.permission));
    // Command Center home hierarchy (brief §3): welcome → needs attention →
    // today's bookings → coordinator activity → website activity → recent
    // activity → quick actions last. Tasks + escalations are open work that
    // needs a human decision, so they render under one "Needs attention"
    // head instead of two equal-weight, unlabelled blocks.
    const sections = [
      el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1' }, t('ops.dash.welcome', pick(staff, 'name') || staff.email)), el('p', { class: 't-body t-muted' }, t('ops.dash.text'))]),
      block(t('ops.dash.search.title'), globalSearch(), { id: 'dash-search' }),
      metricsHost,
      block(t('ops.dash.needsAttention'), el('div', { class: 'c-acct-grid' }, [
        block(t('ops.tasks.title'), tasksHost, { id: 'dash-tasks', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('admin/tasks/') }, t('acct.viewAll')) }),
        block(t('ops.escalations.title'), escHost, { id: 'dash-esc', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('admin/escalations/') }, t('acct.viewAll')) }),
      ]), { id: 'dash-needs-attention' }),
      block(t('ops.bookings.title'), bkHost, { id: 'dash-bookings', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('admin/bookings/') }, t('acct.viewAll')) }),
    ];
    if (can('attribution.view')) sections.push(block(t('ops.dash.coordinatorActivity'), coordHost, { id: 'dash-coordinator-activity', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('admin/leads/') }, t('acct.viewAll')) }));
    sections.push(block(t('ops.dash.websiteActivity'), webHost, { id: 'dash-website-activity', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('admin/publishing/') }, t('acct.viewAll')) }));
    if (can('audit.view')) sections.push(block(t('ops.dash.recentActivity'), recentHost, { id: 'dash-recent-activity', action: el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('admin/audit/') }, t('acct.viewAll')) }));
    if (quickActions.length) sections.push(block(t('ops.dash.quickActions'), el('div', { class: 'l-cluster l-cluster--8' }, quickActions.map((a) =>
      el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route(a.href) }, [icon(a.icon, { size: 'sm' }), el('span', {}, t(a.titleKey))]))), { id: 'dash-quick-actions' }));
    main.replaceChildren(...sections);
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
    const coord = can('attribution.view') ? loadRegion(coordHost, async () => (await opsData.attributionEvents({ page: 1, pageSize: 5 })).items, {
      paint: (items) => items.length
        ? el('ul', { class: 'c-svp-mini-list', role: 'list' }, items.map((e) => el('li', {}, [
            el('a', { class: 'c-svp-link', href: route(`admin/customers/?id=${encodeURIComponent(e.customerId)}`) }, el('bdi', { dir: 'ltr' }, e.customerId)),
            el('span', { class: 't-body-sm t-muted' }, `${e.supervisorId ?? '—'} · ${dateTime(e.at)}`),
          ])))
        : el('p', { class: 't-body-sm t-muted' }, t('ops.attribution.empty.title')),
    }) : null;
    // "Website activity" (brief §9) — the same destinations/offers admin
    // lists the Publishing Center (publishing.js) already reads, reduced to
    // the two counts that actually need a decision: drafts, and published
    // records with edits not yet republished. No new backend, no invented
    // metric; a full item-by-item feed lives at admin/publishing/ already.
    const web = loadRegion(webHost, async () => {
      const [destinations, offers] = await Promise.all([
        opsData.destinationsAdmin({ pageSize: 100 }).catch(() => ({ items: [] })),
        opsData.offersAdmin({ pageSize: 100 }).catch(() => ({ items: [] })),
      ]);
      const all = [...destinations.items, ...offers.items];
      return {
        drafts: all.filter((x) => x.publishStatus === 'draft').length,
        pendingChanges: all.filter((x) => x.publishStatus === 'published' && x.hasUnpublishedChanges).length,
        published: all.filter((x) => x.publishStatus === 'published').length,
      };
    }, {
      paint: (counts) => (counts.drafts || counts.pendingChanges || counts.published)
        ? rows([
            [t('ops.publishing.pendingChanges'), String(counts.pendingChanges)],
            [t('ops.publishing.drafts'), String(counts.drafts)],
            [t('ops.publishing.published'), String(counts.published)],
          ])
        : el('p', { class: 't-body-sm t-muted' }, t('ops.dash.websiteActivity.empty')),
    });
    // "Recent activity" (brief §11) — the same audit_events feed
    // admin/audit/ shows in full, capped to 5 rows for the home page.
    const recent = can('audit.view') ? loadRegion(recentHost, async () => (await opsData.audit({ page: 1, pageSize: 5 })).items, {
      paint: (items) => items.length
        ? el('ul', { class: 'c-svp-mini-list', role: 'list' }, items.slice().reverse().map((a) => el('li', {}, [
            el('span', {}, `${a.actorId} (${a.actorRole}) — ${a.action}`),
            el('span', { class: 't-body-sm t-muted' }, [auditRelated(a), ' · ', dateTime(a.at)]),
          ])))
        : el('p', { class: 't-body-sm t-muted' }, t('ops.audit.empty.title')),
    }) : null;
    const [t1, t2, , , , overview] = await Promise.all([
      tasks.run(), esc.run(), coord?.run(), web.run(), recent?.run(),
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
    // The rest of overview()'s counts are additive — only render once the call
    // actually succeeded (it needs customer.view), never a fabricated zero.
    if (overview) metrics.push(
      metricCard('ops.metrics.bookings', overview.bookings, { icon: 'no-ticket' }),
      metricCard('ops.metrics.bookingsInProgress', overview.bookingsInProgress, { icon: 'no-ticket' }),
      metricCard('ops.metrics.bookingsUnpaid', overview.bookingsUnpaid, { icon: 'no-payment', tone: 'warning' }),
      metricCard('ops.metrics.customers', overview.customers, { icon: 'no-customer', sub: t('ops.metrics.newCustomers7d') + ': ' + overview.newCustomers7d }),
      metricCard('ops.metrics.documentsPending', overview.documentsPending, { icon: 'no-documents' }),
      metricCard('ops.metrics.supervisors', overview.supervisors, { icon: 'no-supervisor' }),
      metricCard('ops.metrics.suppliers', overview.suppliers, { icon: 'no-supervisor', sub: overview.suppliersNotConnected ? `${overview.suppliersNotConnected} ${t('ops.metrics.suppliersNotConnected')}` : null }),
    );
    render(metricsHost, metrics);
    return {
      metrics,
      regions: { tasks, esc, bk, coord, web, recent },
    };
  } });
}
