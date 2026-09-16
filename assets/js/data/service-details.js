/* ============================================================================
   DATA / SERVICE DETAILS — Stage 10.6. What each service page says.

   The registry (data/services.js) is the identity of a service: id, slug,
   category, kind, title, short line, image. THIS file is its page content.
   getServiceDetail(slug) merges the two, so the template reads one record.

   Shape of a detail entry — every human-readable field Ar + En:

     description   { ar, en }          the overview paragraph (one, short)
     points        [{ ar, en }]        optional supporting points under it
     features      [{ icon, titleAr/En, textAr/En }]   "what we help with"
     benefits      [BENEFIT ids]       picked from SERVICE_BENEFITS below
     steps         [{ titleAr/En, textAr/En }]         3–5, in order
     requirements  { items: [{ icon, textAr/En }], official: true|false }
                   items are what WE ask the customer for — traveller data,
                   trip data, a passport copy. `official: true` means the
                   destination's own rules apply on top and are explained
                   during the request; nothing here states an official rule.
     related       [service ids]       shown as compact cards
     primaryAction 'book' | 'request' | 'expert'
                   book    → the booking entry, "احجز الآن"
                   request → the booking entry, "ابدأ طلبك"
                   expert  → the help centre,   "تحدث مع خبير"

   Nothing invented: no prices, partners, airlines, hospitals, universities,
   guarantees or official requirements. Where the business has not supplied
   a fact, the page says the detail is explained during the request.
   ========================================================================= */

/* The brand's established positioning, as concise cards. §9 */
export const SERVICE_BENEFITS = {
  trust:      { id: 'trust',      icon: 'no-shield',
                titleAr: 'الثقة',          titleEn: 'Trust',
                textAr: 'السعر والشروط مكتوبة قبل أن تدفع، لا بعد ذلك.',
                textEn: 'Price and terms in writing before you pay, not after.' },
  choice:     { id: 'choice',     icon: 'no-sparkle',
                titleAr: 'الاختيار المناسب', titleEn: 'The right choice',
                textAr: 'نرشّح لك الخيار الذي يناسب احتياجك ونقول لماذا.',
                textEn: 'We flag the option that fits your need, and say why.' },
  simplicity: { id: 'simplicity', icon: 'no-check-circle',
                titleAr: 'البساطة',        titleEn: 'Simplicity',
                textAr: 'خطوات قليلة وواضحة، بلا تعقيد وبلا مفاجآت.',
                textEn: 'A few clear steps, with no complication and no surprises.' },
  speed:      { id: 'speed',      icon: 'no-processing',
                titleAr: 'السرعة',         titleEn: 'Speed',
                textAr: 'نبدأ في طلبك فور وصوله ونخبرك بكل خطوة.',
                textEn: 'We start on your request as soon as it arrives and tell you at every step.' },
  human:      { id: 'human',      icon: 'no-supervisor',
                titleAr: 'الدعم البشري',   titleEn: 'Human support',
                textAr: 'مختص حقيقي يراجع طلبك ويجيبك بالعربية أو الإنجليزية.',
                textEn: 'A real specialist reviews your request and answers you in Arabic or English.' },
};

/* Shared "what we ask you for" items. Reused, never re-typed. */
const ASK = {
  traveller: { icon: 'no-users',     textAr: 'بيانات المسافرين كما في جواز السفر', textEn: 'Traveller details as they appear in the passport' },
  trip:      { icon: 'no-calendar',  textAr: 'الوجهة والتواريخ وعدد المسافرين',     textEn: 'Destination, dates and number of travellers' },
  passport:  { icon: 'no-documents', textAr: 'صورة من جواز السفر',                  textEn: 'A copy of the passport' },
  ticket:    { icon: 'no-ticket',    textAr: 'رقم الحجز أو التذكرة الحالية',        textEn: 'Your current booking or ticket number' },
  contact:   { icon: 'no-phone',     textAr: 'وسيلة تواصل نصل بك عليها',            textEn: 'A way to reach you' },
  purpose:   { icon: 'no-info',      textAr: 'الغرض من السفر وأي مستندات لديك بالفعل', textEn: 'The purpose of travel and any documents you already have' },
};

