/* ============================================================================
   DATA / SUPERVISORS — the one registry of Number One's travel supervisors.
   Stage 10.10

   A supervisor is a person inside Number One, never a brand of their own:
   the record carries personal FACTS only — no colour, no logo, no theme,
   no rating, no statistic. Every surface that shows a supervisor reads
   THIS file: the public profile (supervisor/<slug>/), the booking
   attribution chip, and later the supervisor dashboard and the admin
   system, which will edit these same fields.

   Shape of a record — the contract an admin surface will edit:

     id          stable key (attribution and commissions hang on it later)
     slug        route segment: supervisor/<slug>/ — unique, lowercase
     status      one of SUPERVISOR_STATUSES: 'active' renders the profile;
                 anything else renders the "unavailable" state
     name / title / bio   Ar + En; null until the business supplies them
     image       { src, altAr, altEn } — src: null renders the neutral slot
     languages   SUPERVISOR_LANGUAGES ids
     specialties TRAVEL_PURPOSES ids (the areas this supervisor works in)
     services    SERVICE_REGISTRY ids this supervisor handles
     phone / whatsapp / email   verified channels only; null hides the action
     createdAt   ISO date

   A field left null is simply not rendered. Nothing here may be invented
   to fill a gap: the five launch records below are placeholders that say
   so, and the page shows their neutral structure until real data arrives.
   ========================================================================= */

import { bookingEntry } from './config.js';
import { SERVICE_REGISTRY } from './services.js';
import { TRAVEL_PURPOSES } from './destinations.js';

export const SUPERVISOR_STATUSES = {
  active:   { id: 'active',   icon: 'no-shield',    labelAr: 'مشرف معتمد',     labelEn: 'Verified supervisor' },
  inactive: { id: 'inactive', icon: 'no-pending',   labelAr: 'غير متاح حالياً', labelEn: 'Currently unavailable' },
};

/* The languages a supervisor may list. Structural vocabulary, not a claim. */
export const SUPERVISOR_LANGUAGES = [
  { id: 'ar', labelAr: 'العربية',   labelEn: 'Arabic' },
  { id: 'en', labelAr: 'الإنجليزية', labelEn: 'English' },
  { id: 'tr', labelAr: 'التركية',   labelEn: 'Turkish' },
  { id: 'fr', labelAr: 'الفرنسية',  labelEn: 'French' },
];

/* Areas of expertise reuse the travel purposes: one vocabulary across the
   destinations page, the profile and the future admin. */
export const SUPERVISOR_SPECIALTIES = TRAVEL_PURPOSES;

/* The services a supervisor handles by default when the record lists none:
   every bookable service. A record with its own list overrides this. */
const DEFAULT_SERVICES = ['flights', 'hotels', 'visa', 'packages', 'umrah', 'medical', 'transport', 'issue'];

/* Five launch records, one per supervisor the business will onboard.
   DEMO / PLACEHOLDER SUPERVISOR DATA — fictional names, safe placeholder
   contact info, generated abstract avatars: not real employees. Every
   field here is exactly what an admin edits when the business supplies
   the real five (see docs/SUPERVISOR-PROFILES.md for the replacement
   procedure) — replacing values requires editing these records only,
   never a new route, a new component or a redesigned page. Rename a slug
   only together with tools/build-routes.mjs's regeneration and the
   matching backend record's slug (backend/db.mjs LAUNCH_SUPERVISORS),
   since attribution resolves a booking's `?supervisor=<slug>` against
   the backend's OWN slug column, not this file. */
const launch = (n, rec) => ({
  id: `sup-${n}`, slug: rec.slug, status: 'active', placeholder: true,
  nameAr: rec.nameAr, nameEn: rec.nameEn, titleAr: 'مشرف سفر', titleEn: 'Travel Supervisor',
  bioAr: rec.bioAr, bioEn: rec.bioEn,
  image: { src: `assets/brand/supervisors/${rec.slug}.svg`, altAr: `الصورة الرمزية لـ${rec.nameAr}`, altEn: `Avatar placeholder for ${rec.nameEn}` },
  cityAr: 'الخرطوم', cityEn: 'Khartoum',
  languages: ['ar', 'en'], specialties: rec.specialties, services: rec.services,
  phone: rec.phone, whatsapp: rec.phone, email: rec.email,
  createdAt: '2026-09-16',
});

