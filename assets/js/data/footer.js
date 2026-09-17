/* ============================================================================
   DATA / FOOTER — Stage 10.3 §23
   Number One Travel & Tourism — نمبرون للسفر و السياحة

   ════════════════════════════════════════════════════════════════════════════
   §27 CONTENT RULE — READ BEFORE EDITING

   Nothing in this file may be invented. No phone number, email, address,
   social account, certification, award or guarantee appears here unless the
   business supplied it.

   Anything not yet supplied is present as a DISABLED entry: the shape is
   defined so the component is complete, `value` is null, and the footer simply
   does not render that row. Fill the value in and it appears. That is the
   difference between a configurable placeholder and a fabricated one.
   ════════════════════════════════════════════════════════════════════════════
   ========================================================================= */

import { MENU_SERVICES, SUPPORT_CHANNELS } from './navigation.js';

/* --------------------------------------------------------------------------
   BRAND BLOCK — §04. One sentence. The brief's own copy, not a rewrite.
   ----------------------------------------------------------------------- */
export const FOOTER_BRAND = {
  statementAr: 'نساعدك على اختيار الرحلة والخدمة الأنسب لاحتياجاتك وميزانيتك.',
  statementEn: 'We help you choose the trip and the service that fit your needs and your budget.',
  supportAr: 'مختص من نمبرون معك في كل خطوة.',
  supportEn: 'A Number One specialist is with you at every step.',
};

/* --------------------------------------------------------------------------
   §11 TRUST — statements of how the service works, nothing more.
   No certification, no badge, no guarantee, no security claim.
   ----------------------------------------------------------------------- */
export const FOOTER_TRUST = [
  { id: 'support', icon: 'no-support',    labelAr: 'دعم العملاء',   labelEn: 'Customer support' },
  { id: 'clear',   icon: 'no-documents',  labelAr: 'حجز واضح',      labelEn: 'Clear booking' },
  { id: 'price',   icon: 'no-price-tag',  labelAr: 'أسعار واضحة',   labelEn: 'Clear pricing' },
  { id: 'manage',  icon: 'no-booking',    labelAr: 'إدارة الرحلة',  labelEn: 'Manage your trip' },
];

/* --------------------------------------------------------------------------
   COLUMNS — §05 §06 §07. Services are derived from the header's own menu so
   the two navigation surfaces can never disagree about what we sell.
   ----------------------------------------------------------------------- */
const serviceLinks = MENU_SERVICES.columns
  .flatMap((c) => c.items)
  .map((i) => ({ href: i.href, labelAr: i.labelAr, labelEn: i.labelEn }));

export const FOOTER_COLUMNS = [
  {
    id: 'services', titleAr: 'خدماتنا', titleEn: 'Our services',
    links: serviceLinks,
  },
  {
    id: 'explore', titleAr: 'استكشف', titleEn: 'Explore',
    links: [
      { href: '',                labelAr: 'الرئيسية',        labelEn: 'Home' },
      { href: 'destinations/',   labelAr: 'الوجهات',          labelEn: 'Destinations' },
      { href: 'offers/',         labelAr: 'العروض والباقات',  labelEn: 'Offers & packages' },
      { href: 'about/',          labelAr: 'من نحن',           labelEn: 'About us' },
      { href: 'supervisors/',    labelAr: 'مشرفو السفر',      labelEn: 'Travel supervisors' },
      { href: 'help/',           labelAr: 'مركز المساعدة',    labelEn: 'Help centre' },
      { href: 'help/faq/',       labelAr: 'الأسئلة الشائعة',  labelEn: 'FAQ' },
      { href: 'help/contact/',   labelAr: 'تواصل معنا',       labelEn: 'Contact us' },
    ],
  },
  {
    id: 'help', titleAr: 'المساعدة', titleEn: 'Help',
    links: [
      { href: 'help/',          labelAr: 'مركز المساعدة',   labelEn: 'Help centre' },
      { href: 'help/faq/',      labelAr: 'الأسئلة الشائعة', labelEn: 'FAQ' },
      { href: 'help/contact/',  labelAr: 'تواصل معنا',      labelEn: 'Contact us' },
      { href: 'trips/',         labelAr: 'إدارة حجزي',      labelEn: 'Manage my booking' },
      // The two live channels reuse the header's config — one source, §10.2.
      // A channel with no href is not yet supplied and is not listed.
      ...SUPPORT_CHANNELS.filter((c) => !!c.href).map((c) => ({
        href: c.href, external: true, icon: c.icon,
        labelAr: c.id === 'whatsapp' ? 'الدعم عبر واتساب' : 'اتصل بنا',
        labelEn: c.id === 'whatsapp' ? 'Support on WhatsApp' : 'Call us',
      })),
    ],
  },
];

