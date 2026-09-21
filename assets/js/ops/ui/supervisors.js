/* OPS / UI / SUPERVISORS — Stage 14. Admin-wide supervisor directory: view, create, edit, activate/deactivate,
   and one supervisor's unified view (the same scoped read models the supervisor portal itself uses — customers,
   bookings, leads, revenue, performance, commissions — composed admin-side, never a second copy of that logic).
   Commission/revenue figures are shown exactly as the backend reports them; nothing here invents a formula (§8). */
import { el, render } from '../../core/dom.js';
import { t, pick } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { icon, toast } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { SUPERVISOR_LANGUAGES, SUPERVISOR_SPECIALTIES } from '../../data/supervisors.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, pageTitle, notFoundBlock, actionForm, debouncedRun, emptyNote, dataTable, opsStatusBadge, dateTime, block, rows } from './shell.js';

const columns = [
  { labelKey: 'ops.supervisors.col.name', render: (s) => el('a', { class: 'c-svp-link', href: route(`admin/supervisors/?id=${encodeURIComponent(s.id)}`) }, s.nameEn || s.nameAr || s.id) },
  { labelKey: 'ops.supervisors.col.slug', render: (s) => el('bdi', { dir: 'ltr' }, s.slug || '—') },
  { labelKey: 'ops.supervisors.col.status', render: (s) => t(`ops.supervisors.status.${s.status}`) },
  { labelKey: 'ops.supervisors.col.customers', render: (s) => String(s.customersCount) },
];

export function mountOpsSupervisors({ root = document, params = new URLSearchParams(location.search) } = {}) {
  const id = params.get('id');
  if (id) return mountSupervisorDetail({ root, id });
  return mountOpsPortal({ root, id: 'supervisors', head: 'page.ops.supervisors', paint: async ({ main, can }) => {
    const host = el('div', { dataset: { region: 'supervisors' } });
    const search = el('input', { class: 'c-field__control c-svp-filter__select', type: 'search', placeholder: t('ops.supervisors.searchPlaceholder'), 'aria-label': t('ops.supervisors.searchPlaceholder') });
    debouncedRun(search, () => region.run());

    const createForm = can('supervisor.manage') ? (() => {
      const slug = el('input', { name: 'slug', class: 'c-field__control', type: 'text', dir: 'ltr', required: true, 'aria-label': t('ops.supervisors.create.slug'), placeholder: t('ops.supervisors.create.slug') });
      const nameEn = el('input', { name: 'nameEn', class: 'c-field__control', type: 'text', 'aria-label': t('ops.supervisors.create.nameEn'), placeholder: t('ops.supervisors.create.nameEn') });
      const nameAr = el('input', { name: 'nameAr', class: 'c-field__control', type: 'text', 'aria-label': t('ops.supervisors.create.nameAr'), placeholder: t('ops.supervisors.create.nameAr') });
      const email = el('input', { name: 'email', class: 'c-field__control', type: 'email', dir: 'ltr', 'aria-label': t('ops.supervisors.create.email'), placeholder: t('ops.supervisors.create.email') });
      const form = actionForm({
        submitLabel: t('ops.supervisors.create.action'),
        onSubmit: async (fd, formEl) => {
          await opsData.createSupervisorAdmin({ slug: fd.get('slug')?.trim(), nameEn: fd.get('nameEn')?.trim() || undefined, nameAr: fd.get('nameAr')?.trim() || undefined, email: fd.get('email')?.trim() || undefined });
          formEl.reset(); toast({ title: t('ops.supervisors.created'), variant: 'success', duration: 3000 }); await region.run();
        },
        children: [slug, nameEn, nameAr, email],
      });
      return block(t('ops.supervisors.create.title'), form, { id: 'ops-sv-create' });
    })() : null;

    main.replaceChildren(pageTitle('ops.supervisors.title', 'ops.supervisors.text'), createForm, el('div', { class: 'c-svp-filter' }, [search]), host);
    const region = loadRegion(host, async () => (await opsData.supervisorsAdmin({ search: search.value.trim() || undefined, page: 1, pageSize: 50 })).items, {
      empty: () => stateBlock({ variant: 'empty', iconName: 'no-supervisor', headingLevel: 2, title: t('ops.supervisors.empty.title'), text: t('ops.supervisors.empty.text') }),
      paint: (items) => dataTable({ columns, rows: items, rowKey: (s) => s.id, emptyKey: 'ops.supervisors.empty.title' }),
    });
    await region.run();
    return { refresh: region.run };
  } });
}

