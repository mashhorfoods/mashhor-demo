/* ============================================================================
   DATA / OFFERS — the one registry of offers and packages. Stage 10.8

   Every surface that shows an offer reads THIS file: the offers page, the
   offer detail pages, the homepage offers strip, the header offers menu,
   and later the booking engine and the admin system.

   Shape of a record — the contract an admin surface will edit:

     id / slug     stable key; route is offers/<slug>/
     category      the primary OFFER_CATEGORIES id; `categories` lists every
                   category the offer belongs to (a family package is also a
                   travel package)
     destination   a DESTINATION_REGISTRY id
     title / short / desc   Ar + En — card title, one-liner, overview
     duration      { nights: number | null }   null = not fixed yet
     price         null | { amount, currency, type: 'from' | 'fixed', basisAr/En }
                   null renders "request price" everywhere — no number is
                   ever invented
     status        'available' (bookable online) | 'request' (arranged on
                   request) | 'soon' | 'ended'
     bookingMode   'online' | 'request' — which door the CTA opens today
     featured      the editorial pick on the listing and the homepage
     placeholder   true while the record's programme, price and dates are
                   not yet approved: the pages say so in the customer's
                   language and hide the sections that would need them
     services      SERVICE_REGISTRY ids the package is built from — shown as
                   "what this package is built around" until real
                   inclusions are approved
     inclusions / exclusions   [{ ar, en }]   approved lists only
     itinerary     [{ dayAr/En, titleAr/En, textAr/En }]
     important     [{ ar, en }]   important information
     terms         [{ ar, en }]   terms and conditions
     faq           [{ qAr/En, aAr/En }]
     travelPeriod  null | { from: ISO, to: ISO }
     publishedAt   null | ISO   (drives "latest" sorting)
     image         { src, altAr, altEn } — src: null renders the neutral slot

   Nothing invented: the three launch records are placeholders and say so.
   Give a record a price, dates, inclusions and set placeholder: false, and
   every surface shows them.
   ========================================================================= */

import { bookingEntry } from './config.js';
import { imageSrc } from './images.js';

export const OFFER_CATEGORIES = [
  { id: 'packages', icon: 'no-tourism',   labelAr: 'باقات السفر',   labelEn: 'Travel packages' },
  { id: 'tourism',  icon: 'no-location',  labelAr: 'سياحة',         labelEn: 'Tourism' },
  { id: 'umrah',    icon: 'no-umrah',     labelAr: 'عمرة',          labelEn: 'Umrah' },
  { id: 'family',   icon: 'no-users',     labelAr: 'عروض العائلة',  labelEn: 'Family offers' },
  { id: 'seasonal', icon: 'no-calendar',  labelAr: 'عروض موسمية',   labelEn: 'Seasonal offers' },
  { id: 'deals',    icon: 'no-price-tag', labelAr: 'عروض خاصة',     labelEn: 'Special deals' },
];

/* Availability, as icon + word — never colour alone. */
export const OFFER_STATUSES = {
  available: { id: 'available', icon: 'no-check-circle', badge: 'c-badge--success', labelAr: 'متاح للحجز',  labelEn: 'Bookable' },
  request:   { id: 'request',   icon: 'no-documents',    badge: 'c-badge--info',    labelAr: 'بطلب',        labelEn: 'On request' },
  soon:      { id: 'soon',      icon: 'no-pending',      badge: 'c-badge--warning', labelAr: 'قريباً',      labelEn: 'Coming soon' },
  ended:     { id: 'ended',     icon: 'no-expired',      badge: 'c-badge--outline', labelAr: 'انتهى',       labelEn: 'Ended' },
};

/* Duration buckets for the filter. `nights: null` matches nothing. */
export const DURATION_BUCKETS = [
  { id: 'short',  labelAr: 'حتى 4 ليالٍ',    labelEn: 'Up to 4 nights',  test: (n) => n != null && n <= 4 },
  { id: 'medium', labelAr: '5 إلى 9 ليالٍ',  labelEn: '5 to 9 nights',   test: (n) => n != null && n >= 5 && n <= 9 },
  { id: 'long',   labelAr: '10 ليالٍ فأكثر', labelEn: '10 nights or more', test: (n) => n != null && n >= 10 },
];

