/* ============================================================================
   DATA / SAMPLES — demonstration records only.

   These exist so the style guide can show real components with real-shaped
   data, and so Stage 11 has a contract to build against. The SHAPES are the
   deliverable; the values are throwaway. Nothing in the UI may assume this
   file exists at runtime. §27 / §28
   ========================================================================= */

/** @typedef {'pending'|'processing'|'confirmed'|'completed'|'cancelled'|'failed'|'expired'} BookingStatus */

/**
 * FLIGHT OFFER — what the booking engine is expected to return per option.
 * `recommended` + `recommendedReason` are the "help me choose" hook (§18.5):
 * the engine, or a supervisor, marks one option and says WHY.
 */
export const FLIGHTS = [
  {
    id: 'FL-1001',
    airline: { code: 'EK', name: 'طيران الإمارات', nameEn: 'Emirates' },
    flightNumber: 'EK 852',
    recommended: true,
    recommendedReason: { ar: 'أقصر مدة سفر وأمتعة تكفي عائلة', en: 'Shortest journey and enough baggage for a family' },
    legs: [{
      from: { code: 'DXB', city: 'دبي', cityEn: 'Dubai' },
      to:   { code: 'JED', city: 'جدة',      cityEn: 'Jeddah' },
      departAt: '2026-11-12T08:40:00', arriveAt: '2026-11-12T11:05:00',
      durationMinutes: 145, stops: [],
    }],
    baggage: { checkedKg: 30, cabinKg: 7 },
    fare: { type: 'flex', refundable: true, changeable: true,
            labelAr: 'تذكرة مرنة — قابلة للتعديل والاسترداد',
            labelEn: 'Flexible fare — changeable and refundable' },
    price: { amount: 385, currency: 'USD', perPerson: true, taxesIncluded: true },
    seatsLeft: 4,
  },
  {
    id: 'FL-1002',
    airline: { code: 'TK', name: 'الخطوط التركية', nameEn: 'Turkish Airlines' },
    flightNumber: 'TK 678',
    recommended: false,
    legs: [{
      from: { code: 'DXB', city: 'دبي', cityEn: 'Dubai' },
      to:   { code: 'JED', city: 'جدة',      cityEn: 'Jeddah' },
      departAt: '2026-11-12T22:15:00', arriveAt: '2026-11-13T07:50:00',
      durationMinutes: 575,
      stops: [{ code: 'IST', city: 'إسطنبول', cityEn: 'Istanbul', waitMinutes: 190 }],
    }],
    baggage: { checkedKg: 23, cabinKg: 8 },
    fare: { type: 'saver', refundable: false, changeable: true,
            labelAr: 'تذكرة موفّرة — تعديل برسوم، غير قابلة للاسترداد',
            labelEn: 'Saver fare — change for a fee, non-refundable' },
    price: { amount: 298, currency: 'USD', perPerson: true, taxesIncluded: true },
    seatsLeft: 9,
  },
  {
    id: 'FL-1003',
    airline: { code: 'SV', name: 'الخطوط السعودية', nameEn: 'Saudia' },
    flightNumber: 'SV 456',
    recommended: false,
    legs: [{
      from: { code: 'DXB', city: 'دبي', cityEn: 'Dubai' },
      to:   { code: 'JED', city: 'جدة',      cityEn: 'Jeddah' },
      departAt: '2026-11-12T14:20:00', arriveAt: '2026-11-12T16:55:00',
      durationMinutes: 155, stops: [],
    }],
    baggage: { checkedKg: 23, cabinKg: 7 },
    fare: { type: 'standard', refundable: false, changeable: true,
            labelAr: 'تذكرة عادية — تعديل برسوم', labelEn: 'Standard fare — change for a fee' },
    price: { amount: 342, currency: 'USD', perPerson: true, taxesIncluded: true },
    seatsLeft: 2,
  },
];

export const HOTELS = [
  {
    id: 'HT-2001',
    name: 'فندق البحر الأحمر', nameEn: 'Red Sea Hotel',
    location: { city: 'جدة', cityEn: 'Jeddah', area: 'الكورنيش', areaEn: 'Corniche', distanceKm: 1.2 },
    stars: 4, score: 8.6, reviews: 1284,
    image: null, imageAlt: { ar: 'واجهة فندق البحر الأحمر ليلاً', en: 'Red Sea Hotel frontage at night' },
    room: { nameAr: 'غرفة عائلية — سريران', nameEn: 'Family room — two beds', capacity: 4, breakfast: true },
    price: { amount: 96, currency: 'USD', perNight: true, taxesIncluded: true },
    freeCancellation: true, cancellationUntil: '2026-11-09',
  },
  {
    id: 'HT-2002',
    name: 'دار الضيافة', nameEn: 'Dar Al Diyafa',
    location: { city: 'مكة', cityEn: 'Makkah', area: 'العزيزية', areaEn: 'Al Aziziyah', distanceKm: 3.4 },
    stars: 3, score: 7.9, reviews: 642,
    image: null, imageAlt: { ar: 'مدخل دار الضيافة', en: 'Dar Al Diyafa entrance' },
    room: { nameAr: 'غرفة ثلاثية', nameEn: 'Triple room', capacity: 3, breakfast: false },
    price: { amount: 61, currency: 'USD', perNight: true, taxesIncluded: true },
    freeCancellation: false,
  },
];

