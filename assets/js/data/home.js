/* ============================================================================
   DATA / HOME — Stage 10.4. Every record the homepage renders.

   The homepage is a composition of RECORDS, not a template with copy in it.
   Each list below is the shape an Operations or Admin surface will edit
   later (§20 of the 10.4 brief); the values are the launch content.

   Two rules that are enforced by shape, not by discipline:

   1. Bilingual by construction. Every human-readable field comes as an
      `…Ar` / `…En` pair and is read through pick(). A record that lacks one
      side is a bug the language audit catches.
   2. Nothing invented. Offers carry `price: null` and `validUntil: null`
      until the business supplies real figures; the card renders neither row
      until then. Destination descriptors name what people go there FOR (the
      services we sell), never a ranking or a statistic.
   ========================================================================= */

/* --------------------------------------------------------------------------
   HERO — §04. One message, one supporting line.
   ----------------------------------------------------------------------- */
export const HOME_HERO = {
  overlineAr: 'نمبرون للسفر و السياحة',
  overlineEn: 'Number One Travel & Tourism',
  titleAr: 'سافر بثقة. اختر الأنسب.',
  titleEn: 'Travel with confidence. Choose what fits.',
  leadAr: 'نساعدك على إيجاد خيار السفر الذي يناسب احتياجك وميزانيتك — لا مجرد قائمة نتائج.',
  leadEn: 'We help you find the travel option that fits your needs and your budget, not just a list of results.',
  /* The photography slot. `src: null` renders the neutral placeholder that
     reserves the same aspect ratio; drop the approved image in here. §04 */
  media: {
    src: null,
    altAr: 'عائلة تستعد للسفر',
    altEn: 'A family getting ready to travel',
    ratio: '4 / 5',
  },
  /* Three short reassurances under the headline. Reuses the trust keys the
     foundation already ships, so the wording matches the rest of the site. */
  trust: ['trust.clearPrice', 'trust.humanHelp', 'trust.securePayment'],
};

/* --------------------------------------------------------------------------
   SERVICES — §05. The eleven lines the brief names, in the brief's order.
   `href` values are the routes the header's mega menu already uses, so the
   homepage and the navigation cannot point at different pages.
   `featured` marks the six shown before "show all services" (progressive
   disclosure, §05) — change the flag, not the component.
   ----------------------------------------------------------------------- */
