/* ============================================================================
   BOOKING / RANK — sort, filter, facets and the transparent labels. Stage 11

   Pure functions over normalised offers. Nothing here knows a supplier, a
   currency symbol or the DOM. Every label an offer earns comes with the
   rule that earned it, so the UI can say WHY — "help me choose" never hides
   a score. §18.5
   ========================================================================= */

const legsOf = (o) => o.legs ?? [];
export const totalDuration = (o) => legsOf(o).reduce((s, l) => s + (l.durationMinutes || 0), 0);
export const totalStops = (o) => legsOf(o).reduce((s, l) => s + (l.stops?.length || 0), 0);
const hour = (iso) => new Date(iso).getHours();
/** A departure between 22:00 and 05:59, or an arrival between 00:00 and 05:59: hard on a family. */
export const hasNightLeg = (o) => legsOf(o).some((l) => { const d = hour(l.departAt); const a = hour(l.arriveAt); return d >= 22 || d < 6 || a < 6; });
const familyFriendly = (o) => (o.baggage?.checkedPieces ?? 0) >= 1 && !hasNightLeg(o) && totalStops(o) <= 1;

export const SORTS = [
  { id: 'recommended', labelAr: 'الأنسب (متوازن)', labelEn: 'Best balance' },
  { id: 'price',       labelAr: 'الأرخص أولاً',    labelEn: 'Cheapest first' },
  { id: 'duration',    labelAr: 'الأقصر مدة',      labelEn: 'Shortest first' },
  { id: 'stops',       labelAr: 'أقل توقفات',      labelEn: 'Fewest stops' },
  { id: 'departure',   labelAr: 'المغادرة الأبكر',  labelEn: 'Earliest departure' },
];

/** The four "help me choose" priorities of the homepage, mapped onto the ranking. */
export const PRIORITIES = [
  { id: 'price',    sort: 'price',    label: 'bk.priority.price' },
  { id: 'stops',    sort: 'stops',    label: 'bk.priority.stops' },
  { id: 'duration', sort: 'duration', label: 'bk.priority.duration' },
  { id: 'family',   sort: 'family',   label: 'bk.priority.family' },
];

/** 1-based rank of every offer on one axis (ties share a rank). */
function ranks(list, value) {
  const sorted = [...list].map((o) => value(o)).sort((a, b) => a - b);
  return new Map(list.map((o) => [o.id, sorted.indexOf(value(o)) + 1]));
}

/**
 * Labels every offer can earn, each with its rule spelled out:
 *   cheapest · fastest · fewestStops · family · recommended (balanced)
 * "Recommended" is the offer with the lowest SUM of its price, duration and
 * stop ranks — the rule is printed on the card, and it never claims "best".
 */
export function labelOffers(list) {
  const out = new Map(list.map((o) => [o.id, []]));
  if (!list.length) return out;
  const price = ranks(list, (o) => o.price.total);
  const dur = ranks(list, totalDuration);
  const stops = ranks(list, totalStops);
  const add = (id, label) => out.get(id).push(label);
  const first = (rankMap) => list.filter((o) => rankMap.get(o.id) === 1).map((o) => o.id);
  first(price).forEach((id) => add(id, { id: 'cheapest', ruleAr: 'أقل سعر إجمالي بين النتائج', ruleEn: 'Lowest total price in these results' }));
  first(dur).forEach((id) => add(id, { id: 'fastest', ruleAr: 'أقصر مدة سفر إجمالية', ruleEn: 'Shortest total travel time' }));
  first(stops).forEach((id) => add(id, { id: 'fewestStops', ruleAr: totalStops(list.find((o) => o.id === id)) === 0 ? 'بلا توقف' : 'أقل عدد توقفات بين النتائج', ruleEn: totalStops(list.find((o) => o.id === id)) === 0 ? 'Non-stop' : 'Fewest stops in these results' }));
  const fam = list.filter(familyFriendly).sort((a, b) => a.price.total - b.price.total)[0];
  if (fam) add(fam.id, { id: 'family', ruleAr: 'أمتعة مسجّلة لكل مسافر، بلا رحلات ليلية، توقف واحد على الأكثر — والأرخص بين هذه', ruleEn: 'Checked baggage for everyone, no night legs, at most one stop — and the cheapest of those' });
  const balanced = [...list].sort((a, b) => (price.get(a.id) + dur.get(a.id) + stops.get(a.id)) - (price.get(b.id) + dur.get(b.id) + stops.get(b.id)))[0];
  add(balanced.id, { id: 'recommended',
    ruleAr: `أفضل توازن: الترتيب ${price.get(balanced.id)} سعراً، ${dur.get(balanced.id)} مدةً، ${stops.get(balanced.id)} توقفاً`,
    ruleEn: `Best balance: ranked ${price.get(balanced.id)} on price, ${dur.get(balanced.id)} on duration, ${stops.get(balanced.id)} on stops` });
  return out;
}

