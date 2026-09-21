/* OPS / UI / DESTINATIONS — Command Center CMS Phase 2A. Admin-wide destination directory: view, create, edit,
   activate/deactivate. A real backend entity now (backend/content.mjs) — the public site's own destinations
   registry (assets/js/data/destinations.js) is untouched and does not yet read from here (Phase 2 scope decision:
   the public site stays static until a later phase). No draft/publish state yet — `active` only, same as Services. */
import { el, render } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { toast } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, pageTitle, notFoundBlock, actionForm, debouncedRun, dataTable, block, rows } from './shell.js';

const columns = [
  { labelKey: 'ops.destinations.col.name', render: (d) => el('a', { class: 'c-svp-link', href: route(`admin/destinations/?id=${encodeURIComponent(d.id)}`) }, d.nameEn || d.nameAr || d.id) },
  { labelKey: 'ops.destinations.col.slug', render: (d) => el('bdi', { dir: 'ltr' }, d.slug) },
  { labelKey: 'ops.destinations.col.region', render: (d) => d.region ?? '—' },
  { labelKey: 'ops.destinations.col.status', render: (d) => t(d.active ? 'ops.destinations.status.active' : 'ops.destinations.status.inactive') },
];
const strList = (v) => (v ?? []).join(', ');
const parseList = (v) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);

export function mountOpsDestinations({ root = document, params = new URLSearchParams(location.search) } = {}) {
  const id = params.get('id');
  if (id) return mountDestinationDetail({ root, id });
  return mountOpsPortal({ root, id: 'destinations', head: 'page.ops.destinations', paint: async ({ main, can }) => {
    const host = el('div', { dataset: { region: 'destinations' } });
    const search = el('input', { class: 'c-field__control c-svp-filter__select', type: 'search', placeholder: t('ops.destinations.searchPlaceholder'), 'aria-label': t('ops.destinations.searchPlaceholder') });
    debouncedRun(search, () => region.run());

    const createForm = can('content.manage') ? (() => {
      const slug = el('input', { name: 'slug', class: 'c-field__control', type: 'text', dir: 'ltr', required: true, 'aria-label': t('ops.destinations.create.slug'), placeholder: t('ops.destinations.create.slug') });
      const nameEn = el('input', { name: 'nameEn', class: 'c-field__control', type: 'text', dir: 'ltr', 'aria-label': t('ops.destinations.create.nameEn'), placeholder: t('ops.destinations.create.nameEn') });
      const nameAr = el('input', { name: 'nameAr', class: 'c-field__control', type: 'text', 'aria-label': t('ops.destinations.create.nameAr'), placeholder: t('ops.destinations.create.nameAr') });
      const form = actionForm({
        submitLabel: t('ops.destinations.create.action'),
        onSubmit: async (fd, formEl) => {
          await opsData.createDestinationAdmin({ slug: fd.get('slug')?.trim(), nameEn: fd.get('nameEn')?.trim() || undefined, nameAr: fd.get('nameAr')?.trim() || undefined });
          formEl.reset(); toast({ title: t('ops.destinations.created'), variant: 'success', duration: 3000 }); await region.run();
        },
        conflictMessage: t('ops.destinations.create.conflict'),
        children: [slug, nameEn, nameAr],
      });
      return block(t('ops.destinations.create.title'), form, { id: 'ops-dst-create' });
    })() : null;

    main.replaceChildren(pageTitle('ops.destinations.title', 'ops.destinations.text'), createForm, el('div', { class: 'c-svp-filter' }, [search]), host);
    const region = loadRegion(host, async () => (await opsData.destinationsAdmin({ search: search.value.trim() || undefined, page: 1, pageSize: 50 })).items, {
      empty: () => stateBlock({ variant: 'empty', headingLevel: 2, title: t('ops.destinations.empty.title'), text: t('ops.destinations.empty.text') }),
      paint: (items) => dataTable({ columns, rows: items, rowKey: (d) => d.id, emptyKey: 'ops.destinations.empty.title' }),
    });
    await region.run();
    return { refresh: region.run };
  } });
}

function mountDestinationDetail({ root, id }) {
  return mountOpsPortal({ root, id: 'destinations', head: 'page.ops.destinationDetail', paint: async ({ main, can }) => {
    const d = await opsData.destinationAdmin(id);
    if (!d) { render(main, notFoundBlock(route('admin/destinations/'), t('ops.destinations.title'))); return { destination: null }; }
    const refresh = async () => render(main, await view());

    async function view(preloaded) {
      const fresh = preloaded ?? await opsData.destinationAdmin(id);
      const nodes = [
        el('p', {}, el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('admin/destinations/') }, [el('span', {}, t('ops.destinations.title'))])),
        el('div', { class: 'l-stack l-stack--4' }, [el('h1', { class: 't-h1' }, fresh.nameEn || fresh.nameAr || fresh.id), el('p', { class: 't-body t-muted' }, [t(fresh.active ? 'ops.destinations.status.active' : 'ops.destinations.status.inactive'), ' · ', el('bdi', { dir: 'ltr' }, fresh.slug)])]),
        block(t('ops.destinations.detail.title'), rows([
          [t('ops.destinations.col.region'), fresh.region ?? '—'],
          [t('ops.destinations.edit.purposes'), strList(fresh.purposes) || '—'],
          [t('ops.destinations.edit.services'), strList(fresh.services) || '—'],
          [t('ops.destinations.edit.featured'), t(fresh.featured ? 'ops.destinations.yes' : 'ops.destinations.no')],
          [t('ops.destinations.edit.home'), t(fresh.home ? 'ops.destinations.yes' : 'ops.destinations.no')],
        ]), { id: 'ops-dst-details' }),
      ];
      if (can('content.manage')) nodes.push(block(t('ops.destinations.edit.title'), editForm(fresh, refresh), { id: 'ops-dst-edit' }));
      return nodes;
    }

    render(main, await view(d));
    return { destination: d, refresh };
  } });
}

