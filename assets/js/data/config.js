/* ============================================================================
   DATA / CONFIG — §27 data-driven UI

   Navigation, services, statuses and search verticals are DATA. No component
   hard-codes a list. Adding a service is an entry here, not a new template;
   the Stage 14 admin system will eventually write these same shapes.

   Labels are i18n keys, never literal strings, so nothing here needs to be
   translated twice.
   ========================================================================= */

/* ---------------------------------------------------------------------------
   SITE ROOT — where this build is served from.

   GitHub Pages serves a project repo from a subpath (/mashhor-demo/), while a
   custom domain serves from '/'. Routes below are therefore stored WITHOUT a
   leading slash and joined to BASE by route(), so neither shape needs the data
   to change: point BASE at the new root and every link in the system follows.

   BASE is derived from the document rather than hard-coded, so the same files
   work on Pages, on a custom domain and on a local server with no build step.
   ------------------------------------------------------------------------ */
export const BASE = (() => {
  // document.baseURI, not location.pathname, because it honours an explicit
  // <base> tag. 404.html needs that: GitHub Pages serves it for a missing path
  // but leaves the deep URL in the address bar, so location would report
  // '/mashhor-demo/services/flights/' as the site root and every link and asset
  // would resolve one or more levels too deep. 404.html declares the real root
  // with <base>, and this reads it.
  const path = new URL(document.baseURI).pathname;
  return path.endsWith('/') ? path : path.replace(/[^/]*$/, '');
})();

