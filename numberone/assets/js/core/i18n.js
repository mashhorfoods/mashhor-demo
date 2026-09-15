/* ============================================================================
   CORE / I18N + DIRECTION — §06

   Arabic is the default. Switching language switches direction, and because
   every stylesheet in this system uses logical properties, nothing else has
   to change: no mirrored stylesheet, no per-component RTL branch.

   Strings live here rather than in components so that a component is never
   the thing that has to be translated. §27
   ========================================================================= */

export const LOCALES = {
  ar: { code: 'ar', dir: 'rtl', name: 'العربية', htmlLang: 'ar', intl: 'ar-EG' },
  en: { code: 'en', dir: 'ltr', name: 'English', htmlLang: 'en', intl: 'en-GB' },
};

const STORAGE_KEY = 'no.locale';

export const STRINGS = {
  ar: {
    'brand.name': 'نمبرون',
    'brand.full': 'نمبرون للسفر و السياحة',
    'brand.tagline': 'للسفر و السياحة',
    'nav.services': 'خدماتنا',
    'nav.destinations': 'الوجهات',
    'nav.offers': 'العروض',
    'nav.support': 'الدعم',
    'nav.account': 'حسابي',
    'nav.book': 'احجز الآن',
    'nav.search': 'بحث',
    'nav.menu': 'القائمة',
    'nav.home': 'الرئيسية',
    'nav.trips': 'رحلاتي',
    'nav.close': 'إغلاق',
    'search.flights': 'طيران',
    'search.hotels': 'فنادق',
    'search.packages': 'باقات',
    'search.visa': 'تأشيرات',
    'search.from': 'من',
    'search.to': 'إلى',
    'search.depart': 'تاريخ المغادرة',
    'search.return': 'تاريخ العودة',
    'search.travellers': 'المسافرون',
    'search.checkin': 'تاريخ الوصول',
    'search.checkout': 'تاريخ المغادرة',
    'search.destination': 'الوجهة',
    'search.guests': 'النزلاء',
    'search.rooms': 'الغرف',
    'search.nationality': 'الجنسية',
    'search.country': 'الدولة',
    'search.submit': 'ابحث',
    'search.swap': 'عكس الاتجاه',
    'search.more': 'خيارات أكثر',
    'search.less': 'خيارات أقل',
    'search.cabin': 'درجة السفر',
    'search.direct': 'رحلات مباشرة فقط',
    'pax.adults': 'بالغون',
    'pax.adults.hint': 'من 12 سنة فأكثر',
    'pax.children': 'أطفال',
    'pax.children.hint': 'من 2 إلى 11 سنة',
    'pax.infants': 'رضّع',
    'pax.infants.hint': 'أقل من سنتين',
    'pax.done': 'تم',
    'pax.summary': (n) => `${n} مسافر`,
    'status.pending': 'قيد الانتظار',
    'status.processing': 'قيد المعالجة',
    'status.confirmed': 'مؤكد',
    'status.completed': 'مكتمل',
    'status.cancelled': 'ملغي',
    'status.failed': 'فشل',
    'status.expired': 'منتهي',
    'flight.direct': 'مباشر',
    'flight.stops': (n) => (n === 1 ? 'توقف واحد' : `${n} توقفات`),
    'flight.duration': 'مدة الرحلة',
    'flight.baggage': 'وزن الأمتعة',
    'flight.select': 'اختر',
    'flight.details': 'تفاصيل الرحلة',
    'flight.perPerson': 'للفرد الواحد شامل الضرائب',
    'flight.recommended': 'الأنسب لعائلتك',
    'hotel.night': 'لليلة الواحدة',
    'hotel.reviews': (n) => `${n} تقييم`,
    'hotel.select': 'عرض الغرف',
    'package.nights': (n) => `${n} ليالٍ`,
    'package.from': 'يبدأ من',
    'package.view': 'عرض الباقة',
    'card.cta': 'اعرف المزيد',
    'supervisor.contact': 'تواصل معه',
    'supervisor.verified': 'مشرف معتمد',
    'trust.securePayment': 'دفع آمن',
    'trust.clearPrice': 'السعر نهائي وشامل',
    'trust.humanHelp': 'مختص يساعدك',
    'trust.support': 'دعم على مدار الساعة',
    'state.loading': 'جارٍ التحميل…',
    'state.searching': 'نبحث لك عن أفضل الخيارات…',
    'state.noResults.title': 'لا توجد نتائج مطابقة',
    'state.noResults.text': 'لم نجد رحلات بهذه المواصفات. جرّب تعديل التاريخ أو إزالة بعض عوامل التصفية.',
    'state.noResults.action': 'تعديل البحث',
    'state.noBookings.title': 'لا توجد حجوزات بعد',
    'state.noBookings.text': 'عندما تحجز رحلتك الأولى ستظهر هنا مع كل تفاصيلها.',
    'state.noBookings.action': 'ابدأ البحث',
    'state.error.title': 'تعذّر إتمام العملية',
    'state.error.text': 'حدث خطأ أثناء الاتصال. بياناتك محفوظة ولم يتم خصم أي مبلغ.',
    'state.error.action': 'حاول مرة أخرى',
    'state.error.next': 'إذا تكرر الخطأ، تواصل مع فريق الدعم وسنكمل الحجز نيابة عنك.',
    'state.empty.notifications': 'لا توجد إشعارات',
    'action.retry': 'إعادة المحاولة',
    'action.help': 'تحدث مع مختص',
    'action.cancel': 'إلغاء',
    'action.confirm': 'تأكيد',
    'a11y.skip': 'تخطَّ إلى المحتوى',
    'a11y.loading': 'جارٍ تحميل المحتوى',
    'lang.switch': 'English',
    'currency': 'ج.س',
  },
  en: {
    'brand.name': 'Number One',
    'brand.full': 'Number One Travel & Tourism',
    'brand.tagline': 'Travel & Tourism',
    'nav.services': 'Services',
    'nav.destinations': 'Destinations',
    'nav.offers': 'Offers',
    'nav.support': 'Support',
    'nav.account': 'Account',
    'nav.book': 'Book now',
    'nav.search': 'Search',
    'nav.menu': 'Menu',
    'nav.home': 'Home',
    'nav.trips': 'My trips',
    'nav.close': 'Close',
    'search.flights': 'Flights',
    'search.hotels': 'Hotels',
    'search.packages': 'Packages',
    'search.visa': 'Visa',
    'search.from': 'From',
    'search.to': 'To',
    'search.depart': 'Departure date',
    'search.return': 'Return date',
    'search.travellers': 'Travellers',
    'search.checkin': 'Check-in',
    'search.checkout': 'Check-out',
    'search.destination': 'Destination',
    'search.guests': 'Guests',
    'search.rooms': 'Rooms',
    'search.nationality': 'Nationality',
    'search.country': 'Country',
    'search.submit': 'Search',
    'search.swap': 'Swap direction',
    'search.more': 'More options',
    'search.less': 'Fewer options',
    'search.cabin': 'Cabin',
    'search.direct': 'Direct flights only',
    'pax.adults': 'Adults',
    'pax.adults.hint': '12 years and over',
    'pax.children': 'Children',
    'pax.children.hint': '2 to 11 years',
    'pax.infants': 'Infants',
    'pax.infants.hint': 'Under 2 years',
    'pax.done': 'Done',
    'pax.summary': (n) => `${n} traveller${n === 1 ? '' : 's'}`,
    'status.pending': 'Pending',
    'status.processing': 'Processing',
    'status.confirmed': 'Confirmed',
    'status.completed': 'Completed',
    'status.cancelled': 'Cancelled',
    'status.failed': 'Failed',
    'status.expired': 'Expired',
    'flight.direct': 'Direct',
    'flight.stops': (n) => (n === 1 ? '1 stop' : `${n} stops`),
    'flight.duration': 'Duration',
    'flight.baggage': 'Baggage',
    'flight.select': 'Select',
    'flight.details': 'Flight details',
    'flight.perPerson': 'Per person, taxes included',
    'flight.recommended': 'Best fit for your family',
    'hotel.night': 'per night',
    'hotel.reviews': (n) => `${n} reviews`,
    'hotel.select': 'View rooms',
    'package.nights': (n) => `${n} nights`,
    'package.from': 'From',
    'package.view': 'View package',
    'card.cta': 'Learn more',
    'supervisor.contact': 'Contact',
    'supervisor.verified': 'Verified supervisor',
    'trust.securePayment': 'Secure payment',
    'trust.clearPrice': 'Final price, all inclusive',
    'trust.humanHelp': 'A specialist helps you choose',
    'trust.support': 'Support around the clock',
    'state.loading': 'Loading…',
    'state.searching': 'Finding the best options for you…',
    'state.noResults.title': 'No matching results',
    'state.noResults.text': 'We could not find flights with these details. Try another date or remove a filter.',
    'state.noResults.action': 'Change search',
    'state.noBookings.title': 'No bookings yet',
    'state.noBookings.text': 'When you book your first trip it will appear here with every detail.',
    'state.noBookings.action': 'Start searching',
    'state.error.title': 'We could not complete that',
    'state.error.text': 'Something went wrong while connecting. Your details are saved and nothing has been charged.',
    'state.error.action': 'Try again',
    'state.error.next': 'If it happens again, talk to our team and we will complete the booking for you.',
    'state.empty.notifications': 'No notifications',
    'action.retry': 'Try again',
    'action.help': 'Talk to a specialist',
    'action.cancel': 'Cancel',
    'action.confirm': 'Confirm',
    'a11y.skip': 'Skip to content',
    'a11y.loading': 'Loading content',
    'lang.switch': 'العربية',
    'currency': 'SDG',
  },
};

let current = 'ar';
const listeners = new Set();

/** Translate. Values may be functions for pluralisation/interpolation. */
export function t(key, ...args) {
  const table = STRINGS[current] ?? STRINGS.ar;
  const value = table[key] ?? STRINGS.ar[key] ?? key;
  return typeof value === 'function' ? value(...args) : value;
}

export const getLocale = () => current;
export const getDir = () => LOCALES[current].dir;

/** Set the language AND the direction of the document in one move. */
export function setLocale(code) {
  if (!LOCALES[code]) return;
  current = code;
  const locale = LOCALES[code];

  document.documentElement.lang = locale.htmlLang;
  document.documentElement.dir = locale.dir;

  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* private mode */ }

  listeners.forEach((fn) => fn(code));
  document.dispatchEvent(new CustomEvent('no:localechange', { detail: { locale: code, dir: locale.dir } }));
}

export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Restore the visitor's choice, else follow the document, else Arabic. */
export function initLocale() {
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }
  const fromDoc = document.documentElement.lang?.startsWith('en') ? 'en' : 'ar';
  setLocale(saved && LOCALES[saved] ? saved : fromDoc);
}

/** Apply translations to any element carrying data-i18n. */
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-label]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.i18nLabel));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder));
  });
}