function editForm(fresh, refresh) {
  const field = (name, labelKey, value, opts = {}) => {
    const input = el('input', { name, class: 'c-field__control', type: opts.type ?? 'text', dir: opts.dir, value: value ?? '', 'aria-label': t(labelKey), placeholder: t(labelKey) });
    return el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label' }, t(labelKey)), input]);
  };
  const descAr = el('textarea', { name: 'descAr', class: 'c-field__control', rows: 2, 'aria-label': t('ops.destinations.edit.descAr') }, fresh.descAr ?? '');
  const descEn = el('textarea', { name: 'descEn', class: 'c-field__control', rows: 2, dir: 'ltr', 'aria-label': t('ops.destinations.edit.descEn') }, fresh.descEn ?? '');
  const slug = field('slug', 'ops.destinations.edit.slug', fresh.slug, { dir: 'ltr' });
  const region = field('region', 'ops.destinations.edit.region', fresh.region, { dir: 'ltr' });
  const nameAr = field('nameAr', 'ops.destinations.edit.nameAr', fresh.nameAr);
  const nameEn = field('nameEn', 'ops.destinations.edit.nameEn', fresh.nameEn, { dir: 'ltr' });
  const countryAr = field('countryAr', 'ops.destinations.edit.countryAr', fresh.countryAr);
  const countryEn = field('countryEn', 'ops.destinations.edit.countryEn', fresh.countryEn, { dir: 'ltr' });
  const imageSrc = field('imageSrc', 'ops.destinations.edit.imageSrc', fresh.image?.src, { dir: 'ltr' });
  const purposes = field('purposes', 'ops.destinations.edit.purposes', strList(fresh.purposes), { dir: 'ltr' });
  const services = field('services', 'ops.destinations.edit.services', strList(fresh.services), { dir: 'ltr' });
  const order = field('order', 'ops.destinations.edit.order', fresh.order, { type: 'number' });
  const featured = el('input', { type: 'checkbox', name: 'featured', ...(fresh.featured ? { checked: true } : {}) });
  const home = el('input', { type: 'checkbox', name: 'home', ...(fresh.home ? { checked: true } : {}) });
  const active = el('input', { type: 'checkbox', name: 'active', ...(fresh.active ? { checked: true } : {}) });

  return actionForm({
    submitLabel: t('ops.destinations.edit.save'),
    onSubmit: async (fd) => {
      await opsData.updateDestinationAdmin(fresh.id, {
        slug: fd.get('slug')?.trim() || undefined, region: fd.get('region')?.trim() ?? '',
        nameAr: fd.get('nameAr')?.trim() ?? '', nameEn: fd.get('nameEn')?.trim() ?? '',
        countryAr: fd.get('countryAr')?.trim() ?? '', countryEn: fd.get('countryEn')?.trim() ?? '',
        descAr: fd.get('descAr')?.trim() ?? '', descEn: fd.get('descEn')?.trim() ?? '',
        image: fd.get('imageSrc')?.trim() ? { src: fd.get('imageSrc').trim(), altAr: fresh.image?.altAr, altEn: fresh.image?.altEn } : null,
        purposes: parseList(fd.get('purposes')), services: parseList(fd.get('services')),
        order: fd.get('order') ? Number(fd.get('order')) : null,
        featured: fd.get('featured') === 'on', home: fd.get('home') === 'on', active: fd.get('active') === 'on',
      });
      toast({ title: t('ops.destinations.updated'), variant: 'success', duration: 3000 }); await refresh();
    },
    conflictMessage: t('ops.destinations.create.conflict'),
    children: [
      slug, region, nameAr, nameEn, countryAr, countryEn,
      el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label' }, t('ops.destinations.edit.descAr')), descAr]),
      el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label' }, t('ops.destinations.edit.descEn')), descEn]),
      imageSrc, purposes, services, order,
      el('label', { class: 'l-cluster l-cluster--8' }, [featured, el('span', {}, t('ops.destinations.edit.featured'))]),
      el('label', { class: 'l-cluster l-cluster--8' }, [home, el('span', {}, t('ops.destinations.edit.home'))]),
      el('label', { class: 'l-cluster l-cluster--8' }, [active, el('span', {}, t('ops.destinations.edit.activeLabel'))]),
    ],
  });
}