export function sortOffers(list, key) {
  const labels = key === 'recommended' ? labelOffers(list) : null;
  const score = { price: (o) => o.price.total, duration: totalDuration, stops: (o) => totalStops(o) * 10000 + o.price.total,
    departure: (o) => new Date(o.legs[0]?.departAt).valueOf(), family: (o) => (familyFriendly(o) ? 0 : 1) * 1e6 + o.price.total,
    recommended: (o) => (labels.get(o.id).some((l) => l.id === 'recommended') ? 0 : 1) * 1e6 + o.price.total }[key] ?? ((o) => o.price.total);
  return [...list].sort((a, b) => score(a) - score(b));
}

/* ---- Filters ---------------------------------------------------------- */
export const EMPTY_FILTERS = { maxPrice: null, stops: [], carriers: [], depart: [], arrive: [], maxDuration: null, baggage: false, airports: [] };
const slot = (iso) => { const h = hour(iso); return h < 6 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; };
export const TIME_SLOTS = [
  { id: 'morning',   labelAr: 'صباحاً (06–12)',  labelEn: 'Morning (06–12)' },
  { id: 'afternoon', labelAr: 'ظهراً (12–18)',   labelEn: 'Afternoon (12–18)' },
  { id: 'evening',   labelAr: 'مساءً (18–24)',   labelEn: 'Evening (18–24)' },
  { id: 'night',     labelAr: 'ليلاً (00–06)',    labelEn: 'Night (00–06)' },
];

export function applyFilters(list, f = EMPTY_FILTERS) {
  return list.filter((o) =>
    (f.maxPrice == null || o.price.total <= f.maxPrice) &&
    (!f.stops.length || f.stops.includes(Math.min(totalStops(o), 2))) &&
    (!f.carriers.length || f.carriers.includes(o.carrier.code)) &&
    (!f.depart.length || f.depart.includes(slot(o.legs[0].departAt))) &&
    (!f.arrive.length || f.arrive.includes(slot(o.legs[0].arriveAt))) &&
    (f.maxDuration == null || totalDuration(o) <= f.maxDuration) &&
    (!f.baggage || (o.baggage?.checkedPieces ?? 0) >= 1) &&
    (!f.airports.length || legsOf(o).every((l) => f.airports.includes(l.from.code) && f.airports.includes(l.to.code))));
}

/** What the filter panel offers, derived from the results — never from a hard-coded list. */
export function facetsOf(list) {
  const uniq = (arr, key) => [...new Map(arr.map((x) => [key(x), x])).values()];
  return {
    price: list.length ? { min: Math.min(...list.map((o) => o.price.total)), max: Math.max(...list.map((o) => o.price.total)) } : null,
    duration: list.length ? { min: Math.min(...list.map(totalDuration)), max: Math.max(...list.map(totalDuration)) } : null,
    stops: [...new Set(list.map((o) => Math.min(totalStops(o), 2)))].sort(),
    carriers: uniq(list.map((o) => o.carrier), (c) => c.code),
    airports: uniq(list.flatMap((o) => legsOf(o).flatMap((l) => [l.from, l.to])), (p) => p.code),
    depart: [...new Set(list.map((o) => slot(o.legs[0].departAt)))],
    arrive: [...new Set(list.map((o) => slot(o.legs[0].arriveAt)))],
  };
}
export const activeFilterCount = (f) => (f.maxPrice != null) + (f.maxDuration != null) + f.stops.length + f.carriers.length + f.depart.length + f.arrive.length + (f.baggage ? 1 : 0) + f.airports.length;
