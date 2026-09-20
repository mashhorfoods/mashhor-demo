/* ============================================================================
   DATA / IMAGES — the photography map. Stage 10.12

   GENERATED — do not edit by hand. One key per image slot (see
   tools/images.manifest.json), one site-relative path per key. A slot with
   no entry at all falls back to the neutral placeholder:

     import { imageSrc } from './images.js';
     image: { src: imageSrc('destinations/jeddah'), altAr: …, altEn: … }

   Credits for every file live in assets/images/CREDITS.md.
   ========================================================================= */

export const IMAGES = {
  "home/hero": "assets/images/home/hero.webp",
  "home/newsletter": "assets/images/home/newsletter.webp",
  "services/flights": "assets/images/services/flights.webp",
  "services/hotels": "assets/images/services/hotels.webp",
  "services/visa": "assets/images/services/visa.webp",
  "services/packages": "assets/images/services/packages.webp",
  "services/umrah": "assets/images/services/umrah.webp",
  "services/transport": "assets/images/services/transport.webp",
  "services/groups": "assets/images/services/groups.webp",
  "services/medical": "assets/images/services/medical.webp",
  "services/study": "assets/images/services/study.webp",
  "services/work": "assets/images/services/work.webp",
  "services/issue": "assets/images/services/issue.webp",
  "services/change": "assets/images/services/change.webp",
  "services/cancel": "assets/images/services/cancel.webp",
  "destinations/jeddah": "assets/images/destinations/jeddah.webp",
  "destinations/makkah": "assets/images/destinations/makkah.webp",
  "destinations/dubai": "assets/images/destinations/dubai.webp",
  "destinations/amman": "assets/images/destinations/amman.webp",
  "destinations/cairo": "assets/images/destinations/cairo.webp",
  "destinations/nairobi": "assets/images/destinations/nairobi.webp",
  "destinations/addis": "assets/images/destinations/addis.webp",
  "destinations/istanbul": "assets/images/destinations/istanbul.webp",
  "destinations/london": "assets/images/destinations/london.webp",
  "destinations/kuala-lumpur": "assets/images/destinations/kuala-lumpur.webp",
  "destinations/delhi": "assets/images/destinations/delhi.webp",
  "offers/istanbul-family": "assets/images/offers/istanbul-family.webp",
  "offers/umrah": "assets/images/offers/umrah.webp",
  "offers/dubai-break": "assets/images/offers/dubai-break.webp"
};

export const imageSrc = (key) => IMAGES[key] ?? null;