export const PACKAGES = [
  {
    id: 'PK-3001',
    destination: 'إسطنبول', destinationEn: 'Istanbul',
    titleAr: 'إسطنبول للعائلة — 7 ليالٍ', titleEn: 'Istanbul for families — 7 nights',
    nights: 7, startsAt: '2026-12-02',
    image: null, imageAlt: { ar: 'مضيق البوسفور في إسطنبول', en: 'The Bosphorus in Istanbul' },
    includes: [
      { ar: 'تذاكر الطيران ذهاب وعودة', en: 'Return flights', icon: 'no-flight' },
      { ar: 'إقامة 7 ليالٍ مع الإفطار',   en: '7 nights with breakfast', icon: 'no-hotel' },
      { ar: 'استقبال وتوديع من المطار',   en: 'Airport transfers', icon: 'no-transport' },
      { ar: 'جولتان سياحيتان',            en: 'Two guided tours', icon: 'no-tourism' },
    ],
    price: { amount: 1450, currency: 'USD', from: true, basis: { ar: 'لشخصين', en: 'for two people' } },
  },
  {
    id: 'PK-3002',
    destination: 'مكة المكرمة', destinationEn: 'Makkah',
    titleAr: 'عمرة مريحة — 10 أيام', titleEn: 'Comfort Umrah — 10 days',
    nights: 10, startsAt: '2026-11-20',
    image: null, imageAlt: { ar: 'المسجد الحرام', en: 'The Grand Mosque' },
    includes: [
      { ar: 'تأشيرة العمرة', en: 'Umrah visa', icon: 'no-visa' },
      { ar: 'إقامة قريبة من الحرم', en: 'Accommodation near the Haram', icon: 'no-hotel' },
      { ar: 'تنقلات بين مكة والمدينة', en: 'Makkah–Madinah transfers', icon: 'no-transport' },
      { ar: 'مرافق ميداني من السفر والسياحة', en: 'A Travel & Tourism guide on the ground', icon: 'no-supervisor' },
    ],
    price: { amount: 1180, currency: 'USD', from: true, basis: { ar: 'للفرد', en: 'per person' } },
  },
];

/**
 * SUPERVISOR — §29. Note what is NOT here: no brand colour, no logo, no
 * personal theme. A supervisor is a person inside Travel & Tourism, and the record
 * carries only the personal facts the brief permits.
 */
export const SUPERVISORS = [
  {
    id: 'SP-01', slug: 'ahmed-mohamed', name: 'أحمد عبد الرحمن', nameEn: 'Ahmed Abdelrahman',
    roleAr: 'منسق السفر — الخليج', roleEn: 'Travel coordinator — Gulf',
    photo: null, verified: true,
    bioAr: 'يعمل مع العائلات المسافرة إلى السعودية والإمارات منذ تسع سنوات.',
    bioEn: 'Nine years working with families travelling to Saudi Arabia and the UAE.',
    services: ['flights', 'umrah', 'visa'],
    contact: { phone: '+2499XXXXXXXX', whatsapp: true },
    languages: ['ar', 'en'],
  },
  {
    id: 'SP-02', slug: 'mohamed-abdullah', name: 'سارة محمد', nameEn: 'Sara Mohamed',
    roleAr: 'منسقة السفر — تركيا وأوروبا', roleEn: 'Travel coordinator — Türkiye & Europe',
    photo: null, verified: true,
    bioAr: 'متخصصة في الباقات العائلية وتأشيرات الدراسة.',
    bioEn: 'Specialist in family packages and study visas.',
    services: ['packages', 'visa', 'study'],
    contact: { phone: '+2499XXXXXXXX', whatsapp: true },
    languages: ['ar', 'en', 'tr'],
  },
];

/**
 * TRIP — the Stage 12 shape. A booking that a customer can see, with the
 * supervisor who owns it attached: §28's Customer → Supervisor → Booking
 * relationship is already expressible, without any Stage 12 code existing.
 */
export const TRIPS = [
  {
    id: 'BK-2026-4471', reference: 'BK-4471-DXB',
    status: 'confirmed',
    type: 'flights',
    titleAr: 'دبي → جدة', titleEn: 'Dubai → Jeddah',
    departAt: '2026-11-12T08:40:00',
    passengers: 3,
    supervisorId: 'SP-01',
    total: { amount: 1155, currency: 'USD' },
    nextStepAr: 'رفع صور الجوازات قبل 5 نوفمبر',
    nextStepEn: 'Upload passport scans before 5 November',
  },
  {
    id: 'BK-2026-4390', reference: 'BK-4390-IST',
    status: 'pending',
    type: 'packages',
    titleAr: 'باقة إسطنبول — 7 ليالٍ', titleEn: 'Istanbul package — 7 nights',
    departAt: '2026-12-02T00:00:00',
    passengers: 2,
    supervisorId: 'SP-02',
    total: { amount: 1450, currency: 'USD' },
    nextStepAr: 'بانتظار تأكيد الدفع',
    nextStepEn: 'Waiting for payment confirmation',
  },
];
