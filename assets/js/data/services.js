/* ============================================================================
   DATA / SERVICES — the one registry of what Number One sells. Stage 10.5

   Thirteen approved services in four categories (the 10.5 twelve plus the
   group trips the 10.6 brief lists). Every surface that lists a
   service reads THIS file: the services page, the homepage grid, the header
   mega menu, the footer column, the 404's chips, the style guide, and later
   the service-detail pages, search, the customer account, the supervisor
   and admin systems. Add or retire a service here and all of them follow.

   Shape of a record — the contract an admin surface will edit:

     id         stable key (the booking engine and routes use it — never renumber)
     category   one of SERVICE_CATEGORIES[].id
     kind       'search'  — searched and booked online, now
                'request' — a specialist arranges it after a request
                'manage'  — an existing ticket is changed or cancelled
     icon       sprite id (outline set only, §05)
     href       the service-detail route: services/<slug>/ (Stage 10.6)
     slug       the last segment of href — the generated route directory
     vertical   SEARCH_VERTICALS id the booking entry opens for this service
     option     for the 'other' vertical: which service the select preselects
     status     'available' | 'soon'   — 'soon' disables the CTA and says so
     featured   shown first on the homepage and in the 404's chips
     title/short/desc  Ar + En. `short` is the one-liner the mega menu shows;
                       `desc` the card sentence
     image      { src, altAr, altEn } — src: null renders the neutral slot
     ctaAr/En   optional override of the kind's default CTA label
   ========================================================================= */

import { bookingEntry } from './config.js';
import { imageSrc } from './images.js';

export const SERVICE_CATEGORIES = [
  { id: 'core',        labelAr: 'السفر والحجز',      labelEn: 'Travel & booking',
    titleAr: 'الخدمات الأساسية',  titleEn: 'Core travel services',
    textAr: 'التذكرة والإقامة والتأشيرة — ما تبدأ به كل رحلة.',
    textEn: 'The ticket, the stay and the visa: what every trip starts with.' },
  { id: 'programmes',  labelAr: 'البرامج والرحلات',   labelEn: 'Programmes & trips',
    titleAr: 'السفر والبرامج',     titleEn: 'Travel & programmes',
    textAr: 'رحلات مرتّبة بالكامل: الباقات والعمرة والتنقّل في الوجهة.',
    textEn: 'Fully arranged journeys: packages, Umrah and getting around at the destination.' },
  { id: 'specialised', labelAr: 'الخدمات المتخصصة',   labelEn: 'Specialised travel',
    titleAr: 'السفر المتخصص',      titleEn: 'Specialised travel',
    textAr: 'سفر له هدف محدد يحتاج ترتيبات أكثر من تذكرة: العلاج والدراسة والعمل.',
    textEn: 'Travel with a specific purpose that needs more than a ticket: treatment, study and work.' },
  { id: 'tickets',     labelAr: 'خدمات التذاكر',      labelEn: 'Ticket services',
    titleAr: 'خدمات التذاكر',      titleEn: 'Ticket services',
    textAr: 'إصدار تذكرتك أو تعديلها أو إلغاؤها، مع توضيح أي رسوم قبل الخطوة.',
    textEn: 'Issue, change or cancel your ticket, with any fee explained before we act.' },
];

/* The three kinds of service, and what happens after the customer chooses
   one. This is the legend the services page shows and the badge each card
   carries — icon + word, never colour alone (§20). */
export const SERVICE_KINDS = {
  search:  { id: 'search',  icon: 'no-search',      badge: 'c-badge--brand',
             labelAr: 'بحث وحجز فوري',  labelEn: 'Search & book',
             textAr: 'تبحث وتقارن وتحجز على الموقع مباشرة.',
             textEn: 'Search, compare and book on the site right away.',
             ctaAr: 'ابحث واحجز',       ctaEn: 'Search & book' },
  request: { id: 'request', icon: 'no-documents',   badge: 'c-badge--info',
             labelAr: 'خدمة بطلب',      labelEn: 'On request',
             textAr: 'ترسل طلبك، ويتواصل معك مختص بالخيارات والسعر.',
             textEn: 'You send a request, and a specialist comes back with options and a price.',
             ctaAr: 'اطلب الخدمة',      ctaEn: 'Request this service' },
  manage:  { id: 'manage',  icon: 'no-ticket-edit', badge: 'c-badge--outline',
             labelAr: 'إدارة تذكرة',    labelEn: 'Ticket management',
             textAr: 'ترسل بيانات تذكرتك، ونوضّح الرسوم ثم ننفّذ.',
             textEn: 'You send your ticket details, we explain any fee, then we act.',
             ctaAr: 'ابدأ الطلب',       ctaEn: 'Start a request' },
};