export const HOME_SERVICES = [
  { id: 'flights',  icon: 'no-flight',      href: 'services/flights/',       featured: true,
    titleAr: 'تذاكر طيران',          titleEn: 'Flight tickets',
    descAr: 'نقارن بين شركات الطيران ونساعدك تختار التذكرة الأنسب لوقتك وميزانيتك.',
    descEn: 'We compare the airlines and help you pick the ticket that fits your time and budget.' },
  { id: 'visa',     icon: 'no-visa',        href: 'services/visa/',          featured: true,
    titleAr: 'تأشيرات',              titleEn: 'Visas',
    descAr: 'نراجع أوراقك قبل التقديم ونخبرك بما ينقصك.',
    descEn: 'We check your documents before you apply and tell you what is missing.' },
  { id: 'medical',  icon: 'no-medical',     href: 'services/medical/',       featured: true,
    titleAr: 'سفر علاجي',            titleEn: 'Medical travel',
    descAr: 'ننسّق الموعد الطبي والتأشيرة والإقامة معاً.',
    descEn: 'We arrange the medical appointment, the visa and the stay together.' },
  { id: 'hotels',   icon: 'no-hotel',       href: 'services/hotels/',        featured: true,
    titleAr: 'حجوزات فنادق',         titleEn: 'Hotel bookings',
    descAr: 'إقامة قريبة من وجهتك بأسعار واضحة وشروط إلغاء مفهومة.',
    descEn: 'A stay close to where you are going, with clear prices and cancellation terms.' },
  { id: 'tourism',  icon: 'no-tourism',     href: 'services/packages/',      featured: true,
    titleAr: 'سياحة',                titleEn: 'Tourism',
    descAr: 'برامج سياحية تُصمَّم حسب عدد الأيام والميزانية.',
    descEn: 'Tourism programmes shaped around your days and your budget.' },
  { id: 'umrah',    icon: 'no-umrah',       href: 'services/umrah/',         featured: true,
    titleAr: 'عمرة',                 titleEn: 'Umrah',
    descAr: 'برامج عمرة بإقامة قريبة من الحرم ومتابعة طوال الرحلة.',
    descEn: 'Umrah programmes with accommodation near the Haram and support throughout.' },
  { id: 'groups',   icon: 'no-users',       href: 'services/groups/',
    titleAr: 'رحلات جماعية',         titleEn: 'Group trips',
    descAr: 'تنظيم سفر المجموعات والعائلات الكبيرة بحجز واحد.',
    descEn: 'Travel for groups and large families, arranged as one booking.' },
  { id: 'study',    icon: 'no-study',       href: 'services/study/',
    titleAr: 'سفر للدراسة',          titleEn: 'Study travel',
    descAr: 'التأشيرة والتذكرة والسكن الأول لطلاب الخارج.',
    descEn: 'Visa, ticket and first accommodation for students going abroad.' },
  { id: 'work',     icon: 'no-work',        href: 'services/work/',
    titleAr: 'سفر للعمل',            titleEn: 'Work travel',
    descAr: 'ترتيبات السفر للعمل، فردية أو لفرق كاملة.',
    descEn: 'Travel arrangements for work, for one person or a whole team.' },
  { id: 'change',   icon: 'no-ticket-edit', href: 'services/ticket-change/',
    titleAr: 'تعديل وإلغاء تذاكر',   titleEn: 'Change & cancel tickets',
    descAr: 'نعدّل موعدك أو نلغي تذكرتك ونوضّح لك الرسوم قبل أي خطوة.',
    descEn: 'We change your date or cancel your ticket, and explain any fee before we act.' },
  { id: 'issue',    icon: 'no-ticket',      href: 'services/ticket-issue/',
    titleAr: 'إصدار تذاكر',          titleEn: 'Ticket issuing',
    descAr: 'إصدار التذاكر على كل شركات الطيران التي نتعامل معها.',
    descEn: 'Ticket issuing across every airline we work with.' },
];

/* --------------------------------------------------------------------------
   WHY NUMBER ONE — §06. Four values, each one sentence. No numbers, no
   awards, no superlatives that would need evidence.
   ----------------------------------------------------------------------- */
export const HOME_VALUES = [
  { id: 'trust',      icon: 'no-shield',
    titleAr: 'الثقة',            titleEn: 'Trust',
    textAr: 'السعر الذي تراه هو السعر الذي تدفعه، والشروط مكتوبة قبل الحجز لا بعده.',
    textEn: 'The price you see is the price you pay, and the terms are written before you book, not after.' },
  { id: 'choice',     icon: 'no-sparkle',
    titleAr: 'الاختيار الذكي',   titleEn: 'Smart choice',
    textAr: 'لا نعرض لك كل شيء ونتركك؛ نرشّح الخيار الأنسب لاحتياجك ونقول لماذا.',
    textEn: 'We do not show you everything and walk away. We flag the option that fits your need, and say why.' },
  { id: 'simplicity', icon: 'no-check-circle',
    titleAr: 'البساطة',          titleEn: 'Simplicity',
    textAr: 'خطوات قليلة وواضحة، من البحث إلى التذكرة، بلا تعقيد وبلا مفاجآت.',
    textEn: 'A few clear steps from search to ticket, with no complication and no surprises.' },
  { id: 'complete',   icon: 'no-booking',
    titleAr: 'الرحلة المتكاملة', titleEn: 'The complete journey',
    textAr: 'الطيران والإقامة والتأشيرة والمتابعة في مكان واحد ومع فريق واحد.',
    textEn: 'Flights, stay, visa and follow-up in one place, with one team.' },
];

/* --------------------------------------------------------------------------
   HELP ME CHOOSE — §07. The priorities a traveller can sort by. `sort` is
   the value Stage 11 receives with the search; the homepage only carries it.
   ----------------------------------------------------------------------- */
