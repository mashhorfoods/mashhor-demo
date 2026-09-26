/* OPS / UI / OFFERS — Command Center CMS. Admin-wide offers & packages directory: view, create, edit, and the
   draft → published → archived lifecycle (Phase 2B-i; backend/content.mjs). A real backend entity since Phase 2A
   — the public site's own offers registry (assets/js/data/offers.js) is untouched and does not yet read from here
   (Phase 2 scope decision: the public site stays static; staff preview it through admin/offers/preview/ instead).
   The richer nested content (inclusions/exclusions/itinerary/terms/FAQ/travel period) is one `detail` JSON blob,
   edited as raw JSON here — the same "no dedicated UI yet" pattern the Business Rules manage form already
   established for its own raw-value editor. Editing an already-published offer never silently unpublishes it. */
import { el, render } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { toast } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { opsData } from '../data.js';
import { mountOpsPortal, loadRegion, pagedRegion, pageTitle, notFoundState, actionForm, debouncedRun, dataTable, block, rows, publishStatusBadge, unpublishedChangesNote, dateTime, amount } from './shell.js';
import { publishingControls } from './destinations.js';

const priceText = (p) => (p ? `${amount(p.amount, p.currency)} (${p.type ?? ''})` : '—');
const columns = [
  { labelKey: 'ops.offers.col.title', render: (o) => el('a', { class: 'c-svp-link', href: route(`admin/offers/?id=${encodeURIComponent(o.id)}`) }, o.titleEn || o.titleAr || o.id) },
  { labelKey: 'ops.offers.col.slug', render: (o) => el('bdi', { dir: 'ltr' }, o.slug) },
  { labelKey: 'ops.offers.col.publishStatus', render: (o) => el('span', { class: 'l-cluster l-cluster--8' }, [publishStatusBadge(o.publishStatus), o.hasUnpublishedChanges ? unpublishedChangesNote() : null]) },
  { labelKey: 'ops.offers.col.status', render: (o) => t(`ops.offers.status.${o.status}`) || o.status },
  { labelKey: 'ops.offers.col.price', render: (o) => el('bdi', { dir: 'ltr' }, priceText(o.price)) },
];

export function mountOpsOffers({ root = document, params = new URLSearchParams(location.search) } = {}) {
  const id = params.get('id');
  if (id) return mountOfferDetail({ root, id });
  return mountOpsPortal({ root, id: 'offers', head: 'page.ops.offers', paint: async ({ main, can }) => {
    const host = el('div', { dataset: { region: 'offers' } });
    const search = el('input', { class: 'c-field__control c-svp-filter__select', type: 'search', placeholder: t('ops.offers.searchPlaceholder'), 'aria-label': t('ops.offers.searchPlaceholder') });
    debouncedRun(search, () => region.run());

    const createForm = can('content.manage') ? (() => {
      const slug = el('input', { name: 'slug', class: 'c-field__control', type: 'text', dir: 'ltr', required: true, 'aria-label': t('ops.offers.create.slug'), placeholder: t('ops.offers.create.slug') });
      const titleEn = el('input', { name: 'titleEn', class: 'c-field__control', type: 'text', dir: 'ltr', 'aria-label': t('ops.offers.create.titleEn'), placeholder: t('ops.offers.create.titleEn') });
      const titleAr = el('input', { name: 'titleAr', class: 'c-field__control', type: 'text', 'aria-label': t('ops.offers.create.titleAr'), placeholder: t('ops.offers.create.titleAr') });
      const form = actionForm({
        submitLabel: t('ops.offers.create.action'),
        onSubmit: async (fd, formEl) => {
          await opsData.createOfferAdmin({ slug: fd.get('slug')?.trim(), titleEn: fd.get('titleEn')?.trim() || undefined, titleAr: fd.get('titleAr')?.trim() || undefined });
          formEl.reset(); toast({ title: t('ops.offers.created'), variant: 'success', duration: 3000 }); await region.run();
        },
        conflictMessage: t('ops.offers.create.conflict'),
        children: [slug, titleEn, titleAr],
      });
      return block(t('ops.offers.create.title'), form, { id: 'ops-off-create' });
    })() : null;

    main.replaceChildren(pageTitle('ops.offers.title', 'ops.offers.text'), createForm, el('div', { class: 'c-svp-filter' }, [search]), host);
    const region = pagedRegion(host, (q) => opsData.offersAdmin(q), {
      filters: () => ({ search: search.value.trim() || undefined }),
      empty: () => stateBlock({ variant: 'empty', headingLevel: 2, title: t('ops.offers.empty.title'), text: t('ops.offers.empty.text') }),
      paint: (items) => dataTable({ columns, rows: items, rowKey: (o) => o.id, emptyKey: 'ops.offers.empty.title' }),
    });
    await region.run();
    return { refresh: region.run };
  } });
}

