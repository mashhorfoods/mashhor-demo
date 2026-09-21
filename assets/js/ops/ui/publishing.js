/* OPS / UI / PUBLISHING — the Command Center's Publishing Center (Phase 2B-i, brief §16): "what is ready to
   publish?" across every content type the CMS currently manages (destinations, offers). Read-mostly — it
   aggregates the same list endpoints destinations.js/offers.js already call, grouped by publish state, with
   Preview/Edit/Publish/Unpublish actions inline so an admin doesn't have to open each record just to act on it. */
import { el, render } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { route } from '../../data/config.js';
import { toast } from '../../components/ui.js';
import { stateBlock } from '../../components/states.js';
import { opsData } from '../data.js';
import { mountOpsPortal, pageTitle, block, busyButton, publishStatusBadge, dateTime } from './shell.js';

const KIND_ROUTE = { destination: 'admin/destinations/', offer: 'admin/offers/' };
const KIND_PREVIEW = { destination: 'admin/destinations/preview/', offer: 'admin/offers/preview/' };
const label = (item) => item.nameEn || item.nameAr || item.titleEn || item.titleAr || item.id;

function itemRow(item, refresh, can) {
  const editRoute = route(`${KIND_ROUTE[item.kind]}?id=${encodeURIComponent(item.id)}`);
  const previewRoute = route(`${KIND_PREVIEW[item.kind]}?id=${encodeURIComponent(item.id)}`);
  const transition = async (publishStatus, toastKey) => {
    const updater = item.kind === 'destination' ? opsData.updateDestinationAdmin : opsData.updateOfferAdmin;
    await updater(item.id, { publishStatus });
    toast({ title: t(toastKey), variant: 'success', duration: 3000 });
    await refresh();
  };
  const actions = [];
  if (can('content.manage') && item.publishStatus !== 'published') actions.push(busyButton(t('ops.content.publish'), 'primary', () => transition('published', 'ops.content.published.action')));
  if (can('content.manage') && item.publishStatus === 'published') actions.push(busyButton(t('ops.content.unpublish'), 'tertiary', () => transition('draft', 'ops.content.unpublished.action')));
  return el('li', { class: 'c-svp-lead' }, [
    el('div', { class: 'l-stack l-stack--4' }, [
      el('a', { class: 'c-svp-link', href: editRoute }, label(item)),
      el('p', { class: 't-body-sm t-muted' }, [t(`ops.publishing.kind.${item.kind}`), ' · ', item.publishedAt ? `${t('ops.content.publishedAt')} ${dateTime(item.publishedAt)}` : t('ops.content.publishStatus.draft')]),
    ]),
    el('div', { class: 'l-cluster l-cluster--8' }, [
      ...actions,
      el('a', { class: 'c-btn c-btn--tertiary c-btn--sm', href: previewRoute, target: '_blank', rel: 'noopener' }, t('ops.content.preview')),
    ]),
  ]);
}

function section(titleKey, items, refresh, emptyKey, can) {
  return block(t(titleKey), items.length
    ? el('ul', { class: 'l-stack l-stack--8', role: 'list' }, items.map((item) => itemRow(item, refresh, can)))
    : el('p', { class: 't-body-sm t-muted' }, t(emptyKey)), { id: `ops-pub-${titleKey.split('.').pop()}` });
}

export function mountOpsPublishing({ root = document } = {}) {
  return mountOpsPortal({ root, id: 'publishing', head: 'page.ops.publishing', paint: async ({ main, can }) => {
    const refresh = async () => render(main, await view());

    async function view() {
      const [destinations, offers] = await Promise.all([
        opsData.destinationsAdmin({ pageSize: 100 }).catch(() => ({ items: [] })),
        opsData.offersAdmin({ pageSize: 100 }).catch(() => ({ items: [] })),
      ]);
      const all = [
        ...destinations.items.map((d) => ({ ...d, kind: 'destination' })),
        ...offers.items.map((o) => ({ ...o, kind: 'offer' })),
      ];
      const drafts = all.filter((x) => x.publishStatus === 'draft');
      const pendingChanges = all.filter((x) => x.publishStatus === 'published' && x.hasUnpublishedChanges);
      const published = all.filter((x) => x.publishStatus === 'published').sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
      const archived = all.filter((x) => x.publishStatus === 'archived');
      if (!all.length) return [pageTitle('ops.publishing.title', 'ops.publishing.text'), stateBlock({ variant: 'empty', headingLevel: 2, title: t('ops.publishing.empty.title'), text: t('ops.publishing.empty.text') })];
      return [
        pageTitle('ops.publishing.title', 'ops.publishing.text'),
        section('ops.publishing.pendingChanges', pendingChanges, refresh, 'ops.publishing.pendingChanges.empty', can),
        section('ops.publishing.drafts', drafts, refresh, 'ops.publishing.drafts.empty', can),
        section('ops.publishing.published', published, refresh, 'ops.publishing.published.empty', can),
        section('ops.publishing.archived', archived, refresh, 'ops.publishing.archived.empty', can),
      ];
    }

    render(main, await view());
    return { refresh };
  } });
}