export const OFFER_SORTS = [
  { id: 'recommended', labelAr: 'اختيارنا أولاً', labelEn: 'Our picks first' },
  { id: 'price',       labelAr: 'السعر',           labelEn: 'Price' },
  { id: 'duration',    labelAr: 'المدة',           labelEn: 'Duration' },
  { id: 'latest',      labelAr: 'الأحدث',          labelEn: 'Latest' },
];

/* Help-me-choose chips: each applies a filter or a sort. Labels describe the
   filter, not a judgement — "short trip", never "best". §6 */
export const OFFER_GUIDES = [
  { id: 'family',   icon: 'no-users',     apply: { category: 'family' },  labelAr: 'للعائلة',          labelEn: 'For families' },
  { id: 'budget',   icon: 'no-price-tag', apply: { sort: 'price' },       labelAr: 'حسب السعر',        labelEn: 'By price' },
  { id: 'short',    icon: 'no-pending',   apply: { duration: 'short' },   labelAr: 'رحلة قصيرة',       labelEn: 'A short trip' },
  { id: 'long',     icon: 'no-calendar',  apply: { duration: 'long' },    labelAr: 'رحلة طويلة',       labelEn: 'A long trip' },
  { id: 'umrah',    icon: 'no-umrah',     apply: { category: 'umrah' },   labelAr: 'عمرة',             labelEn: 'Umrah' },
  { id: 'tourism',  icon: 'no-tourism',   apply: { category: 'tourism' }, labelAr: 'سياحة',            labelEn: 'Tourism' },
  { id: 'deals',    icon: 'no-sparkle',   apply: { category: 'deals' },   labelAr: 'عرض خاص',          labelEn: 'A special deal' },
];

export const OFFER_REGISTRY = [
  { id: 'istanbul-family', slug: 'istanbul-family', category: 'family', categories: ['family', 'packages', 'tourism'],
    destination: 'ist', featured: true, placeholder: true, status: 'request', bookingMode: 'request',
    titleAr: 'باقة إسطنبول العائلية',      titleEn: 'Istanbul family package',
    shortAr: 'برنامج عائلي يُصمَّم حسب عدد الأيام والميزانية.',
    shortEn: 'A family programme shaped around your days and your budget.',
    descAr: 'باقة تُبنى حول عائلتك: عدد الأيام والميزانية ومن يسافر. نرتّب الطيران والإقامة والتنقّل في طلب واحد، ونرسل لك البرنامج والسعر قبل أي التزام.',
    descEn: 'A package built around your family: the number of days, the budget and who is travelling. We arrange flights, stay and transfers in one request, and send you the programme and the price before any commitment.',
    duration: { nights: null }, price: null, travelPeriod: null, publishedAt: null,
    services: ['flights', 'hotels', 'transport', 'packages'],
    inclusions: [], exclusions: [], itinerary: [], important: [], terms: [], faq: [],
    image: { src: imageSrc('offers/istanbul-family'), altAr: 'إسطنبول', altEn: 'Istanbul' } },

  { id: 'umrah', slug: 'umrah', category: 'umrah', categories: ['umrah', 'packages'],
    destination: 'mkk', featured: true, placeholder: true, status: 'request', bookingMode: 'request',
    titleAr: 'باقة العمرة',                titleEn: 'Umrah package',
    shortAr: 'برامج عمرة بحسب الموسم والمدة التي تناسبك.',
    shortEn: 'Umrah programmes by season and by the length of stay that suits you.',
    descAr: 'برنامج عمرة بإقامة قريبة من الحرم، يُرتّب حسب الموسم والمدة وعدد المعتمرين. التنقّلات بين المطار ومكة والمدينة ضمن الطلب، والبرنامج والسعر يُرسلان لك قبل التأكيد.',
    descEn: 'An Umrah programme with a stay near the Haram, arranged around the season, the length of stay and the number of pilgrims. Transfers between the airport, Makkah and Madinah are part of the request; the programme and the price are sent to you before you confirm.',
    duration: { nights: null }, price: null, travelPeriod: null, publishedAt: null,
    services: ['umrah', 'hotels', 'transport', 'flights'],
    inclusions: [], exclusions: [], itinerary: [], important: [], terms: [], faq: [],
    image: { src: imageSrc('offers/umrah'), altAr: 'مكة المكرمة', altEn: 'Makkah' } },

  { id: 'dubai-break', slug: 'dubai-break', category: 'tourism', categories: ['tourism', 'packages'],
    destination: 'dxb', featured: false, placeholder: true, status: 'request', bookingMode: 'request',
    titleAr: 'عطلة قصيرة في دبي',           titleEn: 'Dubai short break',
    shortAr: 'لأيام قليلة أو لعطلة نهاية أسبوع طويلة.',
    shortEn: 'For a few days or a long weekend.',
    descAr: 'أيام قليلة في دبي بطيران وإقامة قريبة مما تريد فعله. أخبرنا بتواريخك وعدد المسافرين، ونرسل لك الخيارات والسعر.',
    descEn: 'A few days in Dubai with flights and a stay close to what you want to do. Tell us your dates and who is travelling, and we send you the options and the price.',
    duration: { nights: null }, price: null, travelPeriod: null, publishedAt: null,
    services: ['flights', 'hotels', 'transport'],
    inclusions: [], exclusions: [], itinerary: [], important: [], terms: [], faq: [],
    image: { src: imageSrc('offers/dubai-break'), altAr: 'دبي', altEn: 'Dubai' } },
];

