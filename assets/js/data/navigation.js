/* ============================================================================
   DATA / NAVIGATION — Stage 10.2 §04
   Number One Travel & Tourism — نمبرون للسفر و السياحة

   The whole information architecture lives here, as data. The header renders
   whatever this file declares; it hard-codes no label, no route and no menu.

   Two consequences the brief asks for explicitly:

   §33  The header never depends on remote data. This module is static and
        bundled, so navigation survives an API outage intact. Anything dynamic
        (a live offer count, an account name) is layered on top and degrades to
        nothing.
   §28  This is the PUBLIC CUSTOMER surface only. Supervisor and admin
        navigation are separate systems and must not be merged into this file.
   ========================================================================= */

/** Routes are stored without a leading slash and resolved through route(). */

/* --------------------------------------------------------------------------
   PRIMARY NAVIGATION — §03. Five items, deliberately.
   Every service does NOT get a top-level slot (§04); they live in the mega
   menu. `menu` names the panel a item opens.
   ----------------------------------------------------------------------- */
export const NAV_PRIMARY = [
  { id: 'home',        href: '',                 labelAr: 'الرئيسية',        labelEn: 'Home' },
  { id: 'services',    href: 'services/',        labelAr: 'خدماتنا',          labelEn: 'Services',    menu: 'services' },
  { id: 'destinations',href: 'destinations/',    labelAr: 'الوجهات',          labelEn: 'Destinations',menu: 'destinations' },
  { id: 'offers',      href: 'offers/',          labelAr: 'العروض والباقات',  labelEn: 'Offers & packages', menu: 'offers' },
  { id: 'help',        href: 'help/',            labelAr: 'المساعدة',         labelEn: 'Help',        menu: 'help' },
];

/* --------------------------------------------------------------------------
   SERVICES MEGA MENU — §05. Four groups, scannable, icon + title + one line.
   ----------------------------------------------------------------------- */
import { SERVICE_CATEGORIES, servicesIn } from './services.js';

/* The four columns ARE the four approved categories, and every item is a
   registry record (data/services.js): label = title, one-liner = short.
   The menu cannot list a service the registry does not have. */
export const MENU_SERVICES = {
  id: 'services',
  type: 'mega',
  titleAr: 'خدماتنا', titleEn: 'Our services',
  columns: SERVICE_CATEGORIES.map((c) => ({
    id: c.id, titleAr: c.labelAr, titleEn: c.labelEn,
    items: servicesIn(c.id).map((s) => ({
      id: s.id, icon: s.icon, href: s.href,
      labelAr: s.titleAr, labelEn: s.titleEn, descAr: s.shortAr, descEn: s.shortEn,
    })),
  })),
  /* The mega menu ends with human help, not another link list. §08 */
  footer: {
    titleAr: 'لست متأكداً من الخدمة المناسبة؟', titleEn: 'Not sure which service you need?',
    textAr: 'مختص من نمبرون يقارن لك الخيارات ويرشّح الأنسب لعائلتك.',
    textEn: 'A Number One specialist compares the options and recommends one.',
    ctaAr: 'تحدث مع مختص', ctaEn: 'Talk to a specialist',
    href: 'help/contact/',
  },
};

/* --------------------------------------------------------------------------
   DESTINATIONS — §06. Featured only, plus a way to the full system later.
   ----------------------------------------------------------------------- */
import { regionsWithDestinations, destinationsIn } from './destinations.js';

/* Columns are the regions that contain something (data/destinations.js);
   items are registry records. No "most popular" — the registry has no such
   field, so the menu cannot claim it. */
export const MENU_DESTINATIONS = {
  id: 'destinations',
  type: 'panel',
  titleAr: 'الوجهات', titleEn: 'Destinations',
  columns: regionsWithDestinations().map((r) => ({
    id: r.id, titleAr: r.labelAr, titleEn: r.labelEn,
    items: destinationsIn(r.id).map((d) => ({ id: d.id, href: `destinations/${d.slug}/`, labelAr: d.nameAr, labelEn: d.nameEn })),
  })),
  footer: { linkAr: 'كل الوجهات', linkEn: 'All destinations', href: 'destinations/' },
};