export const SUPERVISOR_REGISTRY = [
  launch(1, { slug: 'ahmed-mohamed', nameAr: 'أحمد محمد', nameEn: 'Ahmed Mohamed', specialties: ['visit', 'tourism'], services: ['flights', 'hotels', 'packages'], phone: '+249900000001', email: 'ahmed.demo@numberone.example',
    bioAr: 'متخصص في مساعدة المسافرين على اختيار الرحلات والحجوزات المناسبة لاحتياجاتهم وميزانيتهم، مع التركيز على سهولة الإجراءات وسرعة المتابعة.',
    bioEn: 'Specialises in helping travellers choose flights and bookings that fit their needs and budget, focusing on simple procedures and fast follow-up.' }),
  launch(2, { slug: 'mohamed-abdullah', nameAr: 'محمد عبدالله', nameEn: 'Mohamed Abdullah', specialties: ['study', 'work'], services: ['visa', 'study', 'work'], phone: '+249900000002', email: 'mohamed.demo@numberone.example',
    bioAr: 'يساعد المسافرين في ترتيب متطلبات السفر والتأشيرات وخيارات الدراسة والعمل، مع تقديم إرشاد واضح خلال مراحل الرحلة.',
    bioEn: 'Helps travellers arrange visas and study or work travel requirements, with clear guidance through every stage of the journey.' }),
  launch(3, { slug: 'sara-ahmed', nameAr: 'سارة أحمد', nameEn: 'Sara Ahmed', specialties: ['tourism', 'visit'], services: ['packages'], phone: '+249900000003', email: 'sara.demo@numberone.example',
    bioAr: 'متخصصة في تنظيم الرحلات السياحية والرحلات الجماعية، ومساعدة العائلات والمسافرين على الوصول إلى خيارات سفر عملية ومناسبة.',
    bioEn: 'Specialises in organising tourism and group trips, helping families and travellers reach practical, suitable travel options.' }),
  launch(4, { slug: 'omar-hassan', nameAr: 'عمر حسن', nameEn: 'Omar Hassan', specialties: ['umrah'], services: ['umrah', 'hotels', 'flights'], phone: '+249900000004', email: 'omar.demo@numberone.example',
    bioAr: 'يساعد المسافرين في تنسيق رحلات العمرة وحجوزات الفنادق وتذاكر الطيران، مع متابعة تفاصيل الرحلة من الحجز حتى الاستعداد للسفر.',
    bioEn: 'Helps travellers coordinate Umrah trips, hotel bookings and flight tickets, following up on every detail from booking through departure.' }),
  launch(5, { slug: 'maryam-ali', nameAr: 'مريم علي', nameEn: 'Maryam Ali', specialties: ['medical', 'visit'], services: ['medical', 'flights'], phone: '+249900000005', email: 'maryam.demo@numberone.example',
    bioAr: 'تساعد المسافرين والعائلات في تنسيق احتياجات السفر، بما في ذلك السفر العلاجي واختيار الرحلات والحجوزات المناسبة.',
    bioEn: 'Helps travellers and families coordinate their travel needs, including medical travel and choosing the right flights and bookings.' }),
];

/* Stage 13 — route segments under supervisor/ that a slug may never take: the supervisor portal's own private pages
   live at these exact paths (supervisor/dashboard/, supervisor/customers/, …), sibling to the public profiles this
   file generates. A future admin assigning a real slug must reject one of these (backend/supervisor.mjs enforces the
   same list server-side; this copy is for any client-side slug form the admin UI eventually adds). */
export const RESERVED_SUPERVISOR_SLUGS = ['dashboard', 'customers', 'leads', 'bookings', 'revenue', 'performance', 'notifications', 'settings', 'profile', 'sign-in', 'sign-up', 'sign-out', 'forgot-password', 'reset-password', 'admin', 'me', 'auth', 'api'];

/* ---- Selectors every surface shares ------------------------------------ */
export const supervisorBySlug = (slug) => SUPERVISOR_REGISTRY.find((s) => s.slug === slug || s.id === slug) ?? null;
export const isActiveSupervisor = (slug) => supervisorBySlug(slug)?.status === 'active';

/** The registry records of the services this supervisor handles, in registry order. */
export const supervisorServices = (sup) => {
  const ids = sup.services?.length ? sup.services : DEFAULT_SERVICES;
  return SERVICE_REGISTRY.filter((s) => ids.includes(s.id));
};
export const supervisorLanguages = (sup) => SUPERVISOR_LANGUAGES.filter((l) => sup.languages?.includes(l.id));
export const supervisorSpecialties = (sup) => SUPERVISOR_SPECIALTIES.filter((p) => sup.specialties?.includes(p.id));

/** Whether the record carries anything beyond its identity and services. */
export const supervisorHasDetails = (sup) =>
  !!(sup.nameAr || sup.nameEn || sup.titleAr || sup.titleEn || sup.bioAr || sup.bioEn || sup.image?.src
     || sup.cityAr || sup.cityEn || sup.languages?.length || sup.specialties?.length || supervisorChannels(sup).length);

/**
 * The contact actions a customer can actually use — built ONLY from
 * verified values on the record. A null field produces no action, so no
 * placeholder number can ever reach a customer.
 */
export function supervisorChannels(sup) {
  const digits = (v) => String(v).replace(/[^\d+]/g, '');
  return [
    sup.whatsapp ? { id: 'whatsapp', icon: 'no-whatsapp', href: `https://wa.me/${digits(sup.whatsapp).replace(/^\+/, '')}`, external: true, labelAr: 'واتساب', labelEn: 'WhatsApp' } : null,
    sup.phone    ? { id: 'call',     icon: 'no-phone',    href: `tel:${digits(sup.phone)}`,     external: false, labelAr: 'اتصال', labelEn: 'Call' } : null,
    sup.email    ? { id: 'email',    icon: 'no-mail',     href: `mailto:${sup.email}`,          external: false, labelAr: 'بريد إلكتروني', labelEn: 'Email' } : null,
  ].filter(Boolean);
}

/* ---- Routes (without the site root — pass through route()) -------------- */
/** The public profile. */
export const supervisorUrl = (sup) => `supervisor/${sup.slug}/`;

/**
 * Attach the supervisor to any site path: `book/?vertical=flights` becomes
 * `book/?vertical=flights&supervisor=<slug>`. The booking entry reads the
 * parameter, stores the attribution and carries it into the booking
 * context (core/booking.js) — the hand-off later stages build on.
 */
export function attributed(path, sup) {
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('supervisor', sup.slug);
  return `${base}?${params.toString()}`;
}
/** The booking entry, attributed, optionally on a vertical and prefill. */
export const supervisorEntry = (sup, params = {}) => attributed(bookingEntry(params), sup);
/** The request-assistance door, attributed. */
export const supervisorContactUrl = (sup) => attributed('help/contact/', sup);