function mountOfferDetail({ root, id }) {
  return mountOpsPortal({ root, id: 'offers', head: 'page.ops.offerDetail', paint: async ({ main, can }) => {
    const o = await opsData.offerAdmin(id);
    if (!o) { render(main, notFoundState(route('admin/offers/'), t('ops.offers.title'))); return { offer: null }; }
    const refresh = async () => render(main, await view());

    async function view(preloaded) {
      const fresh = preloaded ?? await opsData.offerAdmin(id);
      const nodes = [
        el('p', {}, el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: route('admin/offers/') }, [el('span', {}, t('ops.offers.title'))])),
        el('div', { class: 'l-stack l-stack--4' }, [
          el('h1', { class: 't-h1' }, fresh.titleEn || fresh.titleAr || fresh.id),
          el('p', { class: 'l-cluster l-cluster--8 t-body t-muted' }, [publishStatusBadge(fresh.publishStatus), fresh.hasUnpublishedChanges ? unpublishedChangesNote() : null, el('bdi', { dir: 'ltr' }, fresh.slug)]),
        ]),
        fresh.placeholder ? el('p', { class: 'c-note c-note--warning', role: 'note' }, t('ops.offers.placeholderNote')) : null,
      ];
      if (can('content.manage')) nodes.push(block(t('ops.offers.publishing.title'), publishingControls(fresh, refresh, 'offer'), { id: 'ops-off-publishing' }));
      nodes.push(block(t('ops.offers.detail.title'), rows([
        [t('ops.offers.col.price'), priceText(fresh.price)],
        [t('ops.offers.edit.bookingMode'), t(`ops.offers.bookingMode.${fresh.bookingMode}`) || fresh.bookingMode],
        [t('ops.offers.edit.nights'), fresh.duration?.nights ?? '—'],
        [t('ops.offers.edit.destinationId'), fresh.destinationId ? el('a', { class: 'c-svp-link', href: route(`admin/destinations/?id=${encodeURIComponent(fresh.destinationId)}`) }, fresh.destinationId) : '—'],
        [t('ops.content.publishedAt'), fresh.publishedAt ? dateTime(fresh.publishedAt) : '—'],
      ]), { id: 'ops-off-details' }));
      if (can('content.manage')) nodes.push(block(t('ops.offers.edit.title'), editForm(fresh, refresh), { id: 'ops-off-edit' }));
      return nodes;
    }

    render(main, await view(o));
    return { offer: o, refresh };
  } });
}

