/* OPS / UI / PREVIEW — Command Center CMS. Phase 2B-i's answer to "what does this draft look like?" without
   making the public site backend-driven (Phase 2 scope decision, restated in destinations.js/offers.js): a
   staff-only route that renders the SAME public detail components (destination-detail.js, offers.js) the live
   pages use, fed by a custom `load` that reads the draft straight from the admin API instead of the static
   registry those components default to. No public-facing file changes — the `load` override both components
   already accept is the whole seam. */
import { route } from '../../data/config.js';
import { t } from '../../core/i18n.js';
import { el } from '../../core/dom.js';
import { restoreOpsSession } from '../auth.js';
import { opsData } from '../data.js';

const here = () => location.pathname + location.search;

async function requireStaff() {
  const { status } = await restoreOpsSession();
  if (status === 'staff') return true;
  location.replace(route('admin/sign-in/') + `?next=${encodeURIComponent(here())}`);
  return false;
}

function showPreviewBanner() {
  document.body.prepend(el('div', { class: 'c-preview-banner', role: 'note', dataset: { preview: 'true' } }, t('ops.content.previewBanner')));
}

/** Admin records that don't exist read as `null` (unknownState), matching how the public components already
    treat an unknown slug — every other failure (network, 5xx) still reaches the component's own error state. */
async function loadOrNull(fetcher, id) {
  try { return await fetcher(id); }
  catch (error) { if (error?.code === 'notFound') return null; throw error; }
}

/** destination-detail.js's registry shape is close to nDestination()'s own — the one gap is `status`
    ('available' | 'soon'), a booking-readiness flag the CMS doesn't model yet; a draft previews as bookable. */
function mapDestination(record) {
  return { ...record, status: 'available' };
}

/** offers.js's registry shape flattens `detail` (inclusions/exclusions/itinerary/important/terms/faq/
    travelPeriod) onto the record and calls the destination reference `destination` (a slug), not
    `destinationId` — the two entities live in different id spaces post-Phase-2A (the offer's destinationId is a
    backend id; the public destination pages still key off the static registry's own short ids), so a
    destinationId with no matching registry slug just previews without a resolvable destination link, same as
    any offer record whose destination reference the registry doesn't recognise today. */
async function mapOffer(record) {
  const dest = record.destinationId ? await loadOrNull(opsData.destinationAdmin, record.destinationId).catch(() => null) : null;
  const { detail, destinationId, ...rest } = record;
  return { ...rest, ...detail, destination: dest?.slug ?? null };
}

export async function mountOpsDestinationPreview({ id, root = document } = {}) {
  if (!(await requireStaff())) return null;
  showPreviewBanner();
  const { mountDestinationDetail } = await import('../../components/destination-detail.js');
  return mountDestinationDetail({ slug: id, root, load: async () => {
    const record = await loadOrNull(opsData.destinationAdmin, id);
    return record ? mapDestination(record) : null;
  } });
}

export async function mountOpsOfferPreview({ id, root = document } = {}) {
  if (!(await requireStaff())) return null;
  showPreviewBanner();
  const { mountOfferDetail } = await import('../../components/offers.js');
  return mountOfferDetail({ slug: id, root, load: async () => {
    const record = await loadOrNull(opsData.offerAdmin, id);
    return record ? mapOffer(record) : null;
  } });
}
