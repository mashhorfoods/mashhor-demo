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
   Personal fields are null on purpose: the business supplies the name,
   photo, title, bio, languages, specialties and channels; nothing is
   invented here. Rename the slug when the person is known and re-run
   tools/build-routes.mjs. */
const placeholder = (n) => ({
  id: `sup-${n}`, slug: `supervisor-${n}`, status: 'active', placeholder: true,
  nameAr: null, nameEn: null, titleAr: null, titleEn: null, bioAr: null, bioEn: null,
  image: { src: null, altAr: null, altEn: null },
  languages: [], specialties: [], services: DEFAULT_SERVICES,
  phone: null, whatsapp: null, email: null,
  createdAt: '2026-09-16',
});

export const SUPERVISOR_REGISTRY = [1, 2, 3, 4, 5].map(placeholder);

/* Stage 13 — route segments under supervisor/ that a slug may never take: the supervisor portal's own private pages
   live at these exact paths (supervisor/dashboard/, supervisor/customers/, …), sibling to the public profiles this
   file generates. A future admin assigning a real slug must reject one of these (backend/supervisor.mjs enforces the
   same list server-side; this copy is for any client-side slug form the admin UI eventually adds). */
export const RESERVED_SUPERVISOR_SLUGS = ['dashboard', 'customers', 'leads', 'bookings', 'revenue', 'performance', 'notifications', 'settings', 'profile', 'sign-in', 'sign-up', 'sign-out', 'forgot-password', 'reset-password', 'admin', 'me', 'auth', 'api'];
export const isValidSupervisorSlug = (slug) => typeof slug === 'string' && /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(slug) && !RESERVED_SUPERVISOR_SLUGS.includes(slug);

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
     || sup.languages?.length || sup.specialties?.length || supervisorChannels(sup).length);

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
