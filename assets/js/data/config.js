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
   SERVICES — the six travel lines the brief names in §15.
   `id` is the stable key the booking engine will use. Do not renumber it.
   ------------------------------------------------------------------------ */
export const SERVICES = [
  { id: 'flights',   icon: 'no-flight',    href: 'services/flights/',   titleAr: 'حجز الطيران',        titleEn: 'Flights',
    descAr: 'نقارن لك بين شركات الطيران ونساعدك تختار التذكرة الأنسب لميزانيتك ووقتك.',
    descEn: 'We compare the airlines and help you pick the ticket that fits your budget and your time.' },
  { id: 'hotels',    icon: 'no-hotel',     href: 'services/hotels/',    titleAr: 'حجز الفنادق',        titleEn: 'Hotels',
    descAr: 'فنادق مختارة قريبة من وجهتك، بأسعار واضحة وشروط إلغاء مفهومة.',
    descEn: 'Selected hotels close to where you are going, with clear prices and cancellation terms.' },
  { id: 'packages',  icon: 'no-tourism',   href: 'services/packages/',  titleAr: 'الباقات السياحية',   titleEn: 'Tour packages',
    descAr: 'برامج عائلية جاهزة تشمل الطيران والإقامة والتنقل، ويمكن تعديلها حسب طلبك.',
    descEn: 'Ready family programmes covering flights, stay and transfers — adjustable on request.' },
  { id: 'visa',      icon: 'no-visa',      href: 'services/visa/',      titleAr: 'خدمات التأشيرات',    titleEn: 'Visa services',
    descAr: 'نراجع أوراقك قبل التقديم ونخبرك بما ينقصك، حتى لا يتأخر سفرك.',
    descEn: 'We check your documents before you apply and tell you what is missing, so your travel is not delayed.' },
  { id: 'umrah',     icon: 'no-umrah',     href: 'services/umrah/',     titleAr: 'العمرة والحج',       titleEn: 'Umrah & Hajj',
    descAr: 'برامج عمرة بإقامة قريبة من الحرم، ومرافقة ميدانية طوال الرحلة.',
    descEn: 'Umrah programmes with accommodation near the Haram and on-the-ground support throughout.' },
  { id: 'medical',   icon: 'no-medical',   href: 'services/medical/',   titleAr: 'السفر العلاجي',      titleEn: 'Medical travel',
    descAr: 'ننسّق الموعد الطبي والتأشيرة والإقامة معاً، ونتابع معك حتى العودة.',
    descEn: 'We arrange the medical appointment, the visa and the stay together, and follow up until you return.' },
];

/* Secondary lines the brief lists under §15 but that are not primary cards. */
export const SERVICES_SECONDARY = [
  { id: 'transport', icon: 'no-transport', href: 'services/transport/', titleAr: 'النقل والمواصلات', titleEn: 'Transport',
    descAr: 'استقبال في المطار وتنقلات داخلية بسائق.', descEn: 'Airport pickup and chauffeured transfers.' },
  { id: 'study',     icon: 'no-study',     href: 'services/study/',     titleAr: 'السفر للدراسة',    titleEn: 'Study travel',
    descAr: 'تأشيرة الدراسة وترتيب السكن والوصول.',   descEn: 'Study visas, accommodation and arrival.' },
  { id: 'work',      icon: 'no-work',      href: 'services/work/',      titleAr: 'السفر للعمل',      titleEn: 'Work travel',
    descAr: 'إجراءات سفر العمل وتذاكر الشركات.',       descEn: 'Work travel paperwork and corporate tickets.' },
];

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
    id: 'flights', label: 'search.flights', icon: 'no-flight', columns: 4,
    fields: [
      { id: 'from',      type: 'place',   label: 'search.from',   icon: 'no-flight',   required: true },
      { id: 'to',        type: 'place',   label: 'search.to',     icon: 'no-location', required: true },
      { id: 'depart',    type: 'date',    label: 'search.depart', required: true },
      { id: 'return',    type: 'date',    label: 'search.return' },
      { id: 'pax',       type: 'pax',     label: 'search.travellers', full: true },
      { id: 'cabin',     type: 'select',  label: 'search.cabin', advanced: true,
        options: [
          { value: 'economy',  labelAr: 'الاقتصادية',        labelEn: 'Economy' },
          { value: 'premium',  labelAr: 'الاقتصادية المميزة', labelEn: 'Premium economy' },
          { value: 'business', labelAr: 'رجال الأعمال',      labelEn: 'Business' },
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
    id: 'visa', label: 'search.visa', icon: 'no-visa', columns: 3,
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
