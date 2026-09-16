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
export const MENU_SERVICES = {
  id: 'services',
  type: 'mega',
  titleAr: 'خدماتنا', titleEn: 'Our services',
  columns: [
    {
      id: 'travel',
      titleAr: 'السفر والحجز', titleEn: 'Travel & booking',
      items: [
        { id: 'flights',   icon: 'no-flight',    href: 'services/flights/',   labelAr: 'تذاكر الطيران', labelEn: 'Flight tickets',
          descAr: 'نقارن الشركات ونرشّح الأنسب', descEn: 'We compare airlines and recommend' },
        { id: 'hotels',    icon: 'no-hotel',     href: 'services/hotels/',    labelAr: 'الفنادق', labelEn: 'Hotels',
          descAr: 'إقامة قريبة بأسعار واضحة', descEn: 'Close by, clearly priced' },
        { id: 'transport', icon: 'no-transport', href: 'services/transport/', labelAr: 'النقل', labelEn: 'Transport',
          descAr: 'استقبال وتنقلات بسائق', descEn: 'Pickups and transfers' },
      ],
    },
    {
      id: 'specialist',
      titleAr: 'الخدمات المتخصصة', titleEn: 'Specialist services',
      items: [
        { id: 'visa',    icon: 'no-visa',    href: 'services/visa/',    labelAr: 'التأشيرات', labelEn: 'Visas',
          descAr: 'مراجعة أوراقك قبل التقديم', descEn: 'Papers checked before you apply' },
        { id: 'medical', icon: 'no-medical', href: 'services/medical/', labelAr: 'السفر العلاجي', labelEn: 'Medical travel',
          descAr: 'الموعد والتأشيرة والإقامة معاً', descEn: 'Appointment, visa and stay together' },
        { id: 'umrah',   icon: 'no-umrah',   href: 'services/umrah/',   labelAr: 'العمرة', labelEn: 'Umrah',
          descAr: 'إقامة قريبة ومرافقة ميدانية', descEn: 'Close stays, guided on the ground' },
      ],
    },
    {
      id: 'programmes',
      titleAr: 'السفر والبرامج', titleEn: 'Travel & programmes',
      items: [
        { id: 'packages', icon: 'no-tourism', href: 'services/packages/', labelAr: 'السياحة والباقات', labelEn: 'Tours & packages',
          descAr: 'برامج عائلية جاهزة', descEn: 'Ready family programmes' },
        { id: 'study',    icon: 'no-study',   href: 'services/study/',    labelAr: 'الدراسة', labelEn: 'Study',
          descAr: 'تأشيرة الدراسة والسكن', descEn: 'Study visas and housing' },
        { id: 'work',     icon: 'no-work',    href: 'services/work/',     labelAr: 'العمل', labelEn: 'Work',
          descAr: 'إجراءات سفر العمل', descEn: 'Work travel paperwork' },
      ],
    },
    {
      id: 'tickets',
      titleAr: 'خدمات التذاكر', titleEn: 'Ticket services',
      items: [
        { id: 'issue',  icon: 'no-ticket',      href: 'services/ticket-issue/',  labelAr: 'إصدار التذاكر', labelEn: 'Issue tickets' },
        { id: 'change', icon: 'no-ticket-edit', href: 'services/ticket-change/', labelAr: 'تعديل التذاكر', labelEn: 'Change tickets' },
        { id: 'cancel', icon: 'no-cancelled',   href: 'services/ticket-cancel/', labelAr: 'إلغاء التذاكر', labelEn: 'Cancel tickets' },
      ],
    },
  ],
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
export const MENU_DESTINATIONS = {
  id: 'destinations',
  type: 'panel',
  titleAr: 'الوجهات', titleEn: 'Destinations',
  columns: [
    { id: 'popular', titleAr: 'الأكثر طلباً', titleEn: 'Most popular', items: [
      { id: 'jed', href: 'destinations/jeddah/',   labelAr: 'جدة',       labelEn: 'Jeddah' },
      { id: 'mkk', href: 'destinations/makkah/',   labelAr: 'مكة المكرمة', labelEn: 'Makkah' },
      { id: 'dxb', href: 'destinations/dubai/',    labelAr: 'دبي',        labelEn: 'Dubai' },
      { id: 'cai', href: 'destinations/cairo/',    labelAr: 'القاهرة',    labelEn: 'Cairo' },
    ]},
    { id: 'regional', titleAr: 'إقليمية', titleEn: 'Regional', items: [
      { id: 'ist', href: 'destinations/istanbul/', labelAr: 'إسطنبول',   labelEn: 'Istanbul' },
      { id: 'amm', href: 'destinations/amman/',    labelAr: 'عمّان',      labelEn: 'Amman' },
      { id: 'nbo', href: 'destinations/nairobi/',  labelAr: 'نيروبي',     labelEn: 'Nairobi' },
      { id: 'add', href: 'destinations/addis/',    labelAr: 'أديس أبابا', labelEn: 'Addis Ababa' },
    ]},
    { id: 'international', titleAr: 'دولية', titleEn: 'International', items: [
      { id: 'lon', href: 'destinations/london/',   labelAr: 'لندن',      labelEn: 'London' },
      { id: 'kul', href: 'destinations/kuala-lumpur/', labelAr: 'كوالالمبور', labelEn: 'Kuala Lumpur' },
      { id: 'del', href: 'destinations/delhi/',    labelAr: 'دلهي',      labelEn: 'Delhi' },
    ]},
  ],
  footer: { linkAr: 'كل الوجهات', linkEn: 'All destinations', href: 'destinations/' },
};

/* --------------------------------------------------------------------------
   OFFERS — §07. Kept visually simple on purpose.
   ----------------------------------------------------------------------- */
export const MENU_OFFERS = {
  id: 'offers',
  type: 'panel',
  titleAr: 'العروض والباقات', titleEn: 'Offers & packages',
  columns: [
    { id: 'now', titleAr: 'متاح الآن', titleEn: 'Available now', items: [
      { id: 'current',  icon: 'no-price-tag', href: 'offers/current/',  labelAr: 'العروض الحالية', labelEn: 'Current offers' },
      { id: 'seasonal', icon: 'no-calendar',  href: 'offers/seasonal/', labelAr: 'عروض موسمية',   labelEn: 'Seasonal offers' },
      { id: 'featured', icon: 'no-sparkle',   href: 'offers/featured/', labelAr: 'رحلات مختارة',   labelEn: 'Featured trips' },
    ]},
    { id: 'packages', titleAr: 'الباقات', titleEn: 'Packages', items: [
      { id: 'travel', icon: 'no-tourism', href: 'offers/packages/',        labelAr: 'باقات السفر',   labelEn: 'Travel packages' },
      { id: 'family', icon: 'no-users',   href: 'offers/family-packages/', labelAr: 'باقات العائلة', labelEn: 'Family packages' },
    ]},
  ],
  footer: { linkAr: 'كل العروض', linkEn: 'All offers', href: 'offers/' },
};

/* --------------------------------------------------------------------------
   HELP / SUPPORT — §08. Human assistance one click from every page.
   `channel: true` marks the two that must read instantly.
   ----------------------------------------------------------------------- */
export const SUPPORT_CHANNELS = [
  { id: 'whatsapp', icon: 'no-whatsapp', href: 'https://wa.me/', external: true, channel: true,
    labelAr: 'واتساب', labelEn: 'WhatsApp', metaAr: 'رد سريع', metaEn: 'Fast reply' },
  { id: 'call', icon: 'no-phone', href: 'tel:+249000000000', external: true, channel: true,
    labelAr: 'اتصال', labelEn: 'Call us', metaAr: 'من 8ص إلى 10م', metaEn: '8am - 10pm' },
];

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