/* The generic journey; services override individual steps where theirs differ. */
const STEPS = {
  need:    { titleAr: 'حدد احتياجك',            titleEn: 'Tell us what you need',
             textAr: 'الوجهة والتاريخ ومن يسافر، أو مجرد فكرة.', textEn: 'Destination, date and who is travelling. Or just an idea.' },
  choose:  { titleAr: 'نساعدك في اختيار الأنسب', titleEn: 'We help you choose',
             textAr: 'الخيارات جنباً إلى جنب، ونرشّح واحداً ونقول لماذا.', textEn: 'Options side by side. We flag one and say why.' },
  review:  { titleAr: 'راجع التفاصيل',           titleEn: 'Review the details',
             textAr: 'السعر والشروط مكتوبة قبل أن تؤكد.', textEn: 'Price and terms in writing before you confirm.' },
  book:    { titleAr: 'أكمل الحجز أو الطلب',     titleEn: 'Complete the booking or request',
             textAr: 'ادفع بأمان أو أرسل طلبك، ويصلك التأكيد.', textEn: 'Pay securely or send your request, and the confirmation follows.' },
  follow:  { titleAr: 'تابع رحلتك',              titleEn: 'Track your trip',
             textAr: 'تذكرتك ومستنداتك في حسابك، ومختص معك حتى العودة.', textEn: 'Your ticket and documents in your account, and a specialist with you until you are back.' },
};