/** Join a stored route to the site root. route('services/') -> '/mashhor-demo/services/' */
export const route = (path = '') => BASE + String(path).replace(/^\//, '');

/* ---------------------------------------------------------------------------
   SERVICES — the featured six, read from the one registry (data/services.js,
   Stage 10.5). Kept under this name because the style guide, the 404 and
   the supervisor card consume it; the registry is the source.
   ------------------------------------------------------------------------ */
import { featuredServices } from './services.js';
import { DESTINATION_REGIONS, TRAVEL_PURPOSES } from './destinations.js';
export const SERVICES = featuredServices();

/* Navigation moved to data/navigation.js in Stage 10.2 — the full IA, the mega
   menus and the account menus now live together in one module. */

/* ---------------------------------------------------------------------------
   STATUS — §20. One central registry. Every surface (website, account,
   supervisor, admin) reads the same seven states with the same icon and the
   same word, so a "Confirmed" booking never looks like two different things.
   ------------------------------------------------------------------------ */
export const STATUSES = {
  pending:    { id: 'pending',    icon: 'no-pending',      label: 'status.pending' },
  processing: { id: 'processing', icon: 'no-processing',   label: 'status.processing' },
  confirmed:  { id: 'confirmed',  icon: 'no-check-circle', label: 'status.confirmed' },
  completed:  { id: 'completed',  icon: 'no-check',        label: 'status.completed' },
  cancelled:  { id: 'cancelled',  icon: 'no-cancelled',    label: 'status.cancelled' },
  failed:     { id: 'failed',     icon: 'no-error',        label: 'status.failed' },
  expired:    { id: 'expired',    icon: 'no-expired',      label: 'status.expired' },
};

/* ---------------------------------------------------------------------------
   SEARCH VERTICALS — §13
   The search component renders whatever a vertical declares. Adding "cruise"
   later is one object; no new component, no new layout.

   `advanced: true` moves a field behind "more options" — progressive
   disclosure is data, not a special case in the template.
   ------------------------------------------------------------------------ */
export const SEARCH_VERTICALS = [
  {
    /* Flights carry the strongest priority on the homepage (10.4 §04): the
       trip type is a segmented control above the fields, and cabin sits in
       the main row rather than behind "more options". */
    id: 'flights', label: 'search.flights', icon: 'no-flight', columns: 4,
    submit: 'search.submitFlights', submitIcon: 'no-search',
    fields: [
      { id: 'tripType',  type: 'segmented', label: 'search.tripType', full: true, value: 'return',
        options: [
          { value: 'return',  labelAr: 'ذهاب وعودة',  labelEn: 'Round trip' },
          { value: 'oneway',  labelAr: 'ذهاب فقط',    labelEn: 'One way' },
          { value: 'multi',   labelAr: 'وجهات متعددة', labelEn: 'Multi-city' },
        ] },
      // Round trip and one way share one from/to/depart row; the return date
      // exists only for a round trip; multi-city swaps the row for legs.
      { id: 'from',      type: 'place',   label: 'search.from',   icon: 'no-flight',   required: true, when: { field: 'tripType', values: ['return', 'oneway'] } },
      { id: 'to',        type: 'place',   label: 'search.to',     icon: 'no-location', required: true, when: { field: 'tripType', values: ['return', 'oneway'] } },
      { id: 'depart',    type: 'date',    label: 'search.depart', required: true, when: { field: 'tripType', values: ['return', 'oneway'] } },
      { id: 'return',    type: 'date',    label: 'search.return', required: true, when: { field: 'tripType', value: 'return' } },
      { id: 'legs',      type: 'legs',    label: 'search.legs', min: 2, max: 4, full: true, when: { field: 'tripType', value: 'multi' } },
      { id: 'pax',       type: 'pax',     label: 'search.travellers' },
      { id: 'cabin',     type: 'select',  label: 'search.cabin',
        options: [
          { value: 'economy',  labelAr: 'الاقتصادية',        labelEn: 'Economy' },
          { value: 'premium',  labelAr: 'الاقتصادية المميزة', labelEn: 'Premium economy' },
          { value: 'business', labelAr: 'رجال الأعمال',      labelEn: 'Business' },
          { value: 'first',    labelAr: 'الأولى',            labelEn: 'First' },
        ] },
      { id: 'direct',    type: 'checkbox', label: 'search.direct', advanced: true },
    ],
  },
  {
    id: 'hotels', label: 'search.hotels', icon: 'no-hotel', columns: 4,
    fields: [
      { id: 'destination', type: 'place', label: 'search.destination', icon: 'no-location', required: true, full: true },
      { id: 'checkin',     type: 'date',  label: 'search.checkin',  required: true },
      { id: 'checkout',    type: 'date',  label: 'search.checkout', required: true },
      { id: 'guests',      type: 'pax',   label: 'search.guests' },
      { id: 'rooms',       type: 'select', label: 'search.rooms', value: '1', options: [
          { value: '1', labelAr: 'غرفة واحدة', labelEn: '1 room' },
          { value: '2', labelAr: 'غرفتان',     labelEn: '2 rooms' },
          { value: '3', labelAr: '3 غرف',      labelEn: '3 rooms' },
          { value: '4', labelAr: '4 غرف',      labelEn: '4 rooms' },
        ] },
    ],
  },
  {
    id: 'packages', label: 'search.packages', icon: 'no-tourism', columns: 3,
    fields: [
      { id: 'destination', type: 'place', label: 'search.destination', icon: 'no-location' },
      { id: 'depart',      type: 'date',  label: 'search.depart' },
      { id: 'pax',         type: 'pax',   label: 'search.travellers' },
    ],
  },
  {
    id: 'visa', label: 'search.visa', icon: 'no-visa', columns: 3, submit: 'search.request',
    fields: [
      { id: 'nationality', type: 'select', label: 'search.nationality', options: [
          { value: 'sd', labelAr: 'السودان', labelEn: 'Sudan' },
          { value: 'eg', labelAr: 'مصر',     labelEn: 'Egypt' },
          { value: 'sa', labelAr: 'السعودية', labelEn: 'Saudi Arabia' },
        ] },
      { id: 'country',     type: 'select', label: 'search.country', options: [
          { value: 'ae', labelAr: 'الإمارات', labelEn: 'United Arab Emirates' },
          { value: 'tr', labelAr: 'تركيا',    labelEn: 'Türkiye' },
          { value: 'sa', labelAr: 'السعودية', labelEn: 'Saudi Arabia' },
        ] },
      { id: 'depart',      type: 'date',   label: 'search.depart' },
    ],
  },
  /* The four verticals below were added for the homepage (10.4 §04). They
     are requests rather than searches — the CTA says so — and land on the
     same Stage 11 entry as the rest. */
  {
    id: 'umrah', label: 'search.umrah', icon: 'no-umrah', columns: 3, submit: 'search.request',
    fields: [
      { id: 'depart', type: 'date', label: 'search.depart' },
      { id: 'nights', type: 'select', label: 'search.nights', options: [
          { value: '7',  labelAr: '7 ليالٍ',  labelEn: '7 nights' },
          { value: '10', labelAr: '10 ليالٍ', labelEn: '10 nights' },
          { value: '14', labelAr: '14 ليلة',  labelEn: '14 nights' },
        ] },
      { id: 'pax',    type: 'pax',  label: 'search.travellers' },
    ],
  },
  {
    id: 'medical', label: 'search.medical', icon: 'no-medical', columns: 3, submit: 'search.request',
    fields: [
      { id: 'country', type: 'select', label: 'search.country', options: [
          { value: 'eg', labelAr: 'مصر',   labelEn: 'Egypt' },
          { value: 'in', labelAr: 'الهند', labelEn: 'India' },
          { value: 'tr', labelAr: 'تركيا', labelEn: 'Türkiye' },
          { value: 'jo', labelAr: 'الأردن', labelEn: 'Jordan' },
        ] },
      { id: 'depart',  type: 'date', label: 'search.depart' },
      { id: 'pax',     type: 'pax',  label: 'search.travellers' },
    ],
  },
  {
    id: 'transport', label: 'search.transport', icon: 'no-transport', columns: 4,
    fields: [
      { id: 'from',   type: 'place', label: 'search.from', icon: 'no-location', required: true },
      { id: 'to',     type: 'place', label: 'search.to',   icon: 'no-location', required: true },
      { id: 'depart', type: 'date',  label: 'search.depart', required: true },
      { id: 'pax',    type: 'pax',   label: 'search.travellers' },
    ],
  },
  {
    id: 'other', label: 'search.other', icon: 'no-documents', columns: 2, submit: 'search.request',
    fields: [
      /* The options are the registry services that have no vertical of their
         own (data/services.js `option`), so the two can never disagree. */
      { id: 'service', type: 'select', label: 'search.service', options: [
          { value: 'study',  labelAr: 'السفر للدراسة', labelEn: 'Study travel' },
          { value: 'work',   labelAr: 'السفر للعمل',   labelEn: 'Work travel' },
          { value: 'groups', labelAr: 'الرحلات الجماعية', labelEn: 'Group trips' },
          { value: 'issue',  labelAr: 'إصدار تذكرة',   labelEn: 'Ticket issuing' },
          { value: 'change', labelAr: 'تعديل تذكرة',   labelEn: 'Change a ticket' },
          { value: 'cancel', labelAr: 'إلغاء تذكرة',   labelEn: 'Cancel a ticket' },
        ] },
      { id: 'depart',  type: 'date',     label: 'search.depart' },
      { id: 'notes',   type: 'textarea', label: 'search.notes', full: true },
    ],
  },
  /* Destination discovery (10.7). `standalone: true` keeps it out of the
     booking entry's tab strip; the destinations page asks for it by id. Its
     select options come from the destinations registry, so a new region or
     purpose appears here without touching this file. */
  {
    id: 'destinations', label: 'search.destinations', icon: 'no-location', columns: 4, standalone: true,
    filters: true, submitVariant: 'secondary-brand',
    fields: [
      { id: 'destination', type: 'place',  label: 'search.destination', icon: 'no-location', placeholder: 'search.destinationPlaceholder' },
      { id: 'region',      type: 'select', label: 'search.region', blank: 'search.anyRegion',
        options: DESTINATION_REGIONS.map((r) => ({ value: r.id, labelAr: r.labelAr, labelEn: r.labelEn })) },
      { id: 'purpose',     type: 'select', label: 'search.purpose', blank: 'search.anyPurpose',
        options: TRAVEL_PURPOSES.map((p) => ({ value: p.id, labelAr: p.labelAr, labelEn: p.labelEn })) },
      { id: 'depart',      type: 'date',   label: 'search.depart' },
    ],
  },
];

/* ---------------------------------------------------------------------------
   ROLES — §32. The UI reads permissions from here; it never decides on its
   own what a role may see. Stage 13/14 will extend this, not replace it.
   ------------------------------------------------------------------------ */
export const ROLES = {
  superAdmin:  { id: 'superAdmin',  rank: 50 },
  admin:       { id: 'admin',       rank: 40 },
  operations:  { id: 'operations',  rank: 30 },
  supervisor:  { id: 'supervisor',  rank: 20 },
  customer:    { id: 'customer',    rank: 10 },
  guest:       { id: 'guest',       rank: 0  },
};

/** Never render sensitive data on a hunch — ask this. §32 */
export function can(role, minimum) {
  return (ROLES[role]?.rank ?? 0) >= (ROLES[minimum]?.rank ?? Infinity);
}