function mountSupervisorDetail({ root, id }) {
  return mountOpsPortal({ root, id: 'supervisors', head: 'page.ops.supervisorDetail', paint: async ({ main, can }) => {
    const s = await opsData.supervisorAdmin(id);
    if (!s) { render(main, notFoundBlock(route('admin/supervisors/'), t('ops.supervisors.title'))); return { supervisor: null }; }
    const refresh = async () => render(main, await view());

    async function view(preloaded) {
      const fresh = preloaded ?? await opsData.supervisorAdmin(id);
      const nodes = [
        el('p', {}, el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('admin/supervisors/') }, [icon('no-arrow-end', { size: 'xs', className: 'c-icon--start' }), el('span', {}, t('ops.supervisors.title'))])),
        el('div', { class: 'l-stack l-stack--4' }, [el('h1', { class: 't-h1' }, fresh.nameEn || fresh.nameAr || fresh.id), el('p', { class: 't-body t-muted' }, [t(`ops.supervisors.status.${fresh.status}`), ' · ', el('bdi', { dir: 'ltr' }, fresh.slug || '—')])]),
        block(t('ops.supervisors.detail.title'), rows([
          [t('ops.supervisors.col.customers'), String(fresh.customers.length)],
          [t('acct.total'), `${fresh.revenue.gross} ${fresh.revenue.currency}`],
          [t('ops.supervisors.detail.commission'), fresh.revenue.commission.model === null ? t('ops.supervisors.detail.commissionPending') : String(fresh.revenue.commission.model)],
        ]), { id: 'ops-sv-details' }),
      ];

      if (can('supervisor.manage')) {
        const active = fresh.status === 'active';
        const btn = el('button', { type: 'button', class: `c-btn c-btn--sm ${active ? 'c-btn--tertiary' : 'c-btn--primary'}` }, t(active ? 'ops.supervisors.deactivate' : 'ops.supervisors.activate'));
        btn.addEventListener('click', async () => { btn.disabled = true; try { await opsData.updateSupervisorAdmin(id, { active: !active }); toast({ title: t('ops.supervisors.updated'), variant: 'success', duration: 3000 }); await refresh(); } catch { btn.disabled = false; } });
        nodes.push(block(t('ops.supervisors.manage.title'), btn, { id: 'ops-sv-manage' }));
        nodes.push(block(t('ops.supervisors.edit.title'), editForm(fresh, refresh), { id: 'ops-sv-edit' }));
      }

      if (can('customer.view')) nodes.push(block(t('ops.supervisors.customers.title'), fresh.customers.length
        ? el('ul', { class: 'c-svp-mini-list', role: 'list' }, fresh.customers.map((c) => el('li', {}, [el('a', { class: 'c-svp-link', href: route(`admin/customers/?id=${encodeURIComponent(c.id)}`) }, c.name), el('span', { class: 't-body-sm t-muted' }, dateTime(c.createdAt))])))
        : emptyNote('ops.table.empty'), { id: 'ops-sv-customers' }));

      nodes.push(block(t('ops.supervisors.bookings.title'), fresh.bookings.length
        ? dataTable({ columns: [
            { labelKey: 'ops.bookings.col.id', render: (b) => el('bdi', { dir: 'ltr' }, b.id) },
            { labelKey: 'ops.bookings.col.service', render: (b) => b.service },
            { labelKey: 'ops.bookings.col.status', render: (b) => opsStatusBadge(b.opsStatus) },
          ], rows: fresh.bookings, rowKey: (b) => b.id })
        : emptyNote('ops.table.empty'), { id: 'ops-sv-bookings' }));

      // Command Center brief §12/§13 — "what did the coordinator do, when, on which
      // customer, what happened next": the same attribution_events the admin-wide
      // Leads/Attribution screen reads, scoped to this one supervisor instead of
      // every supervisor at once.
      if (can('attribution.view')) {
        const activityHost = el('div', { dataset: { region: 'coordinator-activity' } });
        nodes.push(block(t('ops.supervisors.activity.title'), activityHost, { id: 'ops-sv-activity' }));
        const activity = loadRegion(activityHost, async () => (await opsData.attributionEvents({ supervisorId: id, page: 1, pageSize: 10 })).items, {
          empty: () => emptyNote('ops.table.empty'),
          paint: (items) => el('ul', { class: 'c-svp-mini-list', role: 'list' }, items.map((e) => el('li', {}, [
            el('a', { class: 'c-svp-link', href: route(`admin/customers/?id=${encodeURIComponent(e.customerId)}`) }, el('bdi', { dir: 'ltr' }, e.customerId)),
            el('span', { class: 't-body-sm t-muted' }, `${e.source} · ${dateTime(e.at)}`),
          ]))),
        });
        activity.run();
      }

      return nodes;
    }

    render(main, await view(s));
    return { supervisor: s, refresh };
  } });
}

/** Full profile edit — every field an admin may replace once the business supplies the real supervisor: name, slug,
    title, bio, photo, contact channels, city, languages, specialties. A field left blank clears it (matches the
    public profile's own "a field the record does not have is not rendered" rule) — this form never invents a value
    the admin didn't type. */