/* --------------------------------------------------------------------------
   OFFERS — §07. Kept visually simple on purpose.
   ----------------------------------------------------------------------- */
import { OFFER_CATEGORIES, offersIn } from './offers.js';

/* The offers menu lists the data-driven categories (data/offers.js); each
   item opens the listing filtered on that category. */
export const MENU_OFFERS = {
  id: 'offers',
  type: 'panel',
  titleAr: 'العروض والباقات', titleEn: 'Offers & packages',
  columns: [
    { id: 'categories', titleAr: 'حسب النوع', titleEn: 'By type',
      items: OFFER_CATEGORIES.map((c) => ({ id: c.id, icon: c.icon, href: `offers/?category=${c.id}`, labelAr: c.labelAr, labelEn: c.labelEn })) },
  ],
  footer: { linkAr: 'كل العروض', linkEn: 'All offers', href: 'offers/' },
};

/* --------------------------------------------------------------------------
   HELP / SUPPORT — §08. Human assistance one click from every page.
   `channel: true` marks the two that must read instantly.
   ----------------------------------------------------------------------- */
/* `href: null` means the business has not supplied the number yet. Every
   surface (header panels, drawer, footer, homepage support) renders a channel
   only when its href is set, so a placeholder can never reach a customer.
   Set the real values here — once — and all of them appear:
     href: 'https://wa.me/2499XXXXXXXX'   href: 'tel:+2499XXXXXXXX'          */
export const SUPPORT_CHANNELS = [
  { id: 'whatsapp', icon: 'no-whatsapp', href: null, external: true, channel: true,
    labelAr: 'واتساب', labelEn: 'WhatsApp', metaAr: 'رد سريع', metaEn: 'Fast reply' },
  { id: 'call', icon: 'no-phone', href: null, external: true, channel: true,
    labelAr: 'اتصال', labelEn: 'Call us', metaAr: 'من 8ص إلى 10م', metaEn: '8am - 10pm' },
];

/** The channels that can actually be used — the only list a surface renders. */
export const liveChannels = (channels = SUPPORT_CHANNELS) => channels.filter((c) => !!c.href);

export const MENU_HELP = {
  id: 'help',
  type: 'panel',
  /* Opened from two places — the primary nav and the Support action — so the
     header builds it once, anchored to the end of the bar, and points both
     triggers at it. Two triggers, one panel, one thing to maintain. */
  placement: 'end',
  titleAr: 'المساعدة', titleEn: 'Help',
  channels: SUPPORT_CHANNELS,
  columns: [
    { id: 'help', titleAr: 'مركز المساعدة', titleEn: 'Help centre', items: [
      { id: 'center',  icon: 'no-support',   href: 'help/',         labelAr: 'مركز المساعدة',   labelEn: 'Help centre' },
      { id: 'faq',     icon: 'no-info',      href: 'help/faq/',     labelAr: 'الأسئلة الشائعة', labelEn: 'FAQ' },
      { id: 'contact', icon: 'no-mail',      href: 'help/contact/', labelAr: 'تواصل معنا',      labelEn: 'Contact us' },
      { id: 'manage',  icon: 'no-booking',   href: 'trips/',        labelAr: 'إدارة حجزي',      labelEn: 'Manage my booking' },
    ]},
  ],
};

/* --------------------------------------------------------------------------
   ACCOUNT — §10. Two shapes. Stage 12 fills them in; the header only owns
   the entry point and the menu architecture.
   ----------------------------------------------------------------------- */
export const ACCOUNT_GUEST = [
  { id: 'signin', icon: 'no-customer', href: 'account/sign-in/', labelAr: 'تسجيل الدخول', labelEn: 'Sign in', primary: true },
  { id: 'signup', icon: 'no-plus',     href: 'account/sign-up/', labelAr: 'إنشاء حساب',   labelEn: 'Create account' },
];