export const SERVICE_REGISTRY = [
  /* ---- Core travel services ------------------------------------------ */
  { id: 'flights',   category: 'core', kind: 'search', icon: 'no-flight', href: 'services/flights/', vertical: 'flights',
    status: 'available', featured: true,
    titleAr: 'تذاكر الطيران',    titleEn: 'Flight tickets',
    shortAr: 'نقارن الشركات ونرشّح الأنسب', shortEn: 'We compare airlines and recommend',
    descAr: 'نقارن بين شركات الطيران ونساعدك تختار التذكرة الأنسب لوقتك وميزانيتك.',
    descEn: 'We compare the airlines and help you pick the ticket that fits your time and budget.',
    image: { src: imageSrc('services/flights'), altAr: 'تذاكر الطيران', altEn: 'Flight tickets' } },
  { id: 'hotels',    category: 'core', kind: 'search', icon: 'no-hotel', href: 'services/hotels/', vertical: 'hotels',
    status: 'available', featured: true,
    titleAr: 'حجوزات الفنادق',   titleEn: 'Hotel bookings',
    shortAr: 'إقامة قريبة بأسعار واضحة', shortEn: 'Close by, clearly priced',
    descAr: 'إقامة قريبة من وجهتك بأسعار واضحة وشروط إلغاء مفهومة.',
    descEn: 'A stay close to where you are going, with clear prices and cancellation terms.',
    image: { src: imageSrc('services/hotels'), altAr: 'حجوزات الفنادق', altEn: 'Hotel bookings' } },
  { id: 'visa',      category: 'core', kind: 'request', icon: 'no-visa', href: 'services/visa/', vertical: 'visa',
    status: 'available', featured: true,
    titleAr: 'التأشيرات',        titleEn: 'Visas',
    shortAr: 'مراجعة أوراقك قبل التقديم', shortEn: 'Papers checked before you apply',
    descAr: 'نراجع أوراقك قبل التقديم ونخبرك بما ينقصك، حتى لا يتأخر سفرك.',
    descEn: 'We check your documents before you apply and tell you what is missing, so your travel is not delayed.',
    image: { src: imageSrc('services/visa'), altAr: 'التأشيرات', altEn: 'Visas' } },

  /* ---- Travel & programmes ------------------------------------------- */
  { id: 'packages',  category: 'programmes', kind: 'request', icon: 'no-tourism', href: 'services/packages/', vertical: 'packages',
    status: 'available', featured: true,
    titleAr: 'السياحة والباقات', titleEn: 'Tours & packages',
    shortAr: 'برامج تُصمَّم حسب أيامك وميزانيتك', shortEn: 'Programmes shaped around your days and budget',
    descAr: 'برامج سياحية تُصمَّم حسب عدد الأيام والميزانية، للعائلة أو للمجموعة.',
    descEn: 'Tourism programmes shaped around your days and your budget, for a family or a group.',
    image: { src: imageSrc('services/packages'), altAr: 'السياحة والباقات', altEn: 'Tours & packages' } },
  { id: 'umrah',     category: 'programmes', kind: 'request', icon: 'no-umrah', href: 'services/umrah/', vertical: 'umrah',
    status: 'available', featured: true,
    titleAr: 'العمرة',           titleEn: 'Umrah',
    shortAr: 'إقامة قريبة ومتابعة طوال الرحلة', shortEn: 'Close stays, support throughout',
    descAr: 'برامج عمرة بإقامة قريبة من الحرم ومتابعة طوال الرحلة.',
    descEn: 'Umrah programmes with accommodation near the Haram and support throughout.',
    image: { src: imageSrc('services/umrah'), altAr: 'العمرة', altEn: 'Umrah' } },
  { id: 'transport', category: 'programmes', kind: 'request', icon: 'no-transport', href: 'services/transport/', vertical: 'transport',
    status: 'available', featured: false,
    titleAr: 'النقل',            titleEn: 'Transport',
    shortAr: 'استقبال وتنقلات بسائق', shortEn: 'Pickups and transfers',
    descAr: 'استقبال من المطار وتنقّلات بسائق داخل الوجهة، بموعد وسعر متفق عليهما.',
    descEn: 'Airport pickups and transfers with a driver at the destination, at an agreed time and price.',
    image: { src: imageSrc('services/transport'), altAr: 'النقل', altEn: 'Transport' } },

  { id: 'groups',    category: 'programmes', kind: 'request', icon: 'no-users', href: 'services/groups/', vertical: 'other', option: 'groups',
    status: 'available', featured: false,
    titleAr: 'الرحلات الجماعية', titleEn: 'Group trips',
    shortAr: 'سفر المجموعات في حجز واحد', shortEn: 'Group travel as one booking',
    descAr: 'تنظيم سفر المجموعات والعائلات الكبيرة في حجز واحد: نفس الرحلة، إقامة متجاورة، وتنقّلات تكفي الجميع.',
    descEn: 'Travel for groups and large families as one booking: the same flight, rooms close together, and transfers that fit everyone.',
    image: { src: imageSrc('services/groups'), altAr: 'الرحلات الجماعية', altEn: 'Group trips' } },

  /* ---- Specialised travel -------------------------------------------- */
  { id: 'medical',   category: 'specialised', kind: 'request', icon: 'no-medical', href: 'services/medical/', vertical: 'medical',
    status: 'available', featured: true,
    titleAr: 'السفر العلاجي',    titleEn: 'Medical travel',
    shortAr: 'الموعد والتأشيرة والإقامة معاً', shortEn: 'Appointment, visa and stay together',
    descAr: 'ننسّق الموعد الطبي والتأشيرة والإقامة معاً، ونتابع معك حتى العودة.',
    descEn: 'We arrange the medical appointment, the visa and the stay together, and follow up until you return.',
    image: { src: imageSrc('services/medical'), altAr: 'السفر العلاجي', altEn: 'Medical travel' } },
  { id: 'study',     category: 'specialised', kind: 'request', icon: 'no-study', href: 'services/study/', vertical: 'other', option: 'study',
    status: 'available', featured: false,
    titleAr: 'السفر للدراسة',    titleEn: 'Study travel',
    shortAr: 'تأشيرة الدراسة والسكن', shortEn: 'Study visas and housing',
    descAr: 'التأشيرة والتذكرة والسكن الأول لطلاب الخارج.',
    descEn: 'Visa, ticket and first accommodation for students going abroad.',
    image: { src: imageSrc('services/study'), altAr: 'السفر للدراسة', altEn: 'Study travel' } },
  { id: 'work',      category: 'specialised', kind: 'request', icon: 'no-work', href: 'services/work/', vertical: 'other', option: 'work',
    status: 'available', featured: false,
    titleAr: 'السفر للعمل',      titleEn: 'Work travel',
    shortAr: 'ترتيبات سفر العمل', shortEn: 'Work travel arrangements',
    descAr: 'ترتيبات السفر للعمل، لشخص واحد أو لفريق كامل.',
    descEn: 'Travel arrangements for work, for one person or a whole team.',
    image: { src: imageSrc('services/work'), altAr: 'السفر للعمل', altEn: 'Work travel' } },

  /* ---- Ticket services ----------------------------------------------- */
  { id: 'issue',     category: 'tickets', kind: 'manage', icon: 'no-ticket', href: 'services/ticket-issue/', vertical: 'other', option: 'issue',
    status: 'available', featured: false,
    titleAr: 'إصدار التذاكر',    titleEn: 'Ticket issuing',
    shortAr: 'إصدار على كل الشركات التي نتعامل معها', shortEn: 'Issued on every airline we work with',
    descAr: 'إصدار التذاكر على كل شركات الطيران التي نتعامل معها.',
    descEn: 'Ticket issuing across every airline we work with.',
    image: { src: imageSrc('services/issue'), altAr: 'إصدار التذاكر', altEn: 'Ticket issuing' } },
  { id: 'change',    category: 'tickets', kind: 'manage', icon: 'no-ticket-edit', href: 'services/ticket-change/', vertical: 'other', option: 'change',
    status: 'available', featured: false,
    titleAr: 'تعديل التذاكر',    titleEn: 'Ticket changes',
    shortAr: 'تغيير الموعد مع توضيح الرسوم', shortEn: 'Date changes, fees explained',
    descAr: 'نعدّل موعد رحلتك أو مسارها ونوضّح لك الرسوم قبل أي خطوة.',
    descEn: 'We change your date or routing, and explain any fee before we act.',
    image: { src: imageSrc('services/change'), altAr: 'تعديل التذاكر', altEn: 'Ticket changes' } },
  { id: 'cancel',    category: 'tickets', kind: 'manage', icon: 'no-cancelled', href: 'services/ticket-cancel/', vertical: 'other', option: 'cancel',
    status: 'available', featured: false,
    titleAr: 'إلغاء التذاكر',    titleEn: 'Ticket cancellation',
    shortAr: 'إلغاء مع بيان ما يُسترد', shortEn: 'Cancelled, with the refund explained',
    descAr: 'نلغي تذكرتك ونوضّح لك ما يُسترد وما لا يُسترد قبل التأكيد.',
    descEn: 'We cancel your ticket and explain what is refunded and what is not before you confirm.',
    image: { src: imageSrc('services/cancel'), altAr: 'إلغاء التذاكر', altEn: 'Ticket cancellation' } },
];