const OFFER_STATUSES = ['available', 'request', 'soon', 'ended'];
function editForm(fresh, refresh) {
  const field = (name, labelKey, value, opts = {}) => {
    const input = el('input', { name, class: 'c-field__control', type: opts.type ?? 'text', dir: opts.dir, value: value ?? '', 'aria-label': t(labelKey), placeholder: t(labelKey) });
    return el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label' }, t(labelKey)), input]);
  };
  const shortAr = el('textarea', { name: 'shortAr', class: 'c-field__control', rows: 2, 'aria-label': t('ops.offers.edit.shortAr') }, fresh.shortAr ?? '');
  const shortEn = el('textarea', { name: 'shortEn', class: 'c-field__control', rows: 2, dir: 'ltr', 'aria-label': t('ops.offers.edit.shortEn') }, fresh.shortEn ?? '');
  const slug = field('slug', 'ops.offers.edit.slug', fresh.slug, { dir: 'ltr' });
  const titleAr = field('titleAr', 'ops.offers.edit.titleAr', fresh.titleAr);
  const titleEn = field('titleEn', 'ops.offers.edit.titleEn', fresh.titleEn, { dir: 'ltr' });
  const destinationId = field('destinationId', 'ops.offers.edit.destinationId', fresh.destinationId, { dir: 'ltr' });
  const nights = field('nights', 'ops.offers.edit.nights', fresh.duration?.nights, { type: 'number' });
  const priceAmount = field('priceAmount', 'ops.offers.edit.priceAmount', fresh.price?.amount, { type: 'number' });
  const priceCurrency = field('priceCurrency', 'ops.offers.edit.priceCurrency', fresh.price?.currency, { dir: 'ltr' });
  const priceBasisEn = field('priceBasisEn', 'ops.offers.edit.priceBasisEn', fresh.price?.basisEn, { dir: 'ltr' });
  const imageSrc = field('imageSrc', 'ops.offers.edit.imageSrc', fresh.image?.src, { dir: 'ltr' });
  const status = el('select', { name: 'status', class: 'c-field__control', 'aria-label': t('ops.offers.edit.status') }, OFFER_STATUSES.map((s) => el('option', { value: s, ...(fresh.status === s ? { selected: true } : {}) }, t(`ops.offers.status.${s}`) || s)));
  const bookingMode = el('select', { name: 'bookingMode', class: 'c-field__control', 'aria-label': t('ops.offers.edit.bookingMode') }, ['online', 'request'].map((m) => el('option', { value: m, ...(fresh.bookingMode === m ? { selected: true } : {}) }, t(`ops.offers.bookingMode.${m}`) || m)));
  const detail = el('textarea', { name: 'detail', class: 'c-field__control', rows: 6, dir: 'ltr', 'aria-label': t('ops.offers.edit.detail') }, JSON.stringify(fresh.detail ?? {}, null, 2));
  const featured = el('input', { type: 'checkbox', name: 'featured', ...(fresh.featured ? { checked: true } : {}) });
  const placeholder = el('input', { type: 'checkbox', name: 'placeholder', ...(fresh.placeholder ? { checked: true } : {}) });

  return actionForm({
    submitLabel: t('ops.offers.edit.save'),
    onSubmit: async (fd) => {
      let detailValue;
      try { detailValue = JSON.parse(fd.get('detail') || '{}'); }
      catch { throw { displayMessage: t('ops.offers.edit.detailInvalid') }; }
      const amount = fd.get('priceAmount'); const hasPrice = amount !== '' && amount != null;
      await opsData.updateOfferAdmin(fresh.id, {
        slug: fd.get('slug')?.trim() || undefined, titleAr: fd.get('titleAr')?.trim() ?? '', titleEn: fd.get('titleEn')?.trim() ?? '',
        shortAr: fd.get('shortAr')?.trim() ?? '', shortEn: fd.get('shortEn')?.trim() ?? '',
        destinationId: fd.get('destinationId')?.trim() || null,
        duration: { nights: fd.get('nights') ? Number(fd.get('nights')) : null },
        price: hasPrice ? { amount: Number(amount), currency: fd.get('priceCurrency')?.trim() || 'USD', type: 'from', basisEn: fd.get('priceBasisEn')?.trim() || null } : null,
        image: fd.get('imageSrc')?.trim() ? { src: fd.get('imageSrc').trim(), altAr: fresh.image?.altAr, altEn: fresh.image?.altEn } : null,
        status: fd.get('status'), bookingMode: fd.get('bookingMode'), detail: detailValue,
        featured: fd.get('featured') === 'on', placeholder: fd.get('placeholder') === 'on',
      });
      toast({ title: t('ops.offers.updated'), variant: 'success', duration: 3000 }); await refresh();
    },
    conflictMessage: t('ops.offers.create.conflict'),
    children: [
      slug, titleAr, titleEn, destinationId,
      el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label' }, t('ops.offers.edit.shortAr')), shortAr]),
      el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label' }, t('ops.offers.edit.shortEn')), shortEn]),
      nights, priceAmount, priceCurrency, priceBasisEn, imageSrc,
      el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label' }, t('ops.offers.edit.status')), status]),
      el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label' }, t('ops.offers.edit.bookingMode')), bookingMode]),
      el('div', { class: 'c-field' }, [el('label', { class: 'c-field__label' }, t('ops.offers.edit.detail')), detail]),
      el('label', { class: 'l-cluster l-cluster--8' }, [featured, el('span', {}, t('ops.offers.edit.featured'))]),
      el('label', { class: 'l-cluster l-cluster--8' }, [placeholder, el('span', {}, t('ops.offers.edit.placeholder'))]),
    ],
  });
}