/* ---- Selectors every surface shares ------------------------------------ */
export const offerById = (id) => OFFER_REGISTRY.find((o) => o.id === id || o.slug === id) ?? null;
export const homeOffers = () => OFFER_REGISTRY.slice(0, 3);

/** True when at least one offer carries the field — a filter shows only then. */
export const offersHave = (field, list = OFFER_REGISTRY) => list.some((o) => {
  if (field === 'price') return o.price?.amount != null;
  if (field === 'duration') return o.duration?.nights != null;
  if (field === 'period') return !!o.travelPeriod;
  return false;
});

/**
 * The route that starts this offer's journey TODAY: the homepage booking
 * entry on the packages vertical, carrying the offer and its destination
 * (index.html prefills them). Online booking later swaps this for the
 * booking engine's own route without touching the pages. Pass through route().
 */
export const offerEntry = (offer) =>
  bookingEntry({ vertical: offer.categories.includes('umrah') ? 'umrah' : 'packages', offer: offer.slug, to: offer.destination });

/**
 * Filter + sort the registry. Pure and synchronous today; the same signature
 * fits an API later. Unknown values (no price, no nights) sort last.
 * @param {{ category?, destination?, service?, duration?, price?, period?, sort? }} query
 */
export function queryOffers(query = {}, list = OFFER_REGISTRY) {
  const { category = '', destination = '', service = '', duration = '', price = '', period = '', sort = 'recommended' } = query;
  const bucket = DURATION_BUCKETS.find((b) => b.id === duration);
  let out = list.filter((o) =>
    (!category || o.categories.includes(category)) &&
    (!destination || o.destination === destination) &&
    (!service || o.services.includes(service)) &&
    (!bucket || bucket.test(o.duration?.nights)) &&
    (!price || (o.price?.amount != null && priceMatches(o.price, price))) &&
    (!period || (o.travelPeriod && periodMatches(o.travelPeriod, period))));
  const last = (v) => (v == null ? Number.POSITIVE_INFINITY : v);
  const sorters = {
    recommended: (a, b) => Number(b.featured) - Number(a.featured),
    price:       (a, b) => last(a.price?.amount) - last(b.price?.amount),
    duration:    (a, b) => last(a.duration?.nights) - last(b.duration?.nights),
    latest:      (a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  };
  return out.slice().sort(sorters[sort] ?? sorters.recommended);
}
/* Price filter buckets, in PRICE_FILTER_CURRENCY. An offer priced in another currency never falls in a bucket:
   comparing raw amounts across currencies (SDG 500,000 vs USD 500) is exactly the bug this replaced. */
export const PRICE_FILTER_CURRENCY = 'USD';
export const PRICE_BUCKETS = [{ id: '0-500', lo: 0, hi: 500 }, { id: '500-1500', lo: 500, hi: 1500 }, { id: '1500-', lo: 1500, hi: null }];
const priceMatches = (price, range) => { const b = PRICE_BUCKETS.find((x) => x.id === range); return !!b && price.currency === PRICE_FILTER_CURRENCY && price.amount >= b.lo && (b.hi == null || price.amount <= b.hi); };
const periodMatches = (p, month) => { const m = String(month); return p.from.slice(0, 7) <= m && m <= p.to.slice(0, 7); };
