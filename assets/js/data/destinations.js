/* ============================================================================
   DATA / DESTINATIONS — the one registry of where Number One takes people.
   Stage 10.7

   Every surface that lists a destination reads THIS file: the destinations
   page, the homepage grid, the header destinations menu, the booking entry's
   "to" prefill, and later the destination-detail pages and the admin system.

   Shape of a record — the contract an admin surface will edit:

     id         stable key
     slug       route segment: destinations/<slug>/ (the detail page, later)
     region     one of DESTINATION_REGIONS[].id — structural, never a claim
     name / country / desc   Ar + En. `desc` says what people go there FOR —
                the services we sell — never a ranking, a count or a price
     purposes   TRAVEL_PURPOSES ids this destination serves
     services   SERVICE_REGISTRY ids relevant there (shown as chips)
     image      { src, altAr, altEn } — src: null renders the neutral slot
     featured   the editorial pick for the featured block (first = large)
     home       shown on the homepage grid
     status     'available' | 'soon'

   Nothing here says "best", "cheapest" or "most popular": the registry has
   no field for it, so no surface can show it.
   ========================================================================= */

/* Structural regions. All six exist so an admin can file a destination
   anywhere; a surface shows a region only for what it contains. §7 */
export const DESTINATION_REGIONS = [
  { id: 'middleEast', labelAr: 'الشرق الأوسط',   labelEn: 'Middle East' },
  { id: 'africa',     labelAr: 'أفريقيا',        labelEn: 'Africa' },
  { id: 'asia',       labelAr: 'آسيا',           labelEn: 'Asia' },
  { id: 'europe',     labelAr: 'أوروبا',         labelEn: 'Europe' },
  { id: 'americas',   labelAr: 'الأمريكتان',     labelEn: 'Americas' },
  { id: 'other',      labelAr: 'مناطق أخرى',     labelEn: 'Other regions' },
];

/* Why people travel, and which service starts that journey. §9 */
export const TRAVEL_PURPOSES = [
  { id: 'tourism', icon: 'no-tourism',    service: 'packages',
    labelAr: 'سياحة',  labelEn: 'Tourism',  hintAr: 'عطلة للعائلة أو للأصدقاء',      hintEn: 'A holiday for the family or with friends' },
  { id: 'work',    icon: 'no-work',       service: 'work',
    labelAr: 'عمل',    labelEn: 'Work',     hintAr: 'اجتماع أو مهمة أو مؤتمر',        hintEn: 'A meeting, an assignment or a conference' },
  { id: 'study',   icon: 'no-study',      service: 'study',
    labelAr: 'دراسة',  labelEn: 'Study',    hintAr: 'جامعة أو معهد أو دورة',           hintEn: 'A university, an institute or a course' },
  { id: 'medical', icon: 'no-medical',    service: 'medical',
    labelAr: 'علاج',   labelEn: 'Treatment', hintAr: 'موعد طبي وإقامة مرتّبة',         hintEn: 'A medical appointment and an arranged stay' },
  { id: 'umrah',   icon: 'no-umrah',      service: 'umrah',
    labelAr: 'عمرة',   labelEn: 'Umrah',    hintAr: 'برنامج بإقامة قريبة من الحرم',    hintEn: 'A programme with a stay near the Haram' },
  { id: 'visit',   icon: 'no-users',      service: 'flights',
    labelAr: 'زيارة',  labelEn: 'Visiting', hintAr: 'أهل أو أصدقاء في الخارج',        hintEn: 'Family or friends abroad' },
];