export const ACCOUNT_CUSTOMER = [
  { id: 'trips',     icon: 'no-booking',      href: 'trips/',                labelAr: 'رحلاتي',     labelEn: 'My trips' },
  { id: 'bookings',  icon: 'no-ticket',       href: 'account/bookings/',     labelAr: 'حجوزاتي',    labelEn: 'My bookings' },
  { id: 'travelers', icon: 'no-users',        href: 'account/travellers/',   labelAr: 'المسافرون',  labelEn: 'Travellers' },
  { id: 'documents', icon: 'no-documents',    href: 'account/documents/',    labelAr: 'المستندات',  labelEn: 'Documents' },
  { id: 'payments',  icon: 'no-payment',      href: 'account/payments/',     labelAr: 'المدفوعات',  labelEn: 'Payments' },
  { id: 'notifs',    icon: 'no-notification', href: 'account/notifications/',labelAr: 'الإشعارات',  labelEn: 'Notifications' },
  { id: 'support',   icon: 'no-support',      href: 'help/',                 labelAr: 'الدعم',      labelEn: 'Support' },
  { id: 'settings',  icon: 'no-settings',     href: 'account/settings/',     labelAr: 'الإعدادات',  labelEn: 'Settings', divider: true },
  { id: 'logout',    icon: 'no-logout',       href: 'account/sign-out/',     labelAr: 'تسجيل الخروج', labelEn: 'Sign out' },
];

/* --------------------------------------------------------------------------
   GLOBAL SEARCH — §09. Scopes the focused search interface offers.
   ----------------------------------------------------------------------- */
export const SEARCH_SCOPES = [
  { id: 'flights',      icon: 'no-flight',   labelAr: 'رحلات',   labelEn: 'Flights' },
  { id: 'hotels',       icon: 'no-hotel',    labelAr: 'فنادق',   labelEn: 'Hotels' },
  { id: 'destinations', icon: 'no-location', labelAr: 'وجهات',   labelEn: 'Destinations' },
  { id: 'offers',       icon: 'no-price-tag',labelAr: 'عروض',    labelEn: 'Offers' },
  { id: 'help',         icon: 'no-support',  labelAr: 'مساعدة',  labelEn: 'Help' },
];

/* --------------------------------------------------------------------------
   BOOK NOW — §11. One red action in the header, and only one.
   ----------------------------------------------------------------------- */
export const BOOK_CTA = { id: 'book', href: 'search/', labelAr: 'احجز الآن', labelEn: 'Book now' };

/* Menus indexed for lookup by the primary nav's `menu` key. */
export const MENUS = {
  services:     MENU_SERVICES,
  destinations: MENU_DESTINATIONS,
  offers:       MENU_OFFERS,
  help:         MENU_HELP,
};

/* --------------------------------------------------------------------------
   MOBILE BOTTOM NAV and FOOTER — unchanged surfaces that read the same IA.
   ----------------------------------------------------------------------- */
export const NAV_BOTTOM = [
  { id: 'home',    href: '',          icon: 'no-home',     labelAr: 'الرئيسية', labelEn: 'Home' },
  { id: 'search',  href: 'search/',   icon: 'no-search',   labelAr: 'بحث',      labelEn: 'Search' },
  { id: 'trips',   href: 'trips/',    icon: 'no-booking',  labelAr: 'رحلاتي',   labelEn: 'Trips' },
  { id: 'help',    href: 'help/',     icon: 'no-support',  labelAr: 'المساعدة', labelEn: 'Help' },
  { id: 'account', href: 'account/',  icon: 'no-customer', labelAr: 'حسابي',    labelEn: 'Account' },
];

/* NAV_FOOTER moved to data/footer.js as FOOTER_COLUMNS in Stage 10.3, where it
   derives its service list from MENU_SERVICES above — so the header menu and
   the footer column can never disagree about what we sell. */