export const HOME_PRIORITIES = [
  { id: 'price',    sort: 'price',    icon: 'no-price-tag',
    labelAr: 'السعر',                 labelEn: 'Price',
    hintAr: 'الأرخص أولاً',           hintEn: 'Cheapest first' },
  { id: 'stops',    sort: 'stops',    icon: 'no-flight',
    labelAr: 'أقل عدد من التوقفات',   labelEn: 'Fewest stops',
    hintAr: 'المباشر أولاً',          hintEn: 'Direct first' },
  { id: 'duration', sort: 'duration', icon: 'no-pending',
    labelAr: 'أقصر مدة',              labelEn: 'Shortest duration',
    hintAr: 'أقل وقت في الطريق',      hintEn: 'Least time in transit' },
  { id: 'family',   sort: 'family',   icon: 'no-users',
    labelAr: 'الأنسب للعائلة',        labelEn: 'Best for families',
    hintAr: 'مواعيد مريحة وأمتعة تكفي', hintEn: 'Comfortable times and enough baggage' },
  { id: 'value',    sort: 'value',    icon: 'no-sparkle',
    labelAr: 'أفضل قيمة',             labelEn: 'Best value',
    hintAr: 'التوازن بين السعر والراحة', hintEn: 'The balance of price and comfort' },
];

/* --------------------------------------------------------------------------
   DESTINATIONS — §08. Routes match the header's destinations menu. The
   descriptor says what people travel there FOR (the services we sell) —
   never "most popular", never a count.
   `image.src: null` renders the neutral placeholder at the card's ratio.
   ----------------------------------------------------------------------- */
export const HOME_DESTINATIONS = [
  { id: 'jed', href: 'destinations/jeddah/',
    nameAr: 'جدة',        nameEn: 'Jeddah',
    descAr: 'بوابة الحرمين',            descEn: 'Gateway to the Holy Cities',
    image: { src: null, altAr: 'جدة', altEn: 'Jeddah' } },
  { id: 'mkk', href: 'destinations/makkah/',
    nameAr: 'مكة المكرمة', nameEn: 'Makkah',
    descAr: 'عمرة وزيارة',              descEn: 'Umrah and visits',
    image: { src: null, altAr: 'مكة المكرمة', altEn: 'Makkah' } },
  { id: 'dxb', href: 'destinations/dubai/',
    nameAr: 'دبي',        nameEn: 'Dubai',
    descAr: 'عمل وتسوق وعائلة',         descEn: 'Business, shopping and family',
    image: { src: null, altAr: 'دبي', altEn: 'Dubai' } },
  { id: 'cai', href: 'destinations/cairo/',
    nameAr: 'القاهرة',    nameEn: 'Cairo',
    descAr: 'علاج ودراسة وزيارة',       descEn: 'Treatment, study and visits',
    image: { src: null, altAr: 'القاهرة', altEn: 'Cairo' } },
  { id: 'ist', href: 'destinations/istanbul/',
    nameAr: 'إسطنبول',    nameEn: 'Istanbul',
    descAr: 'سياحة عائلية',             descEn: 'Family tourism',
    image: { src: null, altAr: 'إسطنبول', altEn: 'Istanbul' } },
  { id: 'nbo', href: 'destinations/nairobi/',
    nameAr: 'نيروبي',     nameEn: 'Nairobi',
    descAr: 'أعمال وطبيعة',             descEn: 'Business and nature',
    image: { src: null, altAr: 'نيروبي', altEn: 'Nairobi' } },
];

/* --------------------------------------------------------------------------
   OFFERS & PACKAGES — §09. Neutral records until the business publishes
   real ones. `price`, `validUntil` and `includes` are null/empty on purpose:
   offerCard() renders a row only when its value exists, so no price, date
   or inclusion can appear on the site that nobody approved.

   A real offer looks like:
     price: { amount: 1450000, currency: 'SDG', from: true, basisAr: 'لشخصين', basisEn: 'for two' },
     validUntil: '2026-12-31',
   ----------------------------------------------------------------------- */