/* Every record's slug is the last segment of its route; derived once here so
   the two can never drift. */
for (const s of SERVICE_REGISTRY) s.slug = s.href.replace(/\/$/, '').split('/').pop();

/* ---- Selectors every surface shares ------------------------------------ */
export const serviceById = (id) => SERVICE_REGISTRY.find((s) => s.id === id) ?? null;
export const servicesIn = (categoryId) => SERVICE_REGISTRY.filter((s) => s.category === categoryId);
export const featuredServices = () => SERVICE_REGISTRY.filter((s) => s.featured);

/**
 * The route that starts this service's journey: the booking entry (/book/,
 * Stage 10.9), opened on the right vertical (and, for the "other services"
 * form, the right option). Returned without the site root — pass through
 * route().
 */
export function serviceEntry(service) {
  return bookingEntry({ vertical: service.vertical ?? 'other', service: service.option });
}

/* --------------------------------------------------------------------------
   HELP ME CHOOSE — Stage 10.5 §E. The options a customer who does not know
   the service name can pick from. `target` is data so real decision logic
   (a questionnaire, a specialist hand-off) can replace these later without
   touching the component:
     { type: 'service', id }   → that service's entry
     { type: 'section', id }   → scroll to a section on this page
   ----------------------------------------------------------------------- */