function editForm(fresh, refresh) {
  const field = (name, labelKey, value, opts = {}) => {
    const input = el('input', { name, class: 'c-field__control', type: opts.type ?? 'text', dir: opts.dir, value: value ?? '', 'aria-label': t(labelKey), placeholder: t(labelKey) });
    return el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label' }, t(labelKey)), input]);
  };
  const bioAr = el('textarea', { name: 'bioAr', class: 'c-field__control', rows: 3, 'aria-label': t('ops.supervisors.edit.bioAr') }, fresh.bioAr ?? '');
  const bioEn = el('textarea', { name: 'bioEn', class: 'c-field__control', rows: 3, dir: 'ltr', 'aria-label': t('ops.supervisors.edit.bioEn') }, fresh.bioEn ?? '');

  const checks = (list, chosen, prefix) => el('ul', { class: 'c-svp-mini-list', role: 'list' }, list.map((item) => {
    const checkbox = el('input', { type: 'checkbox', value: item.id, dataset: { group: prefix }, ...(chosen?.includes(item.id) ? { checked: true } : {}) });
    return el('li', {}, el('label', { class: 'l-cluster l-cluster--8' }, [checkbox, el('span', {}, pick(item, 'label'))]));
  }));
  const languagesList = checks(SUPERVISOR_LANGUAGES, fresh.languages, 'lang');
  const specialtiesList = checks(SUPERVISOR_SPECIALTIES, fresh.specialties, 'spec');
  const checked = (list, group) => [...list.querySelectorAll(`input[type=checkbox][data-group="${group}"]:checked`)].map((c) => c.value);

  const slug = field('slug', 'ops.supervisors.edit.slug', fresh.slug, { dir: 'ltr' });
  const nameAr = field('nameAr', 'ops.supervisors.edit.nameAr', fresh.nameAr);
  const nameEn = field('nameEn', 'ops.supervisors.edit.nameEn', fresh.nameEn, { dir: 'ltr' });
  const titleAr = field('titleAr', 'ops.supervisors.edit.titleAr', fresh.titleAr);
  const titleEn = field('titleEn', 'ops.supervisors.edit.titleEn', fresh.titleEn, { dir: 'ltr' });
  const phone = field('phone', 'ops.supervisors.edit.phone', fresh.phone, { dir: 'ltr' });
  const whatsapp = field('whatsapp', 'ops.supervisors.edit.whatsapp', fresh.whatsapp, { dir: 'ltr' });
  const email = field('email', 'ops.supervisors.edit.email', fresh.email, { type: 'email', dir: 'ltr' });
  const city = field('city', 'ops.supervisors.edit.city', fresh.city);
  const imageSrc = field('imageSrc', 'ops.supervisors.edit.imageSrc', fresh.image?.src, { dir: 'ltr' });

  return actionForm({
    submitLabel: t('ops.supervisors.edit.save'),
    onSubmit: async (fd) => {
      await opsData.updateSupervisorAdmin(fresh.id, {
        slug: fd.get('slug')?.trim() || undefined,
        nameAr: fd.get('nameAr')?.trim() ?? '', nameEn: fd.get('nameEn')?.trim() ?? '',
        titleAr: fd.get('titleAr')?.trim() ?? '', titleEn: fd.get('titleEn')?.trim() ?? '',
        bioAr: fd.get('bioAr')?.trim() ?? '', bioEn: fd.get('bioEn')?.trim() ?? '',
        phone: fd.get('phone')?.trim() ?? '', whatsapp: fd.get('whatsapp')?.trim() ?? '', email: fd.get('email')?.trim() ?? '', city: fd.get('city')?.trim() ?? '',
        image: fd.get('imageSrc')?.trim() ? { src: fd.get('imageSrc').trim(), altAr: fresh.image?.altAr, altEn: fresh.image?.altEn } : null,
        languages: checked(languagesList, 'lang'), specialties: checked(specialtiesList, 'spec'),
      });
      toast({ title: t('ops.supervisors.updated'), variant: 'success', duration: 3000 }); await refresh();
    },
    children: [
      slug, nameAr, nameEn, titleAr, titleEn,
      el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label' }, t('ops.supervisors.edit.bioAr')), bioAr]),
      el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label' }, t('ops.supervisors.edit.bioEn')), bioEn]),
      phone, whatsapp, email, city, imageSrc,
      el('div', { class: 'l-stack l-stack--8' }, [el('p', { class: 'c-field__label' }, t('sup.about.languages')), languagesList]),
      el('div', { class: 'l-stack l-stack--8' }, [el('p', { class: 'c-field__label' }, t('sup.about.specialties')), specialtiesList]),
    ],
  });
}