export const SERVICE_DETAILS = {
  flights: {
    description: { ar: 'نبحث بين شركات الطيران التي نتعامل معها، ونعرض لك الخيارات بالسعر والمدة وعدد التوقفات والأمتعة، ونرشّح الأنسب لوقتك وميزانيتك. التذكرة تُصدر باسمك وتصلك في حسابك.',
                   en: 'We search across the airlines we work with, show you the options by price, duration, stops and baggage, and flag the one that fits your time and budget. The ticket is issued in your name and lands in your account.' },
    points: [
      { ar: 'ذهاب فقط، ذهاب وعودة، أو وجهات متعددة', en: 'One way, return or multi-city' },
      { ar: 'الأمتعة وشروط التعديل واضحة على كل خيار', en: 'Baggage and change terms shown on every option' },
      { ar: 'إصدار فوري بعد الدفع', en: 'Issued right after payment' },
    ],
    features: [
      { icon: 'no-sparkle',     titleAr: 'اختيار الرحلة المناسبة', titleEn: 'Choosing the right flight',   textAr: 'نرشّح خياراً يناسب وقتك وميزانيتك ونقول لماذا.', textEn: 'We flag an option that fits your time and budget, and say why.' },
      { icon: 'no-filter',      titleAr: 'مقارنة الخيارات',        titleEn: 'Comparing the options',        textAr: 'السعر والمدة والتوقفات والأمتعة جنباً إلى جنب.', textEn: 'Price, duration, stops and baggage side by side.' },
      { icon: 'no-ticket',      titleAr: 'إصدار التذاكر',          titleEn: 'Issuing the tickets',          textAr: 'تصدر باسمك فور الدفع وتصلك في حسابك.', textEn: 'Issued in your name right after payment, into your account.' },
      { icon: 'no-ticket-edit', titleAr: 'تعديل أو إلغاء التذاكر', titleEn: 'Changing or cancelling',       textAr: 'نوضّح الرسوم قبل أي خطوة ثم ننفّذ.', textEn: 'We explain any fee before we act.' },
    ],
    benefits: ['choice', 'trust', 'speed', 'human'],
    steps: [STEPS.need, STEPS.choose, STEPS.review, STEPS.book, STEPS.follow],
    requirements: { items: [ASK.traveller, ASK.trip, ASK.contact], official: false },
    related: ['hotels', 'visa', 'transport'],
    primaryAction: 'book',
  },

  hotels: {
    description: { ar: 'نرشّح لك إقامة قريبة من وجهتك تناسب عدد أفراد أسرتك وميزانيتك، مع سعر واضح وشروط إلغاء مفهومة قبل أن تحجز.',
                   en: 'We suggest a stay close to where you are going that suits your family size and budget, with a clear price and cancellation terms you understand before you book.' },
    points: [
      { ar: 'غرف عائلية ومتعددة الأسرّة', en: 'Family and multi-bed rooms' },
      { ar: 'شروط الإلغاء مكتوبة على كل خيار', en: 'Cancellation terms written on every option' },
    ],
    features: [
      { icon: 'no-hotel',    titleAr: 'اختيار الفندق',           titleEn: 'Choosing the hotel',          textAr: 'قرب الموقع وحجم الغرفة والإفطار، حسب احتياجك.', textEn: 'Location, room size and breakfast, by what you need.' },
      { icon: 'no-filter',   titleAr: 'مقارنة خيارات الإقامة',   titleEn: 'Comparing stays',              textAr: 'السعر لليلة والمسافة والشروط جنباً إلى جنب.', textEn: 'Price per night, distance and terms side by side.' },
      { icon: 'no-booking',  titleAr: 'الحجز',                   titleEn: 'Booking',                      textAr: 'تأكيد فوري وقسيمة الحجز في حسابك.', textEn: 'Instant confirmation and the voucher in your account.' },
    ],
    benefits: ['trust', 'choice', 'simplicity'],
    steps: [STEPS.need, STEPS.choose, STEPS.review, STEPS.book],
    requirements: { items: [ASK.trip, ASK.traveller, ASK.contact], official: false },
    related: ['flights', 'transport', 'packages'],
    primaryAction: 'book',
  },

  visa: {
    description: { ar: 'نخبرك بما تحتاجه لوجهتك، نراجع أوراقك قبل التقديم، ونتابع الطلب معك حتى الرد. المتطلبات الرسمية تختلف حسب الوجهة والجنسية، ونوضّحها لك أثناء الطلب.',
                   en: 'We tell you what your destination needs, check your papers before you apply, and follow the application with you until the answer. Official requirements vary by destination and nationality; we explain them during your request.' },
    features: [
      { icon: 'no-info',      titleAr: 'معرفة المتطلبات',  titleEn: 'Knowing the requirements', textAr: 'ما تحتاجه لوجهتك بالضبط، قبل أن تبدأ.', textEn: 'Exactly what your destination needs, before you start.' },
      { icon: 'no-documents', titleAr: 'تجهيز الطلب',      titleEn: 'Preparing the application', textAr: 'نراجع أوراقك ونخبرك بما ينقصك.', textEn: 'We check your papers and tell you what is missing.' },
      { icon: 'no-processing', titleAr: 'متابعة الإجراءات', titleEn: 'Following the process',   textAr: 'نتابع الطلب ونخبرك بكل تحديث.', textEn: 'We follow the application and tell you every update.' },
    ],
    benefits: ['simplicity', 'human', 'speed'],
    steps: [
      STEPS.need,
      { titleAr: 'نوضّح لك المتطلبات', titleEn: 'We explain the requirements', textAr: 'قائمة بما تحتاجه لوجهتك وجنسيتك.', textEn: 'A list of what your destination and nationality need.' },
      { titleAr: 'نراجع أوراقك',       titleEn: 'We check your papers',        textAr: 'قبل التقديم، حتى لا يتأخر سفرك.', textEn: 'Before you apply, so your travel is not delayed.' },
      { titleAr: 'نتابع الطلب معك',    titleEn: 'We follow it with you',       textAr: 'حتى يصلك الرد.', textEn: 'Until the answer arrives.' },
    ],
    requirements: { items: [ASK.passport, ASK.purpose, ASK.contact], official: true },
    related: ['flights', 'hotels', 'medical'],
    primaryAction: 'request',
  },

  packages: {
    description: { ar: 'برنامج سياحي يُبنى حول أيامك وميزانيتك ومن يسافر معك، لا قالب جاهز. نجمع لك الطيران والإقامة والتنقّل في طلب واحد.',
                   en: 'A tourism programme built around your days, your budget and who is travelling with you, not a fixed template. Flights, stay and transfers in one request.' },
    points: [
      { ar: 'للعائلة أو للمجموعة', en: 'For a family or a group' },
      { ar: 'المدة والوجهة والميزانية من عندك', en: 'You set the length, destination and budget' },
    ],
    features: [
      { icon: 'no-tourism',   titleAr: 'تصميم البرنامج',   titleEn: 'Designing the programme', textAr: 'حسب عدد الأيام والميزانية.', textEn: 'Around the number of days and the budget.' },
      { icon: 'no-flight',    titleAr: 'الطيران والإقامة', titleEn: 'Flights and stay',        textAr: 'مرتّبان معاً في طلب واحد.', textEn: 'Arranged together in one request.' },
      { icon: 'no-transport', titleAr: 'التنقّل',          titleEn: 'Getting around',          textAr: 'استقبال وتنقّلات في الوجهة عند الحاجة.', textEn: 'Pickups and transfers at the destination when needed.' },
    ],
    benefits: ['choice', 'simplicity', 'human'],
    steps: [STEPS.need, STEPS.choose, STEPS.review, STEPS.book, STEPS.follow],
    requirements: { items: [ASK.trip, ASK.traveller, ASK.contact], official: false },
    related: ['flights', 'hotels', 'transport'],
    primaryAction: 'request',
  },

  umrah: {
    description: { ar: 'برامج عمرة بإقامة قريبة من الحرم، تُرتّب حسب الموسم والمدة التي تناسبك، مع متابعة من فريقنا طوال الرحلة.',
                   en: 'Umrah programmes with accommodation near the Haram, arranged around the season and the length of stay that suits you, with our team following through the journey.' },
    features: [
      { icon: 'no-umrah',     titleAr: 'البرنامج والموسم',  titleEn: 'Programme and season',   textAr: 'المدة والتوقيت حسب ما يناسبك.', textEn: 'Length and timing around what suits you.' },
      { icon: 'no-hotel',     titleAr: 'الإقامة',           titleEn: 'Accommodation',           textAr: 'قريبة من الحرم قدر الإمكان.', textEn: 'As close to the Haram as possible.' },
      { icon: 'no-transport', titleAr: 'التنقّلات',         titleEn: 'Transfers',               textAr: 'بين المطار ومكة والمدينة.', textEn: 'Between the airport, Makkah and Madinah.' },
      { icon: 'no-supervisor', titleAr: 'المتابعة',         titleEn: 'Support throughout',      textAr: 'فريقنا معك قبل السفر وأثناءه.', textEn: 'Our team with you before and during the trip.' },
    ],
    benefits: ['trust', 'human', 'simplicity'],
    steps: [STEPS.need, STEPS.choose, STEPS.review, STEPS.book, STEPS.follow],
    requirements: { items: [ASK.passport, ASK.traveller, ASK.contact], official: true },
    related: ['flights', 'hotels', 'transport'],
    primaryAction: 'request',
  },

  transport: {
    description: { ar: 'استقبال من المطار وتنقّلات بسائق داخل الوجهة، بموعد وسعر متفق عليهما قبل السفر.',
                   en: 'Airport pickups and transfers with a driver at the destination, at a time and price agreed before you travel.' },
    features: [
      { icon: 'no-location',  titleAr: 'الاستقبال من المطار', titleEn: 'Airport pickup',    textAr: 'سائق بانتظارك عند الوصول.', textEn: 'A driver waiting when you land.' },
      { icon: 'no-transport', titleAr: 'التنقّلات',           titleEn: 'Transfers',         textAr: 'بين المدن أو داخلها، حسب برنامجك.', textEn: 'Between cities or within one, around your programme.' },
      { icon: 'no-users',     titleAr: 'للعائلة والمجموعات',  titleEn: 'Families and groups', textAr: 'مركبات تناسب عدد المسافرين والأمتعة.', textEn: 'Vehicles sized to the travellers and their luggage.' },
    ],
    benefits: ['trust', 'simplicity', 'speed'],
    steps: [STEPS.need, STEPS.review, STEPS.book],
    requirements: { items: [ASK.trip, ASK.traveller, ASK.contact], official: false },
    related: ['flights', 'hotels', 'umrah'],
    primaryAction: 'request',
  },

  medical: {
    description: { ar: 'ننسّق طلب السفر العلاجي كاملاً: الموعد والتأشيرة والإقامة والتنقّل، ونتابع معك حتى العودة. التفاصيل الطبية تبقى بينك وبين جهة العلاج.',
                   en: 'We coordinate the whole medical trip: the appointment, the visa, the stay and getting around, and follow up with you until you return. Medical details stay between you and the treating provider.' },
    features: [
      { icon: 'no-medical',   titleAr: 'تنظيم طلب السفر العلاجي', titleEn: 'Organising the medical trip', textAr: 'من الموعد إلى العودة، في طلب واحد.', textEn: 'From the appointment to the return, in one request.' },
      { icon: 'no-booking',   titleAr: 'تنسيق احتياجات الرحلة',   titleEn: 'Coordinating the trip needs', textAr: 'الطيران والتأشيرة والإقامة والتنقّل معاً.', textEn: 'Flights, visa, stay and transfers together.' },
      { icon: 'no-support',   titleAr: 'الدعم أثناء الإجراءات',   titleEn: 'Support during the process',  textAr: 'مختص يتابع معك كل خطوة.', textEn: 'A specialist follows every step with you.' },
    ],
    benefits: ['human', 'trust', 'simplicity'],
    steps: [
      STEPS.need,
      { titleAr: 'نراجع الطلب معك',  titleEn: 'We review the request with you', textAr: 'الوجهة والموعد وما تحتاجه الرحلة.', textEn: 'Destination, appointment and what the trip needs.' },
      STEPS.review, STEPS.book, STEPS.follow,
    ],
    requirements: { items: [ASK.passport, ASK.purpose, ASK.contact], official: true },
    related: ['flights', 'hotels', 'visa'],
    primaryAction: 'expert',
  },

  study: {
    description: { ar: 'التأشيرة والتذكرة والسكن الأول لطلاب الخارج، مرتّبة معاً. متطلبات الجامعة والدولة تختلف، ونوضّحها لك أثناء الطلب.',
                   en: 'Visa, ticket and first accommodation for students going abroad, arranged together. University and country requirements vary; we explain them during your request.' },
    features: [
      { icon: 'no-visa',   titleAr: 'تأشيرة الدراسة',  titleEn: 'Study visa',           textAr: 'نراجع أوراقك ونتابع الطلب.', textEn: 'We check your papers and follow the application.' },
      { icon: 'no-flight', titleAr: 'التذكرة',         titleEn: 'The ticket',           textAr: 'بأنسب سعر لتاريخ بداية الدراسة.', textEn: 'At the right price for your start date.' },
      { icon: 'no-hotel',  titleAr: 'السكن الأول',     titleEn: 'First accommodation',  textAr: 'إقامة للأسابيع الأولى حتى تستقر.', textEn: 'A place for the first weeks until you settle.' },
    ],
    benefits: ['simplicity', 'human', 'trust'],
    steps: [STEPS.need, STEPS.choose, STEPS.review, STEPS.book, STEPS.follow],
    requirements: { items: [ASK.passport, ASK.purpose, ASK.contact], official: true },
    related: ['visa', 'flights', 'hotels'],
    primaryAction: 'request',
  },

  work: {
    description: { ar: 'ترتيبات السفر للعمل لشخص واحد أو لفريق كامل: التذاكر والإقامة والتأشيرة عند الحاجة، بمواعيد تناسب جدول العمل.',
                   en: 'Work travel arrangements for one person or a whole team: tickets, stay and visa when needed, at times that fit the work schedule.' },
    features: [
      { icon: 'no-flight', titleAr: 'التذاكر',          titleEn: 'Tickets',            textAr: 'مواعيد تناسب جدول العمل.', textEn: 'Times that fit the work schedule.' },
      { icon: 'no-hotel',  titleAr: 'الإقامة',          titleEn: 'Accommodation',      textAr: 'قريبة من مكان العمل.', textEn: 'Close to the place of work.' },
      { icon: 'no-users',  titleAr: 'للفرق',            titleEn: 'For teams',          textAr: 'حجز واحد لعدة مسافرين.', textEn: 'One booking for several travellers.' },
    ],
    benefits: ['speed', 'simplicity', 'trust'],
    steps: [STEPS.need, STEPS.choose, STEPS.review, STEPS.book],
    requirements: { items: [ASK.traveller, ASK.trip, ASK.contact], official: true },
    related: ['flights', 'hotels', 'visa'],
    primaryAction: 'request',
  },

  groups: {
    description: { ar: 'سفر المجموعات والعائلات الكبيرة في حجز واحد: تذاكر على نفس الرحلة، إقامة متجاورة، وتنقّلات تكفي الجميع.',
                   en: 'Travel for groups and large families as one booking: tickets on the same flight, rooms close together, and transfers that fit everyone.' },
    features: [
      { icon: 'no-users',     titleAr: 'حجز واحد للمجموعة', titleEn: 'One booking for the group', textAr: 'الجميع على نفس الرحلة وبنفس الشروط.', textEn: 'Everyone on the same flight, on the same terms.' },
      { icon: 'no-hotel',     titleAr: 'إقامة متجاورة',     titleEn: 'Rooms close together',      textAr: 'غرف قريبة من بعضها في نفس المكان.', textEn: 'Rooms near each other in the same place.' },
      { icon: 'no-transport', titleAr: 'تنقّلات للجميع',    titleEn: 'Transfers for all',         textAr: 'مركبات تكفي المجموعة وأمتعتها.', textEn: 'Vehicles sized to the group and its luggage.' },
    ],
    benefits: ['simplicity', 'human', 'trust'],
    steps: [STEPS.need, STEPS.choose, STEPS.review, STEPS.book, STEPS.follow],
    requirements: { items: [ASK.trip, ASK.traveller, ASK.contact], official: false },
    related: ['flights', 'hotels', 'transport'],
    primaryAction: 'request',
  },

  issue: {
    description: { ar: 'إصدار التذاكر على كل شركات الطيران التي نتعامل معها، لحجز اخترته بنفسك أو رتّبناه لك. التذكرة تصدر باسمك وتصلك في حسابك.',
                   en: 'Ticket issuing across every airline we work with, for a booking you chose yourself or one we arranged. The ticket is issued in your name and lands in your account.' },
    features: [
      { icon: 'no-ticket',  titleAr: 'الإصدار',       titleEn: 'Issuing',             textAr: 'باسمك، فور الدفع.', textEn: 'In your name, right after payment.' },
      { icon: 'no-check',   titleAr: 'مراجعة البيانات', titleEn: 'Checking the details', textAr: 'الأسماء والتواريخ قبل الإصدار.', textEn: 'Names and dates before issuing.' },
      { icon: 'no-booking', titleAr: 'في حسابك',      titleEn: 'In your account',     textAr: 'التذكرة ومستنداتها في مكان واحد.', textEn: 'The ticket and its documents in one place.' },
    ],
    benefits: ['speed', 'trust', 'simplicity'],
    steps: [STEPS.need, STEPS.review, STEPS.book],
    requirements: { items: [ASK.traveller, ASK.trip, ASK.contact], official: false },
    related: ['change', 'cancel', 'flights'],
    primaryAction: 'request',
  },

  change: {
    description: { ar: 'نعدّل موعد رحلتك أو مسارها، ونوضّح لك رسوم شركة الطيران وفرق السعر قبل أي خطوة. لا تعديل قبل موافقتك.',
                   en: 'We change your flight date or routing, and explain the airline fee and any fare difference before we act. Nothing changes without your approval.' },
    features: [
      { icon: 'no-ticket-edit', titleAr: 'تعديل الموعد',   titleEn: 'Changing the date',     textAr: 'إلى تاريخ يناسبك، حسب توفر المقاعد.', textEn: 'To a date that suits you, subject to availability.' },
      { icon: 'no-price-tag',   titleAr: 'توضيح الرسوم',   titleEn: 'Explaining the fees',   textAr: 'رسوم الشركة وفرق السعر مكتوبان قبل التنفيذ.', textEn: 'The airline fee and fare difference in writing before we act.' },
      { icon: 'no-check',       titleAr: 'التنفيذ بموافقتك', titleEn: 'Done on your approval', textAr: 'ثم تصلك التذكرة المعدّلة في حسابك.', textEn: 'Then the updated ticket lands in your account.' },
    ],
    benefits: ['trust', 'speed', 'human'],
    steps: [
      { titleAr: 'أرسل بيانات تذكرتك', titleEn: 'Send your ticket details', textAr: 'رقم الحجز والتعديل الذي تريده.', textEn: 'Your booking number and the change you want.' },
      { titleAr: 'نوضّح الرسوم',       titleEn: 'We explain the fees',      textAr: 'رسوم الشركة وفرق السعر إن وجد.', textEn: 'The airline fee and any fare difference.' },
      { titleAr: 'ننفّذ بموافقتك',     titleEn: 'We act on your approval',  textAr: 'وتصلك التذكرة المعدّلة.', textEn: 'And the updated ticket reaches you.' },
    ],
    requirements: { items: [ASK.ticket, ASK.contact], official: false },
    related: ['cancel', 'issue', 'flights'],
    primaryAction: 'request',
  },

  cancel: {
    description: { ar: 'نلغي تذكرتك ونوضّح لك ما يُسترد وما لا يُسترد حسب شروط التذكرة، قبل أن تؤكد الإلغاء.',
                   en: 'We cancel your ticket and explain what is refunded and what is not under the ticket’s terms, before you confirm the cancellation.' },
    features: [
      { icon: 'no-cancelled', titleAr: 'الإلغاء',          titleEn: 'Cancelling',            textAr: 'حسب شروط التذكرة التي اشتريتها.', textEn: 'Under the terms of the ticket you bought.' },
      { icon: 'no-price-tag', titleAr: 'توضيح الاسترداد',  titleEn: 'Explaining the refund', textAr: 'ما يُسترد وما لا يُسترد، مكتوباً.', textEn: 'What comes back and what does not, in writing.' },
      { icon: 'no-check',     titleAr: 'التنفيذ بموافقتك', titleEn: 'Done on your approval', textAr: 'لا إلغاء قبل تأكيدك.', textEn: 'No cancellation before you confirm.' },
    ],
    benefits: ['trust', 'simplicity', 'human'],
    steps: [
      { titleAr: 'أرسل بيانات تذكرتك', titleEn: 'Send your ticket details', textAr: 'رقم الحجز أو التذكرة.', textEn: 'Your booking or ticket number.' },
      { titleAr: 'نوضّح الاسترداد',    titleEn: 'We explain the refund',    textAr: 'حسب شروط التذكرة.', textEn: 'Under the ticket terms.' },
      { titleAr: 'ننفّذ بموافقتك',     titleEn: 'We act on your approval',  textAr: 'ويصلك تأكيد الإلغاء.', textEn: 'And the cancellation confirmation reaches you.' },
    ],
    requirements: { items: [ASK.ticket, ASK.contact], official: false },
    related: ['change', 'issue', 'flights'],
    primaryAction: 'request',
  },
};
