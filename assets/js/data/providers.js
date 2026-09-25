/* ============================================================================
   DATA / AIRLINE PROVIDERS — homepage trust band.

   These are the real, publicly known airlines whose flights are bookable
   through the platform today — not a claimed "official partnership": see
   §12 CONTENT RULE below.

   Shape of a record:
     id            stable key
     nameAr/nameEn the airline's own name, not a marketing label
     logo          null until the business supplies rights-cleared artwork
                   (a scraped or fan-made logo is worse than no logo: it can
                   be outdated, distorted or simply wrong). With one supplied,
                   the card shows it — object-fit: contain, own proportions,
                   no recolor — instead of the plain-name wordmark fallback.
                   Files live in assets/images/providers/, cropped to their
                   own content box (no surrounding dead canvas) but otherwise
                   untouched — same artwork the business supplied.

   ════════════════════════════════════════════════════════════════════════════
   §12 CONTENT RULE — do not upgrade the wording around this list ("partner",
   "official partner", "sponsor") unless the business has confirmed that
   relationship. Until then this is a neutral list of providers whose
   flights the platform can book.
   ════════════════════════════════════════════════════════════════════════════
   ========================================================================= */

export const AIRLINE_PROVIDERS = [
  { id: 'qatar',      nameAr: 'الخطوط الجوية القطرية',       nameEn: 'Qatar Airways',     logo: 'assets/images/providers/qatar.webp' },
  { id: 'salamair',   nameAr: 'طيران السلام',                nameEn: 'SalamAir',          logo: 'assets/images/providers/salamair.webp' },
  { id: 'ethiopian',  nameAr: 'الخطوط الجوية الإثيوبية',     nameEn: 'Ethiopian Airlines', logo: 'assets/images/providers/ethiopian.webp' },
  // No rights-cleared logo file yet for these — the wordmark fallback
  // (providers.js's providerCard) renders until one is supplied.
  { id: 'emirates',   nameAr: 'طيران الإمارات',               nameEn: 'Emirates' },
  { id: 'turkish',    nameAr: 'الخطوط الجوية التركية',       nameEn: 'Turkish Airlines' },
  { id: 'lufthansa',  nameAr: 'لوفتهانزا',                    nameEn: 'Lufthansa' },
  { id: 'singapore',  nameAr: 'الخطوط الجوية السنغافورية',   nameEn: 'Singapore Airlines' },
];