export const SERVICE_HELP_OPTIONS = [
  { id: 'trip',    icon: 'no-flight',     target: { type: 'service', id: 'flights' },
    labelAr: 'أريد حجز رحلة',            labelEn: 'I want to book a trip',
    hintAr: 'تذكرة طيران بأنسب سعر ووقت', hintEn: 'A flight at the right price and time' },
  { id: 'hotel',   icon: 'no-hotel',      target: { type: 'service', id: 'hotels' },
    labelAr: 'أريد فندق',                labelEn: 'I want a hotel',
    hintAr: 'إقامة قريبة من وجهتك',      hintEn: 'A stay close to where you are going' },
  { id: 'visa',    icon: 'no-visa',       target: { type: 'service', id: 'visa' },
    labelAr: 'أحتاج تأشيرة',             labelEn: 'I need a visa',
    hintAr: 'نراجع أوراقك قبل التقديم',  hintEn: 'We check your papers before you apply' },
  { id: 'package', icon: 'no-tourism',    target: { type: 'service', id: 'packages' },
    labelAr: 'أبحث عن باقة سفر',         labelEn: 'I am looking for a package',
    hintAr: 'برنامج كامل حسب أيامك',     hintEn: 'A full programme around your days' },
  { id: 'human',   icon: 'no-supervisor', target: { type: 'section', id: 'support' },
    labelAr: 'أحتاج مساعدة في اختيار الأنسب', labelEn: 'I need help choosing',
    hintAr: 'مختص يقارن لك ويرشّح',      hintEn: 'A specialist compares and recommends' },
];
