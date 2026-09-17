/* ============================================================================
   DATA / IMAGES — the photography map. Stage 10.12

   GENERATED — do not edit by hand — normally by tools/fetch-images.mjs; the
   .svg entries below are a temporary, locally generated stand-in (see
   assets/images/CREDITS.md for why and how they get replaced). One key per
   image slot (see tools/images.manifest.json), one site-relative path per
   key. A slot with no entry at all falls back to the neutral placeholder:

     import { imageSrc } from './images.js';
     image: { src: imageSrc('destinations/jeddah'), altAr: …, altEn: … }

   Credits for every file live in assets/images/CREDITS.md.
   ========================================================================= */

export const IMAGES = {
  "home/hero": "assets/images/home/hero.svg",
  "services/flights": "assets/images/services/flights.svg",
  "services/hotels": "assets/images/services/hotels.svg",
  "services/visa": "assets/images/services/visa.svg",
  "services/packages": "assets/images/services/packages.svg",
  "services/umrah": "assets/images/services/umrah.svg",
  "services/transport": "assets/images/services/transport.svg",
  "services/groups": "assets/images/services/groups.svg",
  "services/medical": "assets/images/services/medical.svg",
  "services/study": "assets/images/services/study.svg",
  "services/work": "assets/images/services/work.svg",
  "services/issue": "assets/images/services/issue.svg",
  "services/change": "assets/images/services/change.svg",
  "services/cancel": "assets/images/services/cancel.svg",
  "destinations/jeddah": "assets/images/destinations/jeddah.svg",
  "destinations/makkah": "assets/images/destinations/makkah.svg",
  "destinations/dubai": "assets/images/destinations/dubai.svg",
  "destinations/amman": "assets/images/destinations/amman.svg",
  "destinations/cairo": "assets/images/destinations/cairo.svg",
  "destinations/nairobi": "assets/images/destinations/nairobi.svg",
  "destinations/addis": "assets/images/destinations/addis.svg",
  "destinations/istanbul": "assets/images/destinations/istanbul.svg",
  "destinations/london": "assets/images/destinations/london.svg",
  "destinations/kuala-lumpur": "assets/images/destinations/kuala-lumpur.svg",
  "destinations/delhi": "assets/images/destinations/delhi.svg",
  "offers/istanbul-family": "assets/images/offers/istanbul-family.svg",
  "offers/umrah": "assets/images/offers/umrah.svg",
  "offers/dubai-break": "assets/images/offers/dubai-break.svg"
};

export const imageSrc = (key) => IMAGES[key] ?? null;