export const HOME_OFFERS = [
  { id: 'istanbul-family', href: 'offers/istanbul-family/',
    destinationAr: 'إسطنبول', destinationEn: 'Istanbul',
    titleAr: 'باقة إسطنبول العائلية',     titleEn: 'Istanbul family package',
    descAr: 'برنامج عائلي يُصمَّم حسب عدد الأيام والميزانية.',
    descEn: 'A family programme shaped around your days and your budget.',
    image: { src: null, altAr: 'إسطنبول', altEn: 'Istanbul' },
    price: null, validUntil: null },
  { id: 'umrah', href: 'offers/umrah/',
    destinationAr: 'مكة المكرمة', destinationEn: 'Makkah',
    titleAr: 'باقة العمرة',                titleEn: 'Umrah package',
    descAr: 'برامج عمرة بحسب الموسم والمدة التي تناسبك.',
    descEn: 'Umrah programmes by season and by the length of stay that suits you.',
    image: { src: null, altAr: 'مكة المكرمة', altEn: 'Makkah' },
    price: null, validUntil: null },
  { id: 'dubai-break', href: 'offers/dubai-break/',
    destinationAr: 'دبي', destinationEn: 'Dubai',
    titleAr: 'عطلة قصيرة في دبي',          titleEn: 'Dubai short break',
    descAr: 'لأيام قليلة أو لعطلة نهاية أسبوع طويلة.',
    descEn: 'For a few days or a long weekend.',
    image: { src: null, altAr: 'دبي', altEn: 'Dubai' },
    price: null, validUntil: null },
];

/* --------------------------------------------------------------------------
   HOW WE HELP — §10. The four-step journey. Order carries meaning here, so
   the component numbers them.
   ----------------------------------------------------------------------- */
export const HOME_JOURNEY = [
  { id: 'need',    titleAr: 'حدد احتياجك',      titleEn: 'Tell us what you need',
    textAr: 'وجهة وتاريخ وعدد مسافرين، أو مجرد فكرة.',
    textEn: 'A destination, a date and who is travelling. Or just an idea.' },
  { id: 'compare', titleAr: 'ابحث وقارن',       titleEn: 'Search and compare',
    textAr: 'الخيارات جنباً إلى جنب، بالسعر والمدة والشروط.',
    textEn: 'Options side by side, by price, duration and terms.' },
  { id: 'choose',  titleAr: 'اختر الأنسب',      titleEn: 'Choose what fits',
    textAr: 'نرشّح لك خياراً ونقول لماذا؛ القرار قرارك.',
    textEn: 'We flag one option and say why. The decision is yours.' },
  { id: 'book',    titleAr: 'احجز وسافر بثقة',  titleEn: 'Book and travel with confidence',
    textAr: 'تذكرتك في حسابك، ومختص يتابع معك حتى العودة.',
    textEn: 'Your ticket in your account, and a specialist with you until you are back.' },
];

/* --------------------------------------------------------------------------
   HUMAN SUPPORT — §11. Digital booking plus human expertise. Contact
   channels are NOT here: they come from SUPPORT_CHANNELS in navigation.js,
   the one place the business's numbers live, and render only when set.
   ----------------------------------------------------------------------- */
export const HOME_SUPPORT = {
  digital: [
    { icon: 'no-search',       textAr: 'ابحث وقارن في أي وقت',            textEn: 'Search and compare at any time' },
    { icon: 'no-shield',       textAr: 'احجز وادفع بأمان',                 textEn: 'Book and pay securely' },
    { icon: 'no-booking',      textAr: 'تابع رحلتك ومستنداتك من حسابك',    textEn: 'Track your trip and documents from your account' },
  ],
  human: [
    { icon: 'no-supervisor',   textAr: 'مختص يراجع خيارك قبل أن تدفع',     textEn: 'A specialist reviews your choice before you pay' },
    { icon: 'no-chat',         textAr: 'يجيبك بالعربية أو الإنجليزية',      textEn: 'Answers you in Arabic or English' },
    { icon: 'no-support',      textAr: 'معك قبل السفر وأثناءه وبعده',       textEn: 'With you before, during and after the trip' },
  ],
};
