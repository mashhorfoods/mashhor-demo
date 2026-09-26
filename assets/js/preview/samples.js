/* ============================================================================
   PREVIEW / SAMPLES — demonstration records for the style guide only.

   Most cards in the guide read the live registries (services, destinations,
   offers, supervisors) or the development flight supplier. A trip has no
   public registry — it belongs to a signed-in customer — so the guide feeds
   the account's trip card this record, in the account adapter's trip shape
   (see account/adapters/dev-customer.js). Nothing in the product imports it.
   ========================================================================= */

export const TRIPS = [
  {
    id: 'trip-sample-jed', supervisorId: 'ahmed-mohamed',
    titleAr: 'رحلة العائلة إلى جدة', titleEn: 'Family trip to Jeddah',
    destination: { code: 'JED', cityAr: 'جدة', cityEn: 'Jeddah', countryAr: 'السعودية', countryEn: 'Saudi Arabia' },
    startDate: '2026-11-12', endDate: '2026-11-19',
    services: ['flights', 'hotels', 'visa'],
    status: 'upcoming', needsPayment: true, travellers: 3,
  },
];
