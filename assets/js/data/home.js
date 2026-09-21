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
  // Egypt launch-market positioning (Sudanese residents in Egypt is the
  // primary launch audience; Sudanese travellers worldwide is the long-term
  // direction — see the coordinator/Egypt-launch update task). Egypt is the
  // current market configuration, not a permanent limit on the brand.
  overlineAr: 'منصة سفر موثوقة للسودانيين',
  overlineEn: 'A trusted travel platform for Sudanese travellers',
  titleAr: 'سفرك من مصر يبدأ مع نمبرون',
  titleEn: 'Your journey from Egypt starts with Number One',
  leadAr: 'تذاكر طيران، تأشيرات، فنادق وخدمات سفر متكاملة للسودانيين المقيمين في مصر.',
  leadEn: 'Flights, visas, hotels and complete travel services for Sudanese residents in Egypt.',
  /* The photography slot. `src: null` renders the neutral placeholder that
     reserves the same aspect ratio; drop the approved image in here. §04
     `focal` (hero image responsiveness brief §1/§2): this photo is a very
     wide (2.5:1) panorama — every listed breakpoint is narrower than that,
     so object-fit:cover only ever crops its width, never its height. The
     traveller sits at roughly the image's first third; tablet/mobile crops
     centre on him (the brief's non-negotiable subject) since a portrait
     viewport's narrow slice can't also reach the airplane further right —
     desktop's wider slice keeps the whole story: traveller, airplane,
     skyline and the sunset glow together. */
  media: {
    src: imageSrc('home/hero'),
    altAr: 'مسافر يقف في صالة المطار عند الغروب، يشاهد طائرة تقلع فوق أفق المدينة',
    altEn: 'A traveller with luggage in an airport lounge at sunset, watching a plane take off over the city skyline',
    ratio: '4 / 5',
    focal: { desktop: '50% 50%', tablet: '22% 50%', mobile: '27% 50%' },
  },
  /* Three short reassurances under the headline. Reuses the trust keys the
     foundation already ships, so the wording matches the rest of the site. */
  trust: ['trust.clearPrice', 'trust.humanHelp', 'trust.securePayment'],
};

/* --------------------------------------------------------------------------
   SERVICES — §05. The homepage grid reads the one registry (data/services.js,
   Stage 10.5): `featured` records show first, the rest sit behind "show all
   services". Change a flag there, not a list here.
   ----------------------------------------------------------------------- */
import { imageSrc } from './images.js';
import { SERVICE_REGISTRY } from './services.js';
export const HOME_SERVICES = SERVICE_REGISTRY;

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
   DESTINATIONS — §08. The homepage grid reads the one registry
   (data/destinations.js, Stage 10.7): records flagged `home`.
   ----------------------------------------------------------------------- */
import { homeDestinations } from './destinations.js';
export const HOME_DESTINATIONS = homeDestinations().map((d) => ({ ...d, href: `destinations/${d.slug}/` }));

/* --------------------------------------------------------------------------
   OFFERS & PACKAGES — §09. The homepage strip reads the one registry
   (data/offers.js, Stage 10.8). A price or date appears only when the record
   carries one — nothing is invented.
   ----------------------------------------------------------------------- */
import { homeOffers } from './offers.js';
export const HOME_OFFERS = homeOffers();

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