export const DESTINATION_REGISTRY = [
  /* ---- Middle East --------------------------------------------------- */
  { id: 'jed', slug: 'jeddah', region: 'middleEast', featured: true, home: true, status: 'available',
    nameAr: 'جدة', nameEn: 'Jeddah', countryAr: 'السعودية', countryEn: 'Saudi Arabia',
    descAr: 'بوابة الحرمين', descEn: 'Gateway to the Holy Cities',
    purposes: ['umrah', 'visit', 'work'], services: ['flights', 'umrah', 'hotels', 'visa'],
    image: { src: null, altAr: 'جدة', altEn: 'Jeddah' } },
  { id: 'mkk', slug: 'makkah', region: 'middleEast', featured: false, home: true, status: 'available',
    nameAr: 'مكة المكرمة', nameEn: 'Makkah', countryAr: 'السعودية', countryEn: 'Saudi Arabia',
    descAr: 'عمرة وزيارة', descEn: 'Umrah and visits',
    purposes: ['umrah', 'visit'], services: ['umrah', 'hotels', 'transport'],
    image: { src: null, altAr: 'مكة المكرمة', altEn: 'Makkah' } },
  { id: 'dxb', slug: 'dubai', region: 'middleEast', featured: true, home: true, status: 'available',
    nameAr: 'دبي', nameEn: 'Dubai', countryAr: 'الإمارات', countryEn: 'United Arab Emirates',
    descAr: 'عمل وتسوق وعائلة', descEn: 'Business, shopping and family',
    purposes: ['work', 'tourism', 'visit'], services: ['flights', 'hotels', 'visa', 'packages'],
    image: { src: null, altAr: 'دبي', altEn: 'Dubai' } },
  { id: 'amm', slug: 'amman', region: 'middleEast', featured: false, home: false, status: 'available',
    nameAr: 'عمّان', nameEn: 'Amman', countryAr: 'الأردن', countryEn: 'Jordan',
    descAr: 'علاج وزيارة', descEn: 'Treatment and visits',
    purposes: ['medical', 'visit'], services: ['flights', 'medical', 'hotels', 'visa'],
    image: { src: null, altAr: 'عمّان', altEn: 'Amman' } },

  /* ---- Africa -------------------------------------------------------- */
  { id: 'cai', slug: 'cairo', region: 'africa', featured: false, home: true, status: 'available',
    nameAr: 'القاهرة', nameEn: 'Cairo', countryAr: 'مصر', countryEn: 'Egypt',
    descAr: 'علاج ودراسة وزيارة', descEn: 'Treatment, study and visits',
    purposes: ['medical', 'study', 'visit'], services: ['flights', 'medical', 'study', 'hotels'],
    image: { src: null, altAr: 'القاهرة', altEn: 'Cairo' } },
  { id: 'nbo', slug: 'nairobi', region: 'africa', featured: false, home: true, status: 'available',
    nameAr: 'نيروبي', nameEn: 'Nairobi', countryAr: 'كينيا', countryEn: 'Kenya',
    descAr: 'أعمال وطبيعة', descEn: 'Business and nature',
    purposes: ['work', 'tourism'], services: ['flights', 'hotels', 'visa', 'packages'],
    image: { src: null, altAr: 'نيروبي', altEn: 'Nairobi' } },
  { id: 'add', slug: 'addis', region: 'africa', featured: false, home: false, status: 'available',
    nameAr: 'أديس أبابا', nameEn: 'Addis Ababa', countryAr: 'إثيوبيا', countryEn: 'Ethiopia',
    descAr: 'أعمال وزيارة', descEn: 'Business and visits',
    purposes: ['work', 'visit'], services: ['flights', 'hotels', 'visa'],
    image: { src: null, altAr: 'أديس أبابا', altEn: 'Addis Ababa' } },

  /* ---- Europe -------------------------------------------------------- */
  { id: 'ist', slug: 'istanbul', region: 'europe', featured: true, home: true, status: 'available',
    nameAr: 'إسطنبول', nameEn: 'Istanbul', countryAr: 'تركيا', countryEn: 'Türkiye',
    descAr: 'سياحة عائلية وعلاج', descEn: 'Family tourism and treatment',
    purposes: ['tourism', 'medical', 'visit'], services: ['flights', 'packages', 'hotels', 'medical', 'visa'],
    image: { src: null, altAr: 'إسطنبول', altEn: 'Istanbul' } },
  { id: 'lon', slug: 'london', region: 'europe', featured: false, home: false, status: 'available',
    nameAr: 'لندن', nameEn: 'London', countryAr: 'المملكة المتحدة', countryEn: 'United Kingdom',
    descAr: 'دراسة وعمل وزيارة', descEn: 'Study, work and visits',
    purposes: ['study', 'work', 'visit'], services: ['flights', 'visa', 'study', 'hotels'],
    image: { src: null, altAr: 'لندن', altEn: 'London' } },

  /* ---- Asia ---------------------------------------------------------- */
  { id: 'kul', slug: 'kuala-lumpur', region: 'asia', featured: false, home: false, status: 'available',
    nameAr: 'كوالالمبور', nameEn: 'Kuala Lumpur', countryAr: 'ماليزيا', countryEn: 'Malaysia',
    descAr: 'دراسة وسياحة', descEn: 'Study and tourism',
    purposes: ['study', 'tourism'], services: ['flights', 'study', 'packages', 'hotels'],
    image: { src: null, altAr: 'كوالالمبور', altEn: 'Kuala Lumpur' } },
  { id: 'del', slug: 'delhi', region: 'asia', featured: false, home: false, status: 'available',
    nameAr: 'دلهي', nameEn: 'Delhi', countryAr: 'الهند', countryEn: 'India',
    descAr: 'علاج', descEn: 'Treatment',
    purposes: ['medical'], services: ['flights', 'medical', 'visa', 'hotels'],
    image: { src: null, altAr: 'دلهي', altEn: 'Delhi' } },
];

/* ---- Selectors every surface shares ------------------------------------ */
export const destinationById = (id) => DESTINATION_REGISTRY.find((d) => d.id === id || d.slug === id) ?? null;
export const destinationsIn = (regionId) => DESTINATION_REGISTRY.filter((d) => d.region === regionId);
export const destinationsFor = (purposeId) => DESTINATION_REGISTRY.filter((d) => d.purposes.includes(purposeId));
export const featuredDestinations = () => DESTINATION_REGISTRY.filter((d) => d.featured);
export const homeDestinations = () => DESTINATION_REGISTRY.filter((d) => d.home);
/** Regions that actually contain something — what a nav renders. */
export const regionsWithDestinations = () => DESTINATION_REGIONS.filter((r) => destinationsIn(r.id).length);

/**
 * The route that starts a trip to this destination TODAY: the homepage
 * booking entry on flights with "to" prefilled (index.html resolves the slug
 * to the localised name). The detail page (destinations/<slug>/) is a later
 * stage. Returned without the site root — pass through route().
 */
export const destinationEntry = (dest) => `?vertical=flights&to=${encodeURIComponent(dest.slug)}#booking`;

/**
 * Filter the registry by the destination search fields. Pure and
 * synchronous today; the same signature fits an API call later.
 * @param {{ q?: string, region?: string, purpose?: string }} query
 */
export function searchDestinations({ q = '', region = '', purpose = '' } = {}, list = DESTINATION_REGISTRY) {
  const needle = q.trim().toLowerCase();
  return list.filter((d) =>
    (!region || d.region === region) &&
    (!purpose || d.purposes.includes(purpose)) &&
    (!needle || [d.nameAr, d.nameEn, d.countryAr, d.countryEn, d.slug].some((v) => v.toLowerCase().includes(needle))));
}
