/* ============================================================================
   BOOKING / LOCATIONS — the airport and city registry behind every place
   field. Stage 11

   DEVELOPMENT DATA. The list below is a small, hand-written set of airports
   that the site's destinations already name, so the journey can be built
   and verified end to end. It is NOT a verified airport database: a real
   registry or a supplier's location API replaces `searchLocations()` and
   `locationByCode()` without touching any component — the field only ever
   calls these two functions.
   ========================================================================= */

export const LOCATION_PROVIDER = { id: 'dev-locations', dev: true };

const L = (code, cityAr, cityEn, airportAr, airportEn, countryAr, countryEn, slug = null) =>
  ({ code, cityAr, cityEn, airportAr, airportEn, countryAr, countryEn, slug });

export const LOCATIONS = [
  L('KRT', 'الخرطوم', 'Khartoum', 'مطار الخرطوم الدولي', 'Khartoum International', 'السودان', 'Sudan'),
  L('PZU', 'بورتسودان', 'Port Sudan', 'مطار بورتسودان', 'Port Sudan New International', 'السودان', 'Sudan'),
  L('JED', 'جدة', 'Jeddah', 'مطار الملك عبدالعزيز الدولي', 'King Abdulaziz International', 'السعودية', 'Saudi Arabia', 'jeddah'),
  L('MED', 'المدينة المنورة', 'Madinah', 'مطار الأمير محمد بن عبدالعزيز', 'Prince Mohammad bin Abdulaziz', 'السعودية', 'Saudi Arabia', 'makkah'),
  L('RUH', 'الرياض', 'Riyadh', 'مطار الملك خالد الدولي', 'King Khalid International', 'السعودية', 'Saudi Arabia'),
  L('DXB', 'دبي', 'Dubai', 'مطار دبي الدولي', 'Dubai International', 'الإمارات', 'United Arab Emirates', 'dubai'),
  L('AUH', 'أبوظبي', 'Abu Dhabi', 'مطار زايد الدولي', 'Zayed International', 'الإمارات', 'United Arab Emirates'),
  L('DOH', 'الدوحة', 'Doha', 'مطار حمد الدولي', 'Hamad International', 'قطر', 'Qatar'),
  L('AMM', 'عمّان', 'Amman', 'مطار الملكة علياء الدولي', 'Queen Alia International', 'الأردن', 'Jordan', 'amman'),
  L('CAI', 'القاهرة', 'Cairo', 'مطار القاهرة الدولي', 'Cairo International', 'مصر', 'Egypt', 'cairo'),
  L('IST', 'إسطنبول', 'Istanbul', 'مطار إسطنبول', 'Istanbul Airport', 'تركيا', 'Türkiye', 'istanbul'),
  L('SAW', 'إسطنبول', 'Istanbul', 'مطار صبيحة كوكجن', 'Sabiha Gökçen', 'تركيا', 'Türkiye', 'istanbul'),
  L('NBO', 'نيروبي', 'Nairobi', 'مطار جومو كينياتا الدولي', 'Jomo Kenyatta International', 'كينيا', 'Kenya', 'nairobi'),
  L('ADD', 'أديس أبابا', 'Addis Ababa', 'مطار بولي الدولي', 'Bole International', 'إثيوبيا', 'Ethiopia', 'addis'),
  L('LHR', 'لندن', 'London', 'مطار هيثرو', 'Heathrow', 'المملكة المتحدة', 'United Kingdom', 'london'),
  L('KUL', 'كوالالمبور', 'Kuala Lumpur', 'مطار كوالالمبور الدولي', 'Kuala Lumpur International', 'ماليزيا', 'Malaysia', 'kuala-lumpur'),
  L('DEL', 'دلهي', 'Delhi', 'مطار إنديرا غاندي الدولي', 'Indira Gandhi International', 'الهند', 'India', 'delhi'),
];

const norm = (s) => String(s ?? '').trim().toLowerCase()
  .replace(/[ً-ْـ]/g, '')          // Arabic diacritics and tatweel
  .replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/\s+/g, ' ');

export const locationByCode = (code) => LOCATIONS.find((l) => l.code === String(code ?? '').toUpperCase()) ?? null;
export const locationBySlug = (slug) => LOCATIONS.find((l) => l.slug === slug) ?? null;

/**
 * Turn what a customer typed into a location: an exact code, a selected
 * "City (CODE)" label, or a city / airport name in either language. Returns
 * null when nothing matches — the caller shows the "unrecognised place"
 * state rather than guessing.
 */
export function resolveLocation(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const code = raw.match(/\(([A-Za-z]{3})\)\s*$/)?.[1] ?? (/^[A-Za-z]{3}$/.test(raw) ? raw : null);
  if (code) return locationByCode(code);
  const n = norm(raw);
  return LOCATIONS.find((l) => [l.cityAr, l.cityEn, l.airportAr, l.airportEn].some((v) => norm(v) === n))
    ?? LOCATIONS.find((l) => [l.cityAr, l.cityEn].some((v) => norm(v).startsWith(n) && n.length >= 3))
    ?? null;
}

/**
 * Suggestions for the combobox. Async on purpose: a supplier API is async,
 * so the field is built for latency, loading and failure from day one.
 * @returns {Promise<{ items: object[], provider: object }>}
 */
export async function searchLocations(query, { limit = 6, signal = null } = {}) {
  const n = norm(query);
  await new Promise((r) => setTimeout(r, 120));
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  if (n === '__fail__') throw new Error('location provider unavailable');   // the error state, for QA
  if (n.length < 2) return { items: [], provider: LOCATION_PROVIDER };
  const score = (l) => {
    const fields = [l.code, l.cityAr, l.cityEn, l.airportAr, l.airportEn, l.countryAr, l.countryEn].map(norm);
    if (fields[0] === n) return 0;
    if (fields.some((f) => f.startsWith(n))) return 1;
    if (fields.some((f) => f.includes(n))) return 2;
    return 9;
  };
  const items = LOCATIONS.map((l) => ({ l, s: score(l) })).filter((x) => x.s < 9).sort((a, b) => a.s - b.s).slice(0, limit).map((x) => x.l);
  return { items, provider: LOCATION_PROVIDER };
}

/** "Khartoum (KRT)" — what the field shows once a location is chosen. */
export const locationLabel = (l, locale = 'ar') => `${locale === 'ar' ? l.cityAr : l.cityEn} (${l.code})`;