/* --------------------------------------------------------------------------
   CONTACT — §08. Every row renders only when `value` is set.

   phone / whatsapp carry the same placeholders Stage 10.2 flagged, so the two
   surfaces stay consistent; replace them in ONE place (navigation.js) and both
   follow. email and address are off until the business supplies them.
   ----------------------------------------------------------------------- */
export const FOOTER_CONTACT = [
  { id: 'whatsapp', icon: 'no-whatsapp', labelAr: 'واتساب', labelEn: 'WhatsApp',
    value: SUPPORT_CHANNELS.find((c) => c.id === 'whatsapp')?.href ?? null,
    displayAr: 'راسلنا على واتساب', displayEn: 'Message us on WhatsApp',
    placeholder: true },
  { id: 'phone', icon: 'no-phone', labelAr: 'الهاتف', labelEn: 'Phone',
    value: SUPPORT_CHANNELS.find((c) => c.id === 'call')?.href ?? null,
    displayAr: 'اتصل بنا', displayEn: 'Call us',
    placeholder: true },
  { id: 'email', icon: 'no-mail', labelAr: 'البريد الإلكتروني', labelEn: 'Email',
    value: null, display: null },          // ◀ not supplied — row is not rendered
  { id: 'address', icon: 'no-location', labelAr: 'المكتب', labelEn: 'Office',
    value: null, display: null },          // ◀ not supplied — row is not rendered
];

/* --------------------------------------------------------------------------
   SOCIAL — §09. Structure complete, accounts empty.
   A channel renders only once `url` is a real, verified account.
   ----------------------------------------------------------------------- */
export const FOOTER_SOCIAL = [
  { id: 'facebook',  icon: 'no-facebook',  label: 'Facebook',  url: null },
  { id: 'instagram', icon: 'no-instagram', label: 'Instagram', url: null },
  { id: 'linkedin',  icon: 'no-linkedin',  label: 'LinkedIn',  url: null },
  { id: 'tiktok',    icon: 'no-tiktok',    label: 'TikTok',    url: null },
  { id: 'youtube',   icon: 'no-youtube',   label: 'YouTube',   url: null },
];

/* --------------------------------------------------------------------------
   LEGAL — §13. `exists: false` keeps the policy configurable without
   publishing a link to a page that is not written yet.
   ----------------------------------------------------------------------- */
export const FOOTER_LEGAL = [
  // The privacy and terms pages exist (Stage 12.1); they show the business's text once supplied and say so until then.
  { id: 'privacy',  href: 'legal/privacy/',     labelAr: 'سياسة الخصوصية',      labelEn: 'Privacy policy',      exists: true },
  { id: 'terms',    href: 'legal/terms/',       labelAr: 'شروط الاستخدام',      labelEn: 'Terms of Service',    exists: true },
  { id: 'cancel',   href: 'policies/cancel/',   labelAr: 'سياسة الإلغاء',       labelEn: 'Cancellation policy', exists: false },
  { id: 'refund',   href: 'policies/refund/',   labelAr: 'سياسة الاسترداد',     labelEn: 'Refund policy',       exists: false },
  { id: 'usage',    href: 'policies/usage/',    labelAr: 'سياسة استخدام الموقع', labelEn: 'Website usage policy', exists: false },
];

/* --------------------------------------------------------------------------
   CTA — §10. Exactly one.
   ----------------------------------------------------------------------- */
export const FOOTER_CTA = {
  href: 'search/',
  labelAr: 'ابدأ رحلتك', labelEn: 'Start your journey',
  titleAr: 'جاهز للسفر؟', titleEn: 'Ready to travel?',
  textAr: 'ابحث وقارن، ودع مختصاً من نمبرون يساعدك في الاختيار.',
  textEn: 'Search, compare, and let a Number One specialist help you choose.',
};

export const LEGAL_NAME = { ar: 'نمبرون للسفر و السياحة', en: 'Number One Travel & Tourism' };

/* §12 — no newsletter. It is not added until the business asks for it, and it
   would need consent handling when it is. */
